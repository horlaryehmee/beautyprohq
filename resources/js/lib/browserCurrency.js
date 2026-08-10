const countryCurrency = {
    NG: 'NGN',
    US: 'USD',
    GB: 'GBP',
    IE: 'EUR',
    FR: 'EUR',
    DE: 'EUR',
    ES: 'EUR',
    IT: 'EUR',
    NL: 'EUR',
    BE: 'EUR',
    PT: 'EUR',
    AT: 'EUR',
    FI: 'EUR',
    GR: 'EUR',
    LU: 'EUR',
};

const timezoneCurrency = {
    'Africa/Lagos': 'NGN',
    'America/New_York': 'USD',
    'America/Chicago': 'USD',
    'America/Denver': 'USD',
    'America/Los_Angeles': 'USD',
    'Europe/London': 'GBP',
    'Europe/Dublin': 'EUR',
    'Europe/Paris': 'EUR',
    'Europe/Berlin': 'EUR',
    'Europe/Madrid': 'EUR',
    'Europe/Rome': 'EUR',
    'Europe/Amsterdam': 'EUR',
};

const supported = new Set(['NGN', 'USD', 'EUR', 'GBP']);
const ipCurrencyKey = 'bphq_ip_currency';
const ipCountryKey = 'bphq_ip_country';

function storedCurrency() {
    try {
        const currency = sessionStorage.getItem(ipCurrencyKey);
        return supported.has(currency) ? currency : '';
    } catch {
        return '';
    }
}

function storedCountry() {
    try {
        return String(sessionStorage.getItem(ipCountryKey) || '').toUpperCase();
    } catch {
        return '';
    }
}

export function browserTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
        return '';
    }
}

export function browserCurrency(fallback = 'NGN') {
    const ipCurrency = storedCurrency();
    if (ipCurrency) return ipCurrency;

    const timezone = browserTimezone();
    const timezoneMatch = timezoneCurrency[timezone];
    if (supported.has(timezoneMatch)) return timezoneMatch;

    const languages = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
    for (const language of languages) {
        const country = String(language ?? '').match(/[-_]([A-Z]{2})$/i)?.[1]?.toUpperCase();
        const currency = countryCurrency[country];
        if (supported.has(currency)) return currency;
    }

    return fallback;
}

export async function detectIpCurrency() {
    if (typeof fetch !== 'function') return '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
        const response = await fetch('https://ipapi.co/json/', {
            cache: 'no-store',
            credentials: 'omit',
            signal: controller.signal,
        });
        if (!response.ok) return '';

        const data = await response.json();
        const country = String(data?.country_code || data?.country || '').toUpperCase();
        const currency = supported.has(String(data?.currency || '').toUpperCase())
            ? String(data.currency).toUpperCase()
            : countryCurrency[country];

        if (!supported.has(currency)) return '';

        try {
            sessionStorage.setItem(ipCurrencyKey, currency);
            if (country) sessionStorage.setItem(ipCountryKey, country);
        } catch {
            // Session storage can be disabled in private browsing; the current request can still use the fallback.
        }

        return currency;
    } catch {
        return '';
    } finally {
        clearTimeout(timeout);
    }
}

export function browserCurrencyHeaders() {
    const country = storedCountry();
    const currency = storedCurrency();

    return {
        'X-BPHQ-Timezone': browserTimezone(),
        ...(country ? { 'X-BPHQ-Country': country } : {}),
        ...(currency ? { 'X-BPHQ-Currency': currency } : {}),
    };
}
