#!/usr/bin/env node

/**
 * Nexipa frontend build
 *
 * The browser cannot read .env directly. This build step is the single bridge:
 * .env / deployment environment -> generated runtime-config.js -> browser.
 *
 * Change BACKEND_URL in .env, rebuild, and every generated frontend module uses
 * the new value. No application source URL needs to be edited.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ENV_FILE = path.join(ROOT, '.env');

function parseEnvFile(file) {
    const values = {};
    if (!fs.existsSync(file)) return values;

    const text = fs.readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        values[match[1]] = value;
    }
    return values;
}

const fileEnv = parseEnvFile(ENV_FILE);
const env = { ...fileEnv, ...process.env };

function required(name) {
    const value = String(env[name] || '').trim();
    if (!value) throw new Error(`${name} is required. Set it in .env or the deployment environment.`);
    return value.replace(/\/+$/, '');
}

const BACKEND_URL = required('BACKEND_URL');
const FRONTEND_URL = String(env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
const GOOGLE_CLIENT_ID = String(env.GOOGLE_CLIENT_ID || '').trim();

if (!/^https?:\/\//i.test(BACKEND_URL)) {
    throw new Error('BACKEND_URL must be an absolute http(s) URL.');
}

function removeIfExists(target) {
    fs.rmSync(target, { recursive: true, force: true });
}

removeIfExists(DIST);
fs.mkdirSync(DIST, { recursive: true });

const excludedDirectories = new Set([
    '.git', '.github', 'node_modules', 'android', 'dist', 'scripts', 'coverage', 'build'
]);
const excludedFiles = new Set([
    '.env', '.env.example', '.gitignore', 'package.json', 'package-lock.json', 'yarn.lock'
]);

function shouldCopy(relativePath, entry) {
    const parts = relativePath.split(path.sep);
    if (parts.some((part) => excludedDirectories.has(part))) return false;
    if (entry.isFile() && excludedFiles.has(entry.name)) return false;
    return true;
}

function copyTree(sourceDir, targetDir, relative = '') {
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const rel = relative ? path.join(relative, entry.name) : entry.name;
        if (!shouldCopy(rel, entry)) continue;

        const source = path.join(sourceDir, entry.name);
        const target = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            fs.mkdirSync(target, { recursive: true });
            copyTree(source, target, rel);
        } else if (entry.isFile()) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(source, target);
        }
    }
}

copyTree(ROOT, DIST);

const runtimeConfig = `// GENERATED FILE — DO NOT EDIT. Change .env and run the frontend build.\nwindow.__NEXIPA_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify({
    BACKEND_URL,
    FRONTEND_URL,
    GOOGLE_CLIENT_ID
}, null, 2)});\n`;

fs.writeFileSync(path.join(DIST, 'js', 'runtime-config.js'), runtimeConfig, 'utf8');

function transformBackendUrlLiterals(text, fileName) {
    if (fileName === 'runtime-config.js') return text;

    // Rewrite backend/local API URL literals in the build artifact only.
    // External services such as Google and Cloudinary are intentionally untouched.
    const urlLiteral = /(["'`])((?:https?:\/\/)(?:[A-Za-z0-9.-]+\.onrender\.com|localhost|127\.0\.0\.1)(?::\d+)?)(\/[^"'`\s]*)?\1/g;

    return text.replace(urlLiteral, (_match, quote, origin, suffix = '') => {
        const cleanSuffix = suffix || '';
        if (/^\/api(?:\/|$)/i.test(cleanSuffix)) {
            const rest = cleanSuffix.slice(4);
            return `window.__getApiBase()${rest}`;
        }
        return `window.__getApiOrigin()${cleanSuffix}`;
    });
}

function processArtifacts(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            processArtifacts(file);
            continue;
        }
        if (!entry.isFile()) continue;
        if (!/\.(js|html)$/i.test(entry.name)) continue;

        const original = fs.readFileSync(file, 'utf8');
        const transformed = transformBackendUrlLiterals(original, entry.name);
        if (transformed !== original) fs.writeFileSync(file, transformed, 'utf8');
    }
}

processArtifacts(DIST);

// Make runtime-config available before application configuration on every page.
function injectRuntimeConfig(html) {
    if (html.includes('/js/runtime-config.js')) return html;
    const tag = '<script src="/js/runtime-config.js"></script>\n';
    if (/<head[^>]*>/i.test(html)) return html.replace(/(<head[^>]*>)/i, `$1\n    ${tag}`);
    return `${tag}${html}`;
}

function processHtml(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            processHtml(file);
            continue;
        }
        if (!entry.isFile() || !/\.html$/i.test(entry.name)) continue;
        const html = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, injectRuntimeConfig(html), 'utf8');
    }
}

processHtml(DIST);

console.log(`[Nexipa build] Backend configured from .env: ${BACKEND_URL}`);
console.log(`[Nexipa build] Output: ${DIST}`);
console.log('[Nexipa build] Frontend URL literals have been redirected to runtime configuration.');
