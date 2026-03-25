/**
 * Signup Page JavaScript
 * Handles signup functionality and validation
 */

// DOM Elements
const signupForm = document.getElementById('signupForm');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initScrollReveal();
    initInputValidation();
    checkAuthStatus();
});

/**
 * Initialize scroll reveal animations
 */
function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-scroll').forEach(el => {
        observer.observe(el);
    });
}

/**
 * Initialize input validation
 */
function initInputValidation() {
    nameInput.addEventListener('input', () => validateField(nameInput, nameInput.value.length >= 2));
    emailInput.addEventListener('input', () => validateEmailField(emailInput));
    phoneInput.addEventListener('input', () => validatePhoneField(phoneInput));
    passwordInput.addEventListener('input', () => validatePasswordField(passwordInput));
    confirmPasswordInput.addEventListener('input', () => validateConfirmPassword());
}

/**
 * Validate email field
 */
function validateEmailField(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const icon = input.parentElement.querySelector('.input-icon');
    const isValid = emailRegex.test(input.value);
    
    if (input.value && isValid) {
        icon.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i>';
        return true;
    } else if (input.value) {
        icon.innerHTML = '<i class="fas fa-exclamation-circle" style="color: var(--warning);"></i>';
        return false;
    } else {
        icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        return false;
    }
}

/**
 * Validate phone field
 */
function validatePhoneField(input) {
    const phoneRegex = /^[0-9]{10,15}$/;
    const icon = input.parentElement.querySelector('.input-icon');
    const isValid = phoneRegex.test(input.value.replace(/\D/g, ''));
    
    if (input.value && isValid) {
        icon.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i>';
        return true;
    } else if (input.value) {
        icon.innerHTML = '<i class="fas fa-exclamation-circle" style="color: var(--warning);"></i>';
        return false;
    } else {
        icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        return false;
    }
}

/**
 * Validate password field
 */
function validatePasswordField(input) {
    const icon = input.parentElement.querySelector('.input-icon');
    const isValid = input.value.length >= 6;
    
    if (input.value && isValid) {
        icon.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i>';
        return true;
    } else if (input.value) {
        icon.innerHTML = '<i class="fas fa-exclamation-circle" style="color: var(--warning);"></i>';
        return false;
    } else {
        icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        return false;
    }
}

/**
 * Validate confirm password
 */
function validateConfirmPassword() {
    const icon = confirmPasswordInput.parentElement.querySelector('.input-icon');
    const isValid = confirmPasswordInput.value === passwordInput.value && confirmPasswordInput.value.length >= 6;
    
    if (confirmPasswordInput.value) {
        if (isValid) {
            icon.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i>';
            return true;
        } else {
            icon.innerHTML = '<i class="fas fa-exclamation-circle" style="color: var(--danger);"></i>';
            return false;
        }
    } else {
        icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        return false;
    }
}

/**
 * Generic field validation
 */
function validateField(input, isValid) {
    const icon = input.parentElement.querySelector('.input-icon');
    
    if (input.value && isValid) {
        icon.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i>';
        return true;
    } else if (input.value) {
        icon.innerHTML = '<i class="fas fa-exclamation-circle" style="color: var(--warning);"></i>';
        return false;
    } else {
        icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        return false;
    }
}

/**
 * Toggle password visibility
 */
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentElement.querySelector('.toggle-password i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

/**
 * Handle signup form submission
 */
async function handleSignup(event) {
    event.preventDefault();
    
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const terms = document.getElementById('terms').checked;
    
    // Validate all fields
    const isEmailValid = validateEmailField(emailInput);
    const isPhoneValid = validatePhoneField(phoneInput);
    const isPasswordValid = password.length >= 6;
    const isConfirmValid = confirmPassword === password && confirmPassword.length >= 6;
    
    if (!name || name.length < 2) {
        showToast('Please enter your full name', 'error');
        return;
    }
    
    if (!isEmailValid) {
        showToast('Please enter a valid email address', 'error');
        return;
    }
    
    if (!isPhoneValid) {
        showToast('Please enter a valid phone number', 'error');
        return;
    }
    
    if (!isPasswordValid) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    if (!isConfirmValid) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    if (!terms) {
        showToast('Please accept the Terms of Service', 'error');
        return;
    }
    
    // Show loading state
    const submitBtn = signupForm.querySelector('.login-btn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // Register with email and password using auth module
        const user = await window.auth.registerWithEmail(email, password);
        
        // Update profile with name
        await user.updateProfile({
            displayName: name
        });
        
        // Get ID token for API calls
        const idToken = await user.getIdToken();
        
        // Store auth state
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('authToken', idToken);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userName', user.displayName || name);
        localStorage.setItem('userRole', 'viewer'); // Default role
        
        showToast('Account created successfully!', 'success');
        
        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'Registration failed';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already registered';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        }
        showToast(errorMessage, 'error');
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

/**
 * Handle social signup
 */
async function socialSignup(provider) {
    showToast(`Creating account with ${provider}...`, 'info');
    
    try {
        let user;
        if (provider === 'google') {
            user = await window.auth.signInWithGoogle();
        } else if (provider === 'github') {
            user = await window.auth.signInWithGitHub();
        } else if (provider === 'microsoft') {
            user = await window.auth.signInWithMicrosoft();
        } else {
            showToast('Unsupported provider', 'error');
            return;
        }
        
        // Update profile with name if not set
        if (!user.displayName) {
            await user.updateProfile({
                displayName: `${provider} User`
            });
        }
        
        // Get ID token for API calls
        const idToken = await user.getIdToken();
        
        // Store auth state
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('authToken', idToken);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userName', user.displayName || `${provider} User`);
        localStorage.setItem('userRole', 'viewer'); // Default role
        
        showToast('Account created successfully!', 'success');
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
    } catch (error) {
        console.error('Social signup error:', error);
        showToast('Social signup failed. Please try again.', 'error');
    }
}

/**
 * Check if user is already logged in
 */
function checkAuthStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    
    if (isLoggedIn) {
        window.location.href = 'dashboard.html';
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.querySelector('.toast-icon').className = `toast-icon fas ${icons[type] || icons.info}`;
    toast.querySelector('.toast-message').textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Expose functions globally
window.handleSignup = handleSignup;
window.togglePassword = togglePassword;
window.socialLogin = socialLogin;
