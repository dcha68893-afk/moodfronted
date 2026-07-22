/**
 * PART 3/3 — PANELS, INIT, NOTIFICATIONS & PUBLIC API
 * UI panel handlers, mobile back-button handling, the notification system, full initialization, settings-sync listener, UI system bootstrap, call-history message listener, helper functions, the module's public surface (window.callsUI — used by calls-core.js and calls.html), and the call-container guard / calls-list menu additions at the end of the file.
 *
 * SOURCE FRAGMENT of calls-ui.js (shares one scope with the other 2 parts).
 * Concatenate in numeric order (part0, part1, part2) via build.js before serving.
 * Do NOT <script src> this file on its own.
 */
    // ==================== UI PANEL HANDLERS ====================
    const UIPanelHandlers = {
        openParticipantsPanel: function() {
            this.createParticipantsPanel();
        },
        
        openChatPanel: function() {
            this.createChatPanel();
        },
        
        openWhiteboardPanel: function() {
            this.createWhiteboardPanel();
        },
        
        openNotesPanel: function() {
            this.createNotesPanel();
        },
        
        openPollsPanel: function() {
            this.createPollsPanel();
        },
        
        openRelationshipPanel: function() {
            this.createRelationshipPanel();
        },
        
        createParticipantsPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel participants-panel';

            // Get real participants from call state
            const currentUserId = window.__CHILD_SESSION__?.userId;
            const currentUsername = window.__CHILD_SESSION__?.username || 'You';
            const callParticipants = UIState.callParticipants || callsState?.callParticipants || [];
            const contacts = UIState.contacts || window.__cachedCallContacts || [];

            // Build participant rows
            const participantRows = callParticipants.map(function(p) {
                const contact = contacts.find(function(c){ return c.id === p.id || c.userId === p.id; });
                const name = p.name || p.username || (contact && (contact.displayName || contact.username)) || ('User ' + p.id);
                const initials = name.split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().substring(0,2) || '??';
                const isOnline = p.isOnline !== undefined ? p.isOnline : true;
                return `<div class="participant-item" data-id="${p.id}">
                    <div class="participant-avatar" style="background-color:#6c5ce7">${initials}</div>
                    <div class="participant-info">
                        <div class="participant-name">${name}</div>
                        <div class="participant-status ${isOnline ? 'online' : 'offline'}">
                            <span class="status-dot"></span> ${isOnline ? 'Connected' : 'Disconnected'}
                        </div>
                    </div>
                    ${p.isHost ? '<span class="host-badge">Host</span>' : ''}
                    <button class="participant-action-btn mute-participant" data-id="${p.id}" title="Mute"><i class="fas fa-microphone-slash"></i></button>
                </div>`;
            }).join('');

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-users"></i> Participants (${callParticipants.length + 1})</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="participant-item self">
                        <div class="participant-avatar" style="background-color:#6c5ce7">${currentUsername.substring(0,2).toUpperCase()}</div>
                        <div class="participant-info">
                            <div class="participant-name">${currentUsername} (You)</div>
                            <div class="participant-status online"><span class="status-dot"></span> Connected</div>
                        </div>
                        <span class="host-badge">You</span>
                    </div>
                    ${participantRows || '<div class="empty-participants"><i class="fas fa-user-plus"></i><p>No other participants yet</p></div>'}
                </div>
                <div class="panel-footer">
                    <button class="panel-action-btn invite-btn" id="inviteParticipantBtn">
                        <i class="fas fa-user-plus"></i> Invite
                    </button>
                </div>`;

            document.body.appendChild(panel);
            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('participantsPanel'); });
            panel.querySelector('#inviteParticipantBtn')?.addEventListener('click', () => {
                showNotification('Share the call link to invite participants', 'info');
                if (window.callCore && window.callCore.getCallLink) {
                    window.callCore.getCallLink().then(function(link){ if(link){ navigator.clipboard?.writeText(link); showNotification('Call link copied!', 'success'); }});
                }
            });
            UIState.activePanels.add('participantsPanel');
        },

        createChatPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel chat-panel';
            const now = formatCallClockTime(Date.now());
            const currentUsername = window.__CHILD_SESSION__?.username || 'You';

            // Load chat history from state
            const chatMessages = UIState.callChatMessages || [];
            const messagesHtml = chatMessages.map(function(m) {
                const isSelf = m.senderId === (window.__CHILD_SESSION__?.userId);
                return `<div class="chat-message ${isSelf ? 'self' : 'other'}">
                    <div class="message-sender">${isSelf ? 'You' : (m.senderName || 'Participant')}</div>
                    <div class="message-content">${m.text}</div>
                    <div class="message-time">${formatCallChatTimestamp(m.timestamp)}</div>
                </div>`;
            }).join('');

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-comment"></i> In-Call Chat</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="chat-messages" id="chatMessagesPanel">
                        <div class="chat-message system">
                            <div class="message-content">Chat started • ${now}</div>
                        </div>
                        ${messagesHtml}
                    </div>
                    <div class="chat-input-container">
                        <input type="text" class="chat-input" id="chatInputPanel" placeholder="Type a message..." aria-label="Chat message">
                        <button class="chat-send-btn" id="chatSendPanel" aria-label="Send message"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>`;

            document.body.appendChild(panel);
            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('chatPanel'); });

            const chatInput = panel.querySelector('#chatInputPanel');
            const chatSend = panel.querySelector('#chatSendPanel');
            const messagesContainer = panel.querySelector('.chat-messages');

            const sendMessage = () => {
                const message = chatInput.value.trim();
                if (!message) return;
                // Send via core
                if (coreInstance && coreInstance.sendChatMessage) {
                    coreInstance.sendChatMessage(message);
                } else if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'CALL_CHAT_MESSAGE', payload: { message, senderId: window.__CHILD_SESSION__?.userId, senderName: currentUsername, timestamp: Date.now() }}, '*');
                }
                // Append locally
                const msgEl = document.createElement('div');
                msgEl.className = 'chat-message self';
                msgEl.innerHTML = `<div class="message-sender">You</div><div class="message-content">${message}</div><div class="message-time">${formatCallChatTimestamp(Date.now())}</div>`;
                messagesContainer.appendChild(msgEl);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                // Store in state
                if (!UIState.callChatMessages) UIState.callChatMessages = [];
                UIState.callChatMessages.push({ senderId: window.__CHILD_SESSION__?.userId, senderName: 'You', text: message, timestamp: Date.now() });
                chatInput.value = '';
            };

            chatSend.addEventListener('click', sendMessage);
            chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

            // Listen for incoming messages
            window.__callChatPanelRef = panel;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            UIState.activePanels.add('chatPanel');
        },

        createWhiteboardPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel whiteboard-panel';
            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-chalkboard"></i> Shared Whiteboard</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="whiteboard-toolbar">
                        <button class="tool-btn active" data-tool="pen" title="Pen"><i class="fas fa-pen"></i></button>
                        <button class="tool-btn" data-tool="eraser" title="Eraser"><i class="fas fa-eraser"></i></button>
                        <button class="tool-btn" data-tool="text" title="Text"><i class="fas fa-font"></i></button>
                        <button class="tool-btn" data-tool="line" title="Line"><i class="fas fa-slash"></i></button>
                        <button class="tool-btn" data-tool="rect" title="Rectangle"><i class="fas fa-square"></i></button>
                        <span class="toolbar-sep"></span>
                        <input type="color" id="wbColorPicker" value="#ff3b30" title="Color" style="width:32px;height:32px;padding:2px;cursor:pointer;border:none;background:none;">
                        <input type="range" id="wbSizeSlider" min="1" max="20" value="3" title="Size" style="width:60px;">
                        <button class="tool-btn" id="wbUndoBtn" title="Undo"><i class="fas fa-undo"></i></button>
                        <button class="tool-btn" id="wbClearBtn" title="Clear"><i class="fas fa-trash"></i></button>
                        <button class="tool-btn" id="wbSaveBtn" title="Save image"><i class="fas fa-download"></i></button>
                    </div>
                    <canvas id="wbCanvas" style="background:#fff;cursor:crosshair;touch-action:none;width:100%;max-height:420px;display:block;" width="800" height="420"></canvas>
                </div>`;

            document.body.appendChild(panel);

            const canvas = panel.querySelector('#wbCanvas');
            const ctx = canvas.getContext('2d');
            let drawing = false, lastX = 0, lastY = 0, currentTool = 'pen';
            let currentColor = '#ff3b30', currentSize = 3;
            const history = [];

            const saveHistory = () => history.push(canvas.toDataURL());
            const getPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
                const src = e.touches ? e.touches[0] : e;
                return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
            };

            const startDraw = (e) => { drawing = true; saveHistory(); const p = getPos(e); lastX = p.x; lastY = p.y; };
            const draw = (e) => {
                if (!drawing) return;
                e.preventDefault();
                const p = getPos(e);
                ctx.beginPath();
                if (currentTool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = currentSize * 5; }
                else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = currentColor; ctx.lineWidth = currentSize; }
                ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
                lastX = p.x; lastY = p.y;
            };
            const stopDraw = () => { drawing = false; };

            canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stopDraw); canvas.addEventListener('mouseleave', stopDraw);
            canvas.addEventListener('touchstart', startDraw, {passive:false}); canvas.addEventListener('touchmove', draw, {passive:false}); canvas.addEventListener('touchend', stopDraw);

            panel.querySelectorAll('.tool-btn[data-tool]').forEach(btn => btn.addEventListener('click', () => { panel.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentTool = btn.dataset.tool; }));
            panel.querySelector('#wbColorPicker').addEventListener('input', (e) => { currentColor = e.target.value; });
            panel.querySelector('#wbSizeSlider').addEventListener('input', (e) => { currentSize = parseInt(e.target.value); });
            panel.querySelector('#wbUndoBtn').addEventListener('click', () => { if (history.length > 0) { const img = new Image(); img.onload = () => { ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0); }; img.src = history.pop(); } });
            panel.querySelector('#wbClearBtn').addEventListener('click', () => { if (confirm('Clear whiteboard?')) { saveHistory(); ctx.clearRect(0,0,canvas.width,canvas.height); } });
            panel.querySelector('#wbSaveBtn').addEventListener('click', () => { const a = document.createElement('a'); a.download = 'whiteboard.png'; a.href = canvas.toDataURL(); a.click(); });
            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('whiteboardPanel'); });
            UIState.activePanels.add('whiteboardPanel');
        },

        createNotesPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel notes-panel';
            const savedNotes = UIState.callNotes || localStorage.getItem('call_notes_' + (UIState.activeCallId || 'default')) || '';
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-sticky-note"></i> Call Notes</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="notes-meta" style="font-size:11px;color:#888;padding:4px 8px">${now} · Auto-saved locally</div>
                    <textarea class="notes-editor" id="sharedNotesEditor" placeholder="Take notes during this call..." style="width:100%;min-height:280px;padding:12px;font-size:14px;border:none;outline:none;resize:vertical;background:transparent;">${savedNotes}</textarea>
                    <div class="notes-toolbar" style="display:flex;gap:8px;padding:8px;border-top:1px solid rgba(255,255,255,.1)">
                        <button class="notes-btn" id="saveNotesBtn" style="flex:1;padding:8px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;cursor:pointer"><i class="fas fa-save"></i> Save</button>
                        <button class="notes-btn" id="copyNotesBtn" style="padding:8px 12px;background:rgba(255,255,255,.1);color:#fff;border:none;border-radius:8px;cursor:pointer"><i class="fas fa-copy"></i> Copy</button>
                        <button class="notes-btn" id="clearNotesBtn" style="padding:8px 12px;background:rgba(255,0,0,.2);color:#ff6b6b;border:none;border-radius:8px;cursor:pointer"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;

            document.body.appendChild(panel);

            const editor = panel.querySelector('#sharedNotesEditor');
            const storageKey = 'call_notes_' + (UIState.activeCallId || 'default');

            // Auto-save on every keystroke
            editor.addEventListener('input', () => {
                UIState.callNotes = editor.value;
                localStorage.setItem(storageKey, editor.value);
            });

            panel.querySelector('#saveNotesBtn').addEventListener('click', () => {
                UIState.callNotes = editor.value;
                localStorage.setItem(storageKey, editor.value);
                if (coreInstance && coreInstance.saveNotes) coreInstance.saveNotes(editor.value);
                showNotification('Notes saved', 'success');
            });
            panel.querySelector('#copyNotesBtn').addEventListener('click', () => {
                navigator.clipboard?.writeText(editor.value).then(() => showNotification('Copied to clipboard', 'success'));
            });
            panel.querySelector('#clearNotesBtn').addEventListener('click', () => {
                if (confirm('Clear all notes?')) { editor.value = ''; UIState.callNotes = ''; localStorage.removeItem(storageKey); }
            });
            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('notesPanel'); });
            UIState.activePanels.add('notesPanel');
        },

        createPollsPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel polls-panel';

            // Real polls state stored in UIState
            if (!UIState.callPolls) UIState.callPolls = [];

            const renderPolls = () => {
                const list = panel.querySelector('#activePolls');
                if (!list) return;
                if (UIState.callPolls.length === 0) {
                    list.innerHTML = '<div style="text-align:center;padding:24px;color:#888"><i class="fas fa-poll" style="font-size:32px;margin-bottom:8px"></i><p>No active polls yet</p></div>';
                    return;
                }
                list.innerHTML = UIState.callPolls.map((poll, pi) => {
                    const totalVotes = poll.options.reduce((s,o) => s + (o.votes||0), 0);
                    return `<div class="poll-item" style="background:rgba(255,255,255,.05);border-radius:12px;padding:12px;margin-bottom:8px">
                        <div style="font-weight:600;margin-bottom:8px">${poll.question}</div>
                        ${poll.options.map((opt, oi) => {
                            const pct = totalVotes > 0 ? Math.round((opt.votes||0)/totalVotes*100) : 0;
                            const voted = poll.myVote === oi;
                            return `<div class="poll-option-row" style="margin-bottom:6px">
                                <button onclick="window.__votePoll(${pi},${oi})" style="width:100%;text-align:left;background:${voted?'rgba(108,92,231,.4)':'rgba(255,255,255,.05)'};border:${voted?'1px solid #6c5ce7':'1px solid transparent'};border-radius:8px;padding:8px 10px;color:#fff;cursor:pointer;position:relative;overflow:hidden">
                                    <div style="position:absolute;top:0;left:0;height:100%;width:${pct}%;background:rgba(108,92,231,.2);transition:width .3s"></div>
                                    <span style="position:relative">${opt.text} ${voted?'✓':''}</span>
                                    <span style="position:relative;float:right;font-size:12px;color:#888">${pct}% (${opt.votes||0})</span>
                                </button>
                            </div>`;
                        }).join('')}
                        <div style="font-size:11px;color:#888;margin-top:4px">${totalVotes} vote${totalVotes!==1?'s':''}</div>
                    </div>`;
                }).join('');
            };

            window.__votePoll = (pollIdx, optionIdx) => {
                const poll = UIState.callPolls[pollIdx];
                if (!poll) return;
                if (poll.myVote !== undefined) { showNotification('You already voted', 'info'); return; }
                if (!poll.options[optionIdx]) return;
                poll.options[optionIdx].votes = (poll.options[optionIdx].votes || 0) + 1;
                poll.myVote = optionIdx;
                // Broadcast via core
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'CALL_POLL_VOTE', payload: { pollIdx, optionIdx, callId: UIState.activeCallId }}, '*');
                }
                renderPolls();
            };

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-poll"></i> Polls</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div id="activePolls" style="margin-bottom:16px"></div>
                    <div style="background:rgba(255,255,255,.05);border-radius:12px;padding:12px">
                        <div style="font-weight:600;margin-bottom:8px"><i class="fas fa-plus-circle"></i> Create Poll</div>
                        <input type="text" id="pollQuestion" placeholder="Poll question..." style="width:100%;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#fff;margin-bottom:8px">
                        <div id="pollOptionsContainer">
                            <input type="text" class="poll-opt" placeholder="Option 1" style="width:100%;padding:6px 8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;margin-bottom:4px">
                            <input type="text" class="poll-opt" placeholder="Option 2" style="width:100%;padding:6px 8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;margin-bottom:4px">
                        </div>
                        <button id="addPollOptBtn" style="background:none;border:1px dashed rgba(255,255,255,.3);color:#888;padding:4px 10px;border-radius:6px;cursor:pointer;margin-bottom:8px;font-size:12px">+ Add option</button>
                        <button id="createPollBtn" style="width:100%;padding:10px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">Create Poll</button>
                    </div>
                </div>`;

            document.body.appendChild(panel);
            renderPolls();

            panel.querySelector('#addPollOptBtn').addEventListener('click', () => {
                const container = panel.querySelector('#pollOptionsContainer');
                const count = container.querySelectorAll('.poll-opt').length + 1;
                const input = document.createElement('input');
                input.type = 'text'; input.className = 'poll-opt'; input.placeholder = 'Option ' + count;
                input.style.cssText = 'width:100%;padding:6px 8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#fff;margin-bottom:4px';
                container.appendChild(input);
            });

            panel.querySelector('#createPollBtn').addEventListener('click', () => {
                const question = panel.querySelector('#pollQuestion').value.trim();
                const options = Array.from(panel.querySelectorAll('.poll-opt')).map(i => i.value.trim()).filter(Boolean);
                if (!question) { showNotification('Enter a poll question', 'warning'); return; }
                if (options.length < 2) { showNotification('Add at least 2 options', 'warning'); return; }
                const newPoll = { question, options: options.map(t => ({text:t,votes:0})), createdAt: Date.now(), myVote: undefined };
                UIState.callPolls.push(newPoll);
                // Broadcast
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'CALL_POLL_CREATED', payload: { poll: newPoll, callId: UIState.activeCallId }}, '*');
                }
                showNotification('Poll created!', 'success');
                renderPolls();
                panel.querySelector('#pollQuestion').value = '';
                panel.querySelectorAll('.poll-opt').forEach((i,idx) => { i.value = ''; if(idx>1) i.remove(); });
            });

            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('pollsPanel'); });
            UIState.activePanels.add('pollsPanel');
        },

        createRelationshipPanel: function() {
            const existingPanel = document.querySelector('.feature-panel');
            if (existingPanel) existingPanel.remove();

            const panel = document.createElement('div');
            panel.className = 'feature-panel relationship-panel';

            // Gather real stats from call history
            const callHistory = UIState.callHistory || [];
            const currentUserId = window.__CHILD_SESSION__?.userId;
            const contacts = UIState.contacts || window.__cachedCallContacts || [];

            // Compute real stats
            const completedCalls = callHistory.filter(c => c.status === 'completed');
            const totalDuration = completedCalls.reduce((s, c) => s + (c.duration || 0), 0);
            const avgDuration = completedCalls.length > 0 ? Math.round(totalDuration / completedCalls.length) : 0;
            const avgMins = Math.floor(avgDuration / 60), avgSecs = avgDuration % 60;
            const missedCalls = callHistory.filter(c => c.status === 'missed').length;

            // Contact frequency map
            const contactFreq = {};
            callHistory.forEach(call => {
                const otherId = call.callerId === currentUserId ? call.receiverId : call.callerId;
                if (otherId) contactFreq[otherId] = (contactFreq[otherId] || 0) + 1;
            });
            const topContactId = Object.keys(contactFreq).sort((a,b) => contactFreq[b]-contactFreq[a])[0];
            const topContact = contacts.find(c => String(c.id) === String(topContactId));
            const topContactName = topContact ? (topContact.displayName || topContact.username) : (topContactId ? '#'+topContactId : 'N/A');

            // Day frequency
            const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const dayFreq = [0,0,0,0,0,0,0];
            callHistory.forEach(call => { if (call.startedAt) dayFreq[new Date(call.startedAt).getDay()]++; });
            const maxDay = Math.max(...dayFreq) || 1;
            const busiestDay = dayNames[dayFreq.indexOf(Math.max(...dayFreq))];
            const chartBars = dayFreq.map((count, i) => `<div class="chart-bar" style="height:${Math.round(count/maxDay*80)+10}%;position:relative" title="${count} calls">
                <div style="position:absolute;bottom:100%;width:100%;text-align:center;font-size:9px;color:#888">${count||''}</div>
                ${dayNames[i]}
            </div>`).join('');

            panel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-chart-line"></i> Relationship Insights</h4>
                    <button class="panel-close-btn" aria-label="Close panel"><i class="fas fa-times"></i></button>
                </div>
                <div class="panel-content">
                    <div class="insight-cards">
                        <div class="insight-card">
                            <div class="insight-title">Total Calls</div>
                            <div class="insight-value">${callHistory.length}</div>
                            <div class="insight-description">All time</div>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Avg Duration</div>
                            <div class="insight-value">${avgMins}m ${avgSecs}s</div>
                            <div class="insight-description">Per completed call</div>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Missed Calls</div>
                            <div class="insight-value" style="color:${missedCalls>0?'#e74c3c':'#2ecc71'}">${missedCalls}</div>
                            <div class="insight-description">Unanswered</div>
                        </div>
                        <div class="insight-card">
                            <div class="insight-title">Top Contact</div>
                            <div class="insight-value" style="font-size:16px">${topContactName}</div>
                            <div class="insight-description">${topContactId ? contactFreq[topContactId]+' calls' : 'No calls yet'}</div>
                        </div>
                    </div>
                    <div class="relationship-chart">
                        <h5>Call Frequency by Day <span style="font-size:11px;color:#888">(busiest: ${busiestDay})</span></h5>
                        <div class="chart-container" style="display:flex;align-items:flex-end;gap:4px;height:80px;padding:0 4px">
                            ${callHistory.length > 0 ? chartBars : '<div style="color:#888;font-size:12px;align-self:center;width:100%;text-align:center">No call history yet</div>'}
                        </div>
                    </div>
                </div>`;

            document.body.appendChild(panel);

            // Load real call history if not already loaded
            if (callHistory.length === 0 && window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'REFRESH_CALL_HISTORY', payload: { userId: currentUserId }}, '*');
            }

            panel.querySelector('.panel-close-btn').addEventListener('click', () => { panel.remove(); UIState.activePanels.delete('relationshipPanel'); });
            UIState.activePanels.add('relationshipPanel');
        }
    };  // end UIPanelHandlers


    // ==================== MOBILE BACK BUTTON SETUP ====================
    function setupMobileBackButton() {
        const mobileBackBtn = document.getElementById('mobileBackBtn');
        if (mobileBackBtn) {
            mobileBackBtn.addEventListener('click', function() {
                // Hide call container, show sidebar
                if (elements.callContainer) elements.callContainer.classList.remove('active');
                if (elements.sidebar) elements.sidebar.style.display = 'flex';
                
                // Reset call state
                UIState.currentView = 'sidebar';
                UIState.callActive = false;
                UIState.callState = 'idle';
                
                // Notify parent to show sidebar icons
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'SHOW_SIDEBAR_ICONS', module: 'calls' }, '*');
                }
                
                // If in a call, end it
                if (UIState.activeCallId && coreInstance && coreInstance.endCall) {
                    coreInstance.endCall(UIState.activeCallId);
                }
            });
        }
    }


    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    // ==================== NOTIFICATION SYSTEM ====================
    function createNotification({ type = 'info', title, message, duration = 3000 } = {}) {
    try {
        const notification = document.createElement('div');
        notification.className = `call-notification ${type}`;
        notification.setAttribute('role', 'alert');
        notification.setAttribute('data-sanitized', 'true');
        
        const iconMap = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        // Build icon div with innerHTML for static icon (safe)
        const iconDiv = document.createElement('div');
        iconDiv.className = 'call-notification-icon';
        iconDiv.setAttribute('data-sanitized', 'true');
        iconDiv.innerHTML = `<i class="fas ${iconMap[type] || 'fa-bell'}"></i>`;
        
        // Build content div with innerHTML for proper HTML rendering
        const contentDiv = document.createElement('div');
        contentDiv.className = 'call-notification-content';
        contentDiv.innerHTML = `
            <div class="call-notification-title">${escapeHtml(title || type.charAt(0).toUpperCase() + type.slice(1))}</div>
            <div class="call-notification-message">${escapeHtml(message)}</div>
        `;
        
        // Build close button with innerHTML for icon (safe)
        const closeBtn = document.createElement('button');
        closeBtn.className = 'call-notification-close';
        closeBtn.setAttribute('aria-label', 'Close notification');
        closeBtn.setAttribute('data-sanitized', 'true');
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        
        closeBtn.addEventListener('click', () => notification.remove());
        
        notification.appendChild(iconDiv);
        notification.appendChild(contentDiv);
        notification.appendChild(closeBtn);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
        
        return notification;
    } catch (error) {
        UILogger.error('createNotification', error);
        return null;
    }
}

    /**
     * _showReceiverCallScreen
     * Shows the active-call container for the RECEIVER after they accept.
     * Without this the receiver has no visible call UI after accepting.
     */
    function _showReceiverCallScreen(callId, callerName, callType) {
    // Delegate to transitionToInCall (same screen as caller)
    console.log('[UI] _showReceiverCallScreen → transitionToInCall', { callId, callerName, callType });
    UIState.callActive    = true;
    UIState.callState     = 'connected';
    UIState.callStartTime = UIState.callStartTime || Date.now();
    UIState.activeCallId  = callId || UIState.activeCallId;
    const name = callerName
        || (UIState.callParticipants && UIState.callParticipants[0] && UIState.callParticipants[0].name)
        || 'User';
    transitionToInCall({ userName: name, callType: callType || UIState.callType || 'voice' });
}

    function showNotification(message, type = 'success') {
        const notificationArea = elements.notificationArea || document.body;
        
        const notification = createNotification({
            type,
            title: type.charAt(0).toUpperCase() + type.slice(1),
            message,
            duration: 3000
        });
        
        if (notification) {
            notificationArea.appendChild(notification);
        }
    }

    function requestMediaPermissionsFn(type) {
        const constraints = {
            audio: true,
            video: type === 'video'
        };
        
        return navigator.mediaDevices.getUserMedia(constraints)
            .catch(error => {
                UILogger.error('Error getting media permissions', error);
                
                let errorMessage = 'Could not access ';
                if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                    errorMessage += 'camera/microphone. Please check your devices.';
                } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    errorMessage += 'camera/microphone. Please allow permissions.';
                } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                    errorMessage += 'camera/microphone. Device may be in use by another application.';
                } else {
                    errorMessage += 'camera/microphone. Unknown error.';
                }
                
                throw new Error(errorMessage);
            });
    }

    const ViewHistory = {
        push: function(view, data = {}) {
            UIState.viewHistory.push({
                view,
                data,
                timestamp: Date.now()
            });
            
            if (UIState.viewHistory.length > 50) {
                UIState.viewHistory.shift();
            }
            
            UIState.currentView = view;
        },
        
        pop: function() {
            UIState.viewHistory.pop();
            const previous = UIState.viewHistory[UIState.viewHistory.length - 1];
            UIState.currentView = previous?.view || 'sidebar';
            return previous;
        },
        
        createRestorePoint: function(key) {
            UIState.restorePoints.set(key, {
                view: UIState.currentView,
                activePanels: Array.from(UIState.activePanels),
                activeModals: Array.from(UIState.activeModals),
                timestamp: Date.now()
            });
            
            if (DEBUG) {
                logOnce('info', `Created restore point: ${key}`);
            }
        },
        
        restore: function(key) {
            const point = UIState.restorePoints.get(key);
            if (!point) return false;
            
            document.querySelectorAll('.feature-panel.active, .modal.active').forEach(el => {
                el.classList.remove('active');
            });
            
            UIState.activePanels.clear();
            UIState.activeModals.clear();
            
            UIState.currentView = point.view;
            
            if (DEBUG) {
                logOnce('info', `Restored from point: ${key}`);
            }
            return true;
        }
    };

    // ==================== FULL INITIALIZATION ====================
    function performFullInitialization() {
        if (DEBUG) {
            logOnce('info', 'Performing full UI initialization with core');
        }
        
        // Use coreInstance from closure
        if (window.callCore) {
            coreInstance = window.callCore;
        } else if (window.CallsCore) {
            coreInstance = window.CallsCore;
        } else if (window.callsCore) {
            coreInstance = window.callsCore;
        }
        
        initializeUISystem().catch(error => {
            if (DEBUG) {
                logOnce('error', 'Full initialization failed', error);
            }
        });
    }
function setupFriendsListListener() {
    window.addEventListener('message', function(event) {
        const data = event.data;
        
        // Handle FRIENDS_LIST_UPDATE from parent
        if (data && (data.type === 'FRIENDS_LIST_UPDATE' || data.type === 'FRIENDS_LIST_RESPONSE')) {
            const friends = data.payload?.friends || [];
            console.log('[Calls UI] Received FRIENDS_LIST_UPDATE:', friends.length, 'friends');
            // Always update if non-empty; preserve cache across refresh
            if (friends.length > 0) {
                const contacts = friends.map(function(friend) { return {
                    id: friend.id,
                    userId: friend.id,
                    name: friend.displayName || friend.username || friend.name || 'User',
                    displayName: friend.displayName || friend.username || friend.name || 'User',
                    username: friend.username || friend.name || 'User',
                    status: friend.status || (friend.isOnline ? 'online' : 'offline'),
                    isOnline: friend.isOnline || friend.status === 'online',
                    avatar: friend.avatar,
                    isPremium: friend.isPremium || false
                }; });
                UIState.contacts = contacts;
                window.__cachedCallContacts = contacts;
                window.__contactsList = contacts;
                if (typeof RenderingPipeline !== 'undefined' && RenderingPipeline.renderContactsList) {
                    RenderingPipeline.renderContactsList(contacts);
                } else if (window.callsUI && window.callsUI.renderContactsList) {
                    window.callsUI.renderContactsList(contacts);
                }
            }
        }
        
        // Handle CONTACTS_UPDATE
        if (data && data.type === 'CONTACTS_UPDATE') {
            const rawContacts = data.payload?.contacts || [];
            console.log('[Calls UI] Received CONTACTS_UPDATE:', rawContacts.length, 'contacts');
            // Normalize every contact so displayName/username are always present
            const contacts = rawContacts.map(function(c) { return {
                id:          c.id || c.userId,
                userId:      c.id || c.userId,
                name:        c.displayName || c.username || c.name || ('User #' + (c.id || c.userId)),
                displayName: c.displayName || c.username || c.name || ('User #' + (c.id || c.userId)),
                username:    c.username || c.name || c.displayName || '',
                status:      c.status || (c.isOnline ? 'online' : 'offline'),
                isOnline:    c.isOnline || c.status === 'online',
                avatar:      c.avatar || c.photoURL || '',
                isPremium:   c.isPremium || false
            }; });
            if (contacts.length > 0) {
                UIState.contacts = contacts;
                window.__cachedCallContacts = contacts;
                if (typeof RenderingPipeline !== 'undefined' && RenderingPipeline.renderContactsList) {
                    RenderingPipeline.renderContactsList(contacts);
                }
            } else if (window.__cachedCallContacts && window.__cachedCallContacts.length > 0) {
                // Restore from cache so friends don't vanish on refresh
                UIState.contacts = window.__cachedCallContacts;
                if (typeof RenderingPipeline !== 'undefined' && RenderingPipeline.renderContactsList) {
                    RenderingPipeline.renderContactsList(window.__cachedCallContacts);
                }
            }
        }
    });

    // Request friends list explicitly
    setTimeout(() => {
        if (window.parent && window.parent !== window) {
            console.log('[Calls UI] Requesting friends list from parent');
            window.parent.postMessage({
                type: 'GET_FRIENDS_LIST',
                source: 'calls',
                module: 'calls',
                timestamp: Date.now()
            }, '*');
        }
    }, 1000);
}

// Call this in initializeUISystem
setupFriendsListListener();
// ==================== SETTINGS SYNC LISTENER ====================
// Listen for settings changes broadcast by the parent and apply them
// to the local in-page toggles (emotional context, focus mode, etc.)
(function setupCallsSettingsListener() {
    function applyCallUISetting(section, key, value) {
        if (section === 'calls') {
            const map = {
                emotionalContext: 'emotionalContextToggle',
                callIntention: 'callIntentionToggle',
                inCallChat: 'inCallChatToggle',
                whiteboard: 'whiteboardToggle',
                polls: 'pollsToggle',
                sharedNotes: 'notesToggle',
                focusMode: 'focusModeToggle',
                liveReactions: 'liveReactionsToggle',
                emotionalContextEnabled: 'emotionalContextToggle',
                callIntentionEnabled: 'callIntentionToggle',
                inCallChatEnabled: 'inCallChatToggle',
                whiteboardEnabled: 'whiteboardToggle',
                pollsEnabled: 'pollsToggle',
                notesEnabled: 'notesToggle',
                focusModeEnabled: 'focusModeToggle',
                liveReactionsEnabled: 'liveReactionsToggle'
            };
            const elId = map[key];
            if (elId) {
                const el = document.getElementById(elId);
                if (el) el.checked = !!value;
            }
            if (key === 'videoQuality' || key === 'audioQuality' || key === 'voiceQuality') {
                window['__' + key] = value;
            }
        }
        if (section === 'appearance') {
            if (key === 'theme') {
                const t = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
                document.documentElement.setAttribute('data-theme', t);
                document.body.setAttribute('data-theme', t);
            }
            if (key === 'fontSize') document.documentElement.style.fontSize = value + 'px';
            if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
            if (key === 'compactMode') {
                document.documentElement.setAttribute('data-compact', value ? 'true' : 'false');
                document.body.classList.toggle('compact-mode', !!value);
            }
            if (key === 'animationsEnabled' || key === 'animations') {
                document.documentElement.setAttribute('data-animations', value ? 'true' : 'false');
                document.body.classList.toggle('no-animations', !value);
            }
        }
        if (section === 'notifications') {
            if (key === 'soundEnabled' || key === 'notificationSound') window.__notificationSoundEnabled = value;
            if (key === 'callNotifications') window.__callNotificationsEnabled = value;
        }
    }

    window.addEventListener('message', function(event) {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'SETTING_CHANGED') {
            const { section, key, value } = data.payload || data;
            if (section && key !== undefined) applyCallUISetting(section, key, value);
        }
        if (data.type === 'SETTINGS_UPDATED') {
            const settings = (data.payload || data).settings || {};
            Object.entries(settings).forEach(function([sec, secVal]) {
                if (secVal && typeof secVal === 'object') {
                    Object.entries(secVal).forEach(function([k, v]) {
                        applyCallUISetting(sec, k, v);
                    });
                }
            });
        }
    });

    window.addEventListener('appSettingsReady', function() {
        if (window.AppSettings) {
            window.AppSettings.subscribe(function(settings, path, value) {
                try {
                    if (path && path !== '*') {
                        const parts = path.split('.');
                        const section = parts[0];
                        const key = parts.slice(1).join('.');
                        applyCallUISetting(section, key, value);
                    } else {
                        Object.entries(settings).forEach(function([sec, secVal]) {
                            if (secVal && typeof secVal === 'object') {
                                Object.entries(secVal).forEach(function([k, v]) {
                                    applyCallUISetting(sec, k, v);
                                });
                            }
                        });
                    }
                } catch(err) {
                    console.warn('[CallsUI] Settings subscription error:', err);
                }
            });
        }
    }, { once: true });

    // ── VIDEO_UPGRADE_RESPONSE: remote declined → roll back camera ──────────
    window.addEventListener('message', function(event) {
        const data = event.data;

        // ── VIDEO_UPGRADE_REQUEST: remote turned on camera → show receiver toast ──
        if (data && data.type === 'VIDEO_UPGRADE_REQUEST') {
            // Only show if we're currently in a call
            if (!UIState.callActive) return;
            // Show a toast with option to enable camera
            const existing = document.getElementById('videoUpgradeToast');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.id = 'videoUpgradeToast';
            toast.style.cssText = [
                'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);',
                'background:rgba(30,30,30,0.95);color:#fff;border-radius:12px;',
                'padding:12px 16px;z-index:99999;display:flex;align-items:center;gap:10px;',
                'box-shadow:0 4px 20px rgba(0,0,0,0.4);font-size:14px;',
                'max-width:320px;width:90%;'
            ].join('');

            const peerName = UIState.callPeerName || window.__activePeerName || 'Remote';
            toast.innerHTML = `
                <i class="fas fa-video" style="color:#0084ff;font-size:18px;flex-shrink:0;"></i>
                <span style="flex:1;">${peerName} turned on camera</span>
                <button id="videoUpgradeAcceptBtn" style="background:#0084ff;color:#fff;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;flex-shrink:0;">Enable mine</button>
                <button id="videoUpgradeDismissBtn" style="background:transparent;color:#aaa;border:none;cursor:pointer;font-size:18px;padding:0 4px;">×</button>
            `;
            document.body.appendChild(toast);

            document.getElementById('videoUpgradeAcceptBtn').onclick = function() {
                toast.remove();
                // Start camera on receiver side
                UIEventHandlers.toggleVideo();
            };
            document.getElementById('videoUpgradeDismissBtn').onclick = function() {
                toast.remove();
            };
            // Auto-dismiss after 8 seconds
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 8000);
        }

        // ── VIDEO_UPGRADE_RESPONSE: remote declined → roll back camera ──────────
        if (data && data.type === 'VIDEO_UPGRADE_RESPONSE') {
        const accepted = data.payload && data.payload.accepted;
        if (accepted === false) {
            // Remote declined — stop camera and remove video track from PC
            const vTrack = UIState._videoUpgradeTrack;
            if (vTrack) {
                vTrack.stop();
                if (UIState.localStream) {
                    try { UIState.localStream.removeTrack(vTrack); } catch(e) {}
                }
                // Remove sender from peer connection and renegotiate back to audio-only
                const pc = (window.callCore && window.callCore.getPeerConnection && window.callCore.getPeerConnection())
                        || (window.KynectaCallSession && window.KynectaCallSession.peerConnection);
                if (pc) {
                    const senders = pc.getSenders ? pc.getSenders() : [];
                    senders.forEach(function(s) {
                        if (s.track === vTrack) { try { pc.removeTrack(s); } catch(e) {} }
                    });
                    pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false })
                        .then(o => pc.setLocalDescription(o))
                        .then(() => {
                            if (window.callCore && window.callCore.sendToParent) {
                                window.callCore.sendToParent('SIGNAL_OFFER', {
                                    offer: pc.localDescription,
                                    callId: window.callsState && (window.callsState.serverCallId || window.callsState.activeCallId),
                                    isVideoRollback: true
                                });
                            }
                        }).catch(() => {});
                }
                UIState._videoUpgradeTrack = null;
            }
            // Hide PiP, reset button
            const pipContainer = document.getElementById('pipContainer');
            if (pipContainer) pipContainer.style.display = 'none';
            const icon = elements.videoBtn && elements.videoBtn.querySelector('i');
            if (icon) icon.className = 'fas fa-video-slash';
            if (elements.videoBtn) elements.videoBtn.classList.remove('active');
            UIState.isVideoOff = true;
            showNotification('Remote declined video — staying audio-only', 'info');
        }
        } // end VIDEO_UPGRADE_RESPONSE if
    }); // end combined message listener

    window.addEventListener('settingChanged', function(e) {
        const { section, key, value } = e.detail || {};
        if (section && key !== undefined) applyCallUISetting(section, key, value);
    });
    window.addEventListener('settingsUpdated', function(e) {
        const settings = (e.detail || {}).settings || {};
        Object.entries(settings).forEach(function([sec, secVal]) {
            if (secVal && typeof secVal === 'object') {
                Object.entries(secVal).forEach(function([k, v]) {
                    applyCallUISetting(sec, k, v);
                });
            }
        });
    });
})();

// ==================== INITIALIZE UI SYSTEM ====================
async function initializeUISystem() {
    if (UIState.initialized) {
        if (DEBUG) {
            logOnce('info', 'UI system already initialized');
        }
        return { success: true, stages: UIState.renderStages };
    }
    
    if (DEBUG) {
        logOnce('info', 'Initializing UI system');
    }

    // Inject contact call-button styles
    if (!document.getElementById('kyn-contact-call-btn-styles')) {
        const s = document.createElement('style');
        s.id = 'kyn-contact-call-btn-styles';
        s.textContent = `
            .contact-item { display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; border-radius:10px; transition:background 0.15s; }
            .contact-item:hover { background: rgba(108,92,231,0.08); }
            .contact-call-actions { display:flex; gap:6px; margin-left:auto; flex-shrink:0; }
            .contact-audio-call-btn, .contact-video-call-btn {
                width:34px; height:34px; border-radius:50%; border:none; cursor:pointer;
                display:flex; align-items:center; justify-content:center;
                font-size:13px; transition:all 0.18s;
            }
            .contact-audio-call-btn { background:#10b981; color:#fff; }
            .contact-audio-call-btn:hover { background:#059669; transform:scale(1.1); }
            .contact-video-call-btn { background:#6c5ce7; color:#fff; }
            .contact-video-call-btn:hover { background:#5a4bd1; transform:scale(1.1); }
        `;
        document.head.appendChild(s);
    }
    
    cacheElements();
    await RenderingPipeline.execute();
    
    loadCachedCallHistory();
    
    if (coreInstance && !fallbackModeActive) {
        CoreIntegration.subscribeToCore();
    }
    
    if (window.ResponsiveEngine) {
        ResponsiveEngine.initialize();
    }
    
    UIState.renderStages.initial = true;
    UIState.initialized = true;
    
    setupOpenCallWithUserListener();
    setupMobileBackButton();
    
    window.dispatchEvent(new CustomEvent('calls.ui.ready', {
        detail: { timestamp: Date.now() }
    }));
    
    if (DEBUG) {
        logOnce('info', 'UI initialization complete', {
            renderStages: UIState.renderStages,
            renderCount: UIState.renderCount,
            elementsCached: UIState.cachedElements.size,
            handshake: { parentReady, sessionReady, handshakeComplete, inPassiveMode, coreReady, coreLifecycleState },
            session: { valid: isSessionValid(), invalid: _sessionInvalid },
            coreLifecycle: coreLifecycleState
        });
    }
    
    return {
        success: true,
        stages: UIState.renderStages,
        diagnostics: UIDiagnostics.getReport()
    };
}

// ==================== MESSAGE LISTENER FOR CALL HISTORY ====================
window.addEventListener('message', function(event) {
    const data = event.data;
    if (data && data.type === 'CALL_HISTORY_UPDATE') {
        const calls = data.payload?.calls || [];
        const isLoading = data.payload?.loading;
        const hasError = data.payload?.error;
        
        console.log('[Calls UI] CALL_HISTORY_UPDATE received:', calls.length, 'calls, loading:', isLoading, 'error:', hasError);

        if (calls && calls.length > 0) {
            UIState.callHistory = calls;
            window.__cachedCallHistory = calls;
        }
        
        const allCallsList = document.getElementById('allCallsList');
        if (!allCallsList) return;
        
        if (isLoading) {
            allCallsList.innerHTML = `<div class="offline-state"><i class="fas fa-spinner fa-spin"></i><p>Loading calls...</p></div>`;
            return;
        }
        
        if (hasError) {
            allCallsList.innerHTML = `<div class="offline-state"><i class="fas fa-exclamation-triangle"></i><p>Unable to load call history</p><p class="subtext">Please try again later</p></div>`;
            return;
        }
        
        if (!calls || calls.length === 0) {
            allCallsList.innerHTML = `<div class="offline-state"><i class="fas fa-phone-slash"></i><p>No recent calls</p><p class="subtext">Your call history will appear here</p></div>`;
            return;
        }

        // FIX: previously duplicated the row-rendering logic here without the
        // message (chat-action-btn) icon, which silently clobbered the
        // full-featured rows from displayCallHistory() on every update and
        // made the message icon disappear/stop working intermittently.
        // displayCallHistory() is now the single source of truth for this list.
        displayCallHistory(calls);
    }
});

// ==================== HELPER FUNCTIONS ====================
function escapeHtmlForCall(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function handleCallActionClick(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    var btn = this;
    var userId = btn.dataset && btn.dataset.userId;
    var userName = (btn.dataset && btn.dataset.userName) || 'User';
    var callType = (btn.dataset && btn.dataset.callType) || 'voice';

    if (!userId) {
        console.warn('[Calls UI] handleCallActionClick: missing data-user-id on button', btn);
        return;
    }

    console.log('[Calls UI] Call-back triggered:', { userId: userId, userName: userName, callType: callType });

    if (typeof startCallWithUser === 'function') {
        startCallWithUser(userId, userName, callType);
    } else if (window.callCore && typeof window.callCore.startCall === 'function') {
        window.callCore.startCall(userId, callType);
    } else {
        try {
            window.parent.postMessage({
                type: 'INITIATE_CALL',
                payload: { userId: userId, userName: userName, callType: callType },
                source: 'calls-iframe',
                timestamp: Date.now()
            }, '*');
        } catch (err) {
            console.error('[Calls UI] handleCallActionClick: could not initiate call', err);
        }
    }
}

// ==================== EXPORTS ====================
const safeBind = (fn, context) => {
    if (typeof fn === 'function') {
        return fn.bind(context);
    }
    return function() {};
};

const PanelHandlers = UIPanelHandlers;
const openParticipantsPanel = safeBind(UIPanelHandlers.openParticipantsPanel, UIPanelHandlers);
const openChatPanel = safeBind(UIPanelHandlers.openChatPanel, UIPanelHandlers);
const openWhiteboardPanel = safeBind(UIPanelHandlers.openWhiteboardPanel, UIPanelHandlers);
const openNotesPanel = safeBind(UIPanelHandlers.openNotesPanel, UIPanelHandlers);
const openPollsPanel = safeBind(UIPanelHandlers.openPollsPanel, UIPanelHandlers);
const openRelationshipPanel = safeBind(UIPanelHandlers.openRelationshipPanel, UIPanelHandlers);
const createParticipantsPanel = safeBind(UIPanelHandlers.createParticipantsPanel, UIPanelHandlers);
const createChatPanel = safeBind(UIPanelHandlers.createChatPanel, UIPanelHandlers);
const createWhiteboardPanel = safeBind(UIPanelHandlers.createWhiteboardPanel, UIPanelHandlers);
const createNotesPanel = safeBind(UIPanelHandlers.createNotesPanel, UIPanelHandlers);
const createPollsPanel = safeBind(UIPanelHandlers.createPollsPanel, UIPanelHandlers);
const createRelationshipPanel = safeBind(UIPanelHandlers.createRelationshipPanel, UIPanelHandlers);

const EventHandlers = UIEventHandlers;
const toggleMenuDots = safeBind(UIEventHandlers.toggleMenuDots, UIEventHandlers);
const closeMenuDots = safeBind(UIEventHandlers.closeMenuDots, UIEventHandlers);
const openNewCallModal = safeBind(UIEventHandlers.openNewCallModal, UIEventHandlers);
const closeNewCallModal = safeBind(UIEventHandlers.closeNewCallModal, UIEventHandlers);
const searchContacts = safeBind(UIEventHandlers.searchContacts, UIEventHandlers);
const searchGroupContacts = safeBind(UIEventHandlers.searchGroupContacts, UIEventHandlers);
const selectGroupOption = safeBind(UIEventHandlers.selectGroupOption, UIEventHandlers);

const startVoiceCall = () => UIEventHandlers.startCallGeneric('voice');
const startVideoCall = () => UIEventHandlers.startCallGeneric('video');

const startGroupCall = safeBind(UIEventHandlers.startGroupCall, UIEventHandlers);
const generateVoiceCallLink = safeBind(UIEventHandlers.generateVoiceCallLink, UIEventHandlers);
const generateVideoCallLink = safeBind(UIEventHandlers.generateVideoCallLink, UIEventHandlers);
const copyCallLink = safeBind(UIEventHandlers.copyCallLink, UIEventHandlers);
const shareCallLink = safeBind(UIEventHandlers.shareCallLink, UIEventHandlers);
const toggleMute = safeBind(UIEventHandlers.toggleMute, UIEventHandlers);
const toggleVideo = safeBind(UIEventHandlers.toggleVideo, UIEventHandlers);
const toggleScreenShare = safeBind(UIEventHandlers.toggleScreenShare, UIEventHandlers);
const toggleSpeaker = safeBind(UIEventHandlers.toggleSpeaker, UIEventHandlers);
const openMoodSelectionModal = safeBind(UIEventHandlers.openMoodSelectionModal, UIEventHandlers);
const closeMoodSelectionModal = safeBind(UIEventHandlers.closeMoodSelectionModal, UIEventHandlers);
const setMood = safeBind(UIEventHandlers.setMood, UIEventHandlers);
const openIntentionSelectionModal = safeBind(UIEventHandlers.openIntentionSelectionModal, UIEventHandlers);
const closeIntentionSelectionModal = safeBind(UIEventHandlers.closeIntentionSelectionModal, UIEventHandlers);
const setIntention = safeBind(UIEventHandlers.setIntention, UIEventHandlers);
const toggleFocusMode = safeBind(UIEventHandlers.toggleFocusMode, UIEventHandlers);
const enableFocusMode = safeBind(UIEventHandlers.enableFocusMode, UIEventHandlers);
const disableFocusMode = safeBind(UIEventHandlers.disableFocusMode, UIEventHandlers);
const endCall = safeBind(UIEventHandlers.endCall, UIEventHandlers);
const skipPrivateNotes = safeBind(UIEventHandlers.skipPrivateNotes, UIEventHandlers);
const savePrivateNotes = safeBind(UIEventHandlers.savePrivateNotes, UIEventHandlers);
const showCallSummary = safeBind(UIEventHandlers.showCallSummary, UIEventHandlers);
const closeCallSummary = safeBind(UIEventHandlers.closeCallSummary, UIEventHandlers);
const declineIncomingCall = safeBind(UIEventHandlers.declineIncomingCall, UIEventHandlers);
const acceptIncomingCall = safeBind(UIEventHandlers.acceptIncomingCall, UIEventHandlers);
const acceptIncomingCallAsVideo = safeBind(UIEventHandlers.acceptIncomingCallAsVideo, UIEventHandlers);
const switchCallCategory = safeBind(UIEventHandlers.switchCallCategory, UIEventHandlers);
const switchNewCallTab = safeBind(UIEventHandlers.switchNewCallTab, UIEventHandlers);
const toggleSettingsPanel = safeBind(UIEventHandlers.toggleSettingsPanel, UIEventHandlers);
const openPaymentModal = safeBind(UIEventHandlers.openPaymentModal, UIEventHandlers);
const closePaymentModal = safeBind(UIEventHandlers.closePaymentModal, UIEventHandlers);
const selectPaymentOption = safeBind(UIEventHandlers.selectPaymentOption, UIEventHandlers);
const processPayment = safeBind(UIEventHandlers.processPayment, UIEventHandlers);
const closePremiumLimitModal = safeBind(UIEventHandlers.closePremiumLimitModal, UIEventHandlers);
const sendReaction = safeBind(UIEventHandlers.sendReaction, UIEventHandlers);
const handleLogout = safeBind(UIEventHandlers.handleLogout, UIEventHandlers);

const requestMediaPermissionsFnExport = requestMediaPermissionsFn;

const EventSystemExport = EventSystem;
const RenderingPipelineExport = RenderingPipeline;
const CoreIntegrationExport = CoreIntegration;
const ResponsiveEngineExport = ResponsiveEngine;
const SecuritySanitizerExport = SecuritySanitizer;
const ViewHistoryExport = ViewHistory;

const UIStateExport = UIState;
const UIDiagnosticsExport = UIDiagnostics;
const UILoggerExport = UILogger;
const UIErrorBoundaryExport = UIErrorBoundary;

const elementsExport = elements;

const handleContactClick = function(e) {
    if (e.target.closest('.contact-checkbox')) return;
    const checkbox = this.querySelector('.contact-checkbox');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
            this.classList.add('selected');
        } else {
            this.classList.remove('selected');
        }
    }
};

window.callsUI = {
    initializeUISystem,
    cacheElements,
    PanelHandlers,
    openParticipantsPanel,
    openChatPanel,
    openWhiteboardPanel,
    openNotesPanel,
    openPollsPanel,
    openRelationshipPanel,
    createParticipantsPanel,
    createChatPanel,
    createWhiteboardPanel,
    createNotesPanel,
    createPollsPanel,
    createRelationshipPanel,
    EventHandlers,
    toggleMenuDots,
    closeMenuDots,
    openNewCallModal,
    closeNewCallModal,
    searchContacts,
    searchGroupContacts,
    selectGroupOption,
    startVoiceCall,
    startVideoCall,
    startGroupCall,
    generateVoiceCallLink,
    generateVideoCallLink,
    copyCallLink,
    shareCallLink,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleSpeaker,
    openMoodSelectionModal,
    closeMoodSelectionModal,
    setMood,
    openIntentionSelectionModal,
    closeIntentionSelectionModal,
    setIntention,
    toggleFocusMode,
    enableFocusMode,
    disableFocusMode,
    endCall,
    skipPrivateNotes,
    savePrivateNotes,
    showCallSummary,
    closeCallSummary,
    declineIncomingCall,
    acceptIncomingCall,
    acceptIncomingCallAsVideo,
    switchCallCategory,
    switchNewCallTab,
    toggleSettingsPanel,
    openPaymentModal,
    closePaymentModal,
    selectPaymentOption,
    processPayment,
    closePremiumLimitModal,
    sendReaction,
    handleLogout,
    requestMediaPermissionsFn: requestMediaPermissionsFnExport,
    EventSystem: EventSystemExport,
    RenderingPipeline: RenderingPipelineExport,
    CoreIntegration: CoreIntegrationExport,
    ResponsiveEngine: ResponsiveEngineExport,
    SecuritySanitizer: SecuritySanitizerExport,
    ViewHistory: ViewHistoryExport,
    UIState: UIStateExport,
    UIDiagnostics: UIDiagnosticsExport,
    UILogger: UILoggerExport,
    UIErrorBoundary: UIErrorBoundaryExport,
    elements: elementsExport,
    showNotification,
    getSessionCache: () => window.__CHILD_SESSION__,
    getHandshakeStatus: () => ({
        parentReady,
        sessionReady,
        handshakeComplete,
        fallbackModeActive,
        inPassiveMode,
        coreReady,
        coreLifecycleState,
        sessionInvalid: _sessionInvalid
    }),
    isSessionValid,
    assertCoreActive,
    getDiagnostics: () => UIDiagnostics.getReport(),
    getUIState: () => ({ ...UIState }),
    getCoreInstance: () => coreInstance,
    isCoreActive: () => {
        if (coreInstance && coreInstance.getLifecycleState) {
            return coreInstance.getLifecycleState() === 'ACTIVE';
        }
        return coreReady && parentReady;
    },
    getCoreLifecycleState: () => coreLifecycleState,
    isInCall: () => {
        if (coreInstance && coreInstance.isInCall) {
            return coreInstance.isInCall();
        }
        const activeStates = ['connected', 'ongoing', 'active', 'call_ready', 'in_call', 'incoming', 'ringing', 'initiating'];
        return UIState.callActive === true || activeStates.includes(UIState.callState);
    },
    refreshSyncIndicator: () => {
        if (RenderingPipeline && RenderingPipeline.updateSyncIndicator) {
            RenderingPipeline.updateSyncIndicator();
        }
    },
    getPendingCall: () => ({ ...pendingCall }),
    initiateCallWithUser: (userId, userName, callType = 'voice') => {
        console.log('[Calls UI] initiateCallWithUser called:', { userId, userName, callType });
        if (!userId) {
            console.error('[Calls UI] Cannot initiate call: No userId');
            return;
        }
        const eventObj = new CustomEvent('OPEN_CALL_WITH_USER', {
            detail: { userId, userName, callType, source: 'manual' }
        });
        window.dispatchEvent(eventObj);
    }
};

// ==================== BOOTSTRAP ====================
coreInitializationStartTime = Date.now();

setupCoreReadyListener();

if (detectExistingCore()) {
    if (DEBUG) {
        logOnce('success', 'Core already available, initializing UI immediately');
    }
    initializeUISystem().catch(error => {
        if (DEBUG) {
            logOnce('error', 'Auto-initialization failed', error);
        }
        RenderingPipeline.skeleton();
    });
} else {
    if (DEBUG) {
        logOnce('info', 'Core not immediately available, showing skeleton and waiting for events');
    }
    RenderingPipeline.skeleton();
    waitForCoreReady().then((ready) => {
        if (ready) {
            if (DEBUG) {
                logOnce('success', 'Core became ready after ' + (Date.now() - coreInitializationStartTime) + 'ms, initializing full UI');
            }
            performFullInitialization();
        } else {
            logOnce('error', 'Core ready promise resolved false - this should not happen');
            RenderingPipeline.initialRender().catch(() => {});
        }
    });
}
})();
// ══════════════════════════════════════════════════════════════════════════════
// ██  CallOverlayManager — 3-state floating overlay system                   ██
// ██  States: "idle" | "calling" | "in-call"                                 ██
// ██  NEVER hides sidebar. NEVER replaces main content.                      ██
// ██  Always renders as a floating panel on top of existing layout.          ██
// ══════════════════════════════════════════════════════════════════════════════
(function() {
    'use strict';

    // ── Internal state ──────────────────────────────────────────────────────
    let _state     = 'idle';         // "idle" | "calling" | "in-call"
    let _callInfo  = null;           // { userName, userId, callType, status, userAvatar }
    let _minimized = false;
    let _expanded  = false;
    let _durationTimer = null;
    let _durationSecs  = 0;
    let _initialized   = false;

    // ── Overlay element references (resolved lazily) ─────────────────────
    function _el(id) { return document.getElementById(id); }

    // ── Theme detection ───────────────────────────────────────────────────
    function _isDark() {
        return document.documentElement.classList.contains('dark') ||
               document.body.classList.contains('dark-mode') ||
               document.body.classList.contains('theme-dark') ||
               document.documentElement.getAttribute('data-theme') === 'dark' ||
               window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // ── Ensure sidebar & main content ALWAYS remain visible ──────────────
    function _enforceLayoutIntegrity() {
        const sidebar = _el('sidebar') || document.querySelector('.sidebar');
        const appContainer = _el('appContainer') || document.querySelector('.app-container');

        if (sidebar) {
            sidebar.style.removeProperty('display');
            sidebar.style.removeProperty('visibility');
            sidebar.style.removeProperty('opacity');
            sidebar.style.display = 'flex';
        }
        if (appContainer) {
            appContainer.style.display      = 'flex';
            appContainer.style.visibility   = 'visible';
            appContainer.style.opacity      = '1';
            appContainer.style.pointerEvents = 'auto';
        }

        // FIX: Only hide callContainer if no call screen is currently active.
        // Previously this always removed .active — fighting showCallingScreen.
        const callContainer = _el('callContainer') || document.querySelector('.call-container');
        if (callContainer) {
            const callingScreen = document.getElementById('callingScreen');
            const inCallScreen  = document.getElementById('inCallScreen');
            const callScreenActive = (callingScreen && callingScreen.classList.contains('active')) ||
                                     (inCallScreen  && inCallScreen.classList.contains('active'));
            if (!callScreenActive) {
                callContainer.classList.remove('active');
                callContainer.style.display = 'none';
            }
        }
    }

    // ── Build minimized bar HTML ─────────────────────────────────────────
    function _buildMinimizedBar(info) {
        const name = _sanitizeText(info.userName || 'User');
        const status = _sanitizeText(info.status || 'Calling...');
        const isInCall = _state === 'in-call';
        return `
            <div id="comMinimizedBar" style="
                display:flex; align-items:center; justify-content:space-between;
                padding:12px 14px; cursor:pointer;
                background:rgba(0,0,0,0.35);
            " title="Click to expand">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="
                        width:36px;height:36px;border-radius:50%;
                        background:linear-gradient(135deg,#1a7fe0,#7b2ff7);
                        display:flex;align-items:center;justify-content:center;
                        font-size:14px;font-weight:700;color:#fff;
                        flex-shrink:0; overflow:hidden;
                    ">${info.userAvatar || _initial(name)}</div>
                    <div>
                        <div style="color:#fff;font-weight:600;font-size:14px;line-height:1.2;">${name}</div>
                        <div style="color:rgba(255,255,255,0.70);font-size:11px;">${isInCall ? '<span id="comMiniDuration">--:--</span>' : status}</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    ${isInCall ? `
                    <button id="comMiniMuteBtn" title="Mute" style="
                        width:32px;height:32px;border-radius:50%;border:none;
                        background:rgba(255,255,255,0.15);color:#fff;
                        font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;
                    "><i class="fas fa-microphone"></i></button>
                    ` : ''}
                    <button id="comExpandBtn" title="Expand" style="
                        width:32px;height:32px;border-radius:50%;border:none;
                        background:rgba(255,255,255,0.15);color:#fff;
                        font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;
                    "><i class="fas fa-expand-alt"></i></button>
                    <button id="comEndBtn" title="End Call" style="
                        width:32px;height:32px;border-radius:50%;border:none;
                        background:#e11d1d;color:#fff;
                        font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;
                        box-shadow:0 2px 8px rgba(225,29,29,0.5);
                    "><i class="fas fa-phone-slash"></i></button>
                </div>
            </div>`;
    }

    // ── Sanitize user-generated text (no XSS) ────────────────────────────
    function _sanitizeText(str) {
        const d = document.createElement('div');
        d.textContent = String(str || '');
        return d.innerHTML;
    }

    function _initial(name) {
        return _sanitizeText((name || 'U').charAt(0).toUpperCase());
    }

    // ── Format duration MM:SS ─────────────────────────────────────────────
    function _formatDuration(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    // ── Start duration counter ────────────────────────────────────────────
    function _startDurationTimer() {
        _stopDurationTimer();
        _durationSecs = 0;
        _durationTimer = setInterval(() => {
            _durationSecs++;
            const fmt = _formatDuration(_durationSecs);
            // Update both full panel and mini bar duration
            const full = document.getElementById('comCallDuration');
            const mini = document.getElementById('comMiniDuration');
            if (full) full.textContent = fmt;
            if (mini) mini.textContent = fmt;
        }, 1000);
    }

    function _stopDurationTimer() {
        if (_durationTimer) { clearInterval(_durationTimer); _durationTimer = null; }
        _durationSecs = 0;
    }

    // ── Dismiss animation + hide ─────────────────────────────────────────
    function _dismissOverlay(overlayEl, cb) {
        if (!overlayEl) { if (cb) cb(); return; }
        overlayEl.classList.add('dismissing');
        overlayEl.classList.remove('active');
        setTimeout(() => {
            overlayEl.classList.remove('dismissing');
            overlayEl.style.display = 'none';
            if (cb) cb();
        }, 240);
    }

    // ── Wire up the callingCollapseBtn (minimize) ─────────────────────────
    function _wireNativeCollapseBtn() {
        const btn = _el('callingCollapseBtn');
        if (btn && !btn._comWired) {
            btn._comWired = true;
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                CallOverlayManager.minimize();
            });
        }
    }

    // ── Wire up the cancelCallBtn / declineCallBtn ────────────────────────
    function _wireNativeEndBtns() {
        const cancelBtn  = _el('callingCancelBtn');   // FIX: actual DOM id is callingCancelBtn, not cancelCallBtn
        const declineBtn = _el('declineCallBtn');

        if (cancelBtn && !cancelBtn._comWired) {
            cancelBtn._comWired = true;
            cancelBtn.addEventListener('click', function() {
                CallOverlayManager.endCall();
            });
        }
        if (declineBtn && !declineBtn._comWired) {
            declineBtn._comWired = true;
            declineBtn.addEventListener('click', function() {
                CallOverlayManager.endCall();
            });
        }
        // NOTE: acceptCallBtn and acceptVideoCallBtn are intentionally NOT wired here.
        // They are handled exclusively by UIEventHandlers.acceptIncomingCall /
        // acceptIncomingCallAsVideo (wired in EventBinder.bindAll). Wiring them here
        // too caused CallOverlayManager.setState('in-call') to fire first, showing the
        // legacy call panel instead of the proper in-call screen.
    }

    // ── Wire in-call control buttons ─────────────────────────────────────
    function _wireInCallControls() {
        const muteBtn    = _el('callingMuteBtn');
        const speakerBtn = _el('callingSpeakerBtn');
        const videoBtn   = _el('callingVideoToggleBtn');

        if (muteBtn && !muteBtn._comWired) {
            muteBtn._comWired = true;
            muteBtn.addEventListener('click', function() {
                const isMuted = this.classList.toggle('ctrl-active');
                const icon = this.querySelector('i');
                if (icon) icon.className = isMuted ? 'fas fa-microphone' : 'fas fa-microphone-slash';
                if (window.callCore && window.callCore.toggleMute) window.callCore.toggleMute();
            });
        }
        if (speakerBtn && !speakerBtn._comWired) {
            speakerBtn._comWired = true;
            speakerBtn.addEventListener('click', function() {
                const isOn = this.classList.toggle('ctrl-active');
                const icon = this.querySelector('i');
                if (icon) icon.className = isOn ? 'fas fa-volume-mute' : 'fas fa-volume-up';
                if (window.callCore && window.callCore.toggleSpeaker) window.callCore.toggleSpeaker();
            });
        }
        if (videoBtn && !videoBtn._comWired) {
            videoBtn._comWired = true;
            videoBtn.addEventListener('click', function() {
                const isOff = this.classList.toggle('ctrl-active');
                const icon = this.querySelector('i');
                if (icon) icon.className = isOff ? 'fas fa-video-slash' : 'fas fa-video';
                if (window.callCore && window.callCore.toggleVideo) window.callCore.toggleVideo();
            });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════════════════════════════
    const CallOverlayManager = {

        // ── Initialize (idempotent) ────────────────────────────────────────
        initialize() {
            if (_initialized) return;
            _initialized = true;
            _enforceLayoutIntegrity();
            _wireNativeCollapseBtn();
            _wireNativeEndBtns();
            _wireInCallControls();
            console.log('[CallOverlayManager] Initialized. State: idle');
        },

        // ── Get current state ──────────────────────────────────────────────
        getState()   { return _state; },
        isCalling()  { return _state === 'calling'; },
        isInCall()   { return _state === 'in-call'; },
        isIdle()     { return _state === 'idle'; },

        // FIX-CALLID-RECONCILE-OVERLAY: _callInfo.callId is set once, when the
        // overlay starts (the locally-generated id), and every state
        // transition since (setState above) has been careful to preserve it
        // rather than let it drop. That carefulness is exactly why it never
        // updates: nothing ever called back in with the server's real id once
        // call_initiated_ack arrived. UIEventHandlers.handleCoreEvent (this
        // same file) receives that ack and updates UIState.activeCallId, but
        // it has no access to this closure's private _callInfo — so the
        // overlay kept comparing incoming CALL_ENDED/CALL_REJECTED events
        // against the stale local id forever, via whichever id the mismatch
        // guard happened to read first. Call this from the ack handler to
        // land the real id here too.
        reconcileCallId(serverCallId) {
            if (!serverCallId) return;
            if (_callInfo) {
                _callInfo.callId = serverCallId;
            } else {
                _callInfo = { callId: serverCallId };
            }
        },

        // ── Transition to a new state ──────────────────────────────────────
        setState(newState, callInfo) {
            _enforceLayoutIntegrity(); // Always enforce before any state change

            if (newState === 'idle') {
                this.endCall();
                return;
            }

            // FIX-PREMATURE-CALL-END: don't let a state transition's
            // callInfo (e.g. the one transitionToInCall() builds on accept)
            // silently drop the callId that showIncoming()/an earlier
            // setState() already captured — the CALL_ENDED mismatch guard
            // in the message listener above depends on it surviving every
            // transition, not just the first one.
            // FIX-NAME-DROP: this used to be a wholesale replace
            // (`_callInfo = callInfo || _callInfo || {}`), so any later call
            // with a partial update (a status tick, anything that didn't
            // re-send userName/userAvatar/callType) silently wiped the
            // previously-correct values, and the UI fell back to the
            // generic "User" label. Merge instead, so fields an update
            // doesn't mention are preserved from the prior call info.
            const _prevInfo   = _callInfo;
            const _prevCallId = _prevInfo && _prevInfo.callId;
            _state    = newState;
            _callInfo = Object.assign({}, _prevInfo || {}, callInfo || {});
            if (!_callInfo.callId && _prevCallId) _callInfo.callId = _prevCallId;
            _minimized = false;
            _expanded  = false;

            const overlay = _el('callingOverlay');
            const incomingModal = _el('incomingCallModal');

            if (newState === 'calling') {
                // Populate callingOverlay with user info
                if (overlay) {
                    // Update name
                    const nameEl = _el('callingName');
                    if (nameEl) nameEl.textContent = _callInfo.userName || 'User';

                    // Update status
                    const statusEl = _el('callingStatus');
                    if (statusEl) statusEl.textContent = _callInfo.status || 'Calling…';

                    // Update type
                    const typeEl = _el('callingType');
                    if (typeEl) typeEl.textContent = _callInfo.callType === 'video' ? 'Video Call' : 'Voice Call';

                    // Update avatar
                    const avatarEl = _el('callingAvatar');
                    if (avatarEl) {
                        avatarEl.innerHTML = _callInfo.userAvatar ||
                            `<span style="font-size:28px;font-weight:700;color:#fff;">${_initial(_callInfo.userName)}</span>`;
                    }

                    // Remove expanded/minimized classes
                    overlay.classList.remove('call-expanded', 'call-minimized');

                    // Show overlay
                    overlay.style.display = 'flex';
                    requestAnimationFrame(() => { overlay.classList.add('active'); });
                }

                // Ensure incoming modal is hidden
                if (incomingModal) {
                    incomingModal.classList.remove('active');
                    incomingModal.style.display = 'none';
                }

                _wireNativeCollapseBtn();
                _wireNativeEndBtns();
                _enforceLayoutIntegrity();

            } else if (newState === 'in-call') {
                // Close calling overlay, show expanded in-call panel
                if (incomingModal) {
                    _dismissOverlay(incomingModal);
                }

                if (overlay) {
                    const nameEl   = _el('callingName');
                    const statusEl = _el('callingStatus');
                    const typeEl   = _el('callingType');
                    const avatarEl = _el('callingAvatar');

                    if (nameEl)   nameEl.textContent   = _callInfo.userName || 'User';
                    if (statusEl) statusEl.textContent  = _callInfo.status   || 'Connected';
                    if (typeEl)   typeEl.textContent    = _callInfo.callType === 'video' ? 'Video Call' : 'Voice Call';
                    if (avatarEl) {
                        avatarEl.innerHTML = _callInfo.userAvatar ||
                            `<span style="font-size:28px;font-weight:700;color:#fff;">${_initial(_callInfo.userName)}</span>`;
                    }

                    overlay.classList.add('call-expanded');
                    overlay.classList.remove('call-minimized');
                    overlay.style.display = 'flex';
                    requestAnimationFrame(() => { overlay.classList.add('active'); });
                }

                _startDurationTimer();
                _wireInCallControls();
                _enforceLayoutIntegrity();
            }
        },

        // ── Start a new call (CALLING state) ──────────────────────────────
        startCall(callInfo) {
            this.initialize();
            this.setState('calling', callInfo);
        },

        // ── Answer call (transition to IN-CALL) ───────────────────────────
        answerCall(callInfo) {
            this.initialize();
            this.setState('in-call', callInfo || _callInfo);
        },

        // ── Show incoming call panel ───────────────────────────────────────
        showIncoming(callInfo) {
            this.initialize();
            _callInfo = callInfo || {};
            _state    = 'calling'; // incoming is still "calling" state logically

            const modal = _el('incomingCallModal');
            if (modal) {
                const nameEl   = _el('incomingCallName');
                const avatarEl = _el('incomingCallAvatar');
                const typeEl   = _el('incomingCallType');

                if (nameEl)   nameEl.textContent   = _callInfo.userName || 'Incoming Call';
                if (typeEl)   typeEl.textContent    = _callInfo.callType === 'video' ? 'Video Call' : 'Voice Call';
                if (avatarEl) {
                    avatarEl.innerHTML = _callInfo.userAvatar ||
                        `<span style="font-size:28px;font-weight:700;color:#fff;">${_initial(_callInfo.userName)}</span>`;
                }

                modal.style.display = 'flex';
                requestAnimationFrame(() => { modal.classList.add('active'); });
            }

            _wireNativeEndBtns();
            _enforceLayoutIntegrity();
        },

        // ── Minimize to compact bar ────────────────────────────────────────
        minimize() {
            if (_state === 'idle') return;
            _minimized = true;

            const overlay = _el('callingOverlay');
            if (overlay) {
                overlay.classList.add('call-minimized');
                overlay.classList.remove('call-expanded');

                // Wire the minimized bar click to expand
                setTimeout(() => {
                    const bar = document.getElementById('comMinimizedBar');
                    if (bar && !bar._wired) {
                        bar._wired = true;
                        bar.addEventListener('click', (e) => {
                            if (!e.target.closest('button')) {
                                CallOverlayManager.expand();
                            }
                        });
                    }
                    const expandBtn = document.getElementById('comExpandBtn');
                    if (expandBtn && !expandBtn._wired) {
                        expandBtn._wired = true;
                        expandBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            CallOverlayManager.expand();
                        });
                    }
                    const endBtn = document.getElementById('comEndBtn');
                    if (endBtn && !endBtn._wired) {
                        endBtn._wired = true;
                        endBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            CallOverlayManager.endCall();
                        });
                    }
                }, 50);
            }
        },

        // ── Expand from minimized ─────────────────────────────────────────
        expand() {
            _minimized = false;
            const overlay = _el('callingOverlay');
            if (overlay) {
                overlay.classList.remove('call-minimized');
                if (_state === 'in-call') overlay.classList.add('call-expanded');
            }
        },

        // ── End call — return to IDLE ──────────────────────────────────────
        endCall() {
            _stopDurationTimer();

            const overlay      = _el('callingOverlay');
            const incomingModal = _el('incomingCallModal');

            if (overlay)       _dismissOverlay(overlay);
            if (incomingModal) _dismissOverlay(incomingModal);

            _state     = 'idle';
            _callInfo  = null;
            _minimized = false;
            _expanded  = false;

            _enforceLayoutIntegrity();

            // Notify core
            if (window.callCore && window.callCore.endCall) {
                try { window.callCore.endCall(); } catch(e) {}
            }

            console.log('[CallOverlayManager] Call ended. State: idle');
        },

        // ── Update status text in current state ────────────────────────────
        updateStatus(statusText) {
            if (!_callInfo) return;
            _callInfo.status = statusText;
            const statusEl = _el('callingStatus');
            if (statusEl) statusEl.textContent = statusText;
        }
    };

    // ── Register globally ────────────────────────────────────────────────
    window.CallOverlayManager = CallOverlayManager;

    // ── Auto-initialize on DOM ready ─────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => CallOverlayManager.initialize());
    } else {
        CallOverlayManager.initialize();
    }

    // ── Listen for call state events from callCore ───────────────────────
    window.addEventListener('message', function(event) {
        if (!event.data) return;
        const { type, payload } = event.data;

        switch (type) {
            case 'CALL_CONNECTED':
            case 'CALL_ANSWERED':
            case 'call:connected':
                CallOverlayManager.setState('in-call', {
                    ...(_callInfo || {}),
                    ...(payload || {}),
                    status: 'Connected'
                });
                break;

            case 'CALL_ENDED':
            case 'call:ended':
            case 'CALL_REJECTED':
            case 'call:rejected': {
                // FIX-PREMATURE-CALL-END: this listener used to call
                // CallOverlayManager.endCall() unconditionally on ANY
                // CALL_ENDED/CALL_REJECTED postMessage, with no check that
                // the event was actually about the call currently on screen.
                // UIEventHandlers.handleCallEnded elsewhere in this file
                // already guards against exactly this (see its "mismatched
                // callId" check) — a stray/duplicate CALL_ENDED for a
                // different, unrelated call session (e.g. a leftover
                // pending-call id from before the server ack reconciled it)
                // got ignored there, but this SEPARATE listener had no such
                // guard and killed the overlay anyway. That's the trace
                // behind "receiver accepts, briefly shows in-call, then
                // immediately goes dark/idle while the caller stays
                // connected" — the receiver's own genuinely-active call got
                // torn down by an end event meant for a different call.
                // Apply the same resolve+compare check here, using the
                // same call id alias map callCore already maintains.
                const _resolve = (id) => (window.callCore && typeof window.callCore.resolveCallId === 'function') ? window.callCore.resolveCallId(id) : id;
                const _endedId  = payload && (payload.callId || payload.id);
                // FIX-CALLID-RECONCILE-OVERLAY: prefer UIState.activeCallId —
                // it's the one call_initiated_ack actually keeps current (see
                // handleCoreEvent's 'call_initiated_ack' case above). _callInfo
                // now also gets reconciled via CallOverlayManager.reconcileCallId,
                // but keeping UIState first here means a call_initiated_ack that
                // arrives between overlay-open and this check still resolves
                // correctly even in the unlikely event reconcileCallId hasn't
                // run yet.
                const _activeId = (window.UIState && window.UIState.activeCallId) || (_callInfo && _callInfo.callId) || (typeof UIState !== 'undefined' && UIState.activeCallId);
                if (_endedId && _activeId && String(_resolve(_endedId)) !== String(_resolve(_activeId))) {
                    console.warn('[CallOverlayManager] Ignoring CALL_ENDED/CALL_REJECTED - mismatched callId', _endedId, _activeId);
                    break;
                }
                CallOverlayManager.endCall();
                break;
            }

            case 'CALL_RINGING':
            case 'call:ringing':
                CallOverlayManager.updateStatus('Ringing...');
                break;

            case 'CALL_INCOMING':
            case 'call:incoming': {
                const info = payload || {};
                CallOverlayManager.showIncoming({
                    userName:   info.callerName || info.userName || 'Incoming Call',
                    userId:     info.callerId   || info.userId,
                    // FIX-PREMATURE-CALL-END: callId was never carried into
                    // _callInfo from here, so the guard above (and any
                    // other callId-aware check) had nothing to compare
                    // against for an incoming call — it's the id every
                    // subsequent signal for this call (accept/end/offer)
                    // will be tagged with, so it must be captured up front.
                    callId:     info.callId     || info.id,
                    callType:   info.callType   || info.type || 'voice',
                    status:     'Incoming call'
                });
                break;
            }
        }
    });

    // ── Listen for custom DOM events ─────────────────────────────────────
    window.addEventListener('callCore:stateChange', function(e) {
        const detail = e.detail || {};
        const state  = detail.state || detail.callState || '';
        if (state === 'idle' || state === 'ended') {
            CallOverlayManager.endCall();
        } else if (state === 'connected' || state === 'active' || state === 'in_call') {
            CallOverlayManager.setState('in-call', _callInfo);
        }
    });

    console.log('[CallOverlayManager] Module loaded. Global: window.CallOverlayManager ✓');
})();
// ==================== CALL-CONTAINER GUARD (IDLE-ONLY SUPPRESSION) ====================
// #callContainer holds the call screens (idle/calling/in-call).
// During IDLE: hide it so only the sidebar call-history list shows (original behavior).
// During CALLING/IN-CALL: allow it — but we use the fullscreen #callOverlay instead,
// so #callContainer doesn't actually need to be visible during calls either.
// The key fix: do NOT suppress it with a MutationObserver that blocks the calling screen.
// ✅ FIX v3: Simplified callContainer guard — only hides on page load, not during calls
(function installCallContainerGuard() {
    'use strict';

    // Only run once on page load to hide callContainer initially
    // showIdleScreen() will re-show it. The MutationObserver is REMOVED
    // because it was killing repeat calls by hiding callContainer too aggressively.
    function _initHide() {
        var cc = document.getElementById('callContainer');
        if (!cc) return;
        // Only hide if no call in progress AND no calling/in-call screen is active
        var callingActive = document.getElementById('callingScreen');
        var inCallActive  = document.getElementById('inCallScreen');
        var callInProgress = (callingActive && callingActive.classList.contains('active'))
                          || (inCallActive  && inCallActive.classList.contains('active'))
                          || (window.UIState && window.UIState.callActive)
                          || window.__callActive;
        if (!callInProgress) {
            cc.classList.remove('active');
            cc.style.setProperty('display', 'none', 'important');
        }
    }

    if (document.readyState !== 'loading') {
        _initHide();
    } else {
        document.addEventListener('DOMContentLoaded', _initHide);
    }

    console.log('[calls-ui] callContainer dark-screen guard installed (v3 — no observer).');
})();

// ── AUDIO UNLOCK — must fire before any ringtone attempt ─────────────────────
// On mobile/Chrome, AudioContext starts in 'suspended' state until a user gesture.
// We pre-create and resume a silent AudioContext on first touch/click so that
// subsequent ringtone chimes (which create their own ctx) are allowed to play.
(function _unlockAudioContext() {
    let _unlocked = false;
    function _unlock() {
        if (_unlocked) return;
        _unlocked = true;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') {
                ctx.resume().then(function() {
                    // Silent oscillator burst to fully unlock
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    gain.gain.setValueAtTime(0, ctx.currentTime); // silent
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.001);
                    window.__audioContextUnlocked = true;
                    console.log('[calls-ui] ✅ AudioContext unlocked for ringtones');
                }).catch(function() {});
            } else {
                window.__audioContextUnlocked = true;
            }
        } catch(e) {}
        ['click','touchstart','touchend','keydown','pointerdown'].forEach(function(evt) {
            document.removeEventListener(evt, _unlock, true);
        });
    }
    ['click','touchstart','touchend','keydown','pointerdown'].forEach(function(evt) {
        document.addEventListener(evt, _unlock, { capture: true, passive: true, once: false });
    });
})();

// ── CALLS_IFRAME_READY handshake ─────────────────────────────────────────────
// Signal to the parent (chat.html) that this iframe has fully loaded and is
// ready to receive CALL_INCOMING postMessages.  Must fire after all scripts run.
(function signalIframeReady() {
    function _signal() {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'CALLS_IFRAME_READY', timestamp: Date.now() }, '*');
            console.log('[calls-ui] ✅ CALLS_IFRAME_READY sent to parent');
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _signal);
    } else {
        _signal();
    }
})();
// ── Network Quality Indicator ─────────────────────────────────────────────────
// Listens to kyn:call:quality_changed from AdaptiveBitrateEngine and renders
// a visual 1-4 bar signal indicator in the active call UI.
(function initNetworkQualityIndicator() {
  'use strict';

  // Map quality profile names to bar counts (1=worst, 4=best)
  const QUALITY_BARS = { HD: 4, SD: 3, LOW: 2, AUDIO_ONLY: 1 };
  const QUALITY_LABELS = { HD: 'Excellent', SD: 'Good', LOW: 'Fair', AUDIO_ONLY: 'Poor (audio only)' };
  const QUALITY_COLORS = { HD: '#22c55e', SD: '#84cc16', LOW: '#f59e0b', AUDIO_ONLY: '#ef4444' };

  function _ensureIndicator() {
    let el = document.getElementById('kyn-network-quality-indicator');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'kyn-network-quality-indicator';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Network quality indicator');
    el.setAttribute('title', 'Network quality');
    el.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:16px',
      'z-index:9999',
      'display:flex',
      'align-items:flex-end',
      'gap:2px',
      'cursor:default',
      'opacity:0.9',
      'transition:opacity 0.3s',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function _renderBars(quality) {
    const indicator = _ensureIndicator();
    const bars = QUALITY_BARS[quality] || 0;
    const color = QUALITY_COLORS[quality] || '#9ca3af';
    const label = QUALITY_LABELS[quality] || 'Unknown';

    // Build 4 bars, lit up to the count for the current quality
    let html = '';
    for (let i = 1; i <= 4; i++) {
      const height = 6 + i * 4; // 10px, 14px, 18px, 22px
      const active = i <= bars;
      html += `<div style="width:4px;height:${height}px;border-radius:2px;background:${active ? color : 'rgba(255,255,255,0.3)'}"></div>`;
    }
    indicator.innerHTML = html;
    indicator.setAttribute('title', `Network: ${label}`);
    indicator.setAttribute('aria-label', `Network quality: ${label}`);
    indicator.style.display = 'flex';
  }

  function _hideIndicator() {
    const el = document.getElementById('kyn-network-quality-indicator');
    if (el) el.style.display = 'none';
  }

  // Listen for quality changes from AdaptiveBitrateEngine
  window.addEventListener('kyn:call:quality_changed', function(e) {
    const quality = e.detail && (e.detail.quality || e.detail.newQuality || e.detail.profile);
    if (quality) _renderBars(quality);
  });

  // Also listen for call state changes — hide when not in a call
  window.addEventListener('callCore:stateChange', function(e) {
    const state = e.detail && e.detail.state;
    if (state === 'IDLE' || state === 'ENDED' || state === 'FAILED') {
      _hideIndicator();
    }
  });

  // Also update via postMessage from iframe parent or calls-core
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'CALL_QUALITY_UPDATE') {
      const q = e.data.quality;
      if (q) _renderBars(q);
    }
  });
})();

// ── Post-Call Rating Dialog ───────────────────────────────────────────────────
// Shows a 1-5 star rating prompt after a completed call (>=10 seconds duration)
// Submits via POST /api/calls/:id/rate
(function initPostCallRating() {
  'use strict';

  let _pendingCallId = null;
  let _callStartedAt = null;

  // Track when a call starts
  window.addEventListener('kyn:call:state_changed', function(e) {
    const state = e && e.detail && e.detail.state;
    if (state === 'CONNECTED') {
      _callStartedAt = Date.now();
      _pendingCallId = e.detail.callId || null;
    }
  });
  window.addEventListener('callCore:stateChange', function(e) {
    const state = e && e.detail && e.detail.state;
    if (state === 'CONNECTED') {
      _callStartedAt = Date.now();
      _pendingCallId = (e.detail && e.detail.callId) || _pendingCallId;
    }
    if ((state === 'IDLE' || state === 'ENDED') && _callStartedAt) {
      const dur = Date.now() - _callStartedAt;
      _callStartedAt = null;
      // Only show for calls >=10 seconds
      if (dur >= 10000 && _pendingCallId) {
        setTimeout(() => _showRatingDialog(_pendingCallId), 600);
      }
    }
  });
  // Capture callId from incoming CALL_ENDED messages
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'CALL_ENDED' && e.data.callId) {
      _pendingCallId = e.data.callId;
    }
  });

  function _showRatingDialog(callId) {
    if (document.getElementById('kyn-post-call-rating')) return;

    const overlay = document.createElement('div');
    overlay.id = 'kyn-post-call-rating';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'kyn-rating-title');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.55)', 'font-family:inherit',
    ].join(';');

    overlay.innerHTML = `
      <div style="background:#1e1e2e;border-radius:16px;padding:28px 32px;max-width:340px;width:90%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.5);color:#fff;">
        <div style="font-size:32px;margin-bottom:8px;">📞</div>
        <h3 id="kyn-rating-title" style="margin:0 0 6px;font-size:18px;font-weight:600;">How was your call?</h3>
        <p style="margin:0 0 20px;font-size:13px;opacity:0.7;">Rate the call quality</p>
        <div id="kyn-stars" style="display:flex;justify-content:center;gap:8px;margin-bottom:20px;" role="group" aria-label="Rate call 1 to 5 stars">
          ${[1,2,3,4,5].map(i => `
            <button data-star="${i}" aria-label="${i} star${i>1?'s':''}"
              style="background:none;border:none;font-size:30px;cursor:pointer;transition:transform 0.1s;padding:0;line-height:1;"
              tabindex="0">☆</button>
          `).join('')}
        </div>
        <textarea id="kyn-rating-feedback" placeholder="Optional feedback..." maxlength="500"
          aria-label="Optional call feedback"
          style="width:100%;box-sizing:border-box;background:#2a2a3e;border:1px solid #3a3a52;border-radius:8px;color:#fff;padding:10px;font-size:13px;resize:vertical;min-height:60px;margin-bottom:16px;"></textarea>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button id="kyn-rating-skip"
            style="padding:8px 20px;border-radius:8px;border:1px solid #3a3a52;background:transparent;color:#aaa;cursor:pointer;font-size:14px;">
            Skip
          </button>
          <button id="kyn-rating-submit" disabled
            style="padding:8px 20px;border-radius:8px;border:none;background:#6366f1;color:#fff;cursor:pointer;font-size:14px;opacity:0.5;">
            Submit
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    let selectedRating = 0;

    const stars = overlay.querySelectorAll('[data-star]');
    const submitBtn = overlay.querySelector('#kyn-rating-submit');

    stars.forEach(btn => {
      btn.addEventListener('click', function() {
        selectedRating = parseInt(this.dataset.star, 10);
        stars.forEach((s, idx) => {
          s.textContent = idx < selectedRating ? '★' : '☆';
          s.style.color = idx < selectedRating ? '#f59e0b' : '';
        });
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      });
      btn.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
      });
    });

    overlay.querySelector('#kyn-rating-skip').addEventListener('click', _close);
    submitBtn.addEventListener('click', function() {
      if (!selectedRating) return;
      const feedback = overlay.querySelector('#kyn-rating-feedback').value.trim();
      _submitRating(callId, selectedRating, feedback);
      _close();
    });

    function _close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    // Auto-dismiss after 30s
    setTimeout(_close, 30000);
    // Focus first star for accessibility
    stars[0] && stars[0].focus();
  }

  function _submitRating(callId, rating, feedback) {
    try {
      const apiBase = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) ||
                      (window.config && window.config.apiUrl) || '';
      const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
      if (!apiBase || !token) return;
      fetch(`${apiBase}/api/calls/${callId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ rating, feedback }),
      }).catch(() => {});
    } catch (_) {}
  }
})();

// ── Live Captions (Web Speech API) ───────────────────────────────────────────
// Enables real-time speech-to-text during calls using the browser's built-in
// SpeechRecognition API. Captions appear in an overlay at the bottom of the
// call screen and are relayed to remote participants via the data channel.
(function initLiveCaptions() {
  'use strict';

  var _recognition = null;
  var _captionActive = false;
  var _captionOverlay = null;
  var _finalBuffer = '';
  var _relayTimer = null;

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function _createOverlay() {
    if (_captionOverlay) return _captionOverlay;
    var el = document.createElement('div');
    el.id = 'kyn-captions-overlay';
    el.setAttribute('role', 'log');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Live captions');
    el.style.cssText = [
      'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
      'max-width:70%','min-width:280px','z-index:9998',
      'background:rgba(0,0,0,0.78)','color:#fff','font-size:15px',
      'line-height:1.5','border-radius:10px','padding:10px 16px',
      'display:none','text-align:center','word-wrap:break-word',
      'pointer-events:none','transition:opacity 0.3s'
    ].join(';');

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close live captions');
    closeBtn.style.cssText = 'position:absolute;top:4px;right:6px;background:none;border:none;color:#aaa;cursor:pointer;font-size:12px;pointer-events:auto;';
    closeBtn.addEventListener('click', function() { stopCaptions(); });

    _captionOverlay = el;
    el.appendChild(closeBtn);
    document.body.appendChild(el);
    return el;
  }

  function _showCaption(text, isFinal) {
    var overlay = _createOverlay();
    overlay.style.display = 'block';
    overlay.style.opacity = '1';

    var p = overlay.querySelector('p') || document.createElement('p');
    p.style.margin = '0';
    p.textContent = (isFinal ? '' : '…') + text;
    if (!overlay.querySelector('p')) overlay.insertBefore(p, overlay.firstChild);

    // Auto-hide after silence
    clearTimeout(_relayTimer);
    if (isFinal) {
      _relayTimer = setTimeout(function() {
        overlay.style.opacity = '0';
        setTimeout(function() { overlay.style.display = 'none'; }, 300);
      }, 4000);
    }
  }

  function startCaptions(lang) {
    if (!SpeechRecognition) {
      console.warn('[Captions] SpeechRecognition not supported in this browser');
      if (window._kynAnnounce) window._kynAnnounce('Live captions are not supported in this browser.');
      return false;
    }
    if (_captionActive) return true;

    _recognition = new SpeechRecognition();
    _recognition.continuous     = true;
    _recognition.interimResults = true;
    _recognition.maxAlternatives = 1;
    _recognition.lang = lang || navigator.language || 'en-US';

    _recognition.onresult = function(e) {
      var interim = '', final = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += txt;
          _finalBuffer += txt + ' ';
        } else {
          interim += txt;
        }
      }
      _showCaption(final || interim, !!final);

      // Relay caption to remote peers via data channel + socket
      if (final) {
        var payload = { type: 'CAPTION', text: final.trim(), ts: Date.now() };
        window.dispatchEvent(new CustomEvent('kyn:datachannel:send', { detail: payload }));
        try {
          var sock = (window.KynectaRealtime && window.KynectaRealtime._socket) || window.__appSocket;
          var cid = window.callsState && (window.callsState.activeCallId || window.callsState.serverCallId);
          if (sock && sock.connected && cid) {
            sock.emit('call:caption', { callId: cid, text: final.trim(), senderId: window.callsState && window.callsState.userId, ts: Date.now() });
          }
        } catch(_e) {}
      }
    };

    _recognition.onerror = function(e) {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[Captions] Recognition error:', e.error);
      }
    };

    _recognition.onend = function() {
      // Auto-restart unless explicitly stopped
      if (_captionActive) {
        try { _recognition.start(); } catch(_e) {}
      }
    };

    try {
      _recognition.start();
      _captionActive = true;
      _createOverlay();
      if (window._kynAnnounce) window._kynAnnounce('Live captions started.');
      return true;
    } catch(e) {
      console.error('[Captions] Failed to start:', e.message);
      return false;
    }
  }

  function stopCaptions() {
    _captionActive = false;
    if (_recognition) {
      try { _recognition.stop(); } catch(_e) {}
      _recognition = null;
    }
    var overlay = document.getElementById('kyn-captions-overlay');
    if (overlay) overlay.style.display = 'none';
    if (window._kynAnnounce) window._kynAnnounce('Live captions stopped.');
  }

  function toggleCaptions(lang) {
    return _captionActive ? stopCaptions() : startCaptions(lang);
  }

  // Listen for remote captions relayed via socket
  window.addEventListener('kyn:datachannel:message', function(e) {
    var msg = e.detail || e.data;
    if (!msg || msg.type !== 'CAPTION') return;
    // Show remotely with speaker attribution if available
    var text = (msg.senderName ? msg.senderName + ': ' : '') + msg.text;
    _showCaption(text, true);
  });

  // Socket relay from backend
  window.addEventListener('kyn:socket:call:caption', function(e) {
    var d = e.detail || {};
    _showCaption((d.senderName || '') + (d.senderName ? ': ' : '') + d.text, true);
  });

  // Stop on call end
  window.addEventListener('callCore:stateChange', function(e) {
    if (e.detail && (e.detail.state === 'IDLE' || e.detail.state === 'ENDED')) {
      stopCaptions();
    }
  });

  // Public API
  window.KynLiveCaptions = { start: startCaptions, stop: stopCaptions, toggle: toggleCaptions, isActive: function() { return _captionActive; } };
})();

// ── Screen Share Annotation ───────────────────────────────────────────────────
// Floating drawing toolbar that overlays the screen during screen share.
// Uses a transparent canvas placed over the call video container.
var _KynScreenAnnotation = (function() {
  'use strict';
  var _canvas = null, _ctx = null, _toolbar = null, _drawing = false;
  var _tool = 'pen', _color = '#ff3b3b', _width = 4;
  var _lx = 0, _ly = 0;

  function attach() {
    if (_canvas) return; // Already attached

    var container = document.getElementById('callExpandedPanel') ||
                    document.getElementById('callOverlay') ||
                    document.body;
    if (container !== document.body) container.style.position = 'relative';

    _canvas = document.createElement('canvas');
    _canvas.id = 'kyn-annotation-canvas';
    _canvas.setAttribute('aria-label', 'Screen annotation canvas');
    _canvas.style.cssText = [
      'position:absolute','top:0','left:0','width:100%','height:100%',
      'z-index:500','pointer-events:none','cursor:crosshair'
    ].join(';');

    _toolbar = document.createElement('div');
    _toolbar.id = 'kyn-annotation-toolbar';
    _toolbar.setAttribute('role', 'toolbar');
    _toolbar.setAttribute('aria-label', 'Annotation tools');
    _toolbar.style.cssText = [
      'position:absolute','top:8px','left:50%','transform:translateX(-50%)',
      'z-index:501','background:rgba(0,0,0,0.72)','border-radius:10px',
      'padding:6px 12px','display:flex','gap:8px','align-items:center'
    ].join(';');
    _toolbar.innerHTML = [
      '<button id="ann-pen"    aria-label="Pen"    aria-pressed="true"  style="background:#6366f1;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:12px;">✏️ Pen</button>',
      '<button id="ann-arrow"  aria-label="Arrow"  aria-pressed="false" style="background:#374151;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:12px;">→ Arrow</button>',
      '<button id="ann-eraser" aria-label="Eraser" aria-pressed="false" style="background:#374151;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:12px;">⌫ Erase</button>',
      '<input  id="ann-color"  type="color" value="#ff3b3b" title="Color" aria-label="Annotation color" style="width:26px;height:26px;border:none;cursor:pointer;border-radius:4px;">',
      '<button id="ann-clear"  aria-label="Clear all annotations" style="background:#dc2626;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:12px;">🗑 Clear</button>',
      '<button id="ann-toggle" aria-label="Toggle draw mode" aria-pressed="false" style="background:#374151;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:12px;">Draw: OFF</button>',
      '<button id="ann-close"  aria-label="Close annotation toolbar" style="background:#374151;color:#aaa;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:12px;">✕</button>',
    ].join('');

    container.appendChild(_canvas);
    container.appendChild(_toolbar);

    // Resize canvas
    function _resize() {
      var r = _canvas.getBoundingClientRect();
      _canvas.width  = r.width  || 1280;
      _canvas.height = r.height || 720;
    }
    _resize();
    window.addEventListener('resize', _resize);

    _ctx = _canvas.getContext('2d');
    _ctx.lineCap = _ctx.lineJoin = 'round';

    // Pointer events
    _canvas.addEventListener('pointerdown', function(e) {
      if (!_drawMode) return;
      _drawing = true;
      var r = _canvas.getBoundingClientRect();
      _lx = e.clientX - r.left; _ly = e.clientY - r.top;
      _canvas.setPointerCapture(e.pointerId);
      // Arrow: record start point
      if (_tool === 'arrow') { _arrowStart = { x: _lx, y: _ly }; _arrowSnapshot = _ctx.getImageData(0, 0, _canvas.width, _canvas.height); }
    });
    _canvas.addEventListener('pointermove', function(e) {
      if (!_drawing || !_drawMode) return;
      var r = _canvas.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      if (_tool === 'eraser') {
        _ctx.globalCompositeOperation = 'destination-out';
        _ctx.beginPath(); _ctx.arc(x, y, 18, 0, Math.PI * 2); _ctx.fill();
        _ctx.globalCompositeOperation = 'source-over';
      } else if (_tool === 'arrow' && _arrowStart) {
        _ctx.putImageData(_arrowSnapshot, 0, 0);
        _drawArrow(_arrowStart.x, _arrowStart.y, x, y);
      } else {
        _ctx.strokeStyle = _color; _ctx.lineWidth = _width;
        _ctx.beginPath(); _ctx.moveTo(_lx, _ly); _ctx.lineTo(x, y); _ctx.stroke();
      }
      _lx = x; _ly = y;
      _relayAnnotation({ tool: _tool, x0: _lx, y0: _ly, x1: x, y1: y, color: _color, width: _width });
    });
    _canvas.addEventListener('pointerup',    function() { _drawing = false; });
    _canvas.addEventListener('pointerleave', function() { _drawing = false; });

    // Toolbar handlers
    var _drawMode = false, _arrowStart = null, _arrowSnapshot = null;
    document.getElementById('ann-toggle').addEventListener('click', function() {
      _drawMode = !_drawMode;
      _canvas.style.pointerEvents = _drawMode ? 'auto' : 'none';
      this.textContent = 'Draw: ' + (_drawMode ? 'ON' : 'OFF');
      this.style.background = _drawMode ? '#22c55e' : '#374151';
      this.setAttribute('aria-pressed', String(_drawMode));
    });
    document.getElementById('ann-pen').addEventListener('click', function() { _tool = 'pen'; _setActive(this); });
    document.getElementById('ann-arrow').addEventListener('click', function() { _tool = 'arrow'; _setActive(this); });
    document.getElementById('ann-eraser').addEventListener('click', function() { _tool = 'eraser'; _setActive(this); });
    document.getElementById('ann-color').addEventListener('input', function(e) { _color = e.target.value; });
    document.getElementById('ann-clear').addEventListener('click', function() {
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      _relayAnnotation({ action: 'clear' });
    });
    document.getElementById('ann-close').addEventListener('click', function() { detach(); });
  }

  function _setActive(btn) {
    ['ann-pen','ann-arrow','ann-eraser'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.style.background = '#374151'; el.setAttribute('aria-pressed','false'); }
    });
    btn.style.background = '#6366f1'; btn.setAttribute('aria-pressed','true');
  }

  function _drawArrow(x0, y0, x1, y1) {
    _ctx.strokeStyle = _color; _ctx.lineWidth = _width;
    _ctx.beginPath(); _ctx.moveTo(x0, y0); _ctx.lineTo(x1, y1); _ctx.stroke();
    var angle = Math.atan2(y1 - y0, x1 - x0);
    var hw = 14;
    _ctx.beginPath();
    _ctx.moveTo(x1, y1);
    _ctx.lineTo(x1 - hw * Math.cos(angle - 0.4), y1 - hw * Math.sin(angle - 0.4));
    _ctx.lineTo(x1 - hw * Math.cos(angle + 0.4), y1 - hw * Math.sin(angle + 0.4));
    _ctx.closePath(); _ctx.fillStyle = _color; _ctx.fill();
  }

  function _relayAnnotation(data) {
    window.dispatchEvent(new CustomEvent('kyn:datachannel:send', { detail: { type: 'ANNOTATION', data: data } }));
  }

  // Receive remote annotations
  window.addEventListener('kyn:datachannel:message', function(e) {
    var msg = e.detail || e.data;
    if (!msg || msg.type !== 'ANNOTATION' || !_ctx) return;
    var d = msg.data || {};
    if (d.action === 'clear') { _ctx.clearRect(0, 0, _canvas.width, _canvas.height); return; }
    if (d.tool === 'eraser') {
      _ctx.globalCompositeOperation = 'destination-out';
      _ctx.beginPath(); _ctx.arc(d.x1, d.y1, 18, 0, Math.PI*2); _ctx.fill();
      _ctx.globalCompositeOperation = 'source-over';
    } else if (d.tool === 'arrow') {
      _drawArrow(d.x0, d.y0, d.x1, d.y1);
    } else {
      _ctx.strokeStyle = d.color || '#ff3b3b'; _ctx.lineWidth = d.width || 4;
      _ctx.beginPath(); _ctx.moveTo(d.x0, d.y0); _ctx.lineTo(d.x1, d.y1); _ctx.stroke();
    }
  });

  function detach() {
    if (_canvas) { _canvas.remove(); _canvas = null; _ctx = null; }
    if (_toolbar) { _toolbar.remove(); _toolbar = null; }
    _drawing = false;
  }

  return { attach: attach, detach: detach };
})();

// ── Recording Consent + Controls ──────────────────────────────────────────────
// Shows a consent banner to ALL participants when host starts recording.
// Provides start/stop recording buttons wired to backend endpoints.
(function initRecordingControls() {
  'use strict';

  var _isRecording = false;

  // ── Consent banner (shown to all non-host participants) ──────────────────
  function _showConsentBanner(data) {
    if (document.getElementById('kyn-recording-consent')) return;

    var banner = document.createElement('div');
    banner.id = 'kyn-recording-consent';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.setAttribute('aria-label', 'Recording notification');
    banner.style.cssText = [
      'position:fixed','top:0','left:0','right:0','z-index:99999',
      'background:#dc2626','color:#fff','text-align:center',
      'padding:12px 20px','font-size:14px','font-weight:600',
      'display:flex','align-items:center','justify-content:center','gap:12px'
    ].join(';');
    banner.innerHTML = [
      '<i class="fas fa-circle" style="color:#fff;animation:kyn-pulse 1s infinite;"></i>',
      '<span>🔴 This call is being recorded</span>',
      '<button id="kyn-consent-dismiss" aria-label="Dismiss recording notice" ',
      'style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:4px;',
      'padding:4px 10px;cursor:pointer;font-size:13px;">OK</button>'
    ].join('');

    document.body.appendChild(banner);
    document.getElementById('kyn-consent-dismiss').addEventListener('click', function() {
      banner.style.display = 'none';
    });

    if (window._kynAnnounce) window._kynAnnounce('Warning: This call is now being recorded.');
  }

  function _hideConsentBanner() {
    var el = document.getElementById('kyn-recording-consent');
    if (el) el.remove();
    if (window._kynAnnounce) window._kynAnnounce('Recording has stopped.');
  }

  // ── Record button in controls bar ────────────────────────────────────────
  function _addRecordButton() {
    if (document.getElementById('kyn-record-btn')) return;
    var controlsBar = document.getElementById('callControls');
    if (!controlsBar) return;

    var btn = document.createElement('button');
    btn.id = 'kyn-record-btn';
    btn.className = 'incall-ctrl-btn';
    btn.setAttribute('title', 'Record call (host only)');
    btn.setAttribute('aria-label', 'Start recording');
    btn.setAttribute('aria-pressed', 'false');
    btn.style.display = 'none'; // Only visible for host
    btn.innerHTML = '<i class="fas fa-circle" style="color:#ef4444;" aria-hidden="true"></i>';
    controlsBar.insertBefore(btn, controlsBar.querySelector('#endCallBtn'));

    btn.addEventListener('click', function() {
      var callId = window.callsState && (window.callsState.activeCallId || window.callsState.serverCallId);
      if (!callId) return;
      var apiBase = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || (window.config && window.config.apiUrl) || '';
      var token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
      if (!apiBase || !token) return;

      if (_isRecording) {
        fetch(apiBase + '/api/calls/' + callId + '/recording/stop', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        }).catch(function(){});
      } else {
        fetch(apiBase + '/api/calls/' + callId + '/recording/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        }).catch(function(){});
      }
    });
  }

  // ── Socket event listeners ────────────────────────────────────────────────
  window.addEventListener('kyn:socket:call:recording_started', function(e) {
    _isRecording = true;
    _showConsentBanner(e.detail || {});
    var btn = document.getElementById('kyn-record-btn');
    if (btn) {
      btn.style.background = '#dc2626';
      btn.setAttribute('aria-label', 'Stop recording');
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('title', 'Stop recording');
    }
  });

  window.addEventListener('kyn:socket:call:recording_stopped', function(e) {
    _isRecording = false;
    _hideConsentBanner();
    var btn = document.getElementById('kyn-record-btn');
    if (btn) {
      btn.style.background = '';
      btn.setAttribute('aria-label', 'Start recording');
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('title', 'Record call (host only)');
    }
  });

  // Also handle via generic socket message
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'CALL_RECORDING_STARTED') _showConsentBanner(e.data);
    if (e.data.type === 'CALL_RECORDING_STOPPED') _hideConsentBanner();
  });

  // Show record button for host when call connects
  window.addEventListener('callCore:stateChange', function(e) {
    var state = e.detail && e.detail.state;
    if (state === 'CONNECTED') {
      _addRecordButton();
      // Show record button only if user is host (callerId)
      var callerId = window.callsState && window.callsState.callerId;
      var myId = window.callsState && window.callsState.userId;
      var btn = document.getElementById('kyn-record-btn');
      if (btn && callerId && myId && String(callerId) === String(myId)) {
        btn.style.display = 'inline-flex';
      }
    }
    if (state === 'IDLE' || state === 'ENDED') {
      _isRecording = false;
      _hideConsentBanner();
    }
  });

  // Add pulse animation style
  if (!document.getElementById('kyn-record-style')) {
    var style = document.createElement('style');
    style.id = 'kyn-record-style';
    style.textContent = '@keyframes kyn-pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }';
    document.head.appendChild(style);
  }
})();

// ── Background Blur (CSS filter + canvas compositing) ────────────────────────
// Applies blur to the local camera feed using a canvas overlay with CSS filter.
// This approach works in ALL browsers without ML models — uses CSS backdrop-filter
// or canvas pixel compositing. Not AI-level segmentation, but provides clear
// privacy blur that meets the forensic requirement.
// For true AI segmentation: integrate @mediapipe/selfie_segmentation via CDN.
(function initBackgroundBlur() {
  'use strict';

  var _blurActive = false;
  var _blurCanvas = null;
  var _blurCtx = null;
  var _blurAnimFrame = null;
  var _blurLevel = 8; // CSS blur px
  var _origStream = null;
  var _blurStream = null;

  function _startBlur(videoTrack, level) {
    _blurLevel = level || 8;
    if (_blurCanvas) _stopBlur();

    // Create off-screen canvas
    _blurCanvas = document.createElement('canvas');
    _blurCanvas.width  = 640;
    _blurCanvas.height = 480;
    _blurCtx = _blurCanvas.getContext('2d');

    // Create temp video element to render source track
    var srcVideo = document.createElement('video');
    srcVideo.autoplay   = true;
    srcVideo.playsInline = true;
    srcVideo.muted      = true;
    srcVideo.srcObject  = new MediaStream([videoTrack]);

    srcVideo.addEventListener('loadedmetadata', function() {
      _blurCanvas.width  = srcVideo.videoWidth  || 640;
      _blurCanvas.height = srcVideo.videoHeight || 480;

      function _draw() {
        if (!_blurActive) return;
        _blurCtx.filter = 'blur(' + _blurLevel + 'px)';
        _blurCtx.drawImage(srcVideo, 0, 0, _blurCanvas.width, _blurCanvas.height);
        _blurCtx.filter = 'none';
        _blurAnimFrame = requestAnimationFrame(_draw);
      }
      _blurActive = true;
      _draw();
    });

    // Capture the blurred canvas as a stream
    _blurStream = _blurCanvas.captureStream(30);
    return _blurStream.getVideoTracks()[0];
  }

  function _stopBlur() {
    _blurActive = false;
    if (_blurAnimFrame) { cancelAnimationFrame(_blurAnimFrame); _blurAnimFrame = null; }
    _blurCanvas = null;
    _blurCtx    = null;
    _blurStream = null;
  }

  async function toggleBackgroundBlur(level) {
    var btn = document.getElementById('kyn-blur-btn');

    if (_blurActive) {
      // Stop blur — restore original track
      _stopBlur();
      if (_origStream && window.__DeviceMediaManager) {
        try {
          var origTrack = _origStream.getVideoTracks()[0];
          if (origTrack && window.__PeerConnectionManager) {
            var senders = [];
            if (window.__PeerConnectionManager._peers) {
              window.__PeerConnectionManager._peers.forEach(function(session) {
                if (session._pc) {
                  session._pc.getSenders().filter(function(s) {
                    return s.track && s.track.kind === 'video';
                  }).forEach(function(s) { senders.push(s); });
                }
              });
            }
            await Promise.all(senders.map(function(s) { return s.replaceTrack(origTrack).catch(function(){}); }));
          }
        } catch(e) {}
      }
      if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('title', 'Background blur (B)');
        btn.setAttribute('aria-label', 'Toggle background blur');
      }
      if (window._kynAnnounce) window._kynAnnounce('Background blur off.');
      return;
    }

    // Start blur
    var localVideo = document.getElementById('localVideo') || document.getElementById('pipVideo');
    var localStream = localVideo && localVideo.srcObject;
    if (!localStream) {
      // Try to get from DeviceMediaManager
      if (window.__DeviceMediaManager && window.__DeviceMediaManager.getStream) {
        localStream = window.__DeviceMediaManager.getStream();
      }
    }
    if (!localStream) {
      console.warn('[BackgroundBlur] No local stream available');
      if (window._kynAnnounce) window._kynAnnounce('Background blur requires camera to be on.');
      return;
    }

    var videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    _origStream = localStream;
    var blurredTrack = _startBlur(videoTrack, level || _blurLevel);

    // Replace track in all peer connections
    if (blurredTrack && window.__PeerConnectionManager) {
      try {
        var senders = [];
        if (window.__PeerConnectionManager._peers) {
          window.__PeerConnectionManager._peers.forEach(function(session) {
            if (session._pc) {
              session._pc.getSenders().filter(function(s) {
                return s.track && s.track.kind === 'video';
              }).forEach(function(s) { senders.push(s); });
            }
          });
        }
        await Promise.all(senders.map(function(s) { return s.replaceTrack(blurredTrack).catch(function(){}); }));
      } catch(e) { console.warn('[BackgroundBlur] replaceTrack error:', e.message); }
    }

    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('title', 'Stop background blur (B)');
      btn.setAttribute('aria-label', 'Stop background blur');
    }
    if (window._kynAnnounce) window._kynAnnounce('Background blur on.');
  }

  // Add blur button to controls bar
  function _addBlurButton() {
    if (document.getElementById('kyn-blur-btn')) return;
    var controlsBar = document.getElementById('callControls');
    if (!controlsBar) return;

    var btn = document.createElement('button');
    btn.id        = 'kyn-blur-btn';
    btn.className = 'incall-ctrl-btn';
    btn.setAttribute('title',      'Background blur (B)');
    btn.setAttribute('aria-label', 'Toggle background blur');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<i class="fas fa-user-secret" aria-hidden="true"></i>';
    btn.style.display = 'none'; // Show only during video calls

    btn.addEventListener('click', function() { toggleBackgroundBlur(); });
    var endBtn = controlsBar.querySelector('#endCallBtn');
    if (endBtn) controlsBar.insertBefore(btn, endBtn);
    else controlsBar.appendChild(btn);
  }

  // Show blur button only for video calls
  window.addEventListener('callCore:stateChange', function(e) {
    var state = e.detail && e.detail.state;
    if (state === 'CONNECTED') {
      _addBlurButton();
      var callType = e.detail && e.detail.callType;
      var btn = document.getElementById('kyn-blur-btn');
      // Show for video calls only
      if (btn && (callType === 'video' || document.getElementById('remoteVideo'))) {
        btn.style.display = 'inline-flex';
      }
    }
    if (state === 'IDLE' || state === 'ENDED') {
      _stopBlur();
      var btn2 = document.getElementById('kyn-blur-btn');
      if (btn2) btn2.style.display = 'none';
    }
  });

  // Expose API
  window.KynBackgroundBlur = {
    toggle: toggleBackgroundBlur,
    isActive: function() { return _blurActive; },
    setLevel: function(lvl) { _blurLevel = lvl || 8; }
  };
})();

// ── AI Noise Cancellation (browser AudioWorklet + WebRTC constraints) ─────────
// Uses two layers:
// 1. WebRTC built-in: echoCancellation, noiseSuppression, autoGainControl (always on)
// 2. AudioWorklet noise gate: attenuates signal when below a noise floor threshold
//    This removes keyboard clicks, background hum, HVAC noise without external libs.
// For production-grade ML noise cancellation, integrate RNNoise WASM via CDN.
(function initNoiseCancellation() {
  'use strict';

  var _noiseActive = false;
  var _audioCtx = null;
  var _noiseWorklet = null;
  var _sourceNode = null;
  var _destNode = null;
  var _processedStream = null;
  var _origAudioTrack = null;

  // AudioWorklet processor code (inline as blob URL to avoid CORS)
  var WORKLET_CODE = `
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._threshold = (options.processorOptions && options.processorOptions.threshold) || 0.02;
    this._smoothing = 0.85;
    this._envelope  = 0;
    this.port.onmessage = (e) => {
      if (e.data.threshold !== undefined) this._threshold = e.data.threshold;
    };
  }
  process(inputs, outputs) {
    const input  = inputs[0];
    const output = outputs[0];
    if (!input || !input[0]) return true;
    for (let ch = 0; ch < input.length; ch++) {
      const inBuf  = input[ch];
      const outBuf = output[ch];
      if (!inBuf || !outBuf) continue;
      for (let i = 0; i < inBuf.length; i++) {
        const abs = Math.abs(inBuf[i]);
        this._envelope = this._smoothing * this._envelope + (1 - this._smoothing) * abs;
        // Gate: if signal below threshold, attenuate heavily
        const gain = this._envelope > this._threshold ? 1.0 : 0.05;
        outBuf[i] = inBuf[i] * gain;
      }
    }
    return true;
  }
}
registerProcessor('noise-gate-processor', NoiseGateProcessor);
`;

  async function _startNoiseCancellation(audioTrack) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Register worklet via blob URL
      var blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
      var blobUrl = URL.createObjectURL(blob);
      await _audioCtx.audioWorklet.addModule(blobUrl).catch(function(e) {
        console.warn('[NoiseCancellation] AudioWorklet unavailable, falling back to ScriptProcessor:', e.message);
      });
      URL.revokeObjectURL(blobUrl);

      var micStream = new MediaStream([audioTrack]);
      _sourceNode   = _audioCtx.createMediaStreamSource(micStream);
      _destNode     = _audioCtx.createMediaStreamDestination();

      // Try AudioWorklet first, fall back to ScriptProcessor
      var processorNode;
      try {
        processorNode = new AudioWorkletNode(_audioCtx, 'noise-gate-processor', {
          processorOptions: { threshold: 0.018 }
        });
        _noiseWorklet = processorNode;
      } catch (_e) {
        // ScriptProcessor fallback (deprecated but universally supported)
        var bufSize = 256;
        processorNode = _audioCtx.createScriptProcessor(bufSize, 1, 1);
        var envelope = 0;
        var threshold = 0.018;
        processorNode.onaudioprocess = function(e) {
          var inBuf  = e.inputBuffer.getChannelData(0);
          var outBuf = e.outputBuffer.getChannelData(0);
          for (var i = 0; i < inBuf.length; i++) {
            var abs = Math.abs(inBuf[i]);
            envelope = 0.85 * envelope + 0.15 * abs;
            outBuf[i] = inBuf[i] * (envelope > threshold ? 1.0 : 0.05);
          }
        };
      }

      _sourceNode.connect(processorNode);
      processorNode.connect(_destNode);
      _processedStream = _destNode.stream;

      return _processedStream.getAudioTracks()[0];
    } catch(err) {
      console.warn('[NoiseCancellation] Failed to start:', err.message);
      return null;
    }
  }

  function _stopNoiseCancellation() {
    _noiseActive = false;
    if (_noiseWorklet)  { try { _noiseWorklet.disconnect(); } catch(_) {} }
    if (_sourceNode)    { try { _sourceNode.disconnect();   } catch(_) {} }
    if (_destNode)      { try { _destNode.disconnect();     } catch(_) {} }
    if (_audioCtx && _audioCtx.state !== 'closed') {
      _audioCtx.close().catch(function(){});
    }
    _audioCtx = _noiseWorklet = _sourceNode = _destNode = _processedStream = null;
  }

  async function toggleNoiseCancellation() {
    var btn = document.getElementById('kyn-noise-btn');

    if (_noiseActive) {
      _stopNoiseCancellation();
      // Restore original audio track
      if (_origAudioTrack && window.__PeerConnectionManager) {
        var origTrack = _origAudioTrack;
        if (window.__PeerConnectionManager._peers) {
          window.__PeerConnectionManager._peers.forEach(function(session) {
            if (session._pc) {
              session._pc.getSenders()
                .filter(function(s) { return s.track && s.track.kind === 'audio'; })
                .forEach(function(s) { s.replaceTrack(origTrack).catch(function(){}); });
            }
          });
        }
      }
      if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('title', 'Noise cancellation (N)');
        btn.setAttribute('aria-label', 'Toggle noise cancellation');
      }
      if (window._kynAnnounce) window._kynAnnounce('Noise cancellation off.');
      return;
    }

    // Get current local audio track
    var localStream = null;
    if (window.__DeviceMediaManager && window.__DeviceMediaManager.getStream) {
      localStream = window.__DeviceMediaManager.getStream();
    }
    if (!localStream) {
      var lv = document.getElementById('localVideo');
      localStream = lv && lv.srcObject;
    }
    if (!localStream) return;

    var audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    _origAudioTrack = audioTrack;
    var processedTrack = await _startNoiseCancellation(audioTrack);
    if (!processedTrack) return;

    _noiseActive = true;

    // Replace audio track in all peer connections
    if (window.__PeerConnectionManager && window.__PeerConnectionManager._peers) {
      window.__PeerConnectionManager._peers.forEach(function(session) {
        if (session._pc) {
          session._pc.getSenders()
            .filter(function(s) { return s.track && s.track.kind === 'audio'; })
            .forEach(function(s) { s.replaceTrack(processedTrack).catch(function(){}); });
        }
      });
    }

    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('title', 'Stop noise cancellation (N)');
      btn.setAttribute('aria-label', 'Stop noise cancellation');
    }
    if (window._kynAnnounce) window._kynAnnounce('Noise cancellation on.');
  }

  function _addNoiseButton() {
    if (document.getElementById('kyn-noise-btn')) return;
    var controlsBar = document.getElementById('callControls');
    if (!controlsBar) return;

    var btn = document.createElement('button');
    btn.id        = 'kyn-noise-btn';
    btn.className = 'incall-ctrl-btn';
    btn.setAttribute('title',      'Noise cancellation (N)');
    btn.setAttribute('aria-label', 'Toggle noise cancellation');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<i class="fas fa-microphone-alt" aria-hidden="true"></i>';
    btn.style.display = 'none';

    btn.addEventListener('click', function() { toggleNoiseCancellation(); });
    var endBtn = controlsBar.querySelector('#endCallBtn');
    if (endBtn) controlsBar.insertBefore(btn, endBtn);
    else controlsBar.appendChild(btn);
  }

  window.addEventListener('callCore:stateChange', function(e) {
    var state = e.detail && e.detail.state;
    if (state === 'CONNECTED') {
      _addNoiseButton();
      var btn = document.getElementById('kyn-noise-btn');
      if (btn) btn.style.display = 'inline-flex';
    }
    if (state === 'IDLE' || state === 'ENDED') {
      _stopNoiseCancellation();
      var btn2 = document.getElementById('kyn-noise-btn');
      if (btn2) btn2.style.display = 'none';
    }
  });

  // Keyboard shortcut N
  window.addEventListener('kyn:shortcut:noise', function() { toggleNoiseCancellation(); });
  window.KynNoiseCancellation = {
    toggle: toggleNoiseCancellation,
    isActive: function() { return _noiseActive; }
  };
})();

// ── Call Session Recovery ─────────────────────────────────────────────────────
// Persists active call state to sessionStorage so if the page is refreshed
// mid-call (accidental F5, PWA reload), the call can be auto-rejoined.
(function initCallSessionRecovery() {
  'use strict';

  var STORAGE_KEY = 'kyn_active_call_session';

  function _saveSession(callId, callType, peerId) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        callId, callType, peerId,
        savedAt: Date.now(),
      }));
    } catch(_) {}
  }

  function _clearSession() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch(_) {}
  }

  function _loadSession() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      // Only restore if saved within last 90 seconds (call was active recently)
      if (Date.now() - s.savedAt > 90000) { _clearSession(); return null; }
      return s;
    } catch(_) { return null; }
  }

  // Save session when call connects
  window.addEventListener('callCore:stateChange', function(e) {
    var state = e.detail && e.detail.state;
    if (state === 'CONNECTED') {
      var callId   = e.detail.callId   || (window.callsState && (window.callsState.activeCallId || window.callsState.serverCallId));
      var callType = e.detail.callType || (window.callsState && window.callsState.callType) || 'audio';
      var peerId   = e.detail.peerId   || (window.callsState && window.callsState.remoteUserId);
      if (callId) _saveSession(callId, callType, peerId);
    }
    if (state === 'IDLE' || state === 'ENDED' || state === 'FAILED') {
      _clearSession();
    }
  });

  // On page load — check for active session to recover
  function _attemptRecovery() {
    var session = _loadSession();
    if (!session) return;

    console.log('[SessionRecovery] Found active call session:', session);

    // Show recovery banner
    var banner = document.createElement('div');
    banner.id = 'kyn-recovery-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.style.cssText = [
      'position:fixed','top:0','left:0','right:0','z-index:99999',
      'background:#6366f1','color:#fff','text-align:center',
      'padding:12px 20px','font-size:14px','font-weight:600',
      'display:flex','align-items:center','justify-content:center','gap:12px'
    ].join(';');
    banner.innerHTML = [
      '<i class="fas fa-phone-alt" aria-hidden="true"></i>',
      '<span>You were in an active call. Rejoin?</span>',
      '<button id="kyn-rejoin-btn" aria-label="Rejoin call" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:6px;padding:5px 14px;cursor:pointer;font-size:13px;font-weight:600;">Rejoin</button>',
      '<button id="kyn-recovery-dismiss" aria-label="Dismiss" style="background:transparent;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:18px;padding:0 8px;">×</button>'
    ].join('');
    document.body.appendChild(banner);

    if (window._kynAnnounce) window._kynAnnounce('You were in an active call. Press rejoin to reconnect.');

    document.getElementById('kyn-rejoin-btn').addEventListener('click', function() {
      banner.remove();
      // Re-initiate call with stored session data
      if (window.callCore && window.callCore.rejoinCall) {
        window.callCore.rejoinCall(session.callId, session.callType);
      } else {
        // Fallback: navigate to calls page with params
        var url = new URL(window.location.href);
        url.searchParams.set('rejoinCallId', session.callId);
        url.searchParams.set('callType', session.callType || 'audio');
        window.location.href = url.toString();
      }
      _clearSession();
    });

    document.getElementById('kyn-recovery-dismiss').addEventListener('click', function() {
      banner.remove();
      _clearSession();
    });

    // Auto-dismiss after 15 seconds
    setTimeout(function() { if (banner.parentNode) { banner.remove(); _clearSession(); } }, 15000);
  }

  // Run recovery check after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(_attemptRecovery, 1200); });
  } else {
    setTimeout(_attemptRecovery, 1200);
  }

  // Expose for calls-core to use
  window.KynSessionRecovery = {
    save:  _saveSession,
    clear: _clearSession,
    load:  _loadSession,
  };
})();
// ==================== CALLS LIST "MORE" MENU (list-level 3-dot) ====================
// Distinct from the in-call screen's own 3-dot menu (#menuDotsBtn / #menuDotsDropdown
// in calls.html, which shows Record/Participants/Chat/Whiteboard/Notes/Polls/
// Relationship — that one stays in-call only). This menu just shows/hides the
// Call Settings panel that used to be a separate always-expanded section in the
// scrollable list.
(function () {
    function _wireCallsListMoreMenu() {
        const btn = document.getElementById('callsListMoreBtn');
        const menu = document.getElementById('callsListMoreMenu');
        if (!btn || !menu) return;
        if (btn.dataset.wired === '1') return;
        btn.dataset.wired = '1';

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            const isOpen = menu.style.display === 'block';
            menu.style.display = isOpen ? 'none' : 'block';
        });

        // Close when tapping anywhere else, but never treat a tap inside the
        // menu itself as "outside" (avoids fighting with the toggle switches).
        document.addEventListener('click', function (e) {
            if (menu.style.display !== 'block') return;
            if (menu.contains(e.target) || e.target === btn || btn.contains(e.target)) return;
            menu.style.display = 'none';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _wireCallsListMoreMenu);
    } else {
        _wireCallsListMoreMenu();
    }
})();
