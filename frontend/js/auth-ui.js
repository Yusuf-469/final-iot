/**
 * Shared UI for the sign-in and sign-up pages:
 * live ECG showcase, form helpers, social sign-in, demo access and redirects.
 * Depends on js/session.js (window.session) and optionally js/auth.js (window.auth).
 */
(function () {
    const SAFE_NEXT = ['dashboard', 'patients', 'alerts', 'devices', 'analytics', 'settings', 'dr-ai'];
    const params = new URLSearchParams(location.search);

    // ------------------------------------------------------------------
    // Redirects
    // ------------------------------------------------------------------

    function destination() {
        const next = params.get('next');
        return (SAFE_NEXT.includes(next) ? next : 'dashboard') + '.html';
    }

    function enterApp(button) {
        if (button) {
            button.classList.remove('loading');
            button.classList.add('done');
            const label = button.querySelector('.label');
            if (label) label.innerHTML = '<i class="fas fa-check"></i>&nbsp; Signed in';
        }
        const card = document.querySelector('.auth-card');
        setTimeout(() => card && card.classList.add('leaving'), 350);
        setTimeout(() => location.replace(destination()), 750);
    }

    // Already signed in? Go straight to the app.
    if (window.session && window.session.isValid()) {
        location.replace(destination());
        return;
    }

    // ------------------------------------------------------------------
    // Form helpers
    // ------------------------------------------------------------------

    function showAlert(message, type) {
        const el = document.getElementById('form-alert');
        if (!el) return;
        const icon = { error: 'fa-circle-exclamation', info: 'fa-circle-info', success: 'fa-circle-check' }[type || 'error'];
        el.className = 'form-alert ' + (type || 'error');
        el.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i><span></span>';
        el.querySelector('span').textContent = message;
        void el.offsetWidth; // restart animation
        el.classList.add('show');
    }

    function hideAlert() {
        const el = document.getElementById('form-alert');
        if (el) el.className = 'form-alert';
    }

    function setLoading(button, loading) {
        if (!button) return;
        button.classList.toggle('loading', loading);
        button.disabled = loading;
        button.setAttribute('aria-busy', String(loading));
    }

    function setFieldError(input, message) {
        const field = input.closest('.field');
        if (!field) return;
        field.classList.toggle('invalid', !!message);
        field.classList.toggle('valid', !message && input.value.length > 0);
        input.setAttribute('aria-invalid', String(!!message));
        const msg = field.querySelector('.field-msg');
        if (msg) msg.textContent = message || '';
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    async function postJSON(url, body) {
        let res;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {})
            });
        } catch (e) {
            throw new Error('Can\'t reach the server. Check your connection and try again.');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            const fallback = res.status >= 500 ? 'The server had a problem. Please try again in a moment.' : 'Request failed.';
            const error = new Error(data.error || fallback);
            error.status = res.status;
            throw error;
        }
        return data;
    }

    function initPasswordToggles() {
        document.querySelectorAll('.toggle-visibility').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById(btn.dataset.target);
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
                btn.setAttribute('aria-pressed', String(show));
                btn.innerHTML = '<i class="fas ' + (show ? 'fa-eye-slash' : 'fa-eye') + '" aria-hidden="true"></i>';
                input.focus();
            });
        });

        document.querySelectorAll('input[type="password"]').forEach(input => {
            const warn = document.getElementById(input.id + '-caps');
            if (!warn) return;
            const check = (e) => warn.classList.toggle('show', !!(e.getModifierState && e.getModifierState('CapsLock')));
            input.addEventListener('keyup', check);
            input.addEventListener('keydown', check);
            input.addEventListener('blur', () => warn.classList.remove('show'));
        });
    }

    function initSocial() {
        document.querySelectorAll('[data-provider]').forEach(btn => {
            btn.addEventListener('click', async () => {
                hideAlert();
                if (!window.auth || !window.auth.signIn) {
                    showAlert('Social sign-in is unavailable right now. Please use email and password.');
                    return;
                }
                document.querySelectorAll('[data-provider]').forEach(b => { b.disabled = true; });
                try {
                    await window.auth.signIn(btn.dataset.provider);
                    showAlert('Signed in. Taking you to your dashboard…', 'success');
                    enterApp();
                } catch (error) {
                    showAlert(error.message);
                    document.querySelectorAll('[data-provider]').forEach(b => { b.disabled = false; });
                }
            });
        });
    }

    function initDemo() {
        const btn = document.getElementById('demo-btn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            hideAlert();
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Opening demo…';
            try {
                const data = await postJSON('/api/auth/demo');
                window.session.save(data.token, data.user);
                enterApp();
            } catch (error) {
                showAlert(error.message);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i> Explore the live demo';
            }
        });
    }

    function initReasonBanner() {
        const reason = params.get('reason');
        if (reason === 'expired') showAlert('Your session expired. Please sign in again.', 'info');
        if (reason === 'registered') showAlert('Account created. Please sign in.', 'success');
    }

    // ------------------------------------------------------------------
    // Showcase: live ECG trace + vitals
    // ------------------------------------------------------------------

    function initShowcase() {
        const canvas = document.getElementById('ecg');
        if (!canvas || getComputedStyle(canvas.closest('.showcase')).display === 'none') return;

        const ctx = canvas.getContext('2d');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let width = 0, height = 0, dpr = 1;
        let points = [];
        let x = 0;
        let bpm = 72;
        let phase = 0;

        function resize() {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            const rect = canvas.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            points = new Array(Math.ceil(width)).fill(null);
            x = 0;
        }

        // One heartbeat as a function of phase 0..1 (P wave, QRS complex, T wave)
        function beat(p) {
            const g = (c, w, a) => a * Math.exp(-Math.pow((p - c) / w, 2));
            return g(0.18, 0.035, 0.12) + g(0.38, 0.012, -0.15) + g(0.41, 0.014, 1.0) +
                g(0.44, 0.012, -0.28) + g(0.68, 0.06, 0.24);
        }

        const SPEED = 1.6; // px per frame
        function step() {
            const pxPerBeat = (60 / bpm) * 60 * SPEED;
            for (let i = 0; i < SPEED; i++) {
                phase += 1 / pxPerBeat;
                if (phase >= 1) phase -= 1;
                const noise = (Math.random() - 0.5) * 0.015;
                points[x] = height * 0.62 - (beat(phase) + noise) * height * 0.48;
                x = (x + 1) % points.length;
            }
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.shadowColor = 'rgba(52, 211, 153, 0.6)';
            ctx.shadowBlur = 8;

            // Draw the trace, fading toward the oldest samples, with a gap ahead of the cursor
            const gap = 18;
            for (let i = 1; i < points.length; i++) {
                const age = (x - i + points.length) % points.length;
                if (age < gap || points[i] == null || points[i - 1] == null) continue;
                const alpha = Math.max(0.08, 1 - age / points.length);
                ctx.strokeStyle = 'rgba(52, 211, 153, ' + alpha.toFixed(3) + ')';
                ctx.beginPath();
                ctx.moveTo(i - 1, points[i - 1]);
                ctx.lineTo(i, points[i]);
                ctx.stroke();
            }

            // Leading dot
            const head = (x - 1 + points.length) % points.length;
            if (points[head] != null) {
                ctx.shadowBlur = 14;
                ctx.fillStyle = '#a7f3d0';
                ctx.beginPath();
                ctx.arc(head, points[head], 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
        }

        function frame() {
            step();
            draw();
            requestAnimationFrame(frame);
        }

        resize();
        window.addEventListener('resize', resize);
        if (reduceMotion) {
            for (let i = 0; i < points.length; i++) step();
            draw();
        } else {
            requestAnimationFrame(frame);
        }

        // Gently drifting vitals
        const hrEl = document.getElementById('v-hr');
        const spo2El = document.getElementById('v-spo2');
        const tempEl = document.getElementById('v-temp');
        let spo2 = 98, temp = 36.7;
        setInterval(() => {
            bpm = Math.round(Math.min(84, Math.max(64, bpm + (Math.random() - 0.5) * 4)));
            spo2 = Math.round(Math.min(99, Math.max(96, spo2 + (Math.random() - 0.5) * 1.4)));
            temp = Math.min(37.1, Math.max(36.4, temp + (Math.random() - 0.5) * 0.1));
            if (hrEl) hrEl.textContent = bpm;
            if (spo2El) spo2El.textContent = spo2;
            if (tempEl) tempEl.textContent = temp.toFixed(1);
        }, 2000);
    }

    document.addEventListener('DOMContentLoaded', () => {
        initPasswordToggles();
        initSocial();
        initDemo();
        initReasonBanner();
        initShowcase();
    });

    window.authUI = { showAlert, hideAlert, setLoading, setFieldError, postJSON, enterApp, EMAIL_RE };
})();
