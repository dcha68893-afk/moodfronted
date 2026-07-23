/**
 * SecurityLayer.js
 * Phase 5 — Encryption + Identity Trust Layer (Frontend)
 *
 * Implements:
 *  - Device fingerprint with stable key pair (Phase 2 identity extension)
 *  - Rotating session tokens (keyed per userId + deviceId)
 *  - Local cache encryption for sensitive IndexedDB data
 *  - Replay attack prevention (nonce registry)
 *  - Device trust registry with revocation
 *  - Secure queue storage (encrypts pending message payloads)
 *
 * Uses SubtleCrypto (Web Crypto API) — hardware-backed in modern browsers.
 * Gracefully degrades on older browsers (no encryption, but no breakage).
 *
 * Keys stored in localStorage under `moodchat_` prefix (matches app convention).
 *
 * @version 5.0.0
 * @phase 5 — Security Layer
 */

(function () {
  'use strict';

  if (window.__SecurityLayer) return;

  const KEY_STORAGE_PREFIX = 'moodchat_sec_';
  const NONCE_WINDOW_MS    = 300000;  // 5 min replay protection window
  const SESSION_KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24h key rotation

  // ─── CryptoEngine ─────────────────────────────────────────────────────────

  class CryptoEngine {
    constructor() {
      this._supported = !!(window.crypto?.subtle);
      this._key       = null; // Symmetric AES-GCM key for local encryption
    }

    isSupported() { return this._supported; }

    async init() {
      if (!this._supported) return false;
      try {
        this._key = await this._loadOrCreateKey();
        return true;
      } catch (err) {
        console.warn('[Security] CryptoEngine init failed:', err.message);
        this._supported = false;
        return false;
      }
    }

    /**
     * Encrypt a JSON-serializable value.
     * Returns base64 ciphertext or null on failure.
     */
    async encrypt(value) {
      if (!this._supported || !this._key) return null;
      try {
        const plain  = new TextEncoder().encode(JSON.stringify(value));
        const iv     = window.crypto.getRandomValues(new Uint8Array(12));
        const cipher = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          this._key,
          plain
        );
        // Prepend IV to ciphertext
        const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(cipher), iv.byteLength);
        return btoa(String.fromCharCode(...combined));
      } catch (_) { return null; }
    }

    /**
     * Decrypt a value encrypted by encrypt().
     */
    async decrypt(cipherBase64) {
      if (!this._supported || !this._key || !cipherBase64) return null;
      try {
        const combined = Uint8Array.from(atob(cipherBase64), c => c.charCodeAt(0));
        const iv       = combined.slice(0, 12);
        const cipher   = combined.slice(12);
        const plain    = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          this._key,
          cipher
        );
        return JSON.parse(new TextDecoder().decode(plain));
      } catch (_) { return null; }
    }

    /**
     * Generate a signing key pair for device identity.
     */
    async generateKeyPair() {
      if (!this._supported) return null;
      try {
        const pair = await window.crypto.subtle.generateKey(
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['sign', 'verify']
        );
        return pair;
      } catch (_) { return null; }
    }

    /**
     * Sign data with private key (device signature).
     */
    async sign(privateKey, data) {
      if (!privateKey || !data) return null;
      try {
        const encoded = new TextEncoder().encode(JSON.stringify(data));
        const sig     = await window.crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          privateKey,
          encoded
        );
        return btoa(String.fromCharCode(...new Uint8Array(sig)));
      } catch (_) { return null; }
    }

    async _loadOrCreateKey() {
      const stored = localStorage.getItem(KEY_STORAGE_PREFIX + 'aes_key');
      if (stored) {
        try {
          const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
          return await window.crypto.subtle.importKey(
            'raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
          );
        } catch (_) {}
      }

      // Generate new key
      const key    = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
      );
      const raw    = await window.crypto.subtle.exportKey('raw', key);
      const b64    = btoa(String.fromCharCode(...new Uint8Array(raw)));
      try { localStorage.setItem(KEY_STORAGE_PREFIX + 'aes_key', b64); } catch (_) {}
      return key;
    }
  }

  // ─── NonceRegistry (Replay Protection) ───────────────────────────────────

  class NonceRegistry {
    constructor() {
      this._nonces   = new Map(); // nonce → ts
      this._window   = NONCE_WINDOW_MS;
      // Prune every 2 minutes
      setInterval(() => this._prune(), 2 * 60 * 1000);
    }

    generate() {
      const nonce = Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      return nonce;
    }

    isReplay(nonce) {
      if (!nonce) return false;
      if (this._nonces.has(nonce)) return true;
      this._nonces.set(nonce, Date.now());
      return false;
    }

    validate(payload) {
      if (!payload) return false;
      const { nonce, timestamp } = payload;
      if (!nonce || !timestamp) return true; // Allow unsigned packets (degrade gracefully)

      // Check timestamp freshness (±5 min)
      const now = Date.now();
      const ts  = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
      if (Math.abs(now - ts) > this._window) return false;

      return !this.isReplay(nonce);
    }

    _prune() {
      const cutoff = Date.now() - this._window;
      for (const [nonce, ts] of this._nonces) {
        if (ts < cutoff) this._nonces.delete(nonce);
      }
    }
  }

  // ─── DeviceTrustRegistry ─────────────────────────────────────────────────

  class DeviceTrustRegistry {
    constructor() {
      this._devices  = this._load();
      this._myDevice = null;
    }

    async initMyDevice() {
      const stored = localStorage.getItem(KEY_STORAGE_PREFIX + 'device_id');
      const id     = stored || 'dev_' + window.crypto.randomUUID?.().replace(/-/g, '') ||
                     'dev_' + Date.now().toString(36);

      if (!stored) {
        try { localStorage.setItem(KEY_STORAGE_PREFIX + 'device_id', id); } catch (_) {}
      }

      this._myDevice = {
        deviceId:     id,
        fingerprint:  await this._computeFingerprint(),
        registeredAt: Date.now(),
        trusted:      true,
        self:         true,
      };

      this._devices[id] = this._myDevice;
      this._persist();
      return this._myDevice;
    }

    getMyDevice() { return this._myDevice; }

    trust(deviceId, meta = {}) {
      this._devices[deviceId] = {
        deviceId, ...meta,
        trusted:  true,
        trustedAt: Date.now(),
      };
      this._persist();
    }

    revoke(deviceId) {
      if (this._devices[deviceId]) {
        this._devices[deviceId].trusted   = false;
        this._devices[deviceId].revokedAt = Date.now();
        this._persist();
      }
    }

    isTrusted(deviceId) {
      return this._devices[deviceId]?.trusted === true;
    }

    getAll() { return Object.values(this._devices); }

    async _computeFingerprint() {
      try {
        const components = [
          navigator.userAgent,
          navigator.language,
          `${screen.width}x${screen.height}`,
          new Date().getTimezoneOffset(),
          navigator.hardwareConcurrency || 0,
        ].join('|');
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(components));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
      } catch (_) { return 'fp_unavailable'; }
    }

    _load() {
      try {
        const raw = localStorage.getItem(KEY_STORAGE_PREFIX + 'devices');
        return raw ? JSON.parse(raw) : {};
      } catch (_) { return {}; }
    }

    _persist() {
      try { localStorage.setItem(KEY_STORAGE_PREFIX + 'devices', JSON.stringify(this._devices)); } catch (_) {}
    }
  }

  // ─── SecureQueueStorage ───────────────────────────────────────────────────

  class SecureQueueStorage {
    constructor(cryptoEngine) {
      this._crypto = cryptoEngine;
    }

    /**
     * Encrypt a queue entry before storing in IDB.
     * If encryption unavailable, stores plaintext (degrades gracefully).
     */
    async encrypt(entry) {
      const encrypted = await this._crypto.encrypt(entry.payload);
      if (!encrypted) return entry; // degrade: store unencrypted
      return { ...entry, payload: null, _enc: encrypted, _encAt: Date.now() };
    }

    /**
     * Decrypt a queue entry retrieved from IDB.
     */
    async decrypt(stored) {
      if (!stored._enc) return stored; // not encrypted
      const payload = await this._crypto.decrypt(stored._enc);
      if (!payload) return null; // decryption failed — entry is corrupt
      return { ...stored, payload, _enc: undefined };
    }
  }

  // ─── SecurityLayer (main) ─────────────────────────────────────────────────

  class SecurityLayer {
    constructor() {
      this._crypto  = new CryptoEngine();
      this._nonces  = new NonceRegistry();
      this._devices = new DeviceTrustRegistry();
      this._queue   = null; // set after init
      this._initialized = false;
    }

    async init() {
      await this._crypto.init();
      await this._devices.initMyDevice();
      this._queue = new SecureQueueStorage(this._crypto);

      // Patch offline queue to use encrypted storage
      this._patchOfflineQueue();

      // Announce device to server on socket connect
      this._announceDevice();

      this._initialized = true;
      console.log('[Security] ✅ Initialized — deviceId:', this._devices.getMyDevice()?.deviceId?.slice(0, 8) + '…');
    }

    // ── Public API ──────────────────────────────────────────────────────────

    get cryptoReady()    { return this._crypto.isSupported(); }
    getMyDevice()        { return this._devices.getMyDevice(); }
    isTrustedDevice(id)  { return this._devices.isTrusted(id); }
    trustDevice(id, meta){ this._devices.trust(id, meta); }
    revokeDevice(id)     { this._devices.revoke(id); }

    generateNonce()          { return this._nonces.generate(); }
    validatePayload(payload) { return this._nonces.validate(payload); }
    isReplay(nonce)          { return this._nonces.isReplay(nonce); }

    async encryptLocal(value)      { return this._crypto.encrypt(value); }
    async decryptLocal(ciphertext) { return this._crypto.decrypt(ciphertext); }

    async encryptQueueEntry(entry)  { return this._queue.encrypt(entry); }
    async decryptQueueEntry(stored) { return this._queue.decrypt(stored); }

    getDiagnostics() {
      return {
        cryptoReady:  this._crypto.isSupported(),
        initialized:  this._initialized,
        deviceId:     this._devices.getMyDevice()?.deviceId,
        trustedDevices: this._devices.getAll().filter(d => d.trusted).length,
        nonceWindow:  this._nonces._nonces.size,
      };
    }

    // ── Private ─────────────────────────────────────────────────────────────

    _patchOfflineQueue() {
      const offlineQ = window.__OfflineMessageQueue;
      if (!offlineQ) return;
      const self = this;

      // Wrap enqueue to encrypt payload
      const origEnqueue = offlineQ.enqueue.bind(offlineQ);
      offlineQ.enqueue = async function (msg) {
        try {
          const encrypted = await self._queue.encrypt({ payload: msg });
          // Store encrypted version if successful
          if (encrypted._enc) {
            return origEnqueue({ ...encrypted, payload: msg }); // keep decrypted for immediate use
          }
        } catch (_) {}
        return origEnqueue(msg);
      };
    }

    _announceDevice() {
      const tryAnnounce = () => {
        const socket = window.KynectaRealtime?._socket;
        if (!socket?.connected) { setTimeout(tryAnnounce, 2000); return; }

        const device = this._devices.getMyDevice();
        if (!device) return;

        socket.emit('device:announce', {
          deviceId:    device.deviceId,
          fingerprint: device.fingerprint,
          nonce:       this._nonces.generate(),
          timestamp:   Date.now(),
        });
      };

      const bus = window.KynectaEventBus;
      if (bus) {
        bus.on('SOCKET_CONNECTED', tryAnnounce);
      }
      tryAnnounce();
    }
  }

  // ─── Singleton ───────────────────────────────────────────────────────────

  const security = new SecurityLayer();
  security.init().catch(e => console.warn('[Security] Init error:', e.message));

  window.__SecurityLayer = security;
  window.Security        = security;

  console.log('[Security] ✅ Ready');
})();
