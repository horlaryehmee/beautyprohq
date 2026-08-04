import { useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, SearchInput, StatusBadge, apiErrorMessage, apiRequest, formatDate, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';

const statuses = ['registered', 'contacted', 'attended', 'cancelled'];
const normalize = (value) => Array.isArray(value) ? value : value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};
const updateResourceData = (current, nextItems) => Array.isArray(current) ? nextItems : { ...current, data: nextItems };

export default function AdminEventRegistrationsPage() {
    const { notify } = useDashboardToast();
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('all');
    const [page, setPage] = useState(1);
    const resource = useApiResource('/admin/event-registrations', [], {
        params: {
            page,
            per_page: 15,
            search: query || undefined,
            status: status === 'all' ? undefined : status,
        },
    });

    const rows = useMemo(() => normalize(resource.data), [resource.data]);
    const meta = metaFrom(resource.data);
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? page);
    const total = Number(meta.total ?? rows.length);

    useEffect(() => {
        setPage(1);
    }, [query, status]);

    const changeStatus = async (registration, nextStatus) => {
        try {
            const updated = await apiRequest('patch', `/admin/event-registrations/${registration.id}`, { status: nextStatus });
            resource.setData((current) => updateResourceData(current, normalize(current).map((item) => item.id === registration.id ? updated : item)));
            notify('Registration updated.');
        } catch (error) {
            notify(apiErrorMessage(error, 'Registration could not be updated.'), 'error');
        }
    };

    const remove = async (registration) => {
        if (!window.confirm(`Remove registration for ${registration.name}?`)) return;

        try {
            await apiRequest('delete', `/admin/event-registrations/${registration.id}`);
            resource.setData((current) => updateResourceData(current, normalize(current).filter((item) => item.id !== registration.id)));
            notify('Registration removed.');
        } catch (error) {
            notify(apiErrorMessage(error, 'Registration could not be removed.'), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                description="Manage event signups, attendee status, and follow-up from one place."
                eyebrow="Events"
                title="Event registrations"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card>
                <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
                    <SearchInput onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, brand, or event" value={query} />
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Status</span>
                        <select className={inputClass} onChange={(event) => setStatus(event.target.value)} value={status}>
                            <option value="all">All statuses</option>
                            {statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                        </select>
                    </label>
                    <Button onClick={() => { setQuery(''); setStatus('all'); }} type="button" variant="secondary">Reset</Button>
                </div>
            </Card>

            <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <p className="text-sm font-semibold text-slate-500">{total} registrations found</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Page {currentPage} of {pageCount}</p>
                </div>

                {resource.loading ? <LoadingBlock rows={8} /> : rows.length ? (
                    <>
                        <div className="overflow-hidden rounded-2xl border border-slate-100">
                            {rows.map((registration) => (
                                <article className="grid gap-4 border-b border-slate-100 p-4 last:border-0 xl:grid-cols-[1.1fr_1fr_180px_auto] xl:items-center" key={registration.id}>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusBadge status={registration.status} />
                                            <span className="text-xs font-semibold text-slate-400">Registered {formatDate(registration.created_at)}</span>
                                        </div>
                                        <h2 className="mt-2 truncate text-base font-bold text-slate-950">{registration.name}</h2>
                                        <p className="mt-1 truncate text-sm text-slate-500">{registration.email}{registration.phone ? ` / ${registration.phone}` : ''}</p>
                                    </div>

                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-slate-900">{registration.event?.title ?? 'Event removed'}</p>
                                        <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                                            {registration.event?.date ? formatDate(registration.event.date) : 'No date'}{registration.event?.location ? ` / ${registration.event.location}` : ''}
                                        </p>
                                        {(registration.business_name || registration.professional_role) && (
                                            <p className="mt-1 truncate text-xs text-slate-500">{registration.professional_role}{registration.professional_role && registration.business_name ? ' at ' : ''}{registration.business_name}</p>
                                        )}
                                    </div>

                                    <label className="block">
                                        <span className="sr-only">Registration status</span>
                                        <select className={inputClass} onChange={(event) => changeStatus(registration, event.target.value)} value={registration.status}>
                                            {statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                                        </select>
                                    </label>

                                    <div className="flex gap-2 xl:justify-end">
                                        {registration.event?.slug && (
                                            <a className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50" href={`/news-events/events/${registration.event.slug}`} rel="noreferrer" target="_blank">View event</a>
                                        )}
                                        <Button onClick={() => remove(registration)} type="button" variant="danger">Remove</Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
                    </>
                ) : (
                    <EmptyState description="Registrations submitted from event detail pages will appear here." icon="calendar" title="No registrations found" />
                )}
            </Card>
        </div>
    );
}
