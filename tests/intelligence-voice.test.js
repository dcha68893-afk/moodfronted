'use strict';
// NECPRA Intelligence <-> Universal Voice integration (client side). Loads the REAL necpra-voice-understand.js with a fake voice engine and fake fetch.
const test = require('node:test'); const assert = require('node:assert');

function load({ online = true, enabled = true, ask } = {}) {
  const spoken = [], audits = [], calls = [];
  const V = { getSettings: () => ({ smart: true }), speak: (t, o) => spoken.push([t, o]), audit: (a, d) => audits.push([a, d]),
    _cfg: () => ({ apiBase: 'https://api.test', getToken: () => 'tok' }) };
  const g = { NecpraVoice: V, console,
    fetch: async (url, opts) => { calls.push(url); const json = async () => (url.endsWith('/config') ? { ok: true, enabled } : ask(JSON.parse(opts.body)));
      return { ok: true, status: 200, json }; },
    setTimeout, clearTimeout, AbortController };
  delete require.cache[require.resolve('../js/voice/necpra-voice-understand.js')];
  const saved = {}; for (const k of Object.keys(g)) { saved[k] = globalThis[k]; try { globalThis[k] = g[k]; } catch (_) {} }
  // Node 22 has its own read-only global `navigator`, so plain assignment is silently ignored: define it explicitly and restore it afterwards.
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: online }, configurable: true, writable: true });
  const mod = require('../js/voice/necpra-voice-understand.js');
  const restore = () => { if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator; for (const k of Object.keys(saved)) { try { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; } catch (_) {} } };
  return { mod, spoken, audits, calls, restore };
}

test('a data answer is spoken back, and the request goes to OUR engine (no third-party AI)', async () => {
  const t = load({ ask: async (b) => ({ ok: true, type: 'answer', say: 'Net profit this month: KES 1,200.', source: 'retrieved', received: b }) });
  try {
    const r = await t.mod.rewrite({ transcript: 'how much profit this month', lang: 'en-KE' }, 'money');
    assert.deepEqual(r, { spoken: true }); assert.equal(t.spoken[0][0], 'Net profit this month: KES 1,200.');
    assert.ok(t.calls.every((u) => u.startsWith('https://api.test/api/intelligence/')), 'only the NECPRA backend is called: ' + t.calls);
    assert.ok(!t.calls.some((u) => /anthropic|openai|googleapis/i.test(u)));
  } finally { t.restore(); }
});
test('an action becomes a canonical phrase for the existing on-screen handlers (which still confirm)', async () => {
  const t = load({ ask: async () => ({ ok: true, type: 'prepare', phrase: 'send 500 to Wanjiru', module: 'money', say: 'I have not done anything yet.' }) });
  try { const r = await t.mod.rewrite({ transcript: 'tuma 500 kwa Wanjiru' }, 'messages'); assert.deepEqual(r, { phrase: 'send 500 to Wanjiru', module: 'money' }); assert.equal(t.spoken.length, 0, 'nothing is spoken as if it were done'); } finally { t.restore(); }
});
test('a clarifying question is spoken, not guessed', async () => {
  const t = load({ ask: async () => ({ ok: true, type: 'clarify', say: 'Who should it go to?' }) });
  try { assert.deepEqual(await t.mod.rewrite({ transcript: 'send 500' }, 'money'), { spoken: true }); assert.equal(t.spoken[0][0], 'Who should it go to?'); } finally { t.restore(); }
});
test('unknown request -> null so the old honest behaviour continues', async () => {
  const t = load({ ask: async () => ({ ok: true, type: 'unknown', say: "I didn't understand that." }) });
  try { assert.equal(await t.mod.rewrite({ transcript: 'tell me a joke' }, 'money'), null); assert.equal(t.spoken.length, 0); } finally { t.restore(); }
});
test('offline -> no network call at all', async () => {
  const t = load({ online: false, ask: async () => { throw new Error('must not be called'); } });
  try { assert.equal(await t.mod.rewrite({ transcript: 'how much profit' }, 'money'), null); assert.equal(t.calls.length, 0); } finally { t.restore(); }
});
test('engine switched off on the server -> silent no-op', async () => {
  const t = load({ enabled: false, ask: async () => { throw new Error('must not be called'); } });
  try { assert.equal(await t.mod.rewrite({ transcript: 'how much profit' }, 'money'), null); assert.ok(!t.calls.some((u) => u.endsWith('/ask'))); } finally { t.restore(); }
});
test('over-long text is never sent', async () => {
  const t = load({ ask: async () => ({ ok: true, type: 'answer', say: 'x' }) });
  try { assert.equal(await t.mod.rewrite({ transcript: 'a'.repeat(301) }, 'money'), null); assert.equal(t.calls.length, 0); } finally { t.restore(); }
});
