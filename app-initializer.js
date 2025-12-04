// app-initializer.js
class AppInitializer {
    constructor() {
        this.isInitialized = false;
        this.components = new Map();
        this.loadingStates = new Map();
        
        // NEW: Initialize UserData before app loads
        this.initializeUserData();
        
        this.init();
    }

    // NEW: Initialize UserData method
    initializeUserData() {
        console.log('👤 Initializing UserData before app loads');
        
        // Check if UserData exists, create if not
        if (!window.UserData) {
            window.UserData = {
                theme: 'light',
                colors: {
                    primary: '#007bff',
                    secondary: '#6c757d',
                    accent: '#28a745'
                },
                preferences: {},
                selectionCompleted: false,
                // Add other user properties as needed
            };
            
            // Try to load from localStorage
            try {
                const savedUserData = localStorage.getItem('kynecta-user-data');
                if (savedUserData) {
                    const parsedData = JSON.parse(savedUserData);
                    Object.assign(window.UserData, parsedData);
                    console.log('📁 UserData loaded from localStorage');
                }
            } catch (error) {
                console.warn('⚠️ Could not load UserData from localStorage:', error);
            }
        }
        
        // NEW: Apply theme colors from UserData
        this.applyThemeColors();
        
        // NEW: Check selection completion state
        this.checkSelectionCompletion();
    }

    // NEW: Apply theme colors method
    applyThemeColors() {
        if (!window.UserData || !window.UserData.colors) {
            return;
        }
        
        console.log('🎨 Applying theme colors from UserData');
        
        // Create CSS variables from UserData colors
        const style = document.createElement('style');
        style.id = 'user-theme-colors';
        
        const colors = window.UserData.colors;
        let cssVariables = ':root {\n';
        
        Object.entries(colors).forEach(([key, value]) => {
            cssVariables += `  --color-${key}: ${value};\n`;
            
            // Also create RGB versions for opacity support
            if (value.startsWith('#')) {
                const r = parseInt(value.slice(1, 3), 16);
                const g = parseInt(value.slice(3, 5), 16);
                const b = parseInt(value.slice(5, 7), 16);
                cssVariables += `  --color-${key}-rgb: ${r}, ${g}, ${b};\n`;
            }
        });
        
        cssVariables += '}';
        style.textContent = cssVariables;
        
        // Remove existing theme if present
        const existingTheme = document.getElementById('user-theme-colors');
        if (existingTheme) {
            existingTheme.remove();
        }
        
        document.head.appendChild(style);
        
        // Apply theme class to document
        const theme = window.UserData.theme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.add(`theme-${theme}`);
        
        console.log(`✅ Applied ${theme} theme with custom colors`);
    }

    // NEW: Check selection completion method
    checkSelectionCompletion() {
        if (!window.UserData) {
            return;
        }
        
        const isSelectionComplete = window.UserData.selectionCompleted === true;
        
        // Add completion state to body for CSS targeting
        document.body.classList.toggle('selection-complete', isSelectionComplete);
        document.body.classList.toggle('selection-incomplete', !isSelectionComplete);
        
        // Dispatch event for other components
        document.dispatchEvent(new CustomEvent('selection:statechange', {
            detail: { completed: isSelectionComplete }
        }));
        
        console.log(`📋 Selection completion state: ${isSelectionComplete ? 'Complete ✓' : 'Incomplete ⏳'}`);
        
        // If selection is incomplete, show guidance
        if (!isSelectionComplete) {
            this.showSelectionGuidance();
        }
    }

    // NEW: Show selection guidance method
    showSelectionGuidance() {
        // Check if guidance element already exists
        if (document.querySelector('.selection-guidance')) {
            return;
        }
        
        // Create guidance overlay
        const guidanceOverlay = document.createElement('div');
        guidanceOverlay.className = 'selection-guidance';
        guidanceOverlay.innerHTML = `
            <div class="guidance-content">
                <h3>Welcome to Kynecta Chat! 🎯</h3>
                <p>Complete your setup to get started:</p>
                <ol>
                    <li>Select your preferred theme</li>
                    <li>Choose your contact preferences</li>
                    <li>Set up notification settings</li>
                </ol>
                <button class="start-setup-btn">Start Setup</button>
                <button class="skip-setup-btn">Skip for Now</button>
            </div>
        `;
        
        document.body.appendChild(guidanceOverlay);
        
        // Add event listeners
        guidanceOverlay.querySelector('.start-setup-btn').addEventListener('click', () => {
            this.startSetupFlow();
        });
        
        guidanceOverlay.querySelector('.skip-setup-btn').addEventListener('click', () => {
            guidanceOverlay.remove();
            document.body.classList.add('setup-skipped');
        });
    }

    // NEW: Start setup flow method
    startSetupFlow() {
        console.log('🚀 Starting setup flow');
        
        // Remove guidance overlay
        const guidanceOverlay = document.querySelector('.selection-guidance');
        if (guidanceOverlay) {
            guidanceOverlay.remove();
        }
        
        // Dispatch event to trigger setup UI
        document.dispatchEvent(new CustomEvent('setup:start'));
        
        // In a real app, this would open a setup wizard
        // For now, we'll simulate completion after 2 seconds
        setTimeout(() => {
            this.completeSetup();
        }, 2000);
    }

    // NEW: Complete setup method
    completeSetup() {
        window.UserData.selectionCompleted = true;
        window.UserData.setupCompletedAt = new Date().toISOString();
        
        // Save to localStorage
        try {
            localStorage.setItem('kynecta-user-data', JSON.stringify(window.UserData));
        } catch (error) {
            console.warn('⚠️ Could not save UserData to localStorage:', error);
        }
        
        // Update UI
        this.checkSelectionCompletion();
        
        // Show completion message
        this.showCompletionMessage();
    }

    // NEW: Show completion message method
    showCompletionMessage() {
        const message = document.createElement('div');
        message.className = 'setup-complete-message';
        message.innerHTML = `
            <div class="message-content">
                <span class="checkmark">✓</span>
                <span>Setup completed successfully!</span>
            </div>
        `;
        
        document.body.appendChild(message);
        
        // Remove message after 3 seconds
        setTimeout(() => {
            message.classList.add('fade-out');
            setTimeout(() => message.remove(), 500);
        }, 3000);
    }

    init() {
        this.setupLoadingStates();
        this.setupDOMReady();
        this.setupErrorHandling();
    }

    setupLoadingStates() {
        // Define loading states for all components
        this.loadingStates.set('core', false);
        this.loadingStates.set('ui', false);
        this.loadingStates.set('users', false);
        this.loadingStates.set('messaging', false);
        this.loadingStates.set('calls', false);
        this.loadingStates.set('settings', false);
    }

    setupDOMReady() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.onDOMReady());
        } else {
            this.onDOMReady();
        }
    }

    onDOMReady() {
        console.log('🏗️ DOM Ready - Initializing app structure');
        this.createAppContainer();
        this.setupComponentBoundaries();
        this.preventExternalRendering();
    }

    createAppContainer() {
        // Ensure app container exists
        if (!document.querySelector('.app-container')) {
            const appContainer = document.createElement('div');
            appContainer.className = 'app-container';
            
            // Move existing body content into app container
            while (document.body.firstChild) {
                appContainer.appendChild(document.body.firstChild);
            }
            
            document.body.appendChild(appContainer);
        }

        // Create loading overlay if it doesn't exist
        if (!document.querySelector('.loading-overlay')) {
            const loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">Initializing Kynecta Chat...</div>
            `;
            document.querySelector('.app-container').prepend(loadingOverlay);
        }
    }

    setupComponentBoundaries() {
        // Create main components container
        const componentsContainer = document.createElement('div');
        componentsContainer.className = 'components-container';
        componentsContainer.id = 'main-components-container';
        
        // Move relevant components into the container
        const componentsToMove = [
            '.status-stories-container',
            '.contacts-container', 
            '.chat-messages-container',
            '.user-profile-container',
            '.sidebar',
            '.chat-area'
        ];

        componentsToMove.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                componentsContainer.appendChild(element);
            }
        });

        document.querySelector('.app-container').appendChild(componentsContainer);
    }

    preventExternalRendering() {
        // Override problematic rendering functions
        this.overrideRenderingMethods();
        this.setupComponentWatcher();
    }

    overrideRenderingMethods() {
        // Store original methods
        const originalAppendChild = Element.prototype.appendChild;
        const originalInsertBefore = Element.prototype.insertBefore;
        const originalInnerHTMLSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set;

        // Override appendChild
        Element.prototype.appendChild = function(child) {
            if (this.shouldRestrictChild(child)) {
                console.warn('🚫 Component rendering restricted:', child);
                return this.getFallbackContainer().appendChild(child);
            }
            return originalAppendChild.call(this, child);
        };

        // Override insertBefore
        Element.prototype.insertBefore = function(newNode, referenceNode) {
            if (this.shouldRestrictChild(newNode)) {
                console.warn('🚫 Component rendering restricted:', newNode);
                return this.getFallbackContainer().insertBefore(newNode, referenceNode);
            }
            return originalInsertBefore.call(this, newNode, referenceNode);
        };

        // Override innerHTML setter
        Object.defineProperty(Element.prototype, 'innerHTML', {
            set: function(value) {
                if (this.shouldRestrictHTML(value)) {
                    console.warn('🚫 HTML setting restricted for element:', this);
                    value = this.sanitizeHTML(value);
                }
                originalInnerHTMLSetter.call(this, value);
            },
            get: Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').get
        });
    }

    setupComponentWatcher() {
        // Watch for dynamically created elements
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        this.validateNodePosition(node);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    validateNodePosition(node) {
        const restrictedSelectors = [
            '[data-chat-component]',
            '[data-status-component]',
            '[data-user-component]',
            '.chat-',
            '.status-',
            '.user-',
            '.message-'
        ];

        const isRestricted = restrictedSelectors.some(selector => 
            node.matches?.(selector) || 
            node.querySelector?.(selector) ||
            node.className?.includes?.(selector.replace('.', '')) ||
            node.id?.includes?.(selector.replace('#', ''))
        );

        if (isRestricted && !this.isInValidContainer(node)) {
            console.warn('🚫 Moving restricted component to valid container:', node);
            this.moveToValidContainer(node);
        }
    }

    isInValidContainer(node) {
        const validContainers = [
            '#main-components-container',
            '.components-container',
            '.chat-area',
            '.sidebar-area',
            '.app-container'
        ];

        return validContainers.some(container => 
            node.closest?.(container) || 
            document.querySelector(container)?.contains?.(node)
        );
    }

    moveToValidContainer(node) {
        const componentsContainer = document.querySelector('#main-components-container') || 
                                  document.querySelector('.components-container') ||
                                  document.querySelector('.app-container');
        
        if (componentsContainer && node.parentNode !== componentsContainer) {
            componentsContainer.appendChild(node);
        }
    }

    // Component registration system
    registerComponent(name, component) {
        this.components.set(name, component);
        this.setComponentReady(name);
    }

    setComponentReady(name) {
        this.loadingStates.set(name, true);
        this.checkAllComponentsReady();
    }

    checkAllComponentsReady() {
        const allReady = Array.from(this.loadingStates.values()).every(state => state);
        
        if (allReady && !this.isInitialized) {
            this.finalizeInitialization();
        }
    }

    finalizeInitialization() {
        console.log('🎉 All components ready - Finalizing app initialization');
        this.isInitialized = true;

        // Show main components
        const componentsContainer = document.querySelector('.components-container');
        if (componentsContainer) {
            componentsContainer.classList.add('loaded');
        }

        // Hide loading overlay
        const loadingOverlay = document.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
            setTimeout(() => {
                loadingOverlay.remove();
            }, 300);
        }

        // Mark all components as initialized
        document.querySelectorAll('[data-component]').forEach(component => {
            component.setAttribute('data-initialized', 'true');
        });

        // Dispatch custom event
        document.dispatchEvent(new CustomEvent('app:initialized'));
    }

    setupErrorHandling() {
        window.addEventListener('error', (event) => {
            console.error('🚨 Global error:', event.error);
            this.handleError(event.error);
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('🚨 Unhandled promise rejection:', event.reason);
            this.handleError(event.reason);
        });
    }

    handleError(error) {
        // Implement error recovery logic
        console.error('Error handled by AppInitializer:', error);
    }
}

// Font Awesome fallback handler
class FontAwesomeFallback {
    constructor() {
        this.loadFontAwesome();
    }

    async loadFontAwesome() {
        try {
            // Try to load from CDN first
            await this.loadFromCDN();
        } catch (error) {
            console.warn('📦 Font Awesome CDN blocked, using fallback icons');
            this.activateFallbacks();
        }
    }

    loadFromCDN() {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
            
            // Timeout fallback
            setTimeout(() => {
                if (!link.sheet) {
                    reject(new Error('Font Awesome load timeout'));
                }
            }, 5000);
        });
    }

    activateFallbacks() {
        // Add fallback CSS class
        document.documentElement.classList.add('fa-fallback');
        
        // Replace Font Awesome icons with fallbacks
        document.querySelectorAll('.fas, .far, .fab').forEach(icon => {
            const iconName = this.getIconName(icon);
            const fallbackIcon = this.createFallbackIcon(iconName, icon);
            icon.parentNode.replaceChild(fallbackIcon, icon);
        });
    }

    getIconName(icon) {
        return Array.from(icon.classList)
            .find(className => className.startsWith('fa-'))
            ?.replace('fa-', '') || 'default';
    }

    createFallbackIcon(iconName, originalIcon) {
        const fallback = document.createElement('span');
        fallback.className = `icon-fallback icon-${iconName}`;
        fallback.innerHTML = originalIcon.innerHTML;
        
        // Copy styles and attributes
        fallback.style.cssText = originalIcon.style.cssText;
        Array.from(originalIcon.attributes).forEach(attr => {
            if (attr.name !== 'class') {
                fallback.setAttribute(attr.name, attr.value);
            }
        });
        
        return fallback;
    }
}

// Initialize everything when script loads
const appInitializer = new AppInitializer();
const fontAwesomeFallback = new FontAwesomeFallback();

// Export for use in other modules
window.AppInitializer = appInitializer;
window.FontAwesomeFallback = fontAwesomeFallback;