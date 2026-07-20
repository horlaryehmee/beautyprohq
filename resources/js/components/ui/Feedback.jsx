import Icon from './Icon';
import { cn } from '../../lib/utils';

export function PageLoader({ label = 'Loading' }) {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center gap-4" role="status">
            <span className="loading-ring" />
            <p className="text-sm font-semibold text-stone-500">{label}</p>
        </div>
    );
}

export function InlineAlert({ children, tone = 'error', className }) {
    const isError = tone === 'error';
    return (
        <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium', isError ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-800', className)} role="alert">
            <Icon name={isError ? 'alert' : 'check'} size={17} className="mt-0.5" />
            <span>{children}</span>
        </div>
    );
}

export function EmptyState({ icon = 'content', title, message, action, compact = false }) {
    return (
        <div className={cn('rounded-3xl border border-dashed border-stone-200 bg-white text-center', compact ? 'p-6' : 'px-6 py-12')}>
            <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600"><Icon name={icon} /></span>
            <h3 className="font-display text-lg font-extrabold text-plum-950">{title}</h3>
            {message && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-stone-500">{message}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
