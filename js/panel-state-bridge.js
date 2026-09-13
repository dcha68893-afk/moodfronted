/**
 * panel-state-bridge.js
 * Standardized parent/child panel state plus cross-frame notification/presence
 * hardening. Loaded by chat.html and its module iframes.
 */
(function () {
    'use strict';

    var MODULE_NAME = (document.body && document.body.dataset && document.body.dataset.module) ||
        (window.location.pathname.split('/').pop() || '').replace('.html', '') || 'unknown';

    function looksEncrypted(value) {
        if (typeof value !== 'string') return false;
        var text = value.trim();
        if (!text || text.charAt(0) !== '{') return false;
        try {
            var obj = JSON.parse(text);
            return !!obj && typeof obj === 'object' &&
                (('v' in obj) || ('kid' in obj) || ('ct' in obj) || ('iv' in obj) ||
                 ('eph' in obj) || ('sid' in obj) || ('n' in obj));
        } catch (_) { return false; }
    }

    function safePreview(value) {
        if (typeof value !== 'string' || !value.trim() || looksEncrypted(value)) {
            return 'You have a new message';
        }
        return value.trim().slice(0, 240);
    }

    function installPresenceEnginePatch() {
        var engine = window.PresenceEngine;
        if (!engine || engine.__kynPresenceBridgePatched) return !!engine;
        engine.__kynPresenceBridgePatched = true;
        if (typeof engine._markOffline === 'function') {
            var originalOffline = engine._markOffline.bind(engine);
            engine._markOffline = function (userId, meta) {
                var before = this._onlineUsers && this._onlineUsers.get(String(userId));
                var wasOnline = !!before && before.status !== 'offline';
                originalOffline(userId, meta || {});
                if (wasOnline && typeof this._emit === 'function') {
                    try { this._emit({ event: 'presence:change', userId: String(userId), status: 'offline' }); } catch (_) {}
                }
            };
        }
        return true;
    }

    if (window.parent && window.parent !== window) {
        function send(type, panelId, extra) {
            try {
                window.parent.postMessage(Object.assign({
                    type: type,
                    module: MODULE_NAME,
                    panel: panelId || null,
                    timestamp: Date.now()
                }, extra || {}), '*');
            } catch (_) {}
        }

        window.KynPanel = {
            opened: function (panelId) { send('PanelOpened', panelId); },
            closed: function (panelId) { send('PanelClosed', panelId); },
            focused: function () { send('PanelFocused', null); },
            hidden: function () { send('PanelHidden', null); }
        };

        if (!window.__kynNotificationPreviewBridge) {
            window.__kynNotificationPreviewBridge = true;
            window.addEventListener('kyn:incomingMessage', function (event) {
                try {
                    var detail = event.detail || {};
                    var message = detail.message || detail;
                    if (!message || !message.senderId || !looksEncrypted(message.content)) return;
                    var started = Date.now();
                    var poll = function () {
                        if (message.content && !looksEncrypted(message.content)) {
                            window.parent.postMessage({
                                type: 'KYN_DECRYPTED_NOTIFICATION_PREVIEW',
                                preview: {
                                    id: message.id || message.serverId || message.localId || null,
                                    chatId: detail.chatId || message.chatId || message.conversationId || null,
                                    senderId: message.senderId,
                                    senderName: (message.sender && (message.sender.displayName || message.sender.username)) ||
                                                message.senderName || message.displayName || message.username || 'New message',
                                    content: String(message.content).slice(0, 240),
                                    timestamp: Date.now()
                                }
                            }, '*');
                            return;
                        }
                        if (Date.now() - started < 3500) setTimeout(poll, 100);
                    };
                    setTimeout(poll, 80);
                } catch (_) {}
            });
        }

        try {
            var observedRoot = document.body;
            if (observedRoot && 'MutationObserver' in window) {
                var mo = new MutationObserver(function (mutations) {
                    mutations.forEach(function (m) {
                        if (m.type !== 'attributes') return;
                        var el = m.target;
                        if (!el.hasAttribute || !el.hasAttribute('data-panel')) return;
                        var visible = el.classList.contains('active') || el.classList.contains('open') ||
                            (el.style && (el.style.display === 'flex' || el.style.display === 'block'));
                        var panelId = el.getAttribute('data-panel');
                        if (visible && el.dataset.__kynPanelState !== 'open') {
                            el.dataset.__kynPanelState = 'open'; send('PanelOpened', panelId);
                        } else if (!visible && el.dataset.__kynPanelState === 'open') {
                            el.dataset.__kynPanelState = 'closed'; send('PanelClosed', panelId);
                        }
                    });
                });
                mo.observe(observedRoot, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
            }
        } catch (_) {}

        document.addEventListener('visibilitychange', function () {
            send(document.hidden ? 'PanelHidden' : 'PanelFocused', null);
        });

        var childPresenceTimer = setInterval(function () {
            if (installPresenceEnginePatch()) clearInterval(childPresenceTimer);
        }, 300);
        setTimeout(function () { clearInterval(childPresenceTimer); }, 15000);
    }

    if (window.parent === window) {
        window.__kynPanelState = window.__kynPanelState || {};

        var presenceRequests = new Map();
        var PRESENCE_TTL = 4000;

        function requestPresence(userId) {
            var uid = String(userId || '');
            if (!uid) return;
            var now = Date.now();
            if (now - (presenceRequests.get(uid) || 0) < PRESENCE_TTL) return;
            presenceRequests.set(uid, now);
            try {
                var rt = window.KynectaRealtime;
                if (rt && typeof rt.emit === 'function') {
                    var p = rt.emit('check_user_online', { targetUserId: uid }, { retry: false });
                    if (p && typeof p.catch === 'function') p.catch(function () {});
                }
            } catch (_) {}
        }

        function broadcastPresence(payload) {
            if (!payload || payload.userId == null) return;
            var normalized = {
                userId: String(payload.userId),
                online: payload.online === true,
                timestamp: payload.timestamp || Date.now(),
                source: 'server-authoritative'
            };
            try { installPresenceEnginePatch(); } catch (_) {}
            try {
                var engine = window.PresenceEngine;
                if (engine) {
                    if (normalized.online && typeof engine._markOnline === 'function') engine._markOnline(normalized.userId, normalized);
                    else if (!normalized.online && typeof engine._markOffline === 'function') engine._markOffline(normalized.userId, normalized);
                }
            } catch (_) {}
            try { window.dispatchEvent(new CustomEvent('kyn:authoritativePresence', { detail: normalized })); } catch (_) {}
            try {
                document.querySelectorAll('iframe').forEach(function (frame) {
                    try {
                        frame.contentWindow.postMessage({
                            type: normalized.online ? 'user:online' : 'user:offline',
                            userId: normalized.userId,
                            online: normalized.online,
                            timestamp: normalized.timestamp,
                            source: normalized.source
                        }, '*');
                    } catch (_) {}
                });
            } catch (_) {}
        }

        if (!window.__kynEncryptedNotificationGuard) {
            window.__kynEncryptedNotificationGuard = true;
            try {
                var OriginalNotification = window.Notification;
                if (typeof OriginalNotification === 'function') {
                    var pending = new Map();
                    var WrappedNotification = function (title, options) {
                        options = options || {};
                        var body = options.body || '';
                        if (!looksEncrypted(body)) return new OriginalNotification(title, options);
                        var key = String(options.tag || ('encrypted-' + Date.now()));
                        var timer = setTimeout(function () {
                            var entry = pending.get(key);
                            if (!entry) return;
                            pending.delete(key);
                            try {
                                new OriginalNotification(entry.title, Object.assign({}, entry.options, { body: 'You have a new message' }));
                            } catch (_) {}
                        }, 3800);
                        pending.set(key, { title: title || 'New message', options: options, timer: timer });
                        return { close: function () {} };
                    };
                    try { Object.setPrototypeOf(WrappedNotification, OriginalNotification); } catch (_) {}
                    window.Notification = WrappedNotification;
                    window.__kynOriginalNotification = OriginalNotification;
                    window.__kynPendingEncryptedNotifications = pending;
                }
            } catch (_) {}
        }

        function showIncomingBanner(data) {
            var detail = data && (data.detail || data);
            var message = detail && (detail.message || detail);
            if (!message) return;
            var senderId = message.senderId || message.userId;
            var myId = window.cachedUserId || window.SessionManager?.getUserId?.() || window.SessionManager?.getCurrentUserId?.();
            if (myId && senderId && String(myId) === String(senderId)) return;
            var chatId = detail.chatId || message.chatId || message.conversationId;
            if (senderId) requestPresence(senderId);
            var body = safePreview(message.content);
            var title = message.senderName || message.sender || message.username || 'New message';
            try {
                if (window.NotifStab && typeof window.NotifStab.notifyApp === 'function') {
                    window.NotifStab.notifyApp(title, body, { module: 'dm', contextId: chatId || senderId || 'message', userId: senderId || null, messageId: message.id || null, icon: '💬' });
                }
            } catch (_) {}
        }

        window.addEventListener('message', function (event) {
            var data = event && event.data;
            if (!data || typeof data !== 'object') return;

            if (data.type === 'KYN_DECRYPTED_NOTIFICATION_PREVIEW' && data.preview) {
                var preview = data.preview;
                if (!preview.content || looksEncrypted(preview.content)) return;
                var map = window.__kynPendingEncryptedNotifications;
                if (map) {
                    var matched = null;
                    map.forEach(function (entry, key) {
                        var tag = entry.options && entry.options.tag ? String(entry.options.tag) : '';
                        if (!matched && (!tag || tag.indexOf(String(preview.id || '')) !== -1 || tag.indexOf(String(preview.chatId || '')) !== -1)) matched = key;
                    });
                    if (matched) {
                        var entry = map.get(matched);
                        map.delete(matched);
                        clearTimeout(entry.timer);
                        try {
                            new window.__kynOriginalNotification(preview.senderName || entry.title || 'New message', Object.assign({}, entry.options, { body: safePreview(preview.content) }));
                        } catch (_) {}
                    }
                }
                return;
            }

            if (data.type === 'kyn:incomingMessage') {
                showIncomingBanner(data);
                return;
            }
            if (data.type === 'user_online_status' || data.type === 'presence:user_online_status') {
                broadcastPresence(data);
                return;
            }

            var type = data.type;
            if (type !== 'PanelOpened' && type !== 'PanelClosed' && type !== 'PanelFocused' && type !== 'PanelHidden') return;
            var mod = data.module || 'unknown';
            window.__kynPanelState[mod] = window.__kynPanelState[mod] || {};
            if (type === 'PanelOpened') window.__kynPanelState[mod].panel = data.panel || true;
            else if (type === 'PanelClosed') window.__kynPanelState[mod].panel = null;
            else if (type === 'PanelFocused') window.__kynPanelState[mod].focused = true;
            else if (type === 'PanelHidden') window.__kynPanelState[mod].focused = false;
            try { document.dispatchEvent(new CustomEvent('kyn:panelstate', { detail: { module: mod, type: type, panel: data.panel, state: window.__kynPanelState[mod] } })); } catch (_) {}
        });

        function bindPresenceBus() {
            var bus = window.KynectaEventBus || window.appEvents;
            if (!bus || typeof bus.on !== 'function' || window.__kynPanelPresenceBusBound) return !!window.__kynPanelPresenceBusBound;
            window.__kynPanelPresenceBusBound = true;
            bus.on('SOCKET_EVENT', function (payload) {
                if (!payload) return;
                if (payload.type === 'user_online_status') broadcastPresence(payload);
                else if (payload.type === 'user:online' || payload.type === 'presence:online') broadcastPresence({ userId: payload.userId || payload.user?.id, online: true, timestamp: payload.timestamp });
                else if (payload.type === 'user:offline' || payload.type === 'presence:offline') broadcastPresence({ userId: payload.userId || payload.user?.id, online: false, timestamp: payload.timestamp });
            });
            return true;
        }
        installPresenceEnginePatch();
        bindPresenceBus();
        var presenceTimer = setInterval(function () {
            installPresenceEnginePatch();
            if (bindPresenceBus()) clearInterval(presenceTimer);
        }, 500);
        setTimeout(function () { clearInterval(presenceTimer); }, 15000);

        var NAV_VERSION = 2;
        var exactStack = window.__kynExactNavStack = window.__kynExactNavStack || [];
        var exactCurrent = window.__kynExactNavCurrent || null;
        var exactRestoring = false;
        var exactInstalled = false;
        var originalNavigateToPage = null;
        var originalToolsNavTo = null;
        var originalSyncBrowserHistoryState = null;
        var observedChildStates = {};

        function normalizeModule(page) {
            page = String(page || '').toLowerCase();
            if (page === 'groups' || page === 'group-core') return 'group';
            if (page === 'friend' || page === 'friend-core') return 'friends';
            if (page === 'message') return 'messages';
            if (page === 'tool' || page === 'marketplace') return 'tools';
            if (page === 'setting') return 'settings';
            if (page === 'call' || page === 'calls-core') return 'calls';
            if (page === 'game') return 'games';
            return page || 'messages';
        }

        function cloneState(state) {
            if (!state) return null;
            try { return JSON.parse(JSON.stringify(state)); } catch (_) { return Object.assign({}, state); }
        }

        function sameState(a, b) {
            if (!a || !b) return false;
            try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
        }

        function visibleFriendState(doc) {
            if (!doc) return 'sidebar';
            var panel = doc.querySelector('.discover-fullscreen-panel.open');
            if (panel) {
                var map = {
                    discoverAllUsersPanel:'browse-all',
                    discoverUsernamePanel:'search-username',
                    discoverQrPanel:'qr',
                    discoverNearbyPanel:'nearby',
                    discoverGroupsPanel:'groups'
                };
                return map[panel.id] || panel.id || 'panel';
            }
            var modal = doc.getElementById('addFriendModal');
            if (modal && modal.classList.contains('active')) return 'add-friend';
            return 'sidebar';
        }

        function visibleGroupState(doc) {
            if (!doc) return 'sidebar';
            var details = doc.getElementById('groupDetailsPanel');
            if (details && (details.classList.contains('active') || details.style.display === 'flex')) return 'details';
            var sub = doc.getElementById('gcSubPanel');
            if (sub && (sub.classList.contains('open') || (sub.style.display && sub.style.display !== 'none'))) return 'settings';
            return document.body.classList.contains('group-panel-active') ? 'chat' : 'sidebar';
        }

        function readCurrentState() {
            var page = normalizeModule(window.__currentPage || 'messages');
            var screen = 'sidebar';
            var data = {};

            if (page === 'tools') {
                screen = String(window.__toolsCurrentPage || 'home');
                if (screen === 'home') screen = 'sidebar';
            } else if (page === 'messages') {
                if (document.body.classList.contains('chat-panel-active')) {
                    screen = 'chat';
                    if (window.__lastOpenChatUserId != null) data.userId = window.__lastOpenChatUserId;
                    if (window.__lastOpenChatName) data.name = window.__lastOpenChatName;
                }
            } else if (page === 'group') {
                var gframe = document.getElementById('groupIframe');
                var gdoc = null;
                try { gdoc = gframe && gframe.contentDocument; } catch (_) {}
                screen = visibleGroupState(gdoc);
                if (screen !== 'sidebar') {
                    var gp = window.__gcCurrentGroup || {};
                    if (gp.id != null) data.groupId = gp.id;
                    if (gp.name) data.name = gp.name;
                }
            } else if (page === 'friends') {
                var fframe = document.getElementById('friendsIframe');
                var fdoc = null;
                try { fdoc = fframe && fframe.contentDocument; } catch (_) {}
                screen = visibleFriendState(fdoc);
            } else if (page === 'status') {
                if (document.body.classList.contains('status-panel-active')) {
                    screen = (window.__kynPanelState.status && window.__kynPanelState.status.panel) || 'view';
                    if (screen === true) screen = 'view';
                }
            } else if (page === 'calls') {
                if (document.body.classList.contains('call-screen-active') || window.__activeCallInProgress) screen = 'call';
            } else {
                var ps = window.__kynPanelState[page];
                if (ps && ps.panel) screen = ps.panel === true ? 'panel' : String(ps.panel);
            }

            return { v: NAV_VERSION, module: page, screen: screen, data: data };
        }

        function ensureInitialState() {
            if (exactCurrent) return;
            exactCurrent = readCurrentState();
            window.__kynExactNavCurrent = exactCurrent;
            try { history.replaceState({ appNav:true, exactNav:true, navVersion:NAV_VERSION, nav:cloneState(exactCurrent) }, '', window.location.href); } catch (_) {}
        }

        function pushExactState(nextState) {
            nextState = cloneState(nextState);
            if (!nextState || sameState(nextState, exactCurrent)) return false;
            if (exactCurrent) exactStack.push(cloneState(exactCurrent));
            exactCurrent = nextState;
            window.__kynExactNavCurrent = exactCurrent;
            try { history.pushState({ appNav:true, exactNav:true, navVersion:NAV_VERSION, nav:cloneState(nextState) }, '', window.location.href); } catch (_) {}
            return true;
        }

        function postToIframe(module, message) {
            try {
                var map = { messages:'messagesIframe', group:'groupIframe', status:'statusIframe', calls:'callsIframe', friends:'friendsIframe', tools:'toolsIframe' };
                var iframe = document.getElementById(map[module]);
                if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(message, '*');
                return !!iframe;
            } catch (_) { return false; }
        }

        function restoreNestedTarget(target) {
            if (!target) return;
            var module = target.module;
            var screen = String(target.screen || 'sidebar');

            if (module === 'tools') {
                var toolPage = screen === 'sidebar' ? 'home' : screen;
                if (typeof window.toolsNavTo === 'function') window.toolsNavTo(toolPage);
                return;
            }
            if (module === 'messages') {
                if (screen === 'chat') {
                    document.body.classList.add('chat-panel-active');
                    return;
                }
                postToIframe('messages', { type:'GO_BACK_TO_CHAT_LIST', source:'exact-nav', timestamp:Date.now() });
                document.body.classList.remove('chat-panel-active');
                return;
            }
            if (module === 'group') {
                if (screen === 'sidebar') {
                    postToIframe('group', { type:'GO_BACK_TO_LIST', source:'exact-nav', timestamp:Date.now() });
                    document.body.classList.remove('group-panel-active');
                    return;
                }
                if (screen === 'chat') {
                    try {
                        var gf = document.getElementById('groupIframe');
                        var gd = gf && gf.contentDocument;
                        if (gd) {
                            var sub = gd.getElementById('gcSubPanel');
                            if (sub && (sub.classList.contains('open') || sub.style.display !== 'none')) {
                                var subBack = gd.getElementById('gcSubBack');
                                if (subBack) subBack.click();
                            }
                            var details = gd.getElementById('groupDetailsPanel');
                            if (details && (details.classList.contains('active') || details.style.display === 'flex')) {
                                var db = gd.getElementById('backBtn');
                                if (db) db.click();
                            }
                        }
                    } catch (_) {}
                    document.body.classList.add('group-panel-active');
                    return;
                }
                document.body.classList.add('group-panel-active');
                return;
            }
            if (module === 'status') {
                if (screen === 'sidebar') {
                    postToIframe('status', { type:'GO_BACK_TO_LIST', source:'exact-nav', timestamp:Date.now() });
                    document.body.classList.remove('status-panel-active');
                } else document.body.classList.add('status-panel-active');
                return;
            }
            if (module === 'calls' && screen === 'sidebar') {
                postToIframe('calls', { type:'CLOSE_CALL_SCREEN', source:'exact-nav', timestamp:Date.now() });
                document.body.classList.remove('call-screen-active');
                window.__activeCallInProgress = false;
                return;
            }
            if (module === 'friends') {
                try {
                    var ff = document.getElementById('friendsIframe');
                    var fd = ff && ff.contentDocument;
                    if (fd) {
                        var openDiscover = fd.querySelector('.discover-fullscreen-panel.open');
                        if (screen === 'browse-all' || screen === 'search-username' || screen === 'qr' || screen === 'nearby' || screen === 'groups') {
                            var ids = { 'browse-all':'discoverAllUsersPanel', 'search-username':'discoverUsernamePanel', 'qr':'discoverQrPanel', 'nearby':'discoverNearbyPanel', 'groups':'discoverGroupsPanel' };
                            var wanted = fd.getElementById(ids[screen]);
                            if (wanted && !wanted.classList.contains('open')) wanted.classList.add('open');
                            return;
                        }
                        if (screen === 'add-friend') {
                            if (openDiscover) {
                                var discoverBack = openDiscover.querySelector('.discover-panel-back');
                                if (discoverBack) discoverBack.click();
                            }
                            return;
                        }
                        if (screen === 'sidebar') {
                            if (openDiscover) {
                                var back = openDiscover.querySelector('.discover-panel-back');
                                if (back) back.click();
                            }
                            var cancel = fd.getElementById('cancelAddFriendBtn');
                            var modal = fd.getElementById('addFriendModal');
                            if (cancel && modal && modal.classList.contains('active')) cancel.click();
                        }
                    }
                } catch (_) {}
            }
        }

        function restoreExactState(target) {
            if (!target) return;
            exactRestoring = true;
            try {
                var page = normalizeModule(target.module);
                if (window.__currentPage !== page && typeof window.navigateToPage === 'function') {
                    window.navigateToPage(page, { fromHistory:true, exactRestore:true });
                }
                restoreNestedTarget(target);
                exactCurrent = cloneState(target);
                window.__kynExactNavCurrent = exactCurrent;
            } finally {
                setTimeout(function () { exactRestoring = false; }, 0);
            }
        }

        function captureAndPush(nextState) {
            if (exactRestoring) return;
            ensureInitialState();
            nextState = cloneState(nextState);
            if (!nextState || sameState(nextState, exactCurrent)) return;
            pushExactState(nextState);
        }

        function observeChildPanel(module, iframe) {
            if (!iframe || iframe.__kynExactObserverBound) return;
            iframe.__kynExactObserverBound = true;
            var attach = function () {
                var doc;
                try { doc = iframe.contentDocument; } catch (_) { return; }
                if (!doc || !doc.body || doc.__kynExactPanelObserverBound) return;
                doc.__kynExactPanelObserverBound = true;
                var read = function () {
                    if (module !== normalizeModule(window.__currentPage || '')) return;
                    var state = module === 'friends' ? visibleFriendState(doc) : visibleGroupState(doc);
                    var previous = observedChildStates[module];
                    if (previous == null) { observedChildStates[module] = state; return; }
                    if (previous === state) return;
                    observedChildStates[module] = state;
                    captureAndPush({ v:NAV_VERSION, module:module, screen:state, data:{} });
                };
                try {
                    var observer = new MutationObserver(function () { read(); });
                    observer.observe(doc.body, { subtree:true, childList:true, attributes:true, attributeFilter:['class','style'] });
                } catch (_) {}
                read();
            };
            iframe.addEventListener('load', attach);
            attach();
        }

        function installExactNavigation() {
            if (exactInstalled) return true;
            if (typeof window.navigateToPage !== 'function' || typeof window.syncBrowserHistoryState !== 'function') return false;
            ensureInitialState();

            originalNavigateToPage = window.navigateToPage;
            window.navigateToPage = function (page, options) {
                options = options || {};
                var nextPage = normalizeModule(page);
                if (!options.fromHistory && !options.exactRestore && !exactRestoring) {
                    captureAndPush({ v:NAV_VERSION, module:nextPage, screen:(nextPage === 'tools' ? 'sidebar' : 'sidebar'), data:{} });
                }
                return originalNavigateToPage.apply(this, arguments);
            };

            originalToolsNavTo = window.toolsNavTo;
            if (typeof originalToolsNavTo === 'function') {
                window.toolsNavTo = function (page) {
                    if (!exactRestoring) {
                        var nextScreen = String(page || 'home');
                        if (nextScreen === 'home') nextScreen = 'sidebar';
                        captureAndPush({ v:NAV_VERSION, module:'tools', screen:nextScreen, data:{} });
                    }
                    return originalToolsNavTo.apply(this, arguments);
                };
            }

            originalSyncBrowserHistoryState = window.syncBrowserHistoryState;
            window.syncBrowserHistoryState = function (page, replaceOnly) {
                if (exactRestoring || window.__kynExactNavLegacySuppressed !== false) {
                    if (replaceOnly) {
                        try { history.replaceState({ appNav:true, exactNav:true, navVersion:NAV_VERSION, nav:cloneState(exactCurrent || readCurrentState()) }, '', window.location.href); } catch (_) {}
                    }
                    return;
                }
                return originalSyncBrowserHistoryState.apply(this, arguments);
            };
            window.__kynExactNavLegacySuppressed = true;

            window.addEventListener('message', function (event) {
                if (exactRestoring) return;
                var d = event && event.data;
                if (!d || typeof d !== 'object') return;
                var mod = normalizeModule(d.module || '');
                if (d.type === 'PanelOpened' && mod) {
                    captureAndPush({ v:NAV_VERSION, module:mod, screen:String(d.panel || 'panel'), data:{} });
                    return;
                }
                if (d.type === 'PanelClosed' && mod) {
                    captureAndPush({ v:NAV_VERSION, module:mod, screen:'sidebar', data:{} });
                    return;
                }
                if (d.type === 'CHAT_OPENED' || d.type === 'CONVERSATION_OPENED') {
                    var ci = d.payload || {};
                    captureAndPush({ v:NAV_VERSION, module:'messages', screen:'chat', data:{ userId:ci.userId || ci.chatId || null, name:ci.name || null } });
                    return;
                }
                if (d.type === 'CHAT_LIST_SHOWN' || d.type === 'CHAT_CLOSED' || d.type === 'GO_BACK_TO_CHAT_LIST') {
                    captureAndPush({ v:NAV_VERSION, module:'messages', screen:'sidebar', data:{} });
                    return;
                }
                if (d.type === 'GROUP_PANEL_OPENED' || d.type === 'GROUP_CHAT_OPENED' || d.type === 'GROUP_DETAIL_OPENED' || d.type === 'GROUP_PANEL_OPEN') {
                    var gp = d.payload || d.group || d.data || {};
                    captureAndPush({ v:NAV_VERSION, module:'group', screen:(d.type === 'GROUP_DETAIL_OPENED' ? 'details' : 'chat'), data:{ groupId:gp.id || gp.groupId || null, name:gp.name || null } });
                    return;
                }
                if (d.type === 'GROUP_PANEL_CLOSED' || d.type === 'GROUP_LIST_SHOWN' || d.type === 'GO_BACK_TO_LIST' || d.type === 'GROUP_PANEL_CLOSE') {
                    captureAndPush({ v:NAV_VERSION, module:'group', screen:'sidebar', data:{} });
                    return;
                }
                if (d.type === 'STATUS_VIEW_OPENED' || d.type === 'STATUS_CREATE_OPENED' || d.type === 'STATUS_PANEL_OPENED') {
                    captureAndPush({ v:NAV_VERSION, module:'status', screen:(d.type === 'STATUS_CREATE_OPENED' ? 'create' : 'view'), data:{} });
                    return;
                }
                if (d.type === 'STATUS_PANEL_CLOSED' || d.type === 'STATUS_LIST_SHOWN') {
                    captureAndPush({ v:NAV_VERSION, module:'status', screen:'sidebar', data:{} });
                    return;
                }
                if (d.type === 'TOOLS_PAGE_CHANGED' && d.source === 'tools-iframe' && d.payload) {
                    var ts = String(d.payload.page || 'home');
                    if (ts === 'home') ts = 'sidebar';
                    captureAndPush({ v:NAV_VERSION, module:'tools', screen:ts, data:{} });
                }
            }, true);

            observeChildPanel('friends', document.getElementById('friendsIframe'));
            observeChildPanel('group', document.getElementById('groupIframe'));

            window.addEventListener('popstate', function (event) {
                if (!event || !event.state || !event.state.exactNav || !event.state.nav) return;
                event.stopImmediatePropagation();
                var target = cloneState(event.state.nav);
                if (exactStack.length) exactStack.pop();
                exactCurrent = target;
                window.__kynExactNavCurrent = target;
                restoreExactState(target);
            }, true);

            document.addEventListener('backbutton', function (event) {
                event.preventDefault();
                event.stopImmediatePropagation();
                try { history.back(); } catch (_) {}
            }, true);

            exactInstalled = true;
            console.info('[ExactNavigation] exact UI back-stack enabled');
            return true;
        }

        var exactNavTimer = setInterval(function () {
            if (installExactNavigation()) clearInterval(exactNavTimer);
        }, 50);
        setTimeout(function () { clearInterval(exactNavTimer); }, 20000);
    }
})();
