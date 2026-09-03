import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Avatar,
    Button,
    Card,
    EmptyState,
    ErrorState,
    IconButton,
    LoadingBlock,
    PageHeader,
    Pagination,
    SearchInput,
    StatusBadge,
    inputClass,
    useApiResource,
    useDebouncedValue,
} from '../../components/dashboard';
import VerifiedBadge from '../../components/ui/VerifiedBadge';

const normalize = (value) => Array.isArray(value) ? value : value?.users ?? value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};

const SORT_FIELDS = [
    { value: 'created_at', label: 'Date joined' },
    { value: 'name', label: 'Name' },
    { value: 'email', label: 'Email' },
];

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

export default function AdminUsersPage() {
    const [query, setQuery] = useState('');
    const [role, setRole] = useState('all');
    const [state, setState] = useState('all');
    const [verification, setVerification] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortDir, setSortDir] = useState('desc');
    const [perPage, setPerPage] = useState(20);
    const [page, setPage] = useState(1);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const search = useDebouncedValue(query);

    const hasFilters = Boolean(
        search
        || role !== 'all'
        || state !== 'all'
        || verification !== 'all'
        || dateFrom
        || dateTo
        || sortBy !== 'created_at'
        || sortDir !== 'desc'
        || perPage !== 20
    );
    const activeFilterCount = [
        search && 'search',
        role !== 'all' && 'role',
        state !== 'all' && 'state',
        verification !== 'all' && 'verification',
        dateFrom && 'from',
        dateTo && 'to',
        sortBy !== 'created_at' && 'sort',
        sortDir !== 'desc' && 'dir',
        perPage !== 20 && 'rows',
    ].filter(Boolean).length;

    const resource = useApiResource('/admin/users', [], {
        params: {
            page,
            per_page: perPage,
            search: search || undefined,
            role: role === 'all' ? undefined : role,
            is_active: state === 'all' ? undefined : state === 'active' ? 1 : 0,
            verification: verification === 'all' ? undefined : verification,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            sort: sortBy || undefined,
            direction: sortDir || undefined,
        },
    });
    const { reload } = resource;

    const meta = metaFrom(resource.data);
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? page);
    const total = Number(meta.total ?? 0);

    const users = useMemo(() => normalize(resource.data), [resource.data]);

    const resetFilters = () => {
        setQuery('');
        setRole('all');
        setState('all');
        setVerification('all');
        setDateFrom('');
        setDateTo('');
        setSortBy('created_at');
        setSortDir('desc');
        setPerPage(20);
        setPage(1);
        setMobileFiltersOpen(false);
        setAdvancedOpen(false);
    };

    useEffect(() => {
        setPage(1);
    }, [search, role, state, verification, dateFrom, dateTo, sortBy, sortDir, perPage]);

    const toggleSortDir = () => {
        setPage(1);
        setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    };

    const primaryFilterFields = (
        <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Role</span>
                <select aria-label="Role" className={inputClass} onChange={(event) => setRole(event.target.value)} value={role}>
                    <option value="all">All roles</option>
                    <option value="provider">Providers</option>
                    <option value="customer">Customers</option>
                    <option value="admin">Admins</option>
                </select>
            </label>
            <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</span>
                <select aria-label="Status" className={inputClass} onChange={(event) => setState(event.target.value)} value={state}>
                    <option value="all">Any status</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                </select>
            </label>
            <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Verification</span>
                <select aria-label="Verification" className={inputClass} onChange={(event) => setVerification(event.target.value)} value={verification}>
                    <option value="all">Any verification status</option>
                    <option value="verified">Verified</option>
                    <option value="unverified">Unverified</option>
                </select>
            </label>
        </div>
    );

    const advancedFilterFields = (
        <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-5">
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
    );

    const filterFields = (
        <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <SearchInput
                    className="min-w-0 flex-1"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name or email"
                    value={query}
                />
                <Button className="w-full whitespace-nowrap lg:w-auto" onClick={() => setAdvancedOpen((open) => !open)} type="button" variant="ghost">
                    {advancedOpen ? 'Hide advanced' : 'Advanced'}
                </Button>
            </div>
            {primaryFilterFields}
            {advancedOpen && advancedFilterFields}
        </div>
    );

    const mobileFilterFields = (
        <div className="space-y-4">
            <SearchInput
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or email"
                value={query}
            />
            {primaryFilterFields}
            {advancedFilterFields}
        </div>
    );

    return (
        <div className="space-y-6">
            <PageHeader
                actions={(
                    <Button className="md:hidden" onClick={() => setMobileFiltersOpen(true)} type="button" variant="secondary">
                        {hasFilters ? `Filter (${activeFilterCount})` : 'Filter'}
                    </Button>
                )}
                description="Open a user to manage account details, provider profile, directory status, and verification in one place."
                eyebrow="People"
                title="Users"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            {mobileFiltersOpen && (
                <div className="fixed inset-0 z-[120] md:hidden">
                    <button aria-label="Close filters" className="absolute inset-0 bg-slate-950/45" onClick={() => setMobileFiltersOpen(false)} type="button" />
                    <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-bphq-coffee">Users</p>
                                <h2 className="mt-1 text-xl font-bold text-slate-950">Filters</h2>
                            </div>
                            <IconButton icon="close" label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
                        </div>
                        {mobileFilterFields}
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
                            {total} user{total === 1 ? '' : 's'}
                            {hasFilters ? ' matching filters' : ''}
                        </p>
                        <Button onClick={resetFilters} type="button" variant="ghost">Clear filters</Button>
                    </div>
                </div>

                {resource.loading ? (
                    <div className="mt-5"><LoadingBlock rows={6} /></div>
                ) : users.length ? (
                    <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[860px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                                    <th className="pb-3 font-bold">User</th>
                                    <th className="pb-3 font-bold">Role</th>
                                    <th className="pb-3 font-bold">Provider verification</th>
                                    <th className="pb-3 font-bold">Email</th>
                                    <th className="pb-3 font-bold">Status</th>
                                    <th className="pb-3 text-right font-bold">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => {
                                    const profile = user.provider_profile ?? user.providerProfile;
                                    return (
                                        <tr className="border-b border-slate-50 last:border-0" key={user.id}>
                                            <td className="py-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={user.name} size="sm" src={profile?.profile_photo ?? user.profile_photo} />
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="font-bold text-slate-900">{user.name}</p>
                                                            <VerifiedBadge show={Boolean(profile?.verified)} size="sm" />
                                                        </div>
                                                        <p className="text-xs text-slate-400">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3"><StatusBadge status={user.role} /></td>
                                            <td className="py-3">{profile ? <StatusBadge status={profile.verified ? 'verified' : 'pending'} /> : <span className="text-xs font-semibold text-slate-400">Not applicable</span>}</td>
                                            <td className="py-3">
                                                <StatusBadge status={user.email_verified_at ? 'confirmed' : 'pending'} />
                                                {user.role === 'admin' && <p className="mt-1 text-[11px] font-semibold text-slate-400">{user.login_email_changed_at ? 'One-time change used' : 'One-time change available'}</p>}
                                            </td>
                                            <td className="py-3"><StatusBadge status={(user.is_active ?? true) ? 'active' : 'suspended'} /></td>
                                            <td className="py-3 text-right">
                                                <Link to={`/admin/users/${user.id}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                                                    Open details
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
                    </div>
                ) : (
                    <EmptyState description={hasFilters ? 'No users match these filters yet.' : 'Try changing your search or filters.'} icon="users" title="No users found" />
                )}
            </Card>
        </div>
    );
}
