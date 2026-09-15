// =============================================================================
// js/legal-content.js — single canonical source for Terms of Service and
// Privacy Policy copy, used by BOTH the in-app "info modal" (index.html and
// settings.html) and the standalone legal/terms.html + legal/privacy.html
// pages.
//
// FIX (LEGAL-CONTENT-DUPLICATION): this content used to be hardcoded twice,
// verbatim, once inside index.html's inline <script> and once inside
// settings.html's inline <script> (the "INFO MODAL ENGINE"). The two copies
// had already started to drift by a formatting line, and there was no
// standalone, linkable Terms/Privacy page anywhere in the app — something
// required for app-store submission and for anyone (support, legal, a new
// user before signup) who needs a stable URL rather than a modal buried
// behind a logged-in settings screen. This file is now the one place that
// content is written; both the modal engine and the standalone pages read
// from it.
// =============================================================================
(function (global) {
    'use strict';

    function _getPref(key, def) {
        try { var v = localStorage.getItem(key); return v === null ? def : v === 'true'; }
        catch (e) { return def; }
    }

    var LegalContent = {

        privacy: {
            icon: 'fa-shield-alt',
            title: 'Privacy Policy',
            lastUpdated: 'May 2026',
            html: function () {
                var analytics  = _getPref('pref_analytics', true);
                var marketing  = _getPref('pref_marketing', false);
                var thirdParty = _getPref('pref_thirdparty', false);
                return '<p>Last updated: May 2026. Necpa ("we", "us") is committed to protecting your personal data.</p>' +
                    '<h4>What we collect</h4>' +
                    '<ul><li>Account info: name, email, username, and password (hashed).</li>' +
                    '<li>Usage data: messages (end-to-end encrypted), calls, and interactions.</li>' +
                    '<li>Device info: browser type, OS, and IP address for security.</li></ul>' +
                    '<h4>How we use your data</h4>' +
                    '<p>We use your data to provide and improve the service, send security alerts, and — with your consent — personalise your experience.</p>' +
                    '<h4>Your preferences</h4>' +
                    '<div class="pref-row"><span class="pref-label">Analytics cookies<small>Help us improve Necpa (anonymous)</small></span>' +
                    '<label class="pref-toggle"><input type="checkbox" id="pref_analytics"' + (analytics ? ' checked' : '') + '><span class="pref-toggle-track"></span></label></div>' +
                    '<div class="pref-row"><span class="pref-label">Marketing emails<small>Product updates and offers from Necpa</small></span>' +
                    '<label class="pref-toggle"><input type="checkbox" id="pref_marketing"' + (marketing ? ' checked' : '') + '><span class="pref-toggle-track"></span></label></div>' +
                    '<div class="pref-row"><span class="pref-label">Third-party integrations<small>Share anonymised data with analytics partners</small></span>' +
                    '<label class="pref-toggle"><input type="checkbox" id="pref_thirdparty"' + (thirdParty ? ' checked' : '') + '><span class="pref-toggle-track"></span></label></div>' +
                    '<h4>Data retention</h4>' +
                    '<p>You may delete your account at any time from Settings. We retain your data for 30 days after deletion to support dispute resolution, then permanently erase it.</p>' +
                    '<h4>Contact DPO</h4>' +
                    '<p>Data Protection Officer: <a href="mailto:privacy@necpa.app">privacy@necpa.app</a></p>';
            }
        },

        terms: {
            icon: 'fa-file-contract',
            title: 'Terms of Service',
            effectiveDate: 'January 2026',
            html: function () {
                var updates = _getPref('pref_terms_updates', true);
                var promos  = _getPref('pref_terms_promos', false);
                return '<p>Effective: January 2026. By using Necpa you agree to these terms.</p>' +
                    '<h4>Eligibility</h4><p>You must be 13 years or older. Users under 18 require parental consent.</p>' +
                    '<h4>Account responsibilities</h4>' +
                    '<ul><li>Keep your credentials secure. You are responsible for all activity on your account.</li>' +
                    '<li>Do not share account access with others.</li>' +
                    '<li>Report any unauthorised access immediately.</li></ul>' +
                    '<h4>Prohibited conduct</h4>' +
                    '<ul><li>Harassment, hate speech, or threats of violence.</li>' +
                    '<li>Distributing spam, malware, or illegal content.</li>' +
                    '<li>Attempting to reverse-engineer or scrape the platform.</li></ul>' +
                    '<h4>Intellectual property</h4>' +
                    '<p>Necpa grants you a limited, non-exclusive licence to use the service. You retain ownership of content you post.</p>' +
                    '<h4>Notifications preferences</h4>' +
                    '<div class="pref-row"><span class="pref-label">Terms update notifications<small>Email me when terms change materially</small></span>' +
                    '<label class="pref-toggle"><input type="checkbox" id="pref_terms_updates"' + (updates ? ' checked' : '') + '><span class="pref-toggle-track"></span></label></div>' +
                    '<div class="pref-row"><span class="pref-label">Promotional offers<small>Receive offers and feature announcements</small></span>' +
                    '<label class="pref-toggle"><input type="checkbox" id="pref_terms_promos"' + (promos ? ' checked' : '') + '><span class="pref-toggle-track"></span></label></div>' +
                    '<h4>Termination</h4>' +
                    '<p>We reserve the right to suspend accounts that violate these terms. You may delete your account at any time in Settings.</p>';
            }
        }
    };

    global.LegalContent = LegalContent;
})(window);
