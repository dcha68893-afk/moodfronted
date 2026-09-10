// groupEncryption.client.js — secure send-boundary wrapper
// The original implementation is retained as groupEncryption.client.legacy.js.
// This wrapper makes the encryption layer authoritative at the actual GroupCore
// send boundary: plaintext is never sent when E2E is enabled, and the outgoing
// payload carries the metadata required by decryptIncoming().

'use strict';

(async function () {
  try {
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

    // Never allow the legacy helper's plaintext fallback to cross the network.
    const originalEncryptOutgoing = e2e.encryptOutgoing.bind(e2e);
    e2e.encryptOutgoing = async function secureEncryptOutgoing(groupId, plaintext, memberUserIds) {
      const result = await originalEncryptOutgoing(groupId, plaintext, memberUserIds);
      if (!result?.encrypted || !result?.content || !result?.keyGeneration) {
        throw new Error('Group E2E encryption is not ready; plaintext send blocked');
      }
      return result;
    };

    const GC = await waitFor(() => window.GroupCore);
    if (!GC) throw new Error('GroupCore did not initialize');

    // group-core-patch.js installs the final sendGroupMessage implementation
    // after GroupCore loads. Wait for that method, then own the final network
    // boundary so every text send is encrypted before POST /groups/:id/messages.
    await waitFor(() => typeof GC.sendGroupMessage === 'function');
    const originalSend = GC.sendGroupMessage.bind(GC);
    if (GC.sendGroupMessage.__groupE2ESecureBoundary) return;

    GC.sendGroupMessage = async function secureGroupSend(groupId, plaintext, topic = null, anonymous = false, clientMessageId = null) {
      if (!groupId || !String(plaintext || '').trim()) return { success: false, error: 'Missing groupId or content' };

      const members = await (typeof window.KynectaGroupE2E._fetchGroupMemberIds === 'function'
        ? window.KynectaGroupE2E._fetchGroupMemberIds(groupId)
        : undefined);
      const encrypted = await window.KynectaGroupE2E.encryptOutgoing(groupId, plaintext, members);

      const cid = clientMessageId || (window.crypto?.randomUUID?.() || `cid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      const baseRaw = window.__kynAPI?.baseUrl || window.__API_BASE_URL || window.API_BASE_URL || 'https://noxopa.onrender.com/api';
      const base = String(baseRaw).replace(/\/$/, '').endsWith('/api') ? String(baseRaw).replace(/\/$/, '') : `${String(baseRaw).replace(/\/$/, '')}/api`;
      const token = window.AuthStorage?.getToken?.() || localStorage.getItem('accessToken') || localStorage.getItem('authToken') || localStorage.getItem('token') || '';

      const response = await fetch(`${base}/groups/${groupId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({
          content: encrypted.content,
          type: 'text',
          topic,
          anonymous,
          clientMessageId: cid,
          metadata: { encrypted: true, keyGeneration: encrypted.keyGeneration }
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.message || body?.error || `Group send failed (${response.status})`);

      const message = body?.data?.message || body?.data?.data?.message || body?.data || body?.message;
      if (message?.id) {
        this.addGroupMessage?.(groupId, message);
        this.emit?.('group:message-received', { groupId, message });
        this.emit?.('group:message-sent', { groupId, message });
      }
      return { success: true, data: message };
    };
    GC.sendGroupMessage.__groupE2ESecureBoundary = true;

    console.log('[GroupE2E] Secure send boundary installed — plaintext fallback blocked');
  } catch (err) {
    console.error('[GroupE2E] Secure boundary initialization failed:', err?.message || err);
  }
})();
