import { useMemo, useState } from 'react';
import {
    Card,
    CardHeader,
    EmptyState,
    ErrorState,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    formatDate,
    useApiResource,
} from '../../components/dashboard';

const filters = [
    ['all', 'All activity'],
    ['users', 'Users'],
    ['bookings', 'Bookings'],
    ['payments', 'Payments'],
    ['subscriptions', 'Subscriptions'],
    ['listings', 'Listings'],
    ['content', 'Content'],
    ['announcements', 'Announcements'],
];

const tone = {
    users: 'active',
    bookings: 'pending',
    payments: 'paid',
    subscriptions: 'published',
    listings: 'approved',
    content: 'draft',
    announcements: 'unread',
};

export default function AdminActivityPage() {
    const [type, setType] = useState('all');
    const resource = useApiResource('/admin/activity', [], { params: { type, per_page: 80 }, refreshInterval: 30000 });
    const items = Array.isArray(resource.data) ? resource.data : resource.data?.data ?? [];

    const grouped = useMemo(() => items.reduce((acc, item) => {
        const day = formatDate(item.created_at);
        acc[day] = acc[day] ? [...acc[day], item] : [item];
        return acc;
    }, {}), [items]);

    return (
        <div className="space-y-6">
            <PageHeader
                description="A live operational feed for signups, listing changes, bookings, payments, content, subscription activity, and announcements."
                eyebrow="Platform monitoring"
                title="Activity"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card>
                <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                    {filters.map(([value, label]) => (
                        <button
                            className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold transition ${type === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            key={value}
                            onClick={() => setType(value)}
                            type="button"
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {resource.loading ? <LoadingBlock rows={8} /> : items.length ? (
                    <div className="space-y-7">
                        {Object.entries(grouped).map(([day, entries]) => (
                            <section key={day}>
                                <CardHeader title={day} />
                                <div className="overflow-hidden rounded-2xl border border-slate-100">
                                    {entries.map((item) => (
                                        <article className="grid gap-3 border-b border-slate-100 p-4 last:border-0 sm:grid-cols-[10rem_1fr_auto] sm:items-center" key={item.id}>
                                            <StatusBadge status={tone[item.type] ?? item.type} />
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-950">{item.title}</p>
                                                <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
                                            </div>
                                            <p className="text-xs font-semibold text-slate-400">
                                                {item.created_at ? new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.created_at)) : ''}
                                            </p>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                ) : (
                    <EmptyState description="No activity exists for this filter yet." icon="analytics" title="No activity found" />
                )}
            </Card>
        </div>
    );
}
