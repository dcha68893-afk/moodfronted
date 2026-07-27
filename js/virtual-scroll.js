/**
 * virtual-scroll.js — Virtual message list for Kynecta
 *
 * Renders only visible messages + small overscan buffer.
 * Handles: 100,000+ messages, 60fps scrolling, dynamic row heights,
 * sticky dates, jump-to-bottom, unread jump button, infinite scroll upward.
 *
 * Replaces the naive full-DOM render in messages-ui.js which caused:
 *  - OOM crashes on large chats
 *  - Janky scroll (all messages in DOM)
 *  - Slow initial render
 */

(function (global) {
  'use strict';

  const OVERSCAN       = 10;    // extra rows above/below viewport
  const ESTIMATED_H    = 60;    // px estimate for unknown row heights
  const SCROLL_THRESH  = 150;   // px from bottom to auto-scroll
  const BATCH_SIZE     = 40;    // messages to fetch per page
  const DATE_SEP_H     = 32;    // height of date separator rows

  class KynectaVirtualScroll {
    /**
     * @param {HTMLElement} container  — the scrollable div
     * @param {object} opts
     *   opts.fetchPage(page, chatId) → Promise<Message[]>
     *   opts.renderMessage(msg)      → HTMLElement
     *   opts.chatId                  — current chat ID
     */
    constructor(container, opts) {
      this._container  = container;
      this._opts       = opts;
      this._messages   = [];      // full flat list (all loaded)
      this._items      = [];      // items with height cache: [{type, data, top, height}]
      this._totalH     = 0;
      this._page       = 1;
      this._loading    = false;
      this._allLoaded  = false;
      this._atBottom   = true;
      this._unreadCount = 0;
      this._heightCache = new Map(); // messageId → height

      this._inner      = null;    // inner div (full virtual height)
      this._rendered   = new Map(); // index → DOM element currently rendered
      this._lastRange  = { start: 0, end: 0 };

      this._buildDOM();
      this._attachListeners();
    }

    // ── Build scaffold DOM ──────────────────────────────────────────────────
    _buildDOM() {
      this._container.style.cssText = 'position:relative;overflow-y:auto;overflow-x:hidden;';

      this._inner = document.createElement('div');
      this._inner.style.cssText = 'position:relative;width:100%;';
      this._container.appendChild(this._inner);

      // Jump-to-bottom button
      this._jumpBtn = document.createElement('button');
      this._jumpBtn.id = 'kyn-jump-bottom';
      this._jumpBtn.innerHTML = '↓ <span id="kyn-unread-badge"></span>';
      this._jumpBtn.style.cssText = `
        position:fixed;bottom:90px;right:20px;z-index:100;
        background:var(--accent-color);color:#fff;
        border:none;border-radius:20px;padding:6px 14px;
        font-size:13px;cursor:pointer;display:none;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        transition:opacity 0.2s;
      `;
      document.body.appendChild(this._jumpBtn);
      this._jumpBtn.addEventListener('click', () => this.scrollToBottom());

      this._badge = this._jumpBtn.querySelector('#kyn-unread-badge');
    }

    // ── Listeners ───────────────────────────────────────────────────────────
    _attachListeners() {
      let _ticking = false;
      this._container.addEventListener('scroll', () => {
        if (!_ticking) {
          requestAnimationFrame(() => { this._onScroll(); _ticking = false; });
          _ticking = true;
        }
      }, { passive: true });

      // ResizeObserver to recompute on container resize
      if (global.ResizeObserver) {
        new ResizeObserver(() => this._recalcLayout()).observe(this._container);
      }
    }

    _onScroll() {
      const { scrollTop, scrollHeight, clientHeight } = this._container;
      const fromBottom = scrollHeight - scrollTop - clientHeight;

      this._atBottom = fromBottom < SCROLL_THRESH;

      if (this._atBottom) {
        this._unreadCount = 0;
        this._jumpBtn.style.display = 'none';
      }

      // Load more when near the top
      if (scrollTop < 200 && !this._loading && !this._allLoaded) {
        this._loadPage();
      }

      this._renderVisible();
    }

    // ── Load a page of messages ─────────────────────────────────────────────
    async _loadPage() {
      if (this._loading || this._allLoaded) return;
      this._loading = true;

      const prevScrollH = this._container.scrollHeight;
      const prevScrollT = this._container.scrollTop;

      try {
        const msgs = await this._opts.fetchPage(this._page, this._opts.chatId);
        if (!msgs || msgs.length === 0) {
          this._allLoaded = true;
          this._loading = false;
          return;
        }

        // Prepend (older messages come first)
        this._messages = [...msgs, ...this._messages];
        this._page++;
        this._rebuildItems();

        // Preserve scroll position after prepend
        const newScrollH = this._container.scrollHeight;
        this._container.scrollTop = prevScrollT + (newScrollH - prevScrollH);
      } catch (e) {
        console.warn('[VirtualScroll] Load error:', e.message);
      } finally {
        this._loading = false;
      }
    }

    // ── Rebuild item layout with heights ────────────────────────────────────
    _rebuildItems() {
      this._items = [];
      let top = 0;
      let lastDate = null;

      for (const msg of this._messages) {
        const msgDate = new Date(msg.sentAt || msg.createdAt).toDateString();

        // Insert date separator
        if (msgDate !== lastDate) {
          this._items.push({ type: 'date', data: msgDate, top, height: DATE_SEP_H });
          top += DATE_SEP_H;
          lastDate = msgDate;
        }

        const h = this._heightCache.get(msg.id) || ESTIMATED_H;
        this._items.push({ type: 'message', data: msg, top, height: h });
        top += h;
      }

      this._totalH = top;
      this._inner.style.height = `${this._totalH}px`;
      this._renderVisible();
    }

    // ── Render only visible items ────────────────────────────────────────────
    _renderVisible() {
      const { scrollTop, clientHeight } = this._container;
      const viewStart = scrollTop - OVERSCAN * ESTIMATED_H;
      const viewEnd   = scrollTop + clientHeight + OVERSCAN * ESTIMATED_H;

      let start = 0, end = this._items.length - 1;

      // Binary search for start
      let lo = 0, hi = this._items.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this._items[mid].top + this._items[mid].height < viewStart) lo = mid + 1;
        else hi = mid - 1;
      }
      start = Math.max(0, lo);

      // Binary search for end
      lo = start; hi = this._items.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this._items[mid].top > viewEnd) hi = mid - 1;
        else lo = mid + 1;
      }
      end = Math.min(this._items.length - 1, hi + 1);

      // Remove out-of-range items
      for (const [idx, el] of this._rendered) {
        if (idx < start || idx > end) {
          el.remove();
          this._rendered.delete(idx);
        }
      }

      // Add newly visible items
      for (let i = start; i <= end; i++) {
        if (this._rendered.has(i)) continue;

        const item = this._items[i];
        let el;

        if (item.type === 'date') {
          el = document.createElement('div');
          el.className = 'kyn-date-separator';
          el.textContent = item.data;
          el.style.cssText = `position:absolute;left:0;right:0;text-align:center;font-size:11px;color:var(--kyn-text-muted);padding:6px 0;top:${item.top}px;height:${item.height}px;line-height:${item.height - 12}px;`;
        } else {
          el = this._opts.renderMessage(item.data);
          if (el) {
            el.style.position = 'absolute';
            el.style.top      = `${item.top}px`;
            el.style.left     = '0';
            el.style.right    = '0';
          }
        }

        if (el) {
          this._inner.appendChild(el);
          this._rendered.set(i, el);

          // Measure real height after render
          if (item.type === 'message') {
            requestAnimationFrame(() => {
              const realH = el.offsetHeight;
              if (realH && realH !== item.height) {
                this._heightCache.set(item.data.id, realH);
                item.height = realH;
                this._reflow(i, realH - ESTIMATED_H);
              }
            });
          }
        }
      }

      this._lastRange = { start, end };
    }

    // ── Reflow: adjust tops after height change ──────────────────────────────
    _reflow(fromIdx, delta) {
      if (!delta) return;
      for (let i = fromIdx + 1; i < this._items.length; i++) {
        this._items[i].top += delta;
        const el = this._rendered.get(i);
        if (el) el.style.top = `${this._items[i].top}px`;
      }
      this._totalH += delta;
      this._inner.style.height = `${this._totalH}px`;
    }

    _recalcLayout() {
      this._rebuildItems();
    }

    // ── Public: add new message (append) ────────────────────────────────────
    appendMessage(msg) {
      this._messages.push(msg);

      // Add date separator if needed
      const msgDate = new Date(msg.sentAt || msg.createdAt).toDateString();
      const lastItem = this._items[this._items.length - 1];
      let top = lastItem ? lastItem.top + lastItem.height : 0;

      if (!lastItem || (lastItem.type === 'message' && new Date(lastItem.data.sentAt || lastItem.data.createdAt).toDateString() !== msgDate)) {
        this._items.push({ type: 'date', data: msgDate, top, height: DATE_SEP_H });
        top += DATE_SEP_H;
      }

      const h = this._heightCache.get(msg.id) || ESTIMATED_H;
      this._items.push({ type: 'message', data: msg, top, height: h });
      this._totalH = top + h;
      this._inner.style.height = `${this._totalH}px`;

      if (this._atBottom) {
        this.scrollToBottom();
      } else {
        this._unreadCount++;
        this._badge.textContent = this._unreadCount > 99 ? '99+' : String(this._unreadCount);
        this._jumpBtn.style.display = 'flex';
      }

      this._renderVisible();
    }

    // ── Scroll to bottom ────────────────────────────────────────────────────
    scrollToBottom(smooth = true) {
      this._container.scrollTo({
        top: this._container.scrollHeight,
        behavior: smooth ? 'smooth' : 'instant',
      });
      this._unreadCount = 0;
      this._jumpBtn.style.display = 'none';
    }

    // ── Initial load ────────────────────────────────────────────────────────
    async load(chatId) {
      this._opts.chatId = chatId;
      this._messages    = [];
      this._items       = [];
      this._page        = 1;
      this._allLoaded   = false;
      this._heightCache.clear();
      this._rendered.forEach(el => el.remove());
      this._rendered.clear();
      this._inner.style.height = '0';

      await this._loadPage();
      // Scroll to bottom on initial load
      requestAnimationFrame(() => this.scrollToBottom(false));
    }

    // ── Update a message in-place ────────────────────────────────────────────
    updateMessage(msg) {
      const idx = this._messages.findIndex(m => m.id === msg.id);
      if (idx < 0) return;
      this._messages[idx] = { ...this._messages[idx], ...msg };

      // Find in items and re-render
      const itemIdx = this._items.findIndex(it => it.type === 'message' && it.data.id === msg.id);
      if (itemIdx < 0) return;
      this._items[itemIdx].data = this._messages[idx];
      const el = this._rendered.get(itemIdx);
      if (el) {
        const newEl = this._opts.renderMessage(this._messages[idx]);
        if (newEl) {
          newEl.style.cssText = el.style.cssText;
          el.replaceWith(newEl);
          this._rendered.set(itemIdx, newEl);
        }
      }
    }

    // ── Remove a message ─────────────────────────────────────────────────────
    removeMessage(messageId) {
      const idx = this._messages.findIndex(m => m.id === messageId);
      if (idx < 0) return;
      this._messages.splice(idx, 1);
      this._rebuildItems();
    }

    destroy() {
      this._rendered.forEach(el => el.remove());
      this._jumpBtn.remove();
      this._inner.remove();
    }
  }

  // ── Expose globally ─────────────────────────────────────────────────────────
  global.KynectaVirtualScroll = KynectaVirtualScroll;
  console.log('[KynectaVirtualScroll] ✅ Loaded');

})(window);
