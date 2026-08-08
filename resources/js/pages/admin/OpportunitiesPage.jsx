import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, StatusBadge, apiErrorMessage, apiRequest, formatDate, useApiResource, useDashboardToast } from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.opportunities ?? value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};
const updateResourceData = (current, nextItems) => Array.isArray(current) ? nextItems : { ...current, data: nextItems };

function plainText(value) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function contactFrom(item = {}) {
    const info = item.contact_info ?? {};
    return typeof info === 'object' ? info : { text: info };
}

export default function AdminOpportunitiesPage() {
    const [page, setPage] = useState(1);
    const resource = useApiResource('/admin/opportunities', [], { params: { page, per_page: 12 } });
    const { notify } = useDashboardToast();
    const items = normalize(resource.data).map((item) => ({ ...item, status: item.status ?? (item.published_at ? 'published' : 'draft') }));
    const meta = metaFrom(resource.data);
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? 1);

    const remove = async (item) => {
        if (!window.confirm(`Delete this ${item.type} opportunity?`)) return;
        try {
            await apiRequest('delete', `/admin/opportunities/${item.id}`);
            resource.setData((current) => updateResourceData(current, normalize(current).filter((entry) => entry.id !== item.id)));
            notify('Opportunity deleted.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<Link className="inline-flex min-h-10 items-center justify-center rounded-xl bg-bphq-coffee px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-bphq-espresso" to="/admin/opportunities/new">Add opportunity</Link>}
                description="Publish jobs, collaborations, vendor calls, and training opportunities with clear application instructions."
                eyebrow="Growth"
                title="Opportunities"
            />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            <Card>
                {resource.loading ? <LoadingBlock rows={5} /> : items.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((item) => (
                            <article className="rounded-2xl border border-slate-100 p-4" key={item.id}>
                                <div className="flex items-start justify-between gap-3">
                                    <span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-[11px] font-bold capitalize text-fuchsia-700">{String(item.type).replaceAll('_', ' ')}</span>
                                    <StatusBadge status={item.status ?? 'published'} />
                                </div>
                                <h2 className="mt-4 line-clamp-2 font-bold text-slate-950">{item.title ?? `${item.type} opportunity`}</h2>
                                <p className="mt-2 line-clamp-3 min-h-16 text-sm leading-5 text-slate-500">{item.short_description || contactFrom(item).short_description || plainText(item.description)}</p>
                                <p className="mt-3 text-[11px] text-slate-400">Added {formatDate(item.created_at)}</p>
                                <div className="mt-4 flex gap-2">
                                    <Link className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-bphq-chrome bg-white px-4 text-sm font-semibold text-bphq-espresso transition hover:bg-bphq-ivory" to={`/admin/opportunities/${item.id}/edit`}>Edit</Link>
                                    <Button onClick={() => remove(item)} type="button" variant="danger">Delete</Button>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        action={<Link className="inline-flex min-h-10 items-center justify-center rounded-xl bg-bphq-ivory px-4 text-sm font-semibold text-bphq-espresso transition hover:bg-bphq-beige" to="/admin/opportunities/new">Post an opportunity</Link>}
                        description="Create a detailed listing with clear requirements and application guidance."
                        icon="opportunity"
                        title="No opportunities yet"
                    />
                )}
                <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
            </Card>
        </div>
    );
}
