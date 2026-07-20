import Icon from './Icon';

const statusStyles = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
    confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
    completed: 'bg-sky-50 text-sky-700 ring-sky-600/10',
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
    published: 'bg-violet-50 text-violet-700 ring-violet-600/10',
    pending: 'bg-amber-50 text-amber-700 ring-amber-600/10',
    processing: 'bg-amber-50 text-amber-700 ring-amber-600/10',
    draft: 'bg-slate-100 text-slate-600 ring-slate-500/10',
    cancelled: 'bg-rose-50 text-rose-700 ring-rose-600/10',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-600/10',
    suspended: 'bg-rose-50 text-rose-700 ring-rose-600/10',
    failed: 'bg-rose-50 text-rose-700 ring-rose-600/10',
    unread: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/10',
    featured: 'bg-amber-50 text-amber-700 ring-amber-600/10',
};

export const cx = (...values) => values.filter(Boolean).join(' ');

export function PageHeader({ eyebrow, title, description, actions }) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-600">{eyebrow}</p>}
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
                {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function Card({ children, className = '', padding = true, ...props }) {
    return <section className={cx('rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40', padding && 'p-5 sm:p-6', className)} {...props}>{children}</section>;
}

export function CardHeader({ title, description, action }) {
    return (
        <div className="mb-5 flex items-start justify-between gap-4">
            <div>
                <h2 className="font-bold text-slate-900">{title}</h2>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
            {action}
        </div>
    );
}

const statTones = {
    plum: 'bg-fuchsia-50 text-fuchsia-700',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
};

export function StatCard({ label, value, note, icon = 'analytics', tone = 'plum' }) {
    return (
        <Card className="min-w-0" padding={false}>
            <div className="flex items-start justify-between gap-4 p-5">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-500">{label}</p>
                    <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950">{value ?? '—'}</p>
                    {note && <p className="mt-1 truncate text-xs text-slate-400">{note}</p>}
                </div>
                <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', statTones[tone] ?? statTones.plum)}><Icon name={icon} /></span>
            </div>
        </Card>
    );
}

export function StatusBadge({ status = 'pending' }) {
    const key = String(status).toLowerCase();
    return <span className={cx('inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ring-1 ring-inset', statusStyles[key] ?? 'bg-slate-100 text-slate-600 ring-slate-500/10')}>{String(status).replaceAll('_', ' ')}</span>;
}

export function Button({ children, className = '', variant = 'primary', busy = false, disabled, ...props }) {
    const variants = {
        primary: 'bg-slate-950 text-white hover:bg-fuchsia-700 shadow-sm',
        secondary: 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
        soft: 'bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100',
        danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
    };

    return (
        <button
            className={cx('inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-50', variants[variant], className)}
            disabled={disabled || busy}
            {...props}
        >
            {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
            {children}
        </button>
    );
}

export function IconButton({ label, icon, className = '', ...props }) {
    return <button aria-label={label} className={cx('grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950', className)} title={label} type="button" {...props}><Icon name={icon} /></button>;
}

export function Field({ label, error, hint, className = '', children }) {
    return (
        <label className={cx('block', className)}>
            <span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>
            {children}
            {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
        </label>
    );
}

export const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100';

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
    return (
        <label className={cx('relative block', className)}>
            <Icon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" name="search" />
            <input className={cx(inputClass, 'pl-10')} onChange={onChange} placeholder={placeholder} type="search" value={value} />
        </label>
    );
}

export function EmptyState({ title, description, action, icon = 'content' }) {
    return (
        <div className="grid min-h-56 place-items-center px-5 py-10 text-center">
            <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Icon name={icon} /></span>
                <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
                {description && <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>}
                {action && <div className="mt-4">{action}</div>}
            </div>
        </div>
    );
}

export function LoadingBlock({ rows = 3 }) {
    return (
        <div aria-label="Loading" className="animate-pulse space-y-3 py-2">
            {Array.from({ length: rows }).map((_, index) => <div className="h-14 rounded-2xl bg-slate-100" key={index} />)}
        </div>
    );
}

export function ErrorState({ message, onRetry }) {
    return (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p>{message}</p>
                {onRetry && <Button onClick={onRetry} type="button" variant="danger">Try again</Button>}
            </div>
        </div>
    );
}

export function Avatar({ name = 'BeautyPro', src, size = 'md' }) {
    const sizes = { sm: 'size-9 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-lg' };
    const safeName = String(name || 'BeautyPro');
    const initials = safeName.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
    return src
        ? <img alt={safeName} className={cx('shrink-0 rounded-2xl object-cover', sizes[size])} src={src} />
        : <span className={cx('grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-100 to-rose-100 font-bold text-fuchsia-800', sizes[size])}>{initials}</span>;
}

export function Currency({ value, currency = 'NGN' }) {
    const amount = Number(value ?? 0);
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDate(value, options = {}) {
    if (!value) return 'Not set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(date);
}

export function Pagination({ page, pageCount, onPageChange }) {
    if (pageCount <= 1) return null;
    const currentPage = Number(page) || 1;
    const totalPages = Number(pageCount) || 1;
    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

    return (
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-slate-500">Page {currentPage} of {totalPages}</span>
            <div className="flex flex-wrap gap-2">
                <Button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} type="button" variant="secondary">Previous</Button>
                {start > 1 && (
                    <>
                        <button className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50" onClick={() => onPageChange(1)} type="button">1</button>
                        {start > 2 && <span className="grid min-h-10 place-items-center px-1 text-slate-400">...</span>}
                    </>
                )}
                {pages.map((item) => (
                    <button
                        className={`min-h-10 rounded-xl px-3 text-sm font-bold transition ${item === currentPage ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                        key={item}
                        onClick={() => onPageChange(item)}
                        type="button"
                    >
                        {item}
                    </button>
                ))}
                {end < totalPages && (
                    <>
                        {end < totalPages - 1 && <span className="grid min-h-10 place-items-center px-1 text-slate-400">...</span>}
                        <button className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50" onClick={() => onPageChange(totalPages)} type="button">{totalPages}</button>
                    </>
                )}
                <Button disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} type="button" variant="secondary">Next</Button>
            </div>
        </div>
    );
}
