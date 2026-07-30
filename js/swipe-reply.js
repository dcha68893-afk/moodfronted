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
        background: var(--kyn-accent-primary);
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
        background: var(--kyn-bg-panel);
        border: 1px solid var(--border-color, rgba(255,255,255,0.1));
        border-radius: 50%;
        width: 28px; height: 28px;
        display: none; align-items: center; justify-content: center;
        cursor: pointer;
        color: var(--kyn-text-muted);
        font-size: 12px;
        transition: color 0.15s, background 0.15s;
        z-index: 10;
      }
      .message-wrapper:not(.touch-device):hover .msg-hover-reply {
        display: flex;
      }
      .msg-hover-reply:hover {
        color: var(--kyn-accent-primary) !important;
        background: var(--kyn-bg-input) !important;
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

    // FIX (stuck blue "reply" circle at the bottom of the chat / overlapping
    // the input box): .msg-reply-hint only ever got reset inside the
    // touchend handler below. touchend does NOT fire in several ordinary
    // situations — the finger drags off the edge of the bubble/container,
    // the OS interrupts the gesture (incoming call, notification shade,
    // app-switch), or messagesContainer re-renders (new message arrives,
    // conversation reloads) while a finger is still down, tearing down this
    // exact element mid-gesture. Whenever that happens the swipeWrap is left
    // with the 'swiping' (and sometimes 'triggered') class permanently
    // applied, so its .msg-reply-hint (a 32px circle with a fa-reply icon
    // that reads as a back-arrow) stays visibly faded in — typically on the
    // LAST message right above the input box, exactly where it was reported.
    // _reset() is now the one place that clears swipe state, called from
    // every path that can end a gesture (touchend, touchcancel, and
    // document-level safety nets that catch a gesture interrupted by
    // something other than a normal touch event ending on this element).
    const _reset = () => {
      swipeWrap.classList.remove('swiping', 'triggered');
      swipeWrap.classList.add('spring-back');
      swipeWrap.style.transform = 'translateX(0)';
      tracking = false;
      dx = 0;
    };

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
      const wasTriggered = triggered;
      triggered = false;
      _reset();
      if (wasTriggered) {
        _triggerReply(message);
      }
    });

    // FIX: touchcancel is fired by the browser itself when a gesture is
    // interrupted (system UI taking over, palm-rejection, scroll hijack,
    // etc.) — it never fires touchend, so without this listener _reset()
    // never ran for that interruption. Never treat a cancelled gesture as a
    // completed reply.
    swipeWrap.addEventListener('touchcancel', () => {
      triggered = false;
      _reset();
    });

    // Track this wrapper's reset function so the document-level safety nets
    // below can force-clear it even if this element's own listeners never
    // fire again (e.g. it was mid-gesture when the container re-rendered
    // and this exact node was replaced).
    if (!global.__kynSwipeResets) global.__kynSwipeResets = new Set();
    global.__kynSwipeResets.add(_reset);
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
      // FIX (stuck blue reply-hint circle, continued): if this render pass
      // removed any nodes (list re-render, chat switch, history reload)
      // while a finger was mid-swipe on one of them, that wrapper's own
      // touchend/touchcancel never gets a chance to fire. Force every
      // tracked wrapper back to rest before processing the new content.
      if (mutations.some(m => m.removedNodes && m.removedNodes.length > 0) && global.__kynSwipeResets) {
        global.__kynSwipeResets.forEach(fn => { try { fn(); } catch (_) {} });
      }
      mutations.forEach(m => _processNodes(Array.from(m.addedNodes)));
    });
    obs.observe(container, { childList: true, subtree: true });
  }

  // FIX (stuck blue reply-hint circle, continued): a wrapper can be
  // mid-gesture when messagesContainer re-renders (a new message arrives,
  // the conversation switches, history reloads) — the old swipeWrap node is
  // discarded along with its listeners, but the browser never gets a chance
  // to fire touchend/touchcancel on it first, so its own two fixes above
  // never run. These document-level nets force every tracked wrapper back
  // to rest whenever something app-wide signals the gesture can no longer
  // be legitimately in progress, independent of whether that wrapper's own
  // events ever fire again.
  function _forceResetAllSwipes() {
    if (!global.__kynSwipeResets) return;
    global.__kynSwipeResets.forEach(fn => { try { fn(); } catch (_) {} });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) _forceResetAllSwipes();
  });
  window.addEventListener('blur', _forceResetAllSwipes);
  window.addEventListener('pagehide', _forceResetAllSwipes);

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
