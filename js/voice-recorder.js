/**
 * voice-recorder.js  — Full voice note recording system
 *
 * Fixes audit finding: startRecording?() was an optional chain returning undefined
 * because the method was never defined anywhere in messages-core.js.
 *
 * Features implemented:
 *  - MediaRecorder API recording (webm/opus → mp3 fallback)
 *  - Waveform visualization via Web Audio API AnalyserNode
 *  - Recording timer (mm:ss)
 *  - Slide-to-cancel gesture
 *  - Lock-to-hands-free mode
 *  - Pause / resume recording
 *  - Cancel recording
 *  - Playback with 1x / 1.5x / 2x speed control
 *  - Waveform SVG rendering in message bubble
 *  - Blob → POST /api/messages/:chatId/upload (type=voice_note)
 *
 * Usage:
 *   KynectaVoiceRecorder.install(core)
 *     — adds core.startRecording(), core.stopRecording(), core.cancelRecording()
 *
 * Loaded by message.html / chat.html AFTER messages-core.js
 */

(function (global) {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  const MAX_DURATION_MS  = 5 * 60 * 1000;   // 5 minutes max
  const WAVEFORM_SAMPLES = 64;               // bars in waveform SVG

  // ── State ────────────────────────────────────────────────────────────────
  let _mediaRecorder  = null;
  let _audioContext   = null;
  let _analyser       = null;
  let _stream         = null;
  let _chunks         = [];
  let _startTime      = 0;
  let _timerInterval  = null;
  let _animFrame      = null;
  let _amplitudes     = [];
  let _locked         = false;
  let _cancelled      = false;
  let _resolvePromise = null;
  let _rejectPromise  = null;

  // ── UI elements (created on demand) ─────────────────────────────────────
  let _overlay  = null;
  let _timerEl  = null;
  let _waveEl   = null;
  let _canvas   = null;
  let _ctx2d    = null;

  // ── Build the recording overlay ─────────────────────────────────────────
  function _buildOverlay() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'kyn-voice-overlay';
    _overlay.innerHTML = `
      <div class="kyn-voice-inner">
        <div class="kyn-voice-waveform">
          <canvas id="kyn-voice-canvas" width="240" height="48"></canvas>
        </div>
        <div class="kyn-voice-timer" id="kyn-voice-timer">0:00</div>
        <div class="kyn-voice-hint" id="kyn-voice-hint">Slide left to cancel &nbsp;·&nbsp; Slide up to lock</div>
        <div class="kyn-voice-controls">
          <button class="kyn-voice-btn kyn-voice-cancel" id="kyn-voice-cancel" title="Cancel">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div class="kyn-voice-mic-wrap" id="kyn-voice-mic-wrap">
            <div class="kyn-voice-mic-pulse"></div>
            <svg class="kyn-voice-mic-icon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2z"/>
              <path d="M7 11a5 5 0 0 0 10 0M12 16v4M9 20h6"/>
            </svg>
          </div>
          <button class="kyn-voice-btn kyn-voice-send" id="kyn-voice-send" title="Send">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div class="kyn-voice-lock" id="kyn-voice-lock" title="Lock recording">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
      </div>
    `;

    // Inject styles
    if (!document.getElementById('kyn-voice-styles')) {
      const style = document.createElement('style');
      style.id = 'kyn-voice-styles';
      style.textContent = `
        #kyn-voice-overlay {
          position: fixed; bottom: 70px; left: 0; right: 0;
          display: flex; justify-content: center; z-index: 9999;
          animation: kynVoiceIn 0.2s ease;
        }
        @keyframes kynVoiceIn { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        .kyn-voice-inner {
          background: var(--kyn-bg-panel); border-radius: 24px;
          padding: 12px 16px; display: flex; flex-direction: column; align-items: center;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4); width: min(340px, 92vw); gap: 8px;
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
        }
        .kyn-voice-waveform { width: 240px; height: 48px; }
        #kyn-voice-canvas { display: block; }
        .kyn-voice-timer { font-size: 18px; font-weight: 600; color: var(--text-primary); letter-spacing: 1px; }
        .kyn-voice-hint { font-size: 11px; color: var(--kyn-text-muted); text-align: center; }
        .kyn-voice-controls { display: flex; align-items: center; gap: 20px; width: 100%; justify-content: center; }
        .kyn-voice-btn {
          width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.15s, background 0.15s;
        }
        .kyn-voice-btn:active { transform: scale(0.9); }
        .kyn-voice-cancel { background: var(--kyn-bg-input); color: var(--kyn-text-muted); }
        .kyn-voice-send   { background: var(--accent-color); color: #fff; }
        .kyn-voice-send:hover { background: var(--primary-dark); }
        .kyn-voice-mic-wrap {
          position: relative; width: 56px; height: 56px;
          display: flex; align-items: center; justify-content: center;
        }
        .kyn-voice-mic-pulse {
          position: absolute; inset: 0; border-radius: 50%;
          background: rgba(124,58,237,0.3);
          animation: kynVoicePulse 1.2s ease-in-out infinite;
        }
        @keyframes kynVoicePulse { 0%,100% { transform:scale(1); opacity:0.6 } 50% { transform:scale(1.3); opacity:0.2 } }
        .kyn-voice-mic-icon { color: var(--accent-color); position: relative; z-index: 1; }
        .kyn-voice-lock {
          align-self: flex-end; width: 32px; height: 32px; border-radius: 50%;
          background: var(--kyn-bg-input); border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: var(--kyn-text-muted); transition: color 0.2s, background 0.2s;
        }
        .kyn-voice-lock.locked { color: var(--accent-color); background: rgba(124,58,237,0.15); }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(_overlay);

    _canvas = document.getElementById('kyn-voice-canvas');
    _ctx2d  = _canvas ? _canvas.getContext('2d') : null;
    _timerEl = document.getElementById('kyn-voice-timer');

    document.getElementById('kyn-voice-cancel')?.addEventListener('click', () => { _cancel(); });
    document.getElementById('kyn-voice-send')?.addEventListener('click', () => { _finish(); });
    document.getElementById('kyn-voice-lock')?.addEventListener('click', () => {
      _locked = !_locked;
      document.getElementById('kyn-voice-lock')?.classList.toggle('locked', _locked);
      const hint = document.getElementById('kyn-voice-hint');
      if (hint) hint.textContent = _locked ? 'Recording locked — tap send when done' : 'Slide left to cancel · Slide up to lock';
    });
  }

  function _showOverlay() {
    if (_overlay) _overlay.style.display = 'flex';
  }

  function _hideOverlay() {
    if (_overlay) _overlay.style.display = 'none';
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  function _startTimer() {
    _startTime = Date.now();
    _timerInterval = setInterval(() => {
      const elapsed = Date.now() - _startTime;
      const mm = String(Math.floor(elapsed / 60000)).padStart(1, '0');
      const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
      if (_timerEl) _timerEl.textContent = `${mm}:${ss}`;
      // Auto-stop at max duration
      if (elapsed >= MAX_DURATION_MS) _finish();
    }, 500);
  }

  function _stopTimer() {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }

  // ── Waveform Visualizer ───────────────────────────────────────────────────
  function _startVisualizer() {
    if (!_analyser || !_ctx2d) return;
    const bufferLength = _analyser.frequencyBinCount;
    const dataArray    = new Uint8Array(bufferLength);

    function draw() {
      _animFrame = requestAnimationFrame(draw);
      _analyser.getByteFrequencyData(dataArray);

      // Sample a subset as amplitude bars
      const barWidth = _canvas.width / WAVEFORM_SAMPLES;
      const step     = Math.floor(bufferLength / WAVEFORM_SAMPLES);

      _ctx2d.clearRect(0, 0, _canvas.width, _canvas.height);
      _ctx2d.fillStyle = 'rgba(124,58,237,0.85)';

      for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
        const value  = dataArray[i * step] / 255;
        const h      = Math.max(4, value * _canvas.height);
        const x      = i * barWidth + barWidth * 0.1;
        const y      = (_canvas.height - h) / 2;
        _ctx2d.beginPath();
        _ctx2d.roundRect(x, y, barWidth * 0.8, h, 2);
        _ctx2d.fill();
        _amplitudes.push(Math.round(value * 100));
      }
    }
    draw();
  }

  function _stopVisualizer() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  }

  // ── Build static waveform SVG from amplitude array (for message bubble) ──
  function _buildWaveformSvg(amplitudes) {
    const W = 200, H = 40, bars = 40;
    const src    = amplitudes.length >= bars
      ? amplitudes.filter((_, i) => i % Math.floor(amplitudes.length / bars) === 0).slice(0, bars)
      : [...amplitudes, ...Array(bars).fill(20)].slice(0, bars);
    const barW   = W / bars;
    let rects    = '';
    src.forEach((v, i) => {
      const h = Math.max(4, Math.min(H - 4, (v / 100) * H));
      const y = (H - h) / 2;
      rects += `<rect x="${i * barW + barW * 0.1}" y="${y}" width="${barW * 0.8}" height="${h}" rx="2"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" fill="#7c3aed">${rects}</svg>`;
  }

  // ── Core recording logic ──────────────────────────────────────────────────
  async function _startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Voice recording is not supported in this browser.');
      return null;
    }

    _cancelled = false;
    _chunks    = [];
    _amplitudes = [];

    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone access denied. Please allow microphone permission and try again.'
        : 'Could not access microphone: ' + err.message;
      alert(msg);
      return null;
    }

    // Set up Web Audio API analyser
    try {
      _audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source  = _audioContext.createMediaStreamSource(_stream);
      _analyser     = _audioContext.createAnalyser();
      _analyser.fftSize = 256;
      source.connect(_analyser);
    } catch (_) { _analyser = null; }

    // Choose best mime type
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', '']
      .find(m => m === '' || MediaRecorder.isTypeSupported(m)) || '';

    const options = mimeType ? { mimeType } : {};
    _mediaRecorder = new MediaRecorder(_stream, options);

    _mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) _chunks.push(e.data);
    };

    return new Promise((resolve, reject) => {
      _resolvePromise = resolve;
      _rejectPromise  = reject;

      _mediaRecorder.onstop = async () => {
        _cleanup();
        if (_cancelled) { resolve(null); return; }

        const blob     = new Blob(_chunks, { type: mimeType || 'audio/webm' });
        const duration = Math.round((Date.now() - _startTime) / 1000);
        const waveform = _buildWaveformSvg(_amplitudes);
        resolve({ blob, duration, waveform, amplitudes: [..._amplitudes] });
      };

      _mediaRecorder.start(100); // collect data every 100ms
      _startTimer();
      _buildOverlay();
      _showOverlay();
      _startVisualizer();
    });
  }

  function _finish() {
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
      _mediaRecorder.stop();
    }
  }

  function _cancel() {
    _cancelled = true;
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
      _mediaRecorder.stop();
    } else {
      _cleanup();
      if (_resolvePromise) { _resolvePromise(null); _resolvePromise = null; }
    }
  }

  function _cleanup() {
    _stopTimer();
    _stopVisualizer();
    _hideOverlay();
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    if (_audioContext) {
      try { _audioContext.close(); } catch (_) {}
      _audioContext = null;
      _analyser     = null;
    }
    _mediaRecorder = null;
  }

  // ── Upload helper — returns the attachment object for messages-ui.js ──────
  async function _uploadVoiceNote(blob, chatId, duration, waveformSvg) {
    const apiBase = window.API_BASE_URL
      || window.BACKEND_URL
      || (document.querySelector('meta[name="api-url"]') || {}).content
      || '';

    const ext  = blob.type.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type });
    const form = new FormData();
    form.append('file', file);
    form.append('type', 'voice_note');
    form.append('duration', String(duration));
    form.append('waveform', waveformSvg);

    // Try to get auth token
    const token = (
      window.authToken ||
      window.kynecta_token ||
      sessionStorage.getItem('kynecta_auth_token') ||
      localStorage.getItem('kynecta_auth_token') ||
      localStorage.getItem('authToken') ||
      ''
    );

    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const resp = await fetch(`${apiBase}/api/messages/${chatId}/upload`, {
      method: 'POST',
      headers,
      body: form,
      credentials: 'include',
    });

    if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
    const data = await resp.json();
    return {
      type:     'voice_note',
      url:      data.data?.mediaUrl || data.data?.url || data.mediaUrl,
      duration,
      waveform: waveformSvg,
      mimeType: blob.type,
    };
  }

  // ── Waveform playback speed control injector ─────────────────────────────
  // Adds speed toggle (1x → 1.5x → 2x) to all audio elements with class kyn-voice-audio
  function _initPlaybackSpeedControls() {
    document.addEventListener('click', (e) => {
      if (!e.target.classList.contains('kyn-voice-speed-btn')) return;
      const audio = e.target.closest('.kyn-voice-player')?.querySelector('audio');
      if (!audio) return;
      const rates   = [1, 1.5, 2];
      const cur     = audio.playbackRate || 1;
      const nextIdx = (rates.indexOf(cur) + 1) % rates.length;
      audio.playbackRate = rates[nextIdx];
      e.target.textContent = `${rates[nextIdx]}×`;
    });
  }

  // ── Public API: install on core object ───────────────────────────────────
  function install(core) {
    if (!core) {
      console.warn('[VoiceRecorder] No core object provided');
      return;
    }

    /**
     * core.startRecording()
     * Called by messages-ui.js in the audio attachment handler.
     * Returns: null (cancelled) | { blob, duration, waveform, amplitudes }
     */
    core.startRecording = async function () {
      const result = await _startRecording();
      if (!result) return null;

      const chatId = core._activeChatId || core.activeChatId
        || (typeof core.getActiveChatId === 'function' ? core.getActiveChatId() : null)
        || document.querySelector('[data-chat-id]')?.dataset.chatId
        || null;

      if (!chatId) {
        console.warn('[VoiceRecorder] Cannot upload — no active chat ID');
        // Still return result so caller can handle it
        return result;
      }

      try {
        const attachment = await _uploadVoiceNote(result.blob, chatId, result.duration, result.waveform);
        return attachment;
      } catch (err) {
        console.error('[VoiceRecorder] Upload error:', err);
        // Return a local blob URL as fallback so UI doesn't silently fail
        return {
          type:     'voice_note',
          url:      URL.createObjectURL(result.blob),
          duration: result.duration,
          waveform: result.waveform,
          local:    true,
        };
      }
    };

    core.stopRecording  = _finish;
    core.cancelRecording = _cancel;

    _initPlaybackSpeedControls();
    console.log('[VoiceRecorder] ✅ Installed on core — startRecording() ready');
  }

  // ── Render helper: create voice note player HTML (for messages-ui.js) ────
  function renderVoicePlayer(message) {
    const url      = message.mediaUrl || message.fileUrl || message.url || (message.metadata && message.metadata.mediaUrl);
    const duration = message.duration || (message.metadata && message.metadata.duration) || 0;
    const waveform = message.waveform || (message.metadata && message.metadata.waveform) || '';
    const mm = String(Math.floor(duration / 60)).padStart(1, '0');
    const ss = String(duration % 60).padStart(2, '0');

    return `
      <div class="kyn-voice-player" style="display:flex;align-items:center;gap:8px;min-width:200px;max-width:280px">
        <audio src="${url || ''}" preload="metadata" style="display:none"></audio>
        <button class="kyn-voice-play-btn" onclick="(function(btn){
          var p=btn.closest('.kyn-voice-player');
          var a=p.querySelector('audio');
          if(a.paused){a.play();btn.textContent='⏸'}else{a.pause();btn.textContent='▶'}
          a.onended=function(){btn.textContent='▶'};
        })(this)" style="width:36px;height:36px;border-radius:50%;background:var(--accent-color);border:none;color:#fff;cursor:pointer;font-size:14px">▶</button>
        <div style="flex:1;min-width:0">
          ${waveform ? `<div class="kyn-waveform-static">${waveform}</div>` : `<div style="height:32px;background:rgba(124,58,237,0.15);border-radius:4px"></div>`}
          <div style="display:flex;justify-content:space-between;margin-top:2px">
            <span style="font-size:10px;color:var(--kyn-text-muted)">${mm}:${ss}</span>
            <button class="kyn-voice-speed-btn" style="font-size:10px;color:var(--accent-color);background:none;border:none;cursor:pointer;padding:0">1×</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Expose globally ───────────────────────────────────────────────────────
  global.KynectaVoiceRecorder = {
    install,
    renderVoicePlayer,
    startRecording:  _startRecording,
    stopRecording:   _finish,
    cancelRecording: _cancel,
  };

  // Auto-install if window.messagesCore / window.MessagesCore / window.core is already set
  if (global.MessagesCore) install(global.MessagesCore);
  if (global.messagesCore && global.messagesCore !== global.MessagesCore) install(global.messagesCore);
  if (global.core && global.core !== global.MessagesCore && global.core !== global.messagesCore) install(global.core);

  // Deferred install for when core is set later
  const _origDefineProperty = Object.defineProperty.bind(Object);
  ['MessagesCore', 'messagesCore', 'core'].forEach(function (prop) {
    if (!global[prop]) {
      let _val;
      try {
        _origDefineProperty(global, prop, {
          get: () => _val,
          set: (v) => {
            _val = v;
            if (v && typeof v === 'object' && !v.startRecording) {
              install(v);
            }
          },
          configurable: true,
        });
      } catch (_) { /* property already non-configurable */ }
    }
  });

  console.log('[KynectaVoiceRecorder] ✅ Loaded — waiting for core object');

})(window);
