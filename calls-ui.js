import {
    AppState,
    elements,
    cacheElements,
    initializeOfflineDetection,
    initializeUI,
    showUI,
    enableUI,
    checkUrlParameters,
    showNotification,
    makeDraggable,
    closePip,
    checkPremiumFeature,
    updatePremiumUI,
    loadSettings,
    saveSettings,
    applySettingsToUI,
    updateSetting,
    applySettingChange,
    resetSettings,
    handleOnline,
    handleOffline,
    showOfflineUI,
    handleStorageEvent,
    debounce,
    stringToColor,
    formatTimeAgo,
    formatDuration,
    closeUrlParamOverlay,
    joinUrlParamCall,
    updateMoodIndicator,
    updateIntentionIndicator,
    updateParticipantBadge,
    updateChatBadge,
    updateGroupCallButton,
    updateVideoLayout,
    initializeWhiteboard,
    sendChatMessage,
    saveSharedNotes,
    renderCallHistory,
    createCallHistoryItem,
    currentUser,
    userDataLoaded,
    parentCoordinator,
    sessionAuthorityReady,
    CallAPIIntegration,
    ParentCoordinator,
    ParentChildCommunication,
    TokenManager,
    SecureAPIClient
} from './calls-core.js';

// ==================== PANEL FUNCTIONS ====================
export function openParticipantsPanel() {
    if (AppState.isInCall) {
        createParticipantsPanel();
        showNotification('Participants panel opened', 'info');
    } else {
        showNotification('Join a call to see participants', 'info');
    }
}

export function openChatPanel() {
    if (AppState.isInCall && AppState.settings.inCallChat) {
        createChatPanel();
        showNotification('Chat panel opened', 'info');
    } else if (!AppState.isInCall) {
        showNotification('Join a call to use chat', 'info');
    } else {
        showNotification('Enable in-call chat in settings', 'info');
    }
}

export function openWhiteboardPanel() {
    if (checkPremiumFeature('whiteboard')) {
        if (AppState.isInCall) {
            createWhiteboardPanel();
            showNotification('Whiteboard opened', 'info');
        } else {
            showNotification('Join a call to use whiteboard', 'info');
        }
    }
}

export function openNotesPanel() {
    if (AppState.isInCall && AppState.settings.notes) {
        createNotesPanel();
        showNotification('Notes panel opened', 'info');
    } else if (!AppState.isInCall) {
        showNotification('Join a call to use notes', 'info');
    } else {
        showNotification('Enable notes in settings', 'info');
    }
}

export function openPollsPanel() {
    if (checkPremiumFeature('polls')) {
        if (AppState.isInCall && AppState.settings.polls) {
            createPollsPanel();
            showNotification('Polls panel opened', 'info');
        } else if (!AppState.isInCall) {
            showNotification('Join a call to create polls', 'info');
        } else {
            showNotification('Enable polls in settings', 'info');
        }
    }
}

export function openRelationshipPanel() {
    if (checkPremiumFeature('relationshipInsights')) {
        createRelationshipPanel();
        showNotification('Relationship insights opened', 'info');
    }
}

export function createParticipantsPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel participants-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Participants (${AppState.callParticipants.length + 1})</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="participant-item">
                <div class="participant-avatar" style="background-color: ${stringToColor('You')}">Y</div>
                <div class="participant-info">
                    <div class="participant-name">You (Host)</div>
                    <div class="participant-status online">Online</div>
                </div>
            </div>
            ${AppState.callParticipants.map(participant => `
                <div class="participant-item">
                    <div class="participant-avatar" style="background-color: ${stringToColor(participant.name)}">
                        ${participant.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div class="participant-info">
                        <div class="participant-name">${participant.name}</div>
                        <div class="participant-status online">Online</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
}

export function createChatPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel chat-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>In-Call Chat</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="chat-messages" id="chatMessagesPanel">
                <div class="chat-message system">
                    <div class="message-content">Chat started. Messages are end-to-end encrypted.</div>
                </div>
            </div>
            <div class="chat-input-container">
                <input type="text" class="chat-input" id="chatInputPanel" placeholder="Type a message...">
                <button class="chat-send-btn" id="chatSendPanel">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
    
    const chatInput = panel.querySelector('#chatInputPanel');
    const chatSend = panel.querySelector('#chatSendPanel');
    
    chatSend.addEventListener('click', () => {
        const message = chatInput.value.trim();
        if (message) {
            sendChatMessage(message);
            chatInput.value = '';
        }
    });
    
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const message = chatInput.value.trim();
            if (message) {
                sendChatMessage(message);
                chatInput.value = '';
            }
        }
    });
}

export function createWhiteboardPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel whiteboard-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Shared Whiteboard</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="whiteboard-toolbar">
                <div class="tool-btn active" data-tool="pen">
                    <i class="fas fa-pen"></i>
                </div>
                <div class="tool-btn" data-tool="eraser">
                    <i class="fas fa-eraser"></i>
                </div>
                <div class="tool-btn" data-tool="text">
                    <i class="fas fa-font"></i>
                </div>
                <div class="tool-btn" data-tool="line">
                    <i class="fas fa-slash"></i>
                </div>
                <div class="tool-btn" data-tool="rectangle">
                    <i class="fas fa-square"></i>
                </div>
                <div class="tool-btn" data-tool="circle">
                    <i class="fas fa-circle"></i>
                </div>
                <div class="tool-color" style="background-color: #000000;" data-color="#000000"></div>
                <div class="tool-color selected" style="background-color: #ff3b30;" data-color="#ff3b30"></div>
                <div class="tool-color" style="background-color: #007aff;" data-color="#007aff"></div>
                <div class="tool-color" style="background-color: #34c759;" data-color="#34c759"></div>
                <div class="tool-color" style="background-color: #ff9500;" data-color="#ff9500"></div>
                <input type="range" class="tool-size-slider" min="1" max="20" value="3">
                <button class="tool-btn" id="clearWhiteboard">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <canvas class="whiteboard-canvas" width="800" height="500"></canvas>
            <div class="whiteboard-status">
                <span>Whiteboard ready. Draw something!</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    initializeWhiteboard(panel.querySelector('.whiteboard-canvas'));
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
    
    panel.querySelector('#clearWhiteboard').addEventListener('click', () => {
        if (confirm('Clear the entire whiteboard?')) {
            const canvas = panel.querySelector('.whiteboard-canvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });
}

export function createNotesPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel notes-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Shared Notes</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="notes-editor-container">
                <textarea class="notes-editor" id="sharedNotesEditor" placeholder="Start taking notes...">Meeting Notes:
- 
- 
-</textarea>
                <div class="notes-toolbar">
                    <button class="notes-btn" data-action="bold">
                        <i class="fas fa-bold"></i>
                    </button>
                    <button class="notes-btn" data-action="italic">
                        <i class="fas fa-italic"></i>
                    </button>
                    <button class="notes-btn" data-action="list">
                        <i class="fas fa-list-ul"></i>
                    </button>
                    <button class="notes-btn" data-action="save">
                        <i class="fas fa-save"></i> Save
                    </button>
                </div>
            </div>
            <div class="notes-history">
                <h5>Previous Notes</h5>
                <div class="notes-history-list">
                    <div class="notes-history-item">
                        <div class="notes-history-date">Today, 10:30 AM</div>
                        <div class="notes-history-preview">Project discussion notes...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
    
    panel.querySelector('[data-action="save"]').addEventListener('click', () => {
        const notes = panel.querySelector('#sharedNotesEditor').value;
        if (notes.trim()) {
            saveSharedNotes(notes);
            showNotification('Notes saved', 'success');
        }
    });
}

export function createPollsPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel polls-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Polls</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="polls-tabs">
                <button class="polls-tab active" data-tab="create">Create Poll</button>
                <button class="polls-tab" data-tab="active">Active Polls</button>
                <button class="polls-tab" data-tab="results">Results</button>
            </div>
            
            <div class="polls-tab-content active" data-tab="create">
                <div class="poll-form">
                    <input type="text" class="poll-question-input" placeholder="Enter your poll question...">
                    <div class="poll-options">
                        <input type="text" class="poll-option-input" placeholder="Option 1">
                        <input type="text" class="poll-option-input" placeholder="Option 2">
                        <button class="add-option-btn">Add Option</button>
                    </div>
                    <div class="poll-settings">
                        <label>
                            <input type="checkbox" checked> Multiple choices allowed
                        </label>
                        <label>
                            <input type="checkbox"> Anonymous voting
                        </label>
                    </div>
                    <button class="create-poll-btn">Create Poll</button>
                </div>
            </div>
            
            <div class="polls-tab-content" data-tab="active">
                <div class="active-polls-list">
                    <div class="poll-item">
                        <div class="poll-question">What time works best for our next meeting?</div>
                        <div class="poll-options">
                            <div class="poll-option">
                                <input type="radio" name="poll1" id="poll1-1">
                                <label for="poll1-1">Monday 10 AM</label>
                            </div>
                            <div class="poll-option">
                                <input type="radio" name="poll1" id="poll1-2">
                                <label for="poll1-2">Tuesday 2 PM</label>
                            </div>
                            <div class="poll-option">
                                <input type="radio" name="poll1" id="poll1-3">
                                <label for="poll1-3">Wednesday 11 AM</label>
                            </div>
                        </div>
                        <button class="vote-btn">Vote</button>
                    </div>
                </div>
            </div>
            
            <div class="polls-tab-content" data-tab="results">
                <div class="poll-results">
                    <div class="poll-result-item">
                        <div class="poll-question">Favorite meeting platform?</div>
                        <div class="result-bar">
                            <div class="result-fill" style="width: 60%">Zoom (60%)</div>
                        </div>
                        <div class="result-bar">
                            <div class="result-fill" style="width: 30%">Google Meet (30%)</div>
                        </div>
                        <div class="result-bar">
                            <div class="result-fill" style="width: 10%">Teams (10%)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
    
    panel.querySelectorAll('.polls-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            panel.querySelectorAll('.polls-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            panel.querySelectorAll('.polls-tab-content').forEach(content => {
                content.classList.remove('active');
                if (content.dataset.tab === tabName) {
                    content.classList.add('active');
                }
            });
        });
    });
    
    panel.querySelector('.create-poll-btn').addEventListener('click', () => {
        const question = panel.querySelector('.poll-question-input').value;
        if (question.trim()) {
            showNotification('Poll created successfully!', 'success');
        }
    });
}

export function createRelationshipPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel relationship-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Relationship Insights</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="insight-cards">
                <div class="insight-card">
                    <div class="insight-title">Total Calls</div>
                    <div class="insight-value">47</div>
                    <div class="insight-description">With all contacts</div>
                    <span class="insight-trend trend-up">+12%</span>
                </div>
                <div class="insight-card">
                    <div class="insight-title">Average Duration</div>
                    <div class="insight-value">24m</div>
                    <div class="insight-description">Per call</div>
                    <span class="insight-trend trend-neutral">0%</span>
                </div>
                <div class="insight-card">
                    <div class="insight-title">Busiest Day</div>
                    <div class="insight-value">Wednesday</div>
                    <div class="insight-description">Most calls scheduled</div>
                </div>
                <div class="insight-card">
                    <div class="insight-title">Favorite Contact</div>
                    <div class="insight-value">Sarah</div>
                    <div class="insight-description">15 calls this month</div>
                    <span class="insight-trend trend-up">+3</span>
                </div>
            </div>
            <div class="relationship-chart">
                <h5>Call Frequency (Last 30 days)</h5>
                <div class="chart-container">
                    <div class="chart-bar" style="height: 80%">Mon</div>
                    <div class="chart-bar" style="height: 60%">Tue</div>
                    <div class="chart-bar" style="height: 90%">Wed</div>
                    <div class="chart-bar" style="height: 70%">Thu</div>
                    <div class="chart-bar" style="height: 50%">Fri</div>
                    <div class="chart-bar" style="height: 40%">Sat</div>
                    <div class="chart-bar" style="height: 30%">Sun</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
}

// ==================== EVENT LISTENERS ====================
export function setupEventListeners() {
    if (elements.menuDotsBtn) {
        elements.menuDotsBtn.addEventListener('click', toggleMenuDots);
    }
    
    if (elements.menuParticipants) {
        elements.menuParticipants.addEventListener('click', () => {
            closeMenuDots();
            openParticipantsPanel();
        });
    }
    
    if (elements.menuChat) {
        elements.menuChat.addEventListener('click', () => {
            closeMenuDots();
            openChatPanel();
        });
    }
    
    if (elements.menuWhiteboard) {
        elements.menuWhiteboard.addEventListener('click', () => {
            closeMenuDots();
            openWhiteboardPanel();
        });
    }
    
    if (elements.menuNotes) {
        elements.menuNotes.addEventListener('click', () => {
            closeMenuDots();
            openNotesPanel();
        });
    }
    
    if (elements.menuPolls) {
        elements.menuPolls.addEventListener('click', () => {
            closeMenuDots();
            openPollsPanel();
        });
    }
    
    if (elements.menuRelationship) {
        elements.menuRelationship.addEventListener('click', () => {
            closeMenuDots();
            openRelationshipPanel();
        });
    }
    
    if (elements.menuDotsBtn && elements.menuDotsDropdown) {
        document.addEventListener('click', (e) => {
            if (!elements.menuDotsBtn.contains(e.target) && !elements.menuDotsDropdown.contains(e.target)) {
                closeMenuDots();
            }
        });
    }
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorageEvent);
    
    window.addEventListener('message', handleParentMessage);
    
    if (elements.declineCallBtn) {
        elements.declineCallBtn.addEventListener('click', declineIncomingCall);
    }
    if (elements.acceptCallBtn) {
        elements.acceptCallBtn.addEventListener('click', acceptIncomingCall);
    }
    if (elements.acceptVideoCallBtn) {
        elements.acceptVideoCallBtn.addEventListener('click', acceptIncomingCallAsVideo);
    }
    
    if (elements.newCallBtn) {
        elements.newCallBtn.addEventListener('click', openNewCallModal);
    }
    if (elements.closeNewCallModal) {
        elements.closeNewCallModal.addEventListener('click', closeNewCallModal);
    }
    
    if (elements.contactSearch) {
        elements.contactSearch.addEventListener('input', debounce(searchContacts, 300));
    }
    if (elements.groupContactSearch) {
        elements.groupContactSearch.addEventListener('input', debounce(searchGroupContacts, 300));
    }
    
    if (elements.startVoiceCallBtn) {
        elements.startVoiceCallBtn.addEventListener('click', startVoiceCall);
    }
    if (elements.startVideoCallBtn) {
        elements.startVideoCallBtn.addEventListener('click', startVideoCall);
    }
    if (elements.startGroupCallBtn) {
        elements.startGroupCallBtn.addEventListener('click', startGroupCall);
    }
    
    if (elements.instantGroupOption) {
        elements.instantGroupOption.addEventListener('click', selectGroupOption);
    }
    if (elements.scheduledGroupOption) {
        elements.scheduledGroupOption.addEventListener('click', selectGroupOption);
    }
    
    if (elements.copyLinkBtn) {
        elements.copyLinkBtn.addEventListener('click', copyCallLink);
    }
    if (elements.shareLinkBtn) {
        elements.shareLinkBtn.addEventListener('click', shareCallLink);
    }
    if (elements.generateVoiceLinkBtn) {
        elements.generateVoiceLinkBtn.addEventListener('click', generateVoiceCallLink);
    }
    if (elements.generateVideoLinkBtn) {
        elements.generateVideoLinkBtn.addEventListener('click', generateVideoCallLink);
    }
    
    if (elements.mpesaOption) {
        elements.mpesaOption.addEventListener('click', selectPaymentOption);
    }
    if (elements.cancelPaymentBtn) {
        elements.cancelPaymentBtn.addEventListener('click', closePaymentModal);
    }
    if (elements.processPaymentBtn) {
        elements.processPaymentBtn.addEventListener('click', processPayment);
    }
    if (elements.cancelUpgradeBtn) {
        elements.cancelUpgradeBtn.addEventListener('click', closePremiumLimitModal);
    }
    if (elements.upgradeNowBtn) {
        elements.upgradeNowBtn.addEventListener('click', openPaymentModal);
    }
    
    if (elements.cancelMoodBtn) {
        elements.cancelMoodBtn.addEventListener('click', closeMoodSelectionModal);
    }
    if (elements.setMoodBtn) {
        elements.setMoodBtn.addEventListener('click', setMood);
    }
    if (elements.cancelIntentionBtn) {
        elements.cancelIntentionBtn.addEventListener('click', closeIntentionSelectionModal);
    }
    if (elements.setIntentionBtn) {
        elements.setIntentionBtn.addEventListener('click', setIntention);
    }
    
    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
    
    document.querySelectorAll('.intention-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.intention-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
    
    if (elements.skipNotesBtn) {
        elements.skipNotesBtn.addEventListener('click', skipPrivateNotes);
    }
    if (elements.saveNotesBtn) {
        elements.saveNotesBtn.addEventListener('click', savePrivateNotes);
    }
    if (elements.summaryDoneBtn) {
        elements.summaryDoneBtn.addEventListener('click', closeCallSummary);
    }
    
    if (elements.urlParamCancelBtn) {
        elements.urlParamCancelBtn.addEventListener('click', closeUrlParamOverlay);
    }
    if (elements.urlParamJoinBtn) {
        elements.urlParamJoinBtn.addEventListener('click', joinUrlParamCall);
    }
    
    if (elements.quickVoiceBtn) {
        elements.quickVoiceBtn.addEventListener('click', openNewCallModal);
    }
    if (elements.quickVideoBtn) {
        elements.quickVideoBtn.addEventListener('click', openNewCallModal);
    }
    if (elements.quickGroupBtn) {
        elements.quickGroupBtn.addEventListener('click', openNewCallModal);
    }
    
    if (elements.settingsToggle) {
        elements.settingsToggle.addEventListener('click', toggleSettingsPanel);
    }
    if (elements.resetSettingsBtn) {
        elements.resetSettingsBtn.addEventListener('click', resetSettings);
    }
    
    if (elements.emotionalContextToggle) {
        elements.emotionalContextToggle.addEventListener('change', updateSetting);
    }
    if (elements.callIntentionToggle) {
        elements.callIntentionToggle.addEventListener('change', updateSetting);
    }
    if (elements.inCallChatToggle) {
        elements.inCallChatToggle.addEventListener('change', updateSetting);
    }
    if (elements.whiteboardToggle) {
        elements.whiteboardToggle.addEventListener('change', updateSetting);
    }
    if (elements.pollsToggle) {
        elements.pollsToggle.addEventListener('change', updateSetting);
    }
    if (elements.notesToggle) {
        elements.notesToggle.addEventListener('change', updateSetting);
    }
    if (elements.focusModeToggle) {
        elements.focusModeToggle.addEventListener('change', updateSetting);
    }
    if (elements.liveReactionsToggle) {
        elements.liveReactionsToggle.addEventListener('change', updateSetting);
    }
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.dataset.category;
            switchCallCategory(category);
        });
    });
    
    document.querySelectorAll('.new-call-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            switchNewCallTab(tabId);
        });
    });
    
    if (elements.muteBtn) {
        elements.muteBtn.addEventListener('click', toggleMute);
    }
    if (elements.videoBtn) {
        elements.videoBtn.addEventListener('click', toggleVideo);
    }
    if (elements.screenShareBtn) {
        elements.screenShareBtn.addEventListener('click', toggleScreenShare);
    }
    if (elements.speakerBtn) {
        elements.speakerBtn.addEventListener('click', toggleSpeaker);
    }
    if (elements.moodBtn) {
        elements.moodBtn.addEventListener('click', openMoodSelectionModal);
    }
    if (elements.intentionBtn) {
        elements.intentionBtn.addEventListener('click', openIntentionSelectionModal);
    }
    if (elements.endCallBtn) {
        elements.endCallBtn.addEventListener('click', endCall);
    }
    
    if (elements.focusModeBtn) {
        elements.focusModeBtn.addEventListener('click', toggleFocusMode);
    }
    
    document.querySelectorAll('.reaction-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const reaction = this.dataset.reaction;
            sendReaction(reaction);
        });
    });
    
    if (elements.pipCloseBtn) {
        elements.pipCloseBtn.addEventListener('click', closePip);
    }
    
    if (elements.pipContainer) {
        makeDraggable(elements.pipContainer);
    }
}

// ==================== CALL MANAGEMENT ====================
export function openNewCallModal() {
    if (parentCoordinator && !parentCoordinator.sessionValidated) {
        showNotification('Please wait for authentication', 'warning');
        parentCoordinator.showReconnectState();
        return;
    }
    
    if (!AppState.isOnline) {
        showNotification('Cannot load contacts while offline', 'warning');
        return;
    }
    
    elements.newCallModal.classList.add('active');
    
    if (AppState.contacts.length === 0 && window.callAPI) {
        window.callAPI.fetchContacts();
    } else if (window.callAPI) {
        window.callAPI.renderContacts(AppState.contacts);
    }
    
    switchNewCallTab('contacts');
}

export function closeNewCallModal() {
    elements.newCallModal.classList.remove('active');
    
    document.querySelectorAll('.contact-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    elements.contactSearch.value = '';
    elements.groupContactSearch.value = '';
    
    elements.instantGroupOption.classList.remove('selected');
    elements.scheduledGroupOption.classList.remove('selected');
    elements.startGroupCallBtn.disabled = true;
}

export function searchContacts() {
    const query = elements.contactSearch.value.toLowerCase();
    
    document.querySelectorAll('.contact-item').forEach(item => {
        const name = item.querySelector('.call-name').textContent.toLowerCase();
        if (name.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

export function searchGroupContacts() {
    const query = elements.groupContactSearch.value.toLowerCase();
    
    document.querySelectorAll('.contact-item[data-id]').forEach(item => {
        const name = item.querySelector('.call-name').textContent.toLowerCase();
        if (name.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

export function selectGroupOption(event) {
    const option = event.currentTarget;
    
    if (option.id === 'instantGroupOption') {
        elements.scheduledGroupOption.classList.remove('selected');
    } else {
        elements.instantGroupOption.classList.remove('selected');
    }
    
    option.classList.add('selected');
}

export function startVoiceCall() {
    if (parentCoordinator && !parentCoordinator.sessionValidated) {
        showNotification('Please wait for authentication', 'warning');
        parentCoordinator.showReconnectState();
        return;
    }
    
    const selectedContacts = getSelectedContacts();
    
    if (selectedContacts.length === 0) {
        showNotification('Please select at least one contact', 'warning');
        return;
    }
    
    if (selectedContacts.length > 1 && !checkPremiumFeature('groupCalls')) {
        return;
    }
    
    startCall('voice', selectedContacts);
    closeNewCallModal();
}

export function startVideoCall() {
    if (parentCoordinator && !parentCoordinator.sessionValidated) {
        showNotification('Please wait for authentication', 'warning');
        parentCoordinator.showReconnectState();
        return;
    }
    
    const selectedContacts = getSelectedContacts();
    
    if (selectedContacts.length === 0) {
        showNotification('Please select at least one contact', 'warning');
        return;
    }
    
    if (selectedContacts.length > 1 && !checkPremiumFeature('groupCalls')) {
        return;
    }
    
    startCall('video', selectedContacts);
    closeNewCallModal();
}

export function startGroupCall() {
    if (parentCoordinator && !parentCoordinator.sessionValidated) {
        showNotification('Please wait for authentication', 'warning');
        parentCoordinator.showReconnectState();
        return;
    }
    
    const selectedContacts = getSelectedGroupContacts();
    const groupOption = document.querySelector('.option-item.selected');
    
    if (selectedContacts.length < 2) {
        showNotification('Please select at least 2 contacts for group call', 'warning');
        return;
    }
    
    if (!groupOption) {
        showNotification('Please select a group call option', 'warning');
        return;
    }
    
    if (!checkPremiumFeature('groupCalls')) {
        return;
    }
    
    const isInstant = groupOption.id === 'instantGroupOption';
    
    if (isInstant) {
        startCall('video', selectedContacts);
        closeNewCallModal();
    } else {
        scheduleGroupCall(selectedContacts);
    }
}

export function getSelectedContacts() {
    const selected = [];
    document.querySelectorAll('.contact-checkbox:checked').forEach(checkbox => {
        const contactId = checkbox.id.replace('contact-', '');
        const contact = AppState.contacts.find(c => c.id === contactId);
        if (contact) {
            selected.push(contact);
        }
    });
    return selected;
}

export function getSelectedGroupContacts() {
    const selected = [];
    document.querySelectorAll('.group-contact:checked').forEach(checkbox => {
        const contactId = checkbox.id.replace('group-contact-', '');
        const contact = AppState.contacts.find(c => c.id === contactId);
        if (contact) {
            selected.push(contact);
        }
    });
    return selected;
}

export function startCall(type, participants) {
    if (AppState.isInCall) {
        showNotification('You are already in a call', 'warning');
        return;
    }
    
    console.log(`[Calls iframe] Starting ${type} call with ${participants.length} participants`);
    
    requestMediaPermissions(type)
        .then(stream => {
            AppState.localStream = stream;
            AppState.callType = type;
            AppState.callParticipants = participants;
            
            AppState.activeCallId = 'call-' + Date.now();
            AppState.currentCall = {
                id: AppState.activeCallId,
                type: type,
                participants: participants.map(p => p.id)
            };
            
            initializePeer();
            
            showCallUI();
            
            startCallTimer();
            
            initializeCallFeatures();
            
            showNotification(`Starting ${type} call with ${participants.length} participant(s)`, 'success');
        })
        .catch(error => {
            console.error('[Calls iframe] Error starting call:', error);
            
            if (AppState.localStream) {
                AppState.localStream.getTracks().forEach(track => track.stop());
                AppState.localStream = null;
            }
            
            showNotification(`Failed to start call: ${error.message}`, 'error');
        });
}

export function requestMediaPermissions(type) {
    const constraints = {
        audio: true,
        video: type === 'video'
    };
    
    return navigator.mediaDevices.getUserMedia(constraints)
        .catch(error => {
            console.error('[Calls iframe] Error getting media permissions:', error);
            
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

export function initializePeer() {
    const peerId = 'user-' + Math.random().toString(36).substr(2, 9);
    
    AppState.peer = new Peer(peerId, {
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    });
    
    AppState.peer.on('open', (id) => {
        console.log('[Calls iframe] Peer connected with ID:', id);
    });
    
    AppState.peer.on('call', (call) => {
        call.answer(AppState.localStream);
        
        call.on('stream', (remoteStream) => {
            addRemoteStream(call.peer, remoteStream);
        });
        
        call.on('close', () => {
            removeRemoteStream(call.peer);
        });
        
        AppState.connections.set(call.peer, call);
    });
    
    AppState.peer.on('error', (error) => {
        console.error('[Calls iframe] PeerJS error:', error);
        showNotification('Connection error: ' + error.type, 'error');
    });
    
    setTimeout(() => {
        if (AppState.callParticipants && AppState.callParticipants.length > 0) {
            AppState.callParticipants.forEach((participant, index) => {
                setTimeout(() => {
                    simulateRemoteConnection(participant.id);
                }, index * 1000);
            });
        }
    }, 1000);
}

export function simulateRemoteConnection(participantId) {
    const fakePeerId = 'remote-' + participantId;
    
    const participant = AppState.callParticipants.find(p => p.id === participantId);
    if (participant) {
        addRemoteStream(fakePeerId, null);
    }
}

export function addRemoteStream(peerId, stream) {
    AppState.remoteStreams.set(peerId, stream);
    
    updateVideoGrid();
}

export function removeRemoteStream(peerId) {
    AppState.remoteStreams.delete(peerId);
    
    updateVideoGrid();
}

export function showCallUI() {
    elements.sidebar.style.display = 'none';
    
    elements.callContainer.classList.add('active');
    
    const participantNames = AppState.callParticipants.map(p => p.name).join(', ');
    elements.callWithName.textContent = participantNames;
    elements.callStatusText.textContent = 'In call';
    
    const icon = AppState.callType === 'video' ? 'fa-video' : 'fa-phone';
    elements.callTypeIcon.innerHTML = `<i class="fas ${icon}"></i>`;
    
    if (AppState.settings.emotionalContext) {
        updateMoodIndicator(AppState.currentMood);
        updateIntentionIndicator(AppState.currentIntention);
    }
    
    elements.focusModeBtn.style.display = 'block';
    
    updateParticipantBadge();
    
    AppState.isInCall = true;
}

export function startCallTimer() {
    AppState.callStartTime = Date.now();
    
    clearInterval(AppState.callDurationInterval);
    
    AppState.callDurationInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - AppState.callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        elements.callDuration.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

export function initializeCallFeatures() {
    if (AppState.localStream && AppState.callType === 'video') {
        createVideoElement('local', 'You', AppState.localStream, true);
    }
    
    if (AppState.settings.liveReactions) {
        elements.reactionsContainer.style.display = 'flex';
    }
    
    if (AppState.settings.focusMode) {
        enableFocusMode();
    }
}

export function updateVideoGrid() {
    const videoContainers = elements.videoGrid.querySelectorAll('.video-container:not([data-id="local"])');
    videoContainers.forEach(container => container.remove());
    
    elements.offlineCallPlaceholder.style.display = 'none';
    elements.videoGrid.style.display = 'grid';
    
    AppState.remoteStreams.forEach((stream, peerId) => {
        let participantName = 'Participant';
        let participant = null;
        
        for (const p of AppState.callParticipants) {
            if ('remote-' + p.id === peerId) {
                participant = p;
                participantName = p.name;
                break;
            }
        }
        
        createVideoElement(peerId, participantName, stream, false, participant);
    });
    
    updateVideoLayout();
}

export function createVideoElement(id, name, stream, isLocal = false, participant = null) {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.dataset.id = id;
    
    if (isLocal) {
        videoContainer.classList.add('pinned');
    }
    
    const video = document.createElement('video');
    video.className = 'video-element';
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal;
    
    if (stream) {
        video.srcObject = stream;
    } else {
        video.style.backgroundColor = '#333';
        video.style.display = 'flex';
        video.style.alignItems = 'center';
        video.style.justifyContent = 'center';
        video.innerHTML = `<div style="color: white; font-size: 24px;">${name.charAt(0)}</div>`;
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'video-name';
    
    const statusSpan = document.createElement('span');
    statusSpan.className = 'video-status';
    statusSpan.textContent = isLocal ? 'You' : (participant ? 'Connected' : 'Remote');
    
    nameDiv.innerHTML = `<span>${name}</span>`;
    nameDiv.appendChild(statusSpan);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'video-actions';
    
    const pinBtn = document.createElement('button');
    pinBtn.className = 'video-action-btn' + (isLocal ? ' active' : '');
    pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
    pinBtn.title = isLocal ? 'Pinned (You)' : 'Pin video';
    pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePinVideo(id);
    });
    
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'video-action-btn';
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenBtn.title = 'Fullscreen';
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen(video);
    });
    
    actionsDiv.appendChild(pinBtn);
    actionsDiv.appendChild(fullscreenBtn);
    
    overlay.appendChild(nameDiv);
    overlay.appendChild(actionsDiv);
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(overlay);
    
    videoContainer.addEventListener('click', () => {
        spotlightVideo(id);
    });
    
    elements.videoGrid.appendChild(videoContainer);
    
    if (stream) {
        video.play().catch(e => console.error('[Calls iframe] Error playing video:', e));
    }
}

export function togglePinVideo(videoId) {
    const videoContainer = elements.videoGrid.querySelector(`.video-container[data-id="${videoId}"]`);
    
    if (!videoContainer) return;
    
    elements.videoGrid.querySelectorAll('.video-container.pinned').forEach(container => {
        if (container.dataset.id !== videoId) {
            container.classList.remove('pinned');
            const pinBtn = container.querySelector('.video-action-btn');
            if (pinBtn) {
                pinBtn.classList.remove('active');
                pinBtn.title = 'Pin video';
            }
        }
    });
    
    const isPinned = videoContainer.classList.contains('pinned');
    
    if (isPinned) {
        videoContainer.classList.remove('pinned');
    } else {
        videoContainer.classList.add('pinned');
    }
    
    const pinBtn = videoContainer.querySelector('.video-action-btn');
    if (pinBtn) {
        pinBtn.classList.toggle('active', !isPinned);
        pinBtn.title = !isPinned ? 'Pinned' : 'Pin video';
    }
    
    updateVideoLayout();
}

export function spotlightVideo(videoId) {
    const videoContainer = elements.videoGrid.querySelector(`.video-container[data-id="${videoId}"]`);
    
    if (!videoContainer) return;
    
    const isSpotlight = videoContainer.style.gridColumn === '1 / -1';
    
    if (isSpotlight) {
        videoContainer.style.gridColumn = '';
        videoContainer.style.gridRow = '';
    } else {
        videoContainer.style.gridColumn = '1 / -1';
        videoContainer.style.gridRow = '1 / -1';
        videoContainer.style.zIndex = '10';
        
        let exitBtn = videoContainer.querySelector('.spotlight-exit');
        if (!exitBtn) {
            exitBtn = document.createElement('button');
            exitBtn.className = 'video-action-btn danger';
            exitBtn.innerHTML = '<i class="fas fa-times"></i>';
            exitBtn.title = 'Exit spotlight';
            exitBtn.style.position = 'absolute';
            exitBtn.style.top = '10px';
            exitBtn.style.right = '10px';
            exitBtn.classList.add('spotlight-exit');
            
            exitBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                spotlightVideo(videoId);
            });
            
            videoContainer.querySelector('.video-overlay').appendChild(exitBtn);
        }
    }
    
    updateVideoLayout();
}

export function toggleFullscreen(videoElement) {
    if (!document.fullscreenElement) {
        videoElement.requestFullscreen().catch(err => {
            console.error('[Calls iframe] Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

export function toggleMute() {
    if (!AppState.localStream) return;
    
    const audioTracks = AppState.localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        AppState.isMuted = !AppState.isMuted;
        audioTracks.forEach(track => {
            track.enabled = !AppState.isMuted;
        });
        
        const icon = elements.muteBtn.querySelector('i');
        if (AppState.isMuted) {
            icon.className = 'fas fa-microphone-slash';
            elements.muteBtn.title = 'Unmute';
        } else {
            icon.className = 'fas fa-microphone';
            elements.muteBtn.title = 'Mute';
        }
        
        showNotification(AppState.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
    }
}

export function toggleVideo() {
    if (!AppState.localStream) return;
    
    const videoTracks = AppState.localStream.getVideoTracks();
    if (videoTracks.length > 0) {
        AppState.isVideoOff = !AppState.isVideoOff;
        videoTracks.forEach(track => {
            track.enabled = !AppState.isVideoOff;
        });
        
        const icon = elements.videoBtn.querySelector('i');
        if (AppState.isVideoOff) {
            icon.className = 'fas fa-video-slash';
            elements.videoBtn.title = 'Turn Video On';
            
            const localVideo = elements.videoGrid.querySelector('.video-container[data-id="local"]');
            if (localVideo) {
                localVideo.style.display = 'none';
            }
        } else {
            icon.className = 'fas fa-video';
            elements.videoBtn.title = 'Turn Video Off';
            
            const localVideo = elements.videoGrid.querySelector('.video-container[data-id="local"]');
            if (localVideo) {
                localVideo.style.display = 'block';
            }
        }
        
        showNotification(AppState.isVideoOff ? 'Camera turned off' : 'Camera turned on', 'info');
    }
}

export function toggleScreenShare() {
    if (!checkPremiumFeature('screenSharing')) {
        return;
    }
    
    if (AppState.isScreenSharing) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
}

export function startScreenShare() {
    if (!navigator.mediaDevices.getDisplayMedia) {
        showNotification('Screen sharing is not supported in your browser', 'error');
        return;
    }
    
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        .then(stream => {
            AppState.screenStream = stream;
            AppState.isScreenSharing = true;
            
            const videoTrack = stream.getVideoTracks()[0];
            
            elements.screenShareBtn.classList.add('active');
            elements.screenShareBtn.title = 'Stop Sharing';
            
            const localVideo = elements.videoGrid.querySelector('.video-container[data-id="local"] video');
            if (localVideo) {
                const newStream = new MediaStream();
                newStream.addTrack(videoTrack);
                newStream.addTrack(AppState.localStream.getAudioTracks()[0]);
                
                localVideo.srcObject = newStream;
            }
            
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                stopScreenShare();
            });
            
            showNotification('Screen sharing started', 'success');
        })
        .catch(error => {
            console.error('[Calls iframe] Error starting screen share:', error);
            
            if (error.name === 'NotAllowedError') {
                showNotification('Screen sharing permission denied', 'error');
            } else {
                showNotification('Failed to start screen sharing', 'error');
            }
        });
}

export function stopScreenShare() {
    if (!AppState.screenStream) return;
    
    AppState.screenStream.getTracks().forEach(track => track.stop());
    AppState.screenStream = null;
    AppState.isScreenSharing = false;
    
    if (AppState.localStream) {
        const localVideo = elements.videoGrid.querySelector('.video-container[data-id="local"] video');
        if (localVideo) {
            localVideo.srcObject = AppState.localStream;
        }
    }
    
    elements.screenShareBtn.classList.remove('active');
    elements.screenShareBtn.title = 'Share Screen';
    
    showNotification('Screen sharing stopped', 'info');
}

export function toggleSpeaker() {
    AppState.isSpeakerOn = !AppState.isSpeakerOn;
    
    const icon = elements.speakerBtn.querySelector('i');
    if (AppState.isSpeakerOn) {
        icon.className = 'fas fa-volume-up';
        elements.speakerBtn.title = 'Switch to Headphones';
    } else {
        icon.className = 'fas fa-headphones';
        elements.speakerBtn.title = 'Switch to Speaker';
    }
    
    showNotification(`Switched to ${AppState.isSpeakerOn ? 'speaker' : 'headphones'}`, 'info');
}

export function endCall() {
    if (!AppState.isInCall) return;
    
    if (confirm('End the call?')) {
        if (AppState.localStream) {
            AppState.localStream.getTracks().forEach(track => track.stop());
            AppState.localStream = null;
        }
        
        if (AppState.screenStream) {
            AppState.screenStream.getTracks().forEach(track => track.stop());
            AppState.screenStream = null;
        }
        
        AppState.remoteStreams.forEach(stream => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        });
        AppState.remoteStreams.clear();
        
        if (AppState.peer) {
            AppState.peer.destroy();
            AppState.peer = null;
        }
        
        AppState.connections.clear();
        
        clearInterval(AppState.callDurationInterval);
        
        const callDuration = AppState.callStartTime ? 
            Math.floor((Date.now() - AppState.callStartTime) / 1000) : 0;
        
        AppState.isInCall = false;
        AppState.activeCallId = null;
        AppState.currentCall = null;
        AppState.callType = null;
        AppState.callParticipants = [];
        AppState.callStartTime = null;
        
        elements.callContainer.classList.remove('active');
        elements.sidebar.style.display = 'flex';
        
        elements.focusModeBtn.style.display = 'none';
        
        if (AppState.currentFocusMode) {
            disableFocusMode();
        }
        
        setTimeout(() => {
            showPrivateNotesModal();
        }, 500);
        
        showNotification('Call ended', 'info');
    }
}

export function showPrivateNotesModal() {
    const lastContact = AppState.callParticipants[0];
    
    if (lastContact) {
        elements.privateNotesTitle.textContent = `Notes about call with ${lastContact.name}`;
        elements.privateNotesSubtitle.textContent = 'Add private notes about this call (only visible to you)';
        
        const previousNotes = getPrivateNotes(lastContact.id);
        if (previousNotes) {
            elements.privateNotesTextarea.value = previousNotes;
        } else {
            elements.privateNotesTextarea.value = '';
        }
        
        elements.privateNotesModal.classList.add('active');
    } else {
        showCallSummary();
    }
}

export function skipPrivateNotes() {
    elements.privateNotesModal.classList.remove('active');
    showCallSummary();
}

export function savePrivateNotes() {
    const notes = elements.privateNotesTextarea.value.trim();
    const lastContact = AppState.callParticipants[0];
    
    if (lastContact && notes) {
        savePrivateNotesToStorage(lastContact.id, notes);
        showNotification('Notes saved', 'success');
    }
    
    elements.privateNotesModal.classList.remove('active');
    showCallSummary();
}

export function savePrivateNotesToStorage(contactId, notes) {
    try {
        const allNotes = JSON.parse(localStorage.getItem('privateCallNotes') || '{}');
        allNotes[contactId] = {
            notes: notes,
            timestamp: new Date().toISOString(),
            callId: AppState.activeCallId
        };
        localStorage.setItem('privateCallNotes', JSON.stringify(allNotes));
    } catch (error) {
        console.error('[Calls iframe] Error saving private notes:', error);
    }
}

export function getPrivateNotes(contactId) {
    try {
        const allNotes = JSON.parse(localStorage.getItem('privateCallNotes') || '{}');
        return allNotes[contactId] ? allNotes[contactId].notes : null;
    } catch (error) {
        console.error('[Calls iframe] Error loading private notes:', error);
        return null;
    }
}

export function showCallSummary() {
    const callDuration = AppState.callStartTime ? 
        Math.floor((Date.now() - AppState.callStartTime) / 1000) : 0;
    
    const minutes = Math.floor(callDuration / 60);
    const seconds = callDuration % 60;
    
    elements.summaryDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    elements.summaryTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    elements.summaryType.textContent = AppState.callType === 'video' ? 'Video Call' : 'Voice Call';
    elements.summaryMood.textContent = AppState.currentMood.charAt(0).toUpperCase() + AppState.currentMood.slice(1);
    elements.summaryIntention.textContent = AppState.currentIntention === 'quick' ? 'Quick Chat' : 
                                          AppState.currentIntention === 'important' ? 'Important Discussion' :
                                          AppState.currentIntention === 'emergency' ? 'Emergency' :
                                          AppState.currentIntention === 'checkin' ? 'Check-in' : 'Work/Business';
    elements.summaryParticipants.textContent = AppState.callParticipants.length + 1;
    
    elements.callSummaryModal.classList.add('active');
}

export function closeCallSummary() {
    elements.callSummaryModal.classList.remove('active');
}

export function openMoodSelectionModal() {
    elements.moodSelectionModal.classList.add('active');
    
    document.querySelectorAll('.mood-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.mood === AppState.currentMood) {
            option.classList.add('selected');
        }
    });
}

export function closeMoodSelectionModal() {
    elements.moodSelectionModal.classList.remove('active');
}

export function setMood() {
    const selectedOption = document.querySelector('.mood-option.selected');
    if (selectedOption) {
        const newMood = selectedOption.dataset.mood;
        AppState.currentMood = newMood;
        
        localStorage.setItem('currentMood', newMood);
        
        updateMoodIndicator(newMood);
        
        if (AppState.isInCall) {
            broadcastData({ type: 'mood', mood: newMood });
        }
        
        closeMoodSelectionModal();
        showNotification(`Mood set to ${newMood}`, 'success');
    }
}

export function openIntentionSelectionModal() {
    elements.intentionSelectionModal.classList.add('active');
    
    document.querySelectorAll('.intention-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.intention === AppState.currentIntention) {
            option.classList.add('selected');
        }
    });
}

export function closeIntentionSelectionModal() {
    elements.intentionSelectionModal.classList.remove('active');
}

export function setIntention() {
    const selectedOption = document.querySelector('.intention-option.selected');
    if (selectedOption) {
        const newIntention = selectedOption.dataset.intention;
        AppState.currentIntention = newIntention;
        
        localStorage.setItem('currentIntention', newIntention);
        
        updateIntentionIndicator(newIntention);
        
        if (AppState.isInCall) {
            broadcastData({ type: 'intention', intention: newIntention });
        }
        
        closeIntentionSelectionModal();
        showNotification(`Intention set to ${newIntention}`, 'success');
    }
}

export function toggleFocusMode() {
    if (AppState.currentFocusMode) {
        disableFocusMode();
    } else {
        enableFocusMode();
    }
}

export function enableFocusMode() {
    AppState.currentFocusMode = true;
    elements.appContainer.classList.add('focus-mode');
    elements.focusModeBtn.classList.add('active');
    elements.focusModeBtn.title = 'Exit Focus Mode';
    
    showNotification('Focus mode enabled', 'info');
}

export function disableFocusMode() {
    AppState.currentFocusMode = false;
    elements.appContainer.classList.remove('focus-mode');
    elements.focusModeBtn.classList.remove('active');
    elements.focusModeBtn.title = 'Focus Mode';
}

export function sendReaction(reaction) {
    if (!AppState.isInCall) return;
    
    createFloatingReaction(reaction);
    
    broadcastData({ type: 'reaction', reaction: reaction });
    
    showNotification(`Sent ${reaction} reaction`, 'info');
}

export function createFloatingReaction(reaction) {
    const reactionEl = document.createElement('div');
    reactionEl.className = 'floating-reaction';
    reactionEl.textContent = reaction;
    reactionEl.style.left = Math.random() * 80 + 10 + '%';
    reactionEl.style.top = Math.random() * 80 + 10 + '%';
    
    elements.callContainer.appendChild(reactionEl);
    
    setTimeout(() => {
        reactionEl.remove();
    }, 3000);
}

export function broadcastData(data) {
    console.log('[Calls iframe] Broadcasting data:', data);
    
    if (data.type === 'reaction' && Math.random() > 0.5) {
        setTimeout(() => {
            createFloatingReaction(data.reaction);
        }, Math.random() * 1000 + 500);
    }
}

export function scheduleGroupCall(participants) {
    showNotification('Group call scheduled successfully', 'success');
    closeNewCallModal();
}

export function generateVoiceCallLink() {
    generateCallLink('voice');
}

export function generateVideoCallLink() {
    generateCallLink('video');
}

export function generateCallLink(type) {
    const callId = 'call-' + Math.random().toString(36).substr(2, 9);
    const baseUrl = window.location.origin + window.location.pathname;
    const callUrl = `${baseUrl}?call=${callId}&type=${type}`;
    
    elements.callLinkInput.value = callUrl;
    
    showNotification(`${type === 'voice' ? 'Voice' : 'Video'} call link generated`, 'success');
}

export function copyCallLink() {
    const link = elements.callLinkInput.value;
    
    if (!link) {
        showNotification('Generate a call link first', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(link)
        .then(() => {
            showNotification('Call link copied to clipboard', 'success');
        })
        .catch(err => {
            console.error('[Calls iframe] Failed to copy: ', err);
            showNotification('Failed to copy link', 'error');
        });
}

export function shareCallLink() {
    const link = elements.callLinkInput.value;
    
    if (!link) {
        showNotification('Generate a call link first', 'warning');
        return;
    }
    
    if (navigator.share) {
        navigator.share({
            title: 'Join my call',
            text: 'Join my call using this link',
            url: link,
        })
        .then(() => {
            showNotification('Call link shared', 'success');
        })
        .catch(err => {
            console.error('[Calls iframe] Error sharing:', err);
            showNotification('Failed to share link', 'error');
        });
    } else {
        copyCallLink();
    }
}

// ==================== CALL HISTORY ====================
export function switchCallCategory(category) {
    AppState.currentCategory = category;
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        }
    });
    
    elements.allCallsSection.classList.remove('active');
    elements.missedCallsSection.classList.remove('active');
    elements.groupCallsSection.classList.remove('active');
    
    if (category === 'all') {
        elements.allCallsSection.classList.add('active');
    } else if (category === 'missed') {
        elements.missedCallsSection.classList.add('active');
    } else if (category === 'group') {
        elements.groupCallsSection.classList.add('active');
    }
}

export function switchNewCallTab(tabId) {
    document.querySelectorAll('.new-call-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabId) {
            tab.classList.add('active');
        }
    });
    
    document.querySelectorAll('.new-call-tab-content').forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId + 'Tab') {
            content.classList.add('active');
        }
    });
}

export function toggleMenuDots() {
    elements.menuDotsDropdown.classList.toggle('active');
}

export function closeMenuDots() {
    elements.menuDotsDropdown.classList.remove('active');
}

// ==================== PAYMENT & UPGRADE ====================
export function openPaymentModal() {
    elements.paymentModal.classList.add('active');
    elements.premiumLimitOverlay.classList.remove('active');
}

export function closePaymentModal() {
    elements.paymentModal.classList.remove('active');
}

export function selectPaymentOption(event) {
    document.querySelectorAll('.payment-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    event.currentTarget.classList.add('selected');
}

export function processPayment() {
    const phoneNumber = elements.phoneNumber.value.trim();
    const amount = elements.paymentAmount.value;
    
    if (!phoneNumber || !/^07\d{8}$/.test(phoneNumber)) {
        showNotification('Please enter a valid Kenyan phone number (07XXXXXXXX)', 'error');
        return;
    }
    
    if (!amount || amount < 100) {
        showNotification('Please enter a valid amount (minimum 100 KES)', 'error');
        return;
    }
    
    showNotification('Processing payment...', 'info');
    
    setTimeout(() => {
        closePaymentModal();
        AppState.isPremium = true;
        updatePremiumUI();
        showNotification('Payment successful! Premium features unlocked.', 'success');
    }, 2000);
}

export function closePremiumLimitModal() {
    elements.premiumLimitOverlay.classList.remove('active');
}

// ==================== INCOMING CALL SIMULATION ====================
export function simulateIncomingCall() {
    if (AppState.isInCall || elements.incomingCallModal.classList.contains('active')) {
        return;
    }
    
    if (AppState.contacts.length === 0) return;
    
    const randomContact = AppState.contacts[Math.floor(Math.random() * AppState.contacts.length)];
    const isVideoCall = Math.random() > 0.5;
    
    elements.incomingCallName.textContent = randomContact.name;
    elements.incomingCallType.textContent = isVideoCall ? 'Video Call' : 'Voice Call';
    
    const initials = randomContact.name.split(' ').map(n => n[0]).join('').toUpperCase();
    elements.incomingCallAvatar.innerHTML = initials;
    elements.incomingCallAvatar.style.backgroundColor = stringToColor(randomContact.name);
    
    if (Math.random() > 0.5) {
        const moods = ['happy', 'neutral', 'sad', 'angry', 'tired'];
        const randomMood = moods[Math.floor(Math.random() * moods.length)];
        elements.incomingCallMood.innerHTML = `<i class="fas fa-smile"></i><span>${randomMood}</span>`;
        elements.incomingCallMood.className = `mood-indicator mood-${randomMood}`;
        elements.incomingCallMood.style.display = 'inline-flex';
    } else {
        elements.incomingCallMood.style.display = 'none';
    }
    
    if (Math.random() > 0.5) {
        const intentions = ['quick', 'important', 'emergency', 'checkin', 'work'];
        const randomIntention = intentions[Math.floor(Math.random() * intentions.length)];
        elements.incomingCallIntention.innerHTML = `<i class="fas fa-bullseye"></i><span>${randomIntention}</span>`;
        elements.incomingCallIntention.className = `intention-indicator intention-${randomIntention}`;
        elements.incomingCallIntention.style.display = 'inline-flex';
    } else {
        elements.incomingCallIntention.style.display = 'none';
    }
    
    let timeLeft = 45;
    elements.declineTimer.textContent = timeLeft;
    
    const countdown = setInterval(() => {
        timeLeft--;
        elements.declineTimer.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(countdown);
            declineIncomingCall();
        }
    }, 1000);
    
    elements.incomingCallModal.dataset.timer = countdown;
    
    elements.incomingCallModal.classList.add('active');
    
    showNotification(`Incoming ${isVideoCall ? 'video' : 'voice'} call from ${randomContact.name}`, 'info');
}

export function declineIncomingCall() {
    if (elements.incomingCallModal.dataset.timer) {
        clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
    }
    
    elements.incomingCallModal.classList.remove('active');
    
    showNotification('Call declined', 'info');
}

export function acceptIncomingCall() {
    acceptIncomingCallGeneric(false);
}

export function acceptIncomingCallAsVideo() {
    acceptIncomingCallGeneric(true);
}

export function acceptIncomingCallGeneric(asVideo) {
    if (elements.incomingCallModal.dataset.timer) {
        clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
    }
    
    const callerName = elements.incomingCallName.textContent;
    const isVideoCall = elements.incomingCallType.textContent.includes('Video');
    const callType = asVideo ? 'video' : (isVideoCall ? 'video' : 'voice');
    
    elements.incomingCallModal.classList.remove('active');
    
    showNotification(`Accepting ${callType} call from ${callerName}...`, 'info');
    
    const simulatedParticipant = {
        id: 'incoming-caller',
        name: callerName
    };
    
    requestMediaPermissions(callType)
        .then(stream => {
            AppState.localStream = stream;
            AppState.callType = callType;
            AppState.callParticipants = [simulatedParticipant];
            
            showCallUI();
            startCallTimer();
            initializeCallFeatures();
            
            showNotification(`${callType} call started`, 'success');
        })
        .catch(error => {
            showNotification(`Failed to start call: ${error.message}`, 'error');
        });
}

// ==================== SETTINGS PANEL ====================
export function toggleSettingsPanel() {
    elements.settingsPanel.classList.toggle('active');
    if (elements.settingsToggleIcon) {
        if (elements.settingsPanel.classList.contains('active')) {
            elements.settingsToggleIcon.className = 'fas fa-times';
        } else {
            elements.settingsToggleIcon.className = 'fas fa-cog';
        }
    }
}