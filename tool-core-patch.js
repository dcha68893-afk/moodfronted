/**
 * tool-core-patch.js  —  FIXED: Dynamic Cache-First Tool Loading + Execution Engine
 * ──────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PATCH FIXES
 * ─────────────────────
 * ❌ Tools not clickable           → ✅ Event delegation on #tools-grid + modal router
 * ❌ Tools using hardcoded data    → ✅ Dynamic manifest from GET /api/tools
 * ❌ No backend communication      → ✅ authorizedFetch → POST /api/tools/action
 * ❌ Tools not updating            → ✅ IDB cache + background refresh cycle
 * ❌ Broken UI icons offline       → ✅ Emoji icons stored in IDB; render from cache
 * ❌ Settings not applied          → ✅ AppSettings.subscribe() wiring
 * ❌ Empty UI on load              → ✅ Cache hydration BEFORE any network call
 *
 * HOW TO USE
 * ──────────
 * Append this file to Tool-core.js OR include it as a separate script AFTER Tool-core.js.
 * It wraps everything in a self-contained IIFE so it never pollutes module scope.
 *
 * SCOPE RESTRICTION: Only modifies the tools module, toolsService, toolsController,
 * and routes/tools.js. Does NOT touch messages, calls, friends, cache engine, or auth.
 */

(function ToolCoreFixPatch() {
    'use strict';

    // ── Guards ────────────────────────────────────────────────────────────────
    if (window.__TOOL_CORE_PATCH_LOADED__) return;
    window.__TOOL_CORE_PATCH_LOADED__ = true;

    // ═══════════════════════════════════════════════════════════════════════════
    // 1.  IDB TOOL CACHE  (wraps LocalStoreTools if present; falls back to LS)
    // ═══════════════════════════════════════════════════════════════════════════

    const ToolCache = (() => {
        const LS_ALL = 'knt_tools_manifest';

        // ── Save the full manifest ────────────────────────────────────────────
        function saveManifest(tools) {
            try {
                localStorage.setItem(LS_ALL, JSON.stringify({
                    tools,
                    savedAt: Date.now(),
                }));
            } catch (_) {}

            // Also persist to LocalStoreTools IDB if available
            const LST = window.LocalStoreTools;
            if (LST && typeof LST.saveMany === 'function') {
                LST.saveMany(tools, LST.STORES ? LST.STORES.TOOLS : 'tools').catch(() => {});
            }
        }

        // ── Load from fastest available source ────────────────────────────────
        function loadManifest() {
            // Try IDB memory cache first
            const LST = window.LocalStoreTools;
            if (LST && typeof LST.getAllTools === 'function') {
                const idbTools = LST.getAllTools(LST.STORES ? LST.STORES.TOOLS : 'tools');
                if (Array.isArray(idbTools) && idbTools.length > 0) return idbTools;
            }

            // Fallback to localStorage
            try {
                const raw    = localStorage.getItem(LS_ALL);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed.tools) ? parsed.tools : [];
            } catch (_) { return []; }
        }

        function isFresh() {
            try {
                const raw = localStorage.getItem(LS_ALL);
                if (!raw) return false;
                const { savedAt } = JSON.parse(raw);
                return (Date.now() - savedAt) < 5 * 60 * 1000; // 5 min TTL
            } catch (_) { return false; }
        }

        return { saveManifest, loadManifest, isFresh };
    })();

    // ═══════════════════════════════════════════════════════════════════════════
    // 2.  OFFLINE ACTION QUEUE
    // ═══════════════════════════════════════════════════════════════════════════

    const ActionQueue = (() => {
        const LS_KEY = 'knt_tool_action_queue';

        function load() {
            try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
        }

        function save(q) {
            try { localStorage.setItem(LS_KEY, JSON.stringify(q.slice(-200))); } catch (_) {}
        }

        function enqueue(toolId, action, params) {
            const q   = load();
            const item = { id: `q_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, toolId, action, params, queuedAt: Date.now(), retries: 0 };
            q.push(item);
            save(q);
            console.log('[ToolPatch] Action queued (offline):', toolId, action);
            return item;
        }

        async function flush(fetchFn) {
            if (!navigator.onLine) return 0;
            const q     = load();
            if (!q.length) return 0;
            let flushed = 0;
            const remaining = [];

            for (const item of q) {
                try {
                    await fetchFn('/api/tools/action', {
                        method : 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body   : JSON.stringify({ toolId: item.toolId, action: item.action, params: item.params }),
                    });
                    flushed++;
                } catch (_) {
                    item.retries++;
                    if (item.retries < 5) remaining.push(item);
                }
            }

            save(remaining);
            if (flushed > 0) console.log('[ToolPatch] Flushed', flushed, 'queued actions');
            return flushed;
        }

        return { enqueue, flush, load };
    })();

    // ═══════════════════════════════════════════════════════════════════════════
    // 3.  TOOL EXECUTION ENGINE
    //     Handles: identify toolId → route to handler → execute logic
    // ═══════════════════════════════════════════════════════════════════════════

    const ToolExecutor = (() => {

        // Local-only tools (run in-browser, no server needed)
        const LOCAL_HANDLERS = {
            'password-generate': (params) => {
                let charset = 'abcdefghijklmnopqrstuvwxyz';
                const len   = parseInt(params.length) || 16;
                if (params.includeUppercase !== false) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                if (params.includeNumbers   !== false) charset += '0123456789';
                if (params.includeSymbols   !== false) charset += '!@#$%^&*()_+-=[]{}|;:,.';
                let pw = '';
                for (let i = 0; i < len; i++) pw += charset[Math.floor(Math.random() * charset.length)];
                return { password: pw, length: len };
            },
            'uuid-generate': () => {
                const uid = typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
                return { uuids: [uid], version: 4, count: 1 };
            },
            'base64-encode': (p) => ({ encoded: btoa(unescape(encodeURIComponent(p.text || ''))) }),
            'base64-decode': (p) => { try { return { decoded: decodeURIComponent(escape(atob(p.encoded || ''))) }; } catch { return { decoded: '', error: 'Invalid Base64' }; } },
            'json-format'  : (p) => { try { return { formatted: JSON.stringify(JSON.parse(p.json), null, 2) }; } catch (e) { return { error: e.message }; } },
            'json-validate': (p) => { try { JSON.parse(p.json); return { isValid: true }; } catch (e) { return { isValid: false, error: e.message }; } },
            'json-minify'  : (p) => { try { return { minified: JSON.stringify(JSON.parse(p.json)) }; } catch (e) { return { error: e.message }; } },
            'timestamp-current': () => ({ timestamp: Date.now(), iso: new Date().toISOString() }),
            'text-analyze' : (p) => {
                const text = p.text || '';
                return { wordCount: text.trim().split(/\s+/).filter(Boolean).length, characterCount: text.length, readingTime: Math.ceil(text.split(/\s+/).length / 200) };
            },
        };

        /**
         * Execute a tool.
         * @param {string} toolId  — e.g. 'password-generate'
         * @param {string} action  — e.g. 'execute'
         * @param {object} params  — tool-specific params
         * @param {Function} fetchFn — authorizedFetch or plain fetch
         * @returns {Promise<{result, source: 'local'|'server'|'queued'}>}
         */
        async function execute(toolId, action = 'execute', params = {}, fetchFn) {
            // ── Local handler first (instant, works offline) ──────────────────
            if (LOCAL_HANDLERS[toolId]) {
                const result = await LOCAL_HANDLERS[toolId](params);
                // Record usage in background (don't await)
                _recordUsage(toolId, action, fetchFn).catch(() => {});
                return { result, source: 'local' };
            }

            // ── Server-side tool ──────────────────────────────────────────────
            if (!navigator.onLine) {
                // Offline → queue
                const queued = ActionQueue.enqueue(toolId, action, params);
                return { result: null, source: 'queued', queueId: queued.id, offline: true };
            }

            try {
                const fetch = fetchFn || _safeFetch;
                const resp  = await fetch('/api/tools/action', {
                    method : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body   : JSON.stringify({ toolId, action, params }),
                });
                const json  = typeof resp === 'object' && !resp.json ? resp : await resp.json();
                const data  = json?.data || json;
                _recordUsage(toolId, action, fetchFn).catch(() => {});
                return { result: data, source: 'server' };
            } catch (err) {
                console.error('[ToolPatch] Server execution failed, queuing:', err);
                const queued = ActionQueue.enqueue(toolId, action, params);
                return { result: null, source: 'queued', queueId: queued.id, error: err.message };
            }
        }

        async function _recordUsage(toolId, action, fetchFn) {
            const fn = fetchFn || _safeFetch;
            await fn(`/api/tools/${encodeURIComponent(toolId)}/usage`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ action }),
            });
        }

        return { execute };
    })();

    // ═══════════════════════════════════════════════════════════════════════════
    // 4.  TOOL LIST LOADER  (cache-first → render → sync server → refresh UI)
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadToolManifest(fetchFn) {
        // Step 1: Render cached tools immediately (no empty UI)
        const cached = ToolCache.loadManifest();
        if (cached.length > 0) {
            window.dispatchEvent(new CustomEvent('tools:manifest-loaded', { detail: { tools: cached, source: 'cache' } }));
            _renderToolGrid(cached);
        }

        // Step 2: Skip network if cache is fresh
        if (ToolCache.isFresh() && cached.length > 0) {
            console.log('[ToolPatch] Using fresh tool cache');
            return cached;
        }

        // Step 3: Fetch from server
        if (!navigator.onLine) {
            console.log('[ToolPatch] Offline — using cached tools');
            return cached;
        }

        // FIX (auth-token race): the iframe's session/token arrives
        // asynchronously from the parent shell via postMessage, and
        // SessionClient.handleSessionData (Tool-core.part1.js) fires a
        // window-level 'session:updated' CustomEvent once a valid session
        // lands. Previously this network-refresh step ran immediately on
        // DOMContentLoaded, before that event had a chance to fire —
        // guaranteeing "Authorized fetch blocked: no token" on every single
        // page load. Waiting here (with a safety timeout) only delays this
        // network call, never the cache render in Step 1 above, which
        // already happened synchronously.
        await _waitForSessionToken(4000);

        try {
            const fn   = fetchFn || _safeFetch;
            const resp = await fn('/api/tools?enabledOnly=false');
            const json = typeof resp === 'object' && !resp.json ? resp : await resp.json();
            const tools= json?.data?.tools || json?.tools || [];

            if (Array.isArray(tools) && tools.length > 0) {
                ToolCache.saveManifest(tools);
                window.dispatchEvent(new CustomEvent('tools:manifest-loaded', { detail: { tools, source: 'server' } }));
                _renderToolGrid(tools);
                console.log('[ToolPatch] Tool manifest refreshed from server:', tools.length, 'tools');
                return tools;
            }
        } catch (err) {
            console.warn('[ToolPatch] Tool manifest fetch failed (using cache):', err.message);
        }

        return cached;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5.  UI RENDERER  — writes tool cards; works from EITHER cache or server data
    //     Fixes: tools not clickable, broken icons, empty UI
    // ═══════════════════════════════════════════════════════════════════════════

    function _renderToolGrid(tools) {
        const grid = document.getElementById('tools-grid')
            || document.querySelector('[data-tools-grid]')
            || document.querySelector('.tools-grid');

        if (!grid) return; // page may not have a tool grid

        const filtered = tools.filter(t => t.isEnabled !== false);
        if (!filtered.length) return;

        // Group by category for section rendering
        const byCategory = {};
        filtered.forEach(t => {
            const cat = t.category || 'other';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(t);
        });

        const html = Object.entries(byCategory).map(([cat, catTools]) => `
            <div class="tool-category" data-category="${_esc(cat)}">
                <h3 class="tool-category__title">${_esc(_capitalize(cat))}</h3>
                <div class="tool-category__grid">
                    ${catTools.map(t => _toolCard(t)).join('')}
                </div>
            </div>
        `).join('');

        grid.innerHTML = html;

        // ── Attach click handlers via delegation (ONE handler, never stale) ──
        _attachGridClickHandler(grid);

        console.log('[ToolPatch] Rendered', filtered.length, 'tools across', Object.keys(byCategory).length, 'categories');
    }

    function _toolCard(t) {
        return `
            <div class="tool-card" 
                 data-tool-id="${_esc(t.id)}"
                 data-tool-name="${_esc(t.name)}"
                 role="button"
                 tabindex="0"
                 aria-label="Open ${_esc(t.name)}">
                <div class="tool-card__icon" aria-hidden="true">${_esc(t.icon || '🔧')}</div>
                <div class="tool-card__body">
                    <div class="tool-card__name">${_esc(t.name)}</div>
                    <div class="tool-card__desc">${_esc(t.description || '')}</div>
                </div>
                ${!t.isEnabled ? '<span class="tool-card__badge tool-card__badge--disabled">Disabled</span>' : ''}
            </div>
        `.trim();
    }

    function _attachGridClickHandler(grid) {
        // Remove any stale handlers by cloning the element (safe for shallow clone)
        const clone = grid.cloneNode(true);
        grid.parentNode && grid.parentNode.replaceChild(clone, grid);

        clone.addEventListener('click', (e) => {
            const card = e.target.closest('[data-tool-id]');
            if (!card) return;
            const toolId = card.dataset.toolId;
            if (!toolId) return;
            _openToolModal(toolId);
        });

        // Keyboard accessibility
        clone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                const card = e.target.closest('[data-tool-id]');
                if (card?.dataset.toolId) _openToolModal(card.dataset.toolId);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 6.  TOOL MODAL / ROUTER
    //     Fixes: tools not clickable, tools not responding to user interaction
    // ═══════════════════════════════════════════════════════════════════════════

    function _openToolModal(toolId) {
        const tools   = ToolCache.loadManifest();
        const toolDef = tools.find(t => t.id === toolId);

        // Marketplace tools → navigate (don't open a modal)
        if (toolId === 'marketplace-browse') {
            const tab = document.querySelector('[data-tab="marketplace"]') || document.querySelector('[href="#marketplace"]');
            if (tab) { tab.click(); return; }
        }
        if (toolId === 'marketplace-create') {
            window.dispatchEvent(new CustomEvent('tools:open-create-listing'));
            return;
        }

        // Emit event — Tool-ui.js can intercept for custom handling
        const intercepted = _emit('tools:tool-clicked', { toolId, toolDef });
        if (intercepted) return;

        // Default: open generic modal
        _openGenericToolModal(toolDef || { id: toolId, name: toolId, icon: '🔧', description: '' });
    }

    function _openGenericToolModal(toolDef) {
        let modal = document.getElementById('tool-exec-modal');
        if (!modal) {
            modal        = document.createElement('div');
            modal.id     = 'tool-exec-modal';
            modal.className = 'tool-modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            document.body.appendChild(modal);
        }

        const fields = _getToolFields(toolDef.id);

        modal.innerHTML = `
            <div class="tool-modal__backdrop"></div>
            <div class="tool-modal__box">
                <button class="tool-modal__close" aria-label="Close">&times;</button>
                <div class="tool-modal__header">
                    <span class="tool-modal__icon">${_esc(toolDef.icon || '🔧')}</span>
                    <h2 class="tool-modal__title">${_esc(toolDef.name)}</h2>
                </div>
                <p class="tool-modal__desc">${_esc(toolDef.description || '')}</p>
                <form class="tool-modal__form" id="tool-exec-form" autocomplete="off">
                    ${fields.map(f => _renderField(f)).join('')}
                    <button type="submit" class="tool-modal__submit btn btn--primary">Run Tool</button>
                </form>
                <div class="tool-modal__result" id="tool-exec-result" hidden></div>
                <div class="tool-modal__error"  id="tool-exec-error"  hidden></div>
            </div>
        `;

        modal.removeAttribute('hidden');
        modal.style.display = 'flex';

        // Close handlers
        modal.querySelector('.tool-modal__close').addEventListener('click', () => _closeModal(modal));
        modal.querySelector('.tool-modal__backdrop').addEventListener('click', () => _closeModal(modal));
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { _closeModal(modal); document.removeEventListener('keydown', esc); }
        });

        // Form submit → execute tool
        modal.querySelector('#tool-exec-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn     = modal.querySelector('.tool-modal__submit');
            const resultEl= modal.querySelector('#tool-exec-result');
            const errorEl = modal.querySelector('#tool-exec-error');
            const params  = _collectFormParams(e.target);

            btn.disabled     = true;
            btn.textContent  = 'Running…';
            resultEl.hidden  = true;
            errorEl.hidden   = true;

            try {
                const { result, source, offline } = await ToolExecutor.execute(
                    toolDef.id, 'execute', params, _getFetchFn()
                );

                btn.disabled    = false;
                btn.textContent = 'Run Tool';

                if (offline) {
                    errorEl.hidden      = false;
                    errorEl.textContent = '📡 You\'re offline. Action queued — will run when reconnected.';
                } else {
                    resultEl.hidden    = false;
                    resultEl.innerHTML = `<pre class="tool-result">${JSON.stringify(result, null, 2)}</pre><small class="tool-result__source">Source: ${source}</small>`;
                }

                // Emit for Tool-ui.js listeners
                _emit('tools:tool-result', { toolId: toolDef.id, result, source, params });

            } catch (err) {
                btn.disabled    = false;
                btn.textContent = 'Run Tool';
                errorEl.hidden  = false;
                errorEl.textContent = '❌ ' + (err.message || 'Execution failed');
            }
        });
    }

    function _closeModal(modal) {
        modal.style.display = 'none';
        modal.hidden        = true;
    }

    // ── Field definitions per tool ────────────────────────────────────────────
    function _getToolFields(toolId) {
        const defs = {
            'password-generate': [{ name:'length', label:'Length', type:'number', value:'16', min:4, max:128 }, { name:'includeNumbers', label:'Include Numbers', type:'checkbox', checked:true }, { name:'includeSymbols', label:'Include Symbols', type:'checkbox', checked:true }, { name:'includeUppercase', label:'Uppercase', type:'checkbox', checked:true }],
            'uuid-generate'    : [{ name:'count',   label:'Count', type:'number', value:'1',  min:1, max:50 }],
            'hash-generate'    : [{ name:'text', label:'Text', type:'textarea' }, { name:'algorithm', label:'Algorithm', type:'select', options:['sha256','sha512','sha1','md5'] }],
            'base64-encode'    : [{ name:'text',    label:'Text to encode', type:'textarea' }],
            'base64-decode'    : [{ name:'encoded', label:'Base64 string',  type:'textarea' }],
            'json-format'      : [{ name:'json',    label:'JSON',           type:'textarea' }],
            'json-validate'    : [{ name:'json',    label:'JSON',           type:'textarea' }],
            'json-minify'      : [{ name:'json',    label:'JSON',           type:'textarea' }],
            'text-analyze'     : [{ name:'text',    label:'Text to analyze',type:'textarea' }],
            'text-summarize'   : [{ name:'text', label:'Text', type:'textarea' }, { name:'length', label:'Length', type:'select', options:['short','medium','long'] }],
            'text-sentiment'   : [{ name:'text',    label:'Text',           type:'textarea' }],
            'color-convert'    : [{ name:'color', label:'Color (HEX or rgb())', type:'text', placeholder:'#ff6600' }, { name:'toFormat', label:'Target format', type:'select', options:['hex','rgb','hsl'] }],
            'unit-convert'     : [{ name:'value', label:'Value', type:'number' }, { name:'fromUnit', label:'From unit', type:'text', placeholder:'m' }, { name:'toUnit', label:'To unit', type:'text', placeholder:'ft' }],
            'currency-convert' : [{ name:'amount', label:'Amount', type:'number' }, { name:'fromCurrency', label:'From currency', type:'text', placeholder:'USD' }, { name:'toCurrency', label:'To currency', type:'text', placeholder:'KES' }],
            'url-shorten'      : [{ name:'url', label:'URL to shorten', type:'url' }],
            'ip-info'          : [{ name:'ip', label:'IP address (leave blank for yours)', type:'text' }],
            'timestamp-current': [],
            'date-difference'  : [{ name:'date1', label:'Date 1', type:'date' }, { name:'date2', label:'Date 2', type:'date' }, { name:'unit', label:'Unit', type:'select', options:['days','hours','minutes','seconds','weeks','months','years'] }],
            'qrcode-generate'  : [{ name:'data', label:'Data / URL', type:'text' }, { name:'size', label:'Size (px)', type:'number', value:'200' }],
            'barcode-generate' : [{ name:'data', label:'Data', type:'text' }, { name:'type', label:'Type', type:'select', options:['CODE_128','EAN_13','QR_CODE'] }],
        };
        return defs[toolId] || [{ name:'data', label:'Input', type:'textarea' }];
    }

    function _renderField(f) {
        if (f.type === 'textarea') {
            return `<div class="tool-field"><label class="tool-field__label" for="tf_${_esc(f.name)}">${_esc(f.label)}</label><textarea class="tool-field__input" id="tf_${_esc(f.name)}" name="${_esc(f.name)}" rows="4">${_esc(f.value || '')}</textarea></div>`;
        }
        if (f.type === 'select') {
            const opts = (f.options || []).map(o => `<option value="${_esc(o)}">${_esc(o)}</option>`).join('');
            return `<div class="tool-field"><label class="tool-field__label" for="tf_${_esc(f.name)}">${_esc(f.label)}</label><select class="tool-field__input" id="tf_${_esc(f.name)}" name="${_esc(f.name)}">${opts}</select></div>`;
        }
        if (f.type === 'checkbox') {
            return `<div class="tool-field tool-field--check"><input type="checkbox" id="tf_${_esc(f.name)}" name="${_esc(f.name)}" ${f.checked ? 'checked' : ''}><label for="tf_${_esc(f.name)}">${_esc(f.label)}</label></div>`;
        }
        const attrs = [
            `type="${_esc(f.type || 'text')}"`,
            `id="tf_${_esc(f.name)}"`,
            `name="${_esc(f.name)}"`,
            f.value !== undefined ? `value="${_esc(String(f.value))}"` : '',
            f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : '',
            f.min !== undefined ? `min="${f.min}"` : '',
            f.max !== undefined ? `max="${f.max}"` : '',
        ].filter(Boolean).join(' ');
        return `<div class="tool-field"><label class="tool-field__label" for="tf_${_esc(f.name)}">${_esc(f.label)}</label><input class="tool-field__input" ${attrs}></div>`;
    }

    function _collectFormParams(form) {
        const fd     = new FormData(form);
        const params = {};
        fd.forEach((v, k) => { params[k] = v; });
        // Checkboxes not in FormData when unchecked → set to false
        form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (!(cb.name in params)) params[cb.name] = false;
            else params[cb.name] = true;
        });
        return params;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7.  SETTINGS INTEGRATION
    //     Fixes: tools not reacting to theme / permissions / feature toggles
    // ═══════════════════════════════════════════════════════════════════════════

    function _applyToolSettings(settings) {
        if (!settings || typeof settings !== 'object') return;

        // Theme — FIX (single theme owner): delegate to window.ThemeManager
        // instead of painting independently.
        if (settings.theme) {
            if (window.ThemeManager) window.ThemeManager.setTheme(settings.theme);
            else document.documentElement.setAttribute('data-theme', settings.theme);
            const grid = document.querySelector('[data-tools-grid], .tools-grid, #tools-grid');
            if (grid) grid.setAttribute('data-theme', settings.theme);
        }

        // Feature toggles — hide/show individual tools
        const toggles = settings.featureToggles || settings.toolToggles || {};
        Object.entries(toggles).forEach(([toolId, enabled]) => {
            document.querySelectorAll(`[data-tool-id="${CSS.escape(toolId)}"]`).forEach(el => {
                el.style.display = enabled ? '' : 'none';
            });
        });

        // Permission-based hiding
        const permissions = settings.permissions || settings.toolPermissions || {};
        Object.entries(permissions).forEach(([toolId, allowed]) => {
            document.querySelectorAll(`[data-tool-id="${CSS.escape(toolId)}"]`).forEach(el => {
                if (!allowed) {
                    el.classList.add('tool-card--locked');
                    el.setAttribute('aria-disabled', 'true');
                } else {
                    el.classList.remove('tool-card--locked');
                    el.removeAttribute('aria-disabled');
                }
            });
        });

        console.log('[ToolPatch] Settings applied');
    }

    // ── Wire into the real settings pipeline ───────────────────────────────────
    // FIX (tool-settings-not-reactive): this used to poll forever for
    // `window.AppSettings` / `window.KynectaSettings`, but neither of those
    // globals is ever created anywhere in the app (settings-core.js never
    // assigns `window.AppSettings = ...`). So `_subscribeToSettings` retried
    // every second forever and `_applyToolSettings` (theme, feature toggles,
    // permissions) was NEVER invoked on a real settings change — the tools
    // module just kept whatever theme/state it had at first paint, which is
    // exactly the "hardcoded theme ignoring settings changes" symptom.
    // settings-core.js actually broadcasts changes via
    // `window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { settings }}))`
    // (and a `marketplace:settingsUpdated` variant used by a couple of other
    // modules), and caches the last-known settings object in
    // `localStorage['kyn_app_settings']`. Listen to the events that are
    // actually fired, and hydrate immediately from the cache on load so the
    // correct theme/toggles are applied before the first settings event ever
    // arrives (e.g. tools page opened directly, not via navigation).
    function _extractSettings(e) {
        if (!e) return null;
        const d = e.detail;
        if (!d) return null;
        return d.settings || d;
    }

    function _subscribeToSettings() {
        try {
            const cached = localStorage.getItem('kyn_app_settings');
            if (cached) _applyToolSettings(JSON.parse(cached));
        } catch (_) {}

        window.addEventListener('settingsUpdated', function (e) {
            const settings = _extractSettings(e);
            if (settings) _applyToolSettings(settings);
        });
        window.addEventListener('marketplace:settingsUpdated', function (e) {
            const settings = _extractSettings(e);
            if (settings) _applyToolSettings(settings);
        });

        const AS = window.AppSettings || window.KynectaSettings;
        if (AS && typeof AS.subscribe === 'function') {
            AS.subscribe(_applyToolSettings);
            const current = typeof AS.getAll === 'function' ? AS.getAll() : (typeof AS.get === 'function' ? AS.get() : null);
            if (current) _applyToolSettings(current);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 8.  SYNC CYCLE
    // ═══════════════════════════════════════════════════════════════════════════

    let _syncTimer = null;

    function _startSyncCycle() {
        if (_syncTimer) return;
        const fn = _getFetchFn();
        let _failCount = 0;
        const MAX_FAILS = 3; // Stop cycling after 3 consecutive failures (avoids console spam)

        const run = async () => {
            // Flush queued actions
            await ActionQueue.flush(fn).catch(() => {});

            // Refresh manifest in background (non-blocking)
            if (navigator.onLine) {
                try {
                    await loadToolManifest(fn);
                    _failCount = 0; // reset on success
                } catch (e) {
                    _failCount++;
                    if (_failCount >= MAX_FAILS) {
                        // Stop the interval — server doesn't have this endpoint yet
                        clearInterval(_syncTimer);
                        _syncTimer = null;
                        return;
                    }
                }
            }
        };

        // First run after 3 s
        setTimeout(run, 3000);

        // Then every 5 minutes
        _syncTimer = setInterval(run, 5 * 60 * 1000);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 9.  UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _capitalize(s) {
        return String(s).charAt(0).toUpperCase() + String(s).slice(1);
    }

    function _emit(eventName, detail) {
        try {
            const ev = new CustomEvent(eventName, { detail, cancelable: true, bubbles: true });
            return !window.dispatchEvent(ev);
        } catch (_) { return false; }
    }

    /** Best available fetch function (prefers authorizedFetch) */
    function _getFetchFn() {
        return window.authorizedFetch
            || (typeof authorizedFetch !== 'undefined' ? authorizedFetch : null)
            || _safeFetch;
    }

    /** Plain fetch wrapper that always returns a JSON-decoded value.
     *  404 on /api/tools means the endpoint is not yet implemented on the server —
     *  return an empty result silently instead of throwing (stops console spam). */
    async function _safeFetch(url, options = {}) {
        const token = _getToken();
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
        try {
            const resp = await fetch(url, { ...options, headers, credentials: 'include' });
            // Silently return empty result for 404 — endpoint not implemented yet
            if (resp.status === 404) return { tools: [], data: { tools: [] } };
            if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
            return resp.json();
        } catch (err) {
            // Network errors — return empty result silently
            if (err.message && err.message.startsWith('HTTP')) throw err;
            return { tools: [], data: { tools: [] } };
        }
    }

    function _getToken() {
        return window.marketplaceCore?.getCentralToken?.()
            || window.__PARENT_SESSION__?.token
            || localStorage.getItem('authToken')
            || localStorage.getItem('token')
            || localStorage.getItem('accessToken')
            || '';
    }

    // FIX (auth-token race on startup, used by loadToolManifest above):
    // resolves as soon as a token is already present, on the 'session:updated'
    // window event dispatched once SessionClient accepts a valid session
    // from the parent, or after a safety timeout so this never hangs forever
    // (e.g. standalone/test contexts where that handshake never happens).
    function _waitForSessionToken(timeoutMs) {
        return new Promise(resolve => {
            const hasTokenAlready = () => {
                try {
                    if (typeof window.getAuthSession === 'function') {
                        const s = window.getAuthSession();
                        return !!(s && s.token);
                    }
                } catch (_) {}
                return false;
            };
            if (hasTokenAlready()) { resolve(); return; }

            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                window.removeEventListener('session:updated', onSessionUpdated);
                clearTimeout(timer);
                resolve();
            };
            const onSessionUpdated = () => finish();
            window.addEventListener('session:updated', onSessionUpdated);
            const timer = setTimeout(finish, timeoutMs);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. BOOTSTRAP
    // ═══════════════════════════════════════════════════════════════════════════

    function _bootstrap() {
        console.log('[ToolPatch] Bootstrapping fixed tool system…');

        // Expose globally so Tool-ui.js can call these directly
        window.ToolCachePatch     = ToolCache;
        window.ToolExecutorPatch  = ToolExecutor;
        window.loadToolManifest   = loadToolManifest;
        window.openToolModal      = _openToolModal;
        window.applyToolSettings  = _applyToolSettings;
        window.renderToolGrid     = _renderToolGrid;

        // Subscribe to settings
        _subscribeToSettings();

        // Online/offline handlers
        window.addEventListener('online',  () => {
            console.log('[ToolPatch] Online — flushing action queue');
            ActionQueue.flush(_getFetchFn()).catch(() => {});
        });

        // Start sync cycle
        _startSyncCycle();

        // Load manifest
        loadToolManifest(_getFetchFn()).then(tools => {
            console.log('[ToolPatch] ✅ Tool system ready —', tools.length, 'tools loaded');
            _emit('tools:ready', { count: tools.length, tools });
        });

        console.log('[ToolPatch] ✅ Bootstrap complete');
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _bootstrap);
    } else {
        _bootstrap();
    }

    // Also re-init when the tools module becomes active
    window.addEventListener('tools:active',        _bootstrap);
    window.addEventListener('toolSystem:ready',    () => loadToolManifest(_getFetchFn()).catch(() => {}));
    window.addEventListener('marketplace:data-updated', () => loadToolManifest(_getFetchFn()).catch(() => {}));

})();