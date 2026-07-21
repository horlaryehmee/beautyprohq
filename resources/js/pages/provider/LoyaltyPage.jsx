import { useEffect, useMemo, useState } from 'react';
import {
    Avatar,
    Button,
    Card,
    CardHeader,
    EmptyState,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    StatCard,
    apiErrorMessage,
    apiRequest,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.loyalty ?? value?.customers ?? value?.data ?? [];

export default function ProviderLoyaltyPage() {
    const resource = useApiResource('/provider/loyalty', {});
    const [settings, setSettings] = useState({ enabled: false, points_per_booking: 10, points_required: 100 });
    const [editing, setEditing] = useState(null);
    const [points, setPoints] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const { notify } = useDashboardToast();
    const data = resource.data ?? {};
    const records = normalize(data);
    const totalPoints = useMemo(() => records.reduce((sum, record) => sum + Number(record.points ?? 0), 0), [records]);

    useEffect(() => {
        if (!data?.settings) return;
        setSettings({
            enabled: Boolean(data.settings.enabled),
            points_per_booking: Number(data.settings.points_per_booking ?? 10),
            points_required: Number(data.settings.points_required ?? 100),
        });
    }, [data?.settings]);

    const saveSettings = async (event) => {
        event.preventDefault();
        setSavingSettings(true);
        try {
            const updated = await apiRequest('put', '/provider/loyalty/settings', settings);
            setSettings(updated);
            resource.setData((current) => ({ ...(current ?? {}), settings: updated }));
            notify('Loyalty settings updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    const save = async () => {
        setSaving(true);
        try {
            const customerId = editing.customer_id ?? editing.customer?.id;
            const updated = await apiRequest('put', `/provider/loyalty/${customerId}`, { points: Number(points), reason: reason || undefined });
            resource.setData((current) => ({
                ...(current ?? {}),
                customers: normalize(current).map((item) => (item.customer_id ?? item.customer?.id) === customerId ? { ...item, ...(updated ?? {}), points: updated?.points ?? Number(item.points ?? 0) + Number(points) } : item),
            }));
            setEditing(null);
            notify('Loyalty balance updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader description="Control whether customers earn points and how many points they need to request a service with rewards." eyebrow="Customer retention" title="Loyalty rewards" />

            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard icon="loyalty" label="Points issued" tone="rose" value={totalPoints.toLocaleString()} />
                <StatCard icon="users" label="Members" tone="plum" value={records.length} />
                <StatCard icon="analytics" label="Reward status" tone={settings.enabled ? 'emerald' : 'slate'} value={settings.enabled ? 'Enabled' : 'Disabled'} />
            </div>

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card>
                <CardHeader description="When disabled, completed bookings will not earn points and customers cannot redeem points for booking requests." title="Programme settings" />
                <form className="grid gap-4 lg:grid-cols-[1fr_220px_220px_auto]" onSubmit={saveSettings}>
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-100 p-4 text-sm font-bold text-slate-700">
                        <input checked={settings.enabled} className="size-4 accent-fuchsia-700" onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
                        Enable loyalty rewards
                    </label>
                    <Field label="Points per completed booking">
                        <input className={inputClass} min="0" onChange={(event) => setSettings((current) => ({ ...current, points_per_booking: Number(event.target.value) }))} required type="number" value={settings.points_per_booking} />
                    </Field>
                    <Field label="Points needed to request service">
                        <input className={inputClass} min="1" onChange={(event) => setSettings((current) => ({ ...current, points_required: Number(event.target.value) }))} required type="number" value={settings.points_required} />
                    </Field>
                    <div className="flex items-end">
                        <Button busy={savingSettings} className="w-full" type="submit">Save settings</Button>
                    </div>
                </form>
            </Card>

            <Card>
                <CardHeader title="Customer balances" />
                {resource.loading ? (
                    <LoadingBlock rows={5} />
                ) : records.length ? (
                    <div className="divide-y divide-slate-100">
                        {records.map((record) => {
                            const customer = record.customer ?? {};

                            return (
                                <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center" key={record.id}>
                                    <Avatar name={customer.name} src={customer.profile_photo} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-slate-900">{customer.name ?? 'Customer'}</p>
                                        <p className="truncate text-xs text-slate-400">{customer.email}</p>
                                    </div>
                                    <div className="sm:text-right">
                                        <p className="text-lg font-bold text-fuchsia-700">{Number(record.points ?? 0).toLocaleString()} pts</p>
                                        <p className="text-xs text-slate-400">{Number(record.points ?? 0) >= Number(settings.points_required) ? 'Can request with points' : `${Math.max(0, Number(settings.points_required) - Number(record.points ?? 0)).toLocaleString()} pts to go`}</p>
                                    </div>
                                    <Button onClick={() => { setEditing(record); setPoints(0); setReason(''); }} type="button" variant="secondary">Adjust points</Button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState description="Loyalty records appear as customers earn or redeem points." icon="loyalty" title="No loyalty members yet" />
                )}
            </Card>

            {editing && (
                <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" onMouseDown={() => setEditing(null)}>
                    <Card className="w-full max-w-md" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="font-bold text-slate-950">Adjust {editing.customer?.name}'s balance</h2>
                        <p className="mt-1 text-sm text-slate-500">Current balance: {Number(editing.points ?? 0).toLocaleString()} points</p>
                        <label className="mt-5 block text-sm font-bold text-slate-700">
                            Points to add or remove
                            <input className={`${inputClass} mt-1.5`} onChange={(event) => setPoints(event.target.value)} required type="number" value={points} />
                        </label>
                        <p className="mt-1 text-xs text-slate-400">Use a negative number to deduct points.</p>
                        <label className="mt-4 block text-sm font-bold text-slate-700">
                            Reason
                            <input className={`${inputClass} mt-1.5`} onChange={(event) => setReason(event.target.value)} placeholder="Completed appointment" value={reason} />
                        </label>
                        <div className="mt-5 flex justify-end gap-2">
                            <Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancel</Button>
                            <Button busy={saving} onClick={save} type="button">Update balance</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
