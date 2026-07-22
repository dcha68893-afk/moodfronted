#!/usr/bin/env node
/**
 * build.js — reassembles calls-ui.js from the 3 files in src/
 *
 * Same approach as calls-core.js's split: calls-ui.js is one shared scope,
 * so these 3 parts are SOURCE fragments, not independently loadable scripts.
 * This concatenates them in order into the single calls-ui.js the app
 * actually serves — verified byte-identical to the original file (once you
 * strip the new header comments), so runtime behavior is unchanged.
 *
 * USAGE
 *   node build.js
 * Regenerates ../calls-ui.js from src/*.js. Run after editing any file
 * in src/, then commit/deploy calls-ui.js exactly as before.
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'calls-ui.src');
const OUT_FILE = path.join(__dirname, 'calls-ui.js');

const ORDER = [
  'foundation-rendering',
  'integration-events',
  'panels-init-exports',
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
