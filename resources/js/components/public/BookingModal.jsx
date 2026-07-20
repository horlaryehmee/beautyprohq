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

function dateOptions(days = 21) {
    return Array.from({ length: days }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index);

        return {
            value: localDateString(date),
            weekday: new Intl.DateTimeFormat('en-NG', { weekday: 'short' }).format(date),
            day: new Intl.DateTimeFormat('en-NG', { day: '2-digit' }).format(date),
            month: new Intl.DateTimeFormat('en-NG', { month: 'short' }).format(date),
        };
    });
}

function ProviderSummary({ pro }) {
    return (
        <div className="flex items-center gap-3">
            {pro.photo ? (
                <img src={pro.photo} alt="" className="size-14 rounded-full object-cover" />
            ) : (
                <span className="grid size-14 place-items-center rounded-full bg-[#34231c] font-display text-xl text-white">{String(pro.name || 'B').slice(0, 1)}</span>
            )}
            <div className="min-w-0">
                <p className="truncate font-bold text-[#34231c]">{pro.name}</p>
                <p className="truncate text-sm text-stone-500">{pro.profession}</p>
                {pro.location && <p className="mt-0.5 truncate text-xs font-bold text-stone-400">{pro.location}</p>}
            </div>
        </div>
    );
}

function SummaryRow({ icon, label, value }) {
    return (
        <div className="flex gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#8b4b59]">
                <Icon name={icon} size={16} />
            </span>
            <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">{label}</p>
                <p className="mt-0.5 text-sm font-bold leading-5 text-[#34231c]">{value}</p>
            </div>
        </div>
    );
}

export default function BookingModal({ open, onClose, provider, services = [], initialService, onBooked }) {
    const pro = providerIdentity(provider);
    const providerId = provider?.provider_id ?? pro.id ?? provider?.id;
    const { user } = useAuth();
    const toast = useToast();
    const [serviceId, setServiceId] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [notes, setNotes] = useState('');
    const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
    const [availabilityData, setAvailabilityData] = useState(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const selectedService = useMemo(() => services.find((item) => String(item.id) === String(serviceId)), [services, serviceId]);
    const days = useMemo(() => dateOptions(21), []);
    const slots = useMemo(
        () => normalizeSlots(availabilityData, Number(selectedService?.duration_minutes) || 30, date),
        [availabilityData, selectedService?.duration_minutes, date],
    );

    useEffect(() => {
        if (!open) return undefined;
        setServiceId(String(initialService?.id ?? services[0]?.id ?? ''));
        setDate('');
        setTime('');
        setNotes('');
        setCustomer({ name: user?.role === 'customer' ? user.name ?? '' : '', email: user?.role === 'customer' ? user.email ?? '' : '', phone: user?.phone ?? '' });
        setAvailabilityData(null);
        setError('');
        document.body.style.overflow = 'hidden';
        const onKeyDown = (event) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open, initialService, services, onClose, user]);

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

    useEffect(() => {
        setTime('');
    }, [serviceId]);

    if (!open) return null;

    async function handleSubmit(event) {
        event.preventDefault();
        if (!serviceId || !date || !time) {
            setError('Choose a service, date, and available time to continue.');
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
                notes: notes.trim() || undefined,
            };
            const response = await api.post(user?.role === 'customer' ? '/bookings' : '/guest-bookings', user?.role === 'customer' ? payload : { ...payload, customer });
            const booking = unwrap(response);
            toast.success(response?.data?.message || 'Booking request sent to the professional.');
            onBooked?.(booking);
            onClose();
        } catch (requestError) {
            setError(apiError(requestError, 'Your booking request could not be sent.').message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#1f1512]/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section className="max-h-[94vh] w-full overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:max-w-6xl sm:rounded-[2rem]" role="dialog" aria-modal="true" aria-labelledby="booking-title">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#8b4b59]">Appointment request</p>
                        <h2 id="booking-title" className="mt-1 truncate font-display text-2xl font-normal text-[#34231c]">Book with {pro.name}</h2>
                    </div>
                    <button type="button" className="grid size-10 place-items-center rounded-full border border-stone-200 bg-white text-stone-500 hover:text-[#34231c]" onClick={onClose} aria-label="Close booking form">
                        <Icon name="x" />
                    </button>
                </div>

                {user && user.role !== 'customer' ? (
                    <div className="p-7"><InlineAlert>Provider and admin accounts cannot create customer bookings from this popup.</InlineAlert></div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        {error && <div className="border-b border-stone-200 p-4 sm:px-6"><InlineAlert>{error}</InlineAlert></div>}

                        <div className="grid lg:grid-cols-[310px_1fr_330px]">
                            <aside className="border-b border-stone-200 bg-[#fbf8f4] p-5 lg:border-b-0 lg:border-r lg:p-6">
                                <ProviderSummary pro={pro} />

                                <div className="mt-7 space-y-4">
                                    <SummaryRow icon="scissors" label="Service" value={selectedService?.name ?? 'Choose a service'} />
                                    <SummaryRow icon="clock" label="Duration" value={selectedService?.duration_minutes ? `${selectedService.duration_minutes} minutes` : 'Varies'} />
                                    <SummaryRow icon="calendar" label="Date" value={date ? fullDate(date) : 'Choose a date'} />
                                    <SummaryRow icon="clock" label="Time" value={time ? displayTime(time) : 'Choose a time'} />
                                </div>

                                {selectedService && (
                                    <div className="mt-7 rounded-2xl border border-[#eadfd5] bg-white p-4">
                                        <p className="text-xs font-black uppercase tracking-wide text-[#8b4b59]">Total</p>
                                        <p className="mt-1 font-display text-3xl font-normal text-[#34231c]">{currency(selectedService.price, selectedService.currency ?? 'NGN')}</p>
                                        {selectedService.description && <p className="mt-3 text-xs leading-5 text-stone-600">{selectedService.description}</p>}
                                    </div>
                                )}
                            </aside>

                            <main className="min-w-0 border-b border-stone-200 p-5 lg:border-b-0 lg:border-r lg:p-6">
                                <div className="mb-6 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-stone-400">
                                    <span className={`grid size-7 place-items-center rounded-full ${serviceId ? 'bg-[#34231c] text-white' : 'bg-[#f4efe9] text-[#34231c]'}`}>1</span>
                                    Service
                                    <span className={`ml-2 grid size-7 place-items-center rounded-full ${date ? 'bg-[#34231c] text-white' : 'bg-[#f4efe9] text-[#34231c]'}`}>2</span>
                                    Date
                                    <span className={`ml-2 grid size-7 place-items-center rounded-full ${time ? 'bg-[#34231c] text-white' : 'bg-[#f4efe9] text-[#34231c]'}`}>3</span>
                                    Time
                                </div>

                                <section>
                                    <h3 className="font-display text-2xl font-normal text-[#34231c]">Choose a service</h3>
                                    <div className="mt-4 grid gap-3">
                                        {services.map((service) => (
                                            <button key={service.id} type="button" onClick={() => setServiceId(String(service.id))} className={`rounded-2xl border p-4 text-left transition ${String(serviceId) === String(service.id) ? 'border-[#34231c] bg-[#fbf7f1]' : 'border-stone-200 bg-white hover:border-[#c9bdb2]'}`}>
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <p className="font-bold text-[#34231c]">{service.name}</p>
                                                        <p className="mt-1 text-xs font-semibold text-stone-500">{service.duration_minutes ?? 30} minutes</p>
                                                    </div>
                                                    <p className="shrink-0 font-bold text-[#7d2e3c]">{currency(service.price, service.currency ?? 'NGN')}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </section>

                                <section className="mt-8">
                                    <h3 className="font-display text-2xl font-normal text-[#34231c]">Choose a date</h3>
                                    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-7">
                                        {days.map((item) => (
                                            <button key={item.value} type="button" onClick={() => setDate(item.value)} className={`min-h-24 rounded-2xl border p-2 text-center transition ${date === item.value ? 'border-[#34231c] bg-[#34231c] text-white' : 'border-stone-200 bg-white text-[#34231c] hover:border-[#c9bdb2] hover:bg-[#fbf7f1]'}`}>
                                                <span className="block text-[11px] font-black uppercase tracking-wide opacity-70">{item.weekday}</span>
                                                <span className="mt-2 block font-display text-3xl font-normal">{item.day}</span>
                                                <span className="mt-1 block text-[11px] font-bold uppercase tracking-wide opacity-70">{item.month}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <label className="mt-4 flex max-w-xs items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-500">
                                        Other date
                                        <input type="date" min={localDateString()} value={date} onChange={(event) => setDate(event.target.value)} className="ml-auto bg-transparent text-sm font-bold text-[#34231c] outline-none" />
                                    </label>
                                </section>
                            </main>

                            <aside className="p-5 lg:p-6">
                                <h3 className="font-display text-2xl font-normal text-[#34231c]">Available times</h3>
                                <p className="mt-1 text-sm leading-6 text-stone-500">{date ? fullDate(date) : 'Select a date to view times.'}</p>

                                <div className="mt-5 min-h-40">
                                    {!date ? (
                                        <p className="rounded-2xl border border-dashed border-stone-200 bg-[#fbf8f4] p-5 text-sm leading-6 text-stone-500">Choose a date first.</p>
                                    ) : loadingSlots ? (
                                        <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-5 text-sm font-semibold text-stone-500"><span className="loading-ring loading-ring-small" /> Checking calendar...</div>
                                    ) : slots.length ? (
                                        <div className="grid gap-2">
                                            {slots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} className={`min-h-12 rounded-xl border px-4 text-sm font-bold transition ${time === slot ? 'border-[#34231c] bg-[#34231c] text-white' : 'border-stone-200 bg-white text-[#34231c] hover:border-[#c9bdb2] hover:bg-[#fbf7f1]'}`}>{displayTime(slot)}</button>)}
                                        </div>
                                    ) : (
                                        <p className="rounded-2xl border border-dashed border-stone-200 bg-[#fbf8f4] p-5 text-sm leading-6 text-stone-500">No open times for this date. Try another day.</p>
                                    )}
                                </div>

                                <div className="mt-6">
                                    {!user && (
                                        <div className="mb-5 space-y-3 rounded-2xl border border-stone-200 bg-[#fbf8f4] p-4">
                                            <p className="text-xs font-black uppercase tracking-wide text-[#8b4b59]">Your details</p>
                                            <FormField label="Name" value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} placeholder="Your name" required />
                                            <FormField label="Email" type="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" required />
                                            <FormField label="Phone optional" value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} placeholder="+234..." />
                                            <p className="text-[11px] leading-5 text-stone-500">We’ll store this with your booking so the provider can manage the request. No customer account is created for you to log into.</p>
                                        </div>
                                    )}
                                    <FormField as="textarea" label="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Share anything that will help them prepare..." />
                                </div>

                                <div className="mt-6 space-y-2 border-t border-stone-200 pt-5">
                                    <Button type="submit" className="w-full rounded-full bg-[#34231c] hover:bg-[#4a2f26]" disabled={submitting || !serviceId || !date || !time}>
                                        {submitting ? 'Sending request...' : 'Request booking'} <Icon name="arrow" size={16} />
                                    </Button>
                                    <Button variant="ghost" onClick={onClose} className="w-full">Cancel</Button>
                                </div>
                            </aside>
                        </div>
                    </form>
                )}
            </section>
        </div>
    );
}
