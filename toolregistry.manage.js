/**
 * toolregistry.manager.js — Server-Controlled Tool Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * PRINCIPLE: Server is the SINGLE SOURCE OF TRUTH for what tools exist.
 *            The client CANNOT invent or execute unknown tools.
 *            Only tools registered here are allowed to execute.
 */

(function (root, factory) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(
            require('./localstore.tools.js')
        );
    } else {
        root.ToolRegistryManager = factory(
            root.LocalStoreTools
        );
        window.ToolRegistryManager = root.ToolRegistryManager;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (LocalStoreTools) {
    'use strict';

    // ── Registry storage ───────────────────────────────────────────────────────
    const _registry = new Map();
    let   _initialized = false;
    let   _subscribers  = new Set();
    const LS_KEY = 'knt_tool_registry';

    // ── Tool Definition schema (mandatory fields) ──────────────────────────────
    const REQUIRED_FIELDS = ['id', 'name', 'version', 'entryPoint'];

    // Valid permission values
    const VALID_PERMISSIONS = new Set([
        'storage', 'network', 'notifications', 'ui_injection',
        'camera', 'microphone', 'geolocation', 'clipboard'
    ]);

    // ── Private helpers ────────────────────────────────────────────────────────

    function _validateDefinition(def) {
        if (!def || typeof def !== 'object') return { valid: false, reason: 'Not an object' };

        for (const field of REQUIRED_FIELDS) {
            if (!def[field]) return { valid: false, reason: `Missing required field: ${field}` };
        }

        if (!/^\d+\.\d+\.\d+$/.test(String(def.version))) {
            return { valid: false, reason: `Invalid version format: ${def.version}` };
        }

        const perms = def.permissions || [];
        if (!Array.isArray(perms)) return { valid: false, reason: 'permissions must be an array' };
        for (const p of perms) {
            if (!VALID_PERMISSIONS.has(p)) {
                return { valid: false, reason: `Unknown permission: ${p}` };
            }
        }

        if (!def.signature && !def.isLocalOnly) {
            return { valid: false, reason: 'Tool definition missing server signature' };
        }

        return { valid: true };
    }

    function _normaliseDefinition(def) {
        return {
            id           : String(def.id),
            name         : String(def.name),
            description  : String(def.description || ''),
            version      : String(def.version),
            category     : def.category || 'utility',
            isInstalled  : !!def.isInstalled,
            isActive     : def.isActive !== false,
            permissions  : Array.isArray(def.permissions) ? [...def.permissions] : [],
            entryPoint   : String(def.entryPoint),
            updatedAt    : def.updatedAt || new Date().toISOString(),
            isLocalOnly  : !!def.isLocalOnly,
            signature    : def.signature || null,
            metadata     : def.metadata  || {},
            condition    : def.condition || 'new',
        };
    }

    function _notify(event, toolId, def) {
        _subscribers.forEach(cb => { try { cb(event, toolId, def); } catch(e) {} });
        try {
            window.dispatchEvent(new CustomEvent('toolRegistry:change', {
                detail: { event, toolId, def }
            }));
        } catch(e) {}
    }

    function _persistRegistry() {
        try {
            const arr = Array.from(_registry.values());
            localStorage.setItem(LS_KEY, JSON.stringify(arr));
        } catch(e) {}
    }

    function _loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return;
            arr.forEach(def => {
                if (def && def.id) _registry.set(def.id, def);
            });
            console.log('[ToolRegistry] Loaded', _registry.size, 'tools from localStorage cache');
        } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    const ToolRegistryManager = {

        async init() {
            if (_initialized) return this;
            _loadFromLocalStorage();

            if (LocalStoreTools) {
                try {
                    await LocalStoreTools.ready();
                    const cached = LocalStoreTools.getAllTools(LocalStoreTools.STORES.TOOLS);
                    if (cached && Array.isArray(cached)) {
                        cached.forEach(def => {
                            const { valid } = _validateDefinition(def);
                            if (valid) _registry.set(def.id, _normaliseDefinition(def));
                        });
                    }
                } catch(e) {}
            }

            _initialized = true;
            console.log('[ToolRegistry] ✅ Initialized —', _registry.size, 'tools registered');
            return this;
        },

        async discoverTools(fetchFn) {
            if (typeof fetchFn !== 'function') {
                return { registered: 0, skipped: 0, errors: ['invalid fetchFn'] };
            }

            let rawTools = [];
            try {
                rawTools = await fetchFn();
                if (!Array.isArray(rawTools)) rawTools = rawTools?.tools || rawTools?.data?.tools || [];
            } catch (e) {
                return { registered: 0, skipped: _registry.size, errors: [e.message] };
            }

            let registered = 0, skipped = 0;
            const errors = [];

            for (const raw of rawTools) {
                const result = this.registerTool(raw);
                if (result.success) registered++;
                else { skipped++; errors.push(`${raw?.id}: ${result.reason}`); }
            }

            if (LocalStoreTools) {
                try {
                    await LocalStoreTools.mergeFromServer(
                        Array.from(_registry.values()),
                        LocalStoreTools.STORES.TOOLS
                    );
                } catch(e) {}
            }

            _persistRegistry();
            return { registered, skipped, errors };
        },

        registerTool(def) {
            const { valid, reason } = _validateDefinition(def);
            if (!valid) {
                return { success: false, reason };
            }

            const normalised = _normaliseDefinition(def);
            const existing = _registry.get(normalised.id);
            if (existing && existing.version === normalised.version) {
                return { success: true, reason: 'already registered (same version)' };
            }

            _registry.set(normalised.id, normalised);
            _notify('registered', normalised.id, normalised);
            return { success: true, reason: 'ok' };
        },

        isRegistered(toolId) {
            return _registry.has(String(toolId));
        },

        getRegisteredTool(toolId) {
            return _registry.get(String(toolId)) || null;
        },

        getAllRegistered() {
            return Array.from(_registry.values());
        },

        getInstalledTools() {
            return Array.from(_registry.values()).filter(t => t.isInstalled);
        },

        markInstalled(toolId, isInstalled = true) {
            const def = _registry.get(String(toolId));
            if (!def) return false;
            def.isInstalled = isInstalled;
            def.updatedAt = new Date().toISOString();
            _registry.set(def.id, def);
            _persistRegistry();
            _notify(isInstalled ? 'installed' : 'uninstalled', def.id, def);
            if (LocalStoreTools) {
                LocalStoreTools.saveToolLocal(def, LocalStoreTools.STORES.TOOLS).catch(() => {});
            }
            return true;
        },

        markActive(toolId, isActive = true) {
            const def = _registry.get(String(toolId));
            if (!def) return false;
            def.isActive = isActive;
            def.updatedAt = new Date().toISOString();
            _registry.set(def.id, def);
            _persistRegistry();
            _notify(isActive ? 'activated' : 'deactivated', def.id, def);
            return true;
        },

        unregisterTool(toolId) {
            const def = _registry.get(String(toolId));
            if (!def) return false;

            if (def.isInstalled) {
                console.warn(`[ToolRegistry] Refusing to unregister installed tool: ${toolId}`);
                return this.markActive(toolId, false);
            }

            _registry.delete(String(toolId));
            _persistRegistry();
            _notify('unregistered', toolId, def);
            return true;
        },

        isVersionMatch(toolId, version) {
            const def = _registry.get(String(toolId));
            return def ? def.version === String(version) : false;
        },

        subscribe(callback) {
            _subscribers.add(callback);
            return () => _subscribers.delete(callback);
        },

        getStats() {
            const all = Array.from(_registry.values());
            return {
                total: all.length,
                installed: all.filter(t => t.isInstalled).length,
                active: all.filter(t => t.isActive).length,
                localOnly: all.filter(t => t.isLocalOnly).length,
                byCategory: all.reduce((acc, t) => {
                    acc[t.category] = (acc[t.category] || 0) + 1;
                    return acc;
                }, {}),
            };
        },

        VALID_PERMISSIONS,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ToolRegistryManager.init());
    } else {
        ToolRegistryManager.init();
    }

    return ToolRegistryManager;
}));