'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'duka.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'features/duka/duka.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'js/voice/necpra-voice-shell.js'), 'utf8');

test('DUKA loads its separated presentation and application files', () => {
  assert.match(page, /features\/duka\/duka\.css/);
  assert.match(page, /features\/duka\/duka\.js/);
});

test('DUKA has no second microphone entry point and uses the universal voice session', () => {
  assert.doesNotMatch(app, /data-act="vaMic"/);
  assert.doesNotMatch(app, /vaFab\(\)/);
  assert.match(page, /NecpraVoiceInit\.start\(\{fab:!dukaEmbedded\}\)/);
  assert.match(page, /NecpraVoiceRemote\.onIntent/);
  assert.match(app, /window\.NecpraVoiceRemote\.speak/);
});

test('universal voice routes DUKA operations and DUKA keeps the corresponding workflows', () => {
  for (const phrase of ['held bills?', 'receive stock', 'supplier registration', 'group order', 'stock loss', 'sync status']) {
    assert.ok(shell.includes(phrase), 'missing universal voice route: ' + phrase);
  }
  for (const phrase of ['function vExtra', 'function gbNew', 'function openAddSupplier', 'function wsLoss', 'function openSyncStatus', 'function wsBatch', 'function openScan']) {
    assert.ok(app.includes(phrase), 'missing DUKA command workflow: ' + phrase);
  }
});

test('shop and offline metadata keys are scoped to the authenticated user', () => {
  assert.ok(app.includes('function dukaStorageKey(base)'));
  assert.ok(app.includes("necpra_duka_outbox_v1:' + (curUid() || 'unknown')"));
  assert.ok(app.includes("localStorage.getItem(dukaStorageKey('necpra_duka_autoshop'))"));
});

test('external M-PESA receipts remain pending until owner confirmation', () => {
  assert.ok(app.includes('pendingPayments'));
  assert.ok(app.includes('pending_manual'));
  assert.ok(app.includes('confirmManualMpesaSave'));
});

test('universal voice sends product-count questions to DUKA and answers from live shop products', () => {
  assert.match(shell, /dukaInventoryQuestion/);
  assert.match(shell, /answered-inventory/);
  assert.match(app, /Answer inventory totals directly from this signed-in shop/);
  assert.match(app, /await vStock\(\{ query: '' \}\)/);
});

test('DUKA does not render the old Marketplace header tabs in the app shell', () => {
  const chat = fs.readFileSync(path.join(root, 'chat.html'), 'utf8');
  assert.doesNotMatch(chat, /data-tools-page="(?:categories|cart|wishlist|account)"/);
  assert.match(chat, /DUKA has its own shop navigation/);
  assert.match(chat, /headerActionsEl\.classList\.add\('hidden'\)/);
});
