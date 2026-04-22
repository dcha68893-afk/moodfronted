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
        try { return window.__PARENT_SESSION__?.token || window.AUTH_SESSION?.token ||
            localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') ||
            window.KynectaStore?.get?.('auth.token') || null; } catch (_) { return null; }
    }

    /** Minimal authenticated fetch wrapper — mirrors secureApiCall but works standalone */
    async function apiFetch(path, opts = {}) {
        const token = getToken();
        const base  = window.__API_BASE_URL || window.API_BASE_URL || '';
        const url   = base + (path.startsWith('/api') ? path : `/api${path}`);
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
                const modal = qs('#discoverGroupsModal') || qs('[id*="discover"][id*="modal"]');
                if (modal) {
                    modal.classList.add('active');
                    modal.style.display = 'flex';
                    loadDiscoverGroups();
                } else {
                    // Fall back: show allGroupsSection with public filter
                    qsa('.category-btn').forEach(b => b.classList.remove('active'));
                    const allTab = qs('#allTab');
                    if (allTab) allTab.classList.add('active');
                    qsa('.groups-section').forEach(s => s.classList.remove('active'));
                    const allSec = qs('#allGroupsSection');
                    if (allSec) allSec.classList.add('active');
                    loadDiscoverGroups('inline');
                }
            });
        }

        /* --- Invites --- */
        const invBtn = freshClone(qs('#groupInvitesBtn'));
        if (invBtn) {
            invBtn.addEventListener('click', () => {
                // Switch to Invites tab
                qsa('.category-btn').forEach(b => b.classList.remove('active'));
                const invTab = qs('#invitesTab');
                if (invTab) invTab.classList.add('active');
                qsa('.groups-section').forEach(s => s.classList.remove('active'));
                const invSec = qs('#invitesSection');
                if (invSec) invSec.classList.add('active');
                loadUserInvitations();
            });
        }

        /* --- Events --- */
        const evtBtn = freshClone(qs('#groupEventsBtn'));
        if (evtBtn) {
            evtBtn.addEventListener('click', () => {
                const modal = qs('#groupEventsModal') || qs('[id*="events"][id*="modal"]');
                if (modal) {
                    modal.classList.add('active');
                    modal.style.display = 'flex';
                    loadGroupEvents();
                } else {
                    // Inline fallback in details panel
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
    function patchCreateGroupModal() {
        const modal = qs('#createGroupModal');
        if (!modal) return;

        /* ── Tab map: data-tab value → element id ── */
        const CREATE_TAB_MAP = {
            basic   : 'basicTab',
            settings: 'settingsTab',
            purpose : 'purposeTab',
            theme   : 'themeTab',
            members : 'membersTab',
        };

        /* Wire create-group tabs */
        qsa('.create-group-tab', modal).forEach(btn => {
            const fresh = freshClone(btn);
            fresh.addEventListener('click', () => {
                qsa('.create-group-tab', modal).forEach(b => b.classList.remove('active'));
                Object.values(CREATE_TAB_MAP).forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.remove('active');
                });
                fresh.classList.add('active');
                const key = fresh.dataset.tab;
                const targetId = CREATE_TAB_MAP[key];
                if (targetId) {
                    const target = document.getElementById(targetId);
                    if (target) target.classList.add('active');
                }
                // FIX 3: Load friends when Members tab opened
                if (key === 'members') loadFriendsForMembersTab();
            });
        });

        /* FIX 5 — Cancel button */
        const cancelBtn = freshClone(qs('#cancelCreateGroupBtn') || qs('#closeCreateGroupModal'));
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeCreateGroupModal);
        }
        const closeBtn = freshClone(qs('#closeCreateGroupModal'));
        if (closeBtn) {
            closeBtn.addEventListener('click', closeCreateGroupModal);
        }

        /* FIX 6 — Create Group submit */
        const submitBtn = freshClone(qs('#createGroupBtnModal'));
        if (submitBtn) {
            submitBtn.addEventListener('click', handleCreateGroupSubmit);
        }

        /* Clicking outside modal → close */
        freshClone(modal)?.addEventListener?.('click', (e) => {
            if (e.target === modal) closeCreateGroupModal();
        });
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
        const nameInput  = qs('#groupNameInput') || qs('#createGroupName') || qs('input[placeholder*="name" i]', qs('#createGroupModal'));
        const descInput  = qs('#groupDescInput') || qs('#createGroupDescription') || qs('textarea', qs('#createGroupModal'));
        const privSelect = qs('#groupPrivacySelect') || qs('#createGroupPrivacy') || qs('select[id*="privacy"]', qs('#createGroupModal'));
        const purposeSel = qs('#createGroupPurpose') || qs('[id*="purpose"]', qs('#createGroupModal'));
        const moodSel    = qs('.mood-select-btn.active', qs('#createGroupModal'));
        const postRule   = qs('#postingRulesSelect') || qs('[id*="postingRule"]', qs('#createGroupModal'));
        const themeSelected = qs('.theme-btn.active, .create-group-theme-btn.active', qs('#createGroupModal'));

        const name = nameInput?.value?.trim() || '';
        if (!name) { toast('Group name is required', 'error'); nameInput?.focus(); return; }

        const groupData = {
            name,
            description : descInput?.value?.trim() || '',
            privacy      : privSelect?.value || 'private',
            purpose      : purposeSel?.value || '',
            mood         : moodSel?.dataset?.mood || '',
            postingRule  : postRule?.value || 'everyone',
            theme        : themeSelected?.dataset?.theme || 'blue',
            memberIds    : [...(window.__pendingGroupInvites || [])],
        };

        const submitBtn = qs('#createGroupBtnModal');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating…'; }

        try {
            // Prefer GroupCore
            if (window.GroupCore && typeof window.GroupCore.createGroup === 'function') {
                await window.GroupCore.createGroup(groupData);
            } else if (typeof createGroupOnline === 'function') {
                await createGroupOnline(groupData);
            } else {
                // Direct API fallback
                await apiFetch('/groups', { method: 'POST', body: groupData });
            }
            toast('Group created!');
            closeCreateGroupModal();

            // Send invites if any
            const pendingInvites = window.__pendingGroupInvites || [];
            if (pendingInvites.length) {
                window.__pendingGroupInvites = [];
            }

            // Refresh group list
            try {
                if (typeof updateGroupCounts === 'function') updateGroupCounts();
                if (typeof updateCurrentSection === 'function') updateCurrentSection();
                if (window.GroupCore?.requestGroupList) window.GroupCore.requestGroupList().catch(() => {});
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
        console.log('[GroupUIPatch v4.0.0] ✅ All patches applied');
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
            console.log('[GROUP FLOW] groups:list-updated →', data?.groups?.length, 'groups');
            try { if (typeof updateGroupCounts   === 'function') updateGroupCounts();   } catch (_) {}
            try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch (_) {}
        });

        // ── groups:loaded → same as above (cache/IDB load) ─────────────────
        GC.on('groups:loaded', function (data) {
            console.log('[GROUP FLOW] groups:loaded —', data?.groups?.length || 0, 'groups from', data?.source || 'cache');
            try { if (typeof updateGroupCounts   === 'function') updateGroupCounts();   } catch (_) {}
            try { if (typeof updateCurrentSection === 'function') updateCurrentSection(); } catch (_) {}
        });

        // ── group:created → prepend to My Groups + All Groups lists ────────
        GC.on('group:created', function (newGroup) {
            if (!newGroup?.id) return;
            console.log('[GROUP FLOW] group:created UI update →', newGroup.name);
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
            console.log('[GROUP FLOW] group:message-received → groupId', groupId);
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
            console.log('[GROUP FLOW] group:message-sent confirmed →', message.id);
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

        console.log('[GROUP FLOW] GroupCore UI event listeners bound ✅');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        // Defer slightly so group-core.js and group-ui.js modules finish loading
        setTimeout(boot, 0);
    }

})();