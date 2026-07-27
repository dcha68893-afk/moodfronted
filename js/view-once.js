/**
 * view-once.js — View-once photo/video for Nexopa
 *
 * Phase 1 feature: View Once
 *
 * - Adds a "View once" toggle in the attachment preview UI
 * - Sets metadata.viewOnce = true on outgoing image/video messages
 * - On the receiver side: shows a sealed envelope icon instead of the media
 * - After the recipient taps to open, marks it viewed via POST /api/messages/:id/viewed
 * - Backend then clears the media URL from the message record
 * - Viewed messages show "Opened" state permanently
 *
 * Depends on: messages-core.js, messages-ui.js
 */

(function (global) {
  'use strict';

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-view-once-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-view-once-styles';
    s.textContent = `
      /* Toggle in attachment preview toolbar */
      #kynViewOnceToggle {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        color: var(--kyn-text-muted);
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 20px;
        border: 1px solid var(--border-color, rgba(255,255,255,0.1));
        background: var(--kyn-bg-input);
        margin: 4px 0;
        user-select: none;
        transition: color 0.15s, border-color 0.15s;
      }
      #kynViewOnceToggle.active {
        color: var(--kyn-accent-primary);
        border-color: var(--kyn-accent-primary);
      }
      #kynViewOnceToggle i { font-size: 11px; }

      /* Sealed bubble (receiver hasn't opened yet) */
      .view-once-sealed {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: var(--kyn-bg-input);
        border-radius: 12px;
        cursor: pointer;
        border: 1px dashed var(--kyn-accent-primary);
        color: var(--text-primary);
        font-size: 13px;
        transition: background 0.15s;
      }
      .view-once-sealed:hover { background: var(--kyn-bg-hover); }
      .view-once-sealed .vo-icon { font-size: 22px; }
      .view-once-sealed .vo-label { display: flex; flex-direction: column; }
      .view-once-sealed .vo-label strong { font-size: 13px; }
      .view-once-sealed .vo-label small { font-size: 10px; color: var(--kyn-text-muted); }

      /* Opened state */
      .view-once-opened {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: var(--kyn-bg-input);
        border-radius: 12px;
        color: var(--kyn-text-muted);
        font-size: 12px;
        border: 1px solid var(--border-color, rgba(255,255,255,0.06));
      }

      /* Sender side — shows "Seen" or countdown */
      .view-once-sent-state {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--kyn-text-muted);
        padding: 6px 10px;
        border-radius: 10px;
        background: var(--kyn-bg-input);
        border: 1px dashed var(--border-color, rgba(255,255,255,0.08));
      }
      .view-once-sent-state.viewed { color: var(--kyn-accent-primary); }

      /* Fullscreen view overlay */
      #kynViewOnceOverlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.95);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        animation: voFadeIn 0.2s ease;
      }
      @keyframes voFadeIn { from { opacity:0 } to { opacity:1 } }
      #kynViewOnceOverlay .vo-media { max-width: 90vw; max-height: 80vh; border-radius: 12px; }
      #kynViewOnceOverlay .vo-close-btn {
        position: absolute;
        top: 20px; right: 20px;
        background: rgba(255,255,255,0.15);
        border: none; color: #fff;
        width: 36px; height: 36px; border-radius: 50%;
        font-size: 16px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      #kynViewOnceOverlay .vo-warning {
        position: absolute;
        bottom: 30px;
        background: rgba(255,255,255,0.1);
        color: #fff;
        font-size: 12px;
        padding: 8px 16px;
        border-radius: 20px;
      }
    `;
    document.head.appendChild(s);
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let _viewOnceActive = false;

  // ── Toggle in attachment preview ───────────────────────────────────────────
  function _injectToggle() {
    // Only inject when attachment preview is shown
    const preview = document.getElementById('attachmentPreview');
    if (!preview || document.getElementById('kynViewOnceToggle')) return;

    const toggle = document.createElement('div');
    toggle.id = 'kynViewOnceToggle';
    toggle.innerHTML = '<i class="fas fa-eye-slash"></i> View once';
    toggle.title = 'Recipient can only view this once';

    toggle.addEventListener('click', () => {
      _viewOnceActive = !_viewOnceActive;
      toggle.classList.toggle('active', _viewOnceActive);
      toggle.innerHTML = _viewOnceActive
        ? '<i class="fas fa-eye-slash"></i> View once <i class="fas fa-check" style="color:var(--kyn-accent-primary)"></i>'
        : '<i class="fas fa-eye-slash"></i> View once';
    });

    preview.parentNode.insertBefore(toggle, preview.nextSibling);
  }

  // Watch for attachment preview becoming visible
  function _observeAttachmentPreview() {
    const preview = document.getElementById('attachmentPreview');
    if (!preview) return;

    const obs = new MutationObserver(() => {
      if (preview.style.display !== 'none' && preview.children.length > 0) {
        // Check it's an image or video
        const hasMedia = preview.querySelector('img, video');
        if (hasMedia) {
          setTimeout(_injectToggle, 50);
        }
      } else {
        // Preview hidden — reset toggle
        _viewOnceActive = false;
        const toggle = document.getElementById('kynViewOnceToggle');
        if (toggle) toggle.remove();
      }
    });
    obs.observe(preview, { attributes: true, childList: true, subtree: true });
  }

  // ── Intercept outgoing messages ────────────────────────────────────────────
  function _patchSendMessage() {
    // Hook into the send button to inject viewOnce metadata
    const sendBtn = document.getElementById('sendBtn') || document.getElementById('messageSendBtn');
    if (!sendBtn || sendBtn._viewOncePatch) return;
    sendBtn._viewOncePatch = true;

    const original = sendBtn.onclick;
    sendBtn.addEventListener('click', () => {
      if (!_viewOnceActive) return;

      // Inject into pending metadata — messages-core reads window.__pendingMsgMeta
      global.__pendingMsgMeta = global.__pendingMsgMeta || {};
      global.__pendingMsgMeta.viewOnce = true;
      global.__pendingMsgMeta.viewOnceType = 'image'; // or video

      // Reset after send
      setTimeout(() => {
        if (global.__pendingMsgMeta) delete global.__pendingMsgMeta.viewOnce;
        _viewOnceActive = false;
        const toggle = document.getElementById('kynViewOnceToggle');
        if (toggle) toggle.remove();
      }, 500);
    }, true); // capture phase — fires before core send
  }

  // ── Render functions (called by messages-ui renderer) ─────────────────────
  function renderViewOnceBubble(message, isSent) {
    const meta    = message.metadata || {};
    const opened  = meta.viewOnceOpened === true;
    const mediaType = meta.viewOnceType || (message.type === 'video' ? 'video' : 'photo');

    if (isSent) {
      // Sender sees blurred state with "Seen" indicator
      return `
        <div class="view-once-sent-state ${opened ? 'viewed' : ''}">
          <i class="fas fa-${mediaType === 'video' ? 'video' : 'camera'}"></i>
          ${opened
            ? '<span>Opened</span>'
            : `<span>${mediaType === 'video' ? 'Video' : 'Photo'} • View once</span>`
          }
        </div>
      `;
    }

    if (opened) {
      return `
        <div class="view-once-opened">
          <i class="fas fa-eye-slash"></i>
          <span>Opened</span>
        </div>
      `;
    }

    // Receiver sees the sealed envelope
    const msgId = message.id || message.messageId;
    return `
      <div class="view-once-sealed" onclick="window.kynViewOnce?.openMedia('${msgId}', this)">
        <span class="vo-icon">📷</span>
        <div class="vo-label">
          <strong>${mediaType === 'video' ? 'Video' : 'Photo'}</strong>
          <small>Tap to view once</small>
        </div>
        <i class="fas fa-chevron-right" style="margin-left:auto;color:var(--kyn-text-muted)"></i>
      </div>
    `;
  }

  // ── Open media overlay (receiver taps sealed envelope) ─────────────────────
  async function openMedia(messageId, el) {
    // 1. Fetch the real media URL from backend
    let mediaUrl, mediaType;
    try {
      const apiBase = global.API_BASE_URL || '';
      const token   = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
      const res = await fetch(`${apiBase}/api/messages/${messageId}/view-once`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Not available');
      mediaUrl  = data.url;
      mediaType = data.mediaType || 'image';
    } catch (err) {
      alert('This media is no longer available.');
      return;
    }

    // 2. Show fullscreen overlay
    const overlay = document.createElement('div');
    overlay.id = 'kynViewOnceOverlay';

    const media = mediaType === 'video'
      ? Object.assign(document.createElement('video'), {
          src: mediaUrl, autoplay: true, controls: false,
          loop: false, className: 'vo-media', playsInline: true
        })
      : Object.assign(document.createElement('img'), {
          src: mediaUrl, className: 'vo-media', alt: 'View once'
        });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'vo-close-btn';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';

    const warning = document.createElement('div');
    warning.className = 'vo-warning';
    warning.textContent = 'You can only view this once';

    overlay.append(media, closeBtn, warning);
    document.body.appendChild(overlay);

    function _destroy() {
      overlay.remove();
      if (el) {
        el.outerHTML = `<div class="view-once-opened"><i class="fas fa-eye-slash"></i> <span>Opened</span></div>`;
      }
    }

    closeBtn.addEventListener('click', _destroy);

    // Auto-close after video ends
    if (mediaType === 'video') {
      media.addEventListener('ended', _destroy);
    }

    // Close on overlay background tap
    overlay.addEventListener('click', (e) => { if (e.target === overlay) _destroy(); });
  }

  // ── Backend route stub ─────────────────────────────────────────────────────
  // The actual route is added to messages.js (see patch below).
  // POST /api/messages/:id/view-once  — returns { success, url, mediaType }
  // then sets metadata.viewOnceOpened = true and clears the attachment URL

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    _observeAttachmentPreview();
    setTimeout(_patchSendMessage, 500);

    global.kynViewOnce = { renderViewOnceBubble, openMedia };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

}(window));
