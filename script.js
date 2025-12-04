
/**
 * UniConnect - Main Application Script
 * Handles section transitions and UI interactions
 */

class UniConnectApp {
    constructor() {
        this.currentSection = 'landing';
        this.isTransitioning = false;
        this.userSelections = {
            moods: [],
            interests: [],
            theme: 'light'
        };
        this.init();
    }

    init() {
        // Initialize event listeners
        this.setupEventListeners();
        
        // Load user preferences if any
        this.loadUserPreferences();
        
        // Initialize user selections display
        this.initUserSelectionsDisplay();
        
        console.log('🚀 UniConnect app initialized');
    }

    /**
     * Sets up all event listeners for the application
     */
    setupEventListeners() {
        // Section navigation buttons
        document.getElementById('showLoginBtn').addEventListener('click', () => this.showSection('login'));
        document.getElementById('showRegisterBtn').addEventListener('click', () => this.showSection('register'));
        
        // Back buttons
        document.getElementById('backToLandingFromLogin').addEventListener('click', () => this.showSection('landing'));
        document.getElementById('backToLandingFromRegister').addEventListener('click', () => this.showSection('landing'));
        
        // Switch between login and register
        document.getElementById('switchToRegisterFromLogin').addEventListener('click', () => this.showSection('register'));
        document.getElementById('switchToLoginFromRegister').addEventListener('click', () => this.showSection('login'));
        
        // Form submissions
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registration-form').addEventListener('submit', (e) => this.handleRegistration(e));
        
        // Password visibility toggles
        this.setupPasswordToggles();
        
        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    /**
     * Initialize UserSelectionsDisplay
     */
    initUserSelectionsDisplay() {
        // Check if we're on a page with selections display
        const selectionsContainer = document.getElementById('userSelectionsContainer');
        if (!selectionsContainer) return;

        // Load saved selections from localStorage
        this.loadUserSelections();
        
        // Initialize display
        this.updateSelectionsDisplay();
        
        // Set up event listeners for selection updates
        this.setupSelectionEventListeners();
    }

    /**
     * Set up event listeners for mood and interest selections
     */
    setupSelectionEventListeners() {
        // Mood selection buttons
        document.querySelectorAll('[data-mood]').forEach(button => {
            button.addEventListener('click', (e) => {
                const mood = e.currentTarget.dataset.mood;
                this.toggleMoodSelection(mood);
            });
        });

        // Interest selection buttons
        document.querySelectorAll('[data-interest]').forEach(button => {
            button.addEventListener('click', (e) => {
                const interest = e.currentTarget.dataset.interest;
                this.toggleInterestSelection(interest);
            });
        });

        // Clear all selections button
        const clearSelectionsBtn = document.getElementById('clearSelectionsBtn');
        if (clearSelectionsBtn) {
            clearSelectionsBtn.addEventListener('click', () => this.clearAllSelections());
        }

        // Save selections button
        const saveSelectionsBtn = document.getElementById('saveSelectionsBtn');
        if (saveSelectionsBtn) {
            saveSelectionsBtn.addEventListener('click', () => this.saveUserSelections());
        }
    }

    /**
     * Global mood update function
     * @param {string} mood - The mood to toggle
     */
    toggleMoodSelection(mood) {
        const index = this.userSelections.moods.indexOf(mood);
        
        if (index === -1) {
            // Add mood if not already selected (max 3 moods)
            if (this.userSelections.moods.length < 3) {
                this.userSelections.moods.push(mood);
                this.showToast(`Added "${mood}" mood`, 'success');
            } else {
                this.showToast('Maximum 3 moods allowed', 'warning');
                return;
            }
        } else {
            // Remove mood if already selected
            this.userSelections.moods.splice(index, 1);
            this.showToast(`Removed "${mood}" mood`, 'info');
        }
        
        // Update UI and save
        this.updateMoodButtons();
        this.updateSelectionsDisplay();
        this.saveUserSelections();
    }

    /**
     * Global interest update function
     * @param {string} interest - The interest to toggle
     */
    toggleInterestSelection(interest) {
        const index = this.userSelections.interests.indexOf(interest);
        
        if (index === -1) {
            // Add interest if not already selected
            this.userSelections.interests.push(interest);
            this.showToast(`Added "${interest}" interest`, 'success');
        } else {
            // Remove interest if already selected
            this.userSelections.interests.splice(index, 1);
            this.showToast(`Removed "${interest}" interest`, 'info');
        }
        
        // Update UI and save
        this.updateInterestButtons();
        this.updateSelectionsDisplay();
        this.saveUserSelections();
    }

    /**
     * Update mood selection buttons UI
     */
    updateMoodButtons() {
        document.querySelectorAll('[data-mood]').forEach(button => {
            const mood = button.dataset.mood;
            if (this.userSelections.moods.includes(mood)) {
                button.classList.add('selected');
                button.classList.remove('unselected');
            } else {
                button.classList.remove('selected');
                button.classList.add('unselected');
            }
        });
    }

    /**
     * Update interest selection buttons UI
     */
    updateInterestButtons() {
        document.querySelectorAll('[data-interest]').forEach(button => {
            const interest = button.dataset.interest;
            if (this.userSelections.interests.includes(interest)) {
                button.classList.add('selected');
                button.classList.remove('unselected');
            } else {
                button.classList.remove('selected');
                button.classList.add('unselected');
            }
        });
    }

    /**
     * Update the selections display
     */
    updateSelectionsDisplay() {
        const selectionsContainer = document.getElementById('userSelectionsContainer');
        if (!selectionsContainer) return;

        // Clear current display
        selectionsContainer.innerHTML = '';

        // Add moods section
        if (this.userSelections.moods.length > 0) {
            const moodsSection = this.createSelectionsSection('Current Moods', this.userSelections.moods, 'mood');
            selectionsContainer.appendChild(moodsSection);
        }

        // Add interests section
        if (this.userSelections.interests.length > 0) {
            const interestsSection = this.createSelectionsSection('Current Interests', this.userSelections.interests, 'interest');
            selectionsContainer.appendChild(interestsSection);
        }

        // Show message if no selections
        if (this.userSelections.moods.length === 0 && this.userSelections.interests.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-selections-message';
            emptyMessage.innerHTML = `
                <i class="fas fa-info-circle"></i>
                <p>No moods or interests selected yet. Start selecting to personalize your experience!</p>
            `;
            selectionsContainer.appendChild(emptyMessage);
        }
    }

    /**
     * Create a selections section element
     * @param {string} title - Section title
     * @param {Array} items - Array of items to display
     * @param {string} type - Type of selection (mood or interest)
     * @returns {HTMLElement} - The created section element
     */
    createSelectionsSection(title, items, type) {
        const section = document.createElement('div');
        section.className = 'selections-section';
        
        const titleEl = document.createElement('h3');
        titleEl.className = 'selections-title';
        titleEl.textContent = title;
        
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'selections-items';
        
        items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = `selection-item ${type}`;
            itemEl.innerHTML = `
                <span>${item}</span>
                <button class="remove-selection-btn" data-${type}="${item}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // Add remove functionality
            const removeBtn = itemEl.querySelector('.remove-selection-btn');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (type === 'mood') {
                    this.toggleMoodSelection(item);
                } else {
                    this.toggleInterestSelection(item);
                }
            });
            
            itemsContainer.appendChild(itemEl);
        });
        
        section.appendChild(titleEl);
        section.appendChild(itemsContainer);
        
        return section;
    }

    /**
     * Clear all user selections
     */
    clearAllSelections() {
        if (this.userSelections.moods.length === 0 && this.userSelections.interests.length === 0) {
            this.showToast('No selections to clear', 'info');
            return;
        }

        if (confirm('Are you sure you want to clear all your mood and interest selections?')) {
            this.userSelections.moods = [];
            this.userSelections.interests = [];
            
            this.updateMoodButtons();
            this.updateInterestButtons();
            this.updateSelectionsDisplay();
            this.saveUserSelections();
            
            this.showToast('All selections cleared', 'success');
        }
    }

    /**
     * Save user selections to localStorage
     */
    saveUserSelections() {
        try {
            localStorage.setItem('uniconnect-selections', JSON.stringify(this.userSelections));
            console.log('💾 User selections saved');
        } catch (error) {
            console.error('Failed to save selections:', error);
        }
    }

    /**
     * Load user selections from localStorage
     */
    loadUserSelections() {
        try {
            const savedSelections = localStorage.getItem('uniconnect-selections');
            if (savedSelections) {
                this.userSelections = JSON.parse(savedSelections);
                console.log('📂 User selections loaded');
            }
        } catch (error) {
            console.error('Failed to load selections:', error);
        }
    }

    /**
     * Theme application logic
     */
    toggleTheme() {
        const currentTheme = this.userSelections.theme;
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        this.userSelections.theme = newTheme;
        this.applyTheme(newTheme);
        this.saveUserSelections();
        
        // Update theme toggle button
        this.updateThemeToggleButton(newTheme);
        
        this.showToast(`Switched to ${newTheme} theme`, 'success');
    }

    /**
     * Apply theme to the document
     * @param {string} theme - Theme to apply (light or dark)
     */
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        
        // Add smooth transition
        document.documentElement.style.transition = 'background-color 0.3s ease, color 0.3s ease';
        
        // Update theme-specific styles
        this.updateThemeStyles(theme);
    }

    /**
     * Update theme-specific CSS variables
     * @param {string} theme - Current theme
     */
    updateThemeStyles(theme) {
        const root = document.documentElement;
        
        if (theme === 'dark') {
            root.style.setProperty('--bg-primary', '#1a202c');
            root.style.setProperty('--bg-secondary', '#2d3748');
            root.style.setProperty('--text-primary', '#f7fafc');
            root.style.setProperty('--text-secondary', '#cbd5e0');
            root.style.setProperty('--border-color', '#4a5568');
        } else {
            root.style.setProperty('--bg-primary', '#ffffff');
            root.style.setProperty('--bg-secondary', '#f7fafc');
            root.style.setProperty('--text-primary', '#2d3748');
            root.style.setProperty('--text-secondary', '#718096');
            root.style.setProperty('--border-color', '#e2e8f0');
        }
    }

    /**
     * Update theme toggle button appearance
     * @param {string} theme - Current theme
     */
    updateThemeToggleButton(theme) {
        const themeToggle = document.getElementById('themeToggle');
        if (!themeToggle) return;

        const icon = themeToggle.querySelector('i');
        const text = themeToggle.querySelector('span');
        
        if (theme === 'dark') {
            icon.className = 'fas fa-sun';
            text.textContent = 'Light Mode';
        } else {
            icon.className = 'fas fa-moon';
            text.textContent = 'Dark Mode';
        }
    }

    /**
     * Initialize theme on page load
     */
    initTheme() {
        // Load saved theme or default to light
        const savedTheme = this.userSelections.theme || 'light';
        
        // Apply theme
        this.applyTheme(savedTheme);
        
        // Update toggle button
        this.updateThemeToggleButton(savedTheme);
        
        // Apply theme to any dynamically loaded content
        this.observeDOMForTheme();
    }

    /**
     * Observe DOM changes to apply theme to dynamically added elements
     */
    observeDOMForTheme() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    this.applyThemeToNewElements(mutation.addedNodes);
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Apply theme to newly added elements
     * @param {NodeList} elements - Newly added elements
     */
    applyThemeToNewElements(elements) {
        elements.forEach(element => {
            if (element.nodeType === 1) { // Element node
                if (element.classList && element.classList.contains('theme-aware')) {
                    this.applyThemeClass(element, this.userSelections.theme);
                }
                
                // Check child elements
                const themeAwareChildren = element.querySelectorAll('.theme-aware');
                themeAwareChildren.forEach(child => {
                    this.applyThemeClass(child, this.userSelections.theme);
                });
            }
        });
    }

    /**
     * Apply theme class to an element
     * @param {HTMLElement} element - Element to style
     * @param {string} theme - Current theme
     */
    applyThemeClass(element, theme) {
        element.classList.remove('theme-light', 'theme-dark');
        element.classList.add(`theme-${theme}`);
    }

    /**
     * Shows the specified section with a smooth transition
     * @param {string} sectionId - The ID of the section to show (without 'Section' suffix)
     */
    showSection(sectionId) {
        if (this.isTransitioning || this.currentSection === sectionId) return;
        
        this.isTransitioning = true;
        
        // Get section elements
        const currentSectionEl = document.getElementById(`${this.currentSection}Section`);
        const newSectionEl = document.getElementById(`${sectionId}Section`);
        
        // Hide current section
        currentSectionEl.classList.remove('section-active');
        currentSectionEl.classList.add('section-hidden');
        
        // Show new section after a brief delay for smooth transition
        setTimeout(() => {
            newSectionEl.classList.remove('section-hidden');
            newSectionEl.classList.add('section-active');
            
            this.currentSection = sectionId;
            this.isTransitioning = false;
            
            // Focus on first input in form sections
            if (sectionId === 'login') {
                document.getElementById('loginEmail').focus();
            } else if (sectionId === 'register') {
                document.getElementById('displayName').focus();
            }
            
            // Apply theme to new section
            this.applyThemeClass(newSectionEl, this.userSelections.theme);
            
            console.log(`🔄 Switched to ${sectionId} section`);
        }, 300);
    }

    /**
     * Sets up password visibility toggle buttons
     */
    setupPasswordToggles() {
        // Login password toggle
        document.getElementById('toggleLoginPassword').addEventListener('click', () => {
            this.togglePasswordVisibility('loginPassword', 'toggleLoginPassword');
        });
        
        // Register password toggle
        document.getElementById('toggleRegisterPassword').addEventListener('click', () => {
            this.togglePasswordVisibility('registerPassword', 'toggleRegisterPassword');
        });
        
        // Confirm password toggle
        document.getElementById('toggleConfirmPassword').addEventListener('click', () => {
            this.togglePasswordVisibility('confirmPassword', 'toggleConfirmPassword');
        });
    }

    /**
     * Toggles password field visibility
     * @param {string} passwordFieldId - The ID of the password input
     * @param {string} toggleButtonId - The ID of the toggle button
     */
    togglePasswordVisibility(passwordFieldId, toggleButtonId) {
        const passwordInput = document.getElementById(passwordFieldId);
        const toggleIcon = document.getElementById(toggleButtonId).querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.className = 'fas fa-eye-slash';
        } else {
            passwordInput.type = 'password';
            toggleIcon.className = 'fas fa-eye';
        }
    }

    /**
     * Handles login form submission
     * @param {Event} e - The form submission event
     */
    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        // Clear previous errors
        this.clearFieldError('loginEmail');
        this.clearFieldError('loginPassword');
        
        // Validate inputs
        let isValid = true;
        
        if (!email) {
            this.showFieldError('loginEmail', 'Email is required');
            isValid = false;
        } else if (!this.validateEmail(email)) {
            this.showFieldError('loginEmail', 'Please enter a valid email address');
            isValid = false;
        }
        
        if (!password) {
            this.showFieldError('loginPassword', 'Password is required');
            isValid = false;
        }
        
        if (isValid) {
            // Set loading state
            this.setLoginLoadingState(true);
            
            try {
                // Call Firebase authentication
                await window.firebaseAuth.loginUser(email, password);
                
                // Success - redirect to profile page
                this.redirectToProfile();
                
            } catch (error) {
                // Handle authentication error
                this.showMessage(error.message, 'error');
                this.setLoginLoadingState(false);
            }
        }
    }

    /**
     * Handles registration form submission
     * @param {Event} e - The form submission event
     */
    async handleRegistration(e) {
        e.preventDefault();
        
        const displayName = document.getElementById('displayName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Clear previous errors
        this.clearFieldError('displayName');
        this.clearFieldError('registerEmail');
        this.clearFieldError('registerPassword');
        this.clearFieldError('confirmPassword');
        
        // Validate inputs
        let isValid = true;
        
        if (!displayName) {
            this.showFieldError('displayName', 'Display name is required');
            isValid = false;
        }
        
        if (!email) {
            this.showFieldError('registerEmail', 'Email is required');
            isValid = false;
        } else if (!this.validateEmail(email)) {
            this.showFieldError('registerEmail', 'Please enter a valid email address');
            isValid = false;
        }
        
        if (!password) {
            this.showFieldError('registerPassword', 'Password is required');
            isValid = false;
        } else if (password.length < 6) {
            this.showFieldError('registerPassword', 'Password must be at least 6 characters');
            isValid = false;
        }
        
        if (!confirmPassword) {
            this.showFieldError('confirmPassword', 'Please confirm your password');
            isValid = false;
        } else if (password !== confirmPassword) {
            this.showFieldError('confirmPassword', 'Passwords do not match');
            isValid = false;
        }
        
        if (isValid) {
            // Set loading state
            this.setRegisterLoadingState(true);
            
            try {
                // Call Firebase registration
                await window.firebaseAuth.registerUser(email, password, displayName);
                
                // Success - redirect to profile page
                this.redirectToProfile();
                
            } catch (error) {
                // Handle registration error
                this.showMessage(error.message, 'error');
                this.setRegisterLoadingState(false);
            }
        }
    }

    /**
     * Validates email format
     * @param {string} email - The email to validate
     * @returns {boolean} - True if email is valid
     */
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Shows an error message for a form field
     * @param {string} fieldId - The ID of the field (without 'Error' suffix)
     * @param {string} message - The error message to display
     */
    showFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        const errorElement = document.getElementById(fieldId + 'Error');
        
        if (field && errorElement) {
            field.classList.add('input-error');
            field.classList.remove('input-success');
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
        }
    }

    /**
     * Clears error message for a form field
     * @param {string} fieldId - The ID of the field (without 'Error' suffix)
     */
    clearFieldError(fieldId) {
        const field = document.getElementById(fieldId);
        const errorElement = document.getElementById(fieldId + 'Error');
        
        if (field && errorElement) {
            field.classList.remove('input-error');
            errorElement.classList.add('hidden');
        }
    }

    /**
     * Shows a success message for a form field
     * @param {string} fieldId - The ID of the field
     */
    showFieldSuccess(fieldId) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.add('input-success');
            field.classList.remove('input-error');
        }
    }

    /**
     * Sets loading state for login form
     * @param {boolean} isLoading - Whether the form is loading
     */
    setLoginLoadingState(isLoading) {
        const loginBtn = document.getElementById('loginBtn');
        const loginBtnText = document.getElementById('loginBtnText');
        const loginSpinner = document.getElementById('loginSpinner');

        loginBtn.disabled = isLoading;
        
        if (isLoading) {
            loginBtnText.textContent = 'Signing In...';
            loginSpinner.classList.remove('hidden');
        } else {
            loginBtnText.textContent = 'Sign In';
            loginSpinner.classList.add('hidden');
        }
    }

    /**
     * Sets loading state for registration form
     * @param {boolean} isLoading - Whether the form is loading
     */
    setRegisterLoadingState(isLoading) {
        const registerBtn = document.getElementById('registerBtn');
        const registerBtnText = document.getElementById('registerBtnText');
        const registerSpinner = document.getElementById('registerSpinner');

        registerBtn.disabled = isLoading;
        
        if (isLoading) {
            registerBtnText.textContent = 'Creating Account...';
            registerSpinner.classList.remove('hidden');
        } else {
            registerBtnText.textContent = 'Create Account';
            registerSpinner.classList.add('hidden');
        }
    }

    /**
     * Shows a message toast
     * @param {string} message - The message to display
     * @param {string} type - The type of message (success, error, warning)
     */
    showMessage(message, type = 'error') {
        const messageContainer = document.getElementById('messageContainer');
        const messageClass = type === 'error' ? 'error-message' : 'success-message';
        
        messageContainer.innerHTML = `
            <div class="${messageClass}">
                <div class="flex items-center">
                    <i class="fas ${type === 'error' ? 'fa-exclamation-triangle' : 'fa-check-circle'} mr-2"></i>
                    <span>${message}</span>
                </div>
            </div>
        `;
        
        if (type === 'error') {
            messageContainer.classList.add('shake');
            setTimeout(() => messageContainer.classList.remove('shake'), 500);
        }
        
        if (type === 'success') {
            setTimeout(() => {
                if (messageContainer.innerHTML.includes(message)) {
                    messageContainer.innerHTML = '';
                }
            }, 5000);
        }
    }

    /**
     * Shows a toast notification
     * @param {string} message - The message to display
     * @param {string} type - The type of toast (success, error, warning)
     */
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'} mr-2"></i>
                <span class="font-medium">${message}</span>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 300);
        }, 3000);
    }

    /**
     * Loads user preferences from localStorage
     */
    loadUserPreferences() {
        // Load login preferences
        const savedEmail = localStorage.getItem('uniconnect-email');
        const rememberMe = localStorage.getItem('uniconnect-remember') === 'true';
        
        if (savedEmail && rememberMe) {
            document.getElementById('loginEmail').value = savedEmail;
            document.getElementById('remember-me').checked = true;
        }
        
        // Initialize theme
        this.initTheme();
    }

    /**
     * Saves user preferences to localStorage
     */
    saveUserPreferences() {
        const email = document.getElementById('loginEmail').value;
        const rememberMe = document.getElementById('remember-me').checked;
        
        if (rememberMe && email) {
            localStorage.setItem('uniconnect-email', email);
            localStorage.setItem('uniconnect-remember', 'true');
        } else {
            localStorage.removeItem('uniconnect-email');
            localStorage.removeItem('uniconnect-remember');
        }
    }

    /**
     * Redirects to the profile page with a smooth transition
     */
    redirectToProfile() {
        // Save user preferences
        this.saveUserPreferences();
        
        // Show success message
        this.showMessage('Authentication successful! Redirecting...', 'success');
        
        // Add a brief delay to show the success message
        setTimeout(() => {
            // Apply fade-out transition to the entire page
            document.body.style.opacity = '0';
            document.body.style.transition = 'opacity 0.5s ease-in-out';
            
            // Redirect after transition completes
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 500);
        }, 1000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.uniConnectApp = new UniConnectApp();
});
