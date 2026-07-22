#!/usr/bin/env node
/**
 * build.js — reassembles calls-core.js from the 8 files in src/
 *
 * WHY THIS EXISTS
 * calls-core.js is one big `(function(){ ... })()` — every part of it
 * (session handling, transport, WebRTC, state governors, UI bridge, etc.)
 * shares that single closure's variables. That's WHY the original file
 * grew to 39,813 lines: nobody could safely cut it into independently
 * loaded <script> files without either (a) breaking shared state, or
 * (b) doing a much larger rewrite to real ES modules with explicit
 * imports/exports — which is a separate, riskier project on its own.
 *
 * So this split takes the safe route: the 40k lines now live as 8
 * clearly-scoped source files under src/ (each with a header describing
 * exactly what it contains), and this script glues them back into the
 * single calls-core.js the app actually loads — in the same order,
 * producing behavior IDENTICAL to the original file. Bug fixing now
 * means opening the 1-5k line file that owns the area you're touching,
 * instead of scrolling a 40k line file.
 *
 * USAGE
 *   node build.js
 * Regenerates ../calls-core.js from src/*.js. Run this after editing
 * any file in src/ and before deploying/committing calls-core.js.
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'calls-core.src');
const OUT_FILE = path.join(__dirname, 'calls-core.js');

const ORDER = [
  '01-bootstrap-session',
  '02-handshake-messaging',
  '03-state-core-logging',
  '04-transport-signaling',
  '05-media-webrtc',
  '06-state-governors',
  '07-reliability-orchestration',
  '08-uibridge-publicapi-init',
];

const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.js'));

const ordered = ORDER.map((suffix, i) => {
  const match = files.find(f => f.includes(`part${i}.${suffix}`));
  if (!match) {
    throw new Error(`Missing source part ${i} (${suffix}) in src/ — build aborted.`);
  }
  return path.join(SRC_DIR, match);
});

const combined = ordered.map(f => fs.readFileSync(f, 'utf8')).join('');
fs.writeFileSync(OUT_FILE, combined, 'utf8');

console.log(`Built ${OUT_FILE} from ${ordered.length} parts (${combined.length} bytes).`);
