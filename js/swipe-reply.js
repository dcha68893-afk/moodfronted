/**
 * swipe-reply.js — Swipe-to-reply gesture for Nexopa
 *
 * Phase 1 feature: Swipe-to-reply (mobile)
 *
 * - On mobile, swipe a message bubble right → triggers the reply UI
 * - Visual feedback: bubble slides right with a reply icon appearing
 * - Snaps back with spring animation after threshold
 * - Works alongside existing long-press context menu
 * - On desktop shows a hover reply button instead
 *
 * Depends on: messages-ui.js (calls window.messagesUI.setReply)
 */

(function (global) {
  'use strict';

  const SWIPE_THRESHOLD = 72;   // px to trigger reply
  const MAX_DRAG        = 96;   // max drag distance
  const SPRING_DURATION = 220;  // ms to snap back

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-swipe-reply-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-swipe-reply-styles';
    s.textContent = `
      /* Wrapper that moves during swipe */
      .msg-swipe-wrapper {
        position: relative;
        touch-action: pan-y;
        will-change: transform;
        transition: none;
      }
      .msg-swipe-wrapper.spring-back {
        transition: transform ${SPRING_DURATION}ms cubic-bezier(0.25, 1.5, 0.5, 1);
        transform: translateX(0) !important;
      }

      /* Reply icon that fades in behind the bubble */
      .msg-reply-hint {
        position: absolute;
        left: -44px;
        top: 50%;
        transform: translateY(-50%) scale(0.5);
        width: 32px; height: 32px;
        background: var(--accent, #7c3aed);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 14px;
        opacity: 0;
        transition: opacity 0.12s, transform 0.12s;
        pointer-events: none;
      }
      .msg-swipe-wrapper.swiping .msg-reply-hint {
        opacity: 1;
        transform: translateY(-50%) scale(1);
      }
      .msg-swipe-wrapper.triggered .msg-reply-hint {
        background: #22c55e; /* green = activated */
      }

      /* Desktop: hover reply button */
      .message-wrapper:not(.touch-device) .msg-hover-reply {
        position: absolute;
        right: -36px; top: 50%;
        transform: translateY(-50%);
        background: var(--bg-secondary, #1e1e2e);
        border: 1px solid var(--border-color, rgba(255,255,255,0.1));
        border-radius: 50%;
        width: 28px; height: 28px;
        display: none; align-items: center; justify-content: center;
        cursor: pointer;
        color: var(--text-muted, #888);
        font-size: 12px;
        transition: color 0.15s, background 0.15s;
        z-index: 10;
      }
      .message-wrapper:not(.touch-device):hover .msg-hover-reply {
        display: flex;
      }
      .msg-hover-reply:hover {
        color: var(--accent, #7c3aed) !important;
        background: var(--bg-tertiary, #2a2a3e) !important;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Detect touch device ────────────────────────────────────────────────────
  const _isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // ── Trigger reply ──────────────────────────────────────────────────────────
  function _triggerReply(message) {
    // Vibrate briefly on mobile
    if (navigator.vibrate) navigator.vibrate(30);

    // Use existing reply UI in messages-ui.js
    if (global.messagesUI?.setReply) {
      global.messagesUI.setReply(message);
    } else if (global.messagesUI?.handleReply) {
      global.messagesUI.handleReply(message);
    } else {
      // Fallback — fire the same custom event the action menu uses
      window.dispatchEvent(new CustomEvent('kyn:replyToMessage', { detail: { message } }));
    }
  }

  // ── Attach swipe to a message wrapper element ──────────────────────────────
  function _attachSwipe(wrapper, message) {
    if (wrapper._kynSwipe) return;
    wrapper._kynSwipe = true;

    // -- Desktop: add hover reply button ────────────────────────────────────
    if (!_isTouch) {
      wrapper.classList.remove('touch-device');
      const hoverBtn = document.createElement('button');
      hoverBtn.className = 'msg-hover-reply';
      hoverBtn.title = 'Reply';
      hoverBtn.innerHTML = '<i class="fas fa-reply"></i>';
      hoverBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _triggerReply(message);
      });
      wrapper.style.position = 'relative';
      wrapper.appendChild(hoverBtn);
      return;
    }

    // -- Mobile: swipe gesture ───────────────────────────────────────────────
    wrapper.classList.add('touch-device');

    // Wrap bubble in a swipe-wrapper div
    const bubble = wrapper.querySelector('.message-bubble');
    if (!bubble) return;

    const swipeWrap = document.createElement('div');
    swipeWrap.className = 'msg-swipe-wrapper';

    const replyHint = document.createElement('div');
    replyHint.className = 'msg-reply-hint';
    replyHint.innerHTML = '<i class="fas fa-reply"></i>';
    swipeWrap.appendChild(replyHint);

    bubble.parentNode.insertBefore(swipeWrap, bubble);
    swipeWrap.appendChild(bubble);

    let startX = 0, startY = 0, dx = 0;
    let tracking = false, triggered = false;

    swipeWrap.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      startX = t.clientX;
      startY = t.clientY;
      dx = 0;
      tracking = false;
      triggered = false;
      swipeWrap.classList.remove('spring-back', 'triggered');
    }, { passive: true });

    swipeWrap.addEventListener('touchmove', (e) => {
      const t = e.changedTouches[0];
      const newDx = t.clientX - startX;
      const newDy = t.clientY - startY;

      // Only track rightward horizontal swipes
      if (!tracking) {
        if (Math.abs(newDy) > Math.abs(newDx) + 5) return; // vertical scroll
        if (newDx > 8) tracking = true;
        else return;
      }

      dx = Math.min(newDx, MAX_DRAG);
      if (dx < 0) { dx = 0; return; }

      // Rubber-band effect past threshold
      const effective = dx < SWIPE_THRESHOLD
        ? dx
        : SWIPE_THRESHOLD + (dx - SWIPE_THRESHOLD) * 0.2;

      swipeWrap.style.transform = `translateX(${effective}px)`;
      swipeWrap.classList.add('swiping');

      if (dx >= SWIPE_THRESHOLD && !triggered) {
        triggered = true;
        swipeWrap.classList.add('triggered');
        if (navigator.vibrate) navigator.vibrate(20);
      }
    }, { passive: true });

    swipeWrap.addEventListener('touchend', () => {
      swipeWrap.classList.remove('swiping', 'triggered');
      swipeWrap.classList.add('spring-back');
      swipeWrap.style.transform = 'translateX(0)';
      tracking = false;

      if (triggered) {
        _triggerReply(message);
        triggered = false;
      }
    });
  }

  // ── Observe message list for new messages ──────────────────────────────────
  function _observeMessages() {
    const container = document.getElementById('messagesContainer') ||
                      document.getElementById('messagesList') ||
                      document.querySelector('.messages-container');
    if (!container) return;

    function _processNodes(nodes) {
      nodes.forEach(node => {
        if (node.nodeType !== 1) return;
        const wrappers = node.classList?.contains('message-wrapper')
          ? [node]
          : Array.from(node.querySelectorAll('.message-wrapper'));
        wrappers.forEach(w => {
          // Parse the message data from onclick attribute
          const bubble = w.querySelector('.message-bubble');
          if (!bubble) return;
          const onclick = bubble.getAttribute('onclick') || '';
          const match = onclick.match(/showMessageActions\(({.*?})/);
          let message = {};
          if (match) {
            try { message = JSON.parse(match[1].replace(/&quot;/g, '"')); } catch (_) {}
          }
          _attachSwipe(w, message);
        });
      });
    }

    // Process existing messages
    _processNodes([container]);

    // Watch for new messages
    const obs = new MutationObserver(mutations => {
      mutations.forEach(m => _processNodes(Array.from(m.addedNodes)));
    });
    obs.observe(container, { childList: true, subtree: true });
  }

  // ── Listen for kyn:replyToMessage events ───────────────────────────────────
  window.addEventListener('kyn:replyToMessage', (e) => {
    const message = e.detail?.message;
    if (!message) return;

    // Fill the reply indicator in the input bar
    const indicator = document.getElementById('replyIndicator');
    const replyText = document.getElementById('replyToText');
    const cancelBtn = document.getElementById('cancelReplyBtn');
    if (indicator && replyText) {
      const preview = (message.content || '').substring(0, 60);
      replyText.textContent = preview || '📎 Media';
      indicator.style.display = 'flex';
      global.replyToMessage = message;
    }
    if (cancelBtn && !cancelBtn._kynPatch) {
      cancelBtn._kynPatch = true;
      cancelBtn.addEventListener('click', () => {
        if (indicator) indicator.style.display = 'none';
        global.replyToMessage = null;
      });
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    // Wait for messages to render
    setTimeout(_observeMessages, 500);
    // Re-observe after navigation
    window.addEventListener('kyn:chatLoaded', () => setTimeout(_observeMessages, 300));
    window.addEventListener('renderMessages', () => setTimeout(_observeMessages, 100));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 400);
  }

}(window));
