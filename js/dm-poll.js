/**
 * dm-poll.js — Poll messages in 1:1 DM chats for Nexopa
 *
 * Phase 1 feature: Poll messages in DMs
 *
 * - Adds a "Poll" option to the DM attachment menu (already has the button, just needs wiring)
 * - Opens a modal to create a poll (question + up to 4 options)
 * - Sends as type='poll' with metadata.poll containing the question/options
 * - Renders live-voting UI in the message bubble
 * - Votes stored via POST /api/messages/:id/poll/vote
 * - Results update via Socket.IO 'poll:vote' event
 */

(function (global) {
  'use strict';

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-dm-poll-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-dm-poll-styles';
    s.textContent = `
      /* Creation modal */
      #kynPollModal {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.6);
        z-index: 9000;
        display: flex; align-items: flex-end; justify-content: center;
      }
      #kynPollModalBox {
        background: var(--bg-primary, #141420);
        border-radius: 20px 20px 0 0;
        width: 100%; max-width: 480px;
        padding: 20px 16px 32px;
        animation: pollSlideUp 0.22s ease;
      }
      @keyframes pollSlideUp {
        from { transform: translateY(60px); opacity: 0 }
        to   { transform: translateY(0);   opacity: 1 }
      }
      #kynPollModalBox h3 {
        font-size: 15px; font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 16px; text-align: center;
      }
      .poll-modal-label {
        font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
        text-transform: uppercase;
        color: var(--text-muted, #888);
        margin: 12px 0 4px;
      }
      .poll-modal-input {
        width: 100%; box-sizing: border-box;
        background: var(--bg-secondary, #1e1e2e);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        border-radius: 10px;
        color: var(--text-primary);
        font-size: 14px;
        padding: 10px 12px;
        outline: none;
        transition: border-color 0.15s;
      }
      .poll-modal-input:focus { border-color: var(--accent, #7c3aed); }
      .poll-option-row {
        display: flex; gap: 6px; align-items: center; margin-bottom: 6px;
      }
      .poll-option-row input { flex: 1; }
      .poll-option-remove {
        background: none; border: none; color: var(--text-muted, #888);
        cursor: pointer; font-size: 16px; padding: 0 4px;
        transition: color 0.15s;
      }
      .poll-option-remove:hover { color: #ef4444; }
      #kynAddPollOption {
        background: none; border: 1px dashed var(--border-color, rgba(255,255,255,0.1));
        border-radius: 10px; color: var(--accent, #7c3aed);
        width: 100%; padding: 8px; cursor: pointer;
        font-size: 13px; margin-top: 4px;
        transition: background 0.15s;
      }
      #kynAddPollOption:hover { background: rgba(124,58,237,0.08); }
      .poll-modal-footer {
        display: flex; gap: 10px; margin-top: 20px;
      }
      .poll-modal-footer button {
        flex: 1; padding: 12px;
        border-radius: 12px; border: none;
        font-size: 14px; font-weight: 600; cursor: pointer;
        transition: opacity 0.15s;
      }
      #kynPollCancel {
        background: var(--bg-secondary, #1e1e2e);
        color: var(--text-muted, #888);
      }
      #kynPollSend {
        background: var(--accent, #7c3aed);
        color: #fff;
      }
      #kynPollSend:disabled { opacity: 0.4; cursor: not-allowed; }

      /* Poll bubble in chat */
      .poll-bubble {
        min-width: 200px; max-width: 280px;
        background: var(--bg-tertiary, #2a2a3e);
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid var(--border-color, rgba(255,255,255,0.06));
      }
      .poll-bubble-header {
        padding: 10px 12px 4px;
        font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
        text-transform: uppercase; color: var(--accent, #7c3aed);
        display: flex; align-items: center; gap: 5px;
      }
      .poll-bubble-question {
        padding: 2px 12px 10px;
        font-size: 14px; font-weight: 600;
        color: var(--text-primary);
        line-height: 1.3;
      }
      .poll-option-btn {
        width: 100%;
        background: none; border: none; border-top: 1px solid var(--border-color, rgba(255,255,255,0.06));
        padding: 0; cursor: pointer; text-align: left;
        transition: background 0.12s;
        position: relative; overflow: hidden;
      }
      .poll-option-btn:hover:not(.voted) { background: rgba(255,255,255,0.04); }
      .poll-option-btn.voted { cursor: default; }
      .poll-option-inner {
        display: flex; align-items: center;
        padding: 10px 12px;
        position: relative; z-index: 1;
      }
      .poll-option-text {
        flex: 1; font-size: 13px; color: var(--text-primary);
      }
      .poll-option-check {
        color: var(--accent, #7c3aed); font-size: 13px;
        opacity: 0; transition: opacity 0.15s;
      }
      .poll-option-btn.my-vote .poll-option-check { opacity: 1; }
      .poll-option-pct {
        font-size: 11px; color: var(--text-muted, #888);
        min-width: 28px; text-align: right;
      }
      .poll-option-bar {
        position: absolute;
        left: 0; top: 0; bottom: 0;
        background: rgba(124,58,237,0.15);
        transition: width 0.4s ease;
        z-index: 0;
      }
      .poll-option-btn.my-vote .poll-option-bar { background: rgba(124,58,237,0.25); }
      .poll-bubble-footer {
        padding: 6px 12px 10px;
        font-size: 11px; color: var(--text-muted, #777);
        border-top: 1px solid var(--border-color, rgba(255,255,255,0.04));
        display: flex; gap: 8px; align-items: center;
      }
      .poll-closed-badge {
        display: inline-block;
        background: rgba(239,68,68,0.15); color: #ef4444;
        font-size: 9px; font-weight: 700; letter-spacing: 0.5px;
        text-transform: uppercase;
        padding: 1px 6px; border-radius: 4px;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Modal builder ───────────────────────────────────────────────────────────
  let _optionCount = 2;

  function _buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'kynPollModal';

    overlay.innerHTML = `
      <div id="kynPollModalBox">
        <h3>📊 Create Poll</h3>

        <div class="poll-modal-label">Question</div>
        <input id="kynPollQuestion" class="poll-modal-input" type="text"
               placeholder="Ask something…" maxlength="200" />

        <div class="poll-modal-label">Options</div>
        <div id="kynPollOptions">
          <div class="poll-option-row">
            <input class="poll-modal-input poll-opt" type="text" placeholder="Option 1" maxlength="80" />
          </div>
          <div class="poll-option-row">
            <input class="poll-modal-input poll-opt" type="text" placeholder="Option 2" maxlength="80" />
          </div>
        </div>

        <button id="kynAddPollOption">+ Add option</button>

        <div class="poll-modal-footer">
          <button id="kynPollCancel">Cancel</button>
          <button id="kynPollSend" disabled>Send Poll</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    _optionCount = 2;

    const question   = overlay.querySelector('#kynPollQuestion');
    const optContainer = overlay.querySelector('#kynPollOptions');
    const addBtn     = overlay.querySelector('#kynAddPollOption');
    const cancelBtn  = overlay.querySelector('#kynPollCancel');
    const sendBtn    = overlay.querySelector('#kynPollSend');

    function _validate() {
      const q = question.value.trim();
      const opts = Array.from(overlay.querySelectorAll('.poll-opt'))
                        .map(i => i.value.trim()).filter(Boolean);
      sendBtn.disabled = !(q && opts.length >= 2);
    }

    question.addEventListener('input', _validate);
    optContainer.addEventListener('input', _validate);

    addBtn.addEventListener('click', () => {
      if (_optionCount >= 4) return;
      _optionCount++;
      const row = document.createElement('div');
      row.className = 'poll-option-row';
      row.innerHTML = `
        <input class="poll-modal-input poll-opt" type="text" placeholder="Option ${_optionCount}" maxlength="80" />
        <button class="poll-option-remove" title="Remove">×</button>
      `;
      row.querySelector('.poll-option-remove').addEventListener('click', () => {
        row.remove(); _optionCount--; _validate();
        if (_optionCount < 4) addBtn.style.display = '';
      });
      optContainer.appendChild(row);
      if (_optionCount >= 4) addBtn.style.display = 'none';
      _validate();
    });

    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    sendBtn.addEventListener('click', () => {
      const q    = question.value.trim();
      const opts = Array.from(overlay.querySelectorAll('.poll-opt'))
                        .map(i => i.value.trim()).filter(Boolean);
      if (!q || opts.length < 2) return;
      overlay.remove();
      _sendPoll(q, opts);
    });

    setTimeout(() => question.focus(), 100);
  }

  // ── Send poll message ───────────────────────────────────────────────────────
  function _sendPoll(question, options) {
    const pollData = {
      question,
      options: options.map((text, idx) => ({ id: idx, text, votes: [] })),
      totalVotes: 0,
      closed: false,
      createdAt: Date.now(),
    };

    window.dispatchEvent(new CustomEvent('kyn:sendMessage', {
      detail: {
        type: 'poll',
        content: question,
        metadata: { poll: pollData },
      }
    }));
  }

  // ── Render poll bubble ─────────────────────────────────────────────────────
  function renderPollBubble(message, currentUserId) {
    const meta = message.metadata || {};
    const poll = meta.poll || {};
    const opts = poll.options || [];
    const total = opts.reduce((s, o) => s + (o.votes?.length || 0), 0);
    const myVote = opts.find(o => o.votes?.includes(String(currentUserId)));
    const msgId = message.id || message.messageId;
    const hasVoted = !!myVote;

    const optionHtml = opts.map(opt => {
      const voteCount = opt.votes?.length || 0;
      const pct = total > 0 ? Math.round((voteCount / total) * 100) : 0;
      const isMyVote = myVote?.id === opt.id;
      const voteAction = (!hasVoted && !poll.closed)
        ? `onclick="window.kynDmPoll?.vote('${msgId}', ${opt.id}, this)"`
        : '';
      return `
        <button class="poll-option-btn ${hasVoted ? 'voted' : ''} ${isMyVote ? 'my-vote' : ''}"
                ${voteAction}>
          <div class="poll-option-bar" style="width:${pct}%"></div>
          <div class="poll-option-inner">
            <span class="poll-option-text">${_esc(opt.text)}</span>
            <i class="fas fa-check poll-option-check"></i>
            ${hasVoted ? `<span class="poll-option-pct">${pct}%</span>` : ''}
          </div>
        </button>
      `;
    }).join('');

    return `
      <div class="poll-bubble" data-poll-msg-id="${msgId}">
        <div class="poll-bubble-header">
          <i class="fas fa-poll"></i> Poll
          ${poll.closed ? '<span class="poll-closed-badge">Closed</span>' : ''}
        </div>
        <div class="poll-bubble-question">${_esc(poll.question)}</div>
        ${optionHtml}
        <div class="poll-bubble-footer">
          <i class="fas fa-users"></i> ${total} vote${total !== 1 ? 's' : ''}
          ${poll.closed ? '' : (hasVoted ? ' · Tap to see results' : ' · Tap to vote')}
        </div>
      </div>
    `;
  }

  // ── Vote handler ───────────────────────────────────────────────────────────
  async function vote(messageId, optionId, el) {
    const apiBase = global.API_BASE_URL || '';
    const token   = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    try {
      const res = await fetch(`${apiBase}/api/messages/${messageId}/poll/vote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      });
      const data = await res.json();
      if (data.success && data.poll) {
        // Re-render the poll bubble with updated data
        const bubble = document.querySelector(`[data-poll-msg-id="${messageId}"]`);
        if (bubble) {
          const currentUserId = (global.MessagesCore || global.messagesCore)?.getCurrentUserId?.() ||
                                parseInt(localStorage.getItem('userId') || '0');
          const fakeMsg = { id: messageId, metadata: { poll: data.poll } };
          const newHtml = renderPollBubble(fakeMsg, currentUserId);
          bubble.outerHTML = newHtml;
        }
      }
    } catch (e) {
      console.error('[DmPoll] Vote failed:', e);
    }
  }

  // ── Wire the Poll button in attachment options ──────────────────────────────
  function _wirePollButton() {
    const pollBtn = document.querySelector('[data-type="poll"]');
    if (!pollBtn || pollBtn._kynPollWired) return;
    pollBtn._kynPollWired = true;

    pollBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close attachment panel
      const attachOpts = document.getElementById('attachmentOptions');
      if (attachOpts) attachOpts.style.display = 'none';
      _buildModal();
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Socket.IO: live vote updates ───────────────────────────────────────────
  function _listenSocket() {
    const socket = global.__socket || global.socket;
    if (!socket) { setTimeout(_listenSocket, 1500); return; }

    socket.on('poll:vote', ({ messageId, poll }) => {
      const bubble = document.querySelector(`[data-poll-msg-id="${messageId}"]`);
      if (!bubble) return;
      const currentUserId = (global.MessagesCore || global.messagesCore)?.getCurrentUserId?.() ||
                            parseInt(localStorage.getItem('userId') || '0');
      const fakeMsg = { id: messageId, metadata: { poll } };
      bubble.outerHTML = renderPollBubble(fakeMsg, currentUserId);
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    setTimeout(_wirePollButton, 400);
    setTimeout(_listenSocket, 1000);

    global.kynDmPoll = { renderPollBubble, vote, openModal: _buildModal };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

}(window));
