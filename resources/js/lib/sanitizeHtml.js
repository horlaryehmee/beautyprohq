import DOMPurify from 'dompurify';

const options = {
    ALLOWED_TAGS: [
        'a', 'b', 'blockquote', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'h4',
        'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'strong', 'table',
        'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
    ],
    ALLOWED_ATTR: ['alt', 'cite', 'class', 'href', 'rel', 'src', 'style', 'title'],
    ALLOW_DATA_ATTR: false,
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export default function sanitizeHtml(value) {
    const input = String(value ?? '');

    try {
        const purifier = DOMPurify?.sanitize
            ? DOMPurify
            : (typeof window !== 'undefined' ? window.DOMPurify : null);

        if (purifier?.sanitize) return purifier.sanitize(input, options);
    } catch (error) {
        if (typeof console !== 'undefined') console.warn('HTML sanitizer failed.', error);
    }

    return escapeHtml(input);
}
