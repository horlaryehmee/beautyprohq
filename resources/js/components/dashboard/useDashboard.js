import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiErrorMessage, apiRequest } from './api';

export function useApiResource(url, initialValue = null, options = {}) {
    const { enabled = true, params, transform, refreshInterval = 0 } = options;
    const [data, setData] = useState(initialValue);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState('');
    const mounted = useRef(true);
    const paramsKey = JSON.stringify(params ?? {});

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const load = useCallback(async (silent = false) => {
        if (!enabled || !url) {
            setLoading(false);
            return initialValue;
        }

        if (!silent) setLoading(true);
        setError('');
        try {
            const result = await apiRequest('get', url, undefined, { params });
            const next = transform ? transform(result) : result;
            if (mounted.current) setData(next ?? initialValue);
            return next;
        } catch (requestError) {
            if (mounted.current) setError(apiErrorMessage(requestError));
            return null;
        } finally {
            if (mounted.current) setLoading(false);
        }
    // paramsKey deliberately stabilizes a plain params object between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, url, paramsKey]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!enabled || !refreshInterval) return undefined;
        const timer = window.setInterval(() => load(true), refreshInterval);
        return () => window.clearInterval(timer);
    }, [enabled, load, refreshInterval]);

    return { data, setData, loading, error, reload: load };
}

export function useAsyncAction() {
    const [busyKey, setBusyKey] = useState(null);

    const run = useCallback(async (key, action) => {
        setBusyKey(key);
        try {
            return await action();
        } finally {
            setBusyKey(null);
        }
    }, []);

    return { run, busyKey, isBusy: (key) => busyKey === key };
}

export function useDebouncedValue(value, delay = 350) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [delay, value]);

    return debounced;
}

export function usePagination(items, pageSize = 8) {
    const [page, setPage] = useState(1);
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const safePage = Math.min(page, pageCount);
    const pagedItems = useMemo(
        () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
        [items, pageSize, safePage],
    );

    useEffect(() => setPage(1), [items.length]);

    return { page: safePage, setPage, pageCount, pagedItems };
}
