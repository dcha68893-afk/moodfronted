/**
 * messages-interactions.patch.js
 *
 * FIX-C: Swipe-to-reply gesture (WhatsApp / Signal style)
 * FIX-D: Message selection mode (long-press → select → delete / forward / copy)
 *
 * Self-contained — uses MutationObserver to wire up every message element
 * as it is added to the DOM. No changes required to messages-ui.js or
 * messages-core.js beyond loading this file.
 *
 * Include in message.html and chat.html AFTER all other message scripts:
 *   <script src="messages-interactions.patch.js" defer></script>
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED STATE
  // ─────────────────────────────────────────────────────────────────────────
  let _selectionMode   = false;
  const _selected      = new Set(); // message ids
  let _longPressTimer  = null;
  const LONG_PRESS_MS  = 500;
  const SWIPE_THRESHOLD = 60; // px needed to trigger reply

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITY
  // ─────────────────────────────────────────────────────────────────────────
  function _getMessageId(el) {
    return el.closest('[data-message-id]')?.dataset?.messageId || null;
  }

  function _getMessageText(el) {
    return el.closest('[data-message-id]')?.querySelector('.message-text')?.textContent?.trim() || '';
  }

  function _isSent(el) {
    return el.closest('[data-message-id]')?.classList?.contains('sent');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX-C: SWIPE-TO-REPLY
  // ─────────────────────────────────────────────────────────────────────────
  const _REPLY_ICON_HTML = `<div class="swipe-reply-icon" aria-hidden="true">
    <i class="fas fa-reply"></i>
  </div>`;

  function _setupSwipeReply(msgEl) {
    if (msgEl.dataset._swipeWired) return;
    msgEl.dataset._swipeWired = '1';

    let startX = 0, startY = 0, currentX = 0, dragging = false, triggered = false;
    let iconEl = null;

    function _addIcon() {
      if (iconEl) return;
      iconEl = document.createElement('div');
      iconEl.className = 'swipe-reply-icon';
      iconEl.innerHTML = '<i class="fas fa-reply"></i>';
      iconEl.style.cssText = `
        position:absolute; top:50%; transform:translateY(-50%);
        ${_isSent(msgEl) ? 'left:-36px;' : 'right:-36px;'}
        width:28px; height:28px; border-radius:50%;
        background:rgba(0,0,0,.12); display:flex; align-items:center;
        justify-content:center; color:#fff; font-size:13px;
        opacity:0; transition:opacity .1s; pointer-events:none;
        z-index:10;
      `;
      msgEl.style.position = 'relative';
      msgEl.appendChild(iconEl);
    }

    function _cleanup() {
      dragging = false; triggered = false;
      msgEl.style.transform = '';
      msgEl.style.transition = 'transform .2s ease';
      if (iconEl) { iconEl.style.opacity = '0'; }
      setTimeout(() => { msgEl.style.transition = ''; }, 200);
    }

    msgEl.addEventListener('touchstart', (e) => {
      if (_selectionMode) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      currentX = 0; dragging = true; triggered = false;
      _addIcon();
    }, { passive: true });

    msgEl.addEventListener('touchmove', (e) => {
      if (!dragging || _selectionMode) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) * 1.5) { _cleanup(); return; } // vertical scroll
      currentX = dx;
      // Only allow swipe in the reply direction
      const isRight = !_isSent(msgEl); // received → swipe right
      const isLeft  = _isSent(msgEl);  // sent → swipe left
      if ((isRight && dx < 0) || (isLeft && dx > 0)) return;
      const dist = Math.min(Math.abs(dx), SWIPE_THRESHOLD + 20);
      msgEl.style.transform = `translateX(${isRight ? dist : -dist}px)`;
      msgEl.style.transition = 'none';
      if (iconEl) iconEl.style.opacity = Math.min(1, dist / SWIPE_THRESHOLD).toString();
      if (!triggered && Math.abs(dx) >= SWIPE_THRESHOLD) {
        triggered = true;
        // Haptic feedback
        try { navigator.vibrate && navigator.vibrate(30); } catch (_) {}
        _triggerReply(msgEl);
      }
    }, { passive: true });

    msgEl.addEventListener('touchend', _cleanup);
    msgEl.addEventListener('touchcancel', _cleanup);
  }

  function _triggerReply(msgEl) {
    const msgId   = _getMessageId(msgEl);
    const msgText = _getMessageText(msgEl);
    const senderEl = msgEl.querySelector('.message-sender, .sender-name');
    const sender  = senderEl?.textContent?.trim() || (_isSent(msgEl) ? 'You' : 'Them');

    // Show reply preview bar (reuse existing or create one)
    let bar = document.getElementById('replyPreviewBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'replyPreviewBar';
      bar.style.cssText = `
        display:flex; align-items:center; gap:10px;
        padding:8px 14px; background:#f0f2f5;
        border-left:4px solid #00a884; font-size:13px;
        position:relative; animation:slideUp .15s ease;
      `;
      const inputArea = document.querySelector('.message-input-container, .input-area, #messageInputWrapper');
      if (inputArea) inputArea.prepend(bar); else document.body.appendChild(bar);
    }

    const preview = msgText.length > 60 ? msgText.slice(0, 60) + '…' : msgText;
    bar.innerHTML = `
      <div style="flex:1;overflow:hidden;">
        <div style="font-weight:600;color:#00a884;font-size:12px;">${_escHtml(sender)}</div>
        <div style="color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escHtml(preview)}</div>
      </div>
      <button id="cancelReplyBtn" style="background:none;border:none;cursor:pointer;color:#888;font-size:18px;padding:4px;">
        <i class="fas fa-times"></i>
      </button>
    `;
    bar.style.display = 'flex';
    bar.dataset.replyToId = msgId;
    bar.dataset.replyText = msgText;
    bar.dataset.replySender = sender;

    document.getElementById('cancelReplyBtn')?.addEventListener('click', _cancelReply);

    // Wire into MessageHandler / MessagesCore so the reply metadata is sent
    global.__pendingReplyTo = { id: msgId, content: msgText, senderName: sender };

    // Focus the input
    document.getElementById('messageInput')?.focus();
  }

  function _cancelReply() {
    const bar = document.getElementById('replyPreviewBar');
    if (bar) bar.style.display = 'none';
    global.__pendingReplyTo = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX-D: MESSAGE SELECTION MODE
  // ─────────────────────────────────────────────────────────────────────────
  function _enterSelectionMode(msgEl) {
    _selectionMode = true;
    _selected.clear();
    _toggleSelect(msgEl, true);
    _showSelectionToolbar();
    document.querySelectorAll('[data-message-id]').forEach(el => {
      el.style.userSelect = 'none';
    });
    try { navigator.vibrate && navigator.vibrate([40, 30, 40]); } catch (_) {}
  }

  function _exitSelectionMode() {
    _selectionMode = false;
    _selected.clear();
    document.querySelectorAll('[data-message-id]').forEach(el => {
      el.classList.remove('msg-selected');
      el.style.userSelect = '';
    });
    _hideSelectionToolbar();
    global.__pendingReplyTo = null;
  }

  function _toggleSelect(msgEl, forceOn = null) {
    const msgId = _getMessageId(msgEl);
    if (!msgId) return;
    const wasSelected = _selected.has(msgId);
    const nowSelected = forceOn !== null ? forceOn : !wasSelected;
    if (nowSelected) {
      _selected.add(msgId);
      msgEl.classList.add('msg-selected');
    } else {
      _selected.delete(msgId);
      msgEl.classList.remove('msg-selected');
    }
    _updateSelectionCount();
    if (_selectionMode && _selected.size === 0) _exitSelectionMode();
  }

  function _updateSelectionCount() {
    const countEl = document.getElementById('selectionCount');
    if (countEl) countEl.textContent = `${_selected.size} selected`;
  }

  function _showSelectionToolbar() {
    let tb = document.getElementById('selectionToolbar');
    if (!tb) {
      tb = document.createElement('div');
      tb.id = 'selectionToolbar';
      tb.style.cssText = `
        position:fixed; top:0; left:0; right:0; z-index:999;
        display:flex; align-items:center; gap:8px;
        background:#fff; padding:12px 16px;
        box-shadow:0 2px 12px rgba(0,0,0,.15);
        animation:slideDown .15s ease;
      `;
      tb.innerHTML = `
        <button id="selectionClose" title="Cancel" style="background:none;border:none;cursor:pointer;font-size:20px;color:#333;padding:4px;">
          <i class="fas fa-times"></i>
        </button>
        <span id="selectionCount" style="flex:1;font-weight:600;font-size:15px;color:#333;"></span>
        <button id="selectionCopy"    title="Copy"    style="background:none;border:none;cursor:pointer;font-size:18px;color:#555;padding:6px;"><i class="fas fa-copy"></i></button>
        <button id="selectionForward" title="Forward" style="background:none;border:none;cursor:pointer;font-size:18px;color:#555;padding:6px;"><i class="fas fa-share"></i></button>
        <button id="selectionStar"    title="Star"    style="background:none;border:none;cursor:pointer;font-size:18px;color:#555;padding:6px;"><i class="fas fa-star"></i></button>
        <button id="selectionDelete"  title="Delete"  style="background:none;border:none;cursor:pointer;font-size:18px;color:#e53935;padding:6px;"><i class="fas fa-trash"></i></button>
      `;
      document.body.appendChild(tb);

      document.getElementById('selectionClose')?.addEventListener('click', _exitSelectionMode);
      document.getElementById('selectionCopy')?.addEventListener('click', _copySelected);
      document.getElementById('selectionForward')?.addEventListener('click', _forwardSelected);
      document.getElementById('selectionStar')?.addEventListener('click', _starSelected);
      document.getElementById('selectionDelete')?.addEventListener('click', _deleteSelected);
    }
    tb.style.display = 'flex';
    _updateSelectionCount();
  }

  function _hideSelectionToolbar() {
    const tb = document.getElementById('selectionToolbar');
    if (tb) tb.style.display = 'none';
  }

  // ── Selection actions ────────────────────────────────────────────────────
  function _copySelected() {
    const texts = [];
    _selected.forEach(id => {
      const el = document.querySelector(`[data-message-id="${id}"]`);
      if (el) texts.push(el.querySelector('.message-text')?.textContent?.trim() || '');
    });
    navigator.clipboard?.writeText(texts.join('\n')).catch(() => {});
    _exitSelectionMode();
  }

  function _forwardSelected() {
    // Open forward dialog — dispatch event for existing forward UI if present
    const ids = [..._selected];
    document.dispatchEvent(new CustomEvent('messages:forward', { detail: { messageIds: ids } }));
    _exitSelectionMode();
  }

  function _starSelected() {
    const ids = [..._selected];
    const core = global.MessagesCore || global.messagesCore;
    ids.forEach(id => {
      if (core && typeof core.starMessage === 'function') {
        core.starMessage(id).catch(() => {});
      } else {
        // Fallback: direct API call
        const token = global.authToken || sessionStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || '';
        const base  = global.API_BASE_URL || '';
        fetch(`${base}/api/messages/${id}/star`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      }
    });
    _exitSelectionMode();
  }

  function _deleteSelected() {
    if (!_selected.size) return;
    if (!confirm(`Delete ${_selected.size} message(s)?`)) return;
    const ids = [..._selected];
    const core = global.MessagesCore || global.messagesCore;
    ids.forEach(id => {
      if (core && typeof core.deleteMessage === 'function') {
        core.deleteMessage(id).catch(() => {});
      } else {
        const token = global.authToken || sessionStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || '';
        const base  = global.API_BASE_URL || '';
        fetch(`${base}/api/messages/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(() => {
          document.querySelector(`[data-message-id="${id}"]`)?.remove();
        }).catch(() => {});
      }
    });
    _exitSelectionMode();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WIRE UP EACH MESSAGE ELEMENT
  // ─────────────────────────────────────────────────────────────────────────
  function _wireMessageEl(msgEl) {
    if (msgEl.dataset._interactionsWired) return;
    msgEl.dataset._interactionsWired = '1';

    // FIX-C: Swipe-to-reply
    _setupSwipeReply(msgEl);

    // FIX-D: Long-press → selection mode
    msgEl.addEventListener('mousedown', () => {
      _longPressTimer = setTimeout(() => {
        if (_selectionMode) _toggleSelect(msgEl);
        else _enterSelectionMode(msgEl);
      }, LONG_PRESS_MS);
    });
    msgEl.addEventListener('touchstart', () => {
      _longPressTimer = setTimeout(() => {
        if (_selectionMode) _toggleSelect(msgEl);
        else _enterSelectionMode(msgEl);
      }, LONG_PRESS_MS);
    }, { passive: true });

    const _clearTimer = () => clearTimeout(_longPressTimer);
    msgEl.addEventListener('mouseup',      _clearTimer);
    msgEl.addEventListener('mouseleave',   _clearTimer);
    msgEl.addEventListener('touchend',     _clearTimer);
    msgEl.addEventListener('touchcancel',  _clearTimer);

    // In selection mode: tap to toggle
    msgEl.addEventListener('click', () => {
      if (_selectionMode) { _toggleSelect(msgEl); }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OBSERVE DOM FOR NEW MESSAGES
  // ─────────────────────────────────────────────────────────────────────────
  function _wireAllExisting() {
    document.querySelectorAll('[data-message-id]').forEach(_wireMessageEl);
  }

  const _observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches('[data-message-id]')) _wireMessageEl(node);
        node.querySelectorAll?.('[data-message-id]').forEach(_wireMessageEl);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CSS INJECTED INLINE
  // ─────────────────────────────────────────────────────────────────────────
  const _style = document.createElement('style');
  _style.textContent = `
    /* FIX-C: Swipe-to-reply */
    [data-message-id] {
      touch-action: pan-y;
      will-change: transform;
    }
    .swipe-reply-icon {
      pointer-events: none;
      transition: opacity .1s;
    }

    /* FIX-D: Message selection */
    [data-message-id].msg-selected .message-bubble {
      background: rgba(0, 168, 132, 0.18) !important;
      outline: 2px solid #00a884;
      outline-offset: 1px;
      border-radius: 8px;
    }
    [data-message-id].msg-selected {
      background: rgba(0, 168, 132, 0.07);
    }

    /* Reply preview bar */
    #replyPreviewBar {
      border-radius: 0;
    }

    /* Selection toolbar animation */
    @keyframes slideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(10px); opacity: 0; }
      to   { transform: translateY(0);   opacity: 1; }
    }

    /* Pressed state for selection toolbar buttons */
    #selectionToolbar button:active { opacity: .6; }
  `;
  document.head.appendChild(_style);

  // ─────────────────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────────────────
  function _escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Intercept sendMessage to attach replyTo metadata
  const _origSend = global.MessagesCore?.MessageHandler?.sendMessage?.bind(global.MessagesCore?.MessageHandler);
  if (global.MessagesCore && global.MessagesCore.MessageHandler && _origSend) {
    global.MessagesCore.MessageHandler.sendMessage = async function(content, options = {}) {
      if (global.__pendingReplyTo) {
        options.replyTo = global.__pendingReplyTo;
        _cancelReply();
      }
      return _origSend(content, options);
    };
  }
  // Also intercept via event
  document.addEventListener('messages:beforeSend', (e) => {
    if (global.__pendingReplyTo && e.detail) {
      e.detail.replyTo = global.__pendingReplyTo;
      _cancelReply();
    }
  });

  // Escape key exits selection mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (_selectionMode) _exitSelectionMode();
      else _cancelReply();
    }
  });

  // Start observing once DOM is ready
  function _init() {
    _wireAllExisting();
    const container = document.getElementById('messagesContainer')
      || document.getElementById('chatMessages')
      || document.querySelector('.messages-list, .chat-messages');
    if (container) {
      _observer.observe(container, { childList: true, subtree: true });
    } else {
      // Fallback: observe body
      _observer.observe(document.body, { childList: true, subtree: true });
    }
    console.log('[MessagesInteractions] ✅ Swipe-to-reply + Selection mode active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})(window);
