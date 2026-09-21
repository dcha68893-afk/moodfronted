#!/usr/bin/env node
/**
 * Verify the PWA chain of a DEPLOYED site (what Chrome actually installs), not the files in git.
 *
 *   node scripts/verify-pwa.js https://your-live-site.example
 *   node scripts/verify-pwa.js http://localhost:5500          (local check)
 *
 * Needs Node 18+ (global fetch). Exit code 1 if any check FAILs.
 * This file lives in /scripts, which scripts/build-config.js excludes from dist/, so it is never deployed.
 */
'use strict';

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//i.test(base)) {
  console.error('Usage: node scripts/verify-pwa.js https://your-live-site.example');
  process.exit(2);
}
const origin = new URL(base).origin;
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(base).hostname);

let fails = 0, warns = 0;
const out = (tag, msg) => console.log(`${tag.padEnd(5)} ${msg}`);
const pass = m => out('PASS', m);
const info = m => out('INFO', m);
const warn = m => { warns++; out('WARN', m); };
const fail = m => { fails++; out('FAIL', m); };
const section = t => console.log(`\n== ${t}`);

async function get(path, opts = {}) {
  const url = path.startsWith('http') ? path : origin + path;
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store', ...opts });
    const buf = Buffer.from(await res.arrayBuffer());
    return { url, status: res.status, headers: res.headers, buf, text: () => buf.toString('utf8'), finalUrl: res.url };
  } catch (e) {
    return { url, status: 0, error: e.message, headers: new Headers(), buf: Buffer.alloc(0), text: () => '' };
  }
}
const ctype = r => (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
const looksHtml = r => /html/.test(ctype(r)) || /^\s*<!doctype html|^\s*<html/i.test(r.text().slice(0, 200));

function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

(async () => {
  console.log(`Checking ${origin}`);

  section('1. Transport');
  if (origin.startsWith('https://') || isLocal) pass(isLocal ? 'localhost (secure context)' : 'HTTPS');
  else fail('Site is not served over HTTPS — Chrome will not offer install or register a service worker.');

  section('2. Pages and manifest link');
  const pages = ['/', '/chat.html', '/Tools.html', '/settings.html'];
  const scriptsByPage = {};
  let manifestHref = null;
  for (const p of pages) {
    const r = await get(p);
    if (r.status !== 200) { p === '/' ? fail(`${p} -> HTTP ${r.status}`) : warn(`${p} -> HTTP ${r.status}`); continue; }
    const html = r.text();
    const link = html.match(/<link[^>]+rel=["']manifest["'][^>]*>/i);
    const href = link && (link[0].match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) { p === '/' || p === '/chat.html' ? fail(`${p}: no <link rel="manifest">`) : warn(`${p}: no <link rel="manifest">`); }
    else {
      const abs = new URL(href, r.finalUrl).pathname;
      if (abs !== '/manifest.json') warn(`${p}: manifest link resolves to ${abs} (expected /manifest.json)`);
      else pass(`${p}: manifest link -> /manifest.json`);
      manifestHref = manifestHref || abs;
    }
    scriptsByPage[p] = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => new URL(m[1], r.finalUrl)).filter(u => u.origin === origin).map(u => u.pathname);
    for (const dead of ['/js/pwa-mobile-install.js', '/js/install-chooser.js']) {
      if (scriptsByPage[p].includes(dead)) fail(`${p}: still loads ${dead} (should be removed)`);
    }
    if (p === '/' || p === '/chat.html') {
      scriptsByPage[p].includes('/pwa-manager.js') ? pass(`${p}: loads /pwa-manager.js`) : fail(`${p}: does not load /pwa-manager.js`);
    }
  }

  section('3. manifest.json');
  const mres = await get(manifestHref || '/manifest.json');
  let manifest = null;
  if (mres.status !== 200) fail(`manifest -> HTTP ${mres.status}`);
  else {
    const ct = ctype(mres);
    /manifest\+json|application\/json/.test(ct) ? pass(`Content-Type ${ct}`) : fail(`manifest Content-Type is "${ct}" (looks like a fallback page?)`);
    try { manifest = JSON.parse(mres.text()); } catch { fail('manifest is not valid JSON'); }
    const cc = mres.headers.get('cache-control');
    info(`Cache-Control: ${cc || '(none)'}`);
    if (cc && /max-age=(\d+)/.test(cc) && Number(RegExp.$1) > 3600) warn('manifest is cacheable for over an hour — stale install identity risk');
  }
  if (manifest) {
    info(`name="${manifest.name}" short_name="${manifest.short_name}" id="${manifest.id || ''}"`);
    manifest.name && manifest.short_name ? pass('name + short_name present') : fail('name/short_name missing');
    manifest.start_url ? pass(`start_url ${manifest.start_url}`) : fail('start_url missing');
    manifest.scope ? pass(`scope ${manifest.scope}`) : warn('scope missing (defaults to start_url directory)');
    if (manifest.start_url && manifest.scope) {
      const s = new URL(manifest.start_url, origin + '/').pathname, sc = new URL(manifest.scope, origin + '/').pathname;
      s.startsWith(sc) ? pass('start_url is inside scope') : fail(`start_url ${s} is outside scope ${sc}`);
    }
    ['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display) ? pass(`display ${manifest.display}`) : fail(`display "${manifest.display}" is not standalone/fullscreen/minimal-ui`);
    if (manifest.prefer_related_applications === true) fail('prefer_related_applications is true — Chrome will not offer the web install');
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    for (const need of [192, 512]) {
      const icon = icons.find(i => String(i.sizes || '').split(/\s+/).includes(`${need}x${need}`) && /png|webp/.test(i.type || ''));
      if (!icon) { fail(`no ${need}x${need} PNG icon declared`); continue; }
      const r = await get(new URL(icon.src, origin + '/').pathname);
      if (r.status !== 200) { fail(`${icon.src} -> HTTP ${r.status}`); continue; }
      const ct = ctype(r);
      if (ct !== (icon.type || 'image/png')) fail(`${icon.src}: served as "${ct}", manifest says "${icon.type}"`);
      const dim = pngSize(r.buf);
      if (!dim) fail(`${icon.src}: not a real PNG (got ${looksHtml(r) ? 'HTML' : 'unknown data'})`);
      else if (dim.w !== need || dim.h !== need) fail(`${icon.src}: declared ${need}x${need} but file is ${dim.w}x${dim.h}`);
      else pass(`${icon.src}: 200, ${ct}, ${dim.w}x${dim.h}, ${(r.buf.length / 1024).toFixed(0)} KB`);
    }
  }

  section('4. Service worker');
  const sw = await get('/service-worker.js');
  if (sw.status !== 200) fail(`/service-worker.js -> HTTP ${sw.status}`);
  else {
    const ct = ctype(sw);
    /javascript|ecmascript/.test(ct) ? pass(`Content-Type ${ct}`) : fail(`service worker Content-Type "${ct}" — Chrome rejects non-JS MIME types`);
    const txt = sw.text();
    /addEventListener\(\s*['"]fetch['"]/.test(txt) ? pass('has a fetch handler') : fail('no fetch handler');
    const ver = (txt.match(/SW_VERSION\s*=\s*['"]([^'"]+)/) || [])[1], cache = (txt.match(/CACHE_NAME\s*=\s*['"]([^'"]+)/) || [])[1];
    info(`deployed SW_VERSION=${ver} CACHE_NAME=${cache}   (this repo expects 19.31.0 / necpa-static-v62)`);
    if (cache && cache !== 'necpa-static-v62') warn('deployed service worker is NOT the consolidated version — an old deploy/cache is still live');
    /\/manifest\\?\.json/.test(txt) ? pass('manifest.json is network-first in the SW') : warn('SW does not list manifest.json as network-first');
    const cc = sw.headers.get('cache-control');
    info(`Cache-Control: ${cc || '(none)'}   Service-Worker-Allowed: ${sw.headers.get('service-worker-allowed') || '(none — fine, script is at /)'}`);
    if (cc && /max-age=(\d+)/.test(cc) && Number(RegExp.$1) >= 86400) warn('service-worker.js has max-age >= 1 day; updates can be delayed');
  }
  const legacy = await get('/sw.js');
  legacy.status === 200 && !looksHtml(legacy)
    ? info('/sw.js exists (retirement stub). Nothing loads it; safe to delete after old installs have migrated.')
    : info(`/sw.js -> HTTP ${legacy.status}`);

  section('5. One install controller');
  const ctl = await get('/pwa-manager.js');
  if (ctl.status !== 200) fail(`/pwa-manager.js -> HTTP ${ctl.status}`);
  else if (!/NecpaPWA/.test(ctl.text())) fail('/pwa-manager.js is the OLD version (no NecpaPWA API) — stale deploy or cache');
  else pass('/pwa-manager.js is the consolidated controller');

  const toScan = new Set(['/pwa-manager.js', '/marketplace-advanced.js', '/main.js']);
  Object.values(scriptsByPage).forEach(list => list.forEach(s => toScan.add(s)));
  const owners = [];
  for (const s of toScan) {
    const r = await get(s);
    if (r.status !== 200 || looksHtml(r)) continue;
    const n = (r.text().match(/addEventListener\(\s*['"]beforeinstallprompt['"]/g) || []).length;
    if (n) owners.push(`${s} (${n})`);
  }
  owners.length === 1 && owners[0].startsWith('/pwa-manager.js')
    ? pass('exactly one file listens for beforeinstallprompt: /pwa-manager.js')
    : fail(`beforeinstallprompt listeners found in: ${owners.join(', ') || 'none'} (expected only /pwa-manager.js)`);

  section('6. Removed files must really be gone');
  for (const gone of ['/js/pwa-mobile-install.js', '/js/install-chooser.js', '/icons/necpra-512.png', '/necpa-512.png']) {
    const r = await get(gone);
    if (r.status === 404) pass(`${gone} -> 404`);
    else if (r.status === 200 && looksHtml(r)) fail(`${gone} -> 200 but it is HTML: the server answers missing files with index.html (the host is rewriting unknown URLs to index.html — restrict the SPA rewrite to extension-less paths)`);
    else warn(`${gone} -> HTTP ${r.status} (old file still deployed)`);
  }
  const miss = await get(`/__missing_${Date.now()}.js`);
  miss.status === 404 ? pass('unknown asset URL -> 404') : fail(`unknown asset URL -> HTTP ${miss.status} ${looksHtml(miss) ? '(index.html fallback)' : ''}`);

  console.log(`\nDone: ${fails} FAIL, ${warns} WARN`);
  process.exit(fails ? 1 : 0);
})();
