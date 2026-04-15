/**
 * toolexecution.sandbox.js — Isolated Tool Execution Sandbox
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (root, factory) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(
            require('./toolregistry.manager.js'),
            require('./toolpermission.guard.js'),
            require('./localstore.tools.js')
        );
    } else {
        root.ToolExecutionSandbox = factory(
            root.ToolRegistryManager,
            root.ToolPermissionGuard,
            root.LocalStoreTools
        );
        window.ToolExecutionSandbox = root.ToolExecutionSandbox;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (ToolRegistryManager, ToolPermissionGuard, LocalStoreTools) {
    'use strict';

    const EXECUTION_TIMEOUT_MS = 15000;
    const MAX_CONCURRENT = 5;

    const _running = new Map();
    let _execCounter = 0;
    let _sandboxRoot = null;

    const STATUS = {
        PENDING: 'pending',
        RUNNING: 'running',
        COMPLETED: 'completed',
        FAILED: 'failed',
        CRASHED: 'crashed',
        TIMEOUT: 'timeout',
        DENIED: 'denied',
    };

    function _makeExecId() {
        return `exec_${++_execCounter}_${Date.now()}`;
    }

    function _ensureSandboxRoot() {
        if (_sandboxRoot && document.body.contains(_sandboxRoot)) return _sandboxRoot;
        _sandboxRoot = document.getElementById('tool-sandbox-root');
        if (!_sandboxRoot) {
            _sandboxRoot = document.createElement('div');
            _sandboxRoot.id = 'tool-sandbox-root';
            _sandboxRoot.style.cssText = 'position:fixed;bottom:0;right:0;width:0;height:0;overflow:hidden;pointer-events:none;';
            document.body.appendChild(_sandboxRoot);
        }
        return _sandboxRoot;
    }

    function _stripAuthHeaders(headers) {
        if (!headers) return headers;
        const safeHeaders = { ...headers };
        const authHeaders = [
            'Authorization', 'authorization', 'Cookie', 'cookie',
            'X-Auth-Token', 'x-auth-token', 'Bearer', 'bearer',
            'X-API-Key', 'x-api-key', 'Api-Key', 'api-key',
            'X-Session-Token', 'x-session-token', 'X-CSRF-Token', 'x-csrf-token',
            'Token', 'token'
        ];
        authHeaders.forEach(h => delete safeHeaders[h]);
        return safeHeaders;
    }

    function _buildContext(def, executionId, onOutput) {
        const sandboxStorage = {};

        return Object.freeze({
            toolId: def.id,
            toolName: def.name,
            toolVersion: def.version,
            executionId,

            getSandboxRoot() { return _ensureSandboxRoot(); },

            storage: Object.freeze({
                async getItem(key) {
                    if (!ToolPermissionGuard) throw new Error('Permission guard not available');
                    const check = ToolPermissionGuard.validateSandboxAccess(def.id, 'storage');
                    if (!check.allowed) throw new Error(check.reason);
                    const ns = `tool_${def.id}_${key}`;
                    return LocalStoreTools ? LocalStoreTools.getMeta(ns) : (sandboxStorage[ns] ?? null);
                },
                async setItem(key, value) {
                    if (!ToolPermissionGuard) throw new Error('Permission guard not available');
                    const check = ToolPermissionGuard.validateSandboxAccess(def.id, 'storage');
                    if (!check.allowed) throw new Error(check.reason);
                    const ns = `tool_${def.id}_${key}`;
                    sandboxStorage[ns] = value;
                    if (LocalStoreTools) await LocalStoreTools.setMeta(ns, value);
                },
                async removeItem(key) {
                    const ns = `tool_${def.id}_${key}`;
                    delete sandboxStorage[ns];
                    if (LocalStoreTools) await LocalStoreTools.deleteToolLocal(ns, LocalStoreTools.STORES.META);
                },
            }),

            async fetch(url, options = {}) {
                if (!ToolPermissionGuard) throw new Error('Permission guard not available');
                const check = ToolPermissionGuard.validateSandboxAccess(def.id, 'network');
                if (!check.allowed) throw new Error(check.reason);

                const safeOptions = { ...options };
                if (safeOptions.headers) {
                    safeOptions.headers = _stripAuthHeaders(safeOptions.headers);
                }

                try {
                    return await window.fetch(url, safeOptions);
                } catch(err) {
                    console.error(`[Sandbox] Network error for tool ${def.id}:`, err);
                    throw err;
                }
            },

            notify(message, type = 'info') {
                if (!ToolPermissionGuard) return;
                if (!ToolPermissionGuard.hasPermission(def.id, 'notifications')) {
                    console.warn('[Sandbox] Tool attempted notify without permission');
                    return;
                }
                try {
                    window.dispatchEvent(new CustomEvent('toolSandbox:notify', {
                        detail: { toolId: def.id, message, type }
                    }));
                } catch(e) {}
            },

            output(data) {
                if (typeof onOutput === 'function') {
                    try { onOutput(data); } catch(e) {}
                }
                try {
                    window.dispatchEvent(new CustomEvent('toolSandbox:output', {
                        detail: { toolId: def.id, executionId, data }
                    }));
                } catch(e) {}
            },

            log(...args) { console.log(`[Tool:${def.id}]`, ...args); },
            warn(...args) { console.warn(`[Tool:${def.id}]`, ...args); },
            error(...args) { console.error(`[Tool:${def.id}]`, ...args); },
        });
    }

    function _emit(event, detail) {
        try {
            window.dispatchEvent(new CustomEvent('toolExecution:' + event, { detail }));
        } catch(e) {}
    }

    const ToolExecutionSandbox = {

        STATUS,

        async execute(toolId, toolFn, params = {}, onOutput = null) {
            if (_running.size >= MAX_CONCURRENT) {
                return { executionId: null, status: STATUS.DENIED, error: 'Too many concurrent tool executions' };
            }

            if (!ToolPermissionGuard) {
                return { executionId: null, status: STATUS.DENIED, error: 'Permission guard not initialized' };
            }

            const permCheck = ToolPermissionGuard.canExecute(toolId);
            if (!permCheck.allowed) {
                return { executionId: null, status: STATUS.DENIED, error: permCheck.reason };
            }

            if (typeof toolFn !== 'function') {
                if (ToolPermissionGuard) ToolPermissionGuard.blockTool(toolId, 'Attempted execution of non-function');
                return { executionId: null, status: STATUS.DENIED, error: 'Tool entry point is not a function — execution blocked' };
            }

            if (!ToolRegistryManager) {
                return { executionId: null, status: STATUS.DENIED, error: 'Registry manager not initialized' };
            }

            const def = ToolRegistryManager.getRegisteredTool(toolId);
            if (!def) {
                return { executionId: null, status: STATUS.DENIED, error: 'Tool definition not found' };
            }

            const executionId = _makeExecId();
            const context = _buildContext(def, executionId, onOutput);

            const execState = {
                executionId,
                toolId,
                status: STATUS.RUNNING,
                startedAt: Date.now(),
                result: null,
                error: null,
            };
            _running.set(executionId, execState);
            _emit('start', { toolId, executionId });

            let timer;
            try {
                const result = await Promise.race([
                    Promise.resolve().then(() => toolFn(context, params)),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Execution timeout')), EXECUTION_TIMEOUT_MS);
                    }),
                ]);
                clearTimeout(timer);

                execState.status = STATUS.COMPLETED;
                execState.result = result;
                _emit('complete', { toolId, executionId, result });

            } catch(err) {
                clearTimeout(timer);
                const isTimeout = err.message === 'Execution timeout';
                execState.status = isTimeout ? STATUS.TIMEOUT : STATUS.FAILED;
                execState.error = err.message;
                console.error(`[Sandbox] Tool ${toolId} ${execState.status}:`, err.message);
                _emit('error', { toolId, executionId, error: err.message, status: execState.status });
            } finally {
                _running.delete(executionId);
                execState.endedAt = Date.now();
            }

            return {
                executionId,
                status: execState.status,
                result: execState.result,
                error: execState.error,
                duration: (execState.endedAt || Date.now()) - execState.startedAt,
            };
        },

        abort(executionId) {
            const state = _running.get(executionId);
            if (!state) return false;
            state.status = STATUS.FAILED;
            state.error = 'Aborted by user';
            _running.delete(executionId);
            _emit('aborted', { toolId: state.toolId, executionId });
            return true;
        },

        getRunning() {
            return Array.from(_running.values());
        },

        isRunning(toolId) {
            return Array.from(_running.values()).some(e => e.toolId === toolId);
        },

        requestPermissions(toolId, permissions = []) {
            return new Promise((resolve) => {
                if (!ToolPermissionGuard) {
                    resolve({ granted: [] });
                    return;
                }

                const sensitive = permissions.filter(p => ToolPermissionGuard.SENSITIVE_PERMISSIONS.has(p));

                if (!sensitive.length) {
                    permissions.forEach(p => ToolPermissionGuard.grantPermission(toolId, p));
                    resolve({ granted: permissions });
                    return;
                }

                const requestId = `perm_req_${Date.now()}`;
                const handler = (e) => {
                    if (e.detail?.requestId !== requestId) return;
                    window.removeEventListener('toolSandbox:permissionResponse', handler);
                    const approved = e.detail?.approved || [];
                    approved.forEach(p => ToolPermissionGuard.grantPermission(toolId, p));
                    resolve({ granted: approved });
                };
                window.addEventListener('toolSandbox:permissionResponse', handler);
                try {
                    window.dispatchEvent(new CustomEvent('toolSandbox:permissionRequest', {
                        detail: { toolId, permissions: sensitive, requestId }
                    }));
                } catch(e) {}

                setTimeout(() => {
                    window.removeEventListener('toolSandbox:permissionResponse', handler);
                    resolve({ granted: [] });
                }, 30000);
            });
        },

        validateSandboxAccess(toolId, accessType) {
            if (!ToolPermissionGuard) return { allowed: false, reason: 'Permission guard not available' };
            return ToolPermissionGuard.validateSandboxAccess(toolId, accessType);
        },

        getStats() {
            return {
                running: _running.size,
                maxConcurrent: MAX_CONCURRENT,
                timeoutMs: EXECUTION_TIMEOUT_MS,
            };
        },
    };

    return ToolExecutionSandbox;
}));