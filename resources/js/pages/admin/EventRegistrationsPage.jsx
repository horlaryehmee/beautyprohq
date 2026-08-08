import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, SearchInput, StatusBadge, apiErrorMessage, apiRequest, formatDate, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';

const statuses = ['registered', 'contacted', 'attended', 'cancelled'];
const normalize = (value) => Array.isArray(value) ? value : value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};
const updateResourceData = (current, nextItems) => Array.isArray(current) ? nextItems : { ...current, data: nextItems };

function countFor(event, status) {
    return Number(event?.[`${status}_count`] ?? 0);
}

export default function AdminEventRegistrationsPage() {
    const { notify } = useDashboardToast();
    const { eventId } = useParams();
    const [eventSearch, setEventSearch] = useState('');
    const [attendeeSearch, setAttendeeSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [selectedEventId, setSelectedEventId] = useState(eventId ?? null);
    const [eventPage, setEventPage] = useState(1);
    const [registrationPage, setRegistrationPage] = useState(1);

    const eventResource = useApiResource('/admin/event-registrations/events', [], {
        params: {
            page: eventPage,
            per_page: 20,
            search: eventSearch || undefined,
            event_id: eventId || undefined,
        },
    });
    const events = useMemo(() => normalize(eventResource.data), [eventResource.data]);
    const eventMeta = metaFrom(eventResource.data);
    const selectedEvent = events.find((event) => Number(event.id) === Number(selectedEventId)) ?? null;

    const registrationResource = useApiResource('/admin/event-registrations', [], {
        enabled: Boolean(selectedEventId),
        params: {
            page: registrationPage,
            per_page: 25,
            event_id: selectedEventId || undefined,
            search: attendeeSearch || undefined,
            status: status === 'all' ? undefined : status,
        },
    });
    const rows = useMemo(() => normalize(registrationResource.data), [registrationResource.data]);
    const registrationMeta = metaFrom(registrationResource.data);
    const registrationPageCount = Number(registrationMeta.last_page ?? registrationMeta.lastPage ?? 1);
    const currentRegistrationPage = Number(registrationMeta.current_page ?? registrationMeta.currentPage ?? registrationPage);
    const totalRegistrations = Number(registrationMeta.total ?? rows.length);
    const eventPageCount = Number(eventMeta.last_page ?? eventMeta.lastPage ?? 1);
    const currentEventPage = Number(eventMeta.current_page ?? eventMeta.currentPage ?? eventPage);

    useEffect(() => {
        setEventPage(1);
    }, [eventSearch]);

    useEffect(() => {
        if (!events.length) {
            setSelectedEventId(null);
            return;
        }

        if (eventId) {
            setSelectedEventId(eventId);
            return;
        }

        if (!selectedEventId || !events.some((event) => Number(event.id) === Number(selectedEventId))) {
            setSelectedEventId(events[0].id);
        }
    }, [eventId, events, selectedEventId]);

    useEffect(() => {
        setRegistrationPage(1);
    }, [attendeeSearch, selectedEventId, status]);

    const changeStatus = async (registration, nextStatus) => {
        try {
            const updated = await apiRequest('patch', `/admin/event-registrations/${registration.id}`, { status: nextStatus });
            registrationResource.setData((current) => updateResourceData(current, normalize(current).map((item) => item.id === registration.id ? updated : item)));
            eventResource.reload(true);
            notify('Registration updated.');
        } catch (error) {
            notify(apiErrorMessage(error, 'Registration could not be updated.'), 'error');
        }
    };

    const remove = async (registration) => {
        if (!window.confirm(`Remove registration for ${registration.name}?`)) return;

        try {
            await apiRequest('delete', `/admin/event-registrations/${registration.id}`);
            registrationResource.setData((current) => updateResourceData(current, normalize(current).filter((item) => item.id !== registration.id)));
            eventResource.reload(true);
            notify('Registration removed.');
        } catch (error) {
            notify(apiErrorMessage(error, 'Registration could not be removed.'), 'error');
        }
    };

    const resetAttendeeFilters = () => {
        setAttendeeSearch('');
        setStatus('all');
    };

    const exportSelectedEvent = async () => {
        if (!selectedEvent) return;

        const response = await fetch(`/api/admin/events/${selectedEvent.id}/registrations/export`, {
            credentials: 'include',
            headers: {
                Accept: 'text/csv',
            },
        });

        if (!response.ok) {
            notify('Registrations could not be exported.', 'error');
            return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `event-${selectedEvent.id}-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<Link to="/admin/content" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Back to events</Link>}
                description="View registrations under each event, then manage attendee status and follow-up from the selected event list."
                eyebrow="Events"
                title="Event registrations"
            />

            {(eventResource.error || registrationResource.error) && (
                <ErrorState message={eventResource.error || registrationResource.error} onRetry={() => { eventResource.reload(); registrationResource.reload(); }} />
            )}

            <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
                <Card className="xl:sticky xl:top-24 xl:h-fit">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="font-display text-2xl font-medium text-bphq-espresso">Events</h2>
                            <p className="mt-1 text-sm text-bphq-coffee">Choose an event to view its registrations.</p>
                        </div>
                        <StatusBadge status={`${eventMeta.total ?? events.length} events`} />
                    </div>

                    {!eventId && <SearchInput className="mt-4" onChange={(event) => setEventSearch(event.target.value)} placeholder="Search events" value={eventSearch} />}

                    <div className="mt-4 max-h-[62vh] space-y-2 overflow-y-auto pr-1">
                        {eventResource.loading ? <LoadingBlock rows={6} /> : events.length ? events.map((event) => {
                            const active = Number(event.id) === Number(selectedEventId);
                            return (
                                <button
                                    className={`w-full rounded-2xl border p-4 text-left transition ${active ? 'border-bphq-coffee bg-bphq-ivory shadow-sm' : 'border-slate-100 bg-white hover:border-bphq-chrome hover:bg-bphq-ivory/50'}`}
                                    key={event.id}
                                    onClick={() => setSelectedEventId(event.id)}
                                    type="button"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-bphq-espresso">{event.title}</p>
                                            <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                                                {formatDate(event.date)}{event.location ? ` / ${event.location}` : ''}
                                            </p>
                                        </div>
                                        <span className="rounded-full border border-bphq-chrome bg-white px-2.5 py-1 text-xs font-bold text-bphq-coffee">{event.registrations_count ?? 0}</span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                                        {statuses.map((item) => (
                                            <span className="flex items-center justify-between gap-1 rounded-lg bg-white px-2 py-1 text-slate-500" key={item}>
                                                <span className="truncate">{item}</span>
                                                <span className="text-bphq-espresso">{countFor(event, item)}</span>
                                            </span>
                                        ))}
                                    </div>
                                </button>
                            );
                        }) : (
                            <EmptyState description="Create events first, then registrations will be grouped here." icon="calendar" title="No events found" />
                        )}
                    </div>

                    <Pagination page={currentEventPage} pageCount={eventPageCount} onPageChange={setEventPage} />
                </Card>

                <Card>
                    {selectedEvent ? (
                        <>
                            <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge status={`${selectedEvent.registrations_count ?? 0} registrations`} />
                                    {selectedEvent.slug && (
                                        <a className="text-xs font-bold uppercase tracking-wide text-bphq-coffee hover:text-bphq-espresso" href={`/news-events/events/${selectedEvent.slug}`} rel="noreferrer" target="_blank">View event</a>
                                    )}
                                </div>
                                    <h2 className="mt-3 font-display text-3xl font-medium leading-tight text-bphq-espresso">{selectedEvent.title}</h2>
                                    <p className="mt-1 text-sm font-semibold text-slate-500">
                                        {formatDate(selectedEvent.date)}{selectedEvent.location ? ` / ${selectedEvent.location}` : ''}
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {statuses.map((item) => <StatusBadge key={item} status={`${item}: ${countFor(selectedEvent, item)}`} />)}
                                </div>
                            </div>

                            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
                                <SearchInput onChange={(event) => setAttendeeSearch(event.target.value)} placeholder="Search attendee, email, phone, or business" value={attendeeSearch} />
                                <label className="block">
                                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Status</span>
                                    <select className={inputClass} onChange={(event) => setStatus(event.target.value)} value={status}>
                                        <option value="all">All statuses</option>
                                        {statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                                    </select>
                                </label>
                                <Button onClick={resetAttendeeFilters} type="button" variant="secondary">Reset</Button>
                            </div>
                            <div className="mt-3 flex justify-end">
                                <Button onClick={exportSelectedEvent} type="button" variant="secondary">Export registrations CSV</Button>
                            </div>

                            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-500">{totalRegistrations} registrations shown for this event</p>
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Page {currentRegistrationPage} of {registrationPageCount}</p>
                            </div>

                            {registrationResource.loading ? <LoadingBlock rows={8} /> : rows.length ? (
                                <>
                                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
                                        <table className="w-full min-w-[980px] text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                                                    <th className="px-4 py-3 font-bold">Attendee</th>
                                                    <th className="px-4 py-3 font-bold">Contact</th>
                                                    <th className="px-4 py-3 font-bold">Business context</th>
                                                    <th className="px-4 py-3 font-bold">Registered</th>
                                                    <th className="px-4 py-3 font-bold">Status</th>
                                                    <th className="px-4 py-3 text-right font-bold">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map((registration) => (
                                                    <tr className="border-b border-slate-50 last:border-0" key={registration.id}>
                                                        <td className="px-4 py-3">
                                                            <p className="font-bold text-slate-900">{registration.name}</p>
                                                            <p className="mt-1 text-xs text-slate-400">#{registration.id}</p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="font-semibold text-slate-700">{registration.email}</p>
                                                            <p className="mt-1 text-xs text-slate-400">{registration.phone || 'No phone'}</p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="font-semibold text-slate-700">{registration.business_name || 'No business name'}</p>
                                                            <p className="mt-1 text-xs text-slate-400">{registration.professional_role || 'No role provided'}</p>
                                                            {registration.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{registration.notes}</p>}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm font-semibold text-slate-500">{formatDate(registration.created_at)}</td>
                                                        <td className="px-4 py-3">
                                                            <select className={inputClass} onChange={(event) => changeStatus(registration, event.target.value)} value={registration.status}>
                                                                {statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                                                            </select>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex justify-end">
                                                                <Button onClick={() => remove(registration)} type="button" variant="danger">Remove</Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <Pagination page={currentRegistrationPage} pageCount={registrationPageCount} onPageChange={setRegistrationPage} />
                                </>
                            ) : (
                                <EmptyState description="No registration matches this event and filter combination." icon="calendar" title="No registrations found" />
                            )}
                        </>
                    ) : (
                        <EmptyState description="Select an event from the left to view registrations." icon="calendar" title="No event selected" />
                    )}
                </Card>
            </div>
        </div>
    );
}
