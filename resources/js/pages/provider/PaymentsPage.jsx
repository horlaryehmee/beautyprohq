import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    CardHeader,
    Currency,
    EmptyState,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    StatCard,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    formatDate,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';

const gateways = [
    { id: 'paystack', name: 'Paystack', description: 'Best for NGN cards and bank transfers.' },
    { id: 'stripe', name: 'Stripe', description: 'Accept international card payments.' },
    { id: 'paypal', name: 'PayPal', description: 'Receive funds to a PayPal account.' },
];
const normalize = (value, key) => Array.isArray(value) ? value : value?.[key] ?? value?.data ?? [];

export default function ProviderPaymentsPage() {
    const resource = useApiResource('/provider/payments', {});
    const accountsResource = useApiResource('/provider/payment-accounts', {});
    const [activeGateway, setActiveGateway] = useState(null);
    const [account, setAccount] = useState({ account_name: '', account_identifier: '', public_key: '', enabled: true });
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const dashboard = resource.data ?? {};
    const paymentRows = normalize(dashboard, 'payments').length ? normalize(dashboard, 'payments') : normalize(dashboard, 'transactions');
    const transactions = paymentRows.map((row) => row.payment ? {
        ...row.payment,
        booking: row,
        booking_id: row.id,
        service_name: row.service?.name,
        created_at: row.payment.created_at ?? row.created_at,
    } : row);
    const accounts = accountsResource.data?.accounts ?? accountsResource.data ?? {};
    const totals = dashboard.stats ?? dashboard.summary ?? {};

    useEffect(() => {
        if (!activeGateway) return;
        const saved = Array.isArray(accounts) ? accounts.find((item) => item.gateway === activeGateway.id) : accounts?.[activeGateway.id];
        setAccount({ account_name: saved?.account_name ?? '', account_identifier: saved?.account_identifier ?? saved?.account_reference ?? saved?.email ?? '', public_key: saved?.public_key ?? '', enabled: saved?.enabled ?? saved?.is_connected ?? true });
    }, [accounts, activeGateway]);

    const paidTotal = useMemo(() => transactions.filter((item) => item.status === 'paid' || item.status === 'completed').reduce((sum, item) => sum + Number(item.amount ?? 0), 0), [transactions]);

    const saveAccount = async (event) => {
        event.preventDefault(); setSaving(true);
        try {
            const updated = await apiRequest('put', '/provider/payment-accounts', { gateway: activeGateway.id, ...account });
            accountsResource.setData((current) => ({ ...(current ?? {}), accounts: { ...(current?.accounts ?? current ?? {}), [activeGateway.id]: updated ?? { gateway: activeGateway.id, ...account } } }));
            setActiveGateway(null); notify(`${activeGateway.name} connection saved.`);
        } catch (error) { notify(apiErrorMessage(error), 'error'); } finally { setSaving(false); }
    };

    return <div className="space-y-6">
        <PageHeader description="Connect your own account so customer payments can settle directly to you." eyebrow="Money" title="Payments" />
        <div className="grid gap-4 sm:grid-cols-3"><StatCard icon="wallet" label="Paid out" tone="emerald" value={<Currency value={totals.paid ?? totals.total_paid ?? paidTotal} />} /><StatCard icon="booking" label="Pending" tone="amber" value={<Currency value={totals.pending ?? totals.pending_amount ?? 0} />} /><StatCard icon="analytics" label="Transactions" tone="sky" value={totals.transactions ?? transactions.length} /></div>
        {(resource.error || accountsResource.error) && <ErrorState message={resource.error || accountsResource.error} onRetry={() => { resource.reload(); accountsResource.reload(); }} />}
        <Card><CardHeader description="BeautyPro HQ stores connection details securely; settlement remains with your provider account." title="Payment gateways" /><div className="grid gap-3 md:grid-cols-3">{gateways.map((gateway) => { const saved = Array.isArray(accounts) ? accounts.find((item) => item.gateway === gateway.id) : accounts?.[gateway.id]; return <div className="rounded-2xl border border-slate-100 p-4" key={gateway.id}><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-xs font-black uppercase text-white">{gateway.name.slice(0, 2)}</span>{(saved?.enabled ?? saved?.is_connected) && <StatusBadge status="active" />}</div><h2 className="mt-4 font-bold text-slate-950">{gateway.name}</h2><p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">{gateway.description}</p><Button className="mt-4 w-full" onClick={() => setActiveGateway(gateway)} type="button" variant={saved ? 'secondary' : 'primary'}>{saved ? 'Manage' : 'Connect'}</Button></div>; })}</div></Card>
        <Card><CardHeader title="Transactions" />{resource.loading ? <LoadingBlock rows={5} /> : transactions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="pb-3 font-bold">Reference</th><th className="pb-3 font-bold">Booking</th><th className="pb-3 font-bold">Date</th><th className="pb-3 font-bold">Amount</th><th className="pb-3 text-right font-bold">Status</th></tr></thead><tbody>{transactions.map((payment) => <tr className="border-b border-slate-50 last:border-0" key={payment.id}><td className="py-4 font-semibold text-slate-800">{payment.reference ?? `BPHQ-${payment.id}`}</td><td className="py-4 text-slate-500">{payment.booking?.service?.name ?? payment.service_name ?? `#${payment.booking_id}`}</td><td className="py-4 text-slate-500">{formatDate(payment.created_at)}</td><td className="py-4 font-bold text-slate-900"><Currency currency={payment.currency ?? 'NGN'} value={payment.amount} /></td><td className="py-4 text-right"><StatusBadge status={payment.status} /></td></tr>)}</tbody></table></div> : <EmptyState description="Completed booking payments will appear here." icon="wallet" title="No transactions yet" />}</Card>
        {activeGateway && <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setActiveGateway(null)}><Card className="w-full max-w-lg rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}><h2 className="text-lg font-bold text-slate-950">Connect {activeGateway.name}</h2><p className="mt-1 text-sm text-slate-500">Use the public account identifier from your {activeGateway.name} dashboard. Never paste a secret key here.</p><form className="mt-5 space-y-4" onSubmit={saveAccount}><Field label="Account name"><input className={inputClass} onChange={(event) => setAccount((current) => ({ ...current, account_name: event.target.value }))} required value={account.account_name} /></Field><Field label={activeGateway.id === 'paypal' ? 'PayPal email' : 'Settlement account / subaccount code'}><input className={inputClass} onChange={(event) => setAccount((current) => ({ ...current, account_identifier: event.target.value }))} required value={account.account_identifier} /></Field>{activeGateway.id !== 'paypal' && <Field hint="A publishable/public key only." label="Public key"><input className={inputClass} onChange={(event) => setAccount((current) => ({ ...current, public_key: event.target.value }))} value={account.public_key} /></Field>}<label className="flex items-center gap-3 text-sm font-semibold text-slate-700"><input checked={account.enabled} className="size-4 accent-fuchsia-600" onChange={(event) => setAccount((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />Accept payments through this gateway</label><div className="flex justify-end gap-2"><Button onClick={() => setActiveGateway(null)} type="button" variant="secondary">Cancel</Button><Button busy={saving} type="submit">Save connection</Button></div></form></Card></div>}
    </div>;
}
