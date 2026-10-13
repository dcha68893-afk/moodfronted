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
            lastUpdated: 'October 2026',
            html: function () {
                var analytics  = _getPref('pref_analytics', true);
                var marketing  = _getPref('pref_marketing', false);
                var thirdParty = _getPref('pref_thirdparty', false);
                // FIX (Play Store compliance audit #3): this policy used to
                // list only name/email/username/password/messages/calls/IP —
                // a small fraction of what the app actually collects and
                // does. Google requires the privacy policy and Data Safety
                // form to accurately describe collection, use, sharing and
                // retention, including data handled by SDKs (their own
                // wording). Rewritten to match the real feature set: Google
                // sign-in, push tokens, camera/microphone capture, Cloudinary-
                // hosted media, Status/Vibe posts, groups, encryption key
                // material, device/session data, friend/block/report data,
                // and the marketplace/payments/accommodation features.
                return '<p>Last updated: October 2026. Necpra ("we", "us") is committed to protecting your personal data.</p>' +
                    '<h4>What we collect</h4>' +
                    '<ul>' +
                    '<li><strong>Account info:</strong> name, email, username, hashed password (if you set one), profile photo, cover photo, bio.</li>' +
                    '<li><strong>Google sign-in:</strong> if you use "Sign in with Google," we receive your Google account ID, name, email and profile photo from Google to create and authenticate your Necpra account.</li>' +
                    '<li><strong>Messages and calls:</strong> message content is end-to-end encrypted in transit and at rest on our servers — we cannot read it. We do process message and call <em>metadata</em> we are not able to encrypt away, including sender/recipient account IDs, timestamps, chat/group membership, delivery and read status, and (for calls) duration and participants.</li>' +
                    '<li><strong>Media:</strong> photos, videos and audio you upload (profile/cover photos, chat attachments, Status/Vibe posts, voice messages) are stored with our media hosting provider (Cloudinary) or on our servers.</li>' +
                    '<li><strong>Status/Vibe:</strong> the posts you share, who you\'ve set them visible to, and viewer/like/comment activity on them.</li>' +
                    '<li><strong>Groups:</strong> group membership, roles, and moderation actions taken in groups you belong to.</li>' +
                    '<li><strong>Social data:</strong> your friends, blocked users, and reports you submit or that are submitted about you.</li>' +
                    '<li><strong>Device permissions:</strong> camera and microphone are accessed only when you actively capture a photo, video or voice message — never in the background.</li>' +
                    '<li><strong>Push notification token:</strong> a device-specific Firebase Cloud Messaging token, used only to deliver notifications to your device.</li>' +
                    '<li><strong>Encryption key material:</strong> your public identity/pre-keys, needed for end-to-end encryption to work, and an encrypted backup of your private key material (encrypted with a key only you control) if you enable key backup.</li>' +
                    '<li><strong>Device/session info:</strong> browser type, OS, IP address, and active login sessions, for account security.</li>' +
                    '<li><strong>Marketplace/payments (if you use them):</strong> order, wallet, payout and accommodation-booking records, and payment metadata from our payment processors (e.g. M-Pesa, card networks) — we do not store your full card or mobile-money credentials ourselves.</li>' +
                    '<li><strong>Location (optional):</strong> if you use friend or group discovery that needs your area, the app asks for location permission (you can allow approximate or precise). It is used only while you use that feature, to show nearby suggestions; it is not collected in the background, and you can refuse or revoke it in your phone settings without losing other features.</li>' +
                    '<li><strong>Wallet and payments:</strong> if you use the wallet, we process your mobile-money phone number, amounts, transfers, withdrawals, top-ups, airtime purchases and the resulting transaction records. Payments are handled by Safaricom M-Pesa (Daraja) and other payment providers; we do not receive your M-Pesa PIN or full card details. Financial records are kept for as long as the law requires.</li>' +
                    '<li><strong>Games:</strong> your arcade progress, scores, coin balance, and the results and moves of live matches you play with friends.</li>' +
                    '<li><strong>Age:</strong> Necpra is for people aged 13 and over. We do not knowingly collect data from children under 13; if we learn that we have, we delete the account. Wallet features are for users aged 18 and over.</li>' +
                    '</ul>' +
                    '<h4>How we use your data</h4>' +
                    '<p>We use your data to provide and improve the service, keep the platform safe (including reviewing reports and enforcing blocks), send security alerts, process marketplace/accommodation transactions you initiate, and — with your consent — personalise your experience.</p>' +
                    '<h4>Your preferences</h4>' +
                    '<div class="pref-row"><span class="pref-label">Analytics cookies<small>Help us improve Necpra (anonymous)</small></span>' +
                    '<label class="pref-toggle"><input type="checkbox" id="pref_analytics"' + (analytics ? ' checked' : '') + '><span class="pref-toggle-track"></span></label></div>' +
                    '<div class="pref-row"><span class="pref-label">Marketing emails<small>Product updates and offers from Necpra</small></span>' +
                    '<label class="pref-toggle"><input type="checkbox" id="pref_marketing"' + (marketing ? ' checked' : '') + '><span class="pref-toggle-track"></span></label></div>' +
                    '<div class="pref-row"><span class="pref-label">Third-party integrations<small>Share anonymised data with analytics partners</small></span>' +
                    '<label class="pref-toggle"><input type="checkbox" id="pref_thirdparty"' + (thirdParty ? ' checked' : '') + '><span class="pref-toggle-track"></span></label></div>' +
                    '<h4>Service providers</h4>' +
                    '<p>We share data with providers who help us run Necpra, under contracts limiting their use of it: Cloudinary (media hosting), GIPHY (GIF search - only the search words you type are sent, through our server), Google Firebase (push notifications and, if you use it, Google sign-in), Safaricom M-Pesa and other payment processors (wallet, marketplace and accommodation transactions), and our hosting provider. We may also disclose information when the law requires it or to protect users from harm. We do not sell your personal data and we do not show third-party ads.</p>' +
                    '<h4>Data retention and deletion</h4>' +
                    '<p>You may delete your account at any time from Settings, or via our <a href="/legal/account-deletion.html">account deletion page</a> if you no longer have the app installed. On deletion, your profile is immediately anonymised, your active sessions are revoked, and you leave all groups. Remaining data — including messages, Status/Vibe posts and their hosted media, and account records — is permanently deleted within 30 days. We may retain limited information beyond that where required by law (e.g. transaction records for tax/fraud purposes) or to resolve an active dispute, and will disclose any such retention if it applies to you.</p>' +
                    '<h4>Contact DPO</h4>' +
                    '<p>Data Protection Officer: <a href="mailto:support@necpra.co.ke">support@necpra.co.ke</a></p>';
            }
        },

        accountDeletion: {
            icon: 'fa-user-slash',
            title: 'Delete Your Account',
            lastUpdated: 'October 2026',
            html: function () {
                // FIX (Play Store compliance audit #2): Google requires a
                // deletion resource reachable OUTSIDE the app, in addition to
                // in-app deletion — a privacy policy alone doesn't satisfy
                // this. This is that resource; legal/account-deletion.html
                // renders it standalone at a stable, linkable URL.
                return '<p>You can request deletion of your Necpra account and associated data at any time, whether or not you still have the app installed.</p>' +
                    '<h4>Option 1 — Delete in the app (fastest)</h4>' +
                    '<ol><li>Open Necpra and sign in.</li>' +
                    '<li>Go to <strong>Settings → Account → Delete Account</strong>.</li>' +
                    '<li>Confirm by typing "delete my account" and, if your account has a password, entering it. Accounts created with Google sign-in are not asked for a password.</li></ol>' +
                    '<h4>Option 2 — Request deletion by email</h4>' +
                    '<p>If you no longer have the app installed, email <a href="mailto:support@necpra.co.ke?subject=Account%20Deletion%20Request">support@necpra.co.ke</a> from the address on your account (or include your Necpra username/email in the message) with the subject "Account Deletion Request." We will verify the request and begin deletion within 5 business days.</p>' +
                    '<h4>Before you delete: your wallet</h4>' +
                    '<p>If your wallet still holds money (or a withdrawal is pending) we cannot delete the account, so that your money is never lost. Withdraw it to M-Pesa or send it first, then delete.</p>' +
                    '<h4>What gets deleted</h4>' +
                    '<ul><li>Your profile: name, username, bio, photos.</li>' +
                    '<li>Your messages, calls history, and Status/Vibe posts, including hosted media.</li>' +
                    '<li>Your group memberships.</li>' +
                    '<li>Your device push-notification token and active login sessions.</li>' +
                    '<li>Your friend, block and report records.</li></ul>' +
                    '<h4>What may be retained, and why</h4>' +
                    '<p>We may retain limited data beyond deletion where the law requires it (for example, wallet, payment and marketplace/accommodation transaction records, kept for tax, accounting and fraud-prevention purposes) or to resolve a dispute or abuse report that was already in progress. Anything retained is kept only as long as legally necessary and is not used for any other purpose.</p>' +
                    '<h4>Timing</h4>' +
                    '<p>Your account is deactivated and your personal information anonymised immediately upon request. Remaining data is permanently purged within 30 days.</p>' +
                    '<h4>Questions</h4>' +
                    '<p>Contact <a href="mailto:support@necpra.co.ke">support@necpra.co.ke</a> with any questions about this process.</p>';
            }
        },

        terms: {
            icon: 'fa-file-contract',
            title: 'Terms of Service',
            effectiveDate: 'January 2026',
            html: function () {
                var updates = _getPref('pref_terms_updates', true);
                var promos  = _getPref('pref_terms_promos', false);
                return '<p>Effective: January 2026. By using Necpra you agree to these terms.</p>' +
                    '<h4>Eligibility</h4><p>You must be 13 years or older. Users under 18 require parental consent.</p>' +
                    '<h4>Account responsibilities</h4>' +
                    '<ul><li>Keep your credentials secure. You are responsible for all activity on your account.</li>' +
                    '<li>Do not share account access with others.</li>' +
                    '<li>Report any unauthorised access immediately.</li></ul>' +
                    '<h4>Wallet, payments and coins</h4>' +
                    '<ul><li>Wallet features (top-up, transfers, withdrawals, airtime, marketplace payments) are for users aged 18 and over and are provided together with our payment partners; fees and limits are shown before you confirm.</li><li>Arcade coins are an in-game item with no cash value; they cannot be withdrawn or exchanged for money, and are earned by playing in the Android app.</li></ul>' +
                    '<h4>Your content and reporting</h4>' +
                    '<p>You are responsible for what you post. Use the Report and Block options in chats, statuses, profiles and groups to flag abuse; we review reports and may remove content or suspend accounts.</p>' +
                    '<h4>Prohibited conduct</h4>' +
                    '<ul><li>Harassment, hate speech, or threats of violence.</li>' +
                    '<li>Distributing spam, malware, or illegal content.</li>' +
                    '<li>Attempting to reverse-engineer or scrape the platform.</li></ul>' +
                    '<h4>Intellectual property</h4>' +
                    '<p>Necpra grants you a limited, non-exclusive licence to use the service. You retain ownership of content you post.</p>' +
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
