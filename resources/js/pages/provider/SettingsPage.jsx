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

const gatewayLabels = {
    paystack: 'Paystack',
    stripe: 'Stripe',
    paypal: 'PayPal',
};

export default function ProviderSettingsPage() {
    const resource = useApiResource('/provider/settings', {});
    const [form, setForm] = useState({ default_currency: 'NGN', default_payment_gateway: '' });
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const data = resource.data ?? {};
    const currencies = data.supported_currencies?.length ? data.supported_currencies : ['NGN', 'USD', 'EUR', 'GBP'];
    const connectedGateways = data.payment_gateways ?? [];

    useEffect(() => {
        if (!resource.data || !Object.keys(resource.data).length) return;
        setForm({
            default_currency: resource.data.default_currency ?? 'NGN',
            default_payment_gateway: resource.data.default_payment_gateway ?? '',
        });
    }, [resource.data]);

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const updated = await apiRequest('put', '/provider/settings', {
                default_currency: form.default_currency,
                default_payment_gateway: form.default_payment_gateway || null,
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

            <Card>
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
        </div>
    );
}
