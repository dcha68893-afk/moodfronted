/**
 * gif-picker.js — Tenor GIF search for Nexopa
 *
 * Phase 1 feature: GIF Search (Tenor/Giphy)
 *
 * - Adds a GIF button next to the emoji button in the message input
 * - Opens an in-chat GIF picker with search + trending
 * - Sends GIF as a message with type='gif' and metadata.gifUrl
 * - Renders received GIFs as looping images in message bubbles
 *
 * Usage: <script src="js/gif-picker.js" defer></script>
 *
 * Tenor API key: uses window.TENOR_API_KEY if set, otherwise the public
 * demo key (rate-limited, fine for dev/small scale).
 * Set window.TENOR_API_KEY = "YOUR_KEY" in your HTML before this script.
 */

(function (global) {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  const TENOR_KEY    = global.TENOR_API_KEY || 'AIzaSyAyimkuYQYF_FXVALexPzfL7eomIcLW2jY'; // public demo key
  const TENOR_BASE   = 'https://tenor.googleapis.com/v2';
  const CLIENT_KEY   = 'nexopa';
  const PAGE_LIMIT   = 20;

  // ── State ──────────────────────────────────────────────────────────────────
  let _open          = false;
  let _searchTimer   = null;
  let _lastQuery     = '';
  let _nextPos       = '';
  let _loading       = false;

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-gif-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-gif-styles';
    s.textContent = `
      #kynGifBtn {
        background: none; border: none; cursor: pointer;
        color: var(--kyn-text-muted); font-size: 18px;
        padding: 0 6px; line-height: 1; transition: color 0.15s;
      }
      #kynGifBtn:hover { color: var(--kyn-accent-primary); }
      #kynGifBtn.active { color: var(--kyn-accent-primary); }

      #kynGifPanel {
        position: absolute;
        bottom: 60px; left: 0; right: 0;
        height: 320px;
        background: var(--kyn-bg-panel);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        border-radius: 16px 16px 0 0;
        display: flex; flex-direction: column;
        z-index: 200;
        box-shadow: 0 -4px 24px rgba(0,0,0,0.3);
        animation: gifPanelIn 0.18s ease;
      }
      @keyframes gifPanelIn {
        from { opacity:0; transform:translateY(12px) }
        to   { opacity:1; transform:translateY(0) }
      }

      #kynGifSearch {
        margin: 10px 10px 6px;
        padding: 8px 12px;
        border-radius: 20px;
        border: 1px solid var(--border-color, rgba(255,255,255,0.1));
        background: var(--kyn-bg-input);
        color: var(--text-primary);
        font-size: 13px;
        outline: none;
      }
      #kynGifSearch::placeholder { color: var(--kyn-text-muted); }

      #kynGifGrid {
        flex: 1;
        overflow-y: auto;
        padding: 4px 8px 8px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
        align-content: start;
      }
      #kynGifGrid .gif-cell {
        aspect-ratio: 1;
        overflow: hidden;
        border-radius: 8px;
        cursor: pointer;
        background: var(--kyn-bg-input);
        transition: transform 0.1s, opacity 0.1s;
      }
      #kynGifGrid .gif-cell:hover { transform: scale(0.96); opacity: 0.85; }
      #kynGifGrid .gif-cell img {
        width: 100%; height: 100%; object-fit: cover; display: block;
      }
      #kynGifGrid .gif-empty {
        grid-column: 1/-1;
        text-align: center;
        color: var(--kyn-text-muted);
        font-size: 13px;
        padding: 40px 0;
      }
      #kynGifGrid .gif-spinner {
        grid-column: 1/-1;
        text-align: center;
        padding: 24px 0;
        color: var(--kyn-text-muted);
        font-size: 20px;
      }

      /* Rendered GIF in chat bubble */
      .msg-gif-container {
        display: block;
        max-width: 240px;
        border-radius: 10px;
        overflow: hidden;
        cursor: pointer;
        position: relative;
      }
      .msg-gif-container img {
        width: 100%; display: block; border-radius: 10px;
      }
      .msg-gif-badge {
        position: absolute; bottom: 4px; left: 4px;
        background: rgba(0,0,0,0.55); color: #fff;
        font-size: 9px; font-weight: 700; letter-spacing: 0.5px;
        padding: 1px 5px; border-radius: 4px;
      }
      .msg-gif-powered {
        font-size: 9px; color: var(--kyn-text-muted);
        text-align: right; padding: 1px 4px;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Tenor API ───────────────────────────────────────────────────────────────
  async function _fetchGifs(query, pos = '') {
    const endpoint = query
      ? `${TENOR_BASE}/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&client_key=${CLIENT_KEY}&limit=${PAGE_LIMIT}&pos=${pos}&media_filter=gif,tinygif`
      : `${TENOR_BASE}/featured?key=${TENOR_KEY}&client_key=${CLIENT_KEY}&limit=${PAGE_LIMIT}&pos=${pos}&media_filter=gif,tinygif`;
    const res  = await fetch(endpoint);
    const data = await res.json();
    return { results: data.results || [], next: data.next || '' };
  }

  // ── Grid render ─────────────────────────────────────────────────────────────
  function _renderResults(results, append = false) {
    const grid = document.getElementById('kynGifGrid');
    if (!grid) return;

    if (!append) grid.innerHTML = '';

    if (!results.length && !append) {
      grid.innerHTML = '<div class="gif-empty">No GIFs found 😅</div>';
      return;
    }

    results.forEach(r => {
      const tiny  = r.media_formats?.tinygif?.url || r.media_formats?.gif?.url;
      const full  = r.media_formats?.gif?.url     || tiny;
      const title = r.title || 'GIF';
      if (!tiny) return;

      const cell = document.createElement('div');
      cell.className = 'gif-cell';
      cell.title = title;
      const img = document.createElement('img');
      img.src = tiny;
      img.alt = title;
      img.loading = 'lazy';
      cell.appendChild(img);

      cell.addEventListener('click', () => _sendGif({ tiny, full, title, id: r.id }));
      grid.appendChild(cell);
    });
  }

  async function _load(query, append = false) {
    if (_loading) return;
    _loading = true;

    const grid = document.getElementById('kynGifGrid');
    if (grid && !append) {
      grid.innerHTML = '<div class="gif-spinner"><i class="fas fa-circle-notch fa-spin"></i></div>';
    }

    try {
      const pos = append ? _nextPos : '';
      const { results, next } = await _fetchGifs(query, pos);
      _nextPos = next;
      _renderResults(results, append);
    } catch (e) {
      if (grid) grid.innerHTML = '<div class="gif-empty">Couldn\'t load GIFs 😔</div>';
    } finally {
      _loading = false;
    }
  }

  // ── Panel UI ────────────────────────────────────────────────────────────────
  function _buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'kynGifPanel';
    panel.innerHTML = `
      <input id="kynGifSearch" type="text" placeholder="Search GIFs…" autocomplete="off" />
      <div id="kynGifGrid"></div>
    `;
    return panel;
  }

  function _openPanel() {
    if (_open) return;
    _open = true;

    const container = document.querySelector('.message-input-container') ||
                      document.querySelector('.input-area') ||
                      document.getElementById('messageInputContainer');
    if (!container) return;

    const panel = _buildPanel();
    container.style.position = 'relative';
    container.appendChild(panel);

    const btn = document.getElementById('kynGifBtn');
    if (btn) btn.classList.add('active');

    // Search input
    const input = panel.querySelector('#kynGifSearch');
    input.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        _lastQuery = input.value.trim();
        _nextPos   = '';
        _load(_lastQuery);
      }, 350);
    });

    // Infinite scroll
    const grid = panel.querySelector('#kynGifGrid');
    grid.addEventListener('scroll', () => {
      if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 60 && _nextPos) {
        _load(_lastQuery, true);
      }
    });

    // Load trending
    _load('');

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', _outsideClick, true);
    }, 100);
  }

  function _closePanel() {
    if (!_open) return;
    _open = false;
    _nextPos = '';
    _lastQuery = '';

    const panel = document.getElementById('kynGifPanel');
    if (panel) panel.remove();

    const btn = document.getElementById('kynGifBtn');
    if (btn) btn.classList.remove('active');

    document.removeEventListener('click', _outsideClick, true);
  }

  function _outsideClick(e) {
    const panel = document.getElementById('kynGifPanel');
    const btn   = document.getElementById('kynGifBtn');
    if (panel && !panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
      _closePanel();
    }
  }

  function _togglePanel() {
    _open ? _closePanel() : _openPanel();
  }

  // ── Send GIF ────────────────────────────────────────────────────────────────
  function _sendGif({ tiny, full, title, id }) {
    _closePanel();

    // Register a Tenor impression (required by API ToS)
    fetch(`${TENOR_BASE}/registershare?id=${id}&key=${TENOR_KEY}&client_key=${CLIENT_KEY}`).catch(() => {});

    // Use the same send path as existing messages
    const core = global.MessagesCore || global.messagesCore || global.__messagesCore;
    if (core && core.sendMessage) {
      core.sendMessage(title || 'GIF', {
        type: 'gif',
        metadata: { gifUrl: tiny, gifFullUrl: full, gifTitle: title, gifId: id, powered: 'Tenor' },
      });
      return;
    }

    // Fallback: fire a custom event that messages-core listens for
    window.dispatchEvent(new CustomEvent('kyn:sendGif', {
      detail: { type: 'gif', content: title || 'GIF', metadata: { gifUrl: tiny, gifFullUrl: full, gifTitle: title, powered: 'Tenor' } }
    }));
  }

  // ── GIF bubble renderer (called from messages-ui) ──────────────────────────
  function renderGifBubble(message) {
    const meta = message.metadata || {};
    const url  = meta.gifUrl || meta.gifFullUrl || message.content;
    const title = meta.gifTitle || 'GIF';
    return `
      <div class="msg-gif-container" title="${title}">
        <img src="${url}" alt="${title}" loading="lazy" />
        <span class="msg-gif-badge">GIF</span>
      </div>
      <div class="msg-gif-powered">via Tenor</div>
    `;
  }

  // ── Inject GIF button into input toolbar ───────────────────────────────────
  function _injectButton() {
    if (document.getElementById('kynGifBtn')) return;

    // Try to find the emoji button and insert after it
    const emojiBtn = document.getElementById('emojiBtn');
    if (!emojiBtn) return;

    const btn = document.createElement('button');
    btn.id        = 'kynGifBtn';
    btn.title     = 'Send a GIF';
    btn.type      = 'button';
    btn.innerHTML = '<i class="fas fa-film"></i>';
    btn.addEventListener('click', (e) => { e.stopPropagation(); _togglePanel(); });

    emojiBtn.parentNode.insertBefore(btn, emojiBtn.nextSibling);
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    _injectButton();

    // Listen for GIF send events (fired by this module or external)
    window.addEventListener('kyn:sendGif', (e) => {
      // Re-dispatch as a message-send event that messages-core already listens for
      window.dispatchEvent(new CustomEvent('kyn:sendMessage', { detail: e.detail }));
    });

    // Expose renderer globally so messages-ui.js can call it
    global.kynGifPicker = { renderGifBubble, open: _openPanel, close: _closePanel };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already ready — may need slight delay for input to exist
    setTimeout(init, 200);
  }

  // Re-try injection after route changes (SPA navigation)
  window.addEventListener('kyn:pageReady', () => { setTimeout(_injectButton, 300); });
  window.addEventListener('kyn:chatLoaded', () => { setTimeout(_injectButton, 300); });

}(window));
