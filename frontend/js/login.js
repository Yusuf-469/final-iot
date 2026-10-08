/**
 * Sign-in page
 * Email + password login against POST /api/auth/login.
 * Shared helpers (alerts, loading state, social sign-in, demo) come from js/auth-ui.js.
 */
(function () {
    const ui = window.authUI;
    if (!ui) return; // auth-ui.js is redirecting an already signed-in user

    const form = document.getElementById('login-form');
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const submit = document.getElementById('submit-btn');

    // Remember the last email used on this device
    try {
        const last = localStorage.getItem('lastEmail');
        if (last) {
            email.value = last;
            password.focus();
        } else {
            email.focus();
        }
    } catch (e) { email.focus(); }

    function validate() {
        let ok = true;
        const value = email.value.trim();
        if (!value) {
            ui.setFieldError(email, 'Enter your email address.');
            ok = false;
        } else if (!ui.EMAIL_RE.test(value)) {
            ui.setFieldError(email, 'That doesn\'t look like a valid email.');
            ok = false;
        } else {
            ui.setFieldError(email, '');
        }

        if (!password.value) {
            ui.setFieldError(password, 'Enter your password.');
            ok = false;
        } else {
            ui.setFieldError(password, '');
        }
        return ok;
    }

    email.addEventListener('blur', () => { if (email.value) validate(); });
    [email, password].forEach(input => input.addEventListener('input', () => {
        if (input.closest('.field').classList.contains('invalid')) ui.setFieldError(input, '');
        ui.hideAlert();
    }));

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        ui.hideAlert();
        if (!validate()) {
            form.querySelector('[aria-invalid="true"]').focus();
            return;
        }

        ui.setLoading(submit, true);
        try {
            const data = await ui.postJSON('/api/auth/login', {
                email: email.value.trim(),
                password: password.value
            });
            window.session.save(data.token, data.user);
            try { localStorage.setItem('lastEmail', data.user.email); } catch (e) { /* storage blocked */ }
            ui.enterApp(submit);
        } catch (error) {
            ui.setLoading(submit, false);
            ui.showAlert(error.message);
            if (error.status === 401) {
                password.value = '';
                password.focus();
            }
        }
    });
})();
