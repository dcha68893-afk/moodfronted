/**
 * DeviceMediaManager.js
 * Phase 3 — Device Media Manager (Frontend)
 *
 * Full lifecycle management for camera and microphone:
 *  - Acquisition with constraint negotiation
 *  - Track isolation (local preview NEVER shares remote)
 *  - Full cleanup on call end (no camera LED left on)
 *  - Device switching (front/back, speaker/earpiece)
 *  - Echo cancellation, noise suppression, AGC
 *  - Background recovery (track restart after tab resume)
 *
 * @version 3.0.0
 * @phase 3 — Media Pipeline
 */

(function () {
  'use strict';

  if (window.__DeviceMediaManager) return;

  class MediaConstraintsBuilder {
    audio(quality = 'medium') {
      const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
      const sampleRates = { low: 16000, medium: 48000, high: 48000 };
      return { ...base, sampleRate: sampleRates[quality] || 48000 };
    }
    video(quality = 'medium') {
      const profiles = {
        low: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } },
        medium: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
        high: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        hd: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      };
      return profiles[quality] || profiles.medium;
    }
  }

  class TrackLifecycleManager {
    constructor() { this._tracks = new Set(); this._streams = new Set(); }
    register(stream) { if (!stream) return; this._streams.add(stream); stream.getTracks().forEach(t => this._tracks.add(t)); }
    stopTrack(track) { if (!track) return; try { track.stop(); } catch (_) {} this._tracks.delete(track); }
    stopStream(stream) { if (!stream) return; stream.getTracks().forEach(t => this.stopTrack(t)); this._streams.delete(stream); }
    stopAll() { for (const t of this._tracks) { try { t.stop(); } catch (_) {} } this._tracks.clear(); this._streams.clear(); }
    replaceTrack(stream, kind, newTrack) {
      const oldTracks = stream.getTracks().filter(t => t.kind === kind);
      oldTracks.forEach(t => { stream.removeTrack(t); this.stopTrack(t); });
      stream.addTrack(newTrack); this._tracks.add(newTrack);
    }
    count() { return this._tracks.size; }
  }

  class AudioOutputManager {
    constructor() { this._sinkId = null; }
    async getDevices() { try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput'); } catch (_) { return []; } }
    async setSink(element, deviceId) { if (!element || typeof element.setSinkId !== 'function') return false; try { await element.setSinkId(deviceId); this._sinkId = deviceId; return true; } catch (_) { return false; } }
    async routeToSpeaker(audioElements) { const devices = await this.getDevices(); const speaker = devices.find(d => d.label.toLowerCase().includes('speaker')); if (!speaker) return; for (const el of audioElements) await this.setSink(el, speaker.deviceId); }
    async routeToEarpiece(audioElements) { const devices = await this.getDevices(); const earpiece = devices.find(d => d.label.toLowerCase().includes('earpiece') || d.label.toLowerCase().includes('internal')); if (!earpiece) return; for (const el of audioElements) await this.setSink(el, earpiece.deviceId); }
  }

  class DeviceMediaManager {
    constructor() {
      this._builder = new MediaConstraintsBuilder();
      this._lifecycle = new TrackLifecycleManager();
      this._audioOutput = new AudioOutputManager();
      this._localStream = null;
      this._screenStream = null;
      this._muted = false;
      this._videoOff = false;
      this._quality = 'medium';
      this._listeners = [];
      this._currentDevices = { audio: null, video: null };
    }

    async acquireMedia(options = {}) {
      const { audio = true, video = false, quality = 'medium', audioDeviceId = null, videoDeviceId = null } = options;
      this._quality = quality;
      this._stopLocal();
      const constraints = {
        audio: audio ? { ...this._builder.audio(quality), ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}) } : false,
        video: video ? { ...this._builder.video(quality), ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}) } : false,
      };
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this._localStream = stream;
        this._lifecycle.register(stream);
        this._notify('media:acquired', { stream, audio, video });
        console.log(`[DeviceMedia] Local stream acquired: audio=${audio} video=${video} tracks=${stream.getTracks().length}`);
        return stream;
      } catch (err) {
        console.error('[DeviceMedia] getUserMedia failed:', err.name, err.message);
        if (video && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) {
          console.warn('[DeviceMedia] Falling back to audio-only');
          return this.acquireMedia({ ...options, video: false });
        }
        throw err;
      }
    }

    async acquireScreen(options = {}) {
      this._stopScreen();
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always', ...options }, audio: options.withAudio || false });
        this._screenStream = stream;
        this._lifecycle.register(stream);
        stream.getVideoTracks()[0]?.addEventListener('ended', () => { this._stopScreen(); this._notify('media:screen_stopped', {}); });
        this._notify('media:screen_acquired', { stream });
        return stream;
      } catch (err) { console.warn('[DeviceMedia] Screen share failed:', err.message); throw err; }
    }

    muteAudio(muted) { if (!this._localStream) return; this._localStream.getAudioTracks().forEach(t => { t.enabled = !muted; }); this._muted = muted; this._notify('media:mute_changed', { muted }); }
    toggleMute() { this.muteAudio(!this._muted); }
    isMuted() { return this._muted; }
    disableVideo(disabled) { if (!this._localStream) return; this._localStream.getVideoTracks().forEach(t => { t.enabled = !disabled; }); this._videoOff = disabled; this._notify('media:video_changed', { videoOff: disabled }); }
    toggleVideo() { this.disableVideo(!this._videoOff); }
    isVideoOff() { return this._videoOff; }

    async switchCamera() {
      if (!this._localStream) return;
      const currentTrack = this._localStream.getVideoTracks()[0];
      const currentFacing = currentTrack?.getSettings?.()?.facingMode;
      const newFacing = currentFacing === 'user' ? 'environment' : 'user';
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { ...this._builder.video(this._quality), facingMode: newFacing }, audio: false });
        const newTrack = newStream.getVideoTracks()[0];
        this._lifecycle.replaceTrack(this._localStream, 'video', newTrack);
        this._propagateTrackChange('video', newTrack);
        this._notify('media:camera_switched', { facingMode: newFacing, track: newTrack });
        return newTrack;
      } catch (err) { console.warn('[DeviceMedia] Camera switch failed:', err.message); throw err; }
    }

    async switchAudioDevice(deviceId) {
      if (!this._localStream) return;
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: { ...this._builder.audio(this._quality), deviceId: { exact: deviceId } }, video: false });
      const newTrack = newStream.getAudioTracks()[0];
      this._lifecycle.replaceTrack(this._localStream, 'audio', newTrack);
      this._currentDevices.audio = deviceId;
      this._propagateTrackChange('audio', newTrack);
      this._notify('media:audio_device_switched', { deviceId, track: newTrack });
      return newTrack;
    }

    async adaptQuality(newQuality) {
      if (newQuality === this._quality) return;
      this._quality = newQuality;
      const videoTrack = this._localStream?.getVideoTracks()[0];
      if (!videoTrack) return;
      try { await videoTrack.applyConstraints(this._builder.video(newQuality)); this._notify('media:quality_changed', { quality: newQuality }); }
      catch (err) { console.warn('[DeviceMedia] applyConstraints failed:', err.message); }
    }

    async recoverTracks() {
      if (!this._localStream) return;
      const hasVideo = this._localStream.getVideoTracks().length > 0;
      const hasAudio = this._localStream.getAudioTracks().length > 0;
      const videoEnded = this._localStream.getVideoTracks().some(t => t.readyState === 'ended');
      const audioEnded = this._localStream.getAudioTracks().some(t => t.readyState === 'ended');
      if (!videoEnded && !audioEnded) return;
      console.log('[DeviceMedia] Recovering ended tracks...');
      const stream = await this.acquireMedia({ audio: hasAudio, video: hasVideo && !this._videoOff, quality: this._quality });
      stream.getTracks().forEach(track => this._propagateTrackChange(track.kind, track));
      this._notify('media:tracks_recovered', {});
    }

    getLocalStream() { return this._localStream; }
    getScreenStream() { return this._screenStream; }
    getAudioOutput() { return this._audioOutput; }
    async getAvailableDevices() {
      try { const devices = await navigator.mediaDevices.enumerateDevices(); return { audioInput: devices.filter(d => d.kind === 'audioinput'), videoInput: devices.filter(d => d.kind === 'videoinput'), audioOutput: devices.filter(d => d.kind === 'audiooutput') }; }
      catch (_) { return { audioInput: [], videoInput: [], audioOutput: [] }; }
    }
    stopAll() { this._stopLocal(); this._stopScreen(); this._notify('media:stopped', {}); console.log('[DeviceMedia] All media stopped'); }
    onChange(fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter(l => l !== fn); }; }
    getDiagnostics() { return { hasLocalStream: !!this._localStream, hasScreenStream: !!this._screenStream, muted: this._muted, videoOff: this._videoOff, quality: this._quality, trackCount: this._lifecycle.count(), localTracks: this._localStream?.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState, enabled: t.enabled })) || [] }; }

    _propagateTrackChange(kind, track) {
      if (!track) return;
      try {
        const pcm = window.__PeerConnectionManager;
        if (pcm && typeof pcm.replaceTrackForAll === 'function') {
          pcm.replaceTrackForAll(kind, track);
          return;
        }
      } catch (_) {}
      try {
        const core = window.callCore;
        if (core && typeof core.replaceTrackForAll === 'function') core.replaceTrackForAll(kind, track);
      } catch (_) {}
    }

    _stopLocal() { if (this._localStream) { this._lifecycle.stopStream(this._localStream); this._localStream = null; } }
    _stopScreen() { if (this._screenStream) { this._lifecycle.stopStream(this._screenStream); this._screenStream = null; } }
    _notify(event, data) { this._listeners.forEach(fn => { try { fn({ event, ...data }); } catch (_) {} }); }
  }

  window.__DeviceMediaManager = new DeviceMediaManager();
  window.DeviceMedia = window.__DeviceMediaManager;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => window.__DeviceMediaManager.recoverTracks(), 500); });
  console.log('[DeviceMedia] ✅ Ready');
})();