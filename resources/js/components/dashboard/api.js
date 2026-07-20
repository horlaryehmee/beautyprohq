import axios from 'axios';

export const dashboardApi = axios.create({
    baseURL: '/api',
    withCredentials: true,
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    },
});

dashboardApi.interceptors.response.use(
    (response) => response,
    (error) => {
        const protectedRoots = ['/provider', '/customer', '/admin'];
        if (error.response?.status === 401 && protectedRoots.some((root) => window.location.pathname.startsWith(root))) {
            window.dispatchEvent(new CustomEvent('bphq:unauthenticated'));
        }

        return Promise.reject(error);
    },
);

export const unwrap = (response) => {
    const payload = response?.data;
    if (payload?.meta && Array.isArray(payload.data)) {
        return { data: payload.data, meta: payload.meta };
    }
    return payload?.data ?? payload ?? null;
};

export function apiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
    const payload = error?.response?.data;
    const validationMessage = payload?.errors
        ? Object.values(payload.errors).flat().find(Boolean)
        : null;

    return validationMessage || payload?.message || error?.message || fallback;
}

export async function apiRequest(method, url, data, config = {}) {
    const response = await dashboardApi.request({ method, url, data, ...config });
    return unwrap(response);
}

export async function ensureSanctumCookie() {
    await axios.get('/sanctum/csrf-cookie', { withCredentials: true });
}
