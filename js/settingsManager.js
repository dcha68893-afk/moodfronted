// settingsManager.js
// Centralized settings management for MoodChat
// Handles user preferences with offline persistence and real-time sync across tabs

/**
 * MoodChat Settings Manager
 * 
 * Features:
 * - Centralized user settings management
 * - Offline persistence with localStorage
 * - Real-time sync across tabs using BroadcastChannel
 * - Immediate UI updates on settings changes
 * - Theme and UI preference application
 * - Extensible for future settings and backend sync
 */

class SettingsManager {
    constructor() {
        // Default settings structure - organized by category
        this.defaultSettings = {
            // Account settings
            account: {
                displayName: 'User',
                username: 'user123',
                bio: 'Hello! I\'m using MoodChat',
                profileVisibility: 'friends',
                lastSeen: true,
                onlineStatus: true,
                photoVisibility: 'friends'
            },
            
            // Privacy settings
            privacy: {
                whoCanAddMe: 'friendsOfFriends',
                readReceipts: true,
                typingIndicators: true,
                messageForwarding: true,
                contactDiscovery: true,
                
                // Friend permissions (default for new friends)
                friendPermissions: {
                    canMessage: true,
                    canCall: true,
                    canSeeStatus: true,
                    canSeePhoto: true,
                    canSeeLastSeen: true,
                    canForward: true,
                    canScreenshot: false
                },
                
                // Mood visibility (specific to MoodChat)
                moodVisibility: {
                    showMoodTo: 'friends', // 'everyone', 'friends', 'selected', 'nobody'
                    moodHistory: true,
                    moodAnalytics: true
                }
            },
            
            // Chat settings
            chat: {
                wallpaper: 'default',
                enterKeySends: false,
                mediaDownload: 'wifi', // 'wifi', 'always', 'never'
                saveMedia: false,
                messageHistory: 'forever',
                disappearingMessages: 'off',
                
                // AI features
                aiFeatures: {
                    smartReplies: true,
                    messageTranslation: false,
                    chatSummarization: false,
                    spamDetection: true
                }
            },
            
            // Friends settings
            friends: {
                discoverByPhone: true,
                discoverByEmail: false,
                nearbyDiscovery: false,
                qrCode: true,
                friendSuggestions: true,
                
                // Friendship features
                temporaryFriends: false,
                friendshipNotes: true,
                friendCategories: true,
                trustScore: false,
                friendAnalytics: false
            },
            
            // Groups settings
            groups: {
                autoJoinGroups: false,
                groupInvitations: 'friends',
                groupPrivacy: 'public',
                groupAnnouncements: true,
                groupMediaDownload: false,
                
                // Group moderation
                messageApproval: false,
                keywordFiltering: false,
                groupSpamDetection: true,
                memberWarnings: true
            },
            
            // Calls settings
            calls: {
                whoCanCallMe: 'friends',
                callVerification: false,
                ringtone: 'default',
                callVibration: true,
                autoAnswer: false,
                
                // Video calls
                videoQuality: 'auto',
                cameraDefault: 'front',
                noiseCancellation: true,
                echoCancellation: true,
                
                // Call features
                liveReactions: true,
                inCallChat: true,
                sharedWhiteboard: true,
                sharedNotes: true,
                polls: true
            },
            
            // Notifications settings
            notifications: {
                // Notification types
                messageNotifications: true,
                groupNotifications: true,
                friendRequestNotifications: true,
                callNotifications: true,
                statusNotifications: true,
                moodNotifications: true, // MoodChat specific
                
                // Sound & vibration
                notificationSound: true,
                notificationVibration: true,
                popupNotifications: false,
                notificationLight: false,
                
                // Do Not Disturb
                doNotDisturb: false,
                dndSchedule: 'custom',
                dndAllowCalls: false,
                dndAllowMoodUpdates: true // MoodChat specific
            },
            
            // Appearance settings (Theme)
            appearance: {
                theme: 'light', // 'light', 'dark', 'auto'
                accentColor: '#4F46E5', // MoodChat's primary color
                fontSize: 16,
                reduceMotion: false,
                
                // Language & region
                language: 'en',
                timeFormat: '12h',
                dateFormat: 'mm/dd/yyyy',
                
                // MoodChat specific appearance
                moodColorScheme: 'vibrant', // 'vibrant', 'pastel', 'monochrome'
                moodAnimation: true
            },
            
            // Advanced settings
            advanced: {
                offlineMode: true,
                intranetSupport: false,
                lowBandwidth: false,
                debugMode: false,
                dataSaver: false
            }
        };
        
        // Current settings cache
        this.currentSettings = {};
        
        // Broadcast channel for cross-tab communication
        this.broadcastChannel = null;
        
        // User ID for settings isolation
        this.userId = null;
        
        // Change listeners
        this.changeListeners = new Map();
        
        // Initialization flag
        this.initialized = false;
        
        // Pending changes queue for offline mode
        this.pendingChanges = [];
        
        console.log('SettingsManager: Initialized');
    }
    
    /**
     * Initialize settings manager
     * @param {string} userId - Current user ID
     * @returns {Promise} - Promise that resolves when initialization is complete
     */
    async initialize(userId = 'default') {
        this.userId = userId;
        
        try {
            // Load settings from localStorage
            await this.loadSettings();
            
            // Setup broadcast channel for real-time sync
            this.setupBroadcastChannel();
            
            // Apply settings to current page
            this.applySettings(this.currentSettings);
            
            // Setup storage event listener for cross-tab communication
            this.setupStorageListener();
            
            this.initialized = true;
            console.log('SettingsManager: Initialized successfully for user', userId);
            
            // Trigger initialization event
            this.triggerChange('initialized', this.currentSettings);
            
        } catch (error) {
            console.error('SettingsManager: Initialization failed:', error);
            // Fallback to defaults
            this.currentSettings = this.cloneDeep(this.defaultSettings);
            this.applySettings(this.currentSettings);
        }
    }
    
    /**
     * Load settings from localStorage or use defaults
     */
    async loadSettings() {
        const storageKey = `moodchat_settings_${this.userId}`;
        
        try {
            const savedSettings = localStorage.getItem(storageKey);
            
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                
                // Deep merge with defaults to ensure new settings are added
                this.currentSettings = this.mergeDeep(
                    this.cloneDeep(this.defaultSettings),
                    parsedSettings
                );
                
                console.log('SettingsManager: Loaded settings from localStorage');
            } else {
                // Use defaults if no saved settings
                this.currentSettings = this.cloneDeep(this.defaultSettings);
                console.log('SettingsManager: Using default settings');
            }
            
            // Save back to localStorage to ensure any new defaults are persisted
            this.saveToLocalStorage();
            
        } catch (error) {
            console.error('SettingsManager: Error loading settings:', error);
            this.currentSettings = this.cloneDeep(this.defaultSettings);
        }
    }
    
    /**
     * Save a setting value
     * @param {string} key - Setting key (e.g., 'appearance.theme')
     * @param {any} value - Setting value
     * @param {boolean} immediate - Whether to update UI immediately
     */
    saveSetting(key, value, immediate = true) {
        if (!this.initialized) {
            console.warn('SettingsManager: Not initialized yet');
            return;
        }
        
        // Update settings object
        this.setNestedValue(this.currentSettings, key, value);
        
        // Save to localStorage
        this.saveToLocalStorage();
        
        // Broadcast change to other tabs
        this.broadcastChange({ key, value });
        
        // Update UI immediately if requested
        if (immediate) {
            this.applySetting(key, value);
        }
        
        // Trigger change listeners
        this.triggerChange(key, value);
        
        // Queue for backend sync (if implemented later)
        this.queueBackendSync(key, value);
        
        console.log('SettingsManager: Saved setting', key, value);
    }
    
    /**
     * Get a setting value
     * @param {string} key - Setting key (e.g., 'appearance.theme')
     * @returns {any} - Setting value or undefined if not found
     */
    getSetting(key) {
        return this.getNestedValue(this.currentSettings, key);
    }
    
    /**
     * Get all settings
     * @returns {object} - Complete settings object
     */
    getAllSettings() {
        return this.cloneDeep(this.currentSettings);
    }
    
    /**
     * Apply all settings to the current page
     * @param {object} settings - Settings object to apply
     */
    applySettings(settings) {
        if (!settings) return;
        
        // Apply appearance settings first (they affect the whole page)
        if (settings.appearance) {
            this.applyAppearanceSettings(settings.appearance);
        }
        
        // Apply notification settings
        if (settings.notifications) {
            this.applyNotificationSettings(settings.notifications);
        }
        
        // Apply privacy settings
        if (settings.privacy) {
            this.applyPrivacySettings(settings.privacy);
        }
        
        // Trigger settings applied event
        this.triggerChange('settingsApplied', settings);
        
        console.log('SettingsManager: Applied all settings');
    }
    
    /**
     * Apply a single setting to the UI
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     */
    applySetting(key, value) {
        // Apply based on setting category
        if (key.startsWith('appearance.')) {
            const settingKey = key.replace('appearance.', '');
            this.applyAppearanceSetting(settingKey, value);
        } else if (key.startsWith('notifications.')) {
            const settingKey = key.replace('notifications.', '');
            this.applyNotificationSetting(settingKey, value);
        } else if (key.startsWith('privacy.')) {
            const settingKey = key.replace('privacy.', '');
            this.applyPrivacySetting(settingKey, value);
        }
        
        // Trigger specific setting applied event
        this.triggerChange(`settingApplied:${key}`, value);
    }
    
    /**
     * Apply appearance settings
     * @param {object} appearance - Appearance settings object
     */
    applyAppearanceSettings(appearance) {
        if (!appearance) return;
        
        // Apply theme
        if (appearance.theme) {
            this.applyTheme(appearance.theme);
        }
        
        // Apply accent color
        if (appearance.accentColor) {
            this.applyAccentColor(appearance.accentColor);
        }
        
        // Apply font size
        if (appearance.fontSize) {
            this.applyFontSize(appearance.fontSize);
        }
        
        // Apply language
        if (appearance.language) {
            this.applyLanguage(appearance.language);
        }
        
        // Apply motion preference
        if (appearance.reduceMotion !== undefined) {
            this.applyReduceMotion(appearance.reduceMotion);
        }
        
        // MoodChat specific appearance
        if (appearance.moodColorScheme) {
            this.applyMoodColorScheme(appearance.moodColorScheme);
        }
        
        if (appearance.moodAnimation !== undefined) {
            this.applyMoodAnimation(appearance.moodAnimation);
        }
    }
    
    /**
     * Apply a single appearance setting
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     */
    applyAppearanceSetting(key, value) {
        switch (key) {
            case 'theme':
                this.applyTheme(value);
                break;
            case 'accentColor':
                this.applyAccentColor(value);
                break;
            case 'fontSize':
                this.applyFontSize(value);
                break;
            case 'language':
                this.applyLanguage(value);
                break;
            case 'reduceMotion':
                this.applyReduceMotion(value);
                break;
            case 'moodColorScheme':
                this.applyMoodColorScheme(value);
                break;
            case 'moodAnimation':
                this.applyMoodAnimation(value);
                break;
        }
    }
    
    /**
     * Apply theme to the page
     * @param {string} theme - Theme name ('light', 'dark', 'auto')
     */
    applyTheme(theme) {
        const html = document.documentElement;
        
        // Remove existing theme classes
        html.classList.remove('theme-light', 'theme-dark', 'theme-auto');
        
        // Add new theme class
        html.classList.add(`theme-${theme}`);
        
        // Set data attribute for CSS
        html.setAttribute('data-theme', theme);
        
        // Update CSS variables
        if (theme === 'dark') {
            this.setCssVariable('--bg-color', '#1a1a1a');
            this.setCssVariable('--text-primary', '#ffffff');
            this.setCssVariable('--text-secondary', '#b0b3b8');
            this.setCssVariable('--card-bg', '#242526');
            this.setCssVariable('--border-color', '#3e4042');
        } else {
            this.setCssVariable('--bg-color', '#ffffff');
            this.setCssVariable('--text-primary', '#050505');
            this.setCssVariable('--text-secondary', '#65676b');
            this.setCssVariable('--card-bg', '#ffffff');
            this.setCssVariable('--border-color', '#dddfe2');
        }
    }
    
    /**
     * Apply accent color to the page
     * @param {string} color - Hex color code
     */
    applyAccentColor(color) {
        this.setCssVariable('--primary-color', color);
        
        // Calculate darker shade for hover states
        const darkerColor = this.shadeColor(color, -20);
        this.setCssVariable('--primary-dark', darkerColor);
        
        // Store in localStorage for persistence across page reloads
        localStorage.setItem('moodchat_accent_color', color);
    }
    
    /**
     * Apply font size to the page
     * @param {number} size - Font size in pixels
     */
    applyFontSize(size) {
        this.setCssVariable('--base-font-size', `${size}px`);
        document.documentElement.style.fontSize = `${size}px`;
    }
    
    /**
     * Apply language to the page
     * @param {string} language - Language code
     */
    applyLanguage(language) {
        document.documentElement.lang = language;
        // This would typically trigger a page reload or dynamic translation
        console.log('SettingsManager: Language changed to', language);
    }
    
    /**
     * Apply reduced motion preference
     * @param {boolean} reduceMotion - Whether to reduce motion
     */
    applyReduceMotion(reduceMotion) {
        const html = document.documentElement;
        
        if (reduceMotion) {
            html.classList.add('reduce-motion');
        } else {
            html.classList.remove('reduce-motion');
        }
    }
    
    /**
     * Apply MoodChat-specific color scheme for mood display
     * @param {string} scheme - Color scheme name
     */
    applyMoodColorScheme(scheme) {
        const html = document.documentElement;
        
        // Remove existing scheme classes
        html.classList.remove('mood-scheme-vibrant', 'mood-scheme-pastel', 'mood-scheme-monochrome');
        
        // Add new scheme class
        html.classList.add(`mood-scheme-${scheme}`);
        
        // Set CSS variables based on scheme
        switch (scheme) {
            case 'vibrant':
                this.setCssVariable('--mood-happy', '#FFD700');
                this.setCssVariable('--mood-sad', '#4169E1');
                this.setCssVariable('--mood-excited', '#FF4500');
                this.setCssVariable('--mood-calm', '#32CD32');
                break;
            case 'pastel':
                this.setCssVariable('--mood-happy', '#FFFACD');
                this.setCssVariable('--mood-sad', '#ADD8E6');
                this.setCssVariable('--mood-excited', '#FFB6C1');
                this.setCssVariable('--mood-calm', '#98FB98');
                break;
            case 'monochrome':
                this.setCssVariable('--mood-happy', '#808080');
                this.setCssVariable('--mood-sad', '#606060');
                this.setCssVariable('--mood-excited', '#404040');
                this.setCssVariable('--mood-calm', '#A0A0A0');
                break;
        }
    }
    
    /**
     * Apply mood animation preference
     * @param {boolean} enabled - Whether mood animations are enabled
     */
    applyMoodAnimation(enabled) {
        if (enabled) {
            document.documentElement.classList.add('mood-animation-enabled');
        } else {
            document.documentElement.classList.remove('mood-animation-enabled');
        }
    }
    
    /**
     * Apply notification settings
     * @param {object} notifications - Notification settings object
     */
    applyNotificationSettings(notifications) {
        // This would typically interact with the Notification API
        // For now, we'll just update data attributes for CSS to use
        Object.keys(notifications).forEach(key => {
            if (typeof notifications[key] === 'boolean') {
                this.applyNotificationSetting(key, notifications[key]);
            }
        });
    }
    
    /**
     * Apply a single notification setting
     * @param {string} key - Setting key
     * @param {boolean} value - Setting value
     */
    applyNotificationSetting(key, value) {
        // Update data attribute for CSS
        document.documentElement.setAttribute(`data-notification-${key}`, value.toString());
        
        // Handle specific notification types
        switch (key) {
            case 'doNotDisturb':
                if (value) {
                    document.documentElement.classList.add('do-not-disturb');
                } else {
                    document.documentElement.classList.remove('do-not-disturb');
                }
                break;
            case 'notificationSound':
                // Would interact with Web Audio API in a real implementation
                console.log('SettingsManager: Notification sound', value ? 'enabled' : 'disabled');
                break;
        }
    }
    
    /**
     * Apply privacy settings
     * @param {object} privacy - Privacy settings object
     */
    applyPrivacySettings(privacy) {
        // Update data attributes for CSS/JS to use
        Object.keys(privacy).forEach(key => {
            if (typeof privacy[key] === 'boolean' || typeof privacy[key] === 'string') {
                this.applyPrivacySetting(key, privacy[key]);
            }
        });
    }
    
    /**
     * Apply a single privacy setting
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     */
    applyPrivacySetting(key, value) {
        document.documentElement.setAttribute(`data-privacy-${key}`, value.toString());
        
        // Handle specific privacy settings
        switch (key) {
            case 'whoCanAddMe':
                // Update UI elements that show friend request permissions
                this.updateFriendRequestUI(value);
                break;
            case 'moodVisibility':
                // Update mood visibility UI
                this.updateMoodVisibilityUI(value);
                break;
        }
    }
    
    /**
     * Reset settings to defaults
     */
    resetToDefaults() {
        this.currentSettings = this.cloneDeep(this.defaultSettings);
        this.saveToLocalStorage();
        this.applySettings(this.currentSettings);
        
        // Broadcast reset
        this.broadcastChange({ type: 'reset' });
        
        console.log('SettingsManager: Reset to defaults');
    }
    
    /**
     * Export settings as JSON
     * @returns {string} - JSON string of settings
     */
    exportSettings() {
        return JSON.stringify(this.currentSettings, null, 2);
    }
    
    /**
     * Import settings from JSON
     * @param {string} json - JSON string of settings
     * @returns {boolean} - Whether import was successful
     */
    importSettings(json) {
        try {
            const importedSettings = JSON.parse(json);
            
            // Deep merge with defaults
            this.currentSettings = this.mergeDeep(
                this.cloneDeep(this.defaultSettings),
                importedSettings
            );
            
            this.saveToLocalStorage();
            this.applySettings(this.currentSettings);
            
            // Broadcast import
            this.broadcastChange({ type: 'import' });
            
            console.log('SettingsManager: Settings imported successfully');
            return true;
            
        } catch (error) {
            console.error('SettingsManager: Error importing settings:', error);
            return false;
        }
    }
    
    /**
     * Add a change listener
     * @param {string} key - Setting key to listen for (or 'all' for all changes)
     * @param {Function} callback - Callback function
     */
    addChangeListener(key, callback) {
        if (!this.changeListeners.has(key)) {
            this.changeListeners.set(key, []);
        }
        this.changeListeners.get(key).push(callback);
    }
    
    /**
     * Remove a change listener
     * @param {string} key - Setting key
     * @param {Function} callback - Callback function to remove
     */
    removeChangeListener(key, callback) {
        if (this.changeListeners.has(key)) {
            const listeners = this.changeListeners.get(key);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    /**
     * Trigger change listeners
     * @param {string} key - Setting key that changed
     * @param {any} value - New value
     */
    triggerChange(key, value) {
        // Trigger specific key listeners
        if (this.changeListeners.has(key)) {
            this.changeListeners.get(key).forEach(callback => {
                try {
                    callback(value, key);
                } catch (error) {
                    console.error('SettingsManager: Error in change listener:', error);
                }
            });
        }
        
        // Trigger 'all' listeners
        if (this.changeListeners.has('all')) {
            this.changeListeners.get('all').forEach(callback => {
                try {
                    callback(value, key);
                } catch (error) {
                    console.error('SettingsManager: Error in change listener:', error);
                }
            });
        }
    }
    
    /**
     * Setup broadcast channel for cross-tab communication
     */
    setupBroadcastChannel() {
        if (typeof BroadcastChannel === 'undefined') {
            console.warn('SettingsManager: BroadcastChannel not supported, falling back to storage events');
            return;
        }
        
        try {
            this.broadcastChannel = new BroadcastChannel('moodchat_settings');
            
            this.broadcastChannel.onmessage = (event) => {
                const { type, data } = event.data;
                
                if (type === 'settingsChange') {
                    const { key, value } = data;
                    
                    // Update local settings
                    this.setNestedValue(this.currentSettings, key, value);
                    
                    // Apply to UI
                    this.applySetting(key, value);
                    
                    // Trigger change listeners
                    this.triggerChange(key, value);
                    
                    console.log('SettingsManager: Received broadcast update for', key);
                } else if (type === 'reset') {
                    this.resetToDefaults();
                }
            };
            
            console.log('SettingsManager: BroadcastChannel setup complete');
            
        } catch (error) {
            console.error('SettingsManager: Error setting up BroadcastChannel:', error);
        }
    }
    
    /**
     * Broadcast a settings change to other tabs
     * @param {object} data - Change data
     */
    broadcastChange(data) {
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({
                    type: 'settingsChange',
                    data: data,
                    timestamp: Date.now(),
                    userId: this.userId
                });
            } catch (error) {
                console.error('SettingsManager: Error broadcasting change:', error);
            }
        }
    }
    
    /**
     * Setup storage event listener for cross-tab communication (fallback)
     */
    setupStorageListener() {
        window.addEventListener('storage', (event) => {
            if (event.key === `moodchat_settings_${this.userId}` && event.newValue) {
                try {
                    const newSettings = JSON.parse(event.newValue);
                    
                    // Find what changed
                    const changes = this.findChanges(this.currentSettings, newSettings);
                    
                    // Apply each change
                    changes.forEach(({ key, value }) => {
                        this.setNestedValue(this.currentSettings, key, value);
                        this.applySetting(key, value);
                        this.triggerChange(key, value);
                    });
                    
                    console.log('SettingsManager: Received storage update with', changes.length, 'changes');
                    
                } catch (error) {
                    console.error('SettingsManager: Error processing storage event:', error);
                }
            }
        });
    }
    
    /**
     * Save settings to localStorage
     */
    saveToLocalStorage() {
        const storageKey = `moodchat_settings_${this.userId}`;
        
        try {
            localStorage.setItem(storageKey, JSON.stringify(this.currentSettings));
            
            // Also set a timestamp for change detection
            localStorage.setItem(`${storageKey}_updated`, Date.now().toString());
            
        } catch (error) {
            console.error('SettingsManager: Error saving to localStorage:', error);
            
            // If localStorage is full, try to clear old data
            if (error.name === 'QuotaExceededError') {
                this.handleStorageFull();
            }
        }
    }
    
    /**
     * Handle localStorage full error
     */
    handleStorageFull() {
        console.warn('SettingsManager: localStorage full, attempting cleanup');
        
        try {
            // Clear old moodchat data (keep last 7 days)
            const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                
                if (key.startsWith('moodchat_')) {
                    const timestamp = localStorage.getItem(`${key}_updated`);
                    
                    if (timestamp && parseInt(timestamp) < weekAgo) {
                        localStorage.removeItem(key);
                        localStorage.removeItem(`${key}_updated`);
                    }
                }
            }
            
            // Try saving again
            this.saveToLocalStorage();
            
        } catch (error) {
            console.error('SettingsManager: Could not free up localStorage:', error);
        }
    }
    
    /**
     * Queue settings for backend sync (placeholder for future implementation)
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     */
    queueBackendSync(key, value) {
        // This is a placeholder for future Firebase/backend sync implementation
        this.pendingChanges.push({
            key,
            value,
            timestamp: Date.now(),
            synced: false
        });
        
        // In a real implementation, you would:
        // 1. Check if online
        // 2. Send to Firebase/Firestore
        // 3. Handle retries and offline queue
        // 4. Clear from pendingChanges when synced
        
        console.log('SettingsManager: Queued for backend sync:', key);
    }
    
    /**
     * Sync pending changes to backend (placeholder)
     */
    async syncToBackend() {
        if (this.pendingChanges.length === 0) return;
        
        console.log('SettingsManager: Syncing', this.pendingChanges.length, 'changes to backend');
        
        // Placeholder for Firebase/Firestore implementation
        // try {
        //   await firebase.firestore().collection('userSettings').doc(this.userId).set({
        //     ...this.currentSettings,
        //     lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        //   }, { merge: true });
        //   
        //   // Mark pending changes as synced
        //   this.pendingChanges = this.pendingChanges.map(change => ({
        //     ...change,
        //     synced: true
        //   }));
        //   
        // } catch (error) {
        //   console.error('SettingsManager: Backend sync failed:', error);
        // }
    }
    
    // Utility functions
    
    /**
     * Set a nested value in an object
     * @param {object} obj - Object to modify
     * @param {string} path - Dot notation path
     * @param {any} value - Value to set
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
    }
    
    /**
     * Get a nested value from an object
     * @param {object} obj - Object to query
     * @param {string} path - Dot notation path
     * @returns {any} - Value or undefined
     */
    getNestedValue(obj, path) {
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined || typeof current !== 'object') {
                return undefined;
            }
            current = current[key];
        }
        
        return current;
    }
    
    /**
     * Deep clone an object
     * @param {object} obj - Object to clone
     * @returns {object} - Cloned object
     */
    cloneDeep(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    /**
     * Deep merge two objects
     * @param {object} target - Target object
     * @param {object} source - Source object
     * @returns {object} - Merged object
     */
    mergeDeep(target, source) {
        const output = Object.assign({}, target);
        
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.mergeDeep(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        
        return output;
    }
    
    /**
     * Check if value is an object
     * @param {any} item - Value to check
     * @returns {boolean} - Whether value is an object
     */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    
    /**
     * Find differences between two objects
     * @param {object} oldObj - Old object
     * @param {object} newObj - New object
     * @returns {Array} - Array of changes
     */
    findChanges(oldObj, newObj) {
        const changes = [];
        
        const find = (obj1, obj2, path = '') => {
            const allKeys = new Set([
                ...Object.keys(obj1 || {}),
                ...Object.keys(obj2 || {})
            ]);
            
            allKeys.forEach(key => {
                const currentPath = path ? `${path}.${key}` : key;
                
                if (this.isObject(obj1?.[key]) && this.isObject(obj2?.[key])) {
                    find(obj1[key], obj2[key], currentPath);
                } else if (obj1?.[key] !== obj2?.[key]) {
                    changes.push({
                        key: currentPath,
                        oldValue: obj1?.[key],
                        value: obj2?.[key]
                    });
                }
            });
        };
        
        find(oldObj, newObj);
        return changes;
    }
    
    /**
     * Set a CSS variable
     * @param {string} name - Variable name
     * @param {string} value - Variable value
     */
    setCssVariable(name, value) {
        document.documentElement.style.setProperty(name, value);
    }
    
    /**
     * Shade a color by percentage
     * @param {string} color - Hex color
     * @param {number} percent - Percentage to shade (-100 to 100)
     * @returns {string} - Shaded hex color
     */
    shadeColor(color, percent) {
        let R = parseInt(color.substring(1, 3), 16);
        let G = parseInt(color.substring(3, 5), 16);
        let B = parseInt(color.substring(5, 7), 16);
        
        R = parseInt(R * (100 + percent) / 100);
        G = parseInt(G * (100 + percent) / 100);
        B = parseInt(B * (100 + percent) / 100);
        
        R = Math.min(255, Math.max(0, R));
        G = Math.min(255, Math.max(0, G));
        B = Math.min(255, Math.max(0, B));
        
        const RR = R.toString(16).padStart(2, '0');
        const GG = G.toString(16).padStart(2, '0');
        const BB = B.toString(16).padStart(2, '0');
        
        return `#${RR}${GG}${BB}`;
    }
    
    // UI update helpers (would be implemented based on actual UI)
    
    /**
     * Update friend request UI based on privacy setting
     * @param {string} permission - Permission level
     */
    updateFriendRequestUI(permission) {
        // Implementation depends on actual UI
        // This would update elements that show who can send friend requests
        console.log('SettingsManager: Updated friend request UI for permission:', permission);
    }
    
    /**
     * Update mood visibility UI
     * @param {string} visibility - Visibility setting
     */
    updateMoodVisibilityUI(visibility) {
        // Implementation depends on actual UI
        // This would update elements that control mood visibility
        console.log('SettingsManager: Updated mood visibility UI:', visibility);
    }
    
    /**
     * Check if a feature is enabled based on settings
     * @param {string} feature - Feature name
     * @returns {boolean} - Whether feature is enabled
     */
    isFeatureEnabled(feature) {
        // Map features to setting paths
        const featureMap = {
            'moodSharing': 'privacy.moodVisibility.showMoodTo',
            'moodHistory': 'privacy.moodVisibility.moodHistory',
            'smartReplies': 'chat.aiFeatures.smartReplies',
            'liveReactions': 'calls.liveReactions',
            'sharedWhiteboard': 'calls.sharedWhiteboard'
        };
        
        const settingPath = featureMap[feature];
        if (!settingPath) return false;
        
        const value = this.getSetting(settingPath);
        return value !== false && value !== 'nobody' && value !== 'off';
    }
    
    /**
     * Get current theme for immediate use
     * @returns {string} - Current theme
     */
    getCurrentTheme() {
        return this.getSetting('appearance.theme') || 'light';
    }
    
    /**
     * Get current accent color for immediate use
     * @returns {string} - Current accent color
     */
    getCurrentAccentColor() {
        return this.getSetting('appearance.accentColor') || '#4F46E5';
    }
}

// Create singleton instance
const settingsManager = new SettingsManager();

// Export for use in modules
export { settingsManager, SettingsManager };

// Auto-initialize if script is loaded in browser
if (typeof window !== 'undefined') {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Try to get user ID from localStorage or default
            const userId = localStorage.getItem('moodchat_user_id') || 'default';
            settingsManager.initialize(userId).catch(console.error);
        });
    } else {
        const userId = localStorage.getItem('moodchat_user_id') || 'default';
        settingsManager.initialize(userId).catch(console.error);
    }
}

// Usage examples:
/*
// 1. Initialize
await settingsManager.initialize('user123');

// 2. Get a setting
const theme = settingsManager.getSetting('appearance.theme');

// 3. Save a setting
settingsManager.saveSetting('appearance.theme', 'dark');

// 4. Listen for changes
settingsManager.addChangeListener('appearance.theme', (newTheme) => {
    console.log('Theme changed to:', newTheme);
});

// 5. Check if feature is enabled
if (settingsManager.isFeatureEnabled('moodSharing')) {
    // Show mood sharing UI
}

// 6. Export/Import
const json = settingsManager.exportSettings();
settingsManager.importSettings(json);

// 7. Reset to defaults
settingsManager.resetToDefaults();
*/

console.log('SettingsManager: Module loaded successfully');