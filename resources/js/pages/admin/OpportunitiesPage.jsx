import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Avatar,
    Button,
    Card,
    EmptyState,
    ErrorState,
    LoadingBlock,
    PageHeader,
    Pagination,
    SearchInput,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    formatDate,
    inputClass,
    useApiResource,
    useDashboardToast,
    useDebouncedValue,
} from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.opportunities ?? value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};
const updateResourceData = (current, nextItems) => Array.isArray(current) ? nextItems : { ...current, data: nextItems };

const TYPE_OPTIONS = [
    ['job', 'Job'],
    ['partnership', 'Partnership'],
    ['vendor_call', 'Vendor call'],
    ['training', 'Training'],
    ['media', 'Media feature'],
    ['speaking', 'Speaking'],
];

function plainText(value) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function contactFrom(item = {}) {
    const info = item.contact_info ?? {};
    return typeof info === 'object' ? info : { text: info };
}

function typeLabel(value) {
    return (TYPE_OPTIONS.find(([key]) => key === value)?.[1] ?? String(value ?? 'opportunity')).replaceAll('_', ' ');
}

export default function AdminOpportunitiesPage() {
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [page, setPage] = useState(1);
    const search = useDebouncedValue(query);
    const resource = useApiResource('/admin/opportunities', [], {
        params: {
            page,
            per_page: 15,
            search: search || undefined,
            type: typeFilter === 'all' ? undefined : typeFilter,
        },
    });
    const { notify } = useDashboardToast();
    const items = normalize(resource.data).map((item) => ({ ...item, status: item.status ?? (item.published_at ? 'published' : 'draft') }));
    const meta = metaFrom(resource.data);
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? 1);
    const total = Number(meta.total ?? 0);
    const hasFilters = Boolean(search || typeFilter !== 'all');

    useEffect(() => {
        setPage(1);
    }, [search, typeFilter]);

    const remove = async (item) => {
        if (!window.confirm(`Delete this ${typeLabel(item.type)} opportunity?`)) return;
        try {
            await apiRequest('delete', `/admin/opportunities/${item.id}`);
            resource.setData((current) => updateResourceData(current, normalize(current).filter((entry) => entry.id !== item.id)));
            notify('Opportunity deleted.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    const resetFilters = () => {
        setQuery('');
        setTypeFilter('all');
        setPage(1);
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
                <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
                    <SearchInput onChange={(event) => setQuery(event.target.value)} placeholder="Search title, description, type or location" value={query} />
                    <select aria-label="Opportunity type" className={inputClass} onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
                        <option value="all">All types</option>
                        {TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </div>

                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-400">
                        {total} opportunity{total === 1 ? '' : 's'}
                        {hasFilters ? ' matching filters' : ''}
                    </p>
                    {hasFilters && <Button onClick={resetFilters} type="button" variant="ghost">Clear filters</Button>}
                </div>

                {resource.loading ? <LoadingBlock rows={5} /> : items.length ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-100">
                        {items.map((item) => (
                            <article
                                className="flex flex-col gap-3 border-b border-slate-50 p-4 last:border-0 lg:flex-row lg:items-center lg:justify-between"
                                key={item.id}
                            >
                                <div className="flex min-w-0 items-start gap-3">
                                    <Avatar name={typeLabel(item.type)} size="sm" />
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-[11px] font-bold capitalize text-fuchsia-700">{typeLabel(item.type)}</span>
                                            <StatusBadge status={item.status ?? 'published'} />
                                        </div>
                                        <p className="mt-2 truncate font-bold text-slate-950">{item.title ?? `${typeLabel(item.type)} opportunity`}</p>
                                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{item.short_description || contactFrom(item).short_description || plainText(item.description)}</p>
                                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                                            {item.location && <span>Location: {item.location}</span>}
                                            {item.deadline && <span>Deadline: {formatDate(item.deadline)}</span>}
                                            <span>Added {formatDate(item.created_at)}</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <Link className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-bphq-chrome bg-white px-4 text-sm font-semibold text-bphq-espresso transition hover:bg-bphq-ivory lg:flex-none" to={`/admin/opportunities/${item.id}/edit`}>Edit</Link>
                                    <Button onClick={() => remove(item)} type="button" variant="danger">Delete</Button>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        action={!hasFilters && <Link className="inline-flex min-h-10 items-center justify-center rounded-xl bg-bphq-ivory px-4 text-sm font-semibold text-bphq-espresso transition hover:bg-bphq-beige" to="/admin/opportunities/new">Post an opportunity</Link>}
                        description={hasFilters ? 'No opportunities match your search.' : 'Create a detailed listing with clear requirements and application guidance.'}
                        icon="opportunity"
                        title={hasFilters ? 'No opportunities found' : 'No opportunities yet'}
                    />
                )}
                <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
            </Card>
        </div>
    );
}
