import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    EmptyState,
    ErrorState,
    IconButton,
    LoadingBlock,
    PageHeader,
    Pagination,
    SearchInput,
    StatCard,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    formatDate,
    inputClass,
    useApiResource,
    useDashboardToast,
    useDebouncedValue,
} from '../../components/dashboard';

const SORT_FIELDS = [
    { value: 'subscribed_at', label: 'Date joined' },
    { value: 'name', label: 'Name' },
    { value: 'email', label: 'Email' },
];

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

export default function AdminWaitlistPage() {
    const [query, setQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortBy, setSortBy] = useState('subscribed_at');
    const [sortDir, setSortDir] = useState('desc');
    const [perPage, setPerPage] = useState(20);
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', email: '', status: 'active' });
    const [saving, setSaving] = useState(false);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

    const search = useDebouncedValue(query);
    const { notify } = useDashboardToast();

    const hasFilters = Boolean(search || dateFrom || dateTo || sortBy !== 'subscribed_at' || sortDir !== 'desc' || perPage !== 20);
    const activeFilterCount = [search, dateFrom, dateTo, sortBy !== 'subscribed_at' ? 'sort' : '', sortDir !== 'desc' ? 'dir' : '', perPage !== 20 ? 'rows' : ''].filter(Boolean).length;

    const resource = useApiResource('/admin/waitlist', {}, {
        params: {
            search: search || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            sort: sortBy || undefined,
            direction: sortDir || undefined,
            per_page: perPage,
            page,
        },
    });
    const { reload } = resource;

    const subscribers = resource.data?.subscribers ?? [];
    const stats = resource.data?.stats ?? {};
    const meta = resource.data?.pagination ?? resource.data?.meta ?? {};
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? page);
    const total = Number(meta.total ?? 0);

    const rows = useMemo(() => subscribers.map((subscriber) => ({
        ...subscriber,
        status: subscriber.unsubscribed_at ? 'unsubscribed' : 'active',
    })), [subscribers]);

    const resetFilters = () => {
        setQuery('');
        setDateFrom('');
        setDateTo('');
        setSortBy('subscribed_at');
        setSortDir('desc');
        setPerPage(20);
        setPage(1);
        setMobileFiltersOpen(false);
    };

    useEffect(() => {
        setPage(1);
    }, [search, dateFrom, dateTo, sortBy, sortDir, perPage]);

    const toggleSortDir = () => {
        setPage(1);
        setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    };

    const filterFields = (
        <div className="space-y-3">
            <SearchInput onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" value={query} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Joined from</span>
                    <input aria-label="Joined from" className={inputClass} onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Joined to</span>
                    <input aria-label="Joined to" className={inputClass} onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Sort by</span>
                    <select aria-label="Sort by" className={inputClass} onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
                        {SORT_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Order</span>
                    <Button aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'} className="w-full" onClick={toggleSortDir} type="button" variant="secondary">
                        <span className="inline-flex items-center justify-center gap-2">
                            {sortDir === 'asc' ? <span aria-hidden="true">&#8593;</span> : <span aria-hidden="true">&#8595;</span>}
                            {sortDir === 'asc' ? 'Ascending' : 'Descending'}
                        </span>
                    </Button>
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Rows per page</span>
                    <select aria-label="Rows per page" className={inputClass} onChange={(event) => setPerPage(Number(event.target.value))} value={perPage}>
                        {PER_PAGE_OPTIONS.map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                </label>
            </div>
        </div>
    );

    const exportSubscribers = async () => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        if (sortBy) params.set('sort', sortBy);
        if (sortDir) params.set('direction', sortDir);
        const response = await fetch(`/api/admin/waitlist/export?${params.toString()}`, {
            credentials: 'include',
            headers: {
                Accept: 'text/csv',
            },
        });

        if (!response.ok) return;

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `beautyprohq-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const editSubscriber = (subscriber) => {
        setEditing(subscriber);
        setForm({
            name: subscriber.name ?? '',
            email: subscriber.email ?? '',
            status: subscriber.unsubscribed_at ? 'unsubscribed' : 'active',
        });
    };

    const saveSubscriber = async (event) => {
        event.preventDefault();
        if (!editing) return;
        setSaving(true);
        try {
            const updated = await apiRequest('patch', `/admin/subscribers/${editing.id}`, form);
            resource.setData((current) => ({
                ...current,
                subscribers: updated
                    ? (current?.subscribers ?? []).map((subscriber) => subscriber.id === updated.id ? updated : subscriber)
                    : (current?.subscribers ?? []).filter((subscriber) => subscriber.id !== editing.id),
            }));
            setEditing(null);
            resource.reload(true);
            notify('Subscriber updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const deleteSubscriber = async (subscriber) => {
        if (!window.confirm(`Delete ${subscriber.email} from subscribers? This removes the email completely.`)) return;

        try {
            await apiRequest('delete', `/admin/subscribers/${subscriber.id}`);
            resource.setData((current) => ({
                ...current,
                subscribers: (current?.subscribers ?? []).filter((entry) => entry.id !== subscriber.id),
            }));
            resource.reload(true);
            notify('Subscriber deleted.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={(
                    <>
                        <Button className="md:hidden" onClick={() => setMobileFiltersOpen(true)} type="button" variant="secondary">
                            {hasFilters ? `Filter (${activeFilterCount})` : 'Filter'}
                        </Button>
                        <Button onClick={exportSubscribers} type="button" variant="secondary">Export CSV</Button>
                    </>
                )}
                description="Names and emails collected from newsletter and coming soon signup forms."
                eyebrow="Audience"
                title="Subscribers"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon="bell" label="Total subscribers" value={stats.total ?? 0} />
                <StatCard icon="users" label="Active" tone="emerald" value={stats.active ?? 0} />
                <StatCard icon="analytics" label="Today" tone="sky" value={stats.today ?? 0} />
                <StatCard icon="bell" label="Unsubscribed" tone="amber" value={stats.unsubscribed ?? 0} />
            </div>

            {mobileFiltersOpen && (
                <div className="fixed inset-0 z-[120] md:hidden">
                    <button aria-label="Close filters" className="absolute inset-0 bg-slate-950/45" onClick={() => setMobileFiltersOpen(false)} type="button" />
                    <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-bphq-coffee">Subscribers</p>
                                <h2 className="mt-1 text-xl font-bold text-slate-950">Filters</h2>
                            </div>
                            <IconButton icon="close" label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
                        </div>
                        {filterFields}
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <Button onClick={resetFilters} type="button" variant="ghost">Clear</Button>
                            <Button onClick={() => setMobileFiltersOpen(false)} type="button">Apply</Button>
                        </div>
                    </div>
                </div>
            )}

            <Card>
                <div className="hidden md:block">
                    <div className="mb-5">{filterFields}</div>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <p className="text-xs font-semibold text-slate-400">
                            {total} subscriber{total === 1 ? '' : 's'}
                            {hasFilters ? ' matching filters' : ''}
                        </p>
                        {hasFilters && (
                            <Button onClick={resetFilters} type="button" variant="secondary">Clear filters</Button>
                        )}
                    </div>
                </div>

                {resource.loading ? <LoadingBlock rows={8} /> : rows.length ? (
                    <>
                        <div className="overflow-hidden rounded-2xl border border-slate-100">
                            {rows.map((subscriber) => (
                                <article className="flex flex-col gap-3 border-b border-slate-100 p-4 last:border-0 lg:flex-row lg:items-center lg:justify-between" key={subscriber.id}>
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-slate-950">{subscriber.name ?? 'Newsletter subscriber'}</p>
                                        <p className="mt-1 truncate text-xs font-semibold text-slate-400">{subscriber.email} - Joined {formatDate(subscriber.subscribed_at)}</p>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                                        <StatusBadge status={subscriber.status} />
                                        <p className="text-xs font-semibold text-slate-400">
                                            {subscriber.unsubscribed_at ? `Left ${formatDate(subscriber.unsubscribed_at)}` : 'Receiving updates'}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Button onClick={() => editSubscriber(subscriber)} type="button" variant="secondary">Edit</Button>
                                            <Button onClick={() => deleteSubscriber(subscriber)} type="button" variant="danger">Delete</Button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
                    </>
                ) : (
                    <EmptyState
                        description={hasFilters ? 'No subscribers match these filters yet.' : 'No subscribers have joined yet.'}
                        icon="bell"
                        title="No subscribers found"
                    />
                )}
            </Card>

            {editing && (
                <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setEditing(null)}>
                    <Card className="w-full max-w-xl rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="text-lg font-bold text-slate-950">Edit subscriber</h2>
                        <form className="mt-5 space-y-4" onSubmit={saveSubscriber}>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-bold text-slate-700">Name</span>
                                <input className={inputClass} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-bold text-slate-700">Email</span>
                                <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required type="email" value={form.email} />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-bold text-slate-700">Status</span>
                                <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}>
                                    <option value="active">Active</option>
                                    <option value="unsubscribed">Unsubscribed</option>
                                </select>
                            </label>
                            <div className="flex justify-end gap-2">
                                <Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancel</Button>
                                <Button busy={saving} type="submit">Save subscriber</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
