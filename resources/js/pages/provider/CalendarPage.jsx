import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    CardHeader,
    EmptyState,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    apiErrorMessage,
    apiRequest,
    formatDate,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const defaultSlots = days.map((_, index) => ({ day_of_week: index, enabled: index > 0 && index < 6, start_time: '09:00', end_time: '17:00' }));
const normalize = (value, key) => Array.isArray(value) ? value : value?.[key] ?? value?.data ?? [];
const timezoneOptions = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['Africa/Lagos', 'UTC', 'Europe/London', 'America/New_York'];

export default function ProviderCalendarPage() {
    const availabilityResource = useApiResource('/provider/availability', []);
    const blockedResource = useApiResource('/provider/blocked-dates', []);
    const settingsResource = useApiResource('/provider/settings', {});
    const [slots, setSlots] = useState(defaultSlots);
    const [timezone, setTimezone] = useState('Africa/Lagos');
    const [blockedDate, setBlockedDate] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();

    useEffect(() => {
        const remote = normalize(availabilityResource.data, 'slots');
        if (!remote.length) return;
        setSlots(defaultSlots.map((slot) => {
            const match = remote.find((item) => Number(item.day_of_week) === slot.day_of_week);
            return match ? { ...slot, ...match, enabled: true } : { ...slot, enabled: false };
        }));
    }, [availabilityResource.data]);

    useEffect(() => {
        if (settingsResource.data?.timezone) setTimezone(settingsResource.data.timezone);
    }, [settingsResource.data]);

    const blockedDates = useMemo(() => normalize(blockedResource.data, 'blocked_dates'), [blockedResource.data]);

    const updateSlot = (index, patch) => setSlots((current) => current.map((slot) => slot.day_of_week === index ? { ...slot, ...patch } : slot));

    const saveAvailability = async () => {
        setSaving(true);
        try {
            await Promise.all([
                apiRequest('put', '/provider/availability', { slots: slots.filter((slot) => slot.enabled).map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time: String(start_time).slice(0, 5), end_time: String(end_time).slice(0, 5) })) }),
                apiRequest('put', '/provider/settings', { timezone }),
            ]);
            notify('Calendar settings updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const addBlockedDate = async (event) => {
        event.preventDefault();
        if (!blockedDate) return;
        setSaving(true);
        try {
            await apiRequest('post', '/provider/blocked-dates', { date: blockedDate, reason: reason || undefined });
            setBlockedDate('');
            setReason('');
            await blockedResource.reload();
            notify('Date blocked on your calendar.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const removeBlockedDate = async (item) => {
        try {
            await apiRequest('delete', `/provider/blocked-dates/${item.id}`);
            blockedResource.setData((current) => normalize(current, 'blocked_dates').filter((date) => date.id !== item.id));
            notify('Blocked date removed.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader actions={<Button busy={saving} onClick={saveAvailability} type="button">Save calendar</Button>} description="Set your timezone, recurring hours and dates when you cannot take appointments." eyebrow="Schedule" title="Availability calendar" />
            {(availabilityResource.error || blockedResource.error || settingsResource.error) && <ErrorState message={availabilityResource.error || blockedResource.error || settingsResource.error} onRetry={() => { availabilityResource.reload(); blockedResource.reload(); settingsResource.reload(); }} />}

            <Card className="overflow-hidden" padding={false}>
                <div className="grid gap-4 bg-gradient-to-br from-bphq-ivory via-white to-fuchsia-50 p-5 sm:grid-cols-[1fr_minmax(260px,0.8fr)] sm:items-center sm:p-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-bphq-coffee">Calendar timezone</p>
                        <h2 className="mt-1 font-display text-2xl font-semibold text-bphq-espresso">Where your working hours are based</h2>
                        <p className="mt-2 text-sm leading-6 text-bphq-coffee">Customers will see these times converted to their own timezone while booking.</p>
                    </div>
                    <Field label="Business timezone">
                        <select className={inputClass} onChange={(event) => setTimezone(event.target.value)} value={timezone}>
                            {timezoneOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                    </Field>
                </div>
            </Card>
            <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                <Card>
                    <CardHeader description="Customers can only request times inside these windows." title="Weekly hours" />
                    {availabilityResource.loading ? <LoadingBlock rows={7} /> : (
                        <div className="divide-y divide-slate-100">
                            {slots.map((slot) => (
                                <div className="grid gap-3 py-3 sm:grid-cols-[9rem_1fr] sm:items-center" key={slot.day_of_week}>
                                    <label className="flex items-center gap-3 text-sm font-bold text-slate-800">
                                        <input checked={slot.enabled} className="size-4 accent-fuchsia-600" onChange={(event) => updateSlot(slot.day_of_week, { enabled: event.target.checked })} type="checkbox" />
                                        {days[slot.day_of_week]}
                                    </label>
                                    {slot.enabled ? (
                                        <div className="flex items-center gap-2">
                                            <input aria-label={`${days[slot.day_of_week]} start time`} className={inputClass} onChange={(event) => updateSlot(slot.day_of_week, { start_time: event.target.value })} type="time" value={String(slot.start_time).slice(0, 5)} />
                                            <span className="text-xs text-slate-400">to</span>
                                            <input aria-label={`${days[slot.day_of_week]} end time`} className={inputClass} onChange={(event) => updateSlot(slot.day_of_week, { end_time: event.target.value })} type="time" value={String(slot.end_time).slice(0, 5)} />
                                        </div>
                                    ) : <p className="text-sm text-slate-400">Unavailable</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                <div className="space-y-5">
                    <Card>
                        <CardHeader description="Take a day off without changing weekly hours." title="Block a date" />
                        <form className="space-y-4" onSubmit={addBlockedDate}>
                            <Field label="Date"><input className={inputClass} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setBlockedDate(event.target.value)} required type="date" value={blockedDate} /></Field>
                            <Field label="Reason" hint="Only you can see this note."><input className={inputClass} onChange={(event) => setReason(event.target.value)} placeholder="Holiday, training…" value={reason} /></Field>
                            <Button busy={saving} className="w-full" type="submit" variant="secondary">Block date</Button>
                        </form>
                    </Card>
                    <Card>
                        <CardHeader title="Upcoming blocked dates" />
                        {blockedResource.loading ? <LoadingBlock rows={2} /> : blockedDates.length ? (
                            <div className="space-y-2">
                                {blockedDates.map((item) => (
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3" key={item.id}>
                                        <div><p className="text-sm font-bold text-slate-800">{formatDate(item.date)}</p>{item.reason && <p className="text-xs text-slate-400">{item.reason}</p>}</div>
                                        <button className="text-xs font-bold text-rose-600 hover:text-rose-700" onClick={() => removeBlockedDate(item)} type="button">Remove</button>
                                    </div>
                                ))}
                            </div>
                        ) : <EmptyState description="Your schedule has no exceptions." icon="calendar" title="No blocked dates" />}
                    </Card>
                </div>
            </div>
        </div>
    );
}
