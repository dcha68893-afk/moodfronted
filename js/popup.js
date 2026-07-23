/**
 * Popup Manager - Modal/Popup functionality
 * Version 1.0.0
 */

class Popup {
    constructor() {
        this.currentPopup = null;
        this.stack = [];
        this.defaultOptions = {
            width: '500px',
            height: 'auto',
            title: '',
            closeButton: true,
            overlay: true,
            overlayClose: true,
            escClose: true,
            animation: 'fadeIn',
            animationSpeed: 300,
            position: 'center',
            content: '',
            onOpen: null,
            onClose: null,
            className: '',
            buttons: null,
            data: null
        };
        
        this.init();
    }
    
    init() {
        // Create styles if not exist
        if (!document.getElementById('popup-styles')) {
            this.createStyles();
        }
        
        // Handle ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentPopup && 
                this.currentPopup.options.escClose) {
                this.close();
            }
        });
    }
    
    createStyles() {
        const styles = `
            .popup-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9998;
                display: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .popup-overlay.active {
                display: block;
                opacity: 1;
            }
            
            .popup-container {
                position: fixed;
                z-index: 9999;
                background: white;
                border-radius: 8px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                display: none;
                opacity: 0;
                transform: translateY(-20px);
                transition: opacity 0.3s ease, transform 0.3s ease;
                max-width: 90%;
                max-height: 90vh;
                overflow: hidden;
            }
            
            .popup-container.active {
                display: block;
                opacity: 1;
                transform: translateY(0);
            }
            
            .popup-header {
                padding: 20px 20px 10px;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .popup-title {
                margin: 0;
                font-size: 1.5em;
                font-weight: 600;
                color: #333;
            }
            
            .popup-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #666;
                padding: 0;
                width: 30px;
                height: 30px;
                line-height: 30px;
                text-align: center;
                border-radius: 50%;
                transition: background 0.2s;
            }
            
            .popup-close:hover {
                background: #f5f5f5;
                color: #333;
            }
            
            .popup-content {
                padding: 20px;
                overflow-y: auto;
                max-height: calc(90vh - 140px);
            }
            
            .popup-footer {
                padding: 15px 20px;
                border-top: 1px solid #eee;
                background: #f9f9f9;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
            
            .popup-button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
            }
            
            .popup-button-primary {
                background: #4CAF50;
                color: white;
            }
            
            .popup-button-primary:hover {
                background: #45a049;
            }
            
            .popup-button-secondary {
                background: #f5f5f5;
                color: #333;
            }
            
            .popup-button-secondary:hover {
                background: #e8e8e8;
            }
            
            .popup-loading {
                text-align: center;
                padding: 40px;
                color: #666;
            }
            
            /* Animations */
            @keyframes popupFadeIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes popupFadeOut {
                from {
                    opacity: 1;
                    transform: translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateY(-20px);
                }
            }
            
            @keyframes overlayFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes overlayFadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            
            .popup-center {
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            }
            
            .popup-top {
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
            }
            
            .popup-bottom {
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
            }
            
            .popup-left {
                left: 20px;
                top: 50%;
                transform: translateY(-50%);
            }
            
            .popup-right {
                right: 20px;
                top: 50%;
                transform: translateY(-50%);
            }
            
            .popup-alert {
                width: 400px;
            }
            
            .popup-confirm {
                width: 400px;
            }
            
            .popup-large {
                width: 800px;
            }
            
            .popup-small {
                width: 300px;
            }
        `;
        
        const styleEl = document.createElement('style');
        styleEl.id = 'popup-styles';
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }
    
    open(content, options = {}) {
        // Merge options with defaults
        const opts = { ...this.defaultOptions, ...options };
        
        // Create overlay
        let overlay = document.querySelector('.popup-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'popup-overlay';
            document.body.appendChild(overlay);
        }
        
        // Create popup container
        const popup = document.createElement('div');
        popup.className = `popup-container popup-${opts.position} ${opts.className}`;
        
        // Set dimensions
        popup.style.width = opts.width;
        if (opts.height !== 'auto') {
            popup.style.height = opts.height;
        }
        
        // Build popup HTML
        let html = '';
        
        // Header
        if (opts.title || opts.closeButton) {
            html += `<div class="popup-header">`;
            if (opts.title) {
                html += `<h3 class="popup-title">${opts.title}</h3>`;
            }
            if (opts.closeButton) {
                html += `<button class="popup-close" aria-label="Close">&times;</button>`;
            }
            html += `</div>`;
        }
        
        // Content
        html += `<div class="popup-content">`;
        if (typeof content === 'string') {
            html += content;
        } else if (content instanceof HTMLElement) {
            popup.appendChild(content);
            content.style.display = 'block';
        } else if (typeof content === 'function') {
            html += content();
        }
        html += `</div>`;
        
        // Footer with buttons
        if (opts.buttons && Array.isArray(opts.buttons)) {
            html += `<div class="popup-footer">`;
            opts.buttons.forEach(btn => {
                const btnClass = btn.primary ? 'popup-button-primary' : 'popup-button-secondary';
                html += `<button class="popup-button ${btnClass}" 
                          data-action="${btn.action || 'close'}">
                          ${btn.text}
                        </button>`;
            });
            html += `</div>`;
        }
        
        popup.innerHTML = html;
        
        // Store popup data
        popup.popupData = {
            options: opts,
            overlay: overlay
        };
        
        // Add to stack
        this.stack.push(popup);
        this.currentPopup = popup;
        
        // Add to DOM
        document.body.appendChild(popup);
        
        // Set position
        this.positionPopup(popup, opts.position);
        
        // Show with animation
        setTimeout(() => {
            popup.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Call onOpen callback
            if (typeof opts.onOpen === 'function') {
                opts.onOpen(popup, opts.data);
            }
            
            // Attach event listeners
            this.attachEvents(popup);
        }, 10);
        
        return popup;
    }
    
    positionPopup(popup, position) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const popupWidth = popup.offsetWidth;
        const popupHeight = popup.offsetHeight;
        
        switch(position) {
            case 'top':
                popup.style.top = '20px';
                popup.style.left = '50%';
                popup.style.transform = 'translateX(-50%)';
                break;
            case 'bottom':
                popup.style.bottom = '20px';
                popup.style.left = '50%';
                popup.style.transform = 'translateX(-50%)';
                break;
            case 'left':
                popup.style.left = '20px';
                popup.style.top = '50%';
                popup.style.transform = 'translateY(-50%)';
                break;
            case 'right':
                popup.style.right = '20px';
                popup.style.top = '50%';
                popup.style.transform = 'translateY(-50%)';
                break;
            default: // center
                popup.style.top = '50%';
                popup.style.left = '50%';
                popup.style.transform = 'translate(-50%, -50%)';
        }
    }
    
    attachEvents(popup) {
        const opts = popup.popupData.options;
        const overlay = popup.popupData.overlay;
        
        // Close button
        const closeBtn = popup.querySelector('.popup-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // Overlay close
        if (opts.overlayClose) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.close();
                }
            });
        }
        
        // Button actions
        popup.querySelectorAll('.popup-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'close') {
                    this.close();
                } else if (opts.buttons) {
                    const btnConfig = opts.buttons.find(b => b.text === e.target.textContent);
                    if (btnConfig && typeof btnConfig.callback === 'function') {
                        btnConfig.callback(popup, opts.data);
                    }
                }
            });
        });
    }
    
    close(popup = null) {
        const targetPopup = popup || this.currentPopup;
        if (!targetPopup) return;
        
        const opts = targetPopup.popupData.options;
        const overlay = targetPopup.popupData.overlay;
        
        // Hide with animation
        targetPopup.classList.remove('active');
        overlay.classList.remove('active');
        
        // Call onClose callback
        if (typeof opts.onClose === 'function') {
            opts.onClose(targetPopup, opts.data);
        }
        
        // Remove from DOM after animation
        setTimeout(() => {
            if (targetPopup.parentNode) {
                targetPopup.parentNode.removeChild(targetPopup);
            }
            
            // Remove overlay if no more popups
            const remainingPopups = document.querySelectorAll('.popup-container.active');
            if (remainingPopups.length === 0 && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
                document.body.style.overflow = '';
            }
            
            // Update stack
            const index = this.stack.indexOf(targetPopup);
            if (index > -1) {
                this.stack.splice(index, 1);
            }
            
            // Update current popup
            if (this.stack.length > 0) {
                this.currentPopup = this.stack[this.stack.length - 1];
            } else {
                this.currentPopup = null;
            }
        }, opts.animationSpeed);
    }
    
    closeAll() {
        while (this.stack.length > 0) {
            this.close(this.stack[0]);
        }
    }
    
    alert(message, title = 'Alert', callback = null) {
        return this.open(`
            <div style="text-align: center; padding: 20px 0;">
                <p style="margin-bottom: 20px; font-size: 16px;">${message}</p>
            </div>
        `, {
            title: title,
            className: 'popup-alert',
            buttons: [{
                text: 'OK',
                primary: true,
                action: 'close',
                callback: callback
            }],
            overlayClose: false,
            escClose: false
        });
    }
    
    confirm(message, title = 'Confirm', callback = null) {
        return this.open(`
            <div style="text-align: center; padding: 20px 0;">
                <p style="margin-bottom: 20px; font-size: 16px;">${message}</p>
            </div>
        `, {
            title: title,
            className: 'popup-confirm',
            buttons: [
                {
                    text: 'Cancel',
                    primary: false,
                    action: 'close'
                },
                {
                    text: 'OK',
                    primary: true,
                    action: 'close',
                    callback: callback
                }
            ],
            overlayClose: false,
            escClose: false
        });
    }
    
    prompt(defaultValue = '', title = 'Enter value', callback = null) {
        const inputId = 'popup-prompt-input-' + Date.now();
        return this.open(`
            <div style="padding: 20px 0;">
                <input type="text" 
                       id="${inputId}" 
                       value="${defaultValue}" 
                       style="width: 100%; padding: 10px; font-size: 16px; border: 1px solid #ddd; border-radius: 4px;"
                       autofocus>
            </div>
        `, {
            title: title,
            className: 'popup-confirm',
            buttons: [
                {
                    text: 'Cancel',
                    primary: false,
                    action: 'close'
                },
                {
                    text: 'OK',
                    primary: true,
                    action: 'close',
                    callback: (popup) => {
                        const input = document.getElementById(inputId);
                        if (callback && typeof callback === 'function') {
                            callback(input.value);
                        }
                    }
                }
            ],
            overlayClose: false,
            escClose: false,
            onOpen: (popup) => {
                setTimeout(() => {
                    const input = document.getElementById(inputId);
                    if (input) input.focus();
                }, 100);
            }
        });
    }
    
    loading(message = 'Loading...') {
        return this.open(`
            <div class="popup-loading">
                <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
                <p>${message}</p>
            </div>
        `, {
            closeButton: false,
            overlayClose: false,
            escClose: false,
            className: 'popup-alert'
        });
    }
    
    updateContent(content, popup = null) {
        const targetPopup = popup || this.currentPopup;
        if (!targetPopup) return;
        
        const contentEl = targetPopup.querySelector('.popup-content');
        if (contentEl) {
            if (typeof content === 'string') {
                contentEl.innerHTML = content;
            } else if (content instanceof HTMLElement) {
                contentEl.innerHTML = '';
                contentEl.appendChild(content);
            }
        }
    }
    
    setTitle(title, popup = null) {
        const targetPopup = popup || this.currentPopup;
        if (!targetPopup) return;
        
        const titleEl = targetPopup.querySelector('.popup-title');
        if (titleEl) {
            titleEl.textContent = title;
        }
    }
    
    isOpen() {
        return this.currentPopup !== null;
    }
    
    getCurrent() {
        return this.currentPopup;
    }
}

// Create global instance
window.Popup = new Popup();

// Global helper functions
window.openPopup = function(content, options) {
    return window.Popup.open(content, options);
};

window.closePopup = function(popup) {
    return window.Popup.close(popup);
};

window.closeAllPopups = function() {
    return window.Popup.closeAll();
};

window.showAlert = function(message, title, callback) {
    return window.Popup.alert(message, title, callback);
};

window.showConfirm = function(message, title, callback) {
    return window.Popup.confirm(message, title, callback);
};

window.showPrompt = function(defaultValue, title, callback) {
    return window.Popup.prompt(defaultValue, title, callback);
};

window.showLoading = function(message) {
    return window.Popup.loading(message);
};