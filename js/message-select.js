/**
 * message-select.js — Multi-select message mode for MoodChat
 *
 * Phase 2 feature: Long-press → select multiple messages → delete / forward
 *
 * - Long-press (600ms) on any message bubble enters selection mode
 * - Tap additional messages to add/remove from selection
 * - Floating action bar appears at bottom: Delete, Forward, Copy, Cancel
 * - Forward: re-sends selected messages to a chat chosen from a picker
 * - Delete: calls DELETE /api/messages (bulk) for own messages; flags others' for report
 * - Works on mobile (touch) and desktop (right-click enters selection mode too)
 * - Exits on Escape, tap outside, or Cancel button
 *
 * Depends on: messages-ui.js, messages-core.js
 */

(function (global) {
  'use strict';

  const LONG_PRESS_MS = 600;

  // ── State ──────────────────────────────────────────────────────────────────
  let _mode      = false; // selection mode active
  let _selected  = new Set(); // Set of message IDs
  let _messages  = new Map(); // messageId → message object
  let _longTimer = null;

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-msg-select-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-msg-select-styles';
    s.textContent = `
      /* Selection mode: body class toggles styles */
      body.kyn-select-mode .message-wrapper {
        cursor: pointer;
        user-select: none;
      }
      body.kyn-select-mode .message-wrapper:hover .message-bubble {
        outline: 2px solid var(--accent, #7c3aed);
        outline-offset: 2px;
      }

      /* Checkbox overlay on each message */
      .msg-select-checkbox {
        display: none;
        position: absolute;
        left: -30px;
        top: 50%;
        transform: translateY(-50%);
        width: 20px; height: 20px;
        border-radius: 50%;
        border: 2px solid var(--border-color, rgba(255,255,255,0.2));
        background: var(--bg-secondary, #1e1e2e);
        align-items: center; justify-content: center;
        z-index: 10;
        transition: background 0.15s, border-color 0.15s;
        flex-shrink: 0;
      }
      body.kyn-select-mode .msg-select-checkbox { display: flex; }
      .message-wrapper.selected .msg-select-checkbox {
        background: var(--accent, #7c3aed);
        border-color: var(--accent, #7c3aed);
      }
      .message-wrapper.selected .msg-select-checkbox::after {
        content: '✓';
        color: #fff;
        font-size: 11px;
        font-weight: 700;
      }
      .message-wrapper.selected .message-bubble {
        outline: 2px solid var(--accent, #7c3aed);
        outline-offset: 2px;
        background: rgba(124,58,237,0.08) !important;
      }

      /* Action bar */
      #kynSelectBar {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        background: var(--bg-primary, #141420);
        border-top: 1px solid var(--border-color, rgba(255,255,255,0.08));
        padding: 12px 16px env(safe-area-inset-bottom, 0);
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 1000;
        animation: selectBarIn 0.2s ease;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
      }
      @keyframes selectBarIn {
        from { transform: translateY(60px); opacity: 0 }
        to   { transform: translateY(0);   opacity: 1 }
      }
      #kynSelectCount {
        font-size: 14px; font-weight: 700;
        color: var(--accent, #7c3aed);
        min-width: 40px;
      }
      #kynSelectBar .sel-btn {
        flex: 1;
        background: var(--bg-secondary, #1e1e2e);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        border-radius: 10px;
        color: var(--text-primary, #fff);
        font-size: 12px;
        padding: 8px 4px;
        cursor: pointer;
        display: flex; flex-direction: column;
        align-items: center; gap: 3px;
        transition: background 0.15s;
      }
      #kynSelectBar .sel-btn i { font-size: 16px; }
      #kynSelectBar .sel-btn:hover { background: rgba(255,255,255,0.08); }
      #kynSelectBar .sel-btn.danger { color: #ef4444; }
      #kynSelectBar .sel-btn.cancel { color: var(--text-muted, #888); }

      /* Forward picker modal */
      #kynForwardPicker {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.6);
        z-index: 10000;
        display: flex; align-items: flex-end; justify-content: center;
      }
      #kynForwardPickerBox {
        background: var(--bg-primary, #141420);
        border-radius: 20px 20px 0 0;
        width: 100%; max-width: 480px;
        padding: 16px 0 32px;
        max-height: 70vh;
        display: flex; flex-direction: column;
        animation: fwdPickerIn 0.2s ease;
      }
      @keyframes fwdPickerIn {
        from { transform: translateY(40px); opacity: 0 }
        to   { transform: translateY(0);   opacity: 1 }
      }
      #kynForwardPickerBox h3 {
        font-size: 15px; font-weight: 700;
        color: var(--text-primary, #fff);
        text-align: center;
        margin: 0 0 12px;
        padding: 0 16px;
      }
      #kynForwardSearch {
        margin: 0 16px 10px;
        padding: 9px 12px;
        border-radius: 20px;
        background: var(--bg-secondary, #1e1e2e);
        border: 1px solid var(--border-color, rgba(255,255,255,0.1));
        color: var(--text-primary, #fff);
        font-size: 13px; outline: none;
      }
      #kynForwardList {
        flex: 1; overflow-y: auto;
      }
      .fwd-chat-item {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 16px;
        cursor: pointer;
        transition: background 0.12s;
      }
      .fwd-chat-item:hover { background: rgba(255,255,255,0.04); }
      .fwd-chat-avatar {
        width: 40px; height: 40px; border-radius: 50%;
        background: var(--accent, #7c3aed);
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-weight: 700; font-size: 15px;
        flex-shrink: 0;
      }
      .fwd-chat-name {
        font-size: 14px; color: var(--text-primary, #fff);
      }
    `;
    document.head.appendChild(s);
  }

  // ── Enter/exit selection mode ──────────────────────────────────────────────
  function _enter(messageId, messageObj) {
    _mode = true;
    _selected.clear();
    document.body.classList.add('kyn-select-mode');
    _toggleMessage(messageId, messageObj);
    _showBar();
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function _exit() {
    _mode = false;
    _selected.clear();
    document.body.classList.remove('kyn-select-mode');
    document.querySelectorAll('.message-wrapper.selected').forEach(el => el.classList.remove('selected'));
    _hideBar();
  }

  function _toggleMessage(messageId, messageObj) {
    const id = String(messageId);
    if (!id) return;
    if (_selected.has(id)) {
      _selected.delete(id);
    } else {
      _selected.add(id);
      if (messageObj) _messages.set(id, messageObj);
    }
    // Update visual
    const wrapper = document.querySelector(`[data-message-id="${id}"]`) ||
                    document.querySelector(`.message-wrapper[data-msg-id="${id}"]`);
    if (wrapper) wrapper.classList.toggle('selected', _selected.has(id));
    _updateBar();
  }

  // ── Action bar ─────────────────────────────────────────────────────────────
  function _showBar() {
    if (document.getElementById('kynSelectBar')) return;
    const bar = document.createElement('div');
    bar.id = 'kynSelectBar';
    bar.innerHTML = `
      <span id="kynSelectCount">0</span>
      <button class="sel-btn" id="kynSelCopy" title="Copy">
        <i class="fas fa-copy"></i><span>Copy</span>
      </button>
      <button class="sel-btn" id="kynSelForward" title="Forward">
        <i class="fas fa-share"></i><span>Forward</span>
      </button>
      <button class="sel-btn danger" id="kynSelDelete" title="Delete">
        <i class="fas fa-trash"></i><span>Delete</span>
      </button>
      <button class="sel-btn cancel" id="kynSelCancel" title="Cancel">
        <i class="fas fa-times"></i><span>Cancel</span>
      </button>
    `;
    document.body.appendChild(bar);

    document.getElementById('kynSelCopy').addEventListener('click',    _copySelected);
    document.getElementById('kynSelForward').addEventListener('click', _openForwardPicker);
    document.getElementById('kynSelDelete').addEventListener('click',  _deleteSelected);
    document.getElementById('kynSelCancel').addEventListener('click',  _exit);
    _updateBar();
  }

  function _hideBar() {
    document.getElementById('kynSelectBar')?.remove();
  }

  function _updateBar() {
    const countEl = document.getElementById('kynSelectCount');
    if (countEl) countEl.textContent = `${_selected.size} selected`;
    const fwdBtn = document.getElementById('kynSelForward');
    const delBtn = document.getElementById('kynSelDelete');
    const cpyBtn = document.getElementById('kynSelCopy');
    const none = _selected.size === 0;
    if (fwdBtn) fwdBtn.disabled = none;
    if (delBtn) delBtn.disabled = none;
    if (cpyBtn) cpyBtn.disabled = none;
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function _copySelected() {
    const texts = Array.from(_selected).map(id => {
      const msg = _messages.get(id);
      return msg?.content || '';
    }).filter(Boolean);
    if (!texts.length) return;
    navigator.clipboard?.writeText(texts.join('\n')).then(() => {
      _showToast('Copied to clipboard');
    }).catch(() => _showToast('Copy failed'));
    _exit();
  }

  async function _deleteSelected() {
    if (!_selected.size) return;
    if (!confirm(`Delete ${_selected.size} message${_selected.size > 1 ? 's' : ''}?`)) return;

    const apiBase = global.API_BASE_URL || '';
    const token   = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    const ids     = Array.from(_selected);

    try {
      await fetch(`${apiBase}/api/messages/bulk-delete`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: ids }),
      });
      // Remove from DOM
      ids.forEach(id => {
        const wrapper = document.querySelector(`[data-message-id="${id}"]`) ||
                        document.querySelector(`.message-wrapper[data-msg-id="${id}"]`);
        if (wrapper) wrapper.remove();
      });
      _showToast(`${ids.length} message${ids.length > 1 ? 's' : ''} deleted`);
    } catch (e) {
      _showToast('Delete failed', true);
    }
    _exit();
  }

  function _openForwardPicker() {
    const overlay = document.createElement('div');
    overlay.id = 'kynForwardPicker';

    // Load conversations for the picker
    const core = global.MessagesCore || global.messagesCore || global.__messagesCore;
    const conversations = core?.ChatManager?.getConversations?.() ||
                          core?.getConversations?.() || [];

    const listHtml = conversations.length
      ? conversations.map(c => {
          const name   = c.name || c.displayName || c.username || 'Chat';
          const initials = name.slice(0, 2).toUpperCase();
          return `<div class="fwd-chat-item" data-chat-id="${c.id || c.chatId}">
            <div class="fwd-chat-avatar">${initials}</div>
            <div class="fwd-chat-name">${_esc(name)}</div>
          </div>`;
        }).join('')
      : '<div style="padding:20px;text-align:center;color:var(--text-muted,#888)">No conversations found</div>';

    overlay.innerHTML = `
      <div id="kynForwardPickerBox">
        <h3>Forward to…</h3>
        <input id="kynForwardSearch" placeholder="Search chats…" type="text" />
        <div id="kynForwardList">${listHtml}</div>
      </div>
    `;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#kynForwardSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      overlay.querySelectorAll('.fwd-chat-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    overlay.querySelectorAll('.fwd-chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const chatId = item.dataset.chatId;
        overlay.remove();
        _forwardTo(chatId);
      });
    });

    document.body.appendChild(overlay);
  }

  async function _forwardTo(chatId) {
    const apiBase = global.API_BASE_URL || '';
    const token   = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    const ids     = Array.from(_selected);

    try {
      await fetch(`${apiBase}/api/messages/forward`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: ids, targetChatId: chatId }),
      });
      _showToast(`Forwarded ${ids.length} message${ids.length > 1 ? 's' : ''}`);
    } catch (e) {
      _showToast('Forward failed', true);
    }
    _exit();
  }

  // ── Attach long-press to message containers ────────────────────────────────
  function _attachLongPress(container) {
    container.addEventListener('pointerdown', (e) => {
      const wrapper = e.target.closest('.message-wrapper');
      if (!wrapper) return;

      if (_mode) {
        // In selection mode: tap toggles
        e.preventDefault();
        const msgId  = _getMessageId(wrapper);
        const msgObj = _getMessageObj(wrapper);
        _toggleMessage(msgId, msgObj);
        return;
      }

      // Start long-press timer
      _longTimer = setTimeout(() => {
        _longTimer = null;
        const msgId  = _getMessageId(wrapper);
        const msgObj = _getMessageObj(wrapper);
        if (msgId) _enter(msgId, msgObj);
      }, LONG_PRESS_MS);
    });

    container.addEventListener('pointerup',    () => clearTimeout(_longTimer));
    container.addEventListener('pointerleave', () => clearTimeout(_longTimer));
    container.addEventListener('pointermove',  (e) => {
      if (e.movementX > 3 || e.movementY > 3) clearTimeout(_longTimer);
    });

    // Desktop: right-click enters selection mode
    container.addEventListener('contextmenu', (e) => {
      const wrapper = e.target.closest('.message-wrapper');
      if (!wrapper) return;
      if (!_mode) {
        e.preventDefault();
        const msgId  = _getMessageId(wrapper);
        const msgObj = _getMessageObj(wrapper);
        if (msgId) _enter(msgId, msgObj);
      }
    });
  }

  function _addCheckboxesToWrappers(container) {
    container.querySelectorAll('.message-wrapper:not([data-sel-init])').forEach(wrapper => {
      wrapper.dataset.selInit = '1';
      if (!wrapper.querySelector('.msg-select-checkbox')) {
        const cb = document.createElement('div');
        cb.className = 'msg-select-checkbox';
        cb.setAttribute('aria-hidden', 'true');
        wrapper.style.position = 'relative';
        wrapper.insertBefore(cb, wrapper.firstChild);
      }
      // Set message ID as data attr for easy lookup
      if (!wrapper.dataset.messageId) {
        const id = _getMessageId(wrapper);
        if (id) wrapper.dataset.messageId = id;
      }
    });
  }

  function _getMessageId(wrapper) {
    if (wrapper.dataset.messageId) return wrapper.dataset.messageId;
    // Try to parse from onclick
    const bubble = wrapper.querySelector('.message-bubble');
    if (!bubble) return null;
    const onclick = bubble.getAttribute('onclick') || '';
    const match = onclick.match(/"id"\s*:\s*(\d+)/);
    return match ? match[1] : null;
  }

  function _getMessageObj(wrapper) {
    const bubble = wrapper.querySelector('.message-bubble');
    if (!bubble) return {};
    const onclick = bubble.getAttribute('onclick') || '';
    const match = onclick.match(/showMessageActions\(({.*?}),/);
    if (!match) return {};
    try { return JSON.parse(match[1].replace(/&quot;/g, '"')); } catch { return {}; }
  }

  // ── Observe messages container ─────────────────────────────────────────────
  function _observeContainer() {
    const container = document.getElementById('messagesContainer') ||
                      document.getElementById('messagesList') ||
                      document.querySelector('.messages-container');
    if (!container) { setTimeout(_observeContainer, 500); return; }

    _attachLongPress(container);
    _addCheckboxesToWrappers(container);

    const obs = new MutationObserver(() => _addCheckboxesToWrappers(container));
    obs.observe(container, { childList: true, subtree: true });
  }

  // ── Escape key exits selection mode ───────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _mode) _exit();
  });

  // ── Toast helper ──────────────────────────────────────────────────────────
  function _showToast(msg, isError = false) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:${isError ? '#ef4444' : 'rgba(0,0,0,0.8)'};color:#fff;
      padding:8px 16px;border-radius:20px;font-size:13px;z-index:20000;
      animation:toastIn 0.2s ease;pointer-events:none;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    setTimeout(_observeContainer, 600);
    window.addEventListener('kyn:chatLoaded', () => setTimeout(_observeContainer, 300));
    window.addEventListener('renderMessages', () => setTimeout(() => {
      const c = document.getElementById('messagesContainer') || document.querySelector('.messages-container');
      if (c) _addCheckboxesToWrappers(c);
    }, 100));

    global.kynMessageSelect = { enter: _enter, exit: _exit, toggle: _toggleMessage, isActive: () => _mode };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 400);
  }

}(window));
