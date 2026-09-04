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
    StatusBadge,
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
    const calendarResource = useApiResource('/provider/calendar-integration', {});
    const [slots, setSlots] = useState(defaultSlots);
    const [timezone, setTimezone] = useState('Africa/Lagos');
    const [blockedDate, setBlockedDate] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [calendarBusy, setCalendarBusy] = useState(false);
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

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const error = params.get('calendar_error');
        const connected = params.get('calendar_connected');
        if (error) notify(error, 'error');
        if (connected) notify(`Google Calendar connected. ${params.get('calendar_synced') || 0} upcoming bookings synced.`);
        if (error || connected) window.history.replaceState({}, '', window.location.pathname);
    }, [notify]);

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

    const syncCalendar = async () => {
        setCalendarBusy(true);
        try {
            const result = await apiRequest('post', '/provider/calendar-integration/sync');
            await calendarResource.reload();
            notify(result?.failed ? `${result.synced} bookings synced; ${result.failed} need attention.` : `${result?.synced || 0} upcoming bookings synced.`);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setCalendarBusy(false);
        }
    };

    const disconnectCalendar = async () => {
        if (!window.confirm('Disconnect Google Calendar? Events already added to Google will remain there.')) return;
        setCalendarBusy(true);
        try {
            await apiRequest('delete', '/provider/calendar-integration');
            await calendarResource.reload();
            notify('Google Calendar disconnected.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setCalendarBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader actions={<Button busy={saving} onClick={saveAvailability} type="button">Save calendar</Button>} description="Set your timezone, recurring hours and dates when you cannot take appointments." eyebrow="Schedule" title="Availability calendar" />
            {(availabilityResource.error || blockedResource.error || settingsResource.error || calendarResource.error) && <ErrorState message={availabilityResource.error || blockedResource.error || settingsResource.error || calendarResource.error} onRetry={() => { availabilityResource.reload(); blockedResource.reload(); settingsResource.reload(); calendarResource.reload(); }} />}

            <Card className="overflow-hidden" padding={false}>
                {calendarResource.loading ? <div className="p-6"><LoadingBlock rows={3} /></div> : (
                    <div className="grid gap-5 bg-gradient-to-br from-white via-sky-50/60 to-fuchsia-50/60 p-5 md:grid-cols-[1fr_auto] md:items-center sm:p-6">
                        <div className="flex min-w-0 gap-4">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm ring-1 ring-slate-200" aria-hidden="true">G</div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="font-display text-2xl font-semibold text-bphq-espresso">Google Calendar</h2>
                                    <StatusBadge status={calendarResource.data?.connected ? 'connected' : 'not connected'} />
                                </div>
                                {calendarResource.data?.connected ? (
                                    <>
                                        <p className="mt-1 break-words text-sm text-bphq-coffee">Connected as <strong>{calendarResource.data.google_email || 'your Google account'}</strong></p>
                                        <p className="mt-2 text-xs leading-5 text-slate-500">New bookings are added automatically with an email reminder 24 hours before and a popup 30 minutes before. Changes and cancellations stay in sync.</p>
                                        {calendarResource.data.last_error && <p className="mt-2 text-xs font-semibold text-rose-600">Last sync needs attention: {calendarResource.data.last_error}</p>}
                                    </>
                                ) : (
                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-bphq-coffee">Connect your work calendar so every booking appears automatically and Google can remind you before each appointment.</p>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row md:justify-end">
                            {calendarResource.data?.connected ? (
                                <>
                                    <Button busy={calendarBusy} onClick={syncCalendar} type="button" variant="secondary">Sync upcoming</Button>
                                    <Button disabled={calendarBusy} onClick={disconnectCalendar} type="button" variant="soft">Disconnect</Button>
                                </>
                            ) : calendarResource.data?.available ? (
                                <Button onClick={() => { window.location.href = calendarResource.data.connect_url || '/auth/google/calendar/redirect'; }} type="button">Connect Google Calendar</Button>
                            ) : (
                                <p className="max-w-xs rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800">Google must first be enabled by the platform administrator.</p>
                            )}
                        </div>
                    </div>
                )}
            </Card>

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
