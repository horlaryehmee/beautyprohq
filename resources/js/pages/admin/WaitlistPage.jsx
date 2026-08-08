import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    EmptyState,
    ErrorState,
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
} from '../../components/dashboard';

export default function AdminWaitlistPage() {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', email: '', status: 'active' });
    const [saving, setSaving] = useState(false);
    const resource = useApiResource('/admin/waitlist', {}, { params: { search: query, page, per_page: 20 } });
    const { notify } = useDashboardToast();
    const subscribers = resource.data?.subscribers ?? [];
    const stats = resource.data?.stats ?? {};
    const meta = resource.data?.pagination ?? resource.data?.meta ?? {};
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? page);

    const rows = useMemo(() => subscribers.map((subscriber) => ({
        ...subscriber,
        status: subscriber.unsubscribed_at ? 'unsubscribed' : 'active',
    })), [subscribers]);

    const exportSubscribers = async () => {
        const params = new URLSearchParams();
        if (query) params.set('search', query);
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
                subscribers: (current?.subscribers ?? []).map((subscriber) => subscriber.id === updated.id ? updated : subscriber),
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

    useEffect(() => {
        setPage(1);
    }, [query]);

    return (
        <div className="space-y-6">
            <PageHeader
                description="Names and emails collected from newsletter and coming soon signup forms."
                eyebrow="Audience"
                actions={<Button onClick={exportSubscribers} type="button" variant="secondary">Export CSV</Button>}
                title="Subscribers"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon="bell" label="Total subscribers" value={stats.total ?? 0} />
                <StatCard icon="users" label="Active" tone="emerald" value={stats.active ?? 0} />
                <StatCard icon="analytics" label="Today" tone="sky" value={stats.today ?? 0} />
                <StatCard icon="bell" label="Unsubscribed" tone="amber" value={stats.unsubscribed ?? 0} />
            </div>

            <Card>
                <SearchInput className="mb-5" onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" value={query} />
                {resource.loading ? <LoadingBlock rows={8} /> : rows.length ? (
                    <>
                        <div className="overflow-hidden rounded-2xl border border-slate-100">
                            {rows.map((subscriber) => (
                                <article className="grid gap-3 border-b border-slate-100 p-4 last:border-0 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center" key={subscriber.id}>
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-slate-950">{subscriber.name ?? 'Newsletter subscriber'}</p>
                                        <p className="mt-1 truncate text-xs font-semibold text-slate-400">{subscriber.email} - Joined {formatDate(subscriber.subscribed_at)}</p>
                                    </div>
                                    <StatusBadge status={subscriber.status} />
                                    <p className="text-xs font-semibold text-slate-400">
                                        {subscriber.unsubscribed_at ? `Left ${formatDate(subscriber.unsubscribed_at)}` : 'Receiving updates'}
                                    </p>
                                    <Button onClick={() => editSubscriber(subscriber)} type="button" variant="secondary">Edit</Button>
                                </article>
                            ))}
                        </div>
                        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
                    </>
                ) : (
                    <EmptyState description="No subscribers match this search yet." icon="bell" title="No subscribers found" />
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
