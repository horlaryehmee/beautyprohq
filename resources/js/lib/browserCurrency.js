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

export function browserTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
        return '';
    }
}

export function browserCurrency(fallback = 'NGN') {
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

export function browserCurrencyHeaders() {
    return {
        'X-BPHQ-Currency': browserCurrency(),
        'X-BPHQ-Timezone': browserTimezone(),
    };
}
