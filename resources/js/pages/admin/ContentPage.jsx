import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, SearchInput, StatusBadge, apiErrorMessage, apiRequest, cx, formatDate, inputClass, useApiResource, useDashboardToast, useDebouncedValue } from '../../components/dashboard';

const contentTypes = {
    news: { label: 'News', singular: 'article', endpoint: '/admin/news', editBase: '/admin/content/news', bodyKey: 'content' },
    events: { label: 'Events', singular: 'event', endpoint: '/admin/events', editBase: '/admin/content/events', bodyKey: 'description' },
    community: { label: 'Community', singular: 'story', endpoint: '/admin/community-posts', editBase: '/admin/content/community', bodyKey: 'content' },
};

const normalize = (value) => Array.isArray(value) ? value : value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};
const plain = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const statusFor = (item) => item?.status ?? (item?.published_at ? 'published' : 'draft');
const sortOptions = [
    ['custom', 'Custom order'],
    ['random', 'Randomize'],
    ['az', 'A-Z'],
    ['za', 'Z-A'],
    ['newest', 'Newest first'],
    ['oldest', 'Oldest first'],
];

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
    ],
};

function ContentRow({ item, active, onHomepageUpdate }) {
    const config = contentTypes[active];
    const summary = active === 'events'
        ? `${formatDate(item.date)} · ${item.location ?? 'No location'}`
        : plain(item.excerpt || item[config.bodyKey]);

    return (
        <article className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm lg:grid-cols-[96px_1fr_auto] lg:items-center">
            <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100 lg:aspect-square">
                {item.image ? <img src={item.image} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-[10px] font-black uppercase tracking-wide text-slate-400">Image</div>}
            </div>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={statusFor(item)} />
                    <span className="text-xs font-semibold text-slate-400">{item.published_at ? `Published ${formatDate(item.published_at)}` : 'Not published'}</span>
                </div>
                <h2 className="mt-2 line-clamp-1 text-lg font-bold text-slate-950">{item.title || 'Untitled'}</h2>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{summary || 'No summary yet.'}</p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
                {active !== 'community' && (
                    <div className="grid min-w-48 gap-2 rounded-2xl bg-slate-50 p-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                            <input checked={Boolean(item.show_on_homepage)} onChange={(event) => onHomepageUpdate(item, { show_on_homepage: event.target.checked })} type="checkbox" />
                            Show on homepage
                        </label>
                        <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs font-bold text-slate-500">
                            <span>Order</span>
                            <input className={`${inputClass} min-h-9 py-1 text-sm`} min="0" onChange={(event) => onHomepageUpdate(item, { homepage_order: Number(event.target.value || 0) })} type="number" value={item.homepage_order ?? 0} />
                        </label>
                    </div>
                )}
                <Link to={`${config.editBase}/${item.id}/edit`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                    Edit
                </Link>
            </div>
        </article>
    );
}

export default function AdminContentPage() {
    const [active, setActive] = useState('news');
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('all');
    const [type, setType] = useState('all');
    const [page, setPage] = useState(1);
    const { notify } = useDashboardToast();
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
    const homepageSettings = useApiResource('/admin/homepage-settings', {});
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

    const updateHomepageSort = async (sortMode) => {
        try {
            const saved = await apiRequest('put', '/admin/homepage-settings', { section: active, sort_mode: sortMode });
            homepageSettings.setData(saved);
            notify('Homepage sort updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    const updateItemHomepage = async (item, patch) => {
        if (active === 'community') return;
        try {
            const saved = await apiRequest('put', `${config.endpoint}/${item.id}`, patch);
            resource.setData((current) => ({
                ...current,
                data: normalize(current).map((entry) => entry.id === item.id ? { ...entry, ...saved } : entry),
            }));
            notify('Homepage selection updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
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
                    {active !== 'community' && (
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Homepage sort</span>
                            <select className={inputClass} onChange={(event) => updateHomepageSort(event.target.value)} value={homepageSettings.data?.[active] ?? 'custom'}>
                                {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </label>
                    )}
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
                            {items.map((item) => <ContentRow key={item.id} item={item} active={active} onHomepageUpdate={updateItemHomepage} />)}
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
