import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from '../components/ui/Icon';

const ToastContext = createContext({
    addToast: () => {},
    success: () => {},
    error: () => {},
});

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const counter = useRef(0);

    const removeToast = useCallback((id) => {
        setToasts((items) => items.filter((item) => item.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'success') => {
        const id = ++counter.current;
        setToasts((items) => [...items, { id, message, type }]);
        window.setTimeout(() => removeToast(id), 4500);
        return id;
    }, [removeToast]);

    const value = useMemo(() => ({
        addToast,
        success: (message) => addToast(message, 'success'),
        error: (message) => addToast(message, 'error'),
    }), [addToast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite">
                {toasts.map((toast) => (
                    <button
                        key={toast.id}
                        type="button"
                        className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-white/80 bg-white p-4 text-left shadow-[0_18px_45px_rgba(70,28,54,.16)]"
                        onClick={() => removeToast(toast.id)}
                    >
                        <span className={toast.type === 'error' ? 'toast-icon toast-icon-error' : 'toast-icon toast-icon-success'}>
                            <Icon name={toast.type === 'error' ? 'alert' : 'check'} size={16} />
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-semibold text-plum-950">{toast.message}</span>
                        <Icon name="x" size={16} className="mt-0.5 text-stone-400" />
                    </button>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
