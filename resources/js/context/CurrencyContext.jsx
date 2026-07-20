import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../components/dashboard/api';

const fallback = {
    default: 'NGN',
    supported: [
        { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', rate: 1 },
        { code: 'USD', name: 'US Dollar', symbol: '$', rate: 0.00063 },
        { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.00047 },
        { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.00054 },
    ],
};

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
    const [config, setConfig] = useState(fallback);

    useEffect(() => {
        apiRequest('get', '/currencies')
            .then((data) => {
                if (data?.supported?.length) {
                    setConfig(data);
                }
            })
            .catch(() => {});
    }, []);

    const value = useMemo(() => {
        const supported = config.supported ?? fallback.supported;
        return { ...config, supported };
    }, [config]);

    return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
    return useContext(CurrencyContext) ?? {
        ...fallback,
        supported: fallback.supported,
    };
}
