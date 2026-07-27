/**
 * link-preview.js — URL detection + OG preview card for Kynecta
 *
 * Audit finding: No URL detection, no Open Graph fetch, no preview card.
 * WhatsApp and Signal both auto-generate OG preview cards.
 *
 * Features:
 *  - Detects URLs in message input (300ms debounce)
 *  - Calls GET /api/messaging/preview?url=...
 *  - Renders a dismissible preview card above the send button
 *  - Attaches preview metadata to outgoing message payload
 *  - Renders received link-preview messages with card UI
 *
 * Usage: included via <script src="js/link-preview.js" defer>
 */

(function (global) {
  'use strict';

  const URL_REGEX  = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;
  const DEBOUNCE_MS = 500;

  let _currentPreview = null;
  let _debounceTimer  = null;
  let _previewDismissed = false;
  let _lastUrl        = null;

  // ── Inject styles ─────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-link-preview-styles')) return;
    const style = document.createElement('style');
    style.id = 'kyn-link-preview-styles';
    style.textContent = `
      #kyn-link-preview-card {
        position: relative;
        background: var(--kyn-bg-panel);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        border-radius: 12px;
        padding: 10px 12px;
        margin: 4px 8px;
        display: flex;
        gap: 10px;
        align-items: flex-start;
        animation: kynPreviewIn 0.2s ease;
        max-height: 80px;
        overflow: hidden;
      }
      @keyframes kynPreviewIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
      #kyn-link-preview-card .kyn-preview-img {
        width: 56px; height: 56px; border-radius: 8px; object-fit: cover;
        flex-shrink: 0; background: var(--kyn-bg-input);
      }
      #kyn-link-preview-card .kyn-preview-text { flex: 1; min-width: 0; }
      #kyn-link-preview-card .kyn-preview-title {
        font-size: 12px; font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #kyn-link-preview-card .kyn-preview-desc {
        font-size: 11px; color: var(--kyn-text-muted);
        display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden;
        margin-top: 2px;
      }
      #kyn-link-preview-card .kyn-preview-site {
        font-size: 10px; color: var(--accent-color); margin-top: 2px;
      }
      #kyn-link-preview-card .kyn-preview-dismiss {
        position: absolute; top: 6px; right: 8px;
        background: none; border: none; color: var(--kyn-text-muted);
        font-size: 14px; cursor: pointer; line-height: 1; padding: 2px;
      }
      /* In-message link preview card */
      .kyn-msg-link-preview {
        border-left: 3px solid var(--accent-color);
        padding: 8px 10px; margin-top: 6px; border-radius: 0 8px 8px 0;
        background: var(--kyn-bg-panel);
        max-width: 280px;
      }
      .kyn-msg-link-preview img {
        width: 100%; border-radius: 6px; object-fit: cover; max-height: 140px; margin-bottom: 6px;
      }
      .kyn-msg-link-preview .kyn-mlp-title {
        font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px;
      }
      .kyn-msg-link-preview .kyn-mlp-desc {
        font-size: 11px; color: var(--kyn-text-muted);
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .kyn-msg-link-preview .kyn-mlp-site {
        font-size: 10px; color: var(--accent-color); margin-top: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Extract first URL from text ───────────────────────────────────────────
  function _extractUrl(text) {
    const matches = text.match(URL_REGEX);
    return matches ? matches[0] : null;
  }

  // ── Fetch preview from backend ────────────────────────────────────────────
  async function _fetchPreview(url) {
    const apiBase = window.API_BASE_URL || window.BACKEND_URL || '';
    const token   = window.authToken || sessionStorage.getItem('kynecta_auth_token')
                 || localStorage.getItem('kynecta_auth_token') || localStorage.getItem('authToken') || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const resp = await fetch(`${apiBase}/api/messaging/preview?url=${encodeURIComponent(url)}`, {
        headers,
        credentials: 'include',
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.status === 'success' ? data.data : null;
    } catch (_) { return null; }
  }

  // ── Render preview card above input area ─────────────────────────────────
  function _renderPreviewCard(preview, container) {
    let card = document.getElementById('kyn-link-preview-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'kyn-link-preview-card';
      container.parentNode.insertBefore(card, container);
    }

    card.innerHTML = `
      ${preview.imageUrl ? `<img class="kyn-preview-img" src="${preview.imageUrl}" alt="" onerror="this.style.display='none'">` : ''}
      <div class="kyn-preview-text">
        ${preview.title    ? `<div class="kyn-preview-title">${preview.title}</div>` : ''}
        ${preview.description ? `<div class="kyn-preview-desc">${preview.description}</div>` : ''}
        ${preview.siteName ? `<div class="kyn-preview-site">${preview.siteName}</div>` : ''}
      </div>
      <button class="kyn-preview-dismiss" title="Dismiss preview">✕</button>
    `;

    card.querySelector('.kyn-preview-dismiss').onclick = () => {
      _previewDismissed = true;
      _currentPreview   = null;
      card.remove();
    };

    card.style.display = 'flex';
    _currentPreview = preview;
  }

  function _removePreviewCard() {
    const card = document.getElementById('kyn-link-preview-card');
    if (card) card.remove();
    _currentPreview = null;
  }

  // ── Watch message input ───────────────────────────────────────────────────
  function _watchInput(inputEl, containerEl) {
    inputEl.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      const text = inputEl.value || inputEl.textContent || '';
      const url  = _extractUrl(text);

      if (!url) {
        _removePreviewCard();
        _previewDismissed = false;
        _lastUrl = null;
        return;
      }
      if (url === _lastUrl || _previewDismissed) return;

      _debounceTimer = setTimeout(async () => {
        const preview = await _fetchPreview(url);
        if (!preview || !preview.title) return;
        _lastUrl = url;
        _renderPreviewCard(preview, containerEl || inputEl.parentElement);
      }, DEBOUNCE_MS);
    });
  }

  // ── Get current preview metadata to attach to outgoing message ───────────
  function getPreviewForMessage() {
    return _currentPreview ? { ..._currentPreview } : null;
  }

  // ── Clear after send ──────────────────────────────────────────────────────
  function clearAfterSend() {
    _removePreviewCard();
    _previewDismissed = false;
    _lastUrl = null;
    _currentPreview = null;
  }

  // ── Render link preview inside a received message bubble ─────────────────
  function renderInMessagePreview(preview) {
    if (!preview || !preview.title) return '';
    const imgHtml = preview.imageUrl
      ? `<img src="${preview.imageUrl}" alt="" onerror="this.style.display='none'">`
      : '';
    return `
      <div class="kyn-msg-link-preview">
        ${imgHtml}
        <div class="kyn-mlp-title">${preview.title || ''}</div>
        ${preview.description ? `<div class="kyn-mlp-desc">${preview.description}</div>` : ''}
        ${preview.siteName ? `<div class="kyn-mlp-site">${preview.siteName}</div>` : ''}
      </div>
    `;
  }

  // ── Auto-attach to message input when DOM is ready ───────────────────────
  function _autoAttach() {
    _injectStyles();
    const selectors = ['#messageInput', '#msgInput', '[data-message-input]', '.message-input', 'textarea.chat-input'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        _watchInput(el, el.closest('form') || el.parentElement);
        console.log('[LinkPreview] ✅ Attached to', sel);
        return;
      }
    }
    // Retry once after 2s for dynamically loaded inputs
    setTimeout(_autoAttach.bind(null, true), 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoAttach);
  } else {
    _autoAttach();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.KynectaLinkPreview = {
    watchInput:             _watchInput,
    getPreviewForMessage,
    clearAfterSend,
    renderInMessagePreview,
    fetchPreview:           _fetchPreview,
  };

  console.log('[KynectaLinkPreview] ✅ Loaded');

})(window);
