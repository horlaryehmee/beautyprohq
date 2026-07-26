import { useEffect, useMemo, useState } from 'react';
import {
    Card,
    EmptyState,
    ErrorState,
    LoadingBlock,
    PageHeader,
    Pagination,
    SearchInput,
    StatCard,
    StatusBadge,
    formatDate,
    useApiResource,
} from '../../components/dashboard';

export default function AdminWaitlistPage() {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const resource = useApiResource('/admin/waitlist', {}, { params: { search: query, page, per_page: 20 } });
    const subscribers = resource.data?.subscribers ?? [];
    const stats = resource.data?.stats ?? {};
    const meta = resource.data?.pagination ?? resource.data?.meta ?? {};
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? page);

    const rows = useMemo(() => subscribers.map((subscriber) => ({
        ...subscriber,
        status: subscriber.unsubscribed_at ? 'unsubscribed' : 'active',
    })), [subscribers]);

    useEffect(() => {
        setPage(1);
    }, [query]);

    return (
        <div className="space-y-6">
            <PageHeader
                description="Emails collected from the coming soon and newsletter forms."
                eyebrow="Launch"
                title="Waitlist"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon="bell" label="Total emails" value={stats.total ?? 0} />
                <StatCard icon="users" label="Active" tone="emerald" value={stats.active ?? 0} />
                <StatCard icon="analytics" label="Today" tone="sky" value={stats.today ?? 0} />
                <StatCard icon="bell" label="Unsubscribed" tone="amber" value={stats.unsubscribed ?? 0} />
            </div>

            <Card>
                <SearchInput className="mb-5" onChange={(event) => setQuery(event.target.value)} placeholder="Search email" value={query} />
                {resource.loading ? <LoadingBlock rows={8} /> : rows.length ? (
                    <>
                        <div className="overflow-hidden rounded-2xl border border-slate-100">
                            {rows.map((subscriber) => (
                                <article className="grid gap-3 border-b border-slate-100 p-4 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={subscriber.id}>
                                    <div className="min-w-0">
                                        <p className="truncate font-bold text-slate-950">{subscriber.email}</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">Joined {formatDate(subscriber.subscribed_at)}</p>
                                    </div>
                                    <StatusBadge status={subscriber.status} />
                                    <p className="text-xs font-semibold text-slate-400">
                                        {subscriber.unsubscribed_at ? `Left ${formatDate(subscriber.unsubscribed_at)}` : 'Receiving updates'}
                                    </p>
                                </article>
                            ))}
                        </div>
                        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
                    </>
                ) : (
                    <EmptyState description="No waitlist emails match this search yet." icon="bell" title="No emails found" />
                )}
            </Card>
        </div>
    );
}
