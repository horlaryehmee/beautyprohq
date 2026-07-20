import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

    const refreshUser = useCallback(async () => {
        try {
            const response = await api.get('/auth/me');
            const payload = unwrap(response);
            const nextUser = payload?.user ?? payload;
            setUser(nextUser?.id ? nextUser : null);
            return nextUser;
        } catch (error) {
            if (error?.response?.status !== 401) throw error;
            setUser(null);
            return null;
        }
    }, []);

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
        setUser(nextUser);
        return nextUser;
    }, []);

    const register = useCallback(async (details) => {
        await ensureCsrfCookie();
        const response = await api.post('/auth/register', details);
        const payload = unwrap(response);
        const nextUser = payload?.user ?? payload;
        setUser(nextUser);
        return nextUser;
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post('/auth/logout');
        } finally {
            setUser(null);
        }
    }, []);

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
