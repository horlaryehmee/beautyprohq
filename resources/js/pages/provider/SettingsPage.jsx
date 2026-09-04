import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Button,
    Card,
    CardHeader,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    apiErrorMessage,
    apiRequest,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';
import SecurityPage from '../dashboard/SecurityPage';
import AccountDeletionCard from '../dashboard/AccountDeletionCard';
import ProviderSupportPanel from '../../components/support/ProviderSupportPanel';

export default function ProviderSettingsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const resource = useApiResource('/provider/settings', {});
    const [form, setForm] = useState({
        whatsapp_number: '',
        whatsapp_notifications_enabled: false,
    });
    const [tab, setTab] = useState(searchParams.get('tab') === 'support' ? 'support' : 'security');
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const data = resource.data ?? {};
    const providerTabs = [
        ...(data.whatsapp_feature_enabled ? [['notifications', 'Notifications']] : []),
        ['security', 'Security'],
        ['support', 'Support'],
        ['delete-account', 'Delete account'],
    ];

    useEffect(() => {
        if (!resource.data || !Object.keys(resource.data).length) return;
        setForm({
            whatsapp_number: resource.data.whatsapp_number ?? '',
            whatsapp_notifications_enabled: Boolean(resource.data.whatsapp_notifications_enabled),
        });
    }, [resource.data]);

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const updated = await apiRequest('put', '/provider/settings', {
                whatsapp_number: form.whatsapp_number || null,
                whatsapp_notifications_enabled: form.whatsapp_notifications_enabled,
            });
            resource.setData(updated);
            notify('Settings updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    if (resource.loading) return <LoadingBlock rows={6} />;

    return (
        <div className="space-y-6">
            <PageHeader description="Manage notifications, account security and support preferences." eyebrow="Provider" title="Settings" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="flex gap-2 overflow-x-auto pb-1">
                {providerTabs.map(([key, label]) => (
                    <button className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold ${tab === key ? (key === 'delete-account' ? 'bg-red-700 text-white' : 'bg-slate-950 text-white') : (key === 'delete-account' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500')}`} key={key} onClick={() => { setTab(key); setSearchParams(key === 'support' ? { tab: 'support' } : {}); }} type="button">{label}</button>
                ))}
            </div>

            {tab === 'notifications' && data.whatsapp_feature_enabled ? <Card>
                <CardHeader
                    description="Receive customer booking details on WhatsApp when a new booking request is made."
                    title="WhatsApp booking alerts"
                />
                <form className="space-y-4" onSubmit={save}>
                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                        <input
                            checked={form.whatsapp_notifications_enabled}
                            className="mt-1 h-5 w-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                            onChange={(event) => setForm((current) => ({ ...current, whatsapp_notifications_enabled: event.target.checked }))}
                            type="checkbox"
                        />
                        <span>
                            <span className="block text-sm font-bold text-slate-900">Enable WhatsApp booking notifications</span>
                            <span className="block text-sm text-slate-500">When enabled, new booking details will be sent to your WhatsApp number.</span>
                        </span>
                    </label>

                    <Field hint="Use international format, for example +2348012345678." label="WhatsApp contact">
                        <input
                            className={inputClass}
                            onChange={(event) => setForm((current) => ({ ...current, whatsapp_number: event.target.value }))}
                            placeholder="+2348012345678"
                            type="tel"
                            value={form.whatsapp_number}
                        />
                    </Field>

                    <div className="flex justify-end">
                        <Button busy={saving} type="submit">Save notifications</Button>
                    </div>
                </form>
            </Card>
            : tab === 'security' ? <SecurityPage embedded />
            : tab === 'support' ? <ProviderSupportPanel />
            : <AccountDeletionCard />}
        </div>
    );
}
