/**
 * IdentityFoundationLayer.js
 * Phase 1 — Identity Foundation
 *
 * Prepares:
 *  - Device fingerprint (stable across sessions)
 *  - Session identity
 *  - Trusted device registry (Phase 2 mesh trust preparation)
 *  - Connection fingerprinting
 *
 * DOES NOT change auth flow.
 *
 * @version 1.0.0
 * @phase 1 — Foundation Stabilization
 */

(function () {
  'use strict';

  if (window.__IdentityFoundationLayer) {
    console.log('[IdentityFoundation] Already initialized — skipping.');
    return;
  }

  const DEVICE_ID_KEY = '__kyn_device_id';
  const TRUSTED_DEVICES_KEY = '__kyn_trusted_devices';

  // ─── DeviceIdentityManager ───────────────────────────────────────────────────

  class DeviceIdentityManager {
    constructor() {
      this._deviceId = this._loadOrCreateDeviceId();
      this._fingerprint = null;
    }

    get deviceId() { return this._deviceId; }

    async getFingerprint() {
      if (this._fingerprint) return this._fingerprint;
      this._fingerprint = await this._computeFingerprint();
      return this._fingerprint;
    }

    _loadOrCreateDeviceId() {
      try {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id || id.length < 16) {
          id = this._generateDeviceId();
          localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
      } catch (_) {
        return this._generateDeviceId();
      }
    }

    _generateDeviceId() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return 'dev_' + window.crypto.randomUUID().replace(/-/g, '');
      }
      return 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    }

    async _computeFingerprint() {
      const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
      ].join('|');

      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(components));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
      } catch (_) {
        // Fallback: simple hash
        let hash = 0;
        for (let i = 0; i < components.length; i++) {
          hash = ((hash << 5) - hash + components.charCodeAt(i)) | 0;
        }
        return 'fp_' + Math.abs(hash).toString(36);
      }
    }
  }

  // ─── SessionIdentityCoordinator ──────────────────────────────────────────────

  class SessionIdentityCoordinator {
    constructor(deviceId) {
      this._deviceId = deviceId;
      this._sessionId = this._generateSessionId();
      this._startedAt = Date.now();
    }

    get sessionId() { return this._sessionId; }
    get deviceId() { return this._deviceId; }

    _generateSessionId() {
      return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }

    getIdentity() {
      return {
        deviceId: this._deviceId,
        sessionId: this._sessionId,
        sessionStartedAt: this._startedAt,
        tabId: window.__RealtimeStabilizationLayer
          ? (window.__RealtimeStabilizationLayer._session?.tabId || null)
          : null,
      };
    }
  }

  // ─── TrustedDeviceRegistry ───────────────────────────────────────────────────

  class TrustedDeviceRegistry {
    constructor() {
      this._devices = this._load();
    }

    /**
     * Register/update a device as trusted.
     * Prepares for Phase 2 mesh trust verification.
     */
    trust(deviceId, meta = {}) {
      this._devices[deviceId] = {
        deviceId,
        trustedAt: Date.now(),
        ...meta,
      };
      this._persist();
    }

    isTrusted(deviceId) {
      return !!this._devices[deviceId];
    }

    revoke(deviceId) {
      delete this._devices[deviceId];
      this._persist();
    }

    getAll() { return Object.values(this._devices); }

    _load() {
      try {
        const raw = localStorage.getItem(TRUSTED_DEVICES_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (_) { return {}; }
    }

    _persist() {
      try { localStorage.setItem(TRUSTED_DEVICES_KEY, JSON.stringify(this._devices)); } catch (_) {}
    }
  }

  // ─── ConnectionFingerprintManager ────────────────────────────────────────────

  class ConnectionFingerprintManager {
    constructor(deviceId) {
      this._deviceId = deviceId;
      this._connections = []; // history of connection fingerprints
    }

    /**
     * Create a fingerprint for the current connection.
     * Prepares for Phase 2 peer-verification.
     */
    fingerprintConnection(socketId) {
      const fp = {
        deviceId: this._deviceId,
        socketId,
        timestamp: Date.now(),
        networkType: navigator.connection?.effectiveType || 'unknown',
        ip: null, // populated by server in Phase 2
      };
      this._connections.push(fp);
      if (this._connections.length > 10) this._connections.shift();
      return fp;
    }

    getLatest() {
      return this._connections[this._connections.length - 1] || null;
    }

    getHistory() { return [...this._connections]; }
  }

  // ─── IdentityFoundationLayer (main) ──────────────────────────────────────────

  class IdentityFoundationLayer {
    constructor() {
      this._device = new DeviceIdentityManager();
      this._session = new SessionIdentityCoordinator(this._device.deviceId);
      this._trustedDevices = new TrustedDeviceRegistry();
      this._connectionFP = new ConnectionFingerprintManager(this._device.deviceId);
    }

    async init() {
      const fp = await this._device.getFingerprint();
      console.log(`[IdentityFoundation] ✅ Device ${this._device.deviceId.slice(0, 8)}… FP ${fp.slice(0, 8)}…`);

      // Auto-trust own device
      this._trustedDevices.trust(this._device.deviceId, { self: true });

      // Inject identity into socket connections via EventBus
      const bus = window.KynectaEventBus || window.appEvents;
      if (bus) {
        bus.on('SOCKET_CONNECTED', (payload) => {
          if (payload?.socketId) {
            this._connectionFP.fingerprintConnection(payload.socketId);
          }
        });
        bus.on('SOCKET_EVENT', (payload) => {
          if (payload?.type === 'socket:connected' && payload?.socketId) {
            this._connectionFP.fingerprintConnection(payload.socketId);
          }
        });
      }

      return this;
    }

    getIdentity() { return this._session.getIdentity(); }
    isTrusted(deviceId) { return this._trustedDevices.isTrusted(deviceId); }
    trustDevice(deviceId, meta) { this._trustedDevices.trust(deviceId, meta); }
    getConnectionFingerprint() { return this._connectionFP.getLatest(); }

    getDiagnostics() {
      return {
        deviceId: this._device.deviceId,
        sessionId: this._session.sessionId,
        trustedDevices: this._trustedDevices.getAll().length,
        connectionHistory: this._connectionFP.getHistory().length,
      };
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────────

  const layer = new IdentityFoundationLayer();
  layer.init().then(() => {
    window.__IdentityFoundationLayer = layer;
    window.IdentityFoundation = layer;

    // Expose device ID globally for other modules
    window.__kynDeviceId = layer.getIdentity().deviceId;

    console.log('[IdentityFoundation] ✅ Ready');
  });

  // Expose early (before init completes) for sync access
  window.__IdentityFoundationLayer = layer;
  window.IdentityFoundation = layer;
})();
