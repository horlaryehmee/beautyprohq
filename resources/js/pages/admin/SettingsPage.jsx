import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, ErrorState, Field, LoadingBlock, PageHeader, StatusBadge, apiErrorMessage, apiRequest, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';

export default function AdminSettingsPage() {
    const paystackResource = useApiResource('/admin/payment-settings/paystack', {});
    const currencyResource = useApiResource('/admin/settings/currencies', {});
    const { notify } = useDashboardToast();
    const [paystackForm, setPaystackForm] = useState({ mode: 'test', test_public_key: '', test_secret_key: '', live_public_key: '', live_secret_key: '' });
    const [currencyForm, setCurrencyForm] = useState({ default: 'NGN', rates: {} });
    const [savingPaystack, setSavingPaystack] = useState(false);
    const [savingCurrency, setSavingCurrency] = useState(false);

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
    const error = paystackResource.error || currencyResource.error;

    return (
        <div className="space-y-6">
            <PageHeader description="Configure platform-level payment and currency behavior." eyebrow="Platform" title="Settings" />
            {error && <ErrorState message={error} onRetry={() => { paystackResource.reload(); currencyResource.reload(); }} />}

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
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                            <p className="font-black">Strict payment ownership</p>
                            <p className="mt-1">A plan payment can only activate the same logged-in provider that started checkout. Verification checks the Paystack reference, user ID, local payment ID, plan ID, amount, and currency.</p>
                        </div>
                        <div className="flex justify-end"><Button busy={savingPaystack} type="submit">Save Paystack settings</Button></div>
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
        </div>
    );
}
