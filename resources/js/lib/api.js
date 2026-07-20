import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    withCredentials: true,
    withXSRFToken: true,
    headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    },
});

api.interceptors.request.use((config) => {
    const token = window.localStorage.getItem('bphq_auth_token');

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

export async function ensureCsrfCookie() {
    await axios.get('/sanctum/csrf-cookie', {
        withCredentials: true,
        headers: { Accept: 'application/json' },
    });
}

export function unwrap(response) {
    return response?.data?.data ?? response?.data ?? response;
}

export function collectionFrom(response) {
    const payload = response?.data?.data ?? response?.data ?? [];

    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;

    return [];
}

export function metaFrom(response) {
    const body = response?.data ?? {};
    const payload = body?.data ?? {};

    return body.meta ?? payload.meta ?? {
        current_page: payload.current_page,
        last_page: payload.last_page,
        total: payload.total,
        per_page: payload.per_page,
    };
}

export function apiError(error, fallback = 'Something went wrong. Please try again.') {
    const response = error?.response?.data;
    const validation = response?.errors;

    if (validation && typeof validation === 'object') {
        return {
            message: response.message || 'Please check the highlighted fields.',
            fields: Object.fromEntries(
                Object.entries(validation).map(([key, value]) => [
                    key,
                    Array.isArray(value) ? value[0] : value,
                ]),
            ),
        };
    }

    return {
        message: response?.message || error?.message || fallback,
        fields: {},
    };
}

export default api;
