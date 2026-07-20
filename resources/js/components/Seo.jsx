import { useEffect } from 'react';

const defaultTitle = 'BeautyPro HQ';
const defaultDescription = 'Discover trusted beauty professionals, industry news, events, opportunities, and community stories across the beauty industry.';

function upsertMeta(selector, attributes) {
    let node = document.head.querySelector(selector);
    if (!node) {
        node = document.createElement('meta');
        document.head.appendChild(node);
    }
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
}

function upsertLink(rel, href) {
    let node = document.head.querySelector(`link[rel="${rel}"]`);
    if (!node) {
        node = document.createElement('link');
        node.setAttribute('rel', rel);
        document.head.appendChild(node);
    }
    node.setAttribute('href', href);
}

export default function Seo({ title, description = defaultDescription, image, type = 'website', canonical }) {
    useEffect(() => {
        const fullTitle = title && title !== defaultTitle ? `${title} | ${defaultTitle}` : defaultTitle;
        const url = canonical ?? window.location.href;

        document.title = fullTitle;
        upsertMeta('meta[name="description"]', { name: 'description', content: description });
        upsertMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle });
        upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
        upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
        upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
        upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' });
        upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle });
        upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
        upsertLink('canonical', url);

        if (image) {
            const absoluteImage = image.startsWith('http') ? image : `${window.location.origin}${image}`;
            upsertMeta('meta[property="og:image"]', { property: 'og:image', content: absoluteImage });
            upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: absoluteImage });
        }
    }, [canonical, description, image, title, type]);

    return null;
}
