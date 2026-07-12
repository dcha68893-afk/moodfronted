/**
 * group-ui-patch.js  — v4.0.0
 * ============================================================
 * COMPREHENSIVE FIX PATCH — loads after group-core.js + group-ui.js
 *
 * PROBLEMS FIXED:
 *  1. discoverGroupsBtn / groupInvitesBtn / groupEventsBtn → no response
 *     Root cause: setupEventListeners() blocked by lifecycle guard when
 *     running iframe-standalone (_protocolReady && _parentReadyReceived both
 *     false). Patch force-attaches listeners via cloneNode to clear stale handlers.
 *
 *  2. Create-Group tabs blank (Settings, Purpose, Theme, Members)
 *     Root cause: data-tab value !== element ID (e.g. "settings" vs "settingsTab").
 *     Patch: explicit data-tab → ID map with classList.add('active') logic.
 *
 *  3. Members tab never loaded friends list
 *     Root cause: loadFriendsForMembersTab() not called on tab click.
 *     Patch: calls it on click; falls back to direct GET /api/friends.
 *
 *  4. Friends list shows 🔒 badge for users with privacy restrictions
 *     Root cause: invitePolicy field not read. Patch reads friend.privacy
 *     .allowGroupAdds / groupAddPolicy and shows inline badge.
 *
 *  5. Cancel button had no listener → modal stayed open
 *     Patch: replaces button node, attaches closeCreateGroupModal() + full reset.
 *
 *  6. Create Group button navigation broken
 *     Patch: validates name → collects form → calls createGroupOnline() or
 *     falls back to direct POST /api/groups → closes modal on success.
 *
 *  7. Admin management: Theme tab missing, members list empty
 *     Patch: patchAdminManagementModal() adds Theme tab, wires all tab switches,
 *     loads member list via GET /api/group-members/:id/members, saves via
 *     PUT /api/groups/:id.
 *
 *  8. Discover filters / Events / Invite quick-action tabs
 *     All re-wired with fresh cloned listeners and content loaders.
 *
 *  9. Endpoint alignment — all fetch calls use correct routes matching
 *     groupMembers.js route file (invitations before /:groupId, PATCH alias etc.)
 * ============================================================
 */

(function GroupUIPatch() {
    'use strict';

    /* ─── helpers ─────────────────────────────────────────────────────────── */

    function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
    function qsa(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; }

    /** Replace a DOM node with a fresh clone so ALL prior listeners are gone */
    function freshClone(el) {
        if (!el) return null;
        const c = el.cloneNode(true);
        el.parentNode.replaceChild(c, el);
        return c;
    }

    /** Get auth token from every known location */
    function getToken() {
        try {
            return window.__PARENT_SESSION__?.token ||
                window.AUTH_SESSION?.token ||
                window._authToken ||
                localStorage.getItem('authToken') ||
                localStorage.getItem('auth_token') ||
                localStorage.getItem('token') ||
                localStorage.getItem('accessToken') ||
                localStorage.getItem('USER_TOKEN') ||
                localStorage.getItem('moodchat_token') ||
                sessionStorage.getItem('authToken') ||
                sessionStorage.getItem('auth_token') ||
                sessionStorage.getItem('token') ||
                window.KynectaStore?.get?.('auth.token') ||
                null;
        } catch (_) { return null; }
    }

    /** Minimal authenticated fetch wrapper — mirrors secureApiCall but works standalone */
    async function apiFetch(path, opts = {}) {
        const token = getToken();
        // FIX: resolve against backend origin — not the iframe's own origin
        const base = (
            window.__apiBaseUrl ||
            (window.parent && window.parent.__apiBaseUrl) ||
            (typeof window.__getApiBase === 'function' ? window.__getApiBase() : null) ||
            (window.parent && typeof window.parent.__getApiBase === 'function' ? window.parent.__getApiBase() : null) ||
            window.__API_BASE_URL || window.API_BASE_URL ||
            'https://moodchat-fy56.onrender.com/api'
        );
        // base ends in /api — strip leading /api from path to avoid double
        const cleanPath = path.replace(/^\/api\//, '/').replace(/^\/api$/, '/');
        const url = base.replace(/\/$/, '') + (cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath);
        const res   = await fetch(url, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(opts.headers || {}),
            },
            body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
        });
        const data  = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
        return data;
    }

    /** Show a lightweight toast notification */
    function toast(msg, type = 'success') {
        try {
            if (typeof showNotification === 'function') { showNotification(msg, type); return; }
        } catch (_) {}
        const n = document.createElement('div');
        n.textContent = msg;
        n.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
            background:${type === 'error' ? '#e53935' : '#43a047'};color:#fff;
            padding:10px 22px;border-radius:8px;font-size:14px;z-index:99999;
            box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;`;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 3200);
    }

    /* ─── Tab switcher factory ─────────────────────────────────────────────── */
    /**
     * @param {string} tabBtnSel   CSS selector for the tab buttons (inside container)
     * @param {Object} tabMap      { [data-tab value]: elementId }
     * @param {string} activeCls   class to add on the active tab-button
     * @param {Function} [onChange] optional callback(tabKey) on switch
     */
    function wireTabSwitcher(tabBtnSel, tabMap, activeCls, onChange) {
        qsa(tabBtnSel).forEach(btn => {
            const fresh = freshClone(btn);
            fresh.addEventListener('click', () => {
                // Deactivate all
                qsa(tabBtnSel).forEach(b => b.classList.remove(activeCls));
                Object.values(tabMap).forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.remove('active');
                });
                // Activate clicked
                const key = fresh.dataset.tab || fresh.dataset.section;
                const targetId = tabMap[key];
                fresh.classList.add(activeCls);
                if (targetId) {
                    const target = document.getElementById(targetId);
                    if (target) target.classList.add('active');
                }
                if (onChange) onChange(key, fresh);
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FIX 1 — Quick-action buttons: Discover / Invites / Events
       ═══════════════════════════════════════════════════════════════════════ */
    function patchQuickActionButtons() {
        /* --- Discover --- */
        const discBtn = freshClone(qs('#discoverGroupsBtn'));
        if (discBtn) {
            discBtn.addEventListener('click', () => {
                // group.html has a dedicated #discoverPanel sheet
                const panel = qs('#discoverPanel');
                if (panel) {
                    panel.style.display = 'flex';
                    loadDiscoverPanel();
                } else {
                    const modal = qs('#discoverGroupsModal') || qs('[id*="discover"][id*="modal"]');
                    if (modal) { modal.classList.add('active'); modal.style.display = 'flex'; }
                    loadDiscoverGroups('inline');
                }
            });
        }

        /* --- Invites --- */
        const invBtn = freshClone(qs('#groupInvitesBtn'));
        if (invBtn) {
            invBtn.addEventListener('click', () => {
                // group.html has a dedicated #invitePanel sheet
                const panel = qs('#invitePanel');
                if (panel) {
                    panel.style.display = 'flex';
                    loadInvitePanel('received');
                } else {
                    qsa('.category-btn').forEach(b => b.classList.remove('active'));
                    const invTab = qs('#invitesTab'); if (invTab) invTab.classList.add('active');
                    qsa('.groups-section').forEach(s => s.classList.remove('active'));
                    const invSec = qs('#invitesSection'); if (invSec) invSec.classList.add('active');
                    loadUserInvitations();
                }
            });
        }

        /* --- Events --- */
        const evtBtn = freshClone(qs('#groupEventsBtn'));
        if (evtBtn) {
            evtBtn.addEventListener('click', () => {
                // group.html has a dedicated #eventsPanel sheet
                const panel = qs('#eventsPanel');
                if (panel) {
                    panel.style.display = 'flex';
                    loadGroupEventsPanel();
                } else {
                    const modal = qs('#groupEventsModal') || qs('[id*="events"][id*="modal"]');
                    if (modal) { modal.classList.add('active'); modal.style.display = 'flex'; }
                    loadGroupEvents('inline');
                }
            });
        }
    }

    /* ─── Discover loader ────────────────────────────────────────────────── */
    async function loadDiscoverGroups(mode) {
        const listEl = qs('#discoverGroupsList') || qs('#allGroupsList');
        if (!listEl) return;
        listEl.innerHTML = '<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading public groups…</div>';
        try {
            const data = await apiFetch('/groups?isPublic=true&limit=30');
            const groups = data?.data?.groups || data?.data || data?.groups || [];
            if (!groups.length) {
                listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary)">No public groups found</div>';
                return;
            }
            listEl.innerHTML = '';
            groups.forEach(g => {
                const card = document.createElement('div');
                card.className = 'group-item';
                card.style.cursor = 'pointer';
                const initials = (g.name || 'G').slice(0, 2).toUpperCase();
                card.innerHTML = `
                    <div class="group-avatar" style="background:linear-gradient(135deg,#667eea,#764ba2)">
                        <span>${initials}</span>
                    </div>
                    <div class="group-info">
                        <div class="group-name"><span class="group-name-text">${g.name || 'Unnamed'}</span></div>
                        <div class="group-details">
                            <span class="member-count"><i class="fas fa-users"></i> ${g.memberCount || g.stats?.totalMembers || 0}</span>
                            ${g.purpose ? `<span class="group-purpose-tag">${g.purpose}</span>` : ''}
                        </div>
                        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${(g.description || '').slice(0, 80)}${(g.description || '').length > 80 ? '…' : ''}</div>
                    </div>
                    <div class="group-actions">
                        <button class="group-action-btn" data-action="join" data-id="${g.id}" title="Join Group">
                            <i class="fas fa-user-plus"></i>
                        </button>
                    </div>`;
                card.querySelector('[data-action="join"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        await apiFetch(`/groups/${g.id}/join`, { method: 'POST' });
                        toast('Join request sent!');
                        e.currentTarget.innerHTML = '<i class="fas fa-check"></i>';
                        e.currentTarget.disabled = true;
                    } catch (err) { toast(err.message || 'Could not join', 'error'); }
                });
                listEl.appendChild(card);
            });

            // Wire discover-filter buttons
            qsa('.discover-filter').forEach(fb => {
                const f = freshClone(fb);
                f.addEventListener('click', () => {
                    qsa('.discover-filter').forEach(x => {
                        x.style.background = 'none';
                        x.style.color = 'var(--text-primary)';
                        x.style.border = '1px solid var(--border-color)';
                    });
                    f.style.background = 'var(--primary-color,#6c63ff)';
                    f.style.color = '#fff';
                    f.style.border = 'none';
                    const purpose = f.dataset.purpose;
                    const items = listEl.querySelectorAll('.group-item');
                    items.forEach(item => {
                        const purposeTag = item.querySelector('.group-purpose-tag');
                        const match = purpose === 'all' || (purposeTag && purposeTag.textContent.toLowerCase().includes(purpose));
                        item.style.display = match ? '' : 'none';
                    });
                });
            });
        } catch (err) {
            listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-secondary)">
                <i class="fas fa-exclamation-triangle"></i><p>${err.message || 'Failed to load groups'}</p></div>`;
        }
    }

    /* ─── User invitations loader ─────────────────────────────────────────── */
    async function loadUserInvitations() {
        const listEl = qs('#invitesList');
        if (!listEl) return;
        listEl.innerHTML = '<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading invitations…</div>';
        try {
            const data = await apiFetch('/group-members/invitations?status=pending');
            const invites = data?.data?.invitations || data?.data || data?.invitations || [];
            if (!invites.length) {
                listEl.innerHTML = `<div class="empty-state"><i class="fas fa-envelope"></i><p>No pending invitations</p></div>`;
                return;
            }
            listEl.innerHTML = '';
            invites.forEach(inv => {
                const groupName = inv.group?.name || inv.groupName || 'Unknown Group';
                const senderName = inv.inviter?.username || inv.inviterName || 'Someone';
                const card = document.createElement('div');
                card.className = 'group-item';
                card.innerHTML = `
                    <div class="group-avatar" style="background:linear-gradient(135deg,#667eea,#764ba2)">
                        <span>${groupName.slice(0,2).toUpperCase()}</span>
                    </div>
                    <div class="group-info">
                        <div class="group-name">${groupName}</div>
                        <div style="font-size:12px;color:var(--text-secondary)">Invited by ${senderName}</div>
                    </div>
                    <div class="group-actions">
                        <button class="group-action-btn success" data-action="accept" data-id="${inv.id}" title="Accept">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="group-action-btn danger" data-action="reject" data-id="${inv.id}" title="Decline">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>`;
                card.querySelector('[data-action="accept"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        await apiFetch(`/group-members/invitations/${inv.id}/accept`, { method: 'POST' });
                        toast('Invitation accepted!');
                        card.remove();
                        // Update badge
                        updateInvitesBadge(-1);
                    } catch (err) { toast(err.message || 'Failed', 'error'); }
                });
                card.querySelector('[data-action="reject"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        await apiFetch(`/group-members/invitations/${inv.id}/reject`, { method: 'POST' });
                        toast('Invitation declined');
                        card.remove();
                        updateInvitesBadge(-1);
                    } catch (err) { toast(err.message || 'Failed', 'error'); }
                });
                listEl.appendChild(card);
            });
            // Update badge count
            const badge = qs('#invitesCount');
            if (badge) badge.textContent = invites.length;
        } catch (err) {
            listEl.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${err.message || 'Failed to load'}</p></div>`;
        }
    }

    function updateInvitesBadge(delta) {
        const badge = qs('#invitesCount');
        if (!badge) return;
        const current = parseInt(badge.textContent || '0', 10);
        badge.textContent = Math.max(0, current + delta);
    }

    /* ─── Group events loader ─────────────────────────────────────────────── */
    async function loadGroupEvents(mode) {
        const listEl = qs('#eventsListContent') || qs('#eventsList') || qs('#groupEventsContent');
        if (!listEl) return;
        listEl.innerHTML = '<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading events…</div>';
        try {
            const data = await apiFetch('/groups/events?upcoming=true&limit=20');
            const events = data?.data?.events || data?.data || data?.events || [];
            if (!events.length) {
                listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary)">No upcoming events</div>';
                return;
            }
            listEl.innerHTML = '';
            events.forEach(ev => {
                const evDate = ev.date || ev.startDate || ev.scheduledAt;
                const card = document.createElement('div');
                card.style.cssText = 'padding:12px;border-bottom:1px solid var(--border-color);';
                card.innerHTML = `
                    <div style="font-weight:600">${ev.title || 'Event'}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                        ${evDate ? new Date(evDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : 'Date TBD'}
                        ${ev.groupName ? ` · ${ev.groupName}` : ''}
                    </div>
                    ${ev.description ? `<div style="font-size:13px;margin-top:6px">${ev.description.slice(0,100)}</div>` : ''}`;
                listEl.appendChild(card);
            });
        } catch (err) {
            listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-secondary)">${err.message || 'Failed to load events'}</div>`;
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FIX 2 + 3 + 4 + 5 + 6 — Create Group Modal
       ═══════════════════════════════════════════════════════════════════════ */
    /* FIX: Use event delegation on document instead of cloneNode.
     * cloneNode on tab buttons fails because:
     *  a) This plain <script> runs BEFORE type="module" scripts finish
     *  b) Other patches also clone the same nodes, wiping listeners
     * Event delegation in capture phase is immune to both. */
    const CREATE_TAB_MAP = {
        basic   : 'basicTab',
        settings: 'settingsTab',
        purpose : 'purposeTab',
        theme   : 'themeTab',
        members : 'membersTab',
    };

    // Tab switching — capture phase so it fires before any other handler
    document.addEventListener('click', function _tabDelegate(e) {
        const tab = e.target.closest('.create-group-tab');
        if (!tab) return;
        const modal = tab.closest('#createGroupModal');
        if (!modal) return;
        e.stopPropagation();
        qsa('.create-group-tab', modal).forEach(b => b.classList.remove('active'));
        qsa('.create-group-tab-content', modal).forEach(s => s.classList.remove('active'));
        Object.values(CREATE_TAB_MAP).forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
        tab.classList.add('active');
        const key = tab.dataset.tab || '';
        const panel = document.getElementById(CREATE_TAB_MAP[key]);
        if (panel) panel.classList.add('active');
        if (key === 'members') loadFriendsForMembersTab();
    }, true);

    // Cancel / Close delegation
    document.addEventListener('click', function _cancelDelegate(e) {
        if (e.target.closest('#cancelCreateGroupBtn') || e.target.closest('#closeCreateGroupModal')) {
            const m = document.getElementById('createGroupModal');
            if (m && (m.classList.contains('active') || m.style.display === 'flex')) closeCreateGroupModal();
        }
    });

    // Backdrop click
    document.addEventListener('click', function _backdropDelegate(e) {
        const m = document.getElementById('createGroupModal');
        if (m && e.target === m) closeCreateGroupModal();
    });

    // Create button delegation
    let _patchSubmitting = false;
    document.addEventListener('click', function _submitDelegate(e) {
        if (!e.target.closest('#createGroupBtnModal')) return;
        if (_patchSubmitting) return;
        _patchSubmitting = true;
        handleCreateGroupSubmit().finally(() => { _patchSubmitting = false; });
    });

    // Mood option selection delegation
    document.addEventListener('click', function _moodDelegate(e) {
        const mood = e.target.closest('.mood-option');
        if (!mood || !mood.closest('#createGroupModal')) return;
        qsa('.mood-option', document.getElementById('createGroupModal')).forEach(m => m.classList.remove('selected'));
        mood.classList.add('selected');
    });

    // Theme option selection delegation
    document.addEventListener('click', function _themeDelegate(e) {
        const theme = e.target.closest('.theme-option');
        if (!theme || !theme.closest('#createGroupModal')) return;
        qsa('.theme-option', document.getElementById('createGroupModal')).forEach(t => { t.style.border = '2px solid var(--border-color)'; t.querySelector('.fas')&&(t.querySelector('.fas').style.display='none'); });
        theme.style.border = '3px solid #fff';
        const check = theme.querySelector('.fas'); if (check) check.style.display = '';
    });

    // Events panel tab switching
    document.addEventListener('click', function _evtTabDelegate(e) {
        const tab = e.target.closest('.evt-tab');
        if (!tab) return;
        qsa('.evt-tab').forEach(t => { t.style.background='var(--bg-tertiary,#252537)'; t.style.color='var(--text-secondary)'; });
        tab.style.background = 'var(--primary-color,#6c63ff)'; tab.style.color = '#fff';
        const key = tab.dataset.etab;
        if (key === 'upcoming' || key === 'past') loadGroupEventsPanel(key);
        else if (key === 'create') showCreateEventForm();
    });

    // Invite panel tab switching
    document.addEventListener('click', function _invTabDelegate(e) {
        const tab = e.target.closest('.inv-tab');
        if (!tab) return;
        qsa('.inv-tab').forEach(t => { t.style.background='var(--bg-tertiary,#252537)'; t.style.color='var(--text-secondary)'; });
        tab.style.background = 'var(--primary-color,#6c63ff)'; tab.style.color = '#fff';
        loadInvitePanel(tab.dataset.invtab);
    });

    function patchCreateGroupModal() {
        // FIX: createGroupBtn must open the modal on EVERY click, not just the first.
        // group-ui.js registers the handler via registerUIEventListener but the lifecycle
        // guard (_protocolReady && _parentReadyReceived) can block setupEventListeners()
        // when running standalone/iframe.  We use capture-phase delegation so this always fires.
        if (!window.__cgBtnDelegated) {
            window.__cgBtnDelegated = true;
            document.addEventListener('click', function(e) {
                if (!e.target.closest('#createGroupBtn')) return;
                e.stopImmediatePropagation();
                const modal = document.getElementById('createGroupModal');
                if (!modal) return;
                // Force-show every single time regardless of current state
                modal.style.display = 'flex';
                modal.classList.add('active');
                // Reset to Basic tab for a fresh feel
                qsa('.create-group-tab', modal).forEach((t, i) => t.classList.toggle('active', i === 0));
                qsa('.create-group-tab-content', modal).forEach((s, i) => s.classList.toggle('active', i === 0));
            }, true); // capture = true fires before any bubbling handler
        }
    }

    function closeCreateGroupModal() {
        const modal = qs('#createGroupModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
        // Reset all form fields
        qsa('input[type="text"], textarea', modal).forEach(f => f.value = '');
        qsa('input[type="checkbox"]', modal).forEach(f => f.checked = f.defaultChecked);
        qsa('select', modal).forEach(f => f.selectedIndex = 0);
        // Reset to first tab
        qsa('.create-group-tab', modal).forEach((b, i) => b.classList.toggle('active', i === 0));
        qsa('.create-group-tab-content', modal).forEach((s, i) => s.classList.toggle('active', i === 0));
        // Clear friends selection
        qsa('.friend-pick-item.selected', modal).forEach(el => el.classList.remove('selected'));
        window.__pendingGroupInvites = [];
    }

    /* FIX 3 + 4 — Friends list for Members tab */
    async function loadFriendsForMembersTab() {
        const listEl = qs('#friendsPickerList') || qs('#friendSelectionContent');
        if (!listEl) return;
        if (listEl._loaded && listEl._friends?.length) { renderPickerFriends(listEl, listEl._friends); return; }
        listEl.innerHTML = '<div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i> Loading friends…</div>';
        let friends = [];
        try {
            // Prefer GroupCore cache
            if (window.GroupCore?.friends?.length) {
                friends = window.GroupCore.friends;
            } else if (window.__friendsList?.length) {
                friends = window.__friendsList;
            } else {
                const data = await apiFetch('/friends');
                const raw = data?.data?.friends || data?.data || data?.friends || [];
                friends = raw.map(f => ({
                    id         : String(f.id || f.userId || ''),
                    name       : f.displayName || [f.firstName, f.lastName].filter(Boolean).join(' ') || f.username || 'Unknown',
                    username   : f.username || '',
                    avatar     : f.avatar || f.photoURL || null,
                    online     : f.status === 'online' || f.isOnline === true,
                    // FIX 4: privacy policy
                    invitePolicy: f.privacy?.allowGroupAdds ?? f.groupAddPolicy ?? 'everyone',
                })).filter(f => f.id);
            }
        } catch (err) {
            listEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-secondary)">
                <i class="fas fa-exclamation-triangle"></i><p>${err.message}</p></div>`;
            return;
        }
        listEl._friends = friends;
        listEl._loaded  = true;
        renderPickerFriends(listEl, friends);
    }

    function renderPickerFriends(listEl, friends) {
        listEl.innerHTML = '';
        if (!friends.length) {
            listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-secondary)">
                <i class="fas fa-user-friends" style="font-size:28px;opacity:.4"></i>
                <p style="margin:10px 0 4px;font-weight:500">No friends found</p>
                <p style="font-size:12px;opacity:.7">Add friends first to invite them</p></div>`;
            return;
        }
        if (!window.__pendingGroupInvites) window.__pendingGroupInvites = [];
        friends.forEach(f => {
            const restricted = f.invitePolicy === 'nobody' || f.invitePolicy === 'restricted';
            const item = document.createElement('div');
            item.className = 'friend-pick-item';
            item.dataset.friendId = f.id;
            item.style.cssText = `display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;
                cursor:${restricted ? 'default' : 'pointer'};opacity:${restricted ? '.55' : '1'};
                border-bottom:1px solid var(--border-color);transition:background .15s`;
            const initials = f.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            item.innerHTML = `
                <div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;
                    background:${f.avatar ? `url('${f.avatar}') center/cover` : 'linear-gradient(135deg,#667eea,#764ba2)'};
                    display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px">
                    ${f.avatar ? '' : initials}
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
                    <div style="font-size:11px;color:var(--text-secondary)">${f.username ? '@' + f.username : ''}
                        ${f.online ? '<span style="color:#43a047"> ● Online</span>' : ''}
                        ${restricted ? ' <span style="font-size:10px;background:#f0f0f0;padding:1px 6px;border-radius:10px;color:#888">🔒 Invite required</span>' : ''}</div>
                </div>
                <div class="pick-check" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--border-color);
                    display:flex;align-items:center;justify-content:center;font-size:13px"></div>`;
            if (!restricted) {
                item.addEventListener('click', () => {
                    const sel = item.classList.toggle('selected');
                    item.style.background = sel ? 'rgba(102,126,234,.1)' : '';
                    const check = item.querySelector('.pick-check');
                    check.style.background = sel ? '#667eea' : '';
                    check.style.borderColor = sel ? '#667eea' : 'var(--border-color)';
                    check.textContent = sel ? '✓' : '';
                    if (sel) {
                        if (!window.__pendingGroupInvites.includes(f.id)) window.__pendingGroupInvites.push(f.id);
                    } else {
                        window.__pendingGroupInvites = window.__pendingGroupInvites.filter(id => id !== f.id);
                    }
                    // Update Members tab badge
                    const tab = qs('.create-group-tab[data-tab="members"]');
                    if (tab) {
                        const n = window.__pendingGroupInvites.length;
                        tab.textContent = `Members${n ? ` (${n})` : ''}`;
                    }
                });
            }
            listEl.appendChild(item);
        });

        // Wire search
        const searchInput = qs('#memberSearchInput') || qs('[id*="memberSearch"]');
        if (searchInput) {
            const freshSearch = freshClone(searchInput);
            freshSearch.addEventListener('input', () => {
                const q = freshSearch.value.toLowerCase();
                qsa('.friend-pick-item', listEl).forEach(item => {
                    const name = item.querySelector('div[style*="font-weight:500"]')?.textContent?.toLowerCase() || '';
                    item.style.display = name.includes(q) ? '' : 'none';
                });
            });
        }
    }

    /* FIX 6 — Create Group submit handler */
    async function handleCreateGroupSubmit() {
        const modal      = qs('#createGroupModal');
        const nameInput  = qs('#groupNameInput', modal);
        const descInput  = qs('#groupDescriptionInput', modal);
        const typeSelect = qs('#groupTypeSelect', modal);
        const purposeSel = qs('#groupPurposeSelect', modal);
        const moodSel    = qs('.mood-option.selected', modal);
        const postRule   = qs('#postingRulesSelect', modal);
        const themeSelected = qs('.theme-option.selected', modal);
        const welcomeMsg = qs('#welcomeMessageInput', modal);
        const groupRules = qs('#groupRulesInput', modal);
        const approveChk = qs('#approveNewMembers', modal);
        const adminPost  = qs('#onlyAdminsCanPost', modal);
        const allowMedia = qs('#allowMediaSharing', modal);
        const topicInput = qs('#groupTopicInput', modal);

        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) { toast('Group name is required', 'error'); if (nameInput) nameInput.focus(); return; }

        const groupData = {
            name,
            description    : descInput  ? descInput.value.trim()  : '',
            privacy        : typeSelect ? typeSelect.value        : 'private',
            purpose        : purposeSel ? purposeSel.value        : '',
            mood           : moodSel    ? (moodSel.dataset.mood || '') : '',
            postingRule    : postRule   ? postRule.value          : 'everyone',
            theme          : themeSelected ? (themeSelected.dataset.theme || 'blue') : 'blue',
            topic          : topicInput ? topicInput.value.trim() : '',
            welcomeMessage : welcomeMsg ? welcomeMsg.value.trim() : '',
            rules          : groupRules ? groupRules.value.trim() : '',
            settings: {
                requireAdminApproval: approveChk ? approveChk.checked : false,
                onlyAdminsCanPost   : adminPost  ? adminPost.checked  : false,
                allowMedia          : allowMedia ? allowMedia.checked : true,
            },
            memberIds      : window.__pendingGroupInvites ? window.__pendingGroupInvites.slice() : [],
        };

        const submitBtn = qs('#createGroupBtnModal');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating…'; }

        try {
            let result;
            const GC = window.GroupCore;
            if (GC && typeof GC.createGroup === 'function') {
                result = await GC.createGroup(groupData);
                // Handle queued (offline / session not ready) — still success
                if (result && result.queued) {
                    toast('Group queued — will create when connected', 'info');
                    closeCreateGroupModal();
                    return;
                }
                if (result && result.success === false) {
                    throw new Error(result.error || result.message || 'Failed to create group');
                }
            } else if (typeof createGroupOnline === 'function') {
                result = await createGroupOnline(groupData);
            } else {
                // Direct API fallback — GroupCore module not yet loaded
                result = await apiFetch('/groups', { method: 'POST', body: groupData });
            }
            toast(`Group "${groupData.name}" created!`);
            closeCreateGroupModal();
            window.__pendingGroupInvites = [];

            // Refresh group list
            try {
                if (typeof updateGroupCounts   === 'function') updateGroupCounts();
                if (typeof updateCurrentSection === 'function') updateCurrentSection();
                if (GC && GC.requestGroupList) GC.requestGroupList().catch(() => {});
            } catch (_) {}
        } catch (err) {
            toast(err.message || 'Failed to create group', 'error');
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Group'; }
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FIX 7 — Admin Management Modal
       Adds Theme tab, wires all tab switches, loads members, saves settings
       ═══════════════════════════════════════════════════════════════════════ */
    function patchAdminManagementModal() {
        const modal = qs('#adminManagementModal');
        if (!modal) return;

        /* Ensure Theme tab exists */
        const tabsContainer = qs('.admin-management-tabs', modal);
        if (tabsContainer && !qs('[data-tab="theme"]', tabsContainer)) {
            const themeTab = document.createElement('button');
            themeTab.className = 'admin-management-tab';
            themeTab.dataset.tab = 'theme';
            themeTab.textContent = 'Theme';
            tabsContainer.appendChild(themeTab);
        }

        /* Ensure Theme tab content panel exists */
        const contentArea = qs('.admin-management-content', modal);
        if (contentArea && !qs('#adminThemeTab', contentArea)) {
            const themePanel = document.createElement('div');
            themePanel.className = 'admin-management-section';
            themePanel.id = 'adminThemeTab';
            themePanel.innerHTML = `
                <div style="padding:16px">
                    <h4 style="margin:0 0 16px">Group Theme</h4>
                    <div style="display:flex;flex-wrap:wrap;gap:12px" id="adminThemeGrid">
                        ${[
                            ['blue',   'linear-gradient(135deg,#667eea,#764ba2)',  'Blue'],
                            ['green',  'linear-gradient(135deg,#11998e,#38ef7d)',  'Green'],
                            ['red',    'linear-gradient(135deg,#ff416c,#ff4b2b)',  'Red'],
                            ['purple', 'linear-gradient(135deg,#8a2387,#f27121)',  'Purple'],
                            ['dark',   'linear-gradient(135deg,#0f2027,#2c5364)', 'Dark'],
                        ].map(([key, grad, label]) => `
                            <div class="admin-theme-btn" data-theme="${key}"
                                style="width:64px;height:64px;border-radius:12px;background:${grad};
                                cursor:pointer;display:flex;align-items:flex-end;justify-content:center;
                                padding-bottom:6px;font-size:11px;color:#fff;font-weight:600;
                                border:3px solid transparent;box-sizing:border-box">${label}</div>`
                        ).join('')}
                    </div>
                </div>`;
            contentArea.appendChild(themePanel);
        }

        /* Tab map: data-tab → element id */
        const ADMIN_TAB_MAP = {
            members     : 'adminMembersTab',
            settings    : 'adminSettingsTab',
            purpose     : 'adminPurposeTab',
            analytics   : 'adminAnalyticsTab',
            transparency: 'adminTransparencyTab',
            theme       : 'adminThemeTab',
        };

        /* Wire admin tabs */
        qsa('.admin-management-tab', modal).forEach(btn => {
            const fresh = freshClone(btn);
            fresh.addEventListener('click', () => {
                qsa('.admin-management-tab', modal).forEach(b => b.classList.remove('active'));
                qsa('.admin-management-section', modal).forEach(s => s.classList.remove('active'));
                fresh.classList.add('active');
                const key = fresh.dataset.tab;
                const targetId = ADMIN_TAB_MAP[key];
                if (targetId) {
                    const target = document.getElementById(targetId);
                    if (target) target.classList.add('active');
                }
                // Load members on switch to Members tab
                if (key === 'members') loadMembersForAdminModal();
            });
        });

        /* Theme grid click — select and save */
        qsa('.admin-theme-btn', modal).forEach(tb => {
            tb.addEventListener('click', () => {
                qsa('.admin-theme-btn', modal).forEach(x => x.style.borderColor = 'transparent');
                tb.style.borderColor = '#fff';
                tb.style.boxShadow   = '0 0 0 2px #667eea';
                window.__adminSelectedTheme = tb.dataset.theme;
            });
        });

        /* Save settings button */
        const saveBtn = freshClone(qs('#adminSaveSettingsBtn', modal) || qs('[id*="saveSettings"]', modal));
        if (saveBtn) {
            saveBtn.addEventListener('click', () => saveAdminSettings(window.__currentAdminGroup));
        }

        /* Close modal */
        const closeBtn = freshClone(qs('#adminManagementClose', modal) || qs('.admin-management-header button', modal));
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
                modal.style.display = 'none';
            });
        }
    }

    /* ─── Load members into the admin modal ─────────────────────────────── */
    async function loadMembersForAdminModal() {
        const listEl  = qs('#memberManagementList');
        const groupId = window.__currentAdminGroup?.id;
        if (!listEl) return;
        if (!groupId) { listEl.innerHTML = '<div style="padding:16px;color:var(--text-secondary)">No group selected</div>'; return; }
        listEl.innerHTML = '<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            // Try the group-members endpoint first (correct route)
            let members = [];
            try {
                const data = await apiFetch(`/group-members/${groupId}/members`);
                members = data?.data?.members || data?.data || data?.members || [];
            } catch (_) {
                // Fallback: groups endpoint
                const data = await apiFetch(`/groups/${groupId}/members`);
                members = data?.data?.members || data?.data || data?.members || [];
            }
            if (!members.length) {
                listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary)">No members found</div>';
                return;
            }
            listEl.innerHTML = '';
            members.forEach(m => {
                const name = m.user?.username || m.displayName || m.username || `User ${m.userId}`;
                const role = m.role || 'member';
                const isOwner = role === 'owner' || m.isCreator;
                const item = document.createElement('div');
                item.className = 'member-management-item';
                item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-color)';
                item.innerHTML = `
                    <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);
                        display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;flex-shrink:0">
                        ${name.slice(0,2).toUpperCase()}
                    </div>
                    <div style="flex:1">
                        <div style="font-weight:500">${name}</div>
                        <div style="font-size:12px;color:var(--text-secondary)">${role}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        ${!isOwner ? `
                        <button class="member-action-btn ${role === 'admin' ? 'demote' : 'promote'}"
                            data-id="${m.userId || m.id}" data-action="${role === 'admin' ? 'demote' : 'promote'}"
                            style="padding:4px 10px;border-radius:6px;border:1px solid var(--border-color);
                                background:none;cursor:pointer;font-size:12px">
                            ${role === 'admin' ? 'Demote' : 'Promote'}
                        </button>
                        <button class="member-action-btn remove"
                            data-id="${m.userId || m.id}" data-action="remove"
                            style="padding:4px 10px;border-radius:6px;border:none;
                                background:#ffebee;color:#e53935;cursor:pointer;font-size:12px">
                            Remove
                        </button>` : '<span style="font-size:11px;color:var(--text-secondary)">Owner</span>'}
                    </div>`;
                // Action handlers
                item.querySelectorAll('.member-action-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const memberId = btn.dataset.id;
                        const action   = btn.dataset.action;
                        try {
                            if (action === 'promote' || action === 'demote') {
                                const newRole = action === 'promote' ? 'admin' : 'member';
                                // Try PATCH first (alias), then PUT
                                try {
                                    await apiFetch(`/group-members/${groupId}/members/${memberId}/role`, { method: 'PATCH', body: { role: newRole } });
                                } catch (_) {
                                    await apiFetch(`/group-members/${groupId}/members/${memberId}/role`, { method: 'PUT', body: { role: newRole } });
                                }
                                toast(`Member ${action}d to ${newRole}`);
                            } else if (action === 'remove') {
                                if (!confirm('Remove this member from the group?')) return;
                                await apiFetch(`/group-members/${groupId}/members/${memberId}`, { method: 'DELETE' });
                                toast('Member removed');
                            }
                            // Reload list
                            setTimeout(loadMembersForAdminModal, 400);
                        } catch (err) { toast(err.message || 'Action failed', 'error'); }
                    });
                });
                listEl.appendChild(item);
            });
        } catch (err) {
            listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-secondary)">${err.message || 'Failed to load members'}</div>`;
        }
    }

    /* ─── Save admin settings ────────────────────────────────────────────── */
    async function saveAdminSettings(groupData) {
        if (!groupData?.id) { toast('No group selected', 'error'); return; }
        const payload = {
            settings: {
                allowMedia       : qs('#adminAllowMedia')?.checked ?? true,
                allowCalls       : true,
                allowReactions   : true,
                allowReplies     : true,
                allowEditing     : true,
                allowDeleting    : true,
                requireAdminApproval: qs('#adminApproveMembers')?.checked ?? false,
                allowInvites     : qs('#adminAllowInvites')?.checked ?? true,
                onlyAdminsCanPost: qs('#adminOnlyAdminsPost')?.checked ?? false,
                disappearingMessages: qs('#adminDisappearingMessages')?.checked ?? false,
            },
            isPublic: qs('#adminPublicGroup')?.checked ?? false,
            purpose : qs('#adminGroupPurpose')?.value || groupData.purpose || '',
            mood    : qs('.mood-select-btn.active')?.dataset?.mood || groupData.mood || '',
        };
        if (window.__adminSelectedTheme) payload.theme = window.__adminSelectedTheme;
        try {
            await apiFetch(`/groups/${groupData.id}`, { method: 'PUT', body: payload });
            toast('Group settings saved!');
            const modal = qs('#adminManagementModal');
            if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
            // Refresh
            try {
                if (window.GroupCore?.requestGroupList) window.GroupCore.requestGroupList().catch(() => {});
            } catch (_) {}
        } catch (err) { toast(err.message || 'Save failed', 'error'); }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FIX 8 — openAdminManagement intercept:
       Set __currentAdminGroup so loadMembersForAdminModal() knows which group
       ═══════════════════════════════════════════════════════════════════════ */
    function patchOpenAdminManagement() {
        // Hook into the event delegation on group-action-btn[data-action="manage"]
        document.addEventListener('click', (e) => {
            const manageBtn = e.target.closest('[data-action="manage"]');
            if (!manageBtn) return;
            const groupItem = manageBtn.closest('[data-group-id]');
            if (!groupItem) return;
            const groupId   = groupItem.dataset.groupId;
            if (!groupId) return;
            // Find group data from GroupCore
            let gData = null;
            try {
                gData = window.GroupCore?.getGroupById?.(parseInt(groupId, 10) || groupId) || null;
            } catch (_) {}
            window.__currentAdminGroup = gData || { id: groupId };
            // Load members immediately when admin modal opens
            setTimeout(loadMembersForAdminModal, 200);
        });

        // Also hook openAdminManagement function if it exists
        if (typeof window.openAdminManagement === 'function') {
            const _orig = window.openAdminManagement;
            window.openAdminManagement = function(groupData) {
                window.__currentAdminGroup = groupData;
                window.__adminSelectedTheme = null;
                setTimeout(loadMembersForAdminModal, 200);
                return _orig.apply(this, arguments);
            };
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FIX 9 — Category tab wiring (allTab, myGroupsTab, joinedTab, etc.)
       These should already work via group-ui.js but we ensure fresh clones
       ═══════════════════════════════════════════════════════════════════════ */
    function patchCategoryTabs() {
        qsa('.category-btn').forEach(btn => {
            const fresh = freshClone(btn);
            fresh.addEventListener('click', () => {
                qsa('.category-btn').forEach(b => b.classList.remove('active'));
                qsa('.groups-section').forEach(s => s.classList.remove('active'));
                fresh.classList.add('active');
                // Map button ID to section ID
                const sectionMap = {
                    allTab       : 'allGroupsSection',
                    myGroupsTab  : 'myGroupsSection',
                    joinedTab    : 'joinedSection',
                    invitesTab   : 'invitesSection',
                    adminTab     : 'adminSection',
                };
                const sectionId = sectionMap[fresh.id] || (fresh.id.replace('Tab', 'Section'));
                const section   = document.getElementById(sectionId);
                if (section) {
                    section.classList.add('active');
                    // Trigger re-render
                    try {
                        if (typeof updateCurrentSection === 'function') updateCurrentSection();
                    } catch (_) {}
                    // Load invitations when switching to Invites tab
                    if (fresh.id === 'invitesTab') loadUserInvitations();
                }
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       Boot — run all patches in order
       ═══════════════════════════════════════════════════════════════════════ */
    function boot() {
        try { patchQuickActionButtons();      } catch (e) { console.warn('[patch] quickActions:', e); }
        try { patchCreateGroupModal();         } catch (e) { console.warn('[patch] createGroupModal:', e); }
        try { patchAdminManagementModal();     } catch (e) { console.warn('[patch] adminModal:', e); }
        try { patchOpenAdminManagement();      } catch (e) { console.warn('[patch] openAdminMgmt:', e); }
        try { patchCategoryTabs();             } catch (e) { console.warn('[patch] categoryTabs:', e); }
        // Wire GroupCore real-time events → UI (retry until GroupCore exists)
        wireGroupCoreEvents();
        // (log suppressed)
    }

    /* ─── Discover panel loader (targets #discoverPanel in group.html) ─────── */
    /* ─── Discover panel loader — two sub-sections: My Groups / Others ─────── */
    let _discoverCurrentTab = 'mine';

    async function loadDiscoverPanel() {
        const panel = qs('#discoverPanel');
        const resultsEl = qs('#discoverResults');
        if (!resultsEl) { loadDiscoverGroups(); return; }

        // Inject sub-section toggle tabs once
        if (!qs('#_discoverTabWrap')) {
            const wrap = document.createElement('div');
            wrap.id = '_discoverTabWrap';
            wrap.style.cssText = 'display:flex;gap:8px;padding:0 20px 12px;flex-shrink:0;';
            wrap.innerHTML =
                '<button id="_discMine" style="flex:1;padding:8px 14px;border-radius:10px;border:none;cursor:pointer;' +
                'font-weight:700;font-size:13px;background:var(--primary-color,#6c63ff);color:#fff;">👤 My Groups</button>' +
                '<button id="_discOthers" style="flex:1;padding:8px 14px;border-radius:10px;border:none;cursor:pointer;' +
                'font-weight:700;font-size:13px;background:var(--bg-tertiary,#2a2a3e);color:var(--text-secondary);">🌐 Discover Others</button>';
            resultsEl.parentNode.insertBefore(wrap, resultsEl);

            qs('#_discMine').addEventListener('click', () => _discoverSetTab('mine', resultsEl));
            qs('#_discOthers').addEventListener('click', () => _discoverSetTab('others', resultsEl));
        }

        // Wire search input
        const searchInput = qs('#discoverSearchInput');
        if (searchInput && !searchInput._patched) {
            searchInput._patched = true;
            let _timer;
            searchInput.addEventListener('input', () => {
                clearTimeout(_timer);
                _timer = setTimeout(() => _discoverSetTab(_discoverCurrentTab, resultsEl), 350);
            });
        }

        _discoverSetTab('mine', resultsEl);
    }

    function _discoverSetTab(tab, resultsEl) {
        _discoverCurrentTab = tab;
        const mine   = qs('#_discMine');
        const others = qs('#_discOthers');
        if (mine && others) {
            if (tab === 'mine') {
                mine.style.background   = 'var(--primary-color,#6c63ff)'; mine.style.color = '#fff';
                others.style.background = 'var(--bg-tertiary,#2a2a3e)';  others.style.color = 'var(--text-secondary)';
            } else {
                others.style.background = 'var(--primary-color,#6c63ff)'; others.style.color = '#fff';
                mine.style.background   = 'var(--bg-tertiary,#2a2a3e)';   mine.style.color = 'var(--text-secondary)';
            }
        }
        if (tab === 'mine') _renderMyGroups(resultsEl);
        else _doDiscoverSearch((qs('#discoverSearchInput') || {}).value || '', resultsEl);
    }

    async function _renderMyGroups(resultsEl) {
        resultsEl.innerHTML = '<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i></div>';
        const gc  = window.GroupCore;
        const uid = _myUserId();
        let myGroups = [];
        if (gc) {
            const seen = new Set();
            const candidates = [
                ...(gc.myGroups    || []),
                ...(gc.adminGroups || []),
                ...(gc.groups      || []).filter(g => String(g.createdBy) === uid || g.isCreator || g.isAdmin || g.role === 'owner' || g.role === 'admin'),
            ];
            candidates.forEach(g => { const k = String(g.id); if (!seen.has(k)) { seen.add(k); myGroups.push(g); } });
        }
        if (!myGroups.length) {
            try {
                const data = await apiFetch('/groups?myGroups=true&limit=50');
                myGroups = data?.data?.groups || data?.data || data?.groups || [];
            } catch (_) {}
        }
        if (!myGroups.length) {
            resultsEl.innerHTML =
                '<div style="text-align:center;padding:36px 20px;color:var(--text-secondary)">' +
                '<i class="fas fa-users" style="font-size:36px;opacity:.3;display:block;margin-bottom:12px"></i>' +
                '<div style="font-weight:600;margin-bottom:6px">No groups yet</div>' +
                '<div style="font-size:13px">Groups you create or manage appear here</div></div>';
            return;
        }
        _renderDiscoverCards(myGroups, resultsEl, true);
    }

    async function _doDiscoverSearch(q, resultsEl) {
        resultsEl.innerHTML = '<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i></div>';
        const uid     = _myUserId();
        const purpose = (qs('.discover-filter.active') || qs('.discover-filter[data-purpose="all"]'))?.dataset?.purpose || 'all';
        const params  = new URLSearchParams({ limit: '40' });
        if (q) params.set('search', q);
        if (purpose && purpose !== 'all') params.set('purpose', purpose);
        try {
            const data   = await apiFetch('/groups?' + params.toString());
            let groups   = (data.data && (data.data.groups || data.data)) || data.groups || [];
            // Exclude groups the user owns/admins so they appear only in "My Groups"
            if (uid) groups = groups.filter(g => String(g.createdBy) !== uid && !g.isCreator && !g.isAdmin);
            if (!groups.length) {
                resultsEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">No public groups found</div>';
                return;
            }
            _renderDiscoverCards(groups, resultsEl, false);
        } catch(err) {
            resultsEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">' + (err.message||'Failed to load') + '</div>';
        }
    }

    function _renderDiscoverCards(groups, container, isMine) {
        container.innerHTML = '';
        groups.forEach(g => {
            const initials = (g.name || 'G').slice(0,2).toUpperCase();
            const count = g.memberCount || 0;
            const card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-color)';
            const actionBtn = isMine
                ? '<button data-open-gid="' + g.id + '" style="padding:7px 14px;border-radius:8px;border:none;background:#43a047;color:#fff;font-weight:700;cursor:pointer;white-space:nowrap;font-size:13px">▶ Open</button>'
                : '<button data-join-gid="' + g.id + '" style="padding:7px 14px;border-radius:8px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-weight:700;cursor:pointer;white-space:nowrap;font-size:13px">Join</button>';
            card.innerHTML =
                '<div style="width:42px;height:42px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,#667eea,#764ba2);' +
                'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px">' + initials + '</div>' +
                '<div style="flex:1;min-width:0">' +
                '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (g.name||'Unnamed') + '</div>' +
                '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px"><i class="fas fa-users"></i> ' +
                '<span data-member-count>' + count + '</span> member' + (count!==1?'s':'') + (g.purpose ? ' · ' + g.purpose : '') + '</div>' +
                (g.description ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + String(g.description).slice(0,60) + '</div>' : '') +
                '</div>' + actionBtn;

            const openBtn = card.querySelector('[data-open-gid]');
            if (openBtn) {
                openBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const gc   = window.GroupCore;
                    const gData = (gc && gc.getGroupById ? gc.getGroupById(parseInt(g.id)||g.id) : null) || g;
                    const dp = qs('#discoverPanel'); if (dp) dp.style.display = 'none';
                    if (typeof window.__gcOpenPanel === 'function') window.__gcOpenPanel(gData);
                    else try { openGroupChat(gData); } catch(_) {}
                });
            }
            const joinBtn = card.querySelector('[data-join-gid]');
            if (joinBtn) {
                joinBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    joinBtn.disabled = true; joinBtn.textContent = '…';
                    try {
                        await apiFetch('/groups/' + g.id + '/join', { method: 'POST' });
                        // Update member count in this card immediately
                        const countEl = card.querySelector('[data-member-count]');
                        if (countEl) {
                            const newCount = (parseInt(countEl.textContent) || 0) + 1;
                            g.memberCount = newCount;
                            const parentDiv = countEl.parentNode;
                            countEl.textContent = newCount;
                            // also fix the "member/members" suffix
                            parentDiv.innerHTML = '<i class="fas fa-users"></i> <span data-member-count>' + newCount + '</span> member' + (newCount!==1?'s':'') + (g.purpose?' · '+g.purpose:'');
                        }
                        joinBtn.textContent = '✓ Joined'; joinBtn.style.background = '#43a047';
                        toast('Join request sent! You will be added once approved.');
                        const gc2 = window.GroupCore;
                        if (gc2?.requestGroupList) gc2.requestGroupList().catch(()=>{});
                        // Broadcast to parent so other users' panels can refresh
                        try { window.parent.postMessage({ type: 'GROUP_MEMBER_JOINED', groupId: g.id }, '*'); } catch(_) {}
                    } catch(err) {
                        joinBtn.disabled = false; joinBtn.textContent = 'Join';
                        toast(err.message || 'Failed to send join request', 'error');
                    }
                });
            }
            container.appendChild(card);
        });
    }

    /* ─── Events panel loader (targets #eventsPanel in group.html) ─────────── */
    async function loadGroupEventsPanel(tab) {
        tab = tab || 'upcoming';
        const bodyEl = qs('#eventsBody');
        if (!bodyEl) { loadGroupEvents(); return; }
        bodyEl.innerHTML = '<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const params = new URLSearchParams({ limit: '20' });
            if (tab === 'upcoming') params.set('upcoming', 'true');
            else params.set('past', 'true');
            const data   = await apiFetch('/groups/events?' + params.toString());
            const events = (data.data && (data.data.events || data.data)) || data.events || [];
            if (!events.length) { bodyEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">No events found</div>'; return; }
            bodyEl.innerHTML = '';
            events.forEach(ev => {
                const d = ev.date || ev.startDate || ev.scheduledAt;
                const card = document.createElement('div');
                card.style.cssText = 'padding:14px 0;border-bottom:1px solid var(--border-color)';
                card.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${ev.title||'Untitled Event'}</div>`
                    + `<div style="font-size:12px;color:var(--text-secondary)">${d ? new Date(d).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Date TBD'}${ev.groupName?' · '+ev.groupName:''}</div>`
                    + (ev.description ? `<div style="font-size:13px;margin-top:6px">${ev.description.slice(0,120)}</div>` : '');
                bodyEl.appendChild(card);
            });
        } catch(err) {
            bodyEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">' + (err.message||'Failed to load events') + '</div>';
        }
    }

    function showCreateEventForm() {
        const bodyEl = qs('#eventsBody');
        if (!bodyEl) return;
        bodyEl.innerHTML = `
            <div style="padding:16px 0">
                <div style="margin-bottom:14px"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Event Title *</label>
                <input id="_evt_title" type="text" placeholder="Enter event name" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px;box-sizing:border-box"></div>
                <div style="margin-bottom:14px"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Group</label>
                <select id="_evt_group" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px"><option value="">Select group...</option></select></div>
                <div style="margin-bottom:14px"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Date &amp; Time *</label>
                <input id="_evt_date" type="datetime-local" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px;box-sizing:border-box"></div>
                <div style="margin-bottom:20px"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Description</label>
                <textarea id="_evt_desc" rows="3" placeholder="Event description..." style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px;resize:vertical;box-sizing:border-box"></textarea></div>
                <button id="_evt_submit" style="width:100%;padding:12px;border-radius:8px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-weight:700;font-size:15px;cursor:pointer">Create Event</button>
            </div>`;
        // Populate group select
        const sel = qs('#_evt_group');
        const myGroups = (window.GroupCore && window.GroupCore.myGroups) || [];
        myGroups.forEach(g => { const o = document.createElement('option'); o.value=g.id; o.textContent=g.name; sel.appendChild(o); });
        qs('#_evt_submit').addEventListener('click', async () => {
            const title = qs('#_evt_title').value.trim();
            const gid   = qs('#_evt_group').value;
            const dt    = qs('#_evt_date').value;
            const desc  = qs('#_evt_desc').value.trim();
            if (!title) { toast('Event title required','error'); return; }
            if (!gid)   { toast('Select a group','error'); return; }
            if (!dt)    { toast('Select date & time','error'); return; }
            try {
                await apiFetch('/groups/'+gid+'/events', { method:'POST', body:{ title, description:desc, date:new Date(dt).toISOString() } });
                toast('Event created!'); loadGroupEventsPanel('upcoming');
                qsa('.evt-tab').forEach((t,i)=>{ t.style.background=i===0?'var(--primary-color,#6c63ff)':'var(--bg-tertiary,#252537)'; t.style.color=i===0?'#fff':'var(--text-secondary)'; });
            } catch(err) { toast(err.message||'Failed','error'); }
        });
    }

    /* ─── Invite panel loader (targets #invitePanel in group.html) ─────────── */
    async function loadInvitePanel(tab) {
        tab = tab || 'received';
        const bodyEl = qs('#inviteBody');
        if (!bodyEl) { if (tab === 'received') loadUserInvitations(); return; }
        bodyEl.innerHTML = '<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i></div>';
        if (tab === 'received') {
            try {
                const data    = await apiFetch('/group-members/invitations?status=pending');
                const invites = (data.data && (data.data.invitations || data.data)) || data.invitations || [];
                if (!invites.length) { bodyEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)"><i class="fas fa-envelope" style="font-size:28px;opacity:.4;display:block;margin-bottom:10px"></i>No pending invitations</div>'; return; }
                bodyEl.innerHTML = '';
                invites.forEach(inv => {
                    // FIX: groupMembersService returns inv.userGroup; group.js returns inv.inviteGroup or inv.group
                    const gname = (inv.userGroup && inv.userGroup.name) || (inv.inviteGroup && inv.inviteGroup.name) || (inv.group && inv.group.name) || inv.groupName || 'Group';
                    const sname = (inv.inviter && inv.inviter.username) || inv.inviterName || 'Someone';
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border-color)';
                    row.innerHTML = `<div style="width:42px;height:42px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">${gname.slice(0,2).toUpperCase()}</div>`
                        + `<div style="flex:1"><div style="font-weight:600">${gname}</div><div style="font-size:12px;color:var(--text-secondary)">From ${sname}</div></div>`
                        + `<button data-action="accept" style="padding:7px 14px;border-radius:8px;border:none;background:#43a047;color:#fff;font-weight:600;cursor:pointer;margin-right:6px;font-size:13px">Accept</button>`
                        + `<button data-action="decline" style="padding:7px 14px;border-radius:8px;border:1px solid var(--border-color);background:none;color:var(--text-secondary);font-weight:600;cursor:pointer;font-size:13px">Decline</button>`;
                    row.querySelector('[data-action="accept"]').addEventListener('click', async (e) => {
                        e.currentTarget.disabled=true; e.currentTarget.textContent='...';
                        try { await apiFetch('/group-members/invitations/'+inv.id+'/accept',{method:'POST'}); toast('Joined!'); row.remove(); try{if(window.GroupCore&&window.GroupCore.requestGroupList)window.GroupCore.requestGroupList().catch(()=>{})}catch(_){} }
                        catch(err){toast(err.message||'Failed','error');e.currentTarget.disabled=false;e.currentTarget.textContent='Accept';}
                    });
                    row.querySelector('[data-action="decline"]').addEventListener('click', async (e) => {
                        e.currentTarget.disabled=true;
                        try { await apiFetch('/group-members/invitations/'+inv.id+'/reject',{method:'POST'}); row.remove(); }
                        catch(err){toast(err.message||'Failed','error');e.currentTarget.disabled=false;}
                    });
                    bodyEl.appendChild(row);
                });
            } catch(err) { bodyEl.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-secondary)">'+(err.message||'Failed to load')+'</div>'; }
        } else if (tab === 'sent') {
            try {
                const data    = await apiFetch('/groups/invitations/sent').catch(() => apiFetch('/group-members/invitations?status=pending&type=sent'));
                const invites = (data.data && (data.data.invitations || data.data)) || data.invitations || [];
                if (!invites.length) { bodyEl.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-secondary)">No sent invitations</div>'; return; }
                bodyEl.innerHTML='';
                invites.forEach(inv => {
                    const uname = (inv.invitee && inv.invitee.username) || (inv.targetUser && inv.targetUser.username) || inv.inviteeName || 'User';
                    const gname = (inv.inviteGroup && inv.inviteGroup.name) || (inv.userGroup && inv.userGroup.name) || (inv.group && inv.group.name) || 'Group';
                    const row = document.createElement('div');
                    row.style.cssText='display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border-color)';
                    row.innerHTML=`<div style="flex:1"><div style="font-weight:600">${uname}</div><div style="font-size:12px;color:var(--text-secondary)">${gname} · Pending</div></div>`
                        +`<button data-action="cancel" style="padding:6px 12px;border-radius:8px;border:1px solid var(--border-color);background:none;color:var(--text-secondary);cursor:pointer;font-size:12px">Cancel</button>`;
                    row.querySelector('[data-action="cancel"]').addEventListener('click', async(e)=>{
                        e.currentTarget.disabled=true;
                        try{await apiFetch('/group-members/invitations/'+inv.id,{method:'DELETE'});row.remove();}
                        catch(err){toast(err.message||'Failed','error');e.currentTarget.disabled=false;}
                    });
                    bodyEl.appendChild(row);
                });
            } catch(err){bodyEl.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-secondary)">'+(err.message||'Failed')+'</div>';}
        } else if (tab === 'invite') {
            // Show friend list to invite to a group
            bodyEl.innerHTML = '<div style="padding:14px 0"><select id="_inv_group" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:14px;margin-bottom:12px"><option value="">Select group to invite to...</option></select><div id="_inv_friends" style="max-height:300px;overflow-y:auto"></div><button id="_inv_send" style="width:100%;padding:11px;margin-top:14px;border-radius:8px;border:none;background:var(--primary-color,#6c63ff);color:#fff;font-weight:700;font-size:14px;cursor:pointer">Send Invitations</button></div>';
            const gsel = qs('#_inv_group');
            // FIX: populate group select from cache OR API fallback
            (async () => {
                const gc = window.GroupCore;
                const uid = _myUserId();
                let myGroups = [];
                if (gc) {
                    const seen = new Set();
                    const cands = [...(gc.myGroups||[]),...(gc.adminGroups||[]),...(gc.groups||[]).filter(g=>String(g.createdBy)===uid||g.isCreator||g.isAdmin)];
                    cands.forEach(g=>{const k=String(g.id);if(!seen.has(k)){seen.add(k);myGroups.push(g);}});
                }
                if (!myGroups.length) {
                    try { const d=await apiFetch('/groups?myGroups=true&limit=50'); myGroups=d?.data?.groups||d?.data||d?.groups||[]; } catch(_) {}
                }
                myGroups.forEach(g=>{const o=document.createElement('option');o.value=g.id;o.textContent=g.name||('Group '+g.id);gsel.appendChild(o);});
                if (!myGroups.length) {
                    const o=document.createElement('option'); o.disabled=true; o.textContent='No groups available — create a group first'; gsel.appendChild(o);
                }
            })();
            // Load friends
            const fDiv = qs('#_inv_friends');
            fDiv.innerHTML='<div style="text-align:center;padding:16px"><i class="fas fa-spinner fa-spin"></i></div>';
            let _selFriends=[];
            try {
                const data=await apiFetch('/friends');
                const friends=(data.data&&(data.data.friends||data.data))||data.friends||[];
                if(!friends.length){fDiv.innerHTML='<div style="text-align:center;padding:16px;color:var(--text-secondary)">No friends to invite</div>';return;}
                fDiv.innerHTML='';
                friends.forEach(f=>{
                    const nm=f.displayName||([f.firstName,f.lastName].filter(Boolean).join(' '))||f.username||'User';
                    const row=document.createElement('div');
                    row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;cursor:pointer;margin-bottom:4px';
                    row.innerHTML=`<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">${nm.slice(0,2).toUpperCase()}</div><div style="flex:1">${nm}</div><div class="_chk" style="width:20px;height:20px;border-radius:50%;border:2px solid var(--border-color)"></div>`;
                    row.addEventListener('click',()=>{
                        const id=String(f.id||f.userId);
                        const idx=_selFriends.indexOf(id);
                        if(idx===-1){_selFriends.push(id);row.style.background='rgba(102,126,234,.1)';const c=row.querySelector('._chk');c.style.background='#667eea';c.style.borderColor='#667eea';c.textContent='✓';c.style.color='#fff';c.style.fontSize='12px';c.style.display='flex';c.style.alignItems='center';c.style.justifyContent='center';}
                        else{_selFriends.splice(idx,1);row.style.background='';const c=row.querySelector('._chk');c.style.background='';c.style.borderColor='var(--border-color)';c.textContent='';}
                    });
                    fDiv.appendChild(row);
                });
            }catch(err){fDiv.innerHTML='<div style="padding:16px;text-align:center;color:var(--text-secondary)">'+err.message+'</div>';}
            qs('#_inv_send').addEventListener('click',async()=>{
                const gid = gsel.value;
                if (!gid) { toast('Select a group first', 'error'); return; }
                if (!_selFriends.length) { toast('Select at least one friend', 'error'); return; }
                const btn = qs('#_inv_send'); btn.disabled = true; btn.textContent = 'Sending…';
                let ok = 0, fail = 0, failMsgs = [];
                for (const fid of _selFriends) {
                    try {
                        // POST /group-members/:groupId/invitations  { inviteeId, role }
                        await apiFetch('/group-members/' + gid + '/invitations', {
                            method: 'POST',
                            body: { inviteeId: parseInt(fid) || fid, role: 'member' }
                        });
                        ok++;
                    } catch(err) {
                        fail++;
                        failMsgs.push(err.message || 'Unknown error');
                    }
                }
                btn.disabled = false; btn.textContent = 'Send Invitations';
                if (ok > 0) {
                    toast(ok + ' invitation' + (ok !== 1 ? 's' : '') + ' sent! The friend(s) will see it in their Invitations tab.');
                }
                if (fail > 0) {
                    toast(fail + ' failed: ' + failMsgs.slice(0,2).join('; '), 'error');
                }
                _selFriends = [];
                // Uncheck all friend rows visually
                qs('#_inv_friends') && qs('#_inv_friends').querySelectorAll('div[style]').forEach(row => {
                    row.style.background = '';
                    const chk = row.querySelector('._chk');
                    if (chk) { chk.style.background=''; chk.style.borderColor='var(--border-color)'; chk.textContent=''; }
                });
                // Also notify GroupCore to push a real-time invite notification to the other user
                try {
                    const gc2 = window.GroupCore;
                    if (gc2 && typeof gc2.requestGroupList === 'function') gc2.requestGroupList().catch(()=>{});
                } catch(_) {}
            });
        }
    }

    /* ─── GroupCore real-time event → UI wiring ─────────────────────────────
     *
     * These bindings are the missing link between GroupCore's in-memory event
     * emitter and the actual DOM.  Without them:
     *   • A newly created group is never rendered until the page reloads.
     *   • Incoming real-time messages never appear in the open chat.
     *   • Group list counts stay stale after any server-side change.
     */
    let _gcEventsBound = false;

    function wireGroupCoreEvents() {
        if (_gcEventsBound) return;
        const GC = window.GroupCore;
        if (!GC || typeof GC.on !== 'function') {
            // GroupCore not ready yet — retry
            setTimeout(wireGroupCoreEvents, 300);
            return;
        }
        _gcEventsBound = true;

        // ── groups:list-updated → re-render counts + active section ────────
        GC.on('groups:list-updated', function (data) {
            // (log suppressed)
            try { if (typeof updateGroupCounts   === 'function') updateGroupCounts();   } catch (_) {}
            try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch (_) {}
        });

        // ── groups:loaded → same as above (cache/IDB load) ─────────────────
        GC.on('groups:loaded', function (data) {
            // (log suppressed)
            try { if (typeof updateGroupCounts   === 'function') updateGroupCounts();   } catch (_) {}
            try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch (_) {}
        });

        // ── group:created → prepend to My Groups + All Groups lists ────────
        GC.on('group:created', function (newGroup) {
            if (!newGroup?.id) return;
            // (log suppressed)
            try { if (typeof updateGroupCounts   === 'function') updateGroupCounts();   } catch (_) {}
            try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch (_) {}

            // Optimistically prepend the card to visible lists
            ['myGroupsList', 'allGroupsList'].forEach(listId => {
                const list = document.getElementById(listId);
                if (!list) return;
                if (list.querySelector(`[data-group-id="${newGroup.id}"]`)) return; // already there
                const type = listId === 'myGroupsList' ? 'my_group' : 'group';
                try {
                    if (typeof addGroupItem === 'function') {
                        addGroupItem(newGroup, list, type);
                        const card = list.querySelector(`[data-group-id="${newGroup.id}"]`);
                        if (card) list.insertBefore(card, list.firstChild);
                    }
                } catch (_) {}
            });

            try {
                if (typeof showNotification === 'function') {
                    showNotification(`Group "${newGroup.name}" created!`, 'success');
                }
            } catch (_) {}
        });

        // ── group:message-received → render in open chat or bump badge ──────
        GC.on('group:message-received', function (data) {
            const { groupId, message } = data || {};
            if (!groupId || !message) return;
            // (log suppressed)
            try {
                const isOpen = typeof currentChatGroup !== 'undefined' && currentChatGroup?.id === groupId;
                if (isOpen) {
                    if (typeof addMessageToChat === 'function') addMessageToChat(message, true);
                } else {
                    // Increment unread badge in the group list card
                    const card = document.querySelector(`[data-group-id="${groupId}"]`);
                    const badge = card?.querySelector('.group-unread-badge');
                    if (badge) {
                        const n = (parseInt(badge.textContent || '0') || 0) + 1;
                        badge.textContent = n;
                        badge.style.display = '';
                    }
                    if (typeof incrementGroupUnreadCount === 'function') incrementGroupUnreadCount(groupId);
                }
            } catch (_) {}
        });

        // ── group:message-sent → confirm the optimistic message in chat ─────
        GC.on('group:message-sent', function (data) {
            const { message } = data || {};
            if (!message?.id || String(message.id).startsWith('temp_')) return;
            // (log suppressed)
            try {
                const tempEl = document.querySelector('[data-message-id^="temp_"]');
                if (tempEl) {
                    tempEl.dataset.messageId = message.id;
                    tempEl.classList.remove('sending');
                }
            } catch (_) {}
        });

        // ── group:updated → refresh open chat header / details panel ────────
        GC.on('group:updated', function (updatedGroup) {
            if (!updatedGroup?.id) return;
            try {
                const isOpenChat = typeof currentChatGroup !== 'undefined'
                                && currentChatGroup?.id === updatedGroup.id;
                if (isOpenChat) {
                    if (typeof updateChatHeaderUniqueFeatures === 'function') updateChatHeaderUniqueFeatures(updatedGroup);
                    if (typeof checkPostingRules === 'function') checkPostingRules(updatedGroup);
                }
                if (typeof updateCurrentSection === 'function') updateCurrentSection();
            } catch (_) {}
        });

        // ── group:deleted → remove card, close panel if open ────────────────
        GC.on('group:deleted', function (data) {
            const groupId = data?.groupId;
            if (!groupId) return;
            try {
                document.querySelectorAll(`[data-group-id="${groupId}"]`).forEach(el => el.remove());
                if (typeof updateGroupCounts === 'function') updateGroupCounts();
            } catch (_) {}
        });

        // (log suppressed)
    }

    // FIX: plain <script> executes BEFORE type="module" scripts.
    // Event delegation listeners above are registered immediately and work fine.
    // boot() (which uses cloneNode) must run after modules execute.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else if (document.readyState === 'interactive') {
        window.addEventListener('load', boot);
    } else {
        setTimeout(boot, 0);
    }

    /* ══════════════════════════════════════════════════════════════════════
       EXTENDED FIXES
       1. Group counts — force saveGroups → updateGroupCounts after every sync
       2. Discover: smart buttons (Open/Delete vs Join) based on membership
       3. Public groups visible to all users (inject from /groups/search)
       4. Invite: search all users, not just friends
       5. Mobile: group click opens panel, sidebar hides reliably
       ══════════════════════════════════════════════════════════════════════ */

    function _myUserId() {
        try {
            const gc = window.GroupCore;
            if (gc) {
                const u = gc.currentUser || (gc.getCurrentUser && gc.getCurrentUser());
                if (u) return String(u.id || u.uid || u.userId || '');
            }
        } catch (_) {}
        return '';
    }

    function _myRoleInGroup(group) {
        if (!group) return null;
        const uid = _myUserId();
        if (!uid) return null;
        if (String(group.createdBy) === uid || group.isCreator) return 'owner';
        if (group.isAdmin) return 'admin';
        if (group.role && group.role !== 'none') return group.role;
        if (group.isMember) return 'member';
        const members = group.members || [];
        for (const m of members) {
            if (String(m.userId || m.id || '') === uid) return m.role || 'member';
        }
        return null;
    }

    function _openGroupChat(gData) {
        if (typeof openGroupChat === 'function') {
            try { openGroupChat(gData); return; } catch (_) {}
        }
        if (typeof window.__gcOpenPanel === 'function') {
            try { window.__gcOpenPanel(gData); } catch (_) {}
        }
    }

    function _hideSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        sidebar.style.display = 'none';
        sidebar.style.visibility = 'hidden';
        sidebar.classList.add('hidden');
    }

    function _showSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        sidebar.style.display = '';
        sidebar.style.visibility = '';
        sidebar.classList.remove('hidden');
    }

    /* FIX 1 — Group counts */
    (function patchGroupCounts() {
        function forceSync() {
            const gc = window.GroupCore;
            if (!gc) return;
            try { if (typeof gc.saveGroups === 'function') gc.saveGroups(); } catch (_) {}
            try { if (typeof updateGroupCounts === 'function') updateGroupCounts(); } catch (_) {}
            try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch (_) {}
        }
        function wireGCEvents() {
            const gc = window.GroupCore;
            if (!gc || typeof gc.on !== 'function') { setTimeout(wireGCEvents, 600); return; }
            gc.on('groups:list-updated', forceSync);
            gc.on('groups:loaded', forceSync);
        }
        wireGCEvents();
        document.addEventListener('click', (e) => {
            if (e.target.closest('.category-btn')) setTimeout(forceSync, 80);
        }, true);
        let ticks = 0;
        const timer = setInterval(() => {
            ticks++;
            const gc = window.GroupCore;
            if (gc && gc.groups && gc.groups.length > 0) forceSync();
            if (ticks >= 10) clearInterval(timer);
        }, 3000);
    })();

    /* FIX 2 — Discover smart buttons */
    (function patchDiscoverButtons() {
        function upgradeCard(card) {
            if (!card || card.dataset.discoverPatched) return;
            card.dataset.discoverPatched = '1';
            const btn = card.querySelector('[data-action="join"], [data-id]');
            if (!btn) return;
            const gid = btn.dataset.id || btn.dataset.gid;
            if (!gid) return;
            const gc = window.GroupCore;
            const gData = gc && gc.getGroupById ? gc.getGroupById(parseInt(gid) || gid) : null;
            const role = _myRoleInGroup(gData || {});
            if (role) {
                btn.textContent = '▶ Open';
                btn.style.background = '#43a047';
                btn.onclick = (e) => { e.stopPropagation(); if (gData) _openGroupChat(gData); };
                if ((role === 'owner' || role === 'admin') && !btn.parentNode.querySelector('[data-del-gid]')) {
                    const del = document.createElement('button');
                    del.dataset.delGid = gid;
                    del.style.cssText = 'padding:7px 10px;border-radius:8px;border:none;background:#e53935;color:#fff;cursor:pointer;font-size:12px;margin-left:6px';
                    del.innerHTML = '<i class="fas fa-trash"></i>';
                    del.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (!confirm('Delete this group?')) return;
                        const gc2 = window.GroupCore;
                        const doIt = gc2 && gc2.deleteGroup
                            ? () => gc2.deleteGroup(parseInt(gid) || gid)
                            : () => apiFetch('/groups/' + gid, { method: 'DELETE' });
                        doIt().then(() => toast('Group deleted')).catch(err => toast(err.message || 'Failed', 'error'));
                    });
                    btn.parentNode.appendChild(del);
                }
            } else {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    newBtn.disabled = true;
                    newBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        await apiFetch('/groups/' + gid + '/join', { method: 'POST' });
                        newBtn.innerHTML = '<i class="fas fa-check"></i>';
                        newBtn.style.background = '#43a047';
                        toast('Join request sent!');
                        const gc2 = window.GroupCore;
                        if (gc2 && gc2.requestGroupList) gc2.requestGroupList().catch(() => {});
                    } catch (err) {
                        newBtn.disabled = false;
                        newBtn.innerHTML = '<i class="fas fa-user-plus"></i>';
                        toast(err.message || 'Failed', 'error');
                    }
                });
            }
        }
        const obs = new MutationObserver((muts) => {
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    const btn = qs('[data-action="join"], [data-id]', n);
                    if (btn) upgradeCard(n.closest('.group-item') || n);
                    else qsa('[data-action="join"], [data-id]', n).forEach(b => upgradeCard(b.closest('.group-item') || b.parentElement));
                }
            }
        });
        function watchDiscover() {
            const el = qs('#discoverResults') || qs('#discoverGroupsList');
            if (el && el.nodeType === 1) {
                obs.observe(el, { childList: true, subtree: true });
            } else {
                // defer until body exists and the element appears
                function tryWatch() {
                    const found = qs('#discoverResults') || qs('#discoverGroupsList');
                    if (found && found.nodeType === 1) {
                        obs.observe(found, { childList: true, subtree: true });
                        return;
                    }
                    if (!document.body || document.body.nodeType !== 1) {
                        setTimeout(tryWatch, 200);
                        return;
                    }
                    const dObs = new MutationObserver(() => {
                        const f = qs('#discoverResults') || qs('#discoverGroupsList');
                        if (f && f.nodeType === 1) { obs.observe(f, { childList: true, subtree: true }); dObs.disconnect(); }
                    });
                    dObs.observe(document.body, { childList: true, subtree: true });
                }
                tryWatch();
            }
        }
        watchDiscover();
    })();

    /* FIX 3 — Public groups visible to all users */
    (function patchPublicGroups() {
        let _loaded = false;
        function injectPublicGroups() {
            const gc = window.GroupCore;
            apiFetch('/groups/search?isPublic=true&limit=30')
                .then(d => {
                    const publicGroups = d?.data?.groups || d?.data || d?.groups || [];
                    if (!publicGroups.length) return;
                    const allList = document.getElementById('allGroupsList');
                    if (!allList) return;
                    _loaded = true;
                    publicGroups.forEach(pg => {
                        if (gc && gc.groups && gc.groups.some(g => String(g.id) === String(pg.id))) return;
                        if (allList.querySelector('[data-group-id="' + pg.id + '"]')) return;
                        const initials = (pg.name || 'G').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                        const item = document.createElement('div');
                        item.className = 'group-item';
                        item.dataset.groupId = pg.id;
                        item.dataset.publicInjected = '1';
                        item.innerHTML =
                            '<div class="group-avatar" style="background:linear-gradient(135deg,#667eea,#764ba2)">' +
                            '<span>' + initials + '</span></div>' +
                            '<div class="group-info">' +
                            '<div class="group-name"><span class="group-name-text">' + (pg.name || 'Unnamed') + '</span>' +
                            '<span class="group-details"><span style="padding:2px 7px;border-radius:10px;font-size:11px;background:#4caf5020;color:#4caf50;font-weight:600">Public</span></span></div>' +
                            '<div class="group-details">' +
                            '<span class="member-count"><i class="fas fa-users"></i> ' + (pg.memberCount || (pg.stats && pg.stats.totalMembers) || 0) + '</span>' +
                            (pg.purpose ? '<span class="group-purpose-tag">' + pg.purpose + '</span>' : '') + '</div>' +
                            (pg.description ? '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px">' + String(pg.description).slice(0, 80) + '</div>' : '') +
                            '</div>' +
                            '<div class="group-actions">' +
                            '<button class="group-action-btn" data-pub-join="' + pg.id + '" title="Join Group"><i class="fas fa-user-plus"></i></button>' +
                            '</div>';
                        item.querySelector('[data-pub-join]').addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const b = e.currentTarget;
                            b.disabled = true;
                            b.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                            try {
                                await apiFetch('/groups/' + pg.id + '/join', { method: 'POST' });
                                b.innerHTML = '<i class="fas fa-check"></i>';
                                b.style.background = '#43a047';
                                toast('Join request sent!');
                                const gc2 = window.GroupCore;
                                if (gc2 && gc2.requestGroupList) gc2.requestGroupList().catch(() => {});
                            } catch (err) {
                                b.disabled = false;
                                b.innerHTML = '<i class="fas fa-user-plus"></i>';
                                toast(err.message || 'Failed', 'error');
                            }
                        });
                        item.addEventListener('click', (e) => {
                            if (!e.target.closest('.group-actions')) toast('Join this group to open chat', 'info');
                        });
                        const empty = allList.querySelector('.empty-state');
                        if (empty) empty.remove();
                        allList.appendChild(item);
                    });
                })
                .catch(() => {});
        }
        function tryLoad() {
            const gc = window.GroupCore;
            if (gc && gc.groups !== undefined) injectPublicGroups();
            else setTimeout(tryLoad, 800);
        }
        setTimeout(tryLoad, 1500);
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (!btn) return;
            const t = btn.dataset.section || btn.dataset.tab || btn.id || '';
            if (t === 'all' || t === 'allTab' || t === 'allGroups') {
                _loaded = false;
                setTimeout(injectPublicGroups, 350);
            }
        });
        function wireEvent() {
            const gc = window.GroupCore;
            if (!gc || typeof gc.on !== 'function') { setTimeout(wireEvent, 600); return; }
            gc.on('groups:list-updated', () => { _loaded = false; setTimeout(injectPublicGroups, 400); });
        }
        wireEvent();
    })();

    /* FIX 4 — Invite: search all users */
    (function patchInviteSearch() {
        function injectUserSearch() {
            const invBody = document.getElementById('inviteBody');
            if (!invBody || !invBody.children.length) return;
            if (invBody.querySelector('#_patchUserSearchWrap')) return;
            const wrap = document.createElement('div');
            wrap.id = '_patchUserSearchWrap';
            wrap.style.cssText = 'margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color)';
            wrap.innerHTML =
                '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;font-weight:600">' +
                '<i class="fas fa-search"></i> Search all users</div>' +
                '<div style="display:flex;gap:8px;margin-bottom:8px">' +
                '<input id="_patchUserSearchInput" placeholder="Name or @username\u2026" autocomplete="off"' +
                ' style="flex:1;padding:9px 12px;border-radius:8px;border:1px solid var(--border-color);' +
                'background:var(--bg-tertiary,#252537);color:var(--text-primary);font-size:13px;outline:none">' +
                '<button id="_patchUserSearchBtn" style="padding:9px 14px;border-radius:8px;border:none;' +
                'background:var(--primary-color,#6c63ff);color:#fff;font-size:13px;font-weight:600;cursor:pointer">Search</button>' +
                '</div>' +
                '<div id="_patchUserResults" style="max-height:220px;overflow-y:auto"></div>';
            invBody.appendChild(wrap);

            const input   = wrap.querySelector('#_patchUserSearchInput');
            const btn     = wrap.querySelector('#_patchUserSearchBtn');
            const results = wrap.querySelector('#_patchUserResults');

            function doSearch() {
                const q = input.value.trim();
                if (!q || q.length < 2) { results.innerHTML = ''; return; }
                results.innerHTML = '<div style="padding:10px;color:var(--text-secondary);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Searching\u2026</div>';
                apiFetch('/users/search?query=' + encodeURIComponent(q) + '&limit=10')
                    .then(d => {
                        const users = d?.data?.users || d?.data || d?.users || [];
                        if (!users.length) { results.innerHTML = '<div style="padding:10px;color:var(--text-secondary);font-size:13px">No users found</div>'; return; }
                        results.innerHTML = '';
                        const gid = window.selectedGroup?.id || document.getElementById('invGroupSel')?.value;
                        users.forEach(u => {
                            const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'User';
                            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
                            const row = document.createElement('div');
                            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border-color)';
                            row.innerHTML =
                                '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);' +
                                'flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px">' + initials + '</div>' +
                                '<div style="flex:1"><div style="font-weight:500;font-size:13px">' + name + '</div>' +
                                (u.username ? '<div style="font-size:11px;color:var(--text-secondary)">@' + u.username + '</div>' : '') + '</div>' +
                                '<button data-uid="' + u.id + '" style="padding:5px 12px;border-radius:8px;border:none;' +
                                'background:var(--primary-color,#6c63ff);color:#fff;font-size:12px;font-weight:600;cursor:pointer">Invite</button>';
                            row.querySelector('[data-uid]').addEventListener('click', async (e) => {
                                const ib = e.currentTarget;
                                const currentGid = gid || window.selectedGroup?.id || document.getElementById('invGroupSel')?.value;
                                if (!currentGid) { toast('Select a group first', 'error'); return; }
                                ib.disabled = true; ib.textContent = '\u2026';
                                try {
                                    await apiFetch('/group-members/' + currentGid + '/invitations', {
                                        method: 'POST',
                                        body: { inviteeId: parseInt(u.id) || u.id, role: 'member' }
                                    });
                                    ib.textContent = '\u2713 Invited';
                                    ib.style.background = '#43a047';
                                    toast('Invitation sent to ' + name);
                                } catch (err) {
                                    ib.disabled = false; ib.textContent = 'Invite';
                                    toast(err.message || 'Failed', 'error');
                                }
                            });
                            results.appendChild(row);
                        });
                    })
                    .catch(err => { results.innerHTML = '<div style="padding:10px;color:var(--text-secondary);font-size:13px">' + (err.message || 'Search failed') + '</div>'; });
            }
            btn.addEventListener('click', doSearch);
            let deb;
            input.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') { doSearch(); return; }
                clearTimeout(deb); deb = setTimeout(doSearch, 380);
            });
        }

        const obs = new MutationObserver(() => {
            const ib = document.getElementById('inviteBody');
            if (ib && ib.children.length && !ib.querySelector('#_patchUserSearchWrap')) setTimeout(injectUserSearch, 80);
        });
        function startWatch() {
            const ib = document.getElementById('inviteBody');
            if (ib) obs.observe(ib, { childList: true });
            else {
                const dObs = new MutationObserver(() => {
                    const found = document.getElementById('inviteBody');
                    if (found) { obs.observe(found, { childList: true }); dObs.disconnect(); }
                });
                const bodyTarget = document.body || document.documentElement;
                if (bodyTarget) dObs.observe(bodyTarget, { childList: true, subtree: true });
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startWatch);
        } else {
            startWatch();
        }
        document.addEventListener('click', (e) => {
            if (e.target.closest('#groupInvitesBtn') || e.target.closest('[data-tab="invite"]') ||
                e.target.closest('[data-inv-tab="friends"]')) setTimeout(injectUserSearch, 400);
        });
    })();

    /* FIX 5 — Mobile: group click opens panel, sidebar hides */
    (function patchMobileGroupOpen() {
        // Capture phase so we run before module click handlers
        document.addEventListener('click', (e) => {
            if (e.target.closest('.group-actions') || e.target.closest('[data-action]') ||
                e.target.closest('[data-pub-join]')) return;

            const item = e.target.closest('.group-item');
            if (!item || item.dataset.publicInjected) return;

            const gid = item.dataset.groupId || item.dataset.gid;
            if (!gid) return;

            const gc = window.GroupCore;
            let gData = gc && gc.getGroupById ? gc.getGroupById(parseInt(gid) || gid) : null;
            if (!gData) {
                for (const k of ['groups', 'myGroups', 'joinedGroups', 'adminGroups']) {
                    if (!gData && gc && Array.isArray(gc[k])) {
                        gData = gc[k].find(g => String(g.id) === String(gid));
                    }
                }
            }
            if (!gData) return;

            if (window.innerWidth <= 768) {
                _hideSidebar();
                const panel = document.getElementById('groupChatPanel');
                if (panel) { panel.style.display = 'flex'; panel.classList.add('active'); }
            }

            _openGroupChat(gData);
        }, true);

        // FIX: the Group Details overlay's own #backBtn (group.html's
        // .group-details-panel — a fixed, full-screen panel stacked on top
        // of the group chat, see group.css) was being caught by the generic
        // back-button handler further below, which hid the *group chat
        // panel and sidebar* instead of just dismissing this overlay. That
        // made the details-panel back arrow look non-functional: nothing
        // visibly returned the user to their chat. Handle it first and
        // close only the details overlay, leaving the chat that was already
        // open underneath exactly as it was.
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#groupDetailsPanel #backBtn')) return;
            const groupDetailsPanel = document.getElementById('groupDetailsPanel');
            if (groupDetailsPanel) {
                groupDetailsPanel.classList.remove('active');
                groupDetailsPanel.style.display = 'none';
            }
        });

        // Back/close buttons restore sidebar
        document.addEventListener('click', (e) => {
            if (e.target.closest('#groupDetailsPanel #backBtn')) return;
            if (!e.target.closest('.mobile-back-btn, .gc-back-btn, #closeChatBtn, #backBtn')) return;
            if (window.innerWidth <= 768) {
                _showSidebar();
                const panel = document.getElementById('groupChatPanel');
                if (panel) { panel.style.display = 'none'; panel.classList.remove('active'); }
            }
        });

        // Restore sidebar when user rotates/resizes back to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) _showSidebar();
        });
    })();

})();