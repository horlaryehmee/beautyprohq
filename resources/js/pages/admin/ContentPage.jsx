import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, SearchInput, StatusBadge, apiRequest, cx, formatDate, inputClass, useApiResource, useDashboardToast, useDebouncedValue } from '../../components/dashboard';

const contentTypes = {
    news: { label: 'News', singular: 'article', endpoint: '/admin/news', editBase: '/admin/content/news', bodyKey: 'content' },
    events: { label: 'Events', singular: 'event', endpoint: '/admin/events', editBase: '/admin/content/events', bodyKey: 'description' },
    community: { label: 'Community', singular: 'story', endpoint: '/admin/community-posts', editBase: '/admin/content/community', bodyKey: 'content' },
};

const normalize = (value) => Array.isArray(value) ? value : value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};
const plain = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const statusFor = (item) => item?.status ?? (item?.published_at ? 'published' : 'draft');

const typeFilters = {
    news: [],
    events: [],
    community: [
        ['story', 'Success stories'],
        ['spotlight', 'Member spotlights'],
        ['pro_of_the_week', 'Pro of the week'],
        ['business_win', 'Business wins'],
        ['event_coverage', 'Event coverage'],
        ['day_in_the_life', 'Day in the life'],
        ['community', 'Community updates'],
        ['help', 'Help threads'],
    ],
};

function ContentRow({ item, active, onApprove }) {
    const config = contentTypes[active];
    const editPath = `${config.editBase}/${item.id}/edit`;
    const summary = active === 'events'
        ? `${formatDate(item.date)} · ${item.location ?? 'No location'}`
        : plain(item.excerpt || item[config.bodyKey]);
    const providerName = active === 'community' ? item.provider?.user?.name : null;

    return (
        <article className="grid grid-cols-[72px_1fr] gap-2.5 rounded-lg border border-slate-200 bg-white p-2 transition hover:border-slate-300 hover:shadow-sm lg:grid-cols-[96px_1fr_auto] lg:items-center lg:gap-4 lg:rounded-3xl lg:p-4">
            <Link to={editPath} aria-label={`Edit ${item.title || config.singular}`} className="aspect-square overflow-hidden rounded-lg bg-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2 lg:rounded-2xl">
                {item.image_url || item.image ? <img src={item.image_url ?? item.image} alt="" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="grid size-full place-items-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Image</div>}
            </Link>
            <div className="min-w-0">
                <div className="flex items-center gap-1.5 overflow-hidden">
                    <StatusBadge status={statusFor(item)} />
                    {item.show_on_homepage && <span className="hidden rounded-full bg-fuchsia-50 px-2.5 py-1 text-[11px] font-bold text-fuchsia-700 ring-1 ring-inset ring-fuchsia-600/10 sm:inline-flex">Homepage {item.homepage_sort_order ? `#${item.homepage_sort_order}` : ''}</span>}
                    <span className="truncate text-[10px] font-semibold text-slate-400 lg:text-xs">{item.published_at ? formatDate(item.published_at) : 'Not published'}</span>
                </div>
                <Link to={editPath} className="mt-1 block line-clamp-1 text-sm font-bold leading-5 text-slate-950 transition hover:text-fuchsia-700 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2 lg:mt-2 lg:text-lg">{item.title || 'Untitled'}</Link>
                {providerName && <p className="mt-0.5 text-xs font-semibold text-fuchsia-700">Submitted by {providerName}</p>}
                <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-slate-500 lg:mt-1 lg:line-clamp-2 lg:text-sm lg:leading-6">{summary || 'No summary yet.'}</p>
            </div>
            <div className="col-span-2 flex flex-wrap gap-2 pt-1 lg:col-span-1 lg:justify-end lg:pt-0">
                {active === 'community' && !item.published_at && <button type="button" onClick={() => onApprove(item)} className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700 lg:min-h-10 lg:flex-none lg:rounded-xl lg:px-4 lg:text-sm">Approve</button>}
                {active === 'events' && (
                    <Link to={`${config.editBase}/${item.id}/registrations`} className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-bphq-chrome bg-bphq-ivory px-3 text-xs font-bold text-bphq-espresso transition hover:bg-bphq-beige lg:min-h-10 lg:flex-none lg:rounded-xl lg:px-4 lg:text-sm">
                        Registrations
                    </Link>
                )}
                <Link to={editPath} className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 lg:min-h-10 lg:flex-none lg:rounded-xl lg:px-4 lg:text-sm">
                    Edit existing
                </Link>
            </div>
        </article>
    );
}

export default function AdminContentPage() {
    const { notify } = useDashboardToast();
    const [active, setActive] = useState('news');
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('all');
    const [type, setType] = useState('all');
    const [page, setPage] = useState(1);
    const search = useDebouncedValue(query, 350);
    const params = {
        page,
        per_page: 8,
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        type: active === 'community' && type !== 'all' ? type : undefined,
    };
    const news = useApiResource('/admin/news', [], { params: active === 'news' ? params : { page: 1, per_page: 8 } });
    const events = useApiResource('/admin/events', [], { params: active === 'events' ? params : { page: 1, per_page: 8 } });
    const community = useApiResource('/admin/community-posts', [], { params: active === 'community' ? params : { page: 1, per_page: 8 } });
    const reports = useApiResource('/admin/community-reports', [], { params: active === 'community' ? { status: 'new', per_page: 6 } : { status: 'new', per_page: 1 } });
    const resources = { news, events, community };
    const resource = resources[active];
    const config = contentTypes[active];
    const error = news.error || events.error || community.error;

    const items = useMemo(() => normalize(resource.data), [resource.data]);
    const meta = metaFrom(resource.data);
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? page);
    const total = Number(meta.total ?? items.length);

    useEffect(() => {
        setPage(1);
    }, [active, search, status, type]);

    const switchType = (key) => {
        setActive(key);
        setType('all');
    };

    const updateReport = async (report, patch) => {
        try {
            await apiRequest('patch', `/admin/community-reports/${report.id}`, patch);
            notify('Moderation report updated.');
            reports.reload();
            community.reload();
        } catch (requestError) {
            notify(requestError?.response?.data?.message || 'Report could not be updated.', 'error');
        }
    };

    const approveCommunity = async (item) => {
        try {
            await apiRequest('put', `/admin/community-posts/${item.id}`, { status: 'published', published_at: new Date().toISOString() });
            notify('Community post approved and published.');
            community.reload();
        } catch (requestError) {
            notify(requestError?.response?.data?.message || 'Community post could not be approved.', 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<Link to={`${config.editBase}/new`} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-fuchsia-700">New {config.singular}</Link>}
                description="Manage published and draft content. Open an item to edit it in the dedicated publishing workspace."
                eyebrow="Publishing"
                title="Content management"
            />

            {error && <ErrorState message={error} onRetry={() => { news.reload(); events.reload(); community.reload(); }} />}

            <Card>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex gap-2 overflow-x-auto rounded-2xl bg-slate-100 p-1">
                        {Object.entries(contentTypes).map(([key, item]) => (
                            <button key={key} type="button" onClick={() => switchType(key)} className={cx('rounded-xl px-4 py-2 text-sm font-bold transition', active === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950')}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <SearchInput className="lg:w-80" onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${config.label.toLowerCase()}`} value={query} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Status</span>
                        <select className={inputClass} onChange={(event) => setStatus(event.target.value)} value={status}>
                            <option value="all">All statuses</option>
                            <option value="published">Published</option>
                            <option value="draft">Draft</option>
                        </select>
                    </label>
                    {typeFilters[active].length > 0 && (
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Content type</span>
                            <select className={inputClass} onChange={(event) => setType(event.target.value)} value={type}>
                                <option value="all">All types</option>
                                {typeFilters[active].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </label>
                    )}
                    <div className="flex items-end">
                        <button type="button" onClick={() => { setQuery(''); setStatus('all'); setType('all'); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                            Reset filters
                        </button>
                    </div>
                </div>
            </Card>

            {active === 'community' && (
                <Card>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                        <div>
                            <h2 className="font-bold text-slate-950">Moderation queue</h2>
                            <p className="mt-1 text-sm text-slate-500">Review reports from community members and hide reported comments when needed.</p>
                        </div>
                        <button type="button" onClick={reports.reload} className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">Refresh</button>
                    </div>
                    {reports.loading ? <LoadingBlock rows={3} /> : normalize(reports.data).length ? (
                        <div className="space-y-3">
                            {normalize(reports.data).map((report) => (
                                <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge status={report.status} />
                                                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{report.reason}</span>
                                            </div>
                                            <p className="mt-2 font-bold text-slate-950">{report.post?.title ?? 'Community post'}</p>
                                            {report.comment?.body && <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{report.comment.body}</p>}
                                            {report.details && <p className="mt-2 text-sm leading-6 text-slate-600">{report.details}</p>}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" onClick={() => updateReport(report, { status: 'resolved' })} className="min-h-9 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-700">Resolve</button>
                                            {report.comment && <button type="button" onClick={() => updateReport(report, { status: 'resolved', hide_comment: true })} className="min-h-9 rounded-xl bg-amber-50 px-3 text-xs font-bold text-amber-700">Hide comment</button>}
                                            <button type="button" onClick={() => updateReport(report, { status: 'dismissed' })} className="min-h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700">Dismiss</button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <EmptyState compact description="New community reports will appear here." title="No reports waiting" />
                    )}
                </Card>
            )}

            <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <p className="text-sm font-semibold text-slate-500">{total} {config.label.toLowerCase()} found</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Page {currentPage} of {pageCount}</p>
                </div>
                {resource.loading ? (
                    <LoadingBlock rows={7} />
                ) : items.length ? (
                    <>
                        <div className="space-y-3">
                            {items.map((item) => <ContentRow key={item.id} item={item} active={active} onApprove={approveCommunity} />)}
                        </div>
                        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
                    </>
                ) : (
                    <EmptyState
                        action={<Link to={`${config.editBase}/new`} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-fuchsia-50 px-4 text-sm font-bold text-fuchsia-700 transition hover:bg-fuchsia-100">Create {config.singular}</Link>}
                        description={`No ${config.label.toLowerCase()} matched your current view.`}
                        title="No content found"
                    />
                )}
            </Card>
        </div>
    );
}
