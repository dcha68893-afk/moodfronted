#!/usr/bin/env node

/**
 * Necpa frontend build.
 *
 * Browser runtime configuration is generated from .env/deployment variables.
 * Application source must not contain deployment-specific backend URLs.
 *
 * Some legacy modules in this repository are intentionally split across
 * status-core.partN.js / Tool-core.partN.js files. Those files are fragments,
 * not standalone JavaScript programs. They must be joined in order before
 * syntax validation and before the browser receives them.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
    '.git', '.github', 'node_modules', 'android', 'dist', 'scripts',
    'coverage', 'build'
]);
const excludedFiles = new Set([
    '.env', '.env.example', '.gitignore', 'package.json',
    'package-lock.json', 'yarn.lock'
]);

function shouldCopy(relativePath, entry) {
    const parts = relativePath.split(path.sep);
    if (parts.some(part => excludedDirectories.has(part))) return false;
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

const runtimeConfig = `// GENERATED FILE — DO NOT EDIT. Change .env/deployment environment and rebuild.\nwindow.__NEXIPA_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify({ BACKEND_URL, FRONTEND_URL, GOOGLE_CLIENT_ID }, null, 2)});\n`;
fs.mkdirSync(path.join(DIST, 'js'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'js', 'runtime-config.js'), runtimeConfig, 'utf8');

/**
 * Join intentionally split JavaScript modules.
 *
 * A fragment such as status-core.part1.js can legitimately end in the middle
 * of an expression/function and status-core.part2.js continues it. Validating
 * each fragment independently therefore produces false build failures such as
 * "Unexpected end of input". The browser also cannot execute such fragments
 * separately. We create status-core.js / Tool-core.js and remove the fragments
 * from dist. HTML references to the fragments are rewritten to the combined file.
 */
function mergeSplitJavaScriptModules(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const groups = new Map();
    const partPattern = /^(.*)\.part(\d+)\.js$/i;

    for (const entry of entries) {
        const match = entry.isFile() ? entry.name.match(partPattern) : null;
        if (!match) continue;
        const baseName = `${match[1]}.js`;
        const key = path.join(dir, baseName);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({
            part: Number(match[2]),
            file: path.join(dir, entry.name),
            name: entry.name
        });
    }

    let mergedCount = 0;
    for (const [outputFile, parts] of groups) {
        parts.sort((a, b) => a.part - b.part);
        const expected = parts.map((item, index) => index + 1);
        const actual = parts.map(item => item.part);
        if (actual.some((value, index) => value !== expected[index])) {
            throw new Error(`Incomplete split JavaScript module: ${path.relative(ROOT, outputFile)}; found parts ${actual.join(', ')}.`);
        }

        const combined = parts.map(item => fs.readFileSync(item.file, 'utf8')).join('\n');
        fs.writeFileSync(outputFile, combined, 'utf8');
        for (const item of parts) fs.rmSync(item.file, { force: true });
        mergedCount++;
        console.log(`[Necpa build] Merged ${parts.length} fragments -> ${path.relative(ROOT, outputFile)}`);
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) mergedCount += mergeSplitJavaScriptModules(path.join(dir, entry.name));
    }

    return mergedCount;
}

mergeSplitJavaScriptModules(DIST);

function transformBackendUrlLiterals(text, fileName) {
    if (fileName === 'runtime-config.js') return text;
    const urlLiteral = /(["'`])((?:https?:\/\/)(?:[A-Za-z0-9.-]+\.onrender\.com|localhost|127\.0\.0\.1)(?::\d+)?)(\/[^"'`\s]*)?\1/g;
    return text.replace(urlLiteral, (_match, quote, origin, suffix = '') => {
        const cleanSuffix = suffix || '';
        if (/^\/api(?:\/|$)/i.test(cleanSuffix)) return `window.__getApiBase()${cleanSuffix.slice(4)}`;
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
        if (!entry.isFile() || !/\.(js|html)$/i.test(entry.name)) continue;
        const original = fs.readFileSync(file, 'utf8');
        const transformed = transformBackendUrlLiterals(original, entry.name);
        if (transformed !== original) fs.writeFileSync(file, transformed, 'utf8');
    }
}
processArtifacts(DIST);

function rewriteSplitScriptReferences(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            rewriteSplitScriptReferences(file);
            continue;
        }
        if (!entry.isFile() || !/\.html$/i.test(entry.name)) continue;

        const original = fs.readFileSync(file, 'utf8');
        const rewritten = original.replace(/([A-Za-z0-9_.\/-]+)\.part\d+\.js/gi, '$1.js');
        if (rewritten !== original) fs.writeFileSync(file, rewritten, 'utf8');
    }
}
rewriteSplitScriptReferences(DIST);

// Fail the build if a generated JS artifact has invalid syntax. This prevents
// broken JavaScript from ever reaching the deployed static site.
function validateJavaScript(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            validateJavaScript(file);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            try {
                execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
            } catch (error) {
                const detail = error.stderr ? error.stderr.toString() : error.message;
                throw new Error(`Invalid generated JavaScript: ${path.relative(ROOT, file)}\n${detail}`);
            }
        }
    }
}
validateJavaScript(DIST);

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

console.log(`[Necpa build] Backend configured from deployment environment: ${BACKEND_URL}`);
console.log(`[Necpa build] Output: ${DIST}`);
console.log('[Necpa build] Generated JavaScript syntax validation passed.');
