/**
 * message-search.js — Full-text message search UI for Nexopa
 *
 * Wires the existing chatSearchBar in message.html to the real
 * GET /api/search/messages and GET /api/search/messages/:chatId endpoints.
 *
 * Features:
 *   - In-chat search (current conversation) with result highlighting
 *   - Global search across all chats (shows chat context per result)
 *   - Debounced 300ms input → API call
 *   - Scroll-to-message on result click
 *   - Keyboard navigation (↑↓ arrows, Enter to jump, Esc to close)
 *   - Match count indicator ("3 of 12")
 */

(function (global) {
  'use strict';

  const API_BASE   = () => global.API_BASE_URL || '';
  const _token     = () => localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
  const _apiFetch  = (path) => fetch(`${API_BASE()}${path}`, {
    headers: { Authorization: `Bearer ${_token()}` }
  }).then(r => r.json());

  // ── State ──────────────────────────────────────────────────────────────────
  let _debounce    = null;
  let _results     = [];
  let _cursor      = -1;
  let _currentChatId = null;

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-search-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-search-styles';
    s.textContent = `
      /* Override the existing empty chatSearchBar styles */
      #chatSearchBar {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--kyn-bg-panel);
        border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
        z-index: 100;
      }
      #chatSearchBar.hidden { display: none !important; }

      #kynSearchInput {
        flex: 1;
        background: var(--kyn-bg-input);
        border: 1px solid var(--border-color, rgba(255,255,255,0.1));
        border-radius: 20px;
        color: var(--text-primary);
        font-size: 13px;
        padding: 7px 14px;
        outline: none;
        transition: border-color 0.15s;
      }
      #kynSearchInput:focus { border-color: var(--kyn-accent-primary); }
      #kynSearchInput::placeholder { color: var(--kyn-text-muted); }

      #kynSearchCount {
        font-size: 11px;
        color: var(--kyn-text-muted);
        white-space: nowrap;
        min-width: 50px;
        text-align: right;
      }
      .kyn-search-nav {
        background: none;
        border: none;
        color: var(--kyn-text-muted);
        cursor: pointer;
        font-size: 14px;
        padding: 4px;
        transition: color 0.15s;
        line-height: 1;
      }
      .kyn-search-nav:hover { color: var(--kyn-accent-primary); }
      .kyn-search-nav:disabled { opacity: 0.3; cursor: default; }
      #kynSearchClose {
        background: none; border: none;
        color: var(--kyn-text-muted);
        cursor: pointer; font-size: 16px; padding: 4px;
      }
      #kynSearchClose:hover { color: var(--text-primary); }

      /* Search results dropdown (global search) */
      #kynSearchDropdown {
        position: absolute;
        top: 100%; left: 0; right: 0;
        background: var(--kyn-bg-modal);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        border-top: none;
        border-radius: 0 0 12px 12px;
        max-height: 360px;
        overflow-y: auto;
        z-index: 200;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      }
      .kyn-search-result {
        display: flex;
        flex-direction: column;
        padding: 10px 14px;
        cursor: pointer;
        border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.04));
        transition: background 0.12s;
      }
      .kyn-search-result:hover,
      .kyn-search-result.active { background: rgba(124,58,237,0.1); }
      .kyn-search-result .sr-sender {
        font-size: 11px;
        font-weight: 700;
        color: var(--kyn-accent-primary);
        margin-bottom: 2px;
        display: flex;
        justify-content: space-between;
      }
      .kyn-search-result .sr-sender span:last-child {
        font-weight: 400;
        color: var(--kyn-text-muted);
      }
      .kyn-search-result .sr-content {
        font-size: 13px;
        color: var(--text-primary);
        line-height: 1.4;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .kyn-search-result .sr-content mark {
        background: rgba(124,58,237,0.3);
        color: var(--kyn-accent-primary);
        border-radius: 2px;
        padding: 0 2px;
      }
      .kyn-search-empty {
        padding: 20px;
        text-align: center;
        color: var(--kyn-text-muted);
        font-size: 13px;
      }
      .kyn-search-loading {
        padding: 16px;
        text-align: center;
        color: var(--kyn-text-muted);
        font-size: 13px;
      }

      /* Highlighted message in chat */
      .message-wrapper.kyn-search-highlight .message-bubble {
        outline: 2px solid var(--kyn-accent-primary);
        outline-offset: 2px;
        animation: kynSearchPulse 1.5s ease-in-out 2;
      }
      @keyframes kynSearchPulse {
        0%,100% { outline-color: var(--kyn-accent-primary); }
        50% { outline-color: rgba(124,58,237,0.2); }
      }

      /* Global search trigger button */
      #kynGlobalSearchBtn {
        background: none;
        border: none;
        color: var(--kyn-text-muted);
        cursor: pointer;
        font-size: 16px;
        padding: 6px;
        transition: color 0.15s;
        line-height: 1;
      }
      #kynGlobalSearchBtn:hover { color: var(--kyn-accent-primary); }
    `;
    document.head.appendChild(s);
  }

  // ── Build the search bar UI ─────────────────────────────────────────────────
  function _buildSearchBar(container) {
    if (container.dataset.kynSearchInit) return;
    container.dataset.kynSearchInit = '1';

    container.innerHTML = `
      <input id="kynSearchInput" type="text" placeholder="Search messages…" autocomplete="off" />
      <span id="kynSearchCount"></span>
      <button class="kyn-search-nav" id="kynSearchPrev" title="Previous (↑)" disabled>
        <i class="fas fa-chevron-up"></i>
      </button>
      <button class="kyn-search-nav" id="kynSearchNext" title="Next (↓)" disabled>
        <i class="fas fa-chevron-down"></i>
      </button>
      <button id="kynSearchClose" title="Close search">
        <i class="fas fa-times"></i>
      </button>
      <div id="kynSearchDropdown" style="display:none"></div>
    `;

    const input  = container.querySelector('#kynSearchInput');
    const prev   = container.querySelector('#kynSearchPrev');
    const next   = container.querySelector('#kynSearchNext');
    const close  = container.querySelector('#kynSearchClose');
    const drop   = container.querySelector('#kynSearchDropdown');

    // Debounced search on input
    input.addEventListener('input', () => {
      clearTimeout(_debounce);
      const q = input.value.trim();
      if (q.length < 2) {
        _clearHighlights();
        _results = [];
        _cursor  = -1;
        _updateCount();
        drop.style.display = 'none';
        return;
      }
      drop.style.display = 'block';
      drop.innerHTML = '<div class="kyn-search-loading"><i class="fas fa-circle-notch fa-spin"></i> Searching…</div>';
      _debounce = setTimeout(() => _search(q, input, drop), 300);
    });

    // Keyboard nav
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); _moveCursor(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); _moveCursor(-1); }
      if (e.key === 'Enter')     { e.preventDefault(); _jumpToCurrent(); }
      if (e.key === 'Escape')    { closeSearch(); }
    });

    prev.addEventListener('click', () => { _moveCursor(-1); _jumpToCurrent(); });
    next.addEventListener('click', () => { _moveCursor(1);  _jumpToCurrent(); });
    close.addEventListener('click', closeSearch);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) drop.style.display = 'none';
    });

    setTimeout(() => input.focus(), 50);
  }

  // ── Perform search ─────────────────────────────────────────────────────────
  async function _search(query, input, drop) {
    _currentChatId = _getCurrentChatId();
    const encoded  = encodeURIComponent(query);

    try {
      let data;
      if (_currentChatId) {
        // In-chat search (more precise)
        data = await _apiFetch(`/api/search/messages/${_currentChatId}?q=${encoded}&limit=30`);
      } else {
        // Global search
        data = await _apiFetch(`/api/search/messages?q=${encoded}&limit=20`);
      }

      _results = data.data?.messages || data.data || [];
      _cursor  = _results.length > 0 ? 0 : -1;

      _renderDropdown(drop, query);
      _updateCount();
      _updateNavButtons();

      if (_currentChatId && _results.length > 0) {
        // For in-chat: highlight matching messages in the DOM
        _highlightInChat(query);
        _jumpToCurrent();
        drop.style.display = 'none'; // Don't need dropdown for in-chat
      }
    } catch (e) {
      drop.innerHTML = `<div class="kyn-search-empty">Search failed: ${e.message}</div>`;
    }
  }

  // ── Render dropdown results ─────────────────────────────────────────────────
  function _renderDropdown(drop, query) {
    if (!_results.length) {
      drop.innerHTML = '<div class="kyn-search-empty">No messages found</div>';
      return;
    }

    drop.innerHTML = '';
    _results.forEach((msg, i) => {
      const item = document.createElement('div');
      item.className = `kyn-search-result${i === _cursor ? ' active' : ''}`;
      item.dataset.idx = i;

      const time    = msg.createdAt ? _timeStr(msg.createdAt) : '';
      const sender  = msg.senderName || msg.username || 'Unknown';
      const content = _highlight(msg.content || '', query);

      item.innerHTML = `
        <div class="sr-sender">
          <span>${_esc(sender)}</span>
          <span>${time}</span>
        </div>
        <div class="sr-content">${content}</div>
      `;

      item.addEventListener('click', () => {
        _cursor = i;
        _jumpToCurrent();
        drop.style.display = 'none';
      });

      drop.appendChild(item);
    });
  }

  // ── Highlight matching text in DOM messages ─────────────────────────────────
  function _highlightInChat(query) {
    _clearHighlights();
    const q = query.toLowerCase();
    document.querySelectorAll('.message-wrapper').forEach(wrapper => {
      const textEl = wrapper.querySelector('.message-content, .message-text, p');
      if (textEl && textEl.textContent.toLowerCase().includes(q)) {
        wrapper.classList.add('kyn-search-highlight');
      }
    });
  }

  function _clearHighlights() {
    document.querySelectorAll('.kyn-search-highlight').forEach(el => {
      el.classList.remove('kyn-search-highlight');
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function _moveCursor(dir) {
    if (!_results.length) return;
    _cursor = (_cursor + dir + _results.length) % _results.length;
    _updateCount();
    _updateDropdownActive();
  }

  function _jumpToCurrent() {
    if (_cursor < 0 || !_results[_cursor]) return;
    const msg = _results[_cursor];
    const msgId = msg.id || msg.messageId;

    // Try to find and scroll to the message in the DOM
    const el = document.querySelector(`[data-message-id="${msgId}"]`) ||
               document.querySelector(`.message-wrapper[data-msg-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Pulse it
      el.classList.remove('kyn-search-highlight');
      setTimeout(() => el.classList.add('kyn-search-highlight'), 10);
      return;
    }

    // If not in DOM, navigate to the chat containing this message
    if (msg.chatId && msg.chatId !== _currentChatId) {
      window.dispatchEvent(new CustomEvent('kyn:openChat', {
        detail: { chatId: msg.chatId, scrollToMessageId: msgId }
      }));
    }
  }

  function _updateDropdownActive() {
    const items = document.querySelectorAll('.kyn-search-result');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === _cursor);
      if (i === _cursor) item.scrollIntoView({ block: 'nearest' });
    });
  }

  function _updateCount() {
    const el = document.getElementById('kynSearchCount');
    if (!el) return;
    if (!_results.length) { el.textContent = ''; return; }
    el.textContent = `${_cursor + 1} / ${_results.length}`;
  }

  function _updateNavButtons() {
    const prev = document.getElementById('kynSearchPrev');
    const next = document.getElementById('kynSearchNext');
    if (prev) prev.disabled = _results.length < 2;
    if (next) next.disabled = _results.length < 2;
  }

  // ── Open / close search bar ─────────────────────────────────────────────────
  function openSearch() {
    const bar = document.getElementById('chatSearchBar');
    if (!bar) return;
    bar.classList.remove('hidden');
    bar.style.display = 'flex';
    _buildSearchBar(bar);
    const input = bar.querySelector('#kynSearchInput');
    if (input) input.focus();
  }

  function closeSearch() {
    const bar = document.getElementById('chatSearchBar');
    if (bar) {
      bar.classList.add('hidden');
      bar.style.display = 'none';
    }
    _clearHighlights();
    _results = [];
    _cursor  = -1;
  }

  // ── Inject global search trigger button ────────────────────────────────────
  function _injectSearchTrigger() {
    if (document.getElementById('kynGlobalSearchBtn')) return;
    // Find the chat header actions area
    const header = document.getElementById('chatHeader') ||
                   document.querySelector('.chat-header, .chat-title-bar');
    if (!header) return;

    const btn = document.createElement('button');
    btn.id    = 'kynGlobalSearchBtn';
    btn.title = 'Search messages';
    btn.innerHTML = '<i class="fas fa-search"></i>';
    btn.addEventListener('click', openSearch);
    header.appendChild(btn);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function _getCurrentChatId() {
    return window.currentChatId ||
           document.querySelector('[data-chat-id]')?.dataset.chatId ||
           new URLSearchParams(location.search).get('chatId') ||
           null;
  }

  function _highlight(text, query) {
    const escaped = _esc(text);
    const q       = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp(q, 'gi'), m => `<mark>${m}</mark>`);
  }

  function _timeStr(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diffDays < 7)  return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Keyboard shortcut: Cmd/Ctrl+F ──────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      const bar = document.getElementById('chatSearchBar');
      if (bar) {
        e.preventDefault();
        if (bar.classList.contains('hidden') || bar.style.display === 'none') {
          openSearch();
        } else {
          document.getElementById('kynSearchInput')?.focus();
        }
      }
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  global.kynMessageSearch = { openSearch, closeSearch };

  function init() {
    _injectStyles();

    // Hide the search bar by default
    const bar = document.getElementById('chatSearchBar');
    if (bar) { bar.classList.add('hidden'); bar.style.display = 'none'; }

    setTimeout(_injectSearchTrigger, 600);
    window.addEventListener('kyn:chatLoaded', () => {
      setTimeout(_injectSearchTrigger, 300);
      _clearHighlights();
      _results = [];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

}(window));
