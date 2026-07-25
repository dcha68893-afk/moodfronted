/**
 * settingsSchema.validator.js
 * Schema-based validation for all settings fields.
 * Used by both localStore and syncEngine to guard writes.
 * Version: 1.0.0
 */

(function (global) {
    'use strict';

    // ─── Type helpers ─────────────────────────────────────────────────────────────
    const is = {
        bool:   v => typeof v === 'boolean',
        str:    v => typeof v === 'string',
        obj:    v => v !== null && typeof v === 'object' && !Array.isArray(v),
        oneOf: (...opts) => v => opts.includes(v),
        minLen: (n) => v => typeof v === 'string' && v.length >= n,
    };

    // ─── Schema ───────────────────────────────────────────────────────────────────
    // Each key maps to { validate(v) => bool|string, required?: bool, default }
    const SCHEMA = {
        userId:     { validate: v => v === null || is.str(v) || typeof v === 'number', required: false, default: null },
        theme:      { validate: is.oneOf('light','dark'), required: true, default: 'light' },
        language:   { validate: v => is.str(v) && v.length >= 2, required: true, default: 'en' },
        syncEnabled:{ validate: is.bool, required: true, default: true  },
        updatedAt:  { validate: v => v === null || is.str(v), required: false, default: null },

        'notifications':          { validate: is.obj, required: true, default: {} },
        'notifications.messages': { validate: is.bool, required: true, default: true },
        'notifications.calls':    { validate: is.bool, required: true, default: true },
        'notifications.groups':   { validate: is.bool, required: true, default: true },

        'privacy':                   { validate: is.obj, required: true, default: {} },
        'privacy.lastSeen':          { validate: is.oneOf('everyone','contacts','nobody'), required: true, default: 'everyone' },
        'privacy.readReceipts':      { validate: is.bool, required: true, default: true },
        'privacy.statusVisibility':  { validate: is.oneOf('everyone','contacts','nobody'), required: true, default: 'everyone' },

        'chat':                      { validate: is.obj, required: true, default: {} },
        'chat.autoDownloadMedia':    { validate: is.bool, required: true, default: true },
        'chat.fontSize':             { validate: is.oneOf('small','medium','large'), required: true, default: 'medium' },
    };

    // ─── Validate a single path/value pair ───────────────────────────────────────
    function validateField(path, value) {
        const rule = SCHEMA[path];
        if (!rule) {
            // Unknown path — allow but warn
            return { valid: true, warn: `No schema rule for "${path}" — allowed but unvalidated` };
        }

        const result = rule.validate(value);
        if (result === false || typeof result === 'string') {
            return {
                valid: false,
                reason: typeof result === 'string' ? result : `Invalid value for "${path}": ${JSON.stringify(value)}`
            };
        }
        return { valid: true };
    }

    // ─── Validate an entire settings object ──────────────────────────────────────
    function validateAll(settings, options = {}) {
        const errors = [];
        const warnings = [];
        const { strict = false } = options;

        function walk(obj, prefix) {
            if (!obj || typeof obj !== 'object') return;
            Object.keys(obj).forEach(key => {
                const fullPath = prefix ? `${prefix}.${key}` : key;
                const value = obj[key];

                if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    // Validate the object itself
                    const r = validateField(fullPath, value);
                    if (!r.valid) errors.push({ path: fullPath, reason: r.reason });
                    if (r.warn) warnings.push({ path: fullPath, msg: r.warn });
                    // Recurse
                    walk(value, fullPath);
                } else {
                    const r = validateField(fullPath, value);
                    if (!r.valid) errors.push({ path: fullPath, reason: r.reason });
                    if (r.warn) warnings.push({ path: fullPath, msg: r.warn });
                }
            });
        }

        walk(settings, '');

        // Check required fields exist
        if (strict) {
            Object.entries(SCHEMA).forEach(([path, rule]) => {
                if (!rule.required) return;
                const parts = path.split('.');
                let curr = settings;
                for (const part of parts) {
                    if (curr == null || typeof curr !== 'object') { curr = undefined; break; }
                    curr = curr[part];
                }
                if (curr === undefined || curr === null) {
                    errors.push({ path, reason: `Required field "${path}" is missing` });
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ─── Sanitize / coerce a settings object to safe defaults ────────────────────
    function sanitize(settings) {
        if (!settings || typeof settings !== 'object') return getDefaults();

        const defaults = getDefaults();
        const out = Object.assign({}, defaults);

        function applyField(path, value) {
            const rule = SCHEMA[path];
            if (rule) {
                const result = rule.validate(value);
                if (result === false || typeof result === 'string') {
                    // Use default
                    return rule.default;
                }
            }
            return value;
        }

        // Top-level fields
        ['userId','theme','language','syncEnabled','updatedAt'].forEach(key => {
            if (settings[key] !== undefined) {
                out[key] = applyField(key, settings[key]);
            }
        });

        // Nested: notifications
        if (settings.notifications && typeof settings.notifications === 'object') {
            out.notifications = {};
            ['messages','calls','groups'].forEach(k => {
                const v = settings.notifications[k];
                out.notifications[k] = applyField(`notifications.${k}`, v !== undefined ? v : defaults.notifications[k]);
            });
        }

        // Nested: privacy
        if (settings.privacy && typeof settings.privacy === 'object') {
            out.privacy = {};
            ['lastSeen','readReceipts','statusVisibility'].forEach(k => {
                const v = settings.privacy[k];
                out.privacy[k] = applyField(`privacy.${k}`, v !== undefined ? v : defaults.privacy[k]);
            });
        }

        // Nested: chat
        if (settings.chat && typeof settings.chat === 'object') {
            out.chat = {};
            ['autoDownloadMedia','fontSize'].forEach(k => {
                const v = settings.chat[k];
                out.chat[k] = applyField(`chat.${k}`, v !== undefined ? v : defaults.chat[k]);
            });
        }

        return out;
    }

    // ─── Build a defaults object ──────────────────────────────────────────────────
    function getDefaults() {
        const defs = {};
        Object.entries(SCHEMA).forEach(([path, rule]) => {
            const parts = path.split('.');
            let cursor = defs;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!cursor[parts[i]]) cursor[parts[i]] = {};
                cursor = cursor[parts[i]];
            }
            cursor[parts[parts.length - 1]] = rule.default;
        });
        return defs;
    }

    // ─── Check for version mismatch ───────────────────────────────────────────────
    function detectVersionMismatch(local, remote) {
        if (!local || !remote) return false;
        // If remote has fields local doesn't, schema may have changed
        const remoteKeys = Object.keys(remote);
        const mismatches = remoteKeys.filter(k => !(k in local) && k !== 'updatedAt');
        return mismatches.length > 0
            ? { mismatch: true, newFields: mismatches }
            : { mismatch: false };
    }

    // ─── Public API ───────────────────────────────────────────────────────────────
    const SettingsSchemaValidator = {
        SCHEMA,
        validateField,
        validateAll,
        sanitize,
        getDefaults,
        detectVersionMismatch
    };

    global.SettingsSchemaValidator = SettingsSchemaValidator;

    console.log('[SettingsSchema] ✅ Validator initialized');

})(typeof window !== 'undefined' ? window : global);