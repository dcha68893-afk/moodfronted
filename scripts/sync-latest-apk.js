#!/usr/bin/env node
/**
 * Copies the latest signed Android APK into the static site's download path.
 * Run only during Render builds; GitHub Actions Android builds must not embed
 * the previous APK inside the new APK they are producing.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const outputDir = path.join(ROOT, 'dist', 'download');
const outputFile = path.join(outputDir, 'necpra-android.apk');
const releaseApi = 'https://api.github.com/repos/dcha68893-afk/moodfronted/releases/latest';

async function main() {
  const releaseResponse = await fetch(releaseApi, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Necpra-APK-download-sync'
    },
    signal: AbortSignal.timeout(60000)
  });
  if (!releaseResponse.ok) {
    throw new Error(`GitHub latest-release lookup failed: HTTP ${releaseResponse.status}`);
  }

  const release = await releaseResponse.json();
  const asset = (release.assets || []).find(item => item.name === 'necpra-android.apk');
  if (!asset || !asset.browser_download_url) {
    throw new Error('The latest GitHub Release does not contain necpra-android.apk.');
  }

  const apkResponse = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'Necpra-APK-download-sync' },
    redirect: 'follow',
    signal: AbortSignal.timeout(180000)
  });
  if (!apkResponse.ok) {
    throw new Error(`APK asset download failed: HTTP ${apkResponse.status}`);
  }

  const bytes = Buffer.from(await apkResponse.arrayBuffer());
  if (bytes.length < 1024 * 1024 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('Downloaded APK failed the basic ZIP/signature and size checks.');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, bytes);
  console.log(`[Necpra download] Synced ${asset.name} (${(bytes.length / 1048576).toFixed(2)} MiB) from release ${release.tag_name}.`);
}

main().catch(error => {
  console.error('[Necpra download] Failed to sync the latest APK:', error.message);
  process.exitCode = 1;
});
