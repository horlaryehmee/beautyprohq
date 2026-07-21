import { useEffect, useState } from 'react';
import {
    Button,
    Card,
    CardHeader,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';
import SecurityPage from '../dashboard/SecurityPage';

const gatewayLabels = {
    paystack: 'Paystack',
    stripe: 'Stripe',
    paypal: 'PayPal',
};

export default function ProviderSettingsPage() {
    const resource = useApiResource('/provider/settings', {});
    const [form, setForm] = useState({
        default_currency: 'NGN',
        default_payment_gateway: '',
        whatsapp_number: '',
        whatsapp_notifications_enabled: false,
    });
    const [tab, setTab] = useState('general');
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const data = resource.data ?? {};
    const currencies = data.supported_currencies?.length ? data.supported_currencies : ['NGN', 'USD', 'EUR', 'GBP'];
    const connectedGateways = data.payment_gateways ?? [];
    const providerTabs = [
        ['general', 'General'],
        ...(data.whatsapp_feature_enabled ? [['notifications', 'Notifications']] : []),
        ['security', 'Security'],
    ];

    useEffect(() => {
        if (!resource.data || !Object.keys(resource.data).length) return;
        setForm({
            default_currency: resource.data.default_currency ?? 'NGN',
            default_payment_gateway: resource.data.default_payment_gateway ?? '',
            whatsapp_number: resource.data.whatsapp_number ?? '',
            whatsapp_notifications_enabled: Boolean(resource.data.whatsapp_notifications_enabled),
        });
    }, [resource.data]);

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const updated = await apiRequest('put', '/provider/settings', {
                default_currency: form.default_currency,
                default_payment_gateway: form.default_payment_gateway || null,
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
            <PageHeader description="Set your provider defaults for pricing and customer booking payments." eyebrow="Provider" title="Settings" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="flex gap-2 overflow-x-auto pb-1">
                {providerTabs.map(([key, label]) => (
                    <button className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold ${tab === key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`} key={key} onClick={() => setTab(key)} type="button">{label}</button>
                ))}
            </div>

            {tab === 'general' ? <Card>
                <CardHeader
                    action={form.default_payment_gateway ? <StatusBadge status={`${gatewayLabels[form.default_payment_gateway] ?? form.default_payment_gateway} default`} /> : <StatusBadge status="no default gateway" />}
                    description="These settings affect new services and the gateway customers are sent to when they book you."
                    title="Business defaults"
                />
                <form className="grid gap-4 lg:grid-cols-[240px_1fr_auto]" onSubmit={save}>
                    <Field label="Default currency">
                        <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, default_currency: event.target.value }))} value={form.default_currency}>
                            {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </select>
                    </Field>

                    <Field hint="Only connected and enabled gateways can be selected." label="Default payment gateway">
                        <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, default_payment_gateway: event.target.value }))} value={form.default_payment_gateway}>
                            <option value="">Automatic - first connected gateway</option>
                            {connectedGateways.map((gateway) => <option key={gateway} value={gateway}>{gatewayLabels[gateway] ?? gateway}</option>)}
                        </select>
                    </Field>

                    <div className="flex items-end">
                        <Button busy={saving} className="w-full" type="submit">Save settings</Button>
                    </div>
                </form>

                {!connectedGateways.length && (
                    <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                        Connect a payment gateway on the Payments page before choosing a default gateway.
                    </p>
                )}
            </Card>
            : tab === 'notifications' && data.whatsapp_feature_enabled ? <Card>
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
            : <SecurityPage embedded />}
        </div>
    );
}
