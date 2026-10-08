/**
 * Sign-up page
 * Creates an account via POST /api/auth/signup and signs the user straight in.
 * Shared helpers (alerts, loading state, social sign-in, demo) come from js/auth-ui.js.
 */
(function () {
    const ui = window.authUI;
    if (!ui) return; // auth-ui.js is redirecting an already signed-in user

    const form = document.getElementById('signup-form');
    const firstName = document.getElementById('firstName');
    const lastName = document.getElementById('lastName');
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const terms = document.getElementById('terms');
    const submit = document.getElementById('submit-btn');
    const strength = document.getElementById('password-strength');
    const strengthText = document.getElementById('strength-text');

    const RULES = {
        length: (p) => p.length >= 8,
        case: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p),
        number: (p) => /\d/.test(p),
        symbol: (p) => /[^A-Za-z0-9]/.test(p)
    };
    const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

    firstName.focus();

    function scorePassword(p) {
        const passed = Object.keys(RULES).filter(rule => RULES[rule](p));
        strength.querySelectorAll('[data-rule]').forEach(li => {
            const ok = passed.includes(li.dataset.rule);
            li.classList.toggle('ok', ok);
            li.querySelector('i').className = 'fas ' + (ok ? 'fa-check' : 'fa-circle');
        });

        let score = p ? passed.length : 0;
        if (!RULES.length(p)) score = Math.min(score, 1);
        if (p.length >= 14 && score >= 3) score = 4;

        strength.dataset.score = String(score);
        strengthText.textContent = p
            ? `Password strength: ${LABELS[score] || 'Weak'}`
            : 'Use 8+ characters with a mix of letters, numbers and symbols.';
        return { score, passed };
    }

    function validate() {
        const errors = [];
        const check = (input, message) => {
            ui.setFieldError(input, message);
            if (message) errors.push(input);
        };

        check(firstName, firstName.value.trim() ? '' : 'Enter your first name.');

        const e = email.value.trim();
        check(email, !e ? 'Enter your email address.' : (!ui.EMAIL_RE.test(e) ? 'That doesn\'t look like a valid email.' : ''));

        const { score } = scorePassword(password.value);
        let pwMsg = '';
        if (!password.value) pwMsg = 'Choose a password.';
        else if (!RULES.length(password.value)) pwMsg = 'Use at least 8 characters.';
        else if (score < 2) pwMsg = 'Add a number, symbol, or mixed case to make it stronger.';
        check(password, pwMsg);

        if (!terms.checked && !errors.length) {
            ui.showAlert('Please accept the terms to continue.');
            errors.push(terms);
        }
        return errors;
    }

    password.addEventListener('input', () => scorePassword(password.value));
    email.addEventListener('blur', () => {
        const e = email.value.trim();
        if (e) ui.setFieldError(email, ui.EMAIL_RE.test(e) ? '' : 'That doesn\'t look like a valid email.');
    });
    [firstName, lastName, email, password].forEach(input => input.addEventListener('input', () => {
        if (input.closest('.field').classList.contains('invalid')) ui.setFieldError(input, '');
        ui.hideAlert();
    }));
    terms.addEventListener('change', ui.hideAlert);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        ui.hideAlert();

        const errors = validate();
        if (errors.length) {
            errors[0].focus();
            return;
        }

        ui.setLoading(submit, true);
        try {
            const data = await ui.postJSON('/api/auth/signup', {
                firstName: firstName.value.trim(),
                lastName: lastName.value.trim(),
                email: email.value.trim(),
                password: password.value
            });
            window.session.save(data.token, data.user);
            try { localStorage.setItem('lastEmail', data.user.email); } catch (e) { /* storage blocked */ }
            ui.showAlert(`Welcome, ${data.user.firstName}! Setting up your dashboard…`, 'success');
            ui.enterApp(submit);
        } catch (error) {
            ui.setLoading(submit, false);
            if (error.status === 409) {
                ui.setFieldError(email, 'An account with this email already exists.');
                ui.showAlert('That email is already registered. Sign in instead?', 'info');
                const alert = document.getElementById('form-alert');
                const link = document.createElement('a');
                link.href = 'login.html';
                link.textContent = ' Go to sign in →';
                link.style.marginLeft = '4px';
                link.style.fontWeight = '600';
                alert.querySelector('span').appendChild(link);
                email.focus();
            } else {
                ui.showAlert(error.message);
            }
        }
    });
})();
