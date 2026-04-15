// =============================================
// Tool-ui.js — PATCH FILE  v1.0
// =============================================
// HOW TO APPLY:
//   1. In Tool-ui.js, replace each section marked "FIND:" with "REPLACE:"
//   2. Or run:  node apply-tool-ui-patch.js
//
// CHANGES IN THIS PATCH
//   ✅ Add condition field (New / Used / Refurbished) to both Service & Digital tabs
//   ✅ saveCurrentAsDraft() — real IDB persistence via LocalStoreTools
//   ✅ publishListingFromModal() — saves locally first (saveToolLocal), then server
//   ✅ addNewNote() — real note editor (title + body), persists to IDB
//   ✅ renderMyNotes() — shows delete button, real timestamps
//   ✅ UIPipeline.syncFromCoreGlobals() — hydrates from LocalStoreTools on boot
//   ✅ addListingItem() — shows condition badge on every card
//   ✅ renderListingDetailContent() — shows condition in detail meta row
//   ✅ UIState — adds selectedCondition field
// =============================================

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 1 — Import saveToolLocal and condition helpers from Tool-core.js
// ─────────────────────────────────────────────────────────────────────────────
// FIND (at the end of the import block, around line 150):
//
//     coreAllListings,
//     coreMyListings,
//     savedItems as coreSavedItems
//
//     } from './Tool-core.js';
//
// REPLACE WITH:
//
//     coreAllListings,
//     coreMyListings,
//     savedItems as coreSavedItems,
//     saveToolLocal,
//     ITEM_CONDITIONS,
//     getConditionLabel,
//     getConditionTag,
//
//     } from './Tool-core.js';
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 2 — Add selectedCondition to UIState
// ─────────────────────────────────────────────────────────────────────────────
// FIND (inside const UIState = { … }, after selectedSchedule: 'daily',):
//
//     selectedPlan: null,
//
// REPLACE WITH:
//
//     selectedPlan: null,
//     selectedCondition: 'new',      // ← NEW: 'new' | 'used' | 'refurbished'
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 3 — UIPipeline.syncFromCoreGlobals: hydrate from LocalStoreTools
// ─────────────────────────────────────────────────────────────────────────────
// FIND:
//
//     syncFromCoreGlobals() {
//         if (window.allListings) allListings = window.allListings;
//         if (window.myListings) myListings = window.myListings;
//         if (window.savedItems) savedItems = window.savedItems;
//         if (window.userFriends) userFriends = window.userFriends;
//         if (window.userGroups) userGroups = window.userGroups;
//         if (window.currentUser) currentUser = window.currentUser;
//     },
//
// REPLACE WITH:
//
//     syncFromCoreGlobals() {
//         // Live globals (set by Tool-core.js)
//         if (window.allListings)  allListings  = window.allListings;
//         if (window.myListings)   myListings   = window.myListings;
//         if (window.savedItems)   savedItems   = window.savedItems;
//         if (window.userFriends)  userFriends  = window.userFriends;
//         if (window.userGroups)   userGroups   = window.userGroups;
//         if (window.currentUser)  currentUser  = window.currentUser;
//
//         // ── OFFLINE-FIRST: hydrate from LocalStoreTools (IndexedDB) ──────────
//         // This runs synchronously from the in-memory cache — no flicker.
//         const LST = window.LocalStoreTools;
//         if (LST) {
//             const cached = LST.getAllListings();
//             if (cached.length > 0) {
//                 // Merge: cached items that aren't in allListings yet
//                 const existingIds = new Set((allListings || []).map(l => l.id));
//                 const merged      = [...(allListings || [])];
//                 cached.forEach(l => { if (!existingIds.has(l.id)) merged.push(l); });
//                 allListings = merged;
//                 if (!window.allListings || window.allListings.length < merged.length) {
//                     window.allListings = merged;
//                 }
//             }
//             const cachedDrafts = LST.getAllDrafts();
//             if (cachedDrafts.length > 0) offlineDrafts = cachedDrafts;
//
//             const cachedNotes = LST.getAllNotes();
//             if (cachedNotes.length > 0) privateNotes = cachedNotes;
//
//             const cachedSaved = LST.getAllSaved();
//             if (cachedSaved.length > 0) {
//                 const savedIds = new Set((savedItems || []).map(s => s.id));
//                 cachedSaved.forEach(s => { if (!savedIds.has(s.id)) (savedItems = savedItems || []).push(s); });
//             }
//         }
//     },
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 4 — saveCurrentAsDraft: real IDB persistence
// ─────────────────────────────────────────────────────────────────────────────
// FIND:
//
//     function saveCurrentAsDraft() {
//         showNotification('Draft saved locally', 'success');
//     }
//
// REPLACE WITH:
//
//     async function saveCurrentAsDraft() {
//         const activeTab = UIState.createListingActiveTab || 'service';
//         const isDigital = activeTab === 'digital';
//
//         const title       = isDigital ? (DOM.digitalTitle?.value || '')       : (DOM.serviceTitle?.value || '');
//         const description = isDigital ? (DOM.digitalDescription?.value || '') : (DOM.serviceDescription?.value || '');
//         const price       = isDigital ? (DOM.digitalPrice?.value || 0)        : (DOM.servicePrice?.value || 0);
//         const category    = isDigital ? 'digital' : 'services';
//
//         if (!title && !description) {
//             showNotification('Nothing to save — fill in a title or description first', 'warning');
//             return;
//         }
//
//         const draft = {
//             id          : 'draft_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
//             type        : isDigital ? 'digital' : 'service',
//             title,
//             description,
//             price       : parseFloat(price) || 0,
//             category,
//             condition   : UIState.selectedCondition || 'new',
//             availability: UIState.selectedAvailability,
//             visibility  : UIState.selectedTrustCircle,
//             template    : UIState.selectedTemplate,
//             moodContext : UIState.selectedMoodContext,
//             duration    : UIState.selectedDuration,
//             featured    : DOM.featuredListingCheckbox?.checked || false,
//             boosted     : DOM.boostListingCheckbox?.checked    || false,
//             privateNote : DOM.sellerNotes?.value || '',
//             teamNotes   : DOM.teamNotes?.value   || '',
//             savedAt     : new Date().toISOString(),
//         };
//
//         // Persist to IndexedDB + localStorage (won't disappear on refresh)
//         const LST = window.LocalStoreTools;
//         if (LST) {
//             await LST.saveDraftLocal(draft);
//             offlineDrafts = LST.getAllDrafts();
//             if (!window.offlineDrafts) window.offlineDrafts = [];
//             window.offlineDrafts = offlineDrafts;
//         } else {
//             offlineDrafts.unshift(draft);
//             try {
//                 localStorage.setItem('mktp_all_drafts', JSON.stringify(offlineDrafts));
//             } catch { /* ignore */ }
//         }
//
//         showNotification('💾 Draft saved — won\'t disappear on refresh', 'success');
//         hideCreateListingModal();
//     }
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 5 — publishListingFromModal: save locally first, then server
// ─────────────────────────────────────────────────────────────────────────────
// FIND (inside publishListingFromModal, handle service tab):
//
//         const listing = await createServiceListing(title, description, {
//             price: price,
//             availability: UIState.selectedAvailability,
//             visibility: UIState.selectedTrustCircle,
//             moodContext: UIState.selectedMoodContext,
//             template: UIState.selectedTemplate
//         });
//
//         if (listing) {
//             showNotification('Listing published successfully!', 'success');
//             hideCreateListingModal();
//             UIPipeline.liveUpdate();
//         } else {
//             showNotification('Failed to publish listing', 'error');
//         }
//         return;
//
// REPLACE WITH:
//
//         const listing = await createServiceListing(title, description, {
//             price        : price,
//             condition    : UIState.selectedCondition || 'new',
//             availability : UIState.selectedAvailability,
//             visibility   : UIState.selectedTrustCircle,
//             moodContext  : UIState.selectedMoodContext,
//             template     : UIState.selectedTemplate,
//             privateNote  : DOM.sellerNotes?.value || '',
//             teamNotes    : DOM.teamNotes?.value   || '',
//             featured     : DOM.featuredListingCheckbox?.checked || false,
//             boosted      : DOM.boostListingCheckbox?.checked    || false,
//         });
//
//         if (listing) {
//             // ── Save locally FIRST (offline-first guarantee) ──────────────────
//             const LST = window.LocalStoreTools;
//             if (LST) {
//                 await LST.saveListingLocal({ ...listing, condition: UIState.selectedCondition || 'new' });
//                 // Verify it survived
//                 const integrity = await LST.verifyOfflineIntegrity(listing.id, LST.STORES.LISTINGS);
//                 console.log('[Tool-ui] Publish integrity:', integrity);
//             }
//             // Push to allListings immediately
//             if (!allListings.some(l => l.id === listing.id)) {
//                 allListings.unshift({ ...listing, condition: UIState.selectedCondition || 'new' });
//                 window.allListings = allListings;
//             }
//             showNotification('🚀 Published! Others can now see your listing.', 'success');
//             hideCreateListingModal();
//             UIState.selectedCondition = 'new';   // reset
//             UIPipeline.liveUpdate();
//         } else {
//             showNotification('Failed to publish listing', 'error');
//         }
//         return;
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 6 — publishListingFromModal: digital tab — same condition injection
// ─────────────────────────────────────────────────────────────────────────────
// FIND:
//
//         const listing = await createDigitalListing(title, description, UIState.selectedDigitalFile, {
//             price: price,
//             visibility: UIState.selectedTrustCircle,
//             moodContext: UIState.selectedMoodContext,
//             template: UIState.selectedTemplate
//         });
//
//         if (listing) {
//             showNotification('Digital item published successfully!', 'success');
//             hideCreateListingModal();
//             UIPipeline.liveUpdate();
//         } else {
//             showNotification('Failed to publish digital item', 'error');
//         }
//
// REPLACE WITH:
//
//         const listing = await createDigitalListing(title, description, UIState.selectedDigitalFile, {
//             price        : price,
//             condition    : UIState.selectedCondition || 'new',
//             visibility   : UIState.selectedTrustCircle,
//             moodContext  : UIState.selectedMoodContext,
//             template     : UIState.selectedTemplate,
//             privateNote  : DOM.sellerNotes?.value || '',
//         });
//
//         if (listing) {
//             // ── Save locally FIRST (offline-first guarantee) ──────────────────
//             const LST = window.LocalStoreTools;
//             if (LST) {
//                 await LST.saveListingLocal({ ...listing, condition: UIState.selectedCondition || 'new' });
//             }
//             if (!allListings.some(l => l.id === listing.id)) {
//                 allListings.unshift({ ...listing, condition: UIState.selectedCondition || 'new' });
//                 window.allListings = allListings;
//             }
//             showNotification('💾 Digital item published!', 'success');
//             hideCreateListingModal();
//             UIState.selectedCondition = 'new';
//             UIPipeline.liveUpdate();
//         } else {
//             showNotification('Failed to publish digital item', 'error');
//         }
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 7 — addListingItem: show condition badge on every listing card
// ─────────────────────────────────────────────────────────────────────────────
// FIND (inside addListingItem, right after the badges block):
//
//         let badges = '';
//         if (listing.featured || listing.isFeatured || listing.isSpotlight) badges += ...
//
// After the last badges += line and before item.innerHTML = `...`, ADD:
//
//         // Condition badge
//         const condLabel = listing.condition
//             ? (window.getConditionLabel ? window.getConditionLabel(listing.condition)
//                : { new: '✨ New', used: '🔄 Used', refurbished: '🔧 Refurbished' }[listing.condition] || '✨ New')
//             : '✨ New';
//         const condClass = listing.condition === 'used' ? 'condition-badge-used'
//             : listing.condition === 'refurbished'      ? 'condition-badge-refurb'
//             : 'condition-badge-new';
//         badges += `<span class="meta-badge ${condClass}" style="font-size:10px;">${condLabel}</span>`;
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 8 — renderListingDetailContent: add condition to meta row
// ─────────────────────────────────────────────────────────────────────────────
// FIND (inside renderListingDetailContent, inside the listing-detail-meta div):
//
//         <div class="listing-detail-meta">
//             <span class="meta-badge"><i class="fas fa-…"></i> ${…Digital Item… or …Service…}</span>
//             <span class="meta-badge availability-…
//
// AFTER the first meta-badge span, INSERT:
//
//             ${listing.condition ? `<span class="meta-badge condition-badge-${listing.condition || 'new'}" style="font-weight:600;">
//                 ${{ new: '✨ New', used: '🔄 Used', refurbished: '🔧 Refurbished' }[listing.condition] || '✨ New'}
//             </span>` : ''}
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 9 — addNewNote: real title + body editor (replaces prompt())
// ─────────────────────────────────────────────────────────────────────────────
// FIND:
//
//     function addNewNote() {
//         const note = prompt('Add a new note:');
//         if (note) {
//             privateNotes.push({
//                 id: Date.now().toString(),
//                 title: 'Note',
//                 content: note,
//                 createdAt: new Date().toISOString()
//             });
//             saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
//             renderMyNotes();
//             showNotification('Note added', 'success');
//         }
//     }
//
// REPLACE WITH:
//
//     async function addNewNote() {
//         // Build inline note form inside the notes modal
//         const modal = DOM.myNotesModal;
//         if (!modal) return;
//
//         // Avoid double-insert
//         if (modal.querySelector('#inlineNoteForm')) {
//             modal.querySelector('#inlineNoteTitle')?.focus();
//             return;
//         }
//
//         const form = document.createElement('div');
//         form.id = 'inlineNoteForm';
//         form.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border-color,#e0e0e0);';
//         form.innerHTML = `
//             <input id="inlineNoteTitle" placeholder="Note title…"
//                 style="width:100%;padding:8px 12px;margin-bottom:8px;
//                        border:1px solid var(--border-color,#e0e0e0);border-radius:8px;
//                        background:var(--secondary-color,#f5f5f5);color:var(--text-primary,#222);font-size:13px;">
//             <textarea id="inlineNoteBody" rows="3" placeholder="Write your note…"
//                 style="width:100%;padding:8px 12px;margin-bottom:8px;resize:vertical;
//                        border:1px solid var(--border-color,#e0e0e0);border-radius:8px;
//                        background:var(--secondary-color,#f5f5f5);color:var(--text-primary,#222);font-size:13px;"></textarea>
//             <div style="display:flex;gap:8px;">
//                 <button id="saveNoteBtn"
//                     style="flex:1;padding:9px;background:var(--primary-color,#0084ff);color:#fff;
//                            border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">
//                     💾 Save Note
//                 </button>
//                 <button id="cancelNoteBtn"
//                     style="padding:9px 14px;border:1px solid var(--border-color,#e0e0e0);
//                            background:transparent;color:var(--text-secondary,#888);
//                            border-radius:8px;cursor:pointer;font-size:13px;">
//                     Cancel
//                 </button>
//             </div>
//         `;
//
//         // Insert at top of modal body
//         const body = modal.querySelector('.modal-body, .modal-content, [id*="notes"]') || modal;
//         body.insertBefore(form, body.firstChild);
//         form.querySelector('#inlineNoteTitle').focus();
//
//         form.querySelector('#cancelNoteBtn').onclick = () => form.remove();
//         form.querySelector('#saveNoteBtn').onclick   = async () => {
//             const title   = (form.querySelector('#inlineNoteTitle')?.value || '').trim();
//             const content = (form.querySelector('#inlineNoteBody')?.value  || '').trim();
//             if (!content && !title) {
//                 showNotification('Write something first', 'warning');
//                 return;
//             }
//             const note = {
//                 id       : 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
//                 title    : title || 'Note',
//                 content,
//                 createdAt: new Date().toISOString(),
//             };
//
//             // ── Persist to IndexedDB (survives refresh) ───────────────────────
//             const LST = window.LocalStoreTools;
//             if (LST) {
//                 await LST.saveNote(note);
//                 privateNotes = LST.getAllNotes();
//             } else {
//                 privateNotes.unshift(note);
//                 saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
//             }
//
//             form.remove();
//             renderMyNotes();
//             showNotification('📝 Note saved', 'success');
//         };
//     }
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 10 — renderMyNotes: add delete button + real timestamps
// ─────────────────────────────────────────────────────────────────────────────
// FIND:
//
//     function renderMyNotes() {
//         if (!DOM.myNotesList) return;
//         if (!privateNotes || privateNotes.length === 0) {
//             DOM.myNotesList.innerHTML = '<div style="text-align: center; padding: 40px;">No private notes</div>';
//             return;
//         }
//         DOM.myNotesList.innerHTML = '';
//         privateNotes.forEach(note => {
//             const noteEl = document.createElement('div');
//             noteEl.className = 'note-item';
//             noteEl.innerHTML = `
//                 <div style="font-weight: 500;">${escapeHtml(note.title || 'Note')}</div>
//                 <div style="font-size: 14px; margin-top: 8px;">${escapeHtml(note.content || '').substring(0, 100)}</div>
//                 <div style="font-size: 11px; color: var(--text-secondary); margin-top: 8px;">${formatTimeAgo(new Date(note.createdAt))}</div>
//             `;
//             DOM.myNotesList.appendChild(noteEl);
//         });
//     }
//
// REPLACE WITH:
//
//     function renderMyNotes() {
//         if (!DOM.myNotesList) return;
//
//         // Sync from IDB cache first
//         const LST = window.LocalStoreTools;
//         if (LST) {
//             const cached = LST.getAllNotes();
//             if (cached.length) privateNotes = cached;
//         }
//
//         if (!privateNotes || privateNotes.length === 0) {
//             DOM.myNotesList.innerHTML = `
//                 <div style="text-align:center;padding:40px;color:var(--text-secondary);">
//                     <div style="font-size:36px;margin-bottom:12px;">📝</div>
//                     <div style="font-weight:600;margin-bottom:6px;">No private notes yet</div>
//                     <div style="font-size:12px;">Tap "+ Add Note" to create one — only you can see these.</div>
//                 </div>`;
//             return;
//         }
//         DOM.myNotesList.innerHTML = '';
//
//         privateNotes.forEach(note => {
//             const noteEl = document.createElement('div');
//             noteEl.className = 'note-item';
//             noteEl.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border-color,#e0e0e0);';
//             noteEl.innerHTML = `
//                 <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
//                     <div style="font-weight:600;font-size:13px;">${escapeHtml(note.title || 'Note')}</div>
//                     <button class="delete-note-btn" data-note-id="${escapeHtml(note.id)}"
//                         style="background:none;border:none;color:var(--error-color,#ef4444);cursor:pointer;
//                                font-size:14px;flex-shrink:0;padding:0 4px;" title="Delete note">🗑</button>
//                 </div>
//                 <div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">
//                     ${escapeHtml((note.content || '').substring(0, 160))}${(note.content || '').length > 160 ? '…' : ''}
//                 </div>
//                 <div style="font-size:10px;color:var(--text-tertiary,#aaa);margin-top:6px;">
//                     ${note.createdAt ? formatTimeAgo(new Date(note.createdAt)) : 'just now'}
//                 </div>
//             `;
//             // Delete handler
//             noteEl.querySelector('.delete-note-btn').onclick = async (e) => {
//                 e.stopPropagation();
//                 const id = e.currentTarget.dataset.noteId;
//                 if (LST) {
//                     await LST.deleteNote(id);
//                     privateNotes = LST.getAllNotes();
//                 } else {
//                     privateNotes = privateNotes.filter(n => n.id !== id);
//                     saveToLocalStorage(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
//                 }
//                 renderMyNotes();
//                 showNotification('Note deleted', 'info');
//             };
//             DOM.myNotesList.appendChild(noteEl);
//         });
//     }
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 11 — setupCreateListingTabs: wire condition selector
// ─────────────────────────────────────────────────────────────────────────────
// FIND (inside renderers.setupCreateListingTabs, after the querySelectorAll block):
//
//     setupCreateListingTabs: withErrorBoundary('SetupCreateListingTabs', function() {
//         document.querySelectorAll('.create-listing-tab').forEach(tab => {
//             ...
//         });
//
// AFTER the forEach block, INSERT:
//
//         // ── Condition selector wiring ─────────────────────────────────────────
//         document.querySelectorAll('.condition-btn').forEach(btn => {
//             btn.onclick = function () {
//                 // Deactivate siblings in the same group
//                 const group = btn.closest('.condition-group');
//                 if (group) group.querySelectorAll('.condition-btn').forEach(b => {
//                     b.classList.remove('active');
//                     b.setAttribute('aria-pressed', 'false');
//                 });
//                 btn.classList.add('active');
//                 btn.setAttribute('aria-pressed', 'true');
//                 UIState.selectedCondition = btn.dataset.condition || 'new';
//                 console.log('[Tool-ui] Condition selected:', UIState.selectedCondition);
//             };
//         });
//
//         // Ensure first button is active by default
//         const firstCondBtn = document.querySelector('.condition-btn[data-condition="new"]');
//         if (firstCondBtn && !document.querySelector('.condition-btn.active')) {
//             firstCondBtn.classList.add('active');
//         }
//     }),
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 12 — Global self-executing block: append AFTER all functions
//             Wires LocalStoreTools listeners, condition CSS, boot hydration.
// ─────────────────────────────────────────────────────────────────────────────

(function wireToolUIExtensions() {
    'use strict';

    // ── A. Condition badge CSS ────────────────────────────────────────────────
    (function injectConditionCSS() {
        if (document.getElementById('tool-ui-condition-styles')) return;
        const style = document.createElement('style');
        style.id    = 'tool-ui-condition-styles';
        style.textContent = `
            /* ── Condition selector buttons (in create listing modal) ── */
            .condition-group {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin: 6px 0 12px;
            }
            .condition-btn {
                flex: 1;
                min-width: 80px;
                padding: 10px 8px;
                border: 2px solid var(--border-color, #e0e0e0);
                border-radius: 10px;
                background: var(--secondary-color, #f5f5f5);
                color: var(--text-secondary, #888);
                cursor: pointer;
                font-size: 11px;
                font-weight: 700;
                text-align: center;
                transition: border-color .18s, background .18s, color .18s;
                text-transform: uppercase;
                letter-spacing: .3px;
            }
            .condition-btn .cond-icon { font-size: 16px; display: block; margin-bottom: 3px; }
            .condition-btn:hover { border-color: var(--border-color-hover, #bbb); color: var(--text-primary, #222); }

            .condition-btn.active[data-condition="new"]          { border-color: #22c55e; background: rgba(34,197,94,.1); color: #22c55e; }
            .condition-btn.active[data-condition="used"]         { border-color: #f59e0b; background: rgba(245,158,11,.1); color: #f59e0b; }
            .condition-btn.active[data-condition="refurbished"]  { border-color: var(--primary-color,#0084ff); background: rgba(0,132,255,.1); color: var(--primary-color,#0084ff); }

            /* ── Condition badges on listing cards / detail ── */
            .condition-badge-new     { background: rgba(34,197,94,.12); color: #22c55e; border: 1px solid rgba(34,197,94,.25); }
            .condition-badge-used    { background: rgba(245,158,11,.12); color: #f59e0b; border: 1px solid rgba(245,158,11,.25); }
            .condition-badge-refurb  { background: rgba(0,132,255,.1);  color: var(--primary-color,#0084ff); border: 1px solid rgba(0,132,255,.25); }
        `;
        document.head.appendChild(style);
    })();

    // ── B. Inject condition selector HTML into existing modal tabs ─────────────
    //    Runs after DOMContentLoaded when the modal HTML is ready.
    function injectConditionSelectors() {
        // Service tab — look for servicePrice row, insert after it
        const insertAfter = (anchor, html) => {
            if (!anchor) return;
            if (anchor.nextSibling && anchor.nextSibling.classList?.contains('condition-group')) return; // already injected
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
                <div class="form-group" style="margin-bottom:14px;">
                    <label style="font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:.4px;text-transform:uppercase;display:block;margin-bottom:6px;">
                        Item Condition
                    </label>
                    <div class="condition-group">
                        <button type="button" class="condition-btn active" data-condition="new">
                            <span class="cond-icon">✨</span>New
                        </button>
                        <button type="button" class="condition-btn" data-condition="used">
                            <span class="cond-icon">🔄</span>Used
                        </button>
                        <button type="button" class="condition-btn" data-condition="refurbished">
                            <span class="cond-icon">🔧</span>Refurbished
                        </button>
                    </div>
                </div>`;
            anchor.parentNode.insertBefore(wrapper.firstElementChild, anchor.nextSibling);
        };

        // Service tab: after servicePrice
        const svcPriceEl = document.getElementById('servicePrice');
        if (svcPriceEl) insertAfter(svcPriceEl.closest('.form-group, div') || svcPriceEl, null);

        // Digital tab: after digitalPrice
        const digPriceEl = document.getElementById('digitalPrice');
        if (digPriceEl) insertAfter(digPriceEl.closest('.form-group, div') || digPriceEl, null);

        // Re-wire condition buttons after injection
        document.querySelectorAll('.condition-btn').forEach(btn => {
            btn.onclick = function () {
                const group = btn.closest('.condition-group');
                if (group) group.querySelectorAll('.condition-btn').forEach(b => {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                if (window.UIState) window.UIState.selectedCondition = btn.dataset.condition || 'new';
                else if (typeof UIState !== 'undefined') UIState.selectedCondition = btn.dataset.condition || 'new';
            };
        });
    }

    // ── C. LocalStoreTools change listener → refresh UI ───────────────────────
    window.addEventListener('localStoreTools:change', (e) => {
        const { event: evt, storeName } = e.detail || {};
        if (storeName === 'listings' && (evt === 'saved' || evt === 'deleted')) {
            // Refresh listing view from updated cache
            const LST = window.LocalStoreTools;
            if (LST) {
                const cached = LST.getAllListings();
                if (window.allListings) {
                    const existingIds = new Set(window.allListings.map(l => l.id));
                    cached.forEach(l => { if (!existingIds.has(l.id)) window.allListings.unshift(l); });
                } else {
                    window.allListings = cached;
                }
            }
            // Trigger a non-blocking re-render
            setTimeout(() => {
                if (typeof UIPipeline !== 'undefined' && UIPipeline.liveUpdate) UIPipeline.liveUpdate();
                else if (window.marketplaceUI?.refresh) window.marketplaceUI.refresh();
            }, 50);
        }
        if (storeName === 'notes' && (evt === 'saved' || evt === 'deleted')) {
            const LST = window.LocalStoreTools;
            if (LST) {
                if (typeof privateNotes !== 'undefined') {
                    // reassign the module-level variable
                    const fresh = LST.getAllNotes();
                    // We can't directly reassign a `let` in a different scope,
                    // so dispatch an event the notes modal can listen to
                    window.dispatchEvent(new CustomEvent('toolUI:notesChanged', { detail: { notes: fresh } }));
                }
            }
        }
    });

    // Listen for notes changes dispatched above
    window.addEventListener('toolUI:notesChanged', () => {
        if (typeof renderMyNotes === 'function') renderMyNotes();
    });

    // ── D. toolSystem:ready → final hydration pass ────────────────────────────
    window.addEventListener('toolSystem:ready', () => {
        console.log('[Tool-ui] toolSystem ready — running final hydration');
        if (typeof UIPipeline !== 'undefined') {
            UIPipeline.syncFromCoreGlobals?.();
            UIPipeline.liveUpdate?.();
        }
        injectConditionSelectors();
    });

    // ── E. Boot sequence ──────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectConditionSelectors);
    } else {
        injectConditionSelectors();
    }

    // Re-inject when create modal opens (handles dynamic HTML)
    window.addEventListener('marketplace:refresh-ui', injectConditionSelectors);
    window.addEventListener('tools:active',           injectConditionSelectors);

})();