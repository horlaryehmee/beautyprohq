export function cn(...classes) {
    return classes.filter(Boolean).join(' ');
}

export function currency(value, code = 'NGN') {
    const amount = Number(value ?? 0);

    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: code || 'NGN',
        maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(Number.isFinite(amount) ? amount : 0);
}

export function shortDate(value, options = {}) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...options,
    }).format(date);
}

export function initials(name = '') {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'BP';
}

export function mediaUrl(value) {
    if (!value) return null;
    if (/^(https?:)?\/\//i.test(value) || /^(data|blob):/i.test(value) || String(value).startsWith('/')) return value;
    return `/storage/${String(value).replace(/^storage\//, '')}`;
}

export function providerIdentity(provider = {}) {
    const profile = provider.provider_profile ?? provider.profile ?? provider;
    const user = provider.user ?? profile.user ?? {};

    const country = profile.country ?? provider.country ?? '';
    const location = profile.location ?? provider.location ?? 'Location not added';

    return {
        raw: provider,
        profile,
        user,
        id: profile.id ?? provider.profile_id ?? provider.id,
        userId: user.id ?? profile.user_id ?? provider.user_id,
        slug: profile.slug ?? provider.slug ?? profile.id ?? provider.id,
        name: user.name ?? provider.name ?? profile.name ?? 'Beauty professional',
        profession: profile.profession ?? provider.profession ?? 'Beauty professional',
        location,
        country,
        cardLocation: country || location,
        bio: profile.bio ?? provider.bio ?? '',
        photo: mediaUrl(profile.profile_photo_url ?? profile.profile_photo ?? provider.profile_photo_url ?? provider.profile_photo),
        verified: Boolean(profile.verified ?? provider.verified),
        rating: Number(profile.rating ?? provider.rating ?? 0),
        reviewsCount: Number(profile.reviews_count ?? provider.reviews_count ?? provider.review_count ?? 0),
        services: provider.services ?? profile.services ?? [],
    };
}

export function safeUrl(value) {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    return `https://${value}`;
}

export function normalizeLinks(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value
            .map((item, index) => typeof item === 'string' ? { label: item, url: item } : {
                ...item,
                label: item?.label ?? item?.title ?? item?.name ?? `Link ${index + 1}`,
                url: item?.url ?? item?.link ?? item?.product_url,
            })
            .filter((item) => item?.url);
    }
    if (typeof value === 'object') {
        return Object.entries(value)
            .filter(([, url]) => Boolean(url))
            .map(([label, url]) => ({ label, url }));
    }
    return [];
}
