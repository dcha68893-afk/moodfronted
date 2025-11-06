/**
 * UniConnect - Main Application Script
 * Handles section transitions and UI interactions
 */

class UniConnectApp {
    constructor() {
        this.currentSection = 'landing';
        this.isTransitioning = false;
        this.init();
    }

    init() {
        // Initialize event listeners
        this.setupEventListeners();
        
        // Load user preferences if any
        this.loadUserPreferences();
        
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
        const savedEmail = localStorage.getItem('uniconnect-email');
        const rememberMe = localStorage.getItem('uniconnect-remember') === 'true';
        
        if (savedEmail && rememberMe) {
            document.getElementById('loginEmail').value = savedEmail;
            document.getElementById('remember-me').checked = true;
        }
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