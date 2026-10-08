/**
 * Session management - load this FIRST on every signed-in page.
 *
 * - Redirects to login when there is no valid, unexpired token
 * - Adds "Authorization: Bearer <token>" to every same-origin /api request
 * - Sends the user back to login when the API says the session is no longer valid
 * - Provides window.session and a global logout()
 */
(function () {
    const KEYS = ['authToken', 'isLoggedIn', 'userEmail', 'userName', 'userRole', 'isDemo', 'userId'];
    const PUBLIC_PAGES = ['', 'index', 'login', 'signup'];

    function decode(token) {
        try {
            const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(atob(payload));
        } catch (e) {
            return null;
        }
    }

    function getToken() {
        try { return localStorage.getItem('authToken'); } catch (e) { return null; }
    }

    function isValid() {
        const token = getToken();
        const claims = token && decode(token);
        // Treat tokens expiring in the next 30 seconds as already expired
        return !!(claims && claims.exp && claims.exp * 1000 > Date.now() + 30000);
    }

    function save(token, user) {
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email.split('@')[0];
        localStorage.setItem('authToken', token);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userName', name);
        localStorage.setItem('userRole', user.role || 'viewer');
        localStorage.setItem('isDemo', String(!!user.isDemo));
        localStorage.setItem('userId', user.id || '');
    }

    function clear() {
        KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } });
    }

    function goToLogin(reason) {
        const here = location.pathname.split('/').pop().replace('.html', '');
        const params = new URLSearchParams();
        if (reason) params.set('reason', reason);
        if (here && !PUBLIC_PAGES.includes(here)) params.set('next', here);
        const qs = params.toString();
        location.replace('login.html' + (qs ? '?' + qs : ''));
    }

    function logout() {
        const token = getToken();
        clear();
        if (window.firebase && firebase.apps && firebase.apps.length && firebase.auth) {
            try { firebase.auth().signOut(); } catch (e) { /* not signed in with Firebase */ }
        }
        if (token) {
            nativeFetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
        }
        location.href = 'login.html';
    }

    // Attach the token to API calls and react to expired sessions
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const isApi = url.startsWith('/api/') || url.startsWith(location.origin + '/api/');
        const isAuthCall = url.includes('/api/auth/');
        const token = getToken();

        if (!isApi || !token) return nativeFetch(input, init);

        init = Object.assign({}, init);
        const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
        if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
        init.headers = headers;

        return nativeFetch(input, init).then(res => {
            if (res.status === 401 && !isAuthCall) {
                clear();
                goToLogin('expired');
            }
            return res;
        });
    };

    function currentUser() {
        if (!isValid()) return null;
        return {
            email: localStorage.getItem('userEmail') || '',
            name: localStorage.getItem('userName') || 'User',
            role: localStorage.getItem('userRole') || 'viewer',
            isDemo: localStorage.getItem('isDemo') === 'true'
        };
    }

    function initials(name) {
        return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || 'U';
    }

    // Fill in common user placeholders used across pages
    function paintUser() {
        const user = currentUser();
        if (!user) return;
        document.querySelectorAll('#user-name, .user-name, #welcome-name').forEach(el => { el.textContent = user.name; });
        document.querySelectorAll('#user-email, .user-email').forEach(el => { el.textContent = user.email; });
        document.querySelectorAll('.user-avatar, #user-avatar').forEach(el => {
            if (!el.querySelector('img')) el.textContent = initials(user.name);
        });
        if (user.isDemo && !document.getElementById('demo-banner')) {
            const banner = document.createElement('div');
            banner.id = 'demo-banner';
            banner.setAttribute('role', 'status');
            banner.innerHTML = 'You\'re exploring the <strong>read-only demo</strong>. ' +
                '<a href="signup.html" onclick="session.clear()">Create a free account</a> to add patients and devices.';
            banner.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;' +
                'max-width:calc(100% - 32px);padding:10px 16px;border-radius:999px;font:500 13px/1.4 Inter,system-ui,sans-serif;' +
                'background:rgba(15,23,42,.92);color:#e2e8f0;border:1px solid rgba(56,189,248,.35);box-shadow:0 10px 30px rgba(0,0,0,.35);' +
                'backdrop-filter:blur(8px);text-align:center';
            banner.querySelector('a').style.cssText = 'color:#38bdf8;font-weight:600';
            document.body.appendChild(banner);
        }
    }

    window.session = { save, clear, isValid, getToken, currentUser, logout, goToLogin, decode };
    window.logout = logout;

    // Guard protected pages immediately, before page scripts start loading data
    const page = location.pathname.split('/').pop().replace('.html', '');
    if (!PUBLIC_PAGES.includes(page) && !isValid()) {
        const hadSession = !!getToken();
        clear();
        goToLogin(hadSession ? 'expired' : '');
        return;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', paintUser);
    } else {
        paintUser();
    }
})();
