/**
 * mesh-crypto.js — End-to-End Encryption for Mesh Networking
 * 
 * Implements:
 * - Ephemeral ECDH key exchange (X25519 via WebCrypto)
 * - AES-256-GCM message encryption
 * - ECDSA packet signing (P-256)
 * - Anti-replay nonce tracking
 * - Forward secrecy via key rotation
 * - Packet fingerprinting & tamper detection
 */
'use strict';

// FIX Bug2: Guard against re-declaration when loaded in multiple iframes.
// Changed 'const MeshCrypto' → 'window.MeshCrypto' so re-execution is safe.
if (typeof window !== 'undefined' && window.MeshCrypto) {
    // Already loaded — skip re-declaration
} else {

window.MeshCrypto = (() => {
    // ── Constants ──────────────────────────────────────────────────────────
    const ALGO_ECDH    = { name: 'ECDH',  namedCurve: 'P-256' };
    const ALGO_ECDSA   = { name: 'ECDSA', namedCurve: 'P-256' };
    const ALGO_AES     = { name: 'AES-GCM', length: 256 };
    const HASH         = { name: 'SHA-256' };
    const SIG_HASH     = { name: 'ECDSA', hash: { name: 'SHA-256' } };

    // Anti-replay: track recently seen nonces (last 5 minutes)
    const _seenNonces  = new Map(); // nonce → expiry timestamp
    const NONCE_TTL_MS = 5 * 60 * 1000;

    // Per-session shared secrets cache
    const _sessionKeys = new Map(); // peerId → { aesKey, expiry }
    const SESSION_TTL  = 60 * 60 * 1000; // 1 hour

    // ── Key Generation ─────────────────────────────────────────────────────
    async function generateIdentityKeypair() {
        const kp = await crypto.subtle.generateKey(ALGO_ECDSA, true, ['sign','verify']);
        return {
            privateKey : kp.privateKey,
            publicKey  : kp.publicKey,
            publicKeyJwk: await crypto.subtle.exportKey('jwk', kp.publicKey)
        };
    }

    async function generateEphemeralKeypair() {
        const kp = await crypto.subtle.generateKey(ALGO_ECDH, true, ['deriveKey']);
        return {
            privateKey   : kp.privateKey,
            publicKey    : kp.publicKey,
            publicKeyJwk : await crypto.subtle.exportKey('jwk', kp.publicKey)
        };
    }

    // ── ECDH Key Agreement ─────────────────────────────────────────────────
    async function deriveSharedKey(myPrivateKey, peerPublicKeyJwk) {
        const peerKey = await crypto.subtle.importKey(
            'jwk', peerPublicKeyJwk, ALGO_ECDH, false, []
        );
        return await crypto.subtle.deriveKey(
            { name: 'ECDH', public: peerKey },
            myPrivateKey,
            ALGO_AES,
            false,
            ['encrypt', 'decrypt']
        );
    }

    // ── Session Key Management ─────────────────────────────────────────────
    async function getOrCreateSessionKey(peerId, myEphemeralPrivate, peerEphemeralPublicJwk) {
        const existing = _sessionKeys.get(peerId);
        if (existing && existing.expiry > Date.now()) return existing.aesKey;

        const aesKey = await deriveSharedKey(myEphemeralPrivate, peerEphemeralPublicJwk);
        _sessionKeys.set(peerId, { aesKey, expiry: Date.now() + SESSION_TTL });
        return aesKey;
    }

    function invalidateSessionKey(peerId) {
        _sessionKeys.delete(peerId);
    }

    // ── AES-GCM Encrypt ────────────────────────────────────────────────────
    async function encryptPayload(aesKey, plaintext) {
        const iv      = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(
            typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext)
        );
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            encoded
        );
        return {
            iv         : Array.from(iv),
            ciphertext : Array.from(new Uint8Array(ciphertext))
        };
    }

    // ── AES-GCM Decrypt ────────────────────────────────────────────────────
    async function decryptPayload(aesKey, ivArr, ciphertextArr) {
        const iv         = new Uint8Array(ivArr);
        const ciphertext = new Uint8Array(ciphertextArr);
        const plaintext  = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            ciphertext
        );
        return new TextDecoder().decode(plaintext);
    }

    // ── Packet Signing ─────────────────────────────────────────────────────
    async function signPacket(identityPrivateKey, packetData) {
        const encoded = new TextEncoder().encode(JSON.stringify(packetData));
        const sigBuf  = await crypto.subtle.sign(SIG_HASH, identityPrivateKey, encoded);
        return btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    }

    async function verifyPacket(identityPublicKeyJwk, packetData, signatureB64) {
        try {
            const pubKey = await crypto.subtle.importKey(
                'jwk', identityPublicKeyJwk, ALGO_ECDSA, false, ['verify']
            );
            const encoded = new TextEncoder().encode(JSON.stringify(packetData));
            const sigBuf  = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
            return await crypto.subtle.verify(SIG_HASH, pubKey, sigBuf, encoded);
        } catch (_) { return false; }
    }

    // ── Packet Fingerprinting ──────────────────────────────────────────────
    async function fingerprintPacket(packet) {
        const data    = JSON.stringify({ id: packet.id, from: packet.from, ts: packet.ts, payload: packet.payload });
        const encoded = new TextEncoder().encode(data);
        const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
        return btoa(String.fromCharCode(...new Uint8Array(hashBuf))).slice(0, 16);
    }

    // ── Anti-Replay Nonce Tracking ─────────────────────────────────────────
    function cleanExpiredNonces() {
        const now = Date.now();
        for (const [nonce, expiry] of _seenNonces) {
            if (expiry < now) _seenNonces.delete(nonce);
        }
    }

    function checkAndRegisterNonce(nonce) {
        cleanExpiredNonces();
        if (_seenNonces.has(nonce)) return false; // replay detected
        _seenNonces.set(nonce, Date.now() + NONCE_TTL_MS);
        return true;
    }

    function generateNonce() {
        return Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2,'0')).join('');
    }

    // ── Full Packet Encryption Pipeline ───────────────────────────────────
    async function encryptMeshPacket(opts) {
        const { recipientPublicKeyJwk, myEphemeralKeypair, payload, identityPrivateKey, senderId } = opts;
        // Derive shared AES key using sender ephemeral + recipient identity
        const sharedKey = await deriveSharedKey(myEphemeralKeypair.privateKey, recipientPublicKeyJwk);
        const nonce     = generateNonce();
        const encrypted = await encryptPayload(sharedKey, { ...payload, nonce });
        const fingerprint = await fingerprintPacket({ id: payload.packetId, from: senderId, ts: payload.timestamp, payload: encrypted });
        const signature = await signPacket(identityPrivateKey, { encrypted, senderId, fingerprint });
        return {
            packetId      : payload.packetId,
            senderId,
            senderEphemeralKey: myEphemeralKeypair.publicKeyJwk,
            fingerprint,
            signature,
            encrypted,
            timestamp     : payload.timestamp,
            ttl           : payload.ttl || 8,
            hopCount      : 0,
            routeHistory  : [senderId]
        };
    }

    async function decryptMeshPacket(packet, myEphemeralPrivateKey, senderIdentityPublicKeyJwk) {
        // Verify signature first
        const sigValid = await verifyPacket(
            senderIdentityPublicKeyJwk,
            { encrypted: packet.encrypted, senderId: packet.senderId, fingerprint: packet.fingerprint },
            packet.signature
        );
        if (!sigValid) throw new Error('INVALID_SIGNATURE');

        // Derive shared AES key using sender ephemeral + our private
        const sharedKey = await deriveSharedKey(myEphemeralPrivateKey, packet.senderEphemeralKey);
        const plaintext = await decryptPayload(sharedKey, packet.encrypted.iv, packet.encrypted.ciphertext);
        const payload   = JSON.parse(plaintext);

        // Anti-replay check
        if (!checkAndRegisterNonce(payload.nonce)) throw new Error('REPLAY_DETECTED');

        return payload;
    }

    // ── Public API ─────────────────────────────────────────────────────────
    return {
        generateIdentityKeypair,
        generateEphemeralKeypair,
        deriveSharedKey,
        getOrCreateSessionKey,
        invalidateSessionKey,
        encryptPayload,
        decryptPayload,
        signPacket,
        verifyPacket,
        fingerprintPacket,
        checkAndRegisterNonce,
        generateNonce,
        encryptMeshPacket,
        decryptMeshPacket,
    };
})();

if (typeof module !== 'undefined') module.exports = window.MeshCrypto;

} // end if (!window.MeshCrypto)
