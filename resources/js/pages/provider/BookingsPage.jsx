import { useMemo, useState } from 'react';
import {
    Avatar,
    Button,
    Card,
    Currency,
    EmptyState,
    ErrorState,
    LoadingBlock,
    PageHeader,
    SearchInput,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    formatDate,
    inputClass,
    useApiResource,
    useAsyncAction,
    useDashboardToast,
    useDebouncedValue,
} from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.bookings ?? value?.data ?? [];
const filters = ['all', 'pending', 'confirmed', 'completed', 'cancelled', 'rejected'];

export default function ProviderBookingsPage() {
    const [status, setStatus] = useState('all');
    const [query, setQuery] = useState('');
    const [selectedBooking, setSelectedBooking] = useState(null);
    const debouncedQuery = useDebouncedValue(query);
    const resource = useApiResource('/provider/bookings', [], { params: { status: status === 'all' ? undefined : status, search: debouncedQuery || undefined }, refreshInterval: 15000 });
    const [bookings, setBookings] = [normalize(resource.data), resource.setData];
    const { run, isBusy } = useAsyncAction();
    const { notify } = useDashboardToast();

    const visible = useMemo(() => normalize(bookings).filter((booking) => {
        const matchesStatus = status === 'all' || booking.status === status;
        const text = `${booking.customer?.name ?? ''} ${booking.service?.name ?? booking.service_name ?? ''}`.toLowerCase();
        return matchesStatus && text.includes(debouncedQuery.toLowerCase());
    }), [bookings, debouncedQuery, status]);

    const updateStatus = (booking, nextStatus) => run(`${booking.id}-${nextStatus}`, async () => {
        let rejectionReason;
        if (nextStatus === 'rejected' && booking.status === 'pending') {
            rejectionReason = window.prompt('Optional: tell the customer why you cannot accept this booking') || undefined;
        }
        try {
            const updated = await apiRequest('patch', `/provider/bookings/${booking.id}/status`, { status: nextStatus, rejection_reason: rejectionReason });
            setBookings((current) => normalize(current).map((item) => item.id === booking.id ? { ...item, ...(updated ?? {}), status: updated?.status ?? nextStatus } : item));
            notify(`Booking ${nextStatus}.`);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    });

    return (
        <div className="space-y-6">
            <PageHeader description="Accept requests, keep customers informed and complete appointments." eyebrow="Appointments" title="Bookings" />
            <Card>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {filters.map((item) => <button className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold capitalize transition ${status === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-900'}`} key={item} onClick={() => setStatus(item)} type="button">{item}</button>)}
                    </div>
                    <SearchInput className="w-full lg:max-w-xs" onChange={(event) => setQuery(event.target.value)} placeholder="Search customer or service" value={query} />
                </div>

                {resource.error && <div className="mt-5"><ErrorState message={resource.error} onRetry={resource.reload} /></div>}
                {resource.loading ? <div className="mt-5"><LoadingBlock rows={5} /></div> : visible.length ? (
                    <div className="mt-5 space-y-3">
                        {visible.map((booking) => (
                            <article className="rounded-2xl border border-slate-100 p-4 transition hover:border-slate-200" key={booking.id}>
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                        <Avatar name={booking.customer?.name} src={booking.customer?.profile_photo} />
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="truncate text-sm font-bold text-slate-950">{booking.customer?.name ?? 'Customer'}</h2>
                                                <StatusBadge status={booking.status} />
                                            </div>
                                            <p className="mt-1 truncate text-xs text-slate-500">{booking.service?.name ?? booking.service_name ?? 'Beauty service'} · <Currency value={booking.amount ?? booking.service?.price} /></p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-sm sm:flex sm:items-center">
                                        <div className="rounded-xl bg-slate-50 px-3 py-2 sm:min-w-32">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Date</p>
                                            <p className="mt-0.5 font-semibold text-slate-700">{formatDate(booking.date ?? booking.starts_at, { year: undefined })}</p>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 px-3 py-2 sm:min-w-24">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Time</p>
                                            <p className="mt-0.5 font-semibold text-slate-700">{booking.time ?? booking.start_time ?? '—'}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button onClick={() => setSelectedBooking(booking)} type="button" variant="secondary">Details</Button>
                                        {booking.status === 'pending' && <><Button busy={isBusy(`${booking.id}-confirmed`)} onClick={() => updateStatus(booking, 'confirmed')} type="button">Accept</Button><Button busy={isBusy(`${booking.id}-rejected`)} onClick={() => updateStatus(booking, 'rejected')} type="button" variant="danger">Decline</Button></>}
                                        {booking.status === 'confirmed' && <><Button busy={isBusy(`${booking.id}-completed`)} onClick={() => updateStatus(booking, 'completed')} type="button" variant="soft">Mark complete</Button><Button busy={isBusy(`${booking.id}-cancelled`)} onClick={() => updateStatus(booking, 'cancelled')} type="button" variant="secondary">Cancel</Button></>}
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : <EmptyState description="Try another filter, or check back when customers send requests." icon="booking" title="No bookings found" />}
            </Card>
            {selectedBooking && (
                <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setSelectedBooking(null)}>
                    <Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wide text-fuchsia-700">Booking details</p>
                                <h2 className="mt-1 text-xl font-black text-slate-950">{selectedBooking.service?.name ?? selectedBooking.service_name ?? 'Beauty service'}</h2>
                            </div>
                            <Button onClick={() => setSelectedBooking(null)} type="button" variant="secondary">Close</Button>
                        </div>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <DetailBlock title="Customer" items={[
                                ['Name', selectedBooking.customer?.name ?? 'Customer'],
                                ['Email', selectedBooking.customer?.email ?? 'Not provided'],
                                ['Phone', selectedBooking.customer?.phone ?? 'Not provided'],
                            ]} />
                            <DetailBlock title="Appointment" items={[
                                ['Status', selectedBooking.status],
                                ['Date', formatDate(selectedBooking.date ?? selectedBooking.starts_at)],
                                ['Time', selectedBooking.time ?? selectedBooking.start_time ?? 'Not set'],
                                ['Amount', selectedBooking.payment?.amount ? `${selectedBooking.payment.currency ?? 'NGN'} ${Number(selectedBooking.payment.amount).toLocaleString()}` : 'Not set'],
                                ['Payment', selectedBooking.payment?.status ?? 'unpaid'],
                            ]} />
                        </div>
                        {selectedBooking.notes && <div className="mt-4 rounded-2xl border border-slate-100 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Customer notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedBooking.notes}</p></div>}
                        {selectedBooking.custom_fields?.length ? (
                            <div className="mt-4 rounded-2xl border border-slate-100 p-4">
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Extra booking answers</p>
                                <div className="mt-3 space-y-3">
                                    {selectedBooking.custom_fields.map((field, index) => (
                                        <div key={index}>
                                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{field.label}</p>
                                            <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-800">{field.type === 'checkbox' ? (field.answer ? 'Yes' : 'No') : field.answer || 'No answer'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </Card>
                </div>
            )}
        </div>
    );
}

function DetailBlock({ title, items }) {
    return (
        <div className="rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</p>
            <div className="mt-3 space-y-2">
                {items.map(([label, value]) => (
                    <div className="flex justify-between gap-3 text-sm" key={label}>
                        <span className="text-slate-400">{label}</span>
                        <span className="text-right font-semibold text-slate-800">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
