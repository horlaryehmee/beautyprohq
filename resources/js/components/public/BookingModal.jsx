import { useEffect, useMemo, useState } from 'react';
import api, { apiError, ensureCsrfCookie, unwrap } from '../../lib/api';
import { currency, providerIdentity } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Icon from '../ui/Icon';
import { InlineAlert } from '../ui/Feedback';

function toMinutes(time) {
    const [hour, minute] = String(time).slice(0, 5).split(':').map(Number);
    return (hour * 60) + minute;
}

function fromMinutes(total) {
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function buildRange(start, end, duration = 30) {
    const slots = [];
    let cursor = toMinutes(start);
    const stop = toMinutes(end);
    let guard = 0;

    while (Number.isFinite(cursor) && Number.isFinite(stop) && cursor + duration <= stop && guard < 48) {
        slots.push(fromMinutes(cursor));
        cursor += 30;
        guard += 1;
    }

    return slots;
}

function localDateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeSlots(payload, duration = 30, selectedDate = '') {
    const source = payload?.slots ?? payload?.available_slots ?? payload?.availability ?? payload ?? [];
    if (!Array.isArray(source)) return [];

    const blocks = Array.isArray(payload?.blocked) ? payload.blocked : [];
    const hasWholeDayBlock = blocks.some((block) => {
        if (typeof block === 'string') return !block.includes(':');
        return block?.all_day || block?.whole_day || (!block?.start_time && !block?.end_time);
    });
    if (hasWholeDayBlock) return [];

    const bookedTimes = new Set((payload?.booked_times ?? []).map((item) => String(typeof item === 'string' ? item : item?.time ?? item?.start_time).slice(0, 5)));
    const timedBlocks = blocks
        .filter((block) => typeof block === 'object' && block?.start_time && block?.end_time)
        .map((block) => [toMinutes(block.start_time), toMinutes(block.end_time)]);

    const results = source.flatMap((item) => {
        if (typeof item === 'string') return [item.slice(0, 5)];
        if (item?.time) return [String(item.time).slice(0, 5)];
        if (item?.start_time && item?.end_time) return buildRange(item.start_time, item.end_time, duration);
        if (item?.start_time) return [String(item.start_time).slice(0, 5)];
        return [];
    });

    return [...new Set(results)]
        .filter((slot) => {
            if (bookedTimes.has(slot)) return false;
            const start = toMinutes(slot);
            const end = start + duration;
            const now = new Date();
            const today = localDateString(now);
            if (selectedDate === today && start <= (now.getHours() * 60) + now.getMinutes()) return false;
            return !timedBlocks.some(([blockStart, blockEnd]) => start < blockEnd && end > blockStart);
        })
        .sort();
}

function displayTime(value) {
    if (!value) return '';
    const [hour, minute] = value.split(':').map(Number);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function fullDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function monthDateOptions(offset = 0) {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    const firstAllowed = offset === 0 ? today.getDate() : 1;
    const count = Math.max(0, end.getDate() - firstAllowed + 1);

    return Array.from({ length: count }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth(), firstAllowed + index);

        return {
            value: localDateString(date),
            weekday: new Intl.DateTimeFormat('en-NG', { weekday: 'short' }).format(date),
            day: new Intl.DateTimeFormat('en-NG', { day: '2-digit' }).format(date),
            month: new Intl.DateTimeFormat('en-NG', { month: 'short' }).format(date),
        };
    });
}

function monthLabel(offset = 0) {
    const date = new Date();
    date.setMonth(date.getMonth() + offset);
    return new Intl.DateTimeFormat('en-NG', { month: 'long', year: 'numeric' }).format(date);
}

function ProviderSummary({ pro }) {
    return (
        <div className="flex items-center gap-3">
            {pro.photo ? <img src={pro.photo} alt="" className="size-14 rounded-full object-cover" /> : <span className="grid size-14 place-items-center rounded-full bg-[#34231c] font-display text-xl text-white">{String(pro.name || 'B').slice(0, 1)}</span>}
            <div className="min-w-0">
                <p className="truncate font-bold text-[#34231c]">{pro.name}</p>
                <p className="truncate text-sm text-stone-500">{pro.profession}</p>
                {pro.cardLocation && <p className="mt-0.5 truncate text-xs font-bold text-stone-400">{pro.cardLocation}</p>}
            </div>
        </div>
    );
}

function SummaryRow({ icon, label, value }) {
    return (
        <div className="flex gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#8b4b59]"><Icon name={icon} size={16} /></span>
            <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">{label}</p>
                <p className="mt-0.5 text-sm font-bold leading-5 text-[#34231c]">{value}</p>
            </div>
        </div>
    );
}

function Stepper({ step }) {
    const steps = ['Date', 'Time', 'Details', 'Payment'];
    return (
        <div className="flex gap-2 overflow-x-auto pb-1">
            {steps.map((label, index) => {
                const active = step === index + 1;
                const done = step > index + 1;
                return (
                    <div key={label} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-black uppercase tracking-wide ${active ? 'bg-[#34231c] text-white' : done ? 'bg-emerald-50 text-emerald-700' : 'bg-[#f4efe9] text-stone-500'}`}>
                        <span className="grid size-6 place-items-center rounded-full bg-white/20">{done ? <Icon name="check" size={13} /> : index + 1}</span>
                        {label}
                    </div>
                );
            })}
        </div>
    );
}

export default function BookingModal({ open, onClose, provider, services = [], initialService, onBooked, standalone = false }) {
    const pro = providerIdentity(provider);
    const providerId = provider?.provider_id ?? pro.id ?? provider?.id;
    const { user } = useAuth();
    const toast = useToast();
    const [step, setStep] = useState(1);
    const [serviceId, setServiceId] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [notes, setNotes] = useState('');
    const [customFields, setCustomFields] = useState({});
    const [redeemLoyalty, setRedeemLoyalty] = useState(false);
    const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
    const [availabilityData, setAvailabilityData] = useState(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [checkoutUrl, setCheckoutUrl] = useState('');
    const [monthOffset, setMonthOffset] = useState(0);

    const availableServices = useMemo(() => initialService ? [initialService] : services, [initialService, services]);
    const selectedService = useMemo(() => availableServices.find((item) => String(item.id) === String(serviceId)), [availableServices, serviceId]);
    const days = useMemo(() => monthDateOptions(monthOffset), [monthOffset]);
    const bookingFields = useMemo(() => (Array.isArray(provider?.booking_form_fields) ? provider.booking_form_fields : []).filter((field) => field?.label).slice(0, 8), [provider]);
    const slots = useMemo(() => normalizeSlots(availabilityData, Number(selectedService?.duration_minutes) || 30, date), [availabilityData, selectedService?.duration_minutes, date]);
    const detailsComplete = customer.name.trim() && customer.email.trim() && customer.phone.trim();

    useEffect(() => {
        if (!open) return undefined;
        setStep(1);
        setServiceId(String(initialService?.id ?? availableServices[0]?.id ?? ''));
        setDate('');
        setTime('');
        setNotes('');
        setCustomFields({});
        setRedeemLoyalty(false);
        setCustomer({ name: user?.role === 'customer' ? user.name ?? '' : '', email: user?.role === 'customer' ? user.email ?? '' : '', phone: user?.phone ?? '' });
        setAvailabilityData(null);
        setCheckoutUrl('');
        setMonthOffset(0);
        setError('');
        if (!standalone) {
            document.body.style.overflow = 'hidden';
        }
        const onKeyDown = (event) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKeyDown);
        return () => {
            if (!standalone) {
                document.body.style.overflow = '';
            }
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open, initialService, availableServices, onClose, standalone, user]);

    useEffect(() => {
        if (!open || !date || !pro.slug) return;
        let active = true;
        setLoadingSlots(true);
        setTime('');
        setError('');
        api.get(`/providers/${pro.slug}/availability`, { params: { date } })
            .then((response) => active && setAvailabilityData(unwrap(response)))
            .catch((requestError) => active && setError(apiError(requestError, 'We could not load availability for this date.').message))
            .finally(() => active && setLoadingSlots(false));
        return () => { active = false; };
    }, [open, date, pro.slug]);

    useEffect(() => { setTime(''); }, [serviceId]);

    if (!open) return null;

    function nextStep() {
        setError('');
        if (step === 1 && (!serviceId || !date)) {
            setError('Choose a service and date to continue.');
            return;
        }
        if (step === 2 && !time) {
            setError('Choose an available time to continue.');
            return;
        }
        if (step === 3 && !detailsComplete) {
            setError('Name, email and phone number are required.');
            return;
        }
        setStep((current) => Math.min(4, current + 1));
    }

    async function createBookingAndCheckout() {
        if (!serviceId || !date || !time || !detailsComplete) {
            setError('Complete all required booking steps before payment.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            await ensureCsrfCookie();
            const payload = {
                provider_id: providerId,
                service_id: Number(serviceId),
                date,
                time,
                notes: notes.trim(),
                custom_fields: customFields,
                redeem_loyalty: redeemLoyalty || undefined,
            };
            const response = await api.post(user?.role === 'customer' ? '/bookings' : '/guest-bookings', { ...payload, customer });
            const booking = unwrap(response);
            const payment = booking?.payment;
            const token = payment?.metadata?.payment_token;
            onBooked?.(booking);

            if (payment?.id && token && payment.status !== 'paid' && Number(payment.amount ?? 0) > 0) {
                const checkout = unwrap(await api.post(`/booking-payments/${payment.id}/checkout`, { payment_token: token }));
                setCheckoutUrl(checkout.authorization_url);
                toast.success('Booking created. Continue to payment to confirm.');
                return;
            }

            toast.success(response?.data?.message || 'Booking request sent to the professional.');
            window.location.href = `/booking-confirmation?reference=${encodeURIComponent(payment?.reference ?? '')}&payment_token=${encodeURIComponent(token ?? '')}`;
        } catch (requestError) {
            setError(apiError(requestError, 'Your booking request could not be sent.').message);
        } finally {
            setSubmitting(false);
        }
    }

    function renderProviderQuestions() {
        if (!bookingFields.length) return null;
        return (
            <div className="space-y-3 rounded-2xl border border-stone-200 bg-[#fbf8f4] p-4">
                <p className="text-xs font-black uppercase tracking-wide text-[#8b4b59]">Provider questions</p>
                {bookingFields.map((field, index) => {
                    const key = `field_${index}`;
                    const type = field.type ?? 'text';
                    const label = `${field.label}${field.required ? ' *' : ''}`;

                    if (type === 'textarea') return <FormField key={key} as="textarea" label={label} value={customFields[key] ?? ''} onChange={(event) => setCustomFields((current) => ({ ...current, [key]: event.target.value }))} maxLength={1000} required={Boolean(field.required)} />;
                    if (type === 'select') {
                        return (
                            <label className="block text-sm font-bold text-[#34231c]" key={key}>
                                {label}
                                <select className="mt-2 min-h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold text-[#34231c] outline-none focus:border-[#8b4b59]" onChange={(event) => setCustomFields((current) => ({ ...current, [key]: event.target.value }))} required={Boolean(field.required)} value={customFields[key] ?? ''}>
                                    <option value="">Choose an option</option>
                                    {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                            </label>
                        );
                    }
                    if (type === 'checkbox') return <label className="flex items-start gap-3 text-sm font-semibold leading-6 text-[#34231c]" key={key}><input checked={Boolean(customFields[key])} className="mt-1 size-4 accent-[#8b4b59]" onChange={(event) => setCustomFields((current) => ({ ...current, [key]: event.target.checked }))} required={Boolean(field.required)} type="checkbox" />{field.label}</label>;
                    return <FormField key={key} label={label} value={customFields[key] ?? ''} onChange={(event) => setCustomFields((current) => ({ ...current, [key]: event.target.value }))} maxLength={255} required={Boolean(field.required)} />;
                })}
            </div>
        );
    }

    const content = (
            <section className={`flex w-full flex-col overflow-hidden bg-white ${standalone ? 'min-h-[calc(100dvh-5rem)] rounded-[1.5rem] border border-stone-200 shadow-sm' : 'h-[100dvh] rounded-t-[2rem] shadow-2xl sm:h-auto sm:max-h-[94vh] sm:max-w-6xl sm:rounded-[2rem]'}`} role={standalone ? undefined : 'dialog'} aria-modal={standalone ? undefined : true} aria-labelledby="booking-title">
                <div className="shrink-0 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#8b4b59]">Booking</p>
                            <h2 id="booking-title" className="mt-0.5 truncate font-display text-xl font-normal text-[#34231c] sm:text-2xl">Book with {pro.name}</h2>
                        </div>
                        <button type="button" className="grid size-10 place-items-center rounded-full border border-stone-200 bg-white text-stone-500 hover:text-[#34231c]" onClick={onClose} aria-label={standalone ? 'Go back' : 'Close booking form'}><Icon name={standalone ? 'chevronLeft' : 'x'} /></button>
                    </div>
                    <div className="mt-3"><Stepper step={step} /></div>
                </div>

                {user && user.role !== 'customer' ? (
                    <div className="p-7"><InlineAlert>Provider and admin accounts cannot create customer bookings from this popup.</InlineAlert></div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                        {error && <div className="border-b border-stone-200 p-4 sm:px-6"><InlineAlert>{error}</InlineAlert></div>}

                        <div className="grid min-h-0 flex-1 lg:grid-cols-[310px_1fr]">
                            <aside className="hidden border-b border-stone-200 bg-[#fbf8f4] p-5 lg:block lg:border-b-0 lg:border-r lg:p-6">
                                <ProviderSummary pro={pro} />
                                <div className="mt-7 space-y-4">
                                    <SummaryRow icon="scissors" label="Service" value={selectedService?.name ?? 'Choose a service'} />
                                    <SummaryRow icon="calendar" label="Date" value={date ? fullDate(date) : 'Choose a date'} />
                                    <SummaryRow icon="clock" label="Time" value={time ? displayTime(time) : 'Choose a time'} />
                                </div>
                                {selectedService && (
                                    <div className="mt-7 rounded-2xl border border-[#eadfd5] bg-white p-4">
                                        <p className="text-xs font-black uppercase tracking-wide text-[#8b4b59]">Total</p>
                                        <p className="mt-1 font-display text-3xl font-normal text-[#34231c]">{currency(selectedService.price, selectedService.currency ?? 'NGN')}</p>
                                        <p className="mt-1 text-xs font-bold text-stone-500">{selectedService.duration_minutes ?? 30} minutes</p>
                                        {selectedService.description && <p className="mt-3 text-xs leading-5 text-stone-600">{selectedService.description}</p>}
                                        {user?.role === 'customer' && provider?.loyalty_enabled && Number(provider?.loyalty_points_required ?? 0) > 0 && (
                                            <label className="mt-4 flex items-start gap-3 rounded-2xl bg-[#fbf7f1] p-3 text-xs font-bold leading-5 text-[#34231c]">
                                                <input checked={redeemLoyalty} className="mt-0.5 size-4 accent-[#8b4b59]" onChange={(event) => setRedeemLoyalty(event.target.checked)} type="checkbox" />
                                                Use {Number(provider.loyalty_points_required).toLocaleString()} loyalty points for this booking request.
                                            </label>
                                        )}
                                    </div>
                                )}
                            </aside>

                            <main className="flex min-h-0 min-w-0 flex-col overflow-y-auto px-4 py-4 pb-24 lg:p-6">
                                {step === 1 && (
                                    <div className="space-y-5">
                                        <section>
                                            <div className="flex items-end justify-between gap-3">
                                                <div>
                                                    <h3 className="font-display text-xl font-normal text-[#34231c] sm:text-2xl">{initialService ? 'Selected service' : 'Choose service'}</h3>
                                                    <p className="text-xs font-semibold text-stone-500">{initialService ? 'This booking is based on the service selected from the profile.' : 'Swipe to see more services.'}</p>
                                                </div>
                                                {selectedService && <span className="shrink-0 rounded-full bg-[#f4efe9] px-3 py-1 text-xs font-black text-[#7d2e3c]">{currency(selectedService.price, selectedService.currency ?? 'NGN')}</span>}
                                            </div>
                                            <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
                                                {availableServices.map((service) => (
                                                    <button key={service.id} type="button" onClick={() => setServiceId(String(service.id))} className={`min-w-[76vw] snap-start rounded-2xl border p-4 text-left transition sm:min-w-0 ${String(serviceId) === String(service.id) ? 'border-[#34231c] bg-[#34231c] text-white' : 'border-stone-200 bg-white text-[#34231c] hover:border-[#c9bdb2]'}`}>
                                                        <p className="line-clamp-1 font-bold">{service.name}</p>
                                                        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-black">
                                                            <span className={String(serviceId) === String(service.id) ? 'text-white/70' : 'text-stone-500'}>{service.duration_minutes ?? 30} mins</span>
                                                            <span className={String(serviceId) === String(service.id) ? 'text-white' : 'text-[#7d2e3c]'}>{currency(service.price, service.currency ?? 'NGN')}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </section>

                                        <section>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="font-display text-xl font-normal text-[#34231c] sm:text-2xl">Pick date</h3>
                                                    <p className="text-xs font-semibold text-stone-500">Swipe days or change month.</p>
                                                </div>
                                                <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-white p-1">
                                                    <button type="button" disabled={monthOffset === 0} onClick={() => setMonthOffset((current) => Math.max(0, current - 1))} className="grid size-8 place-items-center rounded-full text-stone-500 disabled:opacity-30"><Icon name="chevronLeft" size={16} /></button>
                                                    <span className="min-w-28 text-center text-xs font-black text-[#34231c]">{monthLabel(monthOffset)}</span>
                                                    <button type="button" onClick={() => setMonthOffset((current) => current + 1)} className="grid size-8 place-items-center rounded-full text-stone-500"><Icon name="chevronRight" size={16} /></button>
                                                </div>
                                            </div>
                                            <div className="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-2">
                                                {days.map((item) => (
                                                    <button key={item.value} type="button" onClick={() => setDate(item.value)} className={`min-h-20 min-w-16 snap-start rounded-2xl border p-2 text-center transition ${date === item.value ? 'border-[#34231c] bg-[#34231c] text-white shadow-lg shadow-stone-200' : 'border-stone-200 bg-white text-[#34231c] hover:border-[#c9bdb2] hover:bg-[#fbf7f1]'}`}>
                                                        <span className="block text-[10px] font-black uppercase tracking-wide opacity-70">{item.weekday}</span>
                                                        <span className="mt-1 block font-display text-2xl font-normal">{item.day}</span>
                                                        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide opacity-70">{item.month}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <label className="mt-2 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-500">
                                                Other date
                                                <input type="date" min={localDateString()} value={date} onChange={(event) => setDate(event.target.value)} className="ml-auto bg-transparent text-sm font-bold text-[#34231c] outline-none" />
                                            </label>
                                        </section>
                                    </div>
                                )}

                                {step === 2 && (
                                    <section>
                                        <div className="flex items-end justify-between gap-3">
                                            <div>
                                                <h3 className="font-display text-xl font-normal text-[#34231c] sm:text-2xl">Pick time</h3>
                                                <p className="mt-1 text-xs font-semibold leading-5 text-stone-500">{date ? fullDate(date) : 'Select a date to view available times.'}</p>
                                            </div>
                                            <button type="button" onClick={() => setStep(1)} className="shrink-0 rounded-full bg-[#f4efe9] px-3 py-2 text-xs font-black text-[#34231c]">Change date</button>
                                        </div>
                                        <div className="mt-4 min-h-48">
                                            {loadingSlots ? (
                                                <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-5 text-sm font-semibold text-stone-500"><span className="loading-ring loading-ring-small" /> Checking calendar...</div>
                                            ) : slots.length ? (
                                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                                                    {slots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} className={`min-h-12 rounded-xl border px-2 text-xs font-black transition sm:text-sm ${time === slot ? 'border-[#34231c] bg-[#34231c] text-white' : 'border-stone-200 bg-white text-[#34231c] hover:border-[#c9bdb2] hover:bg-[#fbf7f1]'}`}>{displayTime(slot)}</button>)}
                                                </div>
                                            ) : (
                                                <p className="rounded-2xl border border-dashed border-stone-200 bg-[#fbf8f4] p-5 text-sm leading-6 text-stone-500">No open times for this date. Go back and try another day.</p>
                                            )}
                                        </div>
                                    </section>
                                )}

                                {step === 3 && (
                                    <section className="mx-auto max-w-2xl space-y-4">
                                        <div>
                                            <h3 className="font-display text-xl font-normal text-[#34231c] sm:text-2xl">Booking details</h3>
                                            <p className="mt-1 text-xs font-semibold leading-5 text-stone-500">Name, email and phone number are required. Note is optional.</p>
                                        </div>
                                        <div className="grid gap-3 rounded-2xl border border-stone-200 bg-[#fbf8f4] p-4 sm:grid-cols-3">
                                            <p className="text-xs font-black uppercase tracking-wide text-[#8b4b59]">Person booking</p>
                                            <FormField label="Name" value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" required />
                                            <FormField label="Email" type="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" required />
                                            <FormField label="Phone number" value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} placeholder="+234..." required />
                                        </div>
                                        {renderProviderQuestions()}
                                        <FormField as="textarea" label="Booking note (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Share any extra details..." />
                                    </section>
                                )}

                                {step === 4 && (
                                    <section className="mx-auto max-w-2xl">
                                        <h3 className="font-display text-2xl font-normal text-[#34231c]">Review and payment</h3>
                                        <div className="mt-5 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-[#fffdf8] p-4 text-sm">
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Service</span><span className="font-black text-[#34231c]">{selectedService?.name}</span></div>
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Date</span><span className="font-black text-[#34231c]">{fullDate(date)}</span></div>
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Time</span><span className="font-black text-[#34231c]">{displayTime(time)}</span></div>
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Customer</span><span className="font-black text-[#34231c]">{customer.name}</span></div>
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Amount</span><span className="font-black text-[#7d2e3c]">{currency(selectedService?.price, selectedService?.currency ?? 'NGN')}</span></div>
                                        </div>
                                        {!checkoutUrl ? (
                                            <Button type="button" className="mt-6 w-full rounded-full bg-[#34231c] hover:bg-[#4a2f26]" disabled={submitting} onClick={createBookingAndCheckout}>
                                                {submitting ? 'Creating booking...' : 'Create booking and continue to payment'} <Icon name="arrow" size={16} />
                                            </Button>
                                        ) : (
                                            <a className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#34231c] px-5 text-sm font-black text-white transition hover:bg-[#4a2f26]" href={checkoutUrl}>
                                                Pay securely now <Icon name="arrow" size={16} />
                                            </a>
                                        )}
                                        <p className="mt-3 text-center text-xs leading-5 text-stone-500">After successful payment, the gateway returns to the booking confirmation page.</p>
                                    </section>
                                )}

                                <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col-reverse gap-2 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:justify-between sm:bg-white sm:px-0">
                                    <Button variant="ghost" onClick={step === 1 ? onClose : () => setStep((current) => Math.max(1, current - 1))}>{step === 1 ? 'Cancel' : 'Back'}</Button>
                                    {step < 4 && <Button type="button" onClick={nextStep} className="rounded-full bg-[#34231c] hover:bg-[#4a2f26]">Continue <Icon name="arrow" size={16} /></Button>}
                                </div>
                            </main>
                        </div>
                    </div>
                )}
            </section>
    );

    if (standalone) {
        return content;
    }

    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#1f1512]/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            {content}
        </div>
    );
}
