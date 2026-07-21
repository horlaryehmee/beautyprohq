import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Avatar,
    Button,
    Card,
    Currency,
    EmptyState,
    ErrorState,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    formatDate,
    useApiResource,
    useAsyncAction,
    useDashboardToast,
} from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.bookings ?? value?.data ?? [];
const filters = ['all', 'pending', 'confirmed', 'completed', 'cancelled', 'rejected'];

export default function CustomerBookingsPage() {
    const resource = useApiResource('/customer/bookings', [], { refreshInterval: 15000 });
    const [filter, setFilter] = useState('all');
    const { run, isBusy } = useAsyncAction();
    const { notify } = useDashboardToast();
    const bookings = normalize(resource.data);
    const visible = useMemo(() => bookings.filter((booking) => filter === 'all' || booking.status === filter), [bookings, filter]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const reference = params.get('payment_reference') || params.get('reference');
        const sessionId = params.get('session_id');
        if (!reference && !sessionId) return;

        let active = true;
        apiRequest('post', '/customer/booking-payments/verify', { reference, session_id: sessionId })
            .then(() => {
                if (!active) return;
                notify('Payment verified.');
                resource.reload();
            })
            .catch((error) => active && notify(apiErrorMessage(error), 'error'))
            .finally(() => {
                if (!active) return;
                window.history.replaceState({}, '', window.location.pathname);
            });

        return () => { active = false; };
    }, []);

    const cancel = (booking) => run(booking.id, async () => {
        if (!window.confirm('Cancel this booking?')) return;

        try {
            const updated = await apiRequest('patch', `/customer/bookings/${booking.id}/cancel`);
            resource.setData((current) => normalize(current).map((item) => item.id === booking.id ? { ...item, ...(updated ?? {}), status: 'cancelled' } : item));
            notify('Booking cancelled.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    });

    const pay = (booking) => run(`pay-${booking.id}`, async () => {
        try {
            const payment = booking.payment;
            const checkout = await apiRequest('post', `/customer/booking-payments/${payment.id}/checkout`);
            window.location.href = checkout.authorization_url;
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    });

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<Link to="/directory"><Button>Book a service</Button></Link>}
                description="See the latest status of every appointment request."
                eyebrow="Appointments"
                title="My bookings"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card>
                <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                    {filters.map((item) => (
                        <button
                            className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold capitalize ${filter === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`}
                            key={item}
                            onClick={() => setFilter(item)}
                            type="button"
                        >
                            {item}
                        </button>
                    ))}
                </div>

                {resource.loading ? (
                    <LoadingBlock rows={5} />
                ) : visible.length ? (
                    <div className="space-y-3">
                        {visible.map((booking) => {
                            const provider = booking.provider?.user ?? booking.provider ?? {};
                            const payment = booking.payment;
                            const canPay = payment && payment.status !== 'paid';

                            return (
                                <article className="rounded-2xl border border-slate-100 p-4" key={booking.id}>
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                            <Avatar name={provider.name} src={booking.provider?.profile_photo ?? provider.profile_photo} />
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h2 className="truncate text-sm font-bold text-slate-950">{booking.service?.name ?? booking.service_name}</h2>
                                                    <StatusBadge status={booking.status} />
                                                    {payment && <StatusBadge status={payment.status} />}
                                                </div>
                                                <p className="truncate text-xs text-slate-500">
                                                    {provider.name ?? 'Beauty professional'} · <Currency value={payment?.amount ?? booking.amount ?? booking.service?.price} currency={payment?.currency ?? booking.service?.currency ?? 'NGN'} />
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                                            <div className="rounded-xl bg-slate-50 px-3 py-2">
                                                <p className="text-[10px] font-bold uppercase text-slate-400">Date & time</p>
                                                <p className="text-sm font-semibold text-slate-800">{formatDate(booking.date ?? booking.starts_at, { year: undefined })} · {booking.time ?? booking.start_time}</p>
                                            </div>
                                            <Link to={`/providers/${booking.provider?.slug ?? booking.provider_id}`}>
                                                <Button type="button" variant="secondary">View provider</Button>
                                            </Link>
                                            {canPay && <Button busy={isBusy(`pay-${booking.id}`)} onClick={() => pay(booking)} type="button">Pay now</Button>}
                                            {['pending', 'confirmed'].includes(booking.status) && (
                                                <Button busy={isBusy(booking.id)} onClick={() => cancel(booking)} type="button" variant="danger">Cancel</Button>
                                            )}
                                        </div>
                                    </div>

                                    {booking.rejection_reason && (
                                        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">Reason: {booking.rejection_reason}</p>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState
                        action={<Link to="/directory"><Button variant="soft">Find a provider</Button></Link>}
                        description="No bookings match this filter."
                        icon="booking"
                        title="No bookings found"
                    />
                )}
            </Card>
        </div>
    );
}
