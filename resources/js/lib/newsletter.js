export function hasNewsletterSubscription() {
    try { return localStorage.getItem('bphq-newsletter-subscribed') === '1'; } catch { return false; }
}

export function rememberNewsletterSubscription() {
    try { localStorage.setItem('bphq-newsletter-subscribed', '1'); } catch { /* Storage may be disabled. */ }
    window.dispatchEvent(new Event('bphq-newsletter-subscribed'));
}
