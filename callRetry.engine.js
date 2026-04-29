/**
 * callRetry.engine.js
 * Time-sensitive signaling retry engine for call initiation.
 * Respects the "calls are real-time" principle: short retry window, user-cancellable.
 * @version 1.0.0
 */

(function () {
    'use strict';

    const MAX_ATTEMPTS   = 3;       // Max retry attempts
    const BASE_DELAY_MS  = 3000;    // First retry after 3s
    const MAX_DELAY_MS   = 8000;    // Cap at 8s (calls are time-sensitive)
    const ATTEMPT_TTL_MS = 25000;   // Total retry window — give up after 25s

    const _retryLogCache = new Map();
    function log(msg, data) {
        const key = msg;
        const now = Date.now();
        // Allow attempt logs (they change) but suppress identical repeated logs within 3s
        if (_retryLogCache.has(key) && now - _retryLogCache.get(key) < 3000) return;
        _retryLogCache.set(key, now);
        console.log('[CallRetry] ' + msg, data !== undefined ? data : '');
    }

    class CallRetryEngine {
        constructor() {
            this._active    = false;
            this._attempts  = 0;
            this._timer     = null;
            this._startTime = null;
            this._task      = null;   // { fn, onSuccess, onFailure, onCancel }
            this._listeners = new Set();

            window.KynectaCallRetry = this;

            // ── Network-aware retry: cancel on disconnect, re-trigger on reconnect ──
            window.addEventListener('kyn:wsDisconnected', () => {
                if (this._active) {
                    log('WebSocket disconnected — pausing retry timer');
                    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
                }
            });

            window.addEventListener('kyn:wsConnected', () => {
                if (this._active && this._task && !this._timer) {
                    log('WebSocket reconnected — resuming retry');
                    this._scheduleNext('network_restored');
                }
            });

            window.addEventListener('online', () => {
                if (this._active && this._task && !this._timer) {
                    log('Network online — resuming retry');
                    this._scheduleNext('online');
                }
            });

            log('✅ Initialized');
        }

        // ── Public API ───────────────────────────────────────────────────────

        /**
         * Execute a call-signaling function with automatic retry on failure.
         *
         * @param {Function}  fn         Async function to execute; must resolve with { success: true } or throw
         * @param {Function}  onSuccess  Called when fn succeeds
         * @param {Function}  onFailure  Called when all retries exhausted
         * @param {Object}    options    { maxAttempts, baseDelay, label }
         * @returns {Function}           cancel() — call to abort pending retries
         */
        execute(fn, onSuccess, onFailure, options = {}) {
            if (this._active) {
                log('Already retrying — cancelling previous task first');
                this.cancel('replaced');
            }

            this._active    = true;
            this._attempts  = 0;
            this._startTime = Date.now();
            this._task      = {
                fn,
                onSuccess: onSuccess || (() => {}),
                onFailure: onFailure || (() => {}),
                maxAttempts: Math.min(options.maxAttempts || MAX_ATTEMPTS, 5),
                baseDelay:   options.baseDelay || BASE_DELAY_MS,
                label:       options.label || 'call-signal'
            };

            log(`Starting retry task "${this._task.label}"`, { maxAttempts: this._task.maxAttempts });
            this._attempt();

            // Return cancel function
            return () => this.cancel('user');
        }

        /**
         * Cancel any pending retry.
         * @param {string} reason  Why it was cancelled (for logging)
         */
        cancel(reason = 'cancelled') {
            if (!this._active) return;

            this._active = false;
            if (this._timer) {
                clearTimeout(this._timer);
                this._timer = null;
            }

            const task = this._task;
            this._task = null;

            if (task && task.onCancel) {
                try { task.onCancel(reason); } catch (e) {}
            }

            this._notify('cancelled', { reason, attempts: this._attempts });
            log(`Task cancelled (${reason}) after ${this._attempts} attempt(s)`);
        }

        /** True while retrying. */
        get isActive() { return this._active; }

        /** Number of attempts so far. */
        get attempts() { return this._attempts; }

        /** Listen to retry events. */
        on(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        }

        // ── Private ──────────────────────────────────────────────────────────

        async _attempt() {
            if (!this._active) return;

            const task = this._task;
            this._attempts++;

            const elapsed = Date.now() - this._startTime;
            if (elapsed > ATTEMPT_TTL_MS) {
                log(`TTL expired after ${elapsed}ms — giving up`);
                this._fail('ttl_expired');
                return;
            }

            log(`Attempt ${this._attempts}/${task.maxAttempts} for "${task.label}"`);
            this._notify('attempt', { attempt: this._attempts, label: task.label });

            try {
                const result = await task.fn(this._attempts);

                if (!this._active) return; // cancelled mid-flight

                if (result && result.success) {
                    log(`✅ Success on attempt ${this._attempts}`);
                    this._active = false;
                    this._task   = null;
                    this._notify('success', { attempt: this._attempts, result });
                    try { task.onSuccess(result); } catch (e) {}
                } else {
                    // fn resolved but not successfully
                    const reason = (result && result.reason) || (result && result.error) || 'failed';
                    log(`Attempt ${this._attempts} returned non-success`, reason);
                    this._scheduleNext(reason);
                }

            } catch (error) {
                if (!this._active) return;
                log(`Attempt ${this._attempts} threw`, error.message);
                this._scheduleNext(error.message);
            }
        }

        _scheduleNext(reason) {
            if (!this._active) return;

            const task = this._task;
            if (this._attempts >= task.maxAttempts) {
                log(`Max attempts (${task.maxAttempts}) reached`);
                this._fail(reason);
                return;
            }

            const delay = Math.min(task.baseDelay * Math.pow(1.5, this._attempts - 1), MAX_DELAY_MS);
            log(`Retrying in ${Math.round(delay)}ms (attempt ${this._attempts + 1}/${task.maxAttempts})`);
            this._notify('retry_scheduled', { attempt: this._attempts, delay, reason });

            this._timer = setTimeout(() => {
                this._timer = null;
                this._attempt();
            }, delay);
        }

        _fail(reason) {
            if (!this._active) return;

            this._active = false;
            const task   = this._task;
            this._task   = null;

            this._notify('failed', { reason, attempts: this._attempts });
            log(`❌ All attempts exhausted (${reason})`);

            try { task.onFailure({ reason, attempts: this._attempts }); } catch (e) {}
        }

        _notify(event, data) {
            this._listeners.forEach(fn => {
                try { fn(event, data); } catch (e) {}
            });
            window.dispatchEvent(new CustomEvent('kyn:callRetry', { detail: { event, data } }));
        }
    }

    // Export singleton
    window.KynectaCallRetry = new CallRetryEngine();
    console.log('[CallRetry] ✅ Engine ready');
})();