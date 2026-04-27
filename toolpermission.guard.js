/**
 * toolpermission.guard.js — Permission Enforcement & Signature Validation
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (root, factory) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(
            require('./toolregistry.manager.js'),
            require('./localstore.tools.js')
        );
    } else {
        root.ToolPermissionGuard = factory(
            root.ToolRegistryManager,
            root.LocalStoreTools
        );
        window.ToolPermissionGuard = root.ToolPermissionGuard;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (ToolRegistryManager, LocalStoreTools) {
    'use strict';

    const PERMISSION_LEVEL = {
        GRANTED: 'granted',
        DENIED: 'denied',
        PROMPT: 'prompt',
    };

    const SENSITIVE_PERMISSIONS = new Set([
        'camera', 'microphone', 'geolocation', 'ui_injection'
    ]);

    const _grantedPerms = new Map();
    const _auditLog = [];
    const MAX_AUDIT = 500;
    const RATE_LIMIT = 60;          // max calls per window
    const RATE_WINDOW = 60 * 1000;  // FIX: was undefined — 1-minute rolling window in ms
    const _rateLimits = new Map();
    const _blocked = new Set();

    function _audit(toolId, action, result, reason = '') {
        const entry = {
            timestamp: new Date().toISOString(),
            toolId,
            action,
            result,
            reason,
        };
        _auditLog.push(entry);
        if (_auditLog.length > MAX_AUDIT) _auditLog.shift();

        if (result === 'denied') {
            if (window.__TOOLS_DEBUG__) console.warn(`[PermissionGuard] ❌ DENIED [${toolId}] ${action} — ${reason}`);
        }

        try {
            window.dispatchEvent(new CustomEvent('toolPermission:audit', { detail: entry }));
        } catch(e) {}
    }

    function _checkRateLimit(toolId) {
        const now = Date.now();
        const state = _rateLimits.get(toolId) || { count: 0, windowStart: now };

        if (now - state.windowStart > RATE_WINDOW) {
            state.count = 1;
            state.windowStart = now;
            _rateLimits.set(toolId, state);
            return true;
        }

        if (state.count >= RATE_LIMIT) {
            _audit(toolId, 'execute', 'denied', `Rate limit exceeded (${RATE_LIMIT}/min)`);
            return false;
        }

        state.count++;
        _rateLimits.set(toolId, state);
        return true;
    }

    function _verifySignature(def) {
        if (!def) return false;
        
        // CRITICAL: Even local tools need basic validation
        if (def.isLocalOnly) {
            return def.id && def.name && def.version && def.entryPoint;
        }
        
        // CRITICAL: Proper signature validation for remote tools
        if (!def.signature) return false;
        if (typeof def.signature !== 'string') return false;
        if (def.signature.length < 32) return false; // Increased minimum length
        
        // CRITICAL: Verify signature format (sha256 hash)
        const signaturePattern = /^[a-f0-9]{32,}$/i;
        if (!signaturePattern.test(def.signature)) return false;
        
        // CRITICAL: Verify signature matches tool content
        const expectedSig = crypto.createHash('sha256')
            .update(def.id + def.version + def.entryPoint + '_knecta_secure')
            .digest('hex');
        
        return def.signature === expectedSig;
    }

    const ToolPermissionGuard = {

        canExecute(toolId, requestedPermissions = []) {
            if (_blocked.has(toolId)) {
                _audit(toolId, 'execute', 'denied', 'Tool is blocked');
                return { allowed: false, reason: 'Tool is blocked by policy' };
            }

            if (!ToolRegistryManager || !ToolRegistryManager.isRegistered(toolId)) {
                _audit(toolId, 'execute', 'denied', 'Not in registry');
                return { allowed: false, reason: 'Unknown tool — not registered' };
            }

            const def = ToolRegistryManager.getRegisteredTool(toolId);
            if (!def) {
                _audit(toolId, 'execute', 'denied', 'Definition not found');
                return { allowed: false, reason: 'Tool definition not found' };
            }

            if (!def.isInstalled) {
                _audit(toolId, 'execute', 'denied', 'Not installed');
                return { allowed: false, reason: 'Tool is not installed' };
            }

            if (!def.isActive) {
                _audit(toolId, 'execute', 'denied', 'Not active');
                return { allowed: false, reason: 'Tool is disabled' };
            }

            if (!_verifySignature(def)) {
                _audit(toolId, 'execute', 'denied', 'Invalid signature');
                return { allowed: false, reason: 'Tool signature invalid — execution blocked' };
            }

            const missing = this.getMissingPermissions(toolId, requestedPermissions);
            if (missing.length > 0) {
                _audit(toolId, 'execute', 'denied', `Missing permissions: ${missing.join(', ')}`);
                return { allowed: false, reason: `Missing permissions: ${missing.join(', ')}` };
            }

            if (!_checkRateLimit(toolId)) {
                return { allowed: false, reason: 'Rate limit exceeded — try again later' };
            }

            _audit(toolId, 'execute', 'granted', 'All checks passed');
            return { allowed: true, reason: 'ok' };
        },

        grantPermission(toolId, permission) {
            if (!ToolRegistryManager || !ToolRegistryManager.VALID_PERMISSIONS.has(permission)) {
                if (window.__TOOLS_DEBUG__) console.warn('[PermissionGuard] Unknown permission:', permission);
                return false;
            }
            if (!_grantedPerms.has(toolId)) _grantedPerms.set(toolId, new Set());
            _grantedPerms.get(toolId).add(permission);
            _audit(toolId, 'grant', 'granted', permission);
            return true;
        },

        revokePermission(toolId, permission) {
            const perms = _grantedPerms.get(toolId);
            if (perms) { perms.delete(permission); }
            _audit(toolId, 'revoke', 'granted', permission);
        },

        revokeAll(toolId) {
            _grantedPerms.delete(toolId);
            _audit(toolId, 'revokeAll', 'granted', 'all permissions revoked');
        },

        hasPermission(toolId, permission) {
            return _grantedPerms.get(toolId)?.has(permission) || false;
        },

        getMissingPermissions(toolId, extra = []) {
            if (!ToolRegistryManager) return extra;
            const def = ToolRegistryManager.getRegisteredTool(toolId);
            const required = [...(def?.permissions || []), ...extra];
            const granted = _grantedPerms.get(toolId) || new Set();
            return required.filter(p => !granted.has(p));
        },

        getSensitivePermissions(toolId) {
            if (!ToolRegistryManager) return [];
            const def = ToolRegistryManager.getRegisteredTool(toolId);
            if (!def) return [];
            return (def.permissions || []).filter(p => SENSITIVE_PERMISSIONS.has(p));
        },

        blockTool(toolId, reason = '') {
            _blocked.add(toolId);
            _audit(toolId, 'block', 'denied', reason);
        },

        unblockTool(toolId) {
            _blocked.delete(toolId);
            _audit(toolId, 'unblock', 'granted', 'Tool unblocked');
        },

        isBlocked(toolId) { return _blocked.has(toolId); },

        verifyToolSignature(def) {
            return _verifySignature(def);
        },

        getAuditLog(limit = 50) {
            return _auditLog.slice(-limit);
        },

        getAuditForTool(toolId, limit = 20) {
            return _auditLog.filter(e => e.toolId === toolId).slice(-limit);
        },

        validateSandboxAccess(toolId, accessType) {
            const FORBIDDEN = {
                auth: 'No direct access to authentication system',
                token: 'No access to raw backend tokens',
                user_data: 'No access to other users private data',
            };

            if (FORBIDDEN[accessType]) {
                _audit(toolId, `sandbox:${accessType}`, 'denied', FORBIDDEN[accessType]);
                return { allowed: false, reason: FORBIDDEN[accessType] };
            }

            if (accessType === 'dom' && !this.hasPermission(toolId, 'ui_injection')) {
                _audit(toolId, 'sandbox:dom', 'denied', 'ui_injection permission required');
                return { allowed: false, reason: 'Direct DOM manipulation requires ui_injection permission' };
            }

            if (accessType === 'network' && !this.hasPermission(toolId, 'network')) {
                _audit(toolId, 'sandbox:network', 'denied', 'network permission required');
                return { allowed: false, reason: 'Network access requires network permission' };
            }

            if (accessType === 'storage' && !this.hasPermission(toolId, 'storage')) {
                _audit(toolId, 'sandbox:storage', 'denied', 'storage permission required');
                return { allowed: false, reason: 'Storage access requires storage permission' };
            }

            return { allowed: true, reason: 'ok' };
        },

        getRateLimitStatus(toolId) {
            const state = _rateLimits.get(toolId);
            if (!state) return { calls: 0, remaining: RATE_LIMIT, resetIn: RATE_WINDOW };
            const elapsed = Date.now() - state.windowStart;
            const remaining = Math.max(0, RATE_LIMIT - state.count);
            const resetIn = Math.max(0, RATE_WINDOW - elapsed);
            return { calls: state.count, remaining, resetIn };
        },

        PERMISSION_LEVEL,
        SENSITIVE_PERMISSIONS,
    };

    return ToolPermissionGuard;
}));