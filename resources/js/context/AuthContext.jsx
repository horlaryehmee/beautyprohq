import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { ensureCsrfCookie, unwrap } from '../lib/api';

const AuthContext = createContext({
    user: null,
    loading: true,
    isAuthenticated: false,
    login: async () => {},
    register: async () => {},
    logout: async () => {},
    refreshUser: async () => {},
});

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const userRef = useRef(null);

    const rememberUser = useCallback((nextUser) => {
        userRef.current = nextUser;
        setUser(nextUser);
    }, []);

    const refreshUser = useCallback(async () => {
        const tokenAtStart = window.localStorage.getItem('bphq_auth_token');
        try {
            const response = await api.get('/auth/me');
            const payload = unwrap(response);
            const nextUser = payload?.user ?? payload;
            rememberUser(nextUser?.id ? nextUser : null);
            return nextUser;
        } catch (error) {
            if (error?.response?.status !== 401) throw error;
            const tokenNow = window.localStorage.getItem('bphq_auth_token');
            if (tokenAtStart !== tokenNow) {
                return userRef.current;
            }
            if (tokenAtStart) {
                window.localStorage.removeItem('bphq_auth_token');
            }
            rememberUser(null);
            return null;
        }
    }, [rememberUser]);

    useEffect(() => {
        refreshUser()
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, [refreshUser]);

    const login = useCallback(async (credentials) => {
        await ensureCsrfCookie();
        const response = await api.post('/auth/login', credentials);
        const payload = unwrap(response);
        const nextUser = payload?.user ?? payload;
        if (payload?.token) {
            window.localStorage.setItem('bphq_auth_token', payload.token);
        }
        rememberUser(nextUser);
        return nextUser;
    }, [rememberUser]);

    const register = useCallback(async (details) => {
        await ensureCsrfCookie();
        const response = await api.post('/auth/register', details);
        const payload = unwrap(response);
        const nextUser = payload?.user ?? payload;
        if (payload?.token) {
            window.localStorage.setItem('bphq_auth_token', payload.token);
        }
        rememberUser(nextUser);
        return nextUser;
    }, [rememberUser]);

    const logout = useCallback(async () => {
        try {
            await api.post('/auth/logout');
        } finally {
            window.localStorage.removeItem('bphq_auth_token');
            rememberUser(null);
        }
    }, [rememberUser]);

    const value = useMemo(() => ({
        user,
        loading,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
        refreshUser,
        setUser,
    }), [user, loading, login, register, logout, refreshUser]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}

export default AuthContext;
