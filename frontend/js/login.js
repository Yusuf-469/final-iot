/**
 * Login Page JavaScript
 * Handles login functionality with proper API authentication
 */

// DOM Elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const dashboardPreview = document.getElementById('dashboardPreview');
const loginCard = document.querySelector('.login-card');
const toast = document.getElementById('toast');
const previewChart = document.getElementById('previewChart');

// Firebase configuration (replace with your actual config)
const firebaseConfig = {
  apiKey: "AIzaSyBexampleKey1234567890abcdef",
  authDomain: "iothealth-2335a.firebaseapp.com",
  projectId: "iothealth-2335a",
  storageBucket: "iothealth-2335a.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

// Initialize Firebase
let firebaseApp = null;
let auth = null;
try {
  firebaseApp = firebase.initializeApp(firebaseConfig);
  auth = firebaseApp.auth();
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Initialize Firebase authentication
async function initFirebase() {
  if (!firebaseApp) {
    try {
      firebaseApp = firebase.initializeApp(firebaseConfig);
      auth = firebaseApp.auth();
      console.log('Firebase initialized successfully');
    } catch (error) {
      console.error('Firebase initialization error:', error);
      throw error;
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initScrollReveal();
    initInputValidation();
    initPreviewChart();
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
    emailInput.addEventListener('input', validateEmail);
    passwordInput.addEventListener('input', validatePassword);
}

/**
 * Validate email input
 */
function validateEmail() {
    const email = emailInput.value;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const icon = emailInput.parentElement.querySelector('.input-icon');
    
    if (email && emailRegex.test(email)) {
        icon.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i>';
        return true;
    } else if (email) {
        icon.innerHTML = '<i class="fas fa-exclamation-circle" style="color: var(--warning);"></i>';
        return false;
    } else {
        icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        return false;
    }
}

/**
 * Validate password input
 */
function validatePassword() {
    const password = passwordInput.value;
    
    if (password.length >= 8) {
        return true;
    }
    return false;
}

/**
 * Toggle password visibility
 */
function togglePassword() {
    const icon = passwordInput.parentElement.querySelector('.toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

/**
 * Handle login form submission
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Validate inputs
    if (!email || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (!validateEmail()) {
        showToast('Please enter a valid email address', 'error');
        return;
    }
    
    if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }
    
    // Show loading state
    const loginBtn = loginForm.querySelector('.login-btn');
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;
    
    try {
        // Initialize Firebase if not already done
        await initFirebase();
        
        // Sign in with email and password using Firebase
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Get ID token for API calls
        const idToken = await user.getIdToken();
        
        // Store auth state
        localStorage.setItem('authToken', idToken);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userName', `${user.displayName || user.email.split('@')[0]} ${''}`); // Firebase doesn't store first/last name by default
        localStorage.setItem('userRole', 'viewer'); // Default role, can be customized via custom claims
        localStorage.setItem('isDemo', false);
        localStorage.setItem('isLoggedIn', 'true');
        
        showToast('Login successful! Redirecting...', 'success');
        
        // Animate transition to dashboard
        setTimeout(() => {
            animateToDashboard();
        }, 1000);
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Login failed';
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No user found with this email';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid password';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        }
        showToast(errorMessage, 'error');
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
    }
}

/**
 * Animate transition to dashboard preview
 */
function animateToDashboard() {
    // Fade out login card
    loginCard.style.opacity = '0';
    loginCard.style.transform = 'translateX(-50px)';
    loginCard.style.transition = 'all 0.5s ease';
    
    // Show dashboard preview
    dashboardPreview.classList.remove('hidden');
    dashboardPreview.classList.add('show');
    
    // Fade in dashboard
    setTimeout(() => {
        dashboardPreview.style.opacity = '1';
        dashboardPreview.style.transform = 'translateX(0)';
        
        // Redirect to main dashboard after animation
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);
    }, 100);
}



/**
 * Switch to register
 */
async function switchToRegister() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const firstName = '';
    const lastName = '';
    
    if (!email || !password) {
        showToast('Please enter email and password to register', 'info');
        return;
    }
    
    if (!validateEmail()) {
        showToast('Please enter a valid email', 'error');
        return;
    }
    
    if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }
    
    // Show loading
    const loginBtn = loginForm.querySelector('.login-btn');
    loginBtn.classList.add('loading');
    
    try {
        // Attempt signup
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email, 
                password,
                firstName: email.split('@')[0],
                lastName: 'User'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Auto login after signup
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('userEmail', data.user.email);
            localStorage.setItem('userName', `${data.user.firstName} ${data.user.lastName}`);
            localStorage.setItem('userRole', data.user.role);
            localStorage.setItem('isLoggedIn', 'true');
            
            showToast('Account created! Redirecting...', 'success');
            
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } else {
            showToast(data.error || 'Registration failed', 'error');
            loginBtn.classList.remove('loading');
        }
        
    } catch (error) {
        console.error('Signup error:', error);
        showToast('Registration failed. Please try again.', 'error');
        loginBtn.classList.remove('loading');
    }
}

/**
 * Check if user is already logged in
 */
function checkAuthStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    
    if (isLoggedIn) {
        // User is already logged in, redirect to dashboard
        window.location.href = 'dashboard.html';
    }
}

/**
 * Initialize preview chart
 */
function initPreviewChart() {
    if (!previewChart) return;
    
    const ctx = previewChart.getContext('2d');
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Heart Rate',
                data: [72, 75, 68, 74, 71, 69, 73],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    display: true,
                    min: 60,
                    max: 90,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#64748b',
                        font: {
                            size: 10
                        }
                    }
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toast.querySelector('.toast-icon').className = `toast-icon fas ${icons[type]}`;
    toast.querySelector('.toast-message').textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

/**
 * Handle social login
 */
async function socialLogin(provider) {
    try {
        // Initialize Firebase if not already done
        await initFirebase();
        
        let providerObj;
        if (provider === 'google') {
            providerObj = new firebase.auth.GoogleAuthProvider();
        } else if (provider === 'github') {
            providerObj = new firebase.auth.GithubAuthProvider();
        } else if (provider === 'microsoft') {
            providerObj = new firebase.auth.OAuthProvider('microsoft.com');
        } else {
            showToast('Unsupported provider', 'error');
            return;
        }
        
        // Sign in with popup
        const result = await auth.signInWithPopup(providerObj);
        const user = result.user;
        
        // Get ID token for API calls
        const idToken = await user.getIdToken();
        
        // Store auth state
        localStorage.setItem('authToken', idToken);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userName', user.displayName || user.email.split('@')[0]);
        localStorage.setItem('userRole', 'viewer'); // Default role
        localStorage.setItem('isDemo', false);
        localStorage.setItem('isLoggedIn', 'true');
        
        showToast('Login successful! Redirecting...', 'success');
        
        // Animate transition to dashboard
        setTimeout(() => {
            animateToDashboard();
        }, 1000);
    } catch (error) {
        console.error('Social login error:', error);
        showToast('Social login failed. Please try again.', 'error');
    }
}

/**
 * Logout user
 */
function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    
    window.location.href = 'login.html';
}

// Expose functions globally
window.handleLogin = handleLogin;
window.togglePassword = togglePassword;
window.switchToRegister = switchToRegister;
window.logout = logout;
window.socialLogin = socialLogin;
