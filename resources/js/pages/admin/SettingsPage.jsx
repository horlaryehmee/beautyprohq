import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, ErrorState, Field, LoadingBlock, PageHeader, StatusBadge, apiErrorMessage, apiRequest, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';
import SecurityPage from '../dashboard/SecurityPage';

export default function AdminSettingsPage() {
    const gatewayResource = useApiResource('/admin/payment-settings/gateway', {});
    const paystackResource = useApiResource('/admin/payment-settings/paystack', {});
    const stripeResource = useApiResource('/admin/payment-settings/stripe', {});
    const currencyResource = useApiResource('/admin/settings/currencies', {});
    const { notify } = useDashboardToast();
    const [tab, setTab] = useState('platform');
    const [gatewayForm, setGatewayForm] = useState({ subscription_gateway: 'paystack' });
    const [paystackForm, setPaystackForm] = useState({ mode: 'test', test_public_key: '', test_secret_key: '', live_public_key: '', live_secret_key: '' });
    const [stripeForm, setStripeForm] = useState({ mode: 'test', test_publishable_key: '', test_secret_key: '', live_publishable_key: '', live_secret_key: '' });
    const [currencyForm, setCurrencyForm] = useState({ default: 'NGN', rates: {} });
    const [savingGateway, setSavingGateway] = useState(false);
    const [savingPaystack, setSavingPaystack] = useState(false);
    const [savingStripe, setSavingStripe] = useState(false);
    const [savingCurrency, setSavingCurrency] = useState(false);

    useEffect(() => {
        const data = gatewayResource.data;
        if (!data || !Object.keys(data).length) return;
        setGatewayForm({ subscription_gateway: data.subscription_gateway ?? 'paystack' });
    }, [gatewayResource.data]);

    useEffect(() => {
        const data = paystackResource.data;
        if (!data || !Object.keys(data).length) return;
        setPaystackForm({
            mode: data.mode ?? 'test',
            test_public_key: data.test_public_key ?? '',
            test_secret_key: '',
            live_public_key: data.live_public_key ?? '',
            live_secret_key: '',
        });
    }, [paystackResource.data]);

    useEffect(() => {
        const data = currencyResource.data;
        if (!data?.supported?.length) return;
        setCurrencyForm({
            default: data.default ?? 'NGN',
            rates: Object.fromEntries(data.supported.map((item) => [item.code, item.rate ?? 1])),
        });
    }, [currencyResource.data]);

    useEffect(() => {
        const data = stripeResource.data;
        if (!data || !Object.keys(data).length) return;
        setStripeForm({
            mode: data.mode ?? 'test',
            test_publishable_key: data.test_publishable_key ?? '',
            test_secret_key: '',
            live_publishable_key: data.live_publishable_key ?? '',
            live_secret_key: '',
        });
    }, [stripeResource.data]);

    const saveGateway = async (event) => {
        event.preventDefault();
        setSavingGateway(true);
        try {
            const saved = await apiRequest('put', '/admin/payment-settings/gateway', gatewayForm);
            gatewayResource.setData(saved);
            notify('Subscription gateway saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingGateway(false);
        }
    };

    const savePaystack = async (event) => {
        event.preventDefault();
        setSavingPaystack(true);
        try {
            const saved = await apiRequest('put', '/admin/payment-settings/paystack', paystackForm);
            paystackResource.setData(saved);
            setPaystackForm((current) => ({ ...current, test_secret_key: '', live_secret_key: '' }));
            notify('Paystack settings saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingPaystack(false);
        }
    };

    const saveStripe = async (event) => {
        event.preventDefault();
        setSavingStripe(true);
        try {
            const saved = await apiRequest('put', '/admin/payment-settings/stripe', stripeForm);
            stripeResource.setData(saved);
            setStripeForm((current) => ({ ...current, test_secret_key: '', live_secret_key: '' }));
            notify('Stripe settings saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingStripe(false);
        }
    };

    const saveCurrency = async (event) => {
        event.preventDefault();
        setSavingCurrency(true);
        try {
            const saved = await apiRequest('put', '/admin/settings/currencies', currencyForm);
            currencyResource.setData(saved);
            notify('Currency rates saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingCurrency(false);
        }
    };

    const updateRate = (code, value) => setCurrencyForm((current) => ({ ...current, rates: { ...current.rates, [code]: value } }));
    const error = gatewayResource.error || paystackResource.error || stripeResource.error || currencyResource.error;

    return (
        <div className="space-y-6">
            <PageHeader description="Configure platform-level payment and currency behavior." eyebrow="Platform" title="Settings" />
            {error && <ErrorState message={error} onRetry={() => { gatewayResource.reload(); paystackResource.reload(); stripeResource.reload(); currencyResource.reload(); }} />}

            <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                    ['platform', 'Platform'],
                    ['security', 'Security'],
                ].map(([key, label]) => (
                    <button className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold ${tab === key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`} key={key} onClick={() => setTab(key)} type="button">{label}</button>
                ))}
            </div>

            {tab === 'platform' ? <>
            <Card>
                <CardHeader title="Provider plan checkout gateway" description="Choose which gateway providers use when they pay for a paid plan." action={<StatusBadge status={gatewayForm.subscription_gateway} />} />
                {gatewayResource.loading ? <LoadingBlock rows={2} /> : (
                    <form className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={saveGateway}>
                        <Field className="flex-1" label="Active subscription gateway">
                            <select className={inputClass} onChange={(event) => setGatewayForm({ subscription_gateway: event.target.value })} value={gatewayForm.subscription_gateway}>
                                <option value="paystack">Paystack</option>
                                <option value="stripe">Stripe</option>
                            </select>
                        </Field>
                        <Button busy={savingGateway} type="submit">Save gateway</Button>
                    </form>
                )}
            </Card>

            <Card>
                <CardHeader
                    title="Paystack plan payment gateway"
                    description="These keys are used only for provider subscription plan payments. Provider payout/settlement settings are separate."
                    action={paystackResource.data?.active_secret_configured ? <StatusBadge status={`${paystackForm.mode} ready`} /> : <StatusBadge status="missing active secret" />}
                />
                {paystackResource.loading ? <LoadingBlock rows={4} /> : (
                    <form className="mt-5 space-y-5" onSubmit={savePaystack}>
                        <Field label="Active Paystack mode">
                            <select className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, mode: event.target.value }))} value={paystackForm.mode}>
                                <option value="test">Test mode</option>
                                <option value="live">Live mode</option>
                            </select>
                        </Field>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-3xl border border-slate-100 p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h2 className="font-black text-slate-950">Test keys</h2>
                                    {paystackResource.data?.test_secret_configured && <StatusBadge status={`secret ends ${paystackResource.data.test_secret_last4}`} />}
                                </div>
                                <div className="space-y-4">
                                    <Field label="Test public key"><input className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, test_public_key: event.target.value }))} placeholder="pk_test_..." value={paystackForm.test_public_key} /></Field>
                                    <Field label="Test secret key" hint="Leave blank to keep the saved secret."><input className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, test_secret_key: event.target.value }))} placeholder="sk_test_..." type="password" value={paystackForm.test_secret_key} /></Field>
                                </div>
                            </div>
                            <div className="rounded-3xl border border-slate-100 p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h2 className="font-black text-slate-950">Live keys</h2>
                                    {paystackResource.data?.live_secret_configured && <StatusBadge status={`secret ends ${paystackResource.data.live_secret_last4}`} />}
                                </div>
                                <div className="space-y-4">
                                    <Field label="Live public key"><input className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, live_public_key: event.target.value }))} placeholder="pk_live_..." value={paystackForm.live_public_key} /></Field>
                                    <Field label="Live secret key" hint="Leave blank to keep the saved secret."><input className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, live_secret_key: event.target.value }))} placeholder="sk_live_..." type="password" value={paystackForm.live_secret_key} /></Field>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end"><Button busy={savingPaystack} type="submit">Save Paystack settings</Button></div>
                    </form>
                )}
            </Card>

            <Card>
                <CardHeader
                    title="Stripe plan payment gateway"
                    description="Stripe Checkout is used only for provider subscription plan payments when Stripe is selected as the active gateway."
                    action={stripeResource.data?.active_secret_configured ? <StatusBadge status={`${stripeForm.mode} ready`} /> : <StatusBadge status="missing active secret" />}
                />
                {stripeResource.loading ? <LoadingBlock rows={4} /> : (
                    <form className="mt-5 space-y-5" onSubmit={saveStripe}>
                        <Field label="Active Stripe mode">
                            <select className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, mode: event.target.value }))} value={stripeForm.mode}>
                                <option value="test">Test mode</option>
                                <option value="live">Live mode</option>
                            </select>
                        </Field>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-3xl border border-slate-100 p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h2 className="font-black text-slate-950">Test keys</h2>
                                    {stripeResource.data?.test_secret_configured && <StatusBadge status={`secret ends ${stripeResource.data.test_secret_last4}`} />}
                                </div>
                                <div className="space-y-4">
                                    <Field label="Test publishable key"><input className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, test_publishable_key: event.target.value }))} placeholder="pk_test_..." value={stripeForm.test_publishable_key} /></Field>
                                    <Field label="Test secret key" hint="Leave blank to keep the saved secret."><input className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, test_secret_key: event.target.value }))} placeholder="sk_test_..." type="password" value={stripeForm.test_secret_key} /></Field>
                                </div>
                            </div>
                            <div className="rounded-3xl border border-slate-100 p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h2 className="font-black text-slate-950">Live keys</h2>
                                    {stripeResource.data?.live_secret_configured && <StatusBadge status={`secret ends ${stripeResource.data.live_secret_last4}`} />}
                                </div>
                                <div className="space-y-4">
                                    <Field label="Live publishable key"><input className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, live_publishable_key: event.target.value }))} placeholder="pk_live_..." value={stripeForm.live_publishable_key} /></Field>
                                    <Field label="Live secret key" hint="Leave blank to keep the saved secret."><input className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, live_secret_key: event.target.value }))} placeholder="sk_live_..." type="password" value={stripeForm.live_secret_key} /></Field>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end"><Button busy={savingStripe} type="submit">Save Stripe settings</Button></div>
                    </form>
                )}
            </Card>

            <Card>
                <CardHeader title="Currency exchange rates" description="Set the rates used when users switch display currency on the frontend. Rates are relative to the platform base/default currency." />
                {currencyResource.loading ? <LoadingBlock rows={4} /> : (
                    <form className="mt-5 space-y-5" onSubmit={saveCurrency}>
                        <Field label="Default currency">
                            <select className={inputClass} onChange={(event) => setCurrencyForm((current) => ({ ...current, default: event.target.value }))} value={currencyForm.default}>
                                {(currencyResource.data?.supported ?? []).map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
                            </select>
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {(currencyResource.data?.supported ?? []).map((item) => (
                                <Field key={item.code} label={`${item.code} rate`} hint={`${item.symbol} ${item.name}`}>
                                    <input className={inputClass} min="0" onChange={(event) => updateRate(item.code, event.target.value)} step="0.00000001" type="number" value={currencyForm.rates[item.code] ?? item.rate ?? 1} />
                                </Field>
                            ))}
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                            Example: if NGN is the base and USD is 0.00063, ₦100,000 displays as about $63 when a user switches to USD.
                        </div>
                        <div className="flex justify-end"><Button busy={savingCurrency} type="submit">Save currency rates</Button></div>
                    </form>
                )}
            </Card>
            </> : <SecurityPage embedded />}
        </div>
    );
}
