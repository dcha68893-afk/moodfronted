/**
 * kynecta_safety_layer.js
 * Global Safety & Stabilization Layer — Kynecta v1.0
 *
 * FIXES:
 *  ✅ safeArray / safeObject guards
 *  ✅ AppStorage — single source of truth for localStorage (parent exposes, child reads)
 *  ✅ safeApiCall — wraps every API call with offline guard + error catch
 *  ✅ Safe localStorage helpers with logging
 *  ✅ Sync loop guard (isSyncing flag exposed on window)
 *  ✅ Initialization order contract
 *
 * LOAD ORDER: Must be the FIRST script loaded in chat.html and friend.html
 *             (before any app.core.* or friend-core.js)
 */

(function (global) {
    'use strict';

    // ── PHASE10: Console noise filter ─────────────────────────────────────────
    // Suppress MetaMask/ObjectMultiplex spam and other extension noise
    (function _installConsoleFilter() {
        const _origWarn  = console.warn.bind(console);
        const _origError = console.error.bind(console);
        const _SUPPRESS_PATTERNS = [
            'ObjectMultiplex',
            'orphaned data for stream',
            'malformed chunk without name',
            'metamask-inpage',
            'background-liveness',
            'app-init-liveness',
            'Invalid message format',
            // FIX-4: Also suppress MaxListenersExceededWarning — these come from
            // browser extensions (MetaMask etc.), not from app code. Filtering here
            // keeps the console clean without hiding real Socket.IO listener leaks
            // (those are deduped by _safeOn in app.realtime.socket.js instead).
            'MaxListenersExceededWarning',
            'Possible EventEmitter memory leak',
        ];
        function _shouldSuppress(args) {
            const msg = String(args[0] || '');
            return _SUPPRESS_PATTERNS.some(p => msg.includes(p));
        }
        console.warn = function(...args) {
            if (_shouldSuppress(args)) return;
            _origWarn(...args);
        };
        // Keep errors intact — only filter warnings from extensions
    })();

    // ── FIX-NOISE: Generic routine-banner log filter (every frame) ──────────
    // The app has ~40 subsystems (mesh engine, call orchestrators, group
    // engines, presence/notification/monitoring layers, etc.) that each log
    // their own "[Tag] ✅ Started / Ready / Initialized / Loaded" banner on
    // boot — and many of those subsystems boot independently inside EVERY
    // iframe (friend/calls/settings/group/status/tools/message), not just
    // the parent shell. app.realtime.socket.js already dedupes/quiets some
    // of this, but it only loads in chat.html and message.html, so all the
    // OTHER iframes' console output was never touched — that's the "still
    // lots of console noise" you're seeing. This filter lives here instead,
    // because kynecta.safety.layer.js is the one file loaded first in every
    // page (see load-order note at the top of this file), so it applies
    // uniformly everywhere.
    //
    // Only console.log / console.info are touched; console.warn/console.error
    // are never filtered here, so real problems stay visible.
    //
    // Set window.__CHAT_DEBUG__ = true in the console to see everything again.
    (function _installBannerLogFilter() {
        if (global.__kynBannerFilterInstalled) return;
        global.__kynBannerFilterInstalled = true;

        // Matches lines like "[MeshEngine] ✅ Initialised..." / "[Tools] 🔵 READY - ..."
        // / "[GroupOrchestrator] ✅ Ready" / "[settings] 🚀 SecurityValidator initializing"
        // i.e. any "[Tag] ..." formatted routine status/lifecycle chatter.
        const _BANNER_RE = /^\s*\[[^\]\n]{1,40}\]/;
        // Some subsystems log real failures through console.log/info instead
        // of console.warn/error (inconsistent, but not ours to refactor here)
        // — never suppress those even if they're bracket-tagged.
        const _FAILURE_RE = /\b(error|failed|fail|timed out|timeout|rejected|denied|blocked|invalid)\b/i;

        function _isRoutineBanner(firstArg) {
            if (global.__CHAT_DEBUG__) return false; // debug mode: show everything
            if (typeof firstArg !== 'string') return false;
            if (!_BANNER_RE.test(firstArg)) return false;
            if (_FAILURE_RE.test(firstArg)) return false;
            return true;
        }

        ['log', 'info'].forEach(function (method) {
            const _orig = console[method] ? console[method].bind(console) : function () {};
            console[method] = function (...args) {
                try {
                    if (_isRoutineBanner(args[0])) return;
                } catch (_) {}
                _orig(...args);
            };
        });

        // Let app.realtime.socket.js's own dedup installer know a console
        // filter is already active here, so it doesn't wrap console a
        // second time in chat.html/message.html (double-wrapping is harmless
        // but wasteful).
        global.__consoleDedupInstalled = true;
    })();

    // ── FIX-CHATLOG-SCOPE: global _chatLog ──────────────────────────────────
    // chat.html calls the bare identifier `_chatLog(...)` from many separate
    // <script> tags (module registration, iframe-queue flushing, call
    // handling, group header, keep-alive ping, etc). It was previously only
    // declared with `const _chatLog = ...` inside ONE of those <script>
    // blocks, so `const`/`let` top-level declarations are scoped to that one
    // script tag only — every other <script> tag calling `_chatLog(...)`
    // threw "_chatLog is not defined". That ReferenceError fired every time
    // an iframe posted CHILD_READY, aborting registerModule()/the ready-flag
    // flush *before* the iframe was ever marked ready — which is why some
    // iframe icons (friends/calls/settings/tools/games/group/status) would
    // silently fail to open on click. Declaring it here (loaded first, per
    // this file's own load-order contract) attaches it to window, so the
    // bare identifier resolves correctly from every later <script> block.
    global._chatLog = global._chatLog || function (...a) {
        if (global.__CHAT_DEBUG__) console.log(...a);
    };

    // Log suppression: noisy safety-layer messages printed only once (across iframes).
    function _logOnce(key, level, message) {
        try {
            var storageKey = '__kynecta_safety_logOnce__' + String(key || '').replace(/[^a-z0-9_\-]/ig, '_');
            if (localStorage.getItem(storageKey)) return;
            localStorage.setItem(storageKey, '1');
        } catch (_) {}
        try {
            var fn = (level === 'warn') ? console.warn
                : (level === 'error') ? console.error
                : (level === 'info') ? console.info
                : console.log;
            fn.call(console, message);
        } catch (_) {}
    }

    function announceAppStorageReady(source) {
        try {
            global.__kynParentReady = true;
            global.dispatchEvent(new CustomEvent('AppStorageReady', {
                detail: { source: source || 'safety-layer', timestamp: Date.now() }
            }));
        } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. TYPE-SAFE COERCION HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Always returns an Array.
     * Accepts arrays, null, undefined, or any non-array value.
     */
    global.safeArray = function safeArray(data) {
        if (Array.isArray(data)) return data;
        if (data === null || data === undefined) return [];
        // FIX-STRING-CHAR-SPLIT: strings are technically iterable in JS, so
        // Array.from('word') silently produced ['w','o','r','d'] below — every
        // caller in this codebase uses safeArray() to coerce a *list of items*
        // (messages, conversations, etc.), never a string, so a bare string
        // reaching here always means something upstream meant to pass an array/
        // object and passed its raw text instead. Treating it as "not a valid
        // list" (empty array) instead of exploding it character-by-character
        // fixes cases like a one-word message rendering as one bubble per letter.
        if (typeof data === 'string') return [];
        // Handle Set / Map / iterables
        if (typeof data[Symbol.iterator] === 'function') {
            try { return Array.from(data); } catch (_) { return []; }
        }
        return [];
    };

    /**
     * Always returns a plain object.
     */
    global.safeObject = function safeObject(data) {
        if (data && typeof data === 'object' && !Array.isArray(data)) return data;
        return {};
    };

    /**
     * Safely parse JSON, returning fallback on any error.
     */
    global.safeParse = function safeParse(str, fallback) {
        if (fallback === undefined) fallback = null;
        if (!str) return fallback;
        try { return JSON.parse(str); } catch (_) { return fallback; }
    };

    var __localSaveLogState = global.__kynLocalSaveLogState || (global.__kynLocalSaveLogState = Object.create(null));
    function shouldLogLocalSave(key) {
        if (global.__isProductionConsoleHost && global.__isProductionConsoleHost() && global.__ALLOW_VERBOSE_CONSOLE__ !== true) {
            return false;
        }
        var now = Date.now();
        var last = __localSaveLogState[key] || 0;
        if (now - last < 15000) return false;
        __localSaveLogState[key] = now;
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. APP STORAGE — SINGLE SOURCE OF TRUTH
    //    Parent (chat.html) creates window.AppStorage.
    //    Child iframes access it via window.parent.AppStorage.
    // ─────────────────────────────────────────────────────────────────────────

    // Only the top-level frame should define the canonical AppStorage.
    // Iframes will use the reference below.
    var _isTopFrame = (function () {
        try { return global === global.top; } catch (_) { return false; }
    })();

    if (_isTopFrame && !global.AppStorage) {
        global.AppStorage = {
            /**
             * Read a key; returns parsed value or defaultValue.
             * @param {string} key
             * @param {*} defaultValue
             */
            get: function (key, defaultValue) {
                if (defaultValue === undefined) defaultValue = null;
                try {
                    var raw = localStorage.getItem(key);
                    if (raw === null || raw === undefined) return defaultValue;
                    var parsed = safeParse(raw, undefined);
                    if (parsed === undefined) return raw; // plain string value
                    return parsed;
                } catch (e) {
                    console.warn('[AppStorage.get] Error reading "' + key + '":', e);
                    return defaultValue;
                }
            },

            /**
             * Persist a value; always stringifies objects/arrays.
             * @param {string} key
             * @param {*} value
             */
            set: function (key, value) {
                try {
                    var serialized = (typeof value === 'string') ? value : JSON.stringify(value);
                    localStorage.setItem(key, serialized);
                    if (shouldLogLocalSave(key)) console.log('[LOCAL SAVE]', key, value);
                    return true;
                } catch (e) {
                    console.error('[AppStorage.set] Failed to write "' + key + '":', e);
                    return false;
                }
            },

            /**
             * Remove a key (with protection for auth keys).
             */
            remove: function (key) {
                var PROTECTED = ['kynecta_auth', 'token', 'moodchat_token', 'accessToken', 'USER_TOKEN'];
                if (PROTECTED.indexOf(key) !== -1 && global.__allowAuthStorageMutation__ !== true) {
                    console.warn('[AppStorage.remove] Blocked removal of protected key:', key);
                    return false;
                }
                try {
                    localStorage.removeItem(key);
                    return true;
                } catch (e) {
                    return false;
                }
            },

            /**
             * Convenience: get an array (never null/undefined).
             */
            getArray: function (key) {
                return safeArray(this.get(key, []));
            },

            /**
             * Convenience: get an object (never null/undefined).
             */
            getObject: function (key) {
                return safeObject(this.get(key, {}));
            },

            clear: function (options) {
                var preserveAuth = !options || options.preserveAuth !== false;
                try {
                    if (!preserveAuth || global.__allowAuthStorageMutation__ === true) {
                        localStorage.clear();
                        return true;
                    }

                    var authSnapshot = {
                        kynecta_auth: localStorage.getItem('kynecta_auth'),
                        token: localStorage.getItem('token'),
                        accessToken: localStorage.getItem('accessToken'),
                        USER_TOKEN: localStorage.getItem('USER_TOKEN'),
                        currentUser: localStorage.getItem('currentUser'),
                        user: localStorage.getItem('user')
                    };

                    localStorage.clear();

                    Object.keys(authSnapshot).forEach(function (key) {
                        if (authSnapshot[key] !== null && authSnapshot[key] !== undefined) {
                            localStorage.setItem(key, authSnapshot[key]);
                        }
                    });

                    return true;
                } catch (e) {
                    console.warn('[AppStorage.clear] Failed:', e);
                    return false;
                }
            }
        };

        _logOnce('topAppStorageInitialized', 'log', '[SafetyLayer] ✅ AppStorage initialized (top frame)');
        announceAppStorageReady('top-frame');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. CHILD IFRAME — BRIDGE TO PARENT AppStorage
    //    Exposes window.AppStorage as a proxy to window.parent.AppStorage.
    // ─────────────────────────────────────────────────────────────────────────

    if (!_isTopFrame && !global.AppStorage) {
        try {
            var _parent = global.parent;
            if (_parent && _parent.AppStorage) {
                global.AppStorage = _parent.AppStorage;
                _logOnce('appStorageBridgedFromParent', 'log', '[SafetyLayer] ✅ AppStorage bridged from parent');
                announceAppStorageReady('parent-bridge');
            } else {
                // Parent not ready yet — create a local fallback and swap later
                global.AppStorage = {
                    _local: true,
                    get: function (key, def) {
                        try { return safeParse(localStorage.getItem(key), def !== undefined ? def : null); } catch (_) { return def || null; }
                    },
                    set: function (key, value) {
                        try {
                            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                            if (shouldLogLocalSave(key)) console.log('[LOCAL SAVE (child fallback)]', key, value);
                            return true;
                        } catch (_) { return false; }
                    },
                    getArray:  function (key) { return safeArray(this.get(key, [])); },
                    getObject: function (key) { return safeObject(this.get(key, {})); }
                };

                // Attempt to upgrade to parent storage after a tick
                setTimeout(function () {
                    try {
                        if (global.parent && global.parent.AppStorage) {
                            global.AppStorage = global.parent.AppStorage;
                            _logOnce('appStorageUpgradedDeferred', 'log', '[SafetyLayer] ✅ AppStorage upgraded to parent (deferred)');
                            announceAppStorageReady('parent-upgrade');
                        }
                    } catch (_) {}
                }, 500);

                _logOnce('parentAppStorageNotReady', 'info', '[SafetyLayer] Parent AppStorage not ready yet; using local fallback until parent storage is available');
            }
        } catch (e) {
            console.warn('[SafetyLayer] ⚠️ Cross-origin parent access blocked — local storage only', e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. SAFE API CALL WRAPPER
    //    Prevents crashes and freezes from network failures.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Wraps an async API function.
     * Returns null (not throws) when offline or on error.
     *
     * @param {Function} fn       - Async function to call
     * @param {*}        fallback - Value to return on failure (default: null)
     * @returns {Promise<*>}
     */
    global.safeApiCall = async function safeApiCall(fn, fallback) {
        if (fallback === undefined) fallback = null;
        if (!navigator.onLine) {
            console.warn('[safeApiCall] Offline — skipping API call');
            return fallback;
        }
        try {
            return await fn();
        } catch (e) {
            console.warn('[safeApiCall] API failed:', e && e.message ? e.message : e);
            return fallback;
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 5. SYNC LOOP GUARD — shared flag
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Global sync guard used by any sync engine to prevent concurrent / looping syncs.
     * Usage:
     *   if (!KynSyncGuard.acquire('friends')) return;
     *   ... do sync ...
     *   KynSyncGuard.release('friends');
     */
    global.KynSyncGuard = global.KynSyncGuard || (function () {
        var _locks = {};
        var _maxAge = 30000; // 30 s safety timeout — release stale locks automatically
        var _timestamps = {};

        return {
            acquire: function (name) {
                var now = Date.now();
                // Auto-release stale lock
                if (_locks[name] && (now - (_timestamps[name] || 0)) > _maxAge) {
                    console.warn('[KynSyncGuard] Stale lock released for:', name);
                    _locks[name] = false;
                }
                if (_locks[name]) return false;
                _locks[name] = true;
                _timestamps[name] = now;
                return true;
            },
            release: function (name) {
                _locks[name] = false;
                _timestamps[name] = 0;
            },
            isLocked: function (name) {
                return !!_locks[name];
            }
        };
    })();

    // ─────────────────────────────────────────────────────────────────────────
    // 6. SAFE RENDER HELPER
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Safely invokes a render function with a guaranteed array.
     * If renderFn throws, the error is caught and logged — no freeze.
     *
     * @param {Function} renderFn  - Function that accepts an array
     * @param {*}        rawData   - Data to coerce to array first
     * @param {string}   label     - Debug label
     */
    global.safeRender = function safeRender(renderFn, rawData, label) {
        var data = safeArray(rawData);
        try {
            renderFn(data);
        } catch (e) {
            console.error('[safeRender] Render error' + (label ? ' (' + label + ')' : '') + ':', e);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 7. INIT ORDER SIGNALLING
    //    Parent sets window.__kynParentReady = true after AppStorage + session.
    //    Child iframes poll for this flag before loading data.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns a Promise that resolves once window.parent.__kynParentReady is true.
     * Times out after 8 seconds and resolves anyway (graceful degradation).
     *
     * @param {number} timeoutMs
     * @returns {Promise<void>}
     */
    global.waitForParentReady = function waitForParentReady(timeoutMs) {
        if (timeoutMs === undefined) timeoutMs = 8000;
        return new Promise(function (resolve) {
            // Already ready
            if (_isTopFrame || (global.parent && global.parent.__kynParentReady)) {
                return resolve();
            }
            var elapsed = 0;
            var interval = setInterval(function () {
                elapsed += 100;
                var ready = false;
                try { ready = global.parent && global.parent.__kynParentReady; } catch (_) { ready = true; /* cross-origin */ }
                if (ready || elapsed >= timeoutMs) {
                    clearInterval(interval);
                    if (!ready) console.warn('[waitForParentReady] Timed out — continuing anyway');
                    resolve();
                }
            }, 100);
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 8. DEBUG VISIBILITY HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    global.KynDebug = global.KynDebug || {
        enabled: false,
        log: function () {
            if (!this.enabled) return;
            var args = Array.prototype.slice.call(arguments);
            console.log.apply(console, ['[KynDebug]'].concat(args));
        }
    };

    _logOnce('globalSafetyLayerLoaded', 'log', '[SafetyLayer] ✅ Global safety layer loaded');

}(typeof window !== 'undefined' ? window : this));
