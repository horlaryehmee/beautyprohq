import api, { ensureCsrfCookie, unwrap } from './api';

let initialization;
let activeAttempt;

function loadGoogleIdentity() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = window.setTimeout(() => reject(new Error('Google sign-in took too long to load. Reload the page or use email and password.')), 15000);
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => {
            window.clearTimeout(timer);
            if (window.google?.accounts?.id) resolve(window.google.accounts.id);
            else reject(new Error('Google sign-in is unavailable. Use email and password.'));
        };
        script.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error('Google sign-in could not load. Use email and password.'));
        };
        document.head.appendChild(script);
    });
}

// GIS has page-wide configuration. Share one nonce and initialization across
// login, registration, and the two responsive booking buttons.
export function prepareGoogleIdentity() {
    if (!initialization) {
        initialization = (async () => {
            await ensureCsrfCookie();
            const [identity, response] = await Promise.all([
                loadGoogleIdentity(), api.post('/auth/google/popup/start'),
            ]);
            const { client_id: clientId, nonce } = unwrap(response);
            identity.initialize({
                client_id: clientId,
                nonce,
                ux_mode: 'popup',
                auto_select: false,
                callback: (result) => {
                    const attempt = activeAttempt;
                    activeAttempt = null;
                    if (attempt) attempt.complete(result);
                },
            });
            return identity;
        })();
    }
    return initialization;
}

export function selectGoogleAttempt(owner, complete) {
    activeAttempt = { owner, complete };
}

export function clearGoogleAttempt(owner) {
    if (activeAttempt?.owner === owner) activeAttempt = null;
}
