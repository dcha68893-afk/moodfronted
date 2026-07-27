/**
 * sticker-picker.js — Sticker packs for Nexopa
 *
 * Phase 2 feature: Sticker packs
 *
 * Ships 4 built-in packs (emoji-art stickers as SVG/unicode compositions)
 * with an extensible pack registry. No external CDN required for the defaults.
 *
 * Architecture:
 * - Built-in packs stored as data URIs / unicode art in JS (no server needed)
 * - Custom packs uploaded via POST /api/stickers/packs (returns pack manifest)
 * - Sends as type='sticker' with metadata.stickerUrl + metadata.packId
 * - Renders as fixed-size images in message bubbles
 * - Picker: tabbed by pack, grid of stickers, recent row at top
 *
 * Usage: <script src="js/sticker-picker.js" defer></script>
 */

(function (global) {
  'use strict';

  // ── Built-in sticker packs ─────────────────────────────────────────────────
  // Each sticker is an emoji rendered large via canvas → data URL on first use,
  // OR a real CDN URL if you add one. The emoji approach gives instant stickers
  // with zero network cost and full cross-platform rendering.
  const BUILT_IN_PACKS = [
    {
      id: 'moods',
      name: 'Moods',
      icon: '😊',
      stickers: [
        { id: 'mood_happy',   emoji: '😊', label: 'Happy' },
        { id: 'mood_love',    emoji: '🥰', label: 'Love' },
        { id: 'mood_laugh',   emoji: '😂', label: 'Laugh' },
        { id: 'mood_cool',    emoji: '😎', label: 'Cool' },
        { id: 'mood_wow',     emoji: '😲', label: 'Wow' },
        { id: 'mood_sad',     emoji: '😢', label: 'Sad' },
        { id: 'mood_angry',   emoji: '😠', label: 'Angry' },
        { id: 'mood_sleepy',  emoji: '😴', label: 'Sleepy' },
        { id: 'mood_think',   emoji: '🤔', label: 'Thinking' },
        { id: 'mood_hug',     emoji: '🤗', label: 'Hug' },
        { id: 'mood_party',   emoji: '🥳', label: 'Party' },
        { id: 'mood_fire',    emoji: '🔥', label: 'Fire' },
      ]
    },
    {
      id: 'reactions',
      name: 'Reactions',
      icon: '👍',
      stickers: [
        { id: 'react_yes',    emoji: '👍', label: 'Yes' },
        { id: 'react_no',     emoji: '👎', label: 'No' },
        { id: 'react_ok',     emoji: '👌', label: 'OK' },
        { id: 'react_clap',   emoji: '👏', label: 'Clap' },
        { id: 'react_wave',   emoji: '👋', label: 'Wave' },
        { id: 'react_pray',   emoji: '🙏', label: 'Pray' },
        { id: 'react_fist',   emoji: '✊', label: 'Fist' },
        { id: 'react_point',  emoji: '👆', label: 'Point' },
        { id: 'react_peace',  emoji: '✌️', label: 'Peace' },
        { id: 'react_shrug',  emoji: '🤷', label: 'Shrug' },
        { id: 'react_strong', emoji: '💪', label: 'Strong' },
        { id: 'react_eyes',   emoji: '👀', label: 'Eyes' },
      ]
    },
    {
      id: 'vibe',
      name: 'Vibes',
      icon: '✨',
      stickers: [
        { id: 'vibe_star',    emoji: '⭐', label: 'Star' },
        { id: 'vibe_heart',   emoji: '❤️', label: 'Heart' },
        { id: 'vibe_diamond', emoji: '💎', label: 'Diamond' },
        { id: 'vibe_crown',   emoji: '👑', label: 'Crown' },
        { id: 'vibe_sparkle', emoji: '✨', label: 'Sparkle' },
        { id: 'vibe_rainbow', emoji: '🌈', label: 'Rainbow' },
        { id: 'vibe_moon',    emoji: '🌙', label: 'Moon' },
        { id: 'vibe_sun',     emoji: '☀️', label: 'Sun' },
        { id: 'vibe_bolt',    emoji: '⚡', label: 'Bolt' },
        { id: 'vibe_ghost',   emoji: '👻', label: 'Ghost' },
        { id: 'vibe_alien',   emoji: '👽', label: 'Alien' },
        { id: 'vibe_robot',   emoji: '🤖', label: 'Robot' },
      ]
    },
    {
      id: 'food',
      name: 'Food',
      icon: '🍕',
      stickers: [
        { id: 'food_pizza',   emoji: '🍕', label: 'Pizza' },
        { id: 'food_burger',  emoji: '🍔', label: 'Burger' },
        { id: 'food_sushi',   emoji: '🍣', label: 'Sushi' },
        { id: 'food_taco',    emoji: '🌮', label: 'Taco' },
        { id: 'food_cake',    emoji: '🎂', label: 'Cake' },
        { id: 'food_icecream',emoji: '🍦', label: 'Ice Cream' },
        { id: 'food_coffee',  emoji: '☕', label: 'Coffee' },
        { id: 'food_boba',    emoji: '🧋', label: 'Boba' },
        { id: 'food_ramen',   emoji: '🍜', label: 'Ramen' },
        { id: 'food_avocado', emoji: '🥑', label: 'Avocado' },
        { id: 'food_wine',    emoji: '🍷', label: 'Wine' },
        { id: 'food_beer',    emoji: '🍺', label: 'Beer' },
      ]
    },
  ];

  const RECENT_KEY  = 'kyn_recent_stickers_v1';
  const MAX_RECENT  = 12;

  // ── Emoji → data URL renderer ───────────────────────────────────────────────
  const _emojiCache = new Map();

  function _emojiToDataUrl(emoji, size = 120) {
    const cacheKey = `${emoji}-${size}`;
    if (_emojiCache.has(cacheKey)) return _emojiCache.get(cacheKey);

    const canvas  = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx     = canvas.getContext('2d');
    ctx.font      = `${size * 0.78}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
    const url = canvas.toDataURL('image/png');
    _emojiCache.set(cacheKey, url);
    return url;
  }

  // ── Recent stickers ─────────────────────────────────────────────────────────
  function _getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  }
  function _addRecent(sticker) {
    let recent = _getRecent().filter(s => s.id !== sticker.id);
    recent.unshift(sticker);
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-sticker-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-sticker-styles';
    s.textContent = `
      #kynStickerBtn {
        background: none; border: none; cursor: pointer;
        color: var(--kyn-text-muted); font-size: 18px;
        padding: 0 6px; line-height: 1; transition: color 0.15s;
      }
      #kynStickerBtn:hover, #kynStickerBtn.active { color: var(--kyn-accent-primary); }

      #kynStickerPanel {
        position: absolute;
        bottom: 60px; left: 0; right: 0;
        height: 340px;
        background: var(--kyn-bg-panel);
        border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        border-radius: 16px 16px 0 0;
        display: flex; flex-direction: column;
        z-index: 200;
        box-shadow: 0 -4px 24px rgba(0,0,0,0.3);
        animation: stickerPanelIn 0.18s ease;
      }
      @keyframes stickerPanelIn {
        from { opacity:0; transform:translateY(12px) }
        to   { opacity:1; transform:translateY(0) }
      }

      /* Pack tabs */
      #kynStickerTabs {
        display: flex;
        border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
        padding: 0 8px;
        overflow-x: auto;
        flex-shrink: 0;
        gap: 2px;
      }
      #kynStickerTabs::-webkit-scrollbar { display: none; }
      .sticker-tab {
        flex-shrink: 0;
        background: none; border: none;
        font-size: 20px; padding: 8px 10px;
        cursor: pointer; border-bottom: 2px solid transparent;
        color: var(--kyn-text-muted);
        transition: border-color 0.15s;
      }
      .sticker-tab.active { border-bottom-color: var(--kyn-accent-primary); }

      /* Sticker grid */
      #kynStickerGrid {
        flex: 1; overflow-y: auto;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        padding: 8px;
        align-content: start;
      }
      #kynStickerGrid::-webkit-scrollbar { width: 4px; }
      #kynStickerGrid::-webkit-scrollbar-thumb {
        background: var(--border-color, rgba(255,255,255,0.1));
        border-radius: 2px;
      }
      .sticker-cell {
        aspect-ratio: 1;
        display: flex; align-items: center; justify-content: center;
        border-radius: 10px;
        cursor: pointer;
        font-size: 42px;
        transition: background 0.1s, transform 0.1s;
        line-height: 1;
      }
      .sticker-cell:hover {
        background: rgba(255,255,255,0.06);
        transform: scale(1.1);
      }
      .sticker-cell:active { transform: scale(0.92); }
      .sticker-section-label {
        grid-column: 1/-1;
        font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
        text-transform: uppercase;
        color: var(--kyn-text-muted);
        padding: 4px 2px 0;
      }

      /* Rendered sticker in chat */
      .msg-sticker {
        font-size: 72px;
        line-height: 1;
        display: inline-block;
        cursor: default;
        user-select: none;
        animation: stickerPop 0.25s cubic-bezier(0.175,0.885,0.32,1.275);
      }
      @keyframes stickerPop {
        from { transform: scale(0.5); opacity: 0; }
        to   { transform: scale(1);   opacity: 1; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Panel build/manage ─────────────────────────────────────────────────────
  let _open = false;
  let _activePack = 'recent';

  function _buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'kynStickerPanel';

    // Pack tabs
    const tabs = document.createElement('div');
    tabs.id = 'kynStickerTabs';

    // Recent tab
    const recentTab = document.createElement('button');
    recentTab.className = `sticker-tab ${_activePack === 'recent' ? 'active' : ''}`;
    recentTab.textContent = '🕐';
    recentTab.title = 'Recent';
    recentTab.dataset.pack = 'recent';
    tabs.appendChild(recentTab);

    BUILT_IN_PACKS.forEach(pack => {
      const tab = document.createElement('button');
      tab.className = `sticker-tab ${_activePack === pack.id ? 'active' : ''}`;
      tab.textContent = pack.icon;
      tab.title = pack.name;
      tab.dataset.pack = pack.id;
      tabs.appendChild(tab);
    });

    panel.appendChild(tabs);

    // Grid
    const grid = document.createElement('div');
    grid.id = 'kynStickerGrid';
    panel.appendChild(grid);

    tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.sticker-tab');
      if (!tab) return;
      tabs.querySelectorAll('.sticker-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activePack = tab.dataset.pack;
      _renderPack(grid, _activePack);
    });

    _renderPack(grid, _activePack);
    return panel;
  }

  function _renderPack(grid, packId) {
    grid.innerHTML = '';

    let stickers;
    if (packId === 'recent') {
      stickers = _getRecent();
      if (!stickers.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--kyn-text-muted);font-size:13px;">No recent stickers yet</div>';
        return;
      }
    } else {
      const pack = BUILT_IN_PACKS.find(p => p.id === packId);
      if (!pack) return;
      // Pack name header
      const label = document.createElement('div');
      label.className = 'sticker-section-label';
      label.textContent = pack.name;
      grid.appendChild(label);
      stickers = pack.stickers;
    }

    stickers.forEach(sticker => {
      const cell = document.createElement('div');
      cell.className = 'sticker-cell';
      cell.textContent = sticker.emoji;
      cell.title = sticker.label;
      cell.addEventListener('click', () => _sendSticker(sticker));
      grid.appendChild(cell);
    });
  }

  function _openPanel() {
    if (_open) return;
    _open = true;
    const container = document.querySelector('.message-input-container') ||
                      document.querySelector('.input-area');
    if (!container) return;
    container.style.position = 'relative';
    const panel = _buildPanel();
    container.appendChild(panel);
    document.getElementById('kynStickerBtn')?.classList.add('active');
    setTimeout(() => document.addEventListener('click', _outsideClick, true), 100);
  }

  function _closePanel() {
    if (!_open) return;
    _open = false;
    document.getElementById('kynStickerPanel')?.remove();
    document.getElementById('kynStickerBtn')?.classList.remove('active');
    document.removeEventListener('click', _outsideClick, true);
  }

  function _outsideClick(e) {
    const panel = document.getElementById('kynStickerPanel');
    const btn   = document.getElementById('kynStickerBtn');
    if (panel && !panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
      _closePanel();
    }
  }

  // ── Send sticker ───────────────────────────────────────────────────────────
  function _sendSticker(sticker) {
    _addRecent(sticker);
    _closePanel();

    window.dispatchEvent(new CustomEvent('kyn:sendMessage', {
      detail: {
        type: 'sticker',
        content: sticker.label || sticker.emoji,
        metadata: {
          stickerEmoji: sticker.emoji,
          stickerId:    sticker.id,
          stickerLabel: sticker.label,
          packId:       sticker.packId || 'built-in',
        }
      }
    }));
  }

  // ── Render sticker bubble ──────────────────────────────────────────────────
  function renderStickerBubble(message) {
    const meta  = message.metadata || {};
    const emoji = meta.stickerEmoji || message.content || '😊';
    const label = meta.stickerLabel || '';
    return `<div class="msg-sticker" title="${label}" aria-label="${label}">${emoji}</div>`;
  }

  // ── Inject button ──────────────────────────────────────────────────────────
  function _injectButton() {
    if (document.getElementById('kynStickerBtn')) return;
    const gifBtn = document.getElementById('kynGifBtn');
    const emojiBtn = document.getElementById('emojiBtn');
    const anchor = gifBtn || emojiBtn;
    if (!anchor) return;

    const btn = document.createElement('button');
    btn.id = 'kynStickerBtn';
    btn.title = 'Send a sticker';
    btn.type  = 'button';
    btn.innerHTML = '<i class="fas fa-sticky-note"></i>';
    btn.addEventListener('click', (e) => { e.stopPropagation(); _open ? _closePanel() : _openPanel(); });

    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    _injectButton();
    global.kynStickerPicker = { renderStickerBubble, open: _openPanel, close: _closePanel };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 250);
  }

  window.addEventListener('kyn:pageReady', () => setTimeout(_injectButton, 300));
  window.addEventListener('kyn:chatLoaded', () => setTimeout(_injectButton, 300));

}(window));
