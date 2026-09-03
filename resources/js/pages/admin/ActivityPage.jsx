import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    EmptyState,
    ErrorState,
    Field,
    IconButton,
    LoadingBlock,
    PageHeader,
    SearchInput,
    StatusBadge,
    formatDate,
    inputClass,
    useApiResource,
    useDebouncedValue,
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

const initialFilters = {
    type: 'all',
    search: '',
    status: '',
    date_from: '',
    date_to: '',
    sort: 'created_at',
    direction: 'desc',
    per_page: 25,
};

function compactParams(values, page) {
    return Object.fromEntries(
        Object.entries({ ...values, page })
            .filter(([, value]) => value !== '' && value !== null && value !== undefined),
    );
}

function formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function filterLabel(value) {
    return filters.find(([key]) => key === value)?.[1] ?? value;
}

function filterValueLabel(key, value) {
    if (!value) return '';
    if (key === 'type') return filterLabel(value);
    if (key === 'status') return String(value).replaceAll('_', ' ');
    if (key === 'sort') return `Sort: ${String(value).replaceAll('_', ' ')}`;
    if (key === 'direction') return value === 'asc' ? 'Oldest first' : 'Newest first';
    if (key === 'per_page') return `${value} rows`;
    if (key === 'date_from') return `From ${value}`;
    if (key === 'date_to') return `To ${value}`;
    return value;
}

function activeFilterChips(filtersState) {
    return [
        filtersState.type !== 'all' && ['type', 'Type', filterValueLabel('type', filtersState.type)],
        filtersState.status && ['status', 'Status', filterValueLabel('status', filtersState.status)],
        filtersState.date_from && ['date_from', 'From', filterValueLabel('date_from', filtersState.date_from)],
        filtersState.date_to && ['date_to', 'To', filterValueLabel('date_to', filtersState.date_to)],
        filtersState.sort !== initialFilters.sort && ['sort', 'Sort', filterValueLabel('sort', filtersState.sort)],
        filtersState.direction !== initialFilters.direction && ['direction', 'Direction', filterValueLabel('direction', filtersState.direction)],
        filtersState.per_page !== initialFilters.per_page && ['per_page', 'Rows', filterValueLabel('per_page', filtersState.per_page)],
    ].filter(Boolean);
}

function paginationItems(currentPage, pageCount) {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, 'end-gap', pageCount - 1, pageCount];
    if (currentPage >= pageCount - 3) return [1, 2, 'start-gap', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
    return [1, 'start-gap', currentPage - 1, currentPage, currentPage + 1, 'end-gap', pageCount];
}

function AdvancedFilterFields({ filtersState, updateFilter }) {
    return (
        <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="From">
                <input className={inputClass} onChange={(event) => updateFilter('date_from', event.target.value)} type="date" value={filtersState.date_from} />
            </Field>
            <Field label="To">
                <input className={inputClass} onChange={(event) => updateFilter('date_to', event.target.value)} type="date" value={filtersState.date_to} />
            </Field>
            <Field label="Sort">
                <select className={inputClass} onChange={(event) => updateFilter('sort', event.target.value)} value={filtersState.sort}>
                    <option value="created_at">Date</option>
                    <option value="type">Type</option>
                    <option value="status">Status</option>
                    <option value="actor">User</option>
                </select>
            </Field>
            <Field label="Direction">
                <select className={inputClass} onChange={(event) => updateFilter('direction', event.target.value)} value={filtersState.direction}>
                    <option value="desc">Newest first</option>
                    <option value="asc">Oldest first</option>
                </select>
            </Field>
            <Field label="Rows">
                <select className={inputClass} onChange={(event) => updateFilter('per_page', Number(event.target.value))} value={filtersState.per_page}>
                    {[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
            </Field>
        </div>
    );
}

function MobileFilterFields({ filtersState, statuses, updateFilter }) {
    return (
        <div className="space-y-4">
            <SearchInput
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="Search title, description, name, email or status"
                value={filtersState.search}
            />
            <Field label="Type">
                <select className={inputClass} onChange={(event) => updateFilter('type', event.target.value)} value={filtersState.type}>
                    {filters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            </Field>
            <Field label="Status">
                <select className={inputClass} onChange={(event) => updateFilter('status', event.target.value)} value={filtersState.status}>
                    <option value="">Any status</option>
                    {statuses.map((status) => <option key={status} value={status}>{String(status).replaceAll('_', ' ')}</option>)}
                </select>
            </Field>
            <AdvancedFilterFields filtersState={filtersState} updateFilter={updateFilter} />
        </div>
    );
}

function FilterFields({ filterMenuOpen, filtersState, showAdvanced, statuses, toggleAdvanced, toggleFilterMenu, updateFilter }) {
    const chips = activeFilterChips(filtersState);

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <SearchInput
                    className="min-w-0 flex-1"
                    onChange={(event) => updateFilter('search', event.target.value)}
                    placeholder="Search title, description, name, email or status"
                    value={filtersState.search}
                />
                <div className="relative">
                    <Button className="w-full whitespace-nowrap lg:w-auto" onClick={toggleFilterMenu} type="button" variant="secondary">
                        + Filter
                    </Button>
                    {filterMenuOpen && (
                        <div className="absolute right-0 z-30 mt-2 w-full min-w-[18rem] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 lg:w-[22rem]">
                            <div className="space-y-4">
                                <Field label="Type">
                                    <select className={inputClass} onChange={(event) => updateFilter('type', event.target.value)} value={filtersState.type}>
                                        {filters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                    </select>
                                </Field>
                                <Field label="Status">
                                    <select className={inputClass} onChange={(event) => updateFilter('status', event.target.value)} value={filtersState.status}>
                                        <option value="">Any status</option>
                                        {statuses.map((status) => <option key={status} value={status}>{String(status).replaceAll('_', ' ')}</option>)}
                                    </select>
                                </Field>
                            </div>
                        </div>
                    )}
                </div>
                <Button className="w-full whitespace-nowrap lg:w-auto" onClick={toggleAdvanced} type="button" variant="ghost">
                    {showAdvanced ? 'Hide advanced' : 'Advanced'}
                </Button>
            </div>

            {chips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {chips.map(([key, label, value]) => (
                        <button
                            className="inline-flex min-h-8 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold capitalize text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            key={key}
                            onClick={() => updateFilter(key, initialFilters[key])}
                            type="button"
                        >
                            <span className="text-slate-400">{label}</span>
                            <span>{value}</span>
                            <span className="text-base leading-none text-slate-400">×</span>
                        </button>
                    ))}
                </div>
            )}

            {showAdvanced && <AdvancedFilterFields filtersState={filtersState} updateFilter={updateFilter} />}
        </div>
    );
}

function NumberedPagination({ currentPage, pageCount, loading, onPageChange }) {
    if (pageCount <= 1) return null;
    const items = paginationItems(currentPage, pageCount);
    const buttonClass = (active) => `grid min-h-10 min-w-10 place-items-center rounded-xl px-3 text-sm font-bold transition ${active ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`;

    return (
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm xl:flex-row xl:items-center xl:justify-between">
            <span className="text-slate-500">Page {currentPage} of {pageCount}</span>
            <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
                <Button disabled={currentPage <= 1 || loading} onClick={() => onPageChange(currentPage - 1)} type="button" variant="secondary">Previous</Button>
                {items.map((item) => item === 'start-gap' || item === 'end-gap' ? (
                    <span className="grid min-h-10 place-items-center px-1 text-slate-400" key={item}>...</span>
                ) : (
                    <button
                        className={buttonClass(item === currentPage)}
                        disabled={loading || item === currentPage}
                        key={item}
                        onClick={() => onPageChange(item)}
                        type="button"
                    >
                        {item}
                    </button>
                ))}
                <Button disabled={currentPage >= pageCount || loading} onClick={() => onPageChange(currentPage + 1)} type="button" variant="secondary">Next</Button>
            </div>
        </div>
    );
}

export default function AdminActivityPage() {
    const [filtersState, setFiltersState] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const debouncedSearch = useDebouncedValue(filtersState.search, 350);
    const params = useMemo(
        () => compactParams({ ...filtersState, search: debouncedSearch }, page),
        [debouncedSearch, filtersState, page],
    );
    const resource = useApiResource('/admin/activity', [], { params, refreshInterval: 30000 });
    const items = Array.isArray(resource.data) ? resource.data : resource.data?.data ?? [];
    const meta = resource.data?.meta ?? {};
    const statuses = meta.filters?.statuses ?? [];
    const pageCount = Number(meta.last_page ?? 1);
    const currentPage = Number(meta.current_page ?? page);

    useEffect(() => {
        setPage(1);
    }, [
        filtersState.type,
        filtersState.status,
        filtersState.date_from,
        filtersState.date_to,
        filtersState.sort,
        filtersState.direction,
        filtersState.per_page,
        debouncedSearch,
    ]);

    const updateFilter = (key, value) => {
        setFiltersState((current) => ({ ...current, [key]: value }));
    };

    const clearFilters = () => {
        setFiltersState(initialFilters);
        setAdvancedFiltersOpen(false);
        setFilterMenuOpen(false);
        setPage(1);
    };

    const filterFields = (
        <FilterFields
            filterMenuOpen={filterMenuOpen}
            filtersState={filtersState}
            showAdvanced={advancedFiltersOpen}
            statuses={statuses}
            toggleAdvanced={() => setAdvancedFiltersOpen((open) => !open)}
            toggleFilterMenu={() => setFilterMenuOpen((open) => !open)}
            updateFilter={updateFilter}
        />
    );
    const mobileFilterFields = (
        <MobileFilterFields
            filtersState={filtersState}
            statuses={statuses}
            updateFilter={updateFilter}
        />
    );

    return (
        <div className="space-y-6">
            <PageHeader
                actions={(
                    <>
                        <Button className="md:hidden" onClick={() => setMobileFiltersOpen(true)} type="button" variant="secondary">Filter</Button>
                        <Button onClick={() => resource.reload()} type="button" variant="secondary">Refresh</Button>
                    </>
                )}
                description="Search, filter and review operational events without loading the full activity history into the browser."
                eyebrow="Platform monitoring"
                title="Activity"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            {mobileFiltersOpen && (
                <div className="fixed inset-0 z-[120] md:hidden">
                    <button aria-label="Close filters" className="absolute inset-0 bg-slate-950/45" onClick={() => setMobileFiltersOpen(false)} type="button" />
                    <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-bphq-coffee">Activity</p>
                                <h2 className="mt-1 text-xl font-bold text-slate-950">Filters</h2>
                            </div>
                            <IconButton icon="close" label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
                        </div>
                        {mobileFilterFields}
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <Button onClick={clearFilters} type="button" variant="ghost">Clear</Button>
                            <Button onClick={() => setMobileFiltersOpen(false)} type="button">Apply</Button>
                        </div>
                    </div>
                </div>
            )}

            <Card>
                <div className="hidden md:block">
                    {filterFields}
                    <div className="mt-4 flex justify-end">
                        <Button onClick={clearFilters} type="button" variant="ghost">Clear filters</Button>
                    </div>
                </div>

                <div className="mt-0 overflow-hidden rounded-2xl border border-slate-200 md:mt-6">
                    {resource.loading ? <div className="p-4"><LoadingBlock rows={8} /></div> : items.length ? (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 font-bold">Time</th>
                                        <th className="px-4 py-3 font-bold">Type</th>
                                        <th className="px-4 py-3 font-bold">Status</th>
                                        <th className="px-4 py-3 font-bold">Activity</th>
                                        <th className="px-4 py-3 font-bold">User</th>
                                        <th className="px-4 py-3 font-bold text-right">Record</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {items.map((item) => (
                                        <tr className="align-top transition hover:bg-slate-50" key={item.id}>
                                            <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                                                <span className="block font-semibold text-slate-900">{formatDate(item.created_at)}</span>
                                                <span className="text-xs text-slate-400">{formatTime(item.created_at)}</span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-700">{item.type}</span>
                                            </td>
                                            <td className="px-4 py-4"><StatusBadge status={item.status || item.type} /></td>
                                            <td className="min-w-[320px] px-4 py-4">
                                                <p className="font-bold text-slate-950">{item.title}</p>
                                                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{item.description}</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <p className="font-semibold text-slate-900">{item.actor || 'System'}</p>
                                                {item.actor_email && <p className="mt-1 text-xs text-slate-400">{item.actor_email}</p>}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-4 text-right text-xs font-bold text-slate-400">#{item.record_id}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <EmptyState description="No activity matches the current filters." icon="analytics" title="No activity found" />
                    )}
                </div>

                <NumberedPagination
                    currentPage={currentPage}
                    loading={resource.loading}
                    onPageChange={setPage}
                    pageCount={pageCount}
                />
            </Card>
        </div>
    );
}
