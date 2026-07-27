/**
 * voice-waveform.js — Audio waveform visualizer for voice messages
 *
 * Renders animated SVG bar waveforms inside every .audio-waveform div.
 * Works in two modes:
 *   1. PLAYBACK bars — static decorative bars drawn from audio amplitude data
 *      (pre-computed at record time if we have it, else generated from seeded random)
 *   2. RECORDING bars — live animated bars using Web Audio API AnalyserNode
 *
 * Integration:
 *   - Automatically scans the DOM for .audio-waveform elements and populates them
 *   - Hooks into the existing audio play/pause buttons via MutationObserver
 *   - Also enhances the recording UI with a live preview waveform
 *
 * No external deps. Pure Web Audio API + SVG.
 */

(function (global) {
  'use strict';

  const BAR_COUNT  = 32;
  const BAR_WIDTH  = 3;
  const BAR_GAP    = 2;
  const BAR_HEIGHT = 28;
  const TOTAL_W    = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;

  // ── Styles ─────────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('kyn-waveform-styles')) return;
    const s = document.createElement('style');
    s.id = 'kyn-waveform-styles';
    s.textContent = `
      .audio-waveform {
        display: inline-flex;
        align-items: center;
        height: ${BAR_HEIGHT}px;
        gap: 0;
        flex: 1;
        min-width: 80px;
        cursor: pointer;
        overflow: hidden;
      }
      .audio-waveform svg { width: 100%; height: ${BAR_HEIGHT}px; }

      /* Played-through portion: accent color */
      .wf-bar { fill: rgba(255,255,255,0.3); transition: fill 0.1s; }
      .wf-bar.played { fill: var(--accent, #7c3aed); }

      /* Animated recording bars */
      .wf-bar-live {
        fill: var(--accent, #7c3aed);
        transform-origin: bottom;
        animation: wfLivePulse 0.4s ease-in-out infinite alternate;
      }
      @keyframes wfLivePulse {
        from { transform: scaleY(0.2); }
        to   { transform: scaleY(1.0); }
      }

      /* Recording indicator with waveform */
      #kynRecordingWaveform {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: rgba(239,68,68,0.1);
        border: 1px solid rgba(239,68,68,0.3);
        border-radius: 20px;
        margin: 4px 8px;
      }
      #kynRecordingWaveform .rec-dot {
        width: 8px; height: 8px;
        background: #ef4444;
        border-radius: 50%;
        animation: recPulse 1s ease-in-out infinite;
        flex-shrink: 0;
      }
      #kynRecordingWaveform .rec-timer {
        font-size: 13px; font-weight: 600;
        color: var(--text-primary);
        min-width: 36px;
      }
      @keyframes recPulse {
        0%,100% { opacity:1; transform:scale(1); }
        50%      { opacity:0.4; transform:scale(0.7); }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Generate bars from seeded random (reproducible per messageId) ───────────
  function _seededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  function _generateBars(messageId, waveformData) {
    if (waveformData && Array.isArray(waveformData) && waveformData.length > 0) {
      // Use actual amplitude data if available
      const step = Math.max(1, Math.floor(waveformData.length / BAR_COUNT));
      const bars = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        bars.push(waveformData[i * step] || 0);
      }
      return bars;
    }
    // Seeded random fallback (consistent per message, looks like real audio)
    const rng = _seededRandom(messageId || 42);
    const bars = [];
    let prev = 0.5;
    for (let i = 0; i < BAR_COUNT; i++) {
      // Smooth random walk — looks like voice audio
      const delta = (rng() - 0.5) * 0.4;
      prev = Math.max(0.08, Math.min(1.0, prev + delta));
      bars.push(prev);
    }
    return bars;
  }

  // ── Build SVG waveform ─────────────────────────────────────────────────────
  function _buildSVG(bars, playedRatio = 0) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg   = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${TOTAL_W} ${BAR_HEIGHT}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.display = 'block';

    bars.forEach((amp, i) => {
      const h  = Math.max(3, Math.round(amp * BAR_HEIGHT));
      const y  = BAR_HEIGHT - h;
      const x  = i * (BAR_WIDTH + BAR_GAP);
      const played = (i / BAR_COUNT) < playedRatio;

      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', BAR_WIDTH);
      rect.setAttribute('height', h);
      rect.setAttribute('rx', Math.min(1, BAR_WIDTH / 2));
      rect.setAttribute('class', `wf-bar${played ? ' played' : ''}`);
      rect.dataset.barIndex = i;
      svg.appendChild(rect);
    });

    return svg;
  }

  // ── Render a waveform into a .audio-waveform element ──────────────────────
  function renderWaveform(container, messageId, waveformData) {
    if (!container || container.dataset.kynWfInit) return;
    container.dataset.kynWfInit = '1';

    const bars = _generateBars(parseInt(messageId) || 0, waveformData);
    container.dataset.bars = JSON.stringify(bars);

    const svg = _buildSVG(bars, 0);
    container.innerHTML = '';
    container.appendChild(svg);

    // Click to seek (updates played bars)
    container.addEventListener('click', (e) => {
      const rect  = container.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      _updatePlayedBars(container, ratio);

      // Find the audio element and seek
      const wrapper = container.closest('.message-bubble, .audio-message');
      const audio   = wrapper?.querySelector('audio');
      if (audio && audio.duration) {
        audio.currentTime = audio.duration * ratio;
      }
    });
  }

  function _updatePlayedBars(container, ratio) {
    const bars = JSON.parse(container.dataset.bars || '[]');
    const svg  = _buildSVG(bars, ratio);
    container.innerHTML = '';
    container.appendChild(svg);
  }

  // ── Hook into audio element playback events ────────────────────────────────
  function _hookAudioElement(audio, container) {
    if (audio._kynWfHooked) return;
    audio._kynWfHooked = true;

    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return;
      _updatePlayedBars(container, audio.currentTime / audio.duration);
    });

    audio.addEventListener('ended', () => _updatePlayedBars(container, 0));
    audio.addEventListener('pause', () => {}); // keep position
  }

  // ── Live recording waveform ────────────────────────────────────────────────
  let _liveAnimFrame = null;
  let _liveAnalyser  = null;

  async function startRecordingWaveform(inputElement) {
    const container = document.getElementById('kynRecordingWaveform');
    if (!container) return;

    const waveDiv = container.querySelector('.kyn-live-wave');
    if (!waveDiv || !global.AudioContext) return;

    try {
      const stream  = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx     = new AudioContext();
      const src     = ctx.createMediaStreamSource(stream);
      _liveAnalyser = ctx.createAnalyser();
      _liveAnalyser.fftSize = 64;
      src.connect(_liveAnalyser);

      const bufLen  = _liveAnalyser.frequencyBinCount;
      const data    = new Uint8Array(bufLen);
      const bars    = waveDiv.querySelectorAll('.wf-bar-live');

      function _draw() {
        _liveAnimFrame = requestAnimationFrame(_draw);
        _liveAnalyser.getByteFrequencyData(data);

        bars.forEach((bar, i) => {
          const idx   = Math.floor(i * bufLen / bars.length);
          const scale = (data[idx] / 255) * 0.9 + 0.1;
          bar.style.animationDuration = `${0.2 + (1 - scale) * 0.4}s`;
          bar.style.height = `${Math.max(3, scale * BAR_HEIGHT)}px`;
        });
      }
      _draw();
    } catch (e) {
      console.warn('[VoiceWaveform] Mic access failed:', e.message);
    }
  }

  function stopRecordingWaveform() {
    if (_liveAnimFrame) { cancelAnimationFrame(_liveAnimFrame); _liveAnimFrame = null; }
    if (_liveAnalyser) { _liveAnalyser = null; }
  }

  // ── Inject live waveform UI into record button area ────────────────────────
  function injectRecordingUI() {
    if (document.getElementById('kynRecordingWaveform')) return;

    const inputArea = document.querySelector('.message-input-area, .input-footer, #inputContainer');
    if (!inputArea) return;

    const div = document.createElement('div');
    div.id = 'kynRecordingWaveform';
    div.style.display = 'none';

    // Build live bars SVG
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg   = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${TOTAL_W} ${BAR_HEIGHT}`);
    svg.classList.add('kyn-live-wave');
    svg.style.cssText = `width:120px;height:${BAR_HEIGHT}px;`;

    for (let i = 0; i < 16; i++) {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', i * (BAR_WIDTH + BAR_GAP) * 2);
      rect.setAttribute('y', 0);
      rect.setAttribute('width', BAR_WIDTH * 2);
      rect.setAttribute('height', BAR_HEIGHT);
      rect.setAttribute('rx', '2');
      rect.classList.add('wf-bar-live');
      rect.style.animationDelay = `${i * 0.05}s`;
      svg.appendChild(rect);
    }

    div.innerHTML = `<div class="rec-dot"></div>`;
    div.appendChild(svg);
    div.innerHTML += `<span class="rec-timer" id="kynRecTimer">0:00</span>`;

    inputArea.insertBefore(div, inputArea.firstChild);
  }

  // ── Timer for recording ────────────────────────────────────────────────────
  let _recTimer = null;
  let _recStart = 0;

  function startRecordingTimer() {
    _recStart = Date.now();
    const timerEl = document.getElementById('kynRecTimer');
    _recTimer = setInterval(() => {
      if (!timerEl) return;
      const secs = Math.floor((Date.now() - _recStart) / 1000);
      timerEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }, 500);

    const waveformUI = document.getElementById('kynRecordingWaveform');
    if (waveformUI) waveformUI.style.display = 'flex';
  }

  function stopRecordingTimer() {
    if (_recTimer) { clearInterval(_recTimer); _recTimer = null; }
    const waveformUI = document.getElementById('kynRecordingWaveform');
    if (waveformUI) waveformUI.style.display = 'none';
  }

  // ── Observe DOM for new .audio-waveform elements ──────────────────────────
  function _observeWaveforms() {
    const container = document.getElementById('messagesContainer') ||
                      document.querySelector('.messages-container');
    if (!container) { setTimeout(_observeWaveforms, 800); return; }

    function _processNode(node) {
      if (node.nodeType !== 1) return;
      const waveforms = node.classList?.contains('audio-waveform')
        ? [node]
        : Array.from(node.querySelectorAll('.audio-waveform'));

      waveforms.forEach(wf => {
        // Get messageId from closest parent with data-message-id
        const wrapper = wf.closest('[data-message-id], .message-wrapper');
        const msgId   = wrapper?.dataset?.messageId ||
                        wf.id?.replace('waveform-', '') || '0';
        const audio   = wrapper?.querySelector('audio');

        renderWaveform(wf, msgId, null);
        if (audio) _hookAudioElement(audio, wf);
      });
    }

    // Process existing
    _processNode(container);

    // Watch for new
    new MutationObserver(mutations => {
      mutations.forEach(m => m.addedNodes.forEach(_processNode));
    }).observe(container, { childList: true, subtree: true });
  }

  // ── Hook record button events ──────────────────────────────────────────────
  function _hookRecordButton() {
    window.addEventListener('kyn:recordingStarted', () => {
      startRecordingTimer();
      startRecordingWaveform();
    });
    window.addEventListener('kyn:recordingStopped', () => {
      stopRecordingTimer();
      stopRecordingWaveform();
    });
    // Hook existing voice-record-btn if present
    const voiceBtn = document.getElementById('voiceRecordBtn') ||
                     document.getElementById('audioRecordBtn');
    if (voiceBtn && !voiceBtn._kynWfHooked) {
      voiceBtn._kynWfHooked = true;
      voiceBtn.addEventListener('pointerdown', () => window.dispatchEvent(new CustomEvent('kyn:recordingStarted')));
      voiceBtn.addEventListener('pointerup',   () => window.dispatchEvent(new CustomEvent('kyn:recordingStopped')));
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  global.kynVoiceWaveform = {
    renderWaveform,
    startRecordingTimer,
    stopRecordingTimer,
    startRecordingWaveform,
    stopRecordingWaveform,
  };

  function init() {
    _injectStyles();
    _observeWaveforms();
    injectRecordingUI();
    setTimeout(_hookRecordButton, 500);
    window.addEventListener('kyn:chatLoaded', _observeWaveforms);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

}(window));
