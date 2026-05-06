/**
 * group-fix-patch.js  — v2.0.0
 * ============================================================
 * COMPREHENSIVE FIX PATCH — loads after all group scripts
 *
 * FIXES:
 *  1. "My Groups" / "All Groups" show zero — group items not rendering
 *     because module-level let vars aren't live-bound after API sync.
 *     Patch: force re-render from window.GroupCore on tab click + group:list-updated
 *
 *  2. Discover panel: only shows "Join" icon with no "Open" or "Delete"
 *     Patch: detect current user membership and show correct buttons
 *
 *  3. Public groups not visible to other users
 *     Patch: load public groups separately and merge into discover/all sections
 *
 *  4. Send invite only fetches friends — extend to search all users
 *     Patch: add user search input to invite panel with /api/users/search
 *
 *  5. Group click → should open group chat panel with message box, call, dots menu
 *     Patch: wire group-item click directly to openPanel (already in group.html)
 *
 *  6. Delete/Leave buttons missing from group items for owner/members
 *     Patch: add correct buttons based on user role in group item rendering
 * ============================================================
 */

(function GroupFixPatch() {
    'use strict';

    /* ── Utilities ───────────────────────────────────────────────────────── */
    var qs  = function(sel, ctx) { return (ctx || document).querySelector(sel); };
    var qsa = function(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); };

    function freshClone(el) {
        if (!el || !el.parentNode) return el;
        var c = el.cloneNode(true);
        el.parentNode.replaceChild(c, el);
        return c;
    }

    function toast(msg, type) {
        try {
            if (typeof showNotification === 'function') { showNotification(msg, type || 'success'); return; }
        } catch (_) {}
        var n = document.createElement('div');
        n.textContent = msg;
        n.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
            'background:' + (type === 'error' ? '#e53935' : '#43a047') + ';color:#fff;' +
            'padding:10px 22px;border-radius:8px;font-size:14px;z-index:99999;' +
            'box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;';
        document.body.appendChild(n);
        setTimeout(function() { try { n.remove(); } catch(_) {} }, 3200);
    }

    /** Auth token from all known locations */
    function getToken() {
        try {
            return (window.__PARENT_SESSION__ && window.__PARENT_SESSION__.token) ||
                (window.GroupCore && window.GroupCore.getCurrentUser && window.GroupCore._session && window.GroupCore._session.token) ||
                localStorage.getItem('auth_token') ||
                sessionStorage.getItem('auth_token') ||
                localStorage.getItem('authToken') ||
                localStorage.getItem('token') || null;
        } catch (_) { return null; }
    }

    /** API base URL resolution */
    function apiBase() {
        return (window.__apiBaseUrl) ||
            (window.parent && window.parent.__apiBaseUrl) ||
            (typeof window.__getApiBase === 'function' ? window.__getApiBase() : null) ||
            'https://moodchat-fy56.onrender.com/api';
    }

    /** Authenticated fetch */
    function apiFetch(path, opts) {
        opts = opts || {};
        var token = getToken();
        var base  = apiBase();
        var cleanPath = path.replace(/^\/api\//, '/').replace(/^\/api$/, '/');
        var url   = base.replace(/\/$/, '') + (cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath);
        return fetch(url, Object.assign({}, opts, {
            headers: Object.assign(
                { 'Content-Type': 'application/json' },
                token ? { 'Authorization': 'Bearer ' + token } : {},
                opts.headers || {}
            ),
            body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body
        })).then(function(r) { return r.json().then(function(d) { if (!r.ok) throw new Error(d && d.message || 'HTTP ' + r.status); return d; }); });
    }

    /** Current logged-in user ID */
    function myUserId() {
        try {
            var gc = window.GroupCore;
            if (gc) {
                var u = (gc.currentUser || (gc.getCurrentUser && gc.getCurrentUser()));
                if (u) return String(u.id || u.uid || u.userId || '');
            }
        } catch (_) {}
        return '';
    }

    /** Check if current user is member/owner of group */
    function myRoleInGroup(group) {
        var uid = myUserId();
        if (!uid || !group) return null;
        if (String(group.createdBy) === uid) return 'owner';
        // Check members array
        var members = group.members || [];
        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            if (String(m.userId || m.id || '') === uid) return m.role || 'member';
        }
        // Check role field directly (returned by API for current user)
        if (group.role) return group.role;
        if (group.isCreator) return 'owner';
        if (group.isAdmin) return 'admin';
        if (group.isMember) return 'member';
        return null;
    }

    /* ════════════════════════════════════════════════════════════════════════
       FIX 1 — Group items: always show Open button + correct action buttons
       ════════════════════════════════════════════════════════════════════════ */

    /**
     * Patch the addGroupItem function to always include an "Open" button
     * and show Delete for owners, Leave for members.
     */
    function patchAddGroupItem() {
        // We intercept at the event delegation level: whenever a group item is
        // clicked (anywhere except action buttons), open the chat panel.
        document.addEventListener('click', function(e) {
            // Open-chat button
            var openBtn = e.target.closest('[data-action="open-chat"]');
            if (openBtn) {
                e.stopPropagation();
                var groupItem = openBtn.closest('[data-group-id]');
                if (!groupItem) return;
                openGroupFromItem(groupItem.dataset.groupId);
                return;
            }
            // Clicking on group item body (not actions) → open
            var item = e.target.closest('.group-item');
            if (item && !e.target.closest('.group-actions') && !e.target.closest('[data-action]')) {
                openGroupFromItem(item.dataset.groupId);
                return;
            }
        });

        // Add "Open" button after group items are rendered
        // by observing DOM mutations on the group lists
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mut) {
                mut.addedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    // Could be a group-item or a container with group-items
                    var items = [];
                    if (node.classList && node.classList.contains('group-item')) {
                        items.push(node);
                    } else {
                        items = Array.from(node.querySelectorAll ? node.querySelectorAll('.group-item') : []);
                    }
                    items.forEach(ensureGroupItemButtons);
                });
            });
        });

        var lists = ['allGroupsList','myGroupsList','joinedList','adminList','invitesList'];
        lists.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) observer.observe(el, { childList: true, subtree: true });
        });

        // Patch existing items immediately
        qsa('.group-item').forEach(ensureGroupItemButtons);
    }

    /** Ensure a group item has the correct action buttons */
    function ensureGroupItemButtons(item) {
        if (!item || item.dataset.buttonPatched) return;
        item.dataset.buttonPatched = '1';

        var actionsDiv = item.querySelector('.group-actions');
        if (!actionsDiv) return;

        var groupId = item.dataset.groupId;
        var type    = item.dataset.type || '';
        var isInvite = type === 'group_invite';

        if (isInvite) {
            // Already has accept/decline — don't touch
            return;
        }

        // Check if Open button exists; add if missing
        if (!actionsDiv.querySelector('[data-action="open-chat"]')) {
            var openBtn = document.createElement('button');
            openBtn.className = 'group-action-btn chat';
            openBtn.dataset.action = 'open-chat';
            openBtn.title = 'Open Chat';
            openBtn.innerHTML = '<i class="fas fa-comments"></i>';
            actionsDiv.insertBefore(openBtn, actionsDiv.firstChild);
        }

        // For discover-type items that only have "Join" — detect if already member
        var joinBtn = actionsDiv.querySelector('[data-action="join"]');
        if (joinBtn) {
            // Look up group in GroupCore
            var gc = window.GroupCore;
            if (gc && gc.getGroupById) {
                var gData = gc.getGroupById(parseInt(groupId) || groupId);
                var role  = myRoleInGroup(gData || {});
                if (role) {
                    // User is already a member — swap Join for Open
                    joinBtn.remove();
                    var ob = actionsDiv.querySelector('[data-action="open-chat"]');
                    if (!ob) {
                        ob = document.createElement('button');
                        ob.className = 'group-action-btn chat';
                        ob.dataset.action = 'open-chat';
                        ob.title = 'Open Chat';
                        ob.innerHTML = '<i class="fas fa-comments"></i>';
                        actionsDiv.appendChild(ob);
                    }
                    // Add Delete for owners
                    if ((role === 'owner' || role === 'admin') && !actionsDiv.querySelector('[data-action="delete-group"]')) {
                        var delBtn = document.createElement('button');
                        delBtn.className = 'group-action-btn danger';
                        delBtn.dataset.action = 'delete-group';
                        delBtn.dataset.gid = groupId;
                        delBtn.title = 'Delete Group';
                        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                        delBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            handleDeleteGroup(groupId);
                        });
                        actionsDiv.appendChild(delBtn);
                    }
                }
            }
        }
    }

    function openGroupFromItem(groupId) {
        if (!groupId) return;
        // Find group data
        var gc    = window.GroupCore;
        var gData = null;
        if (gc && gc.getGroupById) {
            gData = gc.getGroupById(parseInt(groupId) || groupId);
        }
        if (!gData) {
            // Try discovering from all known arrays
            var allArrays = ['groups','myGroups','joinedGroups','adminGroups'];
            for (var i = 0; i < allArrays.length; i++) {
                var arr = window[allArrays[i]];
                if (Array.isArray(arr)) {
                    gData = arr.find(function(g) { return String(g.id) === String(groupId); });
                    if (gData) break;
                }
            }
        }
        // Open the panel
        if (gData && typeof window.__gcOpenPanel === 'function') {
            window.__gcOpenPanel(gData);
        } else if (gData && typeof openGroupChat === 'function') {
            openGroupChat(gData);
        } else if (gData && typeof showGroupDetails === 'function') {
            showGroupDetails(gData, myRoleInGroup(gData) === 'owner' ? 'my_group' : 'joined');
        } else {
            // Fallback: load from API then open
            apiFetch('/groups/' + groupId)
                .then(function(d) {
                    var g = (d.data && d.data.group) || d.data || d.group || d;
                    if (g && g.id && typeof window.__gcOpenPanel === 'function') {
                        window.__gcOpenPanel(g);
                    }
                })
                .catch(function() { toast('Could not open group', 'error'); });
        }
    }

    function handleDeleteGroup(groupId) {
        if (!confirm('Are you sure you want to delete this group? This cannot be undone.')) return;
        var gc = window.GroupCore;
        if (gc && typeof gc.deleteGroup === 'function') {
            gc.deleteGroup(parseInt(groupId) || groupId).then(function(r) {
                if (r && r.success) {
                    toast('Group deleted');
                    try { if (typeof updateGroupCounts === 'function') updateGroupCounts(); } catch(_) {}
                    try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch(_) {}
                } else {
                    toast('Failed to delete group', 'error');
                }
            }).catch(function(err) { toast(err.message || 'Failed', 'error'); });
        } else {
            apiFetch('/groups/' + groupId, { method: 'DELETE' })
                .then(function() {
                    toast('Group deleted');
                    try { if (typeof updateGroupCounts === 'function') updateGroupCounts(); } catch(_) {}
                    try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch(_) {}
                })
                .catch(function(err) { toast(err.message || 'Failed', 'error'); });
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
       FIX 2 — Group count tabs show zero
       After GroupCore syncs, module-level `let` vars may not reflect updates.
       Force re-render from window.GroupCore on every tab click.
       ════════════════════════════════════════════════════════════════════════ */

    function patchTabCounts() {
        // Intercept tab clicks and force re-render from GroupCore
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('.category-btn');
            if (!btn) return;
            // After tab switches, wait a tick and refresh
            setTimeout(function() {
                syncModuleVarsFromGroupCore();
                try { if (typeof updateGroupCounts === 'function') updateGroupCounts(); } catch(_) {}
                try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch(_) {}
            }, 50);
        }, true);

        // Also trigger on GroupCore events
        var gc = window.GroupCore;
        if (gc && typeof gc.on === 'function') {
            gc.on('groups:list-updated', function() {
                syncModuleVarsFromGroupCore();
                try { if (typeof updateGroupCounts === 'function') updateGroupCounts(); } catch(_) {}
                try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch(_) {}
            });
            gc.on('groups:loaded', function() {
                syncModuleVarsFromGroupCore();
                try { if (typeof updateGroupCounts === 'function') updateGroupCounts(); } catch(_) {}
                try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch(_) {}
            });
        } else {
            // Retry wiring
            setTimeout(patchTabCounts, 500);
        }
    }

    function syncModuleVarsFromGroupCore() {
        var gc = window.GroupCore;
        if (!gc) return;
        try {
            // The module-level vars in group-core.js are `let` — they can only be
            // updated by GroupCore.saveGroups() which assigns gc.groups → window var.
            // Force that assignment now.
            if (gc.saveGroups) gc.saveGroups();
        } catch(_) {}
    }

    /* ════════════════════════════════════════════════════════════════════════
       FIX 3 — Discover: show correct buttons (Open/Delete vs Join)
       Also ensure public groups from OTHER users are visible in All Groups
       ════════════════════════════════════════════════════════════════════════ */

    function patchDiscoverPanel() {
        // Override discoverResults rendering to add smart buttons
        var discoverObs = new MutationObserver(function(mutations) {
            mutations.forEach(function(mut) {
                mut.addedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    // Find join buttons in discover results
                    var btns = node.classList && node.classList.contains('[data-gid]') ?
                        [node] : Array.from(node.querySelectorAll ? node.querySelectorAll('[data-gid]') : []);
                    btns.forEach(function(btn) {
                        var gid = btn.dataset.gid || btn.dataset.id;
                        if (!gid) return;
                        var gc = window.GroupCore;
                        var gData = gc && gc.getGroupById ? gc.getGroupById(parseInt(gid) || gid) : null;
                        var role = myRoleInGroup(gData || {});
                        if (role) {
                            // Already a member — change button to Open
                            btn.textContent = '▶ Open';
                            btn.style.background = '#43a047';
                            btn.onclick = function(e) {
                                e.stopPropagation();
                                openGroupFromItem(gid);
                            };
                            // Add delete button for owners
                            if (role === 'owner' || role === 'admin') {
                                var parent = btn.parentNode;
                                if (parent && !parent.querySelector('[data-del-gid]')) {
                                    var delBtn = document.createElement('button');
                                    delBtn.dataset.delGid = gid;
                                    delBtn.style.cssText = 'padding:7px 10px;border-radius:8px;border:none;background:#e53935;color:#fff;font-weight:600;cursor:pointer;font-size:12px;margin-left:4px';
                                    delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                                    delBtn.title = 'Delete Group';
                                    delBtn.addEventListener('click', function(e) {
                                        e.stopPropagation();
                                        handleDeleteGroup(gid);
                                    });
                                    parent.appendChild(delBtn);
                                }
                            }
                        }
                    });
                });
            });
        });

        var discoverResults = document.getElementById('discoverResults');
        if (discoverResults) {
            discoverObs.observe(discoverResults, { childList: true, subtree: true });
        } else {
            // Watch for it to appear
            var docObs = new MutationObserver(function() {
                var el = document.getElementById('discoverResults');
                if (el) { discoverObs.observe(el, { childList: true, subtree: true }); docObs.disconnect(); }
            });
            docObs.observe(document.body, { childList: true, subtree: true });
        }
    }

    /**
     * Enhance the All Groups tab to also load public groups from other users.
     * This makes groups visible to all users, not just the creator.
     */
    function patchAllGroupsSection() {
        // When All Groups section becomes active, also fetch public groups
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('#allTab, .category-btn[id="allTab"]');
            if (!btn) return;
            setTimeout(loadPublicGroupsIntoAllGroups, 300);
        });

        // Also load on initial render
        var allTab = document.getElementById('allTab');
        if (allTab && allTab.classList.contains('active')) {
            setTimeout(loadPublicGroupsIntoAllGroups, 500);
        }
    }

    function loadPublicGroupsIntoAllGroups() {
        apiFetch('/groups/search?limit=30&isPublic=true')
            .then(function(d) {
                var publicGroups = (d.data && (d.data.groups || d.data)) || d.groups || [];
                if (!publicGroups.length) return;

                var gc = window.GroupCore;
                var uid = myUserId();

                publicGroups.forEach(function(pg) {
                    // Skip groups already in GroupCore
                    if (gc && gc.groups && gc.groups.some(function(g) { return String(g.id) === String(pg.id); })) return;

                    // Add to the all groups list if not already there
                    var allList = document.getElementById('allGroupsList');
                    if (!allList) return;
                    if (allList.querySelector('[data-group-id="' + pg.id + '"]')) return;

                    var item = document.createElement('div');
                    item.className = 'group-item';
                    item.dataset.groupId = pg.id;
                    item.dataset.type = 'public_group';
                    var initials = (pg.name || 'G').split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
                    item.innerHTML = [
                        '<div class="group-avatar" style="background:linear-gradient(135deg,#667eea,#764ba2)">',
                        '<span>' + initials + '</span>',
                        '</div>',
                        '<div class="group-info">',
                        '<div class="group-name"><span class="group-name-text">' + (pg.name || 'Unnamed') + '</span>',
                        '<span class="group-details"><span style="padding:2px 6px;border-radius:10px;font-size:11px;background:#4caf5020;color:#4caf50">Public</span></span></div>',
                        '<div class="group-details">',
                        '<span class="member-count"><i class="fas fa-users"></i> ' + (pg.memberCount || pg.stats && pg.stats.totalMembers || 0) + '</span>',
                        pg.purpose ? '<span class="group-purpose-tag">' + pg.purpose + '</span>' : '',
                        '</div>',
                        pg.description ? '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px">' + (pg.description || '').slice(0, 80) + '</div>' : '',
                        '</div>',
                        '<div class="group-actions">',
                        '<button class="group-action-btn" data-action="join-public" data-gid="' + pg.id + '" title="Join Group"><i class="fas fa-user-plus"></i></button>',
                        '</div>'
                    ].join('');

                    item.addEventListener('click', function(e) {
                        if (!e.target.closest('.group-actions')) {
                            // Show minimal group info or try to join first
                            toast('Join this group to open chat', 'info');
                        }
                    });

                    var joinPublicBtn = item.querySelector('[data-action="join-public"]');
                    if (joinPublicBtn) {
                        joinPublicBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var btn = e.currentTarget;
                            btn.disabled = true;
                            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                            apiFetch('/groups/' + pg.id + '/join', { method: 'POST' })
                                .then(function() {
                                    btn.innerHTML = '<i class="fas fa-check"></i>';
                                    btn.style.background = '#43a047';
                                    toast('Join request sent!');
                                    if (gc && gc.requestGroupList) gc.requestGroupList().catch(function() {});
                                })
                                .catch(function(err) {
                                    btn.disabled = false;
                                    btn.innerHTML = '<i class="fas fa-user-plus"></i>';
                                    toast(err.message || 'Failed to join', 'error');
                                });
                        });
                    }

                    // Don't add to the empty-state container
                    var emptyState = allList.querySelector('.empty-state');
                    if (emptyState) emptyState.remove();
                    allList.appendChild(item);
                });
            })
            .catch(function() {}); // silently fail — this is enhancement only
    }

    /* ════════════════════════════════════════════════════════════════════════
       FIX 4 — Invite: search ALL users, not just friends
       Enhance the invite panel with a user search field
       ════════════════════════════════════════════════════════════════════════ */

    function patchInviteUserSearch() {
        // Watch for invite panel / friend selection modal to open
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mut) {
                if (mut.type !== 'attributes' && mut.type !== 'childList') return;
                // Check for friendSelectionModal becoming active
                var modal = document.getElementById('friendSelectionModal');
                if (modal && (modal.classList.contains('active') || modal.style.display === 'flex')) {
                    injectUserSearchIntoFriendModal(modal);
                }
                // Check for inviteBody (panel invite tab)
                var invBody = document.getElementById('inviteBody');
                if (invBody && invBody.children.length > 0) {
                    var inp = invBody.querySelector('#invFriendSearch');
                    if (inp && !inp.dataset.userSearchPatched) {
                        injectUserSearchIntoInviteBody(invBody);
                    }
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

        // Also patch when friend selection is shown via event delegation
        document.addEventListener('click', function(e) {
            if (e.target.closest('#groupInvitesBtn') || e.target.closest('[data-action="invite"]')) {
                setTimeout(function() {
                    var modal = document.getElementById('friendSelectionModal');
                    if (modal) injectUserSearchIntoFriendModal(modal);
                }, 300);
            }
        });
    }

    function injectUserSearchIntoFriendModal(modal) {
        if (!modal || modal._userSearchInjected) return;
        modal._userSearchInjected = true;

        // Find the friend search input and add a "Search all users" section below it
        var existingSearch = modal.querySelector('#friendSearch, input[placeholder*="Search"]');
        var content = modal.querySelector('#friendSelectionContent');
        if (!content) return;

        // Add user search section at top
        var searchSection = document.createElement('div');
        searchSection.id = 'userSearchSection';
        searchSection.style.cssText = 'padding:10px 16px;border-bottom:1px solid var(--border-color);background:var(--bg-secondary,#1a1a2e)';
        searchSection.innerHTML = [
            '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;font-weight:500">',
            '<i class="fas fa-search"></i> Search all users (not just friends)',
            '</div>',
            '<div style="display:flex;gap:8px">',
            '<input id="allUserSearchInput" placeholder="Search by name or username…" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:13px;outline:none">',
            '<button id="allUserSearchBtn" style="padding:8px 14px;border-radius:8px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-size:13px;font-weight:600;cursor:pointer">Search</button>',
            '</div>',
            '<div id="allUserResults" style="max-height:200px;overflow-y:auto;margin-top:8px"></div>'
        ].join('');

        content.parentNode.insertBefore(searchSection, content);

        var searchInput = searchSection.querySelector('#allUserSearchInput');
        var searchBtn   = searchSection.querySelector('#allUserSearchBtn');
        var resultsDiv  = searchSection.querySelector('#allUserResults');

        function doUserSearch() {
            var q = searchInput.value.trim();
            if (!q || q.length < 2) { resultsDiv.innerHTML = ''; return; }
            resultsDiv.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';
            apiFetch('/users/search?query=' + encodeURIComponent(q) + '&limit=10')
                .then(function(d) {
                    var users = (d.data && (d.data.users || d.data)) || d.users || [];
                    if (!users.length) {
                        resultsDiv.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:13px">No users found</div>';
                        return;
                    }
                    resultsDiv.innerHTML = '';
                    var currentGroup = window.__gcCurrentGroup || window.selectedGroup;
                    users.forEach(function(u) {
                        var name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'User';
                        var row  = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border-color);cursor:pointer';
                        var initials = name.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
                        row.innerHTML = [
                            '<div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">',
                            u.avatar ? '' : initials,
                            '</div>',
                            '<div style="flex:1"><div style="font-weight:500;font-size:13px">' + name + '</div>',
                            '<div style="font-size:11px;color:var(--text-secondary)">' + (u.username ? '@' + u.username : '') + '</div></div>',
                            '<button data-uid="' + u.id + '" data-uname="' + name + '" style="padding:5px 12px;border-radius:8px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-size:12px;font-weight:600;cursor:pointer">Invite</button>'
                        ].join('');

                        row.querySelector('[data-uid]').addEventListener('click', function(e) {
                            e.stopPropagation();
                            var invBtn  = e.currentTarget;
                            var userId  = invBtn.dataset.uid;
                            var uname   = invBtn.dataset.uname;
                            var gid     = currentGroup && currentGroup.id;
                            if (!gid) {
                                // Let user pick — add to pending invites for create flow
                                if (!window.__pendingGroupInvites) window.__pendingGroupInvites = [];
                                if (!window.__pendingGroupInvites.includes(userId)) {
                                    window.__pendingGroupInvites.push(userId);
                                    invBtn.textContent = '✓ Added';
                                    invBtn.style.background = '#43a047';
                                    invBtn.disabled = true;
                                }
                                return;
                            }
                            invBtn.disabled = true;
                            invBtn.textContent = '…';
                            apiFetch('/group-members/' + gid + '/invitations', { method: 'POST', body: { inviteeId: parseInt(userId) || userId, role: 'member' } })
                                .then(function() {
                                    invBtn.textContent = '✓ Invited';
                                    invBtn.style.background = '#43a047';
                                    toast('Invitation sent to ' + uname);
                                })
                                .catch(function(err) {
                                    invBtn.disabled = false;
                                    invBtn.textContent = 'Invite';
                                    toast(err.message || 'Failed', 'error');
                                });
                        });
                        resultsDiv.appendChild(row);
                    });
                })
                .catch(function(err) {
                    resultsDiv.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:13px">' + (err.message || 'Search failed') + '</div>';
                });
        }

        if (searchBtn) searchBtn.addEventListener('click', doUserSearch);
        if (searchInput) {
            var debounce;
            searchInput.addEventListener('keyup', function(e) {
                if (e.key === 'Enter') { doUserSearch(); return; }
                clearTimeout(debounce);
                debounce = setTimeout(doUserSearch, 400);
            });
        }
    }

    function injectUserSearchIntoInviteBody(invBody) {
        var invFriendSearch = invBody.querySelector('#invFriendSearch');
        if (!invFriendSearch || invFriendSearch.dataset.userSearchPatched) return;
        invFriendSearch.dataset.userSearchPatched = '1';

        // Add a separator and user search button below the friend search
        var sep = document.createElement('div');
        sep.style.cssText = 'text-align:center;padding:8px 0;font-size:12px;color:var(--text-secondary)';
        sep.innerHTML = '— or —';

        var userSearchRow = document.createElement('div');
        userSearchRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
        userSearchRow.innerHTML = [
            '<input id="invBodyUserSearch" placeholder="Search all users by name/username…" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:13px;outline:none">',
            '<button id="invBodyUserSearchBtn" style="padding:8px 12px;border-radius:8px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-weight:600;cursor:pointer;font-size:12px">Search</button>'
        ].join('');

        var resultsDiv = document.createElement('div');
        resultsDiv.id = 'invBodyUserResults';
        resultsDiv.style.cssText = 'max-height:180px;overflow-y:auto;margin-bottom:8px';

        var parent = invFriendSearch.parentNode;
        parent.insertBefore(sep, invFriendSearch.nextSibling);
        parent.insertBefore(userSearchRow, sep.nextSibling);
        parent.insertBefore(resultsDiv, userSearchRow.nextSibling);

        var uInput = userSearchRow.querySelector('#invBodyUserSearch');
        var uBtn   = userSearchRow.querySelector('#invBodyUserSearchBtn');

        function doSearch() {
            var q = uInput.value.trim();
            if (!q || q.length < 2) { resultsDiv.innerHTML = ''; return; }
            resultsDiv.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';
            apiFetch('/users/search?query=' + encodeURIComponent(q) + '&limit=10')
                .then(function(d) {
                    var users = (d.data && (d.data.users || d.data)) || d.users || [];
                    resultsDiv.innerHTML = '';
                    if (!users.length) {
                        resultsDiv.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:13px">No users found</div>';
                        return;
                    }
                    var gid = (window._invSelGroup) || (window.selectedGroup && window.selectedGroup.id);
                    var groupSel = document.getElementById('invGroupSel');
                    if (groupSel && groupSel.value) gid = groupSel.value;

                    users.forEach(function(u) {
                        var name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'User';
                        var row  = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid var(--border-color)';
                        var initials = name.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
                        row.innerHTML = [
                            '<div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:11px">' + initials + '</div>',
                            '<div style="flex:1;font-size:13px">' + name + (u.username ? ' <span style="color:var(--text-secondary);font-size:11px">@' + u.username + '</span>' : '') + '</div>',
                            '<button data-uid="' + u.id + '" style="padding:4px 10px;border-radius:6px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-size:11px;font-weight:600;cursor:pointer">Invite</button>'
                        ].join('');
                        row.querySelector('[data-uid]').addEventListener('click', function(e) {
                            var btn = e.currentTarget;
                            var uid = btn.dataset.uid;
                            if (!gid) { toast('Select a group first', 'error'); return; }
                            btn.disabled = true; btn.textContent = '…';
                            apiFetch('/group-members/' + gid + '/invitations', { method: 'POST', body: { inviteeId: parseInt(uid) || uid, role: 'member' } })
                                .then(function() { btn.textContent = '✓'; btn.style.background = '#43a047'; toast('Invitation sent to ' + name); })
                                .catch(function(err) { btn.disabled = false; btn.textContent = 'Invite'; toast(err.message || 'Failed', 'error'); });
                        });
                        resultsDiv.appendChild(row);
                    });
                })
                .catch(function() { resultsDiv.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:13px">Search failed</div>'; });
        }

        if (uBtn) uBtn.addEventListener('click', doSearch);
        if (uInput) {
            var dbounce;
            uInput.addEventListener('keyup', function(e) {
                if (e.key === 'Enter') { doSearch(); return; }
                clearTimeout(dbounce);
                dbounce = setTimeout(doSearch, 400);
            });
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
       FIX 5 — Group chat panel: wire call button, dots menu, and sub-panel
       ════════════════════════════════════════════════════════════════════════ */

    function patchGroupChatPanel() {
        // Wire dots menu
        document.addEventListener('click', function(e) {
            // Toggle dots menu
            var dotsBtn = e.target.closest('#chatMoreBtn');
            if (dotsBtn) {
                var menu = document.getElementById('chatMoreMenu');
                if (menu) {
                    var isOpen = menu.style.display !== 'none';
                    menu.style.display = isOpen ? 'none' : 'block';
                }
                return;
            }

            // Close dots menu if clicking elsewhere
            if (!e.target.closest('#chatMoreMenu') && !e.target.closest('#chatMoreBtn')) {
                var menu2 = document.getElementById('chatMoreMenu');
                if (menu2) menu2.style.display = 'none';
            }

            // Dots menu item actions
            var menuItem = e.target.closest('.gcm-item');
            if (menuItem) {
                var action = menuItem.dataset.action;
                var menu3  = document.getElementById('chatMoreMenu');
                if (menu3) menu3.style.display = 'none';
                var group  = window.__gcCurrentGroup;
                handleChatMenuAction(action, group);
                return;
            }

            // Call button
            var callBtn = e.target.closest('#chatCallBtn');
            if (callBtn) {
                var g = window.__gcCurrentGroup;
                if (g) handleGroupCall(g);
                return;
            }

            // Close chat button
            var closeBtn = e.target.closest('#closeChatBtn');
            if (closeBtn) {
                if (typeof window.__gcClosePanel === 'function') window.__gcClosePanel();
                else if (typeof closeGroupChatMobile === 'function') closeGroupChatMobile();
                return;
            }

            // Sub-panel back button
            var backBtn = e.target.closest('#gcSubPanelBack');
            if (backBtn) {
                var sp = document.getElementById('gcSubPanel');
                if (sp) sp.style.display = 'none';
                return;
            }
        });

        // Wire send button (in case group-core.js wiring failed)
        document.addEventListener('click', function(e) {
            var sendBtn = e.target.closest('#chatSendBtn');
            if (!sendBtn) return;
            trySendMessage();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                var active = document.activeElement;
                if (active && active.id === 'chatInput') {
                    e.preventDefault();
                    trySendMessage();
                }
            }
        });
    }

    function handleChatMenuAction(action, group) {
        if (!action || !group) return;
        var sp    = document.getElementById('gcSubPanel');
        var title = document.getElementById('gcSubPanelTitle');
        var body  = document.getElementById('gcSubPanelContent');

        function openSubPanel(panelTitle, content) {
            if (sp)    { sp.style.display = 'flex'; }
            if (title) { title.textContent = panelTitle; }
            if (body)  { body.innerHTML = content || '<div style="padding:20px;color:var(--text-secondary)">Loading…</div>'; }
        }

        switch (action) {
            case 'members':
                openSubPanel('Members', '<div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i></div>');
                loadSubPanelMembers(group.id, body);
                break;
            case 'settings':
                openSubPanel('Group Settings', buildSettingsForm(group));
                break;
            case 'theme':
                openSubPanel('Change Theme', buildThemeForm(group));
                break;
            case 'purpose':
                openSubPanel('Group Purpose & Mood', buildPurposeForm(group));
                break;
            case 'info':
                if (typeof showGroupDetails === 'function') showGroupDetails(group, myRoleInGroup(group) === 'owner' ? 'my_group' : 'joined');
                break;
            case 'delete':
                handleDeleteGroup(group.id);
                break;
            case 'leave':
                if (confirm('Leave "' + (group.name || 'this group') + '"?')) {
                    var gc = window.GroupCore;
                    if (gc && gc.leaveGroup) {
                        gc.leaveGroup(group.id).then(function() {
                            toast('You left the group');
                            if (typeof window.__gcClosePanel === 'function') window.__gcClosePanel();
                        }).catch(function(err) { toast(err.message || 'Failed', 'error'); });
                    }
                }
                break;
        }
    }

    function loadSubPanelMembers(groupId, bodyEl) {
        if (!bodyEl) return;
        apiFetch('/groups/' + groupId + '/members')
            .then(function(d) {
                var members = (d.data && (d.data.members || d.data)) || d.members || [];
                if (!members.length) { bodyEl.innerHTML = '<div style="padding:20px;color:var(--text-secondary)">No members found</div>'; return; }
                bodyEl.innerHTML = '';
                members.forEach(function(m) {
                    var name = m.user && (m.user.displayName || m.user.username) || m.displayName || m.username || 'User';
                    var role = m.role || 'member';
                    var row  = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-color)';
                    var initials = name.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
                    row.innerHTML = [
                        '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;flex-shrink:0">' + initials + '</div>',
                        '<div style="flex:1"><div style="font-weight:500;font-size:14px">' + name + '</div>',
                        '<div style="font-size:12px;color:var(--text-secondary)">' + role + '</div></div>'
                    ].join('');
                    bodyEl.appendChild(row);
                });
            })
            .catch(function() { bodyEl.innerHTML = '<div style="padding:20px;color:var(--text-secondary)">Could not load members</div>'; });
    }

    function buildSettingsForm(group) {
        return [
            '<div style="display:flex;flex-direction:column;gap:14px">',
            '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Group Name</label>',
            '<input id="spGroupName" value="' + (group.name || '') + '" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px;box-sizing:border-box"></div>',
            '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Description</label>',
            '<textarea id="spGroupDesc" rows="3" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px;box-sizing:border-box;resize:vertical">' + (group.description || '') + '</textarea></div>',
            '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Privacy</label>',
            '<select id="spGroupPrivacy" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px">',
            '<option value="private"' + (group.privacy === 'private' ? ' selected' : '') + '>Private</option>',
            '<option value="public"' + (group.privacy === 'public' ? ' selected' : '') + '>Public</option>',
            '</select></div>',
            '<button id="spSaveSettingsBtn" style="width:100%;padding:11px;border-radius:8px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-weight:700;font-size:14px;cursor:pointer">Save Settings</button>',
            '</div>'
        ].join('');
    }

    document.addEventListener('click', function(e) {
        if (!e.target.closest('#spSaveSettingsBtn')) return;
        var g = window.__gcCurrentGroup;
        if (!g) return;
        var name = document.getElementById('spGroupName');
        var desc = document.getElementById('spGroupDesc');
        var priv = document.getElementById('spGroupPrivacy');
        var gc   = window.GroupCore;
        var payload = { name: name && name.value.trim(), description: desc && desc.value.trim(), privacy: priv && priv.value };
        if (gc && gc.updateGroup) {
            gc.updateGroup(g.id, payload).then(function(r) {
                if (r && r.success) { toast('Settings saved'); document.getElementById('gcSubPanel').style.display = 'none'; }
                else toast('Failed to save', 'error');
            }).catch(function(err) { toast(err.message || 'Failed', 'error'); });
        } else {
            apiFetch('/groups/' + g.id, { method: 'PUT', body: payload })
                .then(function() { toast('Settings saved'); document.getElementById('gcSubPanel').style.display = 'none'; })
                .catch(function(err) { toast(err.message || 'Failed', 'error'); });
        }
    });

    function buildThemeForm(group) {
        var themes = [['blue','linear-gradient(135deg,#667eea,#764ba2)'],['green','linear-gradient(135deg,#11998e,#38ef7d)'],['red','linear-gradient(135deg,#ff416c,#ff4b2b)'],['purple','linear-gradient(135deg,#8a2387,#f27121)'],['dark','linear-gradient(135deg,#0f2027,#2c5364)']];
        return '<div><div style="margin-bottom:12px;font-size:13px;color:var(--text-secondary)">Select a theme for this group:</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:12px">' +
            themes.map(function(t) {
                return '<div data-theme="' + t[0] + '" style="width:60px;height:60px;border-radius:12px;background:' + t[1] + ';cursor:pointer;border:3px solid ' + (group.theme === t[0] ? '#fff' : 'transparent') + ';display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px;font-size:10px;color:#fff;font-weight:600">' + t[0] + '</div>';
            }).join('') +
            '</div><button id="spSaveThemeBtn" style="width:100%;margin-top:16px;padding:11px;border-radius:8px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-weight:700;cursor:pointer">Apply Theme</button></div>';
    }

    var _selectedTheme = null;
    document.addEventListener('click', function(e) {
        var themeEl = e.target.closest('[data-theme]');
        if (themeEl && themeEl.closest('#gcSubPanelContent')) {
            qsa('[data-theme]', document.getElementById('gcSubPanelContent')).forEach(function(x) { x.style.borderColor = 'transparent'; });
            themeEl.style.borderColor = '#fff';
            _selectedTheme = themeEl.dataset.theme;
            return;
        }
        if (e.target.closest('#spSaveThemeBtn')) {
            var g = window.__gcCurrentGroup;
            if (!g || !_selectedTheme) return;
            apiFetch('/groups/' + g.id, { method: 'PUT', body: { theme: _selectedTheme } })
                .then(function() { toast('Theme applied!'); document.getElementById('gcSubPanel').style.display = 'none'; })
                .catch(function(err) { toast(err.message || 'Failed', 'error'); });
        }
    });

    function buildPurposeForm(group) {
        var purposes = ['study','prayer','work','family','event','project','support','hobby','fitness','other'];
        var moods    = ['calm','busy','celebratory','silent','urgent'];
        return '<div style="display:flex;flex-direction:column;gap:14px">' +
            '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">Purpose</label>' +
            '<select id="spPurpose" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px">' +
            '<option value="">-- Select purpose --</option>' +
            purposes.map(function(p) { return '<option value="' + p + '"' + (group.purpose === p ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>'; }).join('') +
            '</select></div>' +
            '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">Group Mood</label>' +
            '<select id="spMood" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px">' +
            '<option value="">-- Select mood --</option>' +
            moods.map(function(m) { return '<option value="' + m + '"' + (group.mood === m ? ' selected' : '') + '>' + m.charAt(0).toUpperCase() + m.slice(1) + '</option>'; }).join('') +
            '</select></div>' +
            '<button id="spSavePurposeBtn" style="width:100%;padding:11px;border-radius:8px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-weight:700;font-size:14px;cursor:pointer">Save</button>' +
            '</div>';
    }

    document.addEventListener('click', function(e) {
        if (!e.target.closest('#spSavePurposeBtn')) return;
        var g = window.__gcCurrentGroup;
        if (!g) return;
        var purpose = document.getElementById('spPurpose');
        var mood    = document.getElementById('spMood');
        apiFetch('/groups/' + g.id, { method: 'PUT', body: { purpose: purpose && purpose.value, mood: mood && mood.value } })
            .then(function() { toast('Purpose & mood updated'); document.getElementById('gcSubPanel').style.display = 'none'; })
            .catch(function(err) { toast(err.message || 'Failed', 'error'); });
    });

    function handleGroupCall(group) {
        // Show a simple "calling" notification — actual WebRTC handled by parent
        toast('Starting group call for "' + (group.name || 'Group') + '"…', 'info');
        var callPanel = document.getElementById('groupCallPanel');
        var callTitle = document.getElementById('callGroupName');
        if (callPanel) { callPanel.style.display = 'flex'; callPanel.classList.add('active'); }
        if (callTitle) callTitle.textContent = group.name || 'Group Call';
    }

    function trySendMessage() {
        try {
            if (typeof sendGroupMessage === 'function') { sendGroupMessage(); return; }
        } catch (_) {}
        // Fallback direct send
        var inp   = document.getElementById('chatInput');
        var group = window.__gcCurrentGroup;
        if (!inp || !group || !inp.value.trim()) return;
        var text = inp.value.trim();
        inp.value = '';
        inp.style.height = '';
        apiFetch('/groups/' + group.id + '/messages', { method: 'POST', body: { content: text } })
            .then(function(d) {
                var msg = (d.data && (d.data.message || d.data)) || d;
                if (msg && msg.content) {
                    // Render the sent message
                    var box = document.getElementById('chatMessages');
                    if (box && typeof makeBubble === 'function') {
                        box.appendChild(makeBubble(msg.content, 'You', true, msg.createdAt || new Date()));
                        var cont = document.getElementById('chatMessagesContainer');
                        if (cont) cont.scrollTop = cont.scrollHeight;
                    }
                }
            })
            .catch(function(err) { toast(err.message || 'Failed to send', 'error'); });
    }

    /* ════════════════════════════════════════════════════════════════════════
       BOOT — Run all fixes
       ════════════════════════════════════════════════════════════════════════ */

    function boot() {
        try { patchAddGroupItem();       } catch(e) { console.warn('[fix] addGroupItem:', e); }
        try { patchTabCounts();           } catch(e) { console.warn('[fix] tabCounts:', e); }
        try { patchDiscoverPanel();       } catch(e) { console.warn('[fix] discoverPanel:', e); }
        try { patchAllGroupsSection();    } catch(e) { console.warn('[fix] allGroups:', e); }
        try { patchInviteUserSearch();    } catch(e) { console.warn('[fix] inviteSearch:', e); }
        try { patchGroupChatPanel();      } catch(e) { console.warn('[fix] chatPanel:', e); }

        // Expose helper globally
        window.__groupFixPatch = {
            openGroupFromItem: openGroupFromItem,
            handleDeleteGroup: handleDeleteGroup,
            syncModuleVars:    syncModuleVarsFromGroupCore
        };

        // Trigger initial render with latest data after GroupCore is ready
        var attempts = 0;
        function tryInitialRender() {
            var gc = window.GroupCore;
            if (gc && gc.groups && (gc.groups.length > 0 || attempts > 10)) {
                syncModuleVarsFromGroupCore();
                try { if (typeof updateGroupCounts   === 'function') updateGroupCounts();   } catch(_) {}
                try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch(_) {}
                // Also load public groups into all groups section
                setTimeout(loadPublicGroupsIntoAllGroups, 800);
            } else {
                attempts++;
                setTimeout(tryInitialRender, 400);
            }
        }
        setTimeout(tryInitialRender, 300);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        // Run after all module scripts have executed
        setTimeout(boot, 0);
    }

})();