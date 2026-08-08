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
const money = (value, currency = 'NGN') => new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value ?? 0));

export default function ProviderLoyaltyPage() {
    const resource = useApiResource('/provider/loyalty', {});
    const [settings, setSettings] = useState({ enabled: false, points_per_booking: 10, points_required: 100, reward_value_amount: 0, referral_rewards_enabled: false, referral_points: 0, currency: 'NGN' });
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
            reward_value_amount: Number(data.settings.reward_value_amount ?? 0),
            referral_rewards_enabled: Boolean(data.settings.referral_rewards_enabled),
            referral_points: Number(data.settings.referral_points ?? 0),
            currency: data.settings.currency ?? 'NGN',
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

    return (
        <div className="space-y-6">
            <PageHeader description="Control whether customers earn points and how many points they need to request a service with rewards." eyebrow="Customer retention" title="Loyalty rewards" />

            <div className="grid gap-4 sm:grid-cols-4">
                <StatCard icon="loyalty" label="Points issued" tone="rose" value={totalPoints.toLocaleString()} />
                <StatCard icon="users" label="Members" tone="plum" value={records.length} />
                <StatCard icon="analytics" label="Reward status" tone={settings.enabled ? 'emerald' : 'slate'} value={settings.enabled ? 'Enabled' : 'Disabled'} />
                <StatCard icon="users" label="Referral reward" tone={settings.referral_rewards_enabled ? 'emerald' : 'slate'} value={settings.referral_rewards_enabled ? `${Number(settings.referral_points ?? 0).toLocaleString()} pts` : 'Off'} />
            </div>

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card>
                <CardHeader description="Customers can redeem only when their provider-specific balance covers the selected service price." title="Programme settings" />
                <form className="space-y-5" onSubmit={saveSettings}>
                    <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.85fr)_minmax(0,2.15fr)] xl:items-end">
                        <label className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
                            <input checked={settings.enabled} className="size-4 shrink-0 accent-fuchsia-700" onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
                            <span>Enable loyalty rewards</span>
                        </label>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label="Points per completed booking">
                                <input className={inputClass} min="0" onChange={(event) => setSettings((current) => ({ ...current, points_per_booking: Number(event.target.value) }))} required type="number" value={settings.points_per_booking} />
                            </Field>
                            <Field label="Points needed to request service">
                                <input className={inputClass} min="1" onChange={(event) => setSettings((current) => ({ ...current, points_required: Number(event.target.value) }))} required type="number" value={settings.points_required} />
                            </Field>
                            <Field label={`Value of ${Number(settings.points_required || 0).toLocaleString()} pts`}>
                                <input className={inputClass} min="0.01" step="0.01" onChange={(event) => setSettings((current) => ({ ...current, reward_value_amount: Number(event.target.value) }))} required type="number" value={settings.reward_value_amount} />
                            </Field>
                        </div>
                    </div>
                    <div className="grid gap-4 border-t border-slate-100 pt-5 xl:grid-cols-[minmax(220px,0.85fr)_minmax(0,2.15fr)] xl:items-end">
                        <label className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
                            <input checked={settings.referral_rewards_enabled} className="size-4 shrink-0 accent-fuchsia-700" onChange={(event) => setSettings((current) => ({ ...current, referral_rewards_enabled: event.target.checked }))} type="checkbox" />
                            <span>Enable referral rewards</span>
                        </label>
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                            <Field label="Points per referral">
                                <input className={inputClass} min="0" onChange={(event) => setSettings((current) => ({ ...current, referral_points: Number(event.target.value) }))} required type="number" value={settings.referral_points} />
                            </Field>
                            <Button busy={savingSettings} className="w-full sm:w-auto" type="submit">Save settings</Button>
                        </div>
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
                                    <p className="text-xs text-slate-400">{Number(record.points ?? 0) >= Number(settings.points_required) ? `At least ${money(settings.reward_value_amount, settings.currency)} credit` : `${Math.max(0, Number(settings.points_required) - Number(record.points ?? 0)).toLocaleString()} pts to go`}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState description="Loyalty records appear as customers earn or redeem points." icon="loyalty" title="No loyalty members yet" />
                )}
            </Card>

        </div>
    );
}
