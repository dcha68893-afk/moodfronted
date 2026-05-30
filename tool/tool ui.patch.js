/**
 * tool-ui-patch.js  —  FIXED: UI click handlers, settings subscriber, result rendering
 * ─────────────────────────────────────────────────────────────────────────────────────
 * FIX LOG:
 *  [1] Listens to tools:tool-clicked → custom result panel rendering per tool
 *  [2] Listens to tools:manifest-loaded → refreshes category tabs without full page reload
 *  [3] Listens to tools:ready → marks tool count badge
 *  [4] applyToolSettings() integration via AppSettings.subscribe
 *  [5] Inline tool result cards for common tools (password, UUID, hash, base64, JSON)
 *
 * This patch is PURELY additive — it attaches listeners and never overwrites
 * existing Tool-ui.js exports. Drop it in after Tool-ui.js.
 */

(function ToolUiFixPatch() {
    'use strict';

    if (window.__TOOL_UI_PATCH_LOADED__) return;
    window.__TOOL_UI_PATCH_LOADED__ = true;

    // ── Helpers ───────────────────────────────────────────────────────────────

    function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function toast(msg, type = 'info') {
        // Try the existing showNotification if present
        if (typeof window.showNotification === 'function') {
            return window.showNotification(msg, type);
        }
        const div       = document.createElement('div');
        div.className   = `knt-toast knt-toast--${type}`;
        div.textContent = msg;
        div.style.cssText= 'position:fixed;bottom:20px;right:20px;padding:10px 16px;border-radius:8px;background:#1a1a2e;color:#fff;z-index:9999;font-size:14px;max-width:320px;box-shadow:0 4px 12px rgba(0,0,0,.3)';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 3500);
    }

    function copyToClipboard(text) {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success')).catch(() => _legacyCopy(text));
        } else {
            _legacyCopy(text);
        }
    }

    function _legacyCopy(text) {
        const ta   = document.createElement('textarea');
        ta.value   = text;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); toast('Copied!', 'success'); } catch { toast('Copy failed', 'error'); }
        ta.remove();
    }

    // ── Result renderers per tool ─────────────────────────────────────────────

    const RESULT_RENDERERS = {

        'password-generate': ({ result }) => {
            if (!result?.password) return null;
            return `
                <div class="tool-result-card">
                    <div class="tool-result-card__label">Generated Password</div>
                    <div class="tool-result-card__value tool-result-card__value--mono">${esc(result.password)}</div>
                    <div class="tool-result-card__meta">Length: ${result.length} · Strength: ${esc(result.strength || '—')}</div>
                    <button class="btn btn--sm btn--ghost tool-result-copy" data-copy="${esc(result.password)}">📋 Copy</button>
                </div>`;
        },

        'uuid-generate': ({ result }) => {
            const uuids = result?.uuids || [];
            return `
                <div class="tool-result-card">
                    <div class="tool-result-card__label">UUID${uuids.length > 1 ? 's' : ''}</div>
                    ${uuids.map(u => `<div class="tool-result-card__value tool-result-card__value--mono">${esc(u)}<button class="btn btn--icon tool-result-copy" data-copy="${esc(u)}" title="Copy">📋</button></div>`).join('')}
                </div>`;
        },

        'hash-generate': ({ result }) => {
            if (!result?.hash) return null;
            return `
                <div class="tool-result-card">
                    <div class="tool-result-card__label">${esc(result.algorithm || 'Hash')} (${result.length} chars)</div>
                    <div class="tool-result-card__value tool-result-card__value--mono tool-result-card__value--break">${esc(result.hash)}</div>
                    <button class="btn btn--sm btn--ghost tool-result-copy" data-copy="${esc(result.hash)}">📋 Copy</button>
                </div>`;
        },

        'base64-encode': ({ result }) => {
            if (!result?.encoded) return null;
            return `
                <div class="tool-result-card">
                    <div class="tool-result-card__label">Base64 Encoded</div>
                    <div class="tool-result-card__value tool-result-card__value--mono tool-result-card__value--break">${esc(result.encoded)}</div>
                    <button class="btn btn--sm btn--ghost tool-result-copy" data-copy="${esc(result.encoded)}">📋 Copy</button>
                </div>`;
        },

        'base64-decode': ({ result }) => {
            if (!result?.decoded) return null;
            return `
                <div class="tool-result-card">
                    <div class="tool-result-card__label">Decoded Text</div>
                    <div class="tool-result-card__value">${esc(result.decoded)}</div>
                    <button class="btn btn--sm btn--ghost tool-result-copy" data-copy="${esc(result.decoded)}">📋 Copy</button>
                </div>`;
        },

        'json-format': ({ result }) => {
            if (!result?.formatted) return null;
            return `
                <div class="tool-result-card">
                    <div class="tool-result-card__label">Formatted JSON</div>
                    <pre class="tool-result-card__pre">${esc(result.formatted)}</pre>
                    <button class="btn btn--sm btn--ghost tool-result-copy" data-copy="${esc(result.formatted)}">📋 Copy</button>
                </div>`;
        },

        'json-validate': ({ result }) => {
            const icon = result?.isValid ? '✅' : '❌';
            return `
                <div class="tool-result-card tool-result-card--${result?.isValid ? 'success' : 'error'}">
                    <div class="tool-result-card__value">${icon} JSON is ${result?.isValid ? 'valid' : 'invalid'}</div>
                    ${result?.error ? `<div class="tool-result-card__meta">${esc(result.error)}</div>` : ''}
                </div>`;
        },

        'json-minify': ({ result }) => {
            if (!result?.minified) return null;
            return `
                <div class="tool-result-card">
                    <div class="tool-result-card__label">Minified (${esc(result.reduction || '')} reduction)</div>
                    <pre class="tool-result-card__pre">${esc(result.minified.slice(0, 500))}${result.minified.length > 500 ? '…' : ''}</pre>
                    <button class="btn btn--sm btn--ghost tool-result-copy" data-copy="${esc(result.minified)}">📋 Copy</button>
                </div>`;
        },

        'text-analyze': ({ result }) => `
            <div class="tool-result-card">
                <div class="tool-result-card__label">Text Analysis</div>
                <div class="tool-result-card__stats">
                    <span>📝 ${result?.wordCount || 0} words</span>
                    <span>🔤 ${result?.characterCount || 0} chars</span>
                    <span>⏱️ ~${result?.readingTime || 0} min read</span>
                </div>
            </div>`,

        'color-convert': ({ result }) => {
            if (!result?.converted) return null;
            return `
                <div class="tool-result-card">
                    <div class="tool-result-card__label">Color Converted</div>
                    <div class="tool-result-card__color-preview" style="background:${esc(result.converted)};width:48px;height:48px;border-radius:8px;display:inline-block;border:1px solid rgba(255,255,255,.2)"></div>
                    <div class="tool-result-card__value tool-result-card__value--mono">${esc(result.converted)}</div>
                    <button class="btn btn--sm btn--ghost tool-result-copy" data-copy="${esc(result.converted)}">📋 Copy</button>
                </div>`;
        },

        'unit-convert': ({ result }) => result?.result !== undefined ? `
            <div class="tool-result-card">
                <div class="tool-result-card__label">Conversion Result</div>
                <div class="tool-result-card__value">${result.value} ${esc(result.fromUnit)} = <strong>${result.result} ${esc(result.toUnit)}</strong></div>
            </div>` : null,

        'currency-convert': ({ result }) => result?.convertedAmount !== undefined ? `
            <div class="tool-result-card">
                <div class="tool-result-card__label">Currency Conversion</div>
                <div class="tool-result-card__value">${result.amount} ${esc(result.fromCurrency)} = <strong>${result.convertedAmount} ${esc(result.toCurrency)}</strong></div>
                <div class="tool-result-card__meta">Rate: 1 ${esc(result.fromCurrency)} = ${(result.exchangeRate || 0).toFixed(4)} ${esc(result.toCurrency)}</div>
            </div>` : null,

        'timestamp-current': ({ result }) => `
            <div class="tool-result-card">
                <div class="tool-result-card__label">Current Timestamp</div>
                <div class="tool-result-card__value tool-result-card__value--mono">${result?.timestamp || ''}</div>
                <div class="tool-result-card__meta">${esc(result?.iso || '')}</div>
                <button class="btn btn--sm btn--ghost tool-result-copy" data-copy="${result?.timestamp || ''}">📋 Copy Unix</button>
            </div>`,

        'qrcode-generate': ({ result }) => result?.imageUrl ? `
            <div class="tool-result-card">
                <div class="tool-result-card__label">QR Code</div>
                <img src="${esc(result.imageUrl)}" alt="QR Code" style="max-width:200px;border-radius:8px" onerror="this.style.display='none'">
                <div class="tool-result-card__meta">Data: ${esc(result.data?.slice(0,40) || '')}${(result.data?.length||0)>40?'…':''}</div>
            </div>` : null,

        'url-shorten': ({ result }) => result?.shortUrl ? `
            <div class="tool-result-card">
                <div class="tool-result-card__label">Shortened URL</div>
                <a class="tool-result-card__value tool-result-card__value--link" href="${esc(result.shortUrl)}" target="_blank" rel="noopener">${esc(result.shortUrl)}</a>
                <div class="tool-result-card__meta">Code: ${esc(result.shortCode)}</div>
                <button class="btn btn--sm btn--ghost tool-result-copy" data-copy="${esc(result.shortUrl)}">📋 Copy URL</button>
            </div>` : null,

        'text-sentiment': ({ result }) => {
            const icons = { 'very positive': '😄', positive: '🙂', neutral: '😐', negative: '😕', 'very negative': '😞' };
            const icon  = icons[result?.sentiment] || '😐';
            return `
                <div class="tool-result-card">
                    <div class="tool-result-card__label">Sentiment</div>
                    <div class="tool-result-card__value">${icon} ${esc(result?.sentiment || 'Unknown')}</div>
                    <div class="tool-result-card__meta">Score: ${result?.score ?? '—'} · Positive hits: ${result?.positiveHits ?? 0} · Negative hits: ${result?.negativeHits ?? 0}</div>
                </div>`;
        },

        'ip-info': ({ result }) => `
            <div class="tool-result-card">
                <div class="tool-result-card__label">IP Info</div>
                <div class="tool-result-card__value tool-result-card__value--mono">${esc(result?.ip || '—')}</div>
                <div class="tool-result-card__stats">
                    <span>🌍 ${esc(result?.country || '—')}</span>
                    <span>🏙️ ${esc(result?.city || '—')}</span>
                    <span>⏰ ${esc(result?.timezone || '—')}</span>
                </div>
            </div>`,
    };

    // ── Intercept tool clicks → render custom result panels ───────────────────

    window.addEventListener('tools:tool-clicked', (e) => {
        const { toolId } = e.detail || {};
        if (!toolId) return;

        // Let the generic modal open; we'll inject our custom renderer into it
        // after it renders (next tick)
        setTimeout(() => {
            const form = document.getElementById('tool-exec-form');
            if (!form) return;

            // Override the submit handler to use our rich renderers
            form.addEventListener('submit', async (ev) => {
                ev.preventDefault();
                ev.stopImmediatePropagation(); // prevent double-fire with generic handler

                const btn      = form.querySelector('[type="submit"]');
                const resultEl = document.getElementById('tool-exec-result');
                const errorEl  = document.getElementById('tool-exec-error');

                if (!resultEl) return;

                if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
                resultEl.hidden = true;
                if (errorEl) errorEl.hidden = true;

                const params  = {};
                new FormData(form).forEach((v, k) => { params[k] = v; });
                form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    params[cb.name] = cb.checked;
                });

                try {
                    const exec = window.ToolExecutorPatch || { execute: async () => ({ result: null, source: 'unknown' }) };
                    const { result, source, offline } = await exec.execute(toolId, 'execute', params, window.authorizedFetch);

                    if (btn) { btn.disabled = false; btn.textContent = 'Run Tool'; }

                    if (offline) {
                        if (errorEl) { errorEl.hidden = false; errorEl.textContent = '📡 Offline — action queued.'; }
                        return;
                    }

                    const renderer = RESULT_RENDERERS[toolId];
                    const html     = renderer ? renderer({ result, source, params }) : null;

                    resultEl.hidden  = false;
                    resultEl.innerHTML = html
                        || `<pre class="tool-result">${JSON.stringify(result, null, 2)}</pre><small class="tool-result__source">Source: ${esc(source)}</small>`;

                    // Wire copy buttons inside result
                    resultEl.querySelectorAll('.tool-result-copy').forEach(btn => {
                        btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy));
                    });

                } catch (err) {
                    if (btn) { btn.disabled = false; btn.textContent = 'Run Tool'; }
                    if (errorEl) { errorEl.hidden = false; errorEl.textContent = '❌ ' + (err.message || 'Failed'); }
                }
            }, { once: true });
        }, 50);
    });

    // ── React to fresh manifest → update category tab counts ─────────────────

    window.addEventListener('tools:manifest-loaded', (e) => {
        const { tools = [], source } = e.detail || {};
        if (!tools.length) return;

        // Update any badge showing the total tool count
        document.querySelectorAll('[data-tools-count]').forEach(el => {
            el.textContent = tools.filter(t => t.isEnabled !== false).length;
        });

        // Update category filter tabs if present
        const byCategory = {};
        tools.filter(t => t.isEnabled !== false).forEach(t => {
            byCategory[t.category] = (byCategory[t.category] || 0) + 1;
        });
        document.querySelectorAll('[data-category-tab]').forEach(tab => {
            const cat = tab.dataset.categoryTab;
            const count = byCategory[cat];
            if (count !== undefined) {
                const badge = tab.querySelector('[data-category-count]');
                if (badge) badge.textContent = count;
            }
        });

        console.log(`[ToolUIPatch] UI updated (${tools.length} tools, source: ${source})`);
    });

    // ── tools:ready — update any loading indicators ───────────────────────────

    window.addEventListener('tools:ready', (e) => {
        const count = e.detail?.count || 0;
        document.querySelectorAll('.tools-loading-indicator').forEach(el => { el.style.display = 'none'; });
        document.querySelectorAll('.tools-empty-state').forEach(el => {
            el.style.display = count > 0 ? 'none' : '';
        });
        toast(`${count} tools loaded`, 'success');
    });

    // ── AppSettings subscription ──────────────────────────────────────────────

    (function subscribeSettings() {
        const AS = window.AppSettings || window.KynectaSettings;
        if (!AS || typeof AS.subscribe !== 'function') {
            setTimeout(subscribeSettings, 1200);
            return;
        }
        AS.subscribe((settings) => {
            if (typeof window.applyToolSettings === 'function') window.applyToolSettings(settings);
        });
    })();

    console.log('[ToolUIPatch] ✅ UI patch loaded');

})();