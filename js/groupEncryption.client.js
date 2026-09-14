// groupEncryption.client.js — secure send-boundary wrapper
// The original implementation is retained as groupEncryption.client.legacy.js.
// This wrapper makes the encryption layer authoritative at the actual GroupCore
// send boundary: plaintext is never sent when E2E is enabled, and the outgoing
// payload carries the metadata required by decryptIncoming().

'use strict';

(async function () {
  try {
    // Load the canonical lifecycle/global/timeout guards from the same module
    // graph before waiting for GroupCore. This fixes the race where this
    // classic script could time out because ES-module GroupCore was not yet
    // published on window.
    await import('../group-core-patch.js');
    await import('./groupEncryption.client.legacy.js');

    const waitFor = async (getter, timeout = 12000) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const value = getter();
        if (value) return value;
        await new Promise(r => setTimeout(r, 100));
      }
      return null;
    };

    const e2e = await waitFor(() => window.KynectaGroupE2E);
    if (!e2e) throw new Error('Group E2E engine did not initialize');

    const originalEncryptOutgoing = e2e.encryptOutgoing.bind(e2e);
    e2e.encryptOutgoing = async function secureEncryptOutgoing(groupId, plaintext, memberUserIds) {
      const result = await originalEncryptOutgoing(groupId, plaintext, memberUserIds);
      if (!result?.encrypted || !result?.content || !result?.keyGeneration) {
        throw new Error('Group E2E encryption is not ready; plaintext send blocked');
      }
      return result;
    };

    // NOTE: sending itself (including clientMessageId handling and response
    // unwrapping) is now owned solely by GroupCore.sendGroupMessage in
    // group-core-bootstrap.js, which calls window.KynectaGroupE2E.encryptOutgoing
    // (wrapped above) directly. This file used to also install its own
    // competing copy of the whole send path here — whichever of the two
    // finished installing last silently won, and the losing implementation's
    // behavior (including its own clientMessageId handling) was invisibly
    // discarded. Keeping exactly one canonical send implementation removes
    // that race entirely.

    console.log('[GroupE2E] Secure encrypt boundary installed — plaintext fallback blocked');
  } catch (err) {
    console.error('[GroupE2E] Secure boundary initialization failed:', err?.message || err);
  }
})();
