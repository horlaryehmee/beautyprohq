import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext({ notify: () => {} });

let toastSequence = 0;

export function DashboardToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const notify = useCallback((message, type = 'success') => {
        const id = ++toastSequence;
        setToasts((current) => [...current, { id, message, type }]);
        window.setTimeout(() => dismiss(id), 4200);
    }, [dismiss]);

    const value = useMemo(() => ({ notify }), [notify]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="pointer-events-none fixed inset-x-4 top-4 z-[80] flex flex-col items-end gap-2 sm:left-auto sm:w-96">
                {toasts.map((toast) => (
                    <button
                        className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium shadow-xl backdrop-blur transition ${
                            toast.type === 'error'
                                ? 'border-rose-200 bg-rose-50/95 text-rose-800'
                                : toast.type === 'info'
                                  ? 'border-sky-200 bg-sky-50/95 text-sky-800'
                                  : 'border-emerald-200 bg-emerald-50/95 text-emerald-800'
                        }`}
                        key={toast.id}
                        onClick={() => dismiss(toast.id)}
                        type="button"
                    >
                        <span className="mt-0.5 text-base">{toast.type === 'error' ? '!' : toast.type === 'info' ? 'i' : '✓'}</span>
                        <span className="flex-1">{toast.message}</span>
                        <span aria-hidden="true" className="text-current/50">×</span>
                    </button>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export const useDashboardToast = () => useContext(ToastContext);

