import DOMPurify from 'dompurify';

const options = {
    ALLOWED_TAGS: [
        'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
        'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p', 'pre', 'strong', 'u', 'ul',
    ],
    ALLOWED_ATTR: ['cite', 'href', 'rel', 'title'],
    ALLOW_DATA_ATTR: false,
};

export default function sanitizeHtml(value) {
    return DOMPurify.sanitize(String(value ?? ''), options);
}
