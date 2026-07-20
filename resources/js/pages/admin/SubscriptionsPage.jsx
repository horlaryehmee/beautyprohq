import { useMemo, useState } from 'react';
import {
    Avatar,
    Button,
    Card,
    CardHeader,
    Currency,
    EmptyState,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    SearchInput,
    StatCard,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    formatDate,
    inputClass,
    useApiResource,
    useDashboardToast,
    useDebouncedValue,
} from '../../components/dashboard';
import { useCurrency } from '../../context/CurrencyContext';

const normalize = (value) => Array.isArray(value) ? value : value?.subscriptions ?? value?.data ?? [];

export default function AdminSubscriptionsPage() {
    const subscriptionsResource = useApiResource('/admin/subscriptions', []);
    const plansResource = useApiResource('/admin/subscription-plans', []);
    const [query, setQuery] = useState('');
    const [editingPlan, setEditingPlan] = useState(null);
    const [form, setForm] = useState({ name: '', price: '', currency: 'NGN', billing_period: 'monthly', features: '' });
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const { supported } = useCurrency();
    const search = useDebouncedValue(query);
    const subscriptions = normalize(subscriptionsResource.data);
    const plans = normalize(plansResource.data);

    const visible = useMemo(() => subscriptions.filter((item) => `${item.user?.name ?? ''} ${item.user?.email ?? item.email ?? ''} ${item.plan ?? ''}`.toLowerCase().includes(search.toLowerCase())), [search, subscriptions]);
    const active = subscriptions.filter((item) => item.status === 'active').length;
    const monthlyRevenue = subscriptions.filter((item) => item.status === 'active' && ['paid', 'pro'].includes(item.plan)).reduce((sum, item) => sum + Number(item.amount ?? item.plan_amount ?? 0), 0);

    const startEdit = (plan) => {
        setEditingPlan(plan);
        setForm({
            name: plan.name ?? '',
            price: plan.price ?? 0,
            currency: plan.currency ?? 'NGN',
            billing_period: plan.billing_period ?? 'monthly',
            features: (plan.features ?? []).join('\n'),
        });
    };

    const savePlan = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const saved = await apiRequest('put', `/admin/subscription-plans/${editingPlan.id}`, {
                name: form.name,
                price: Number(form.price),
                currency: form.currency,
                billing_period: form.billing_period,
                features: form.features.split('\n').map((item) => item.trim()).filter(Boolean),
            });
            plansResource.setData((current) => normalize(current).map((plan) => plan.id === saved.id ? saved : plan));
            setEditingPlan(null);
            notify('Plan updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const exportCsv = () => {
        const rows = [['Name', 'Email', 'Plan', 'Status', 'Amount', 'Started'], ...subscriptions.map((item) => [item.user?.name ?? '', item.user?.email ?? item.email ?? '', item.plan ?? '', item.status ?? '', item.amount ?? 0, item.created_at ?? ''])];
        const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        link.download = 'beautypro-subscriptions.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<Button disabled={!subscriptions.length} onClick={exportCsv} type="button" variant="secondary">Export CSV</Button>}
                description="Set provider plan pricing, manage plan features, and track subscription payments."
                eyebrow="Plans"
                title="Subscriptions"
            />

            {(subscriptionsResource.error || plansResource.error) && <ErrorState message={subscriptionsResource.error || plansResource.error} onRetry={() => { subscriptionsResource.reload(); plansResource.reload(); }} />}

            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard icon="subscription" label="Active plans" tone="emerald" value={active} />
                <StatCard icon="users" label="All subscribers" tone="plum" value={subscriptions.length} />
                <StatCard icon="wallet" label="Monthly paid value" tone="sky" value={<Currency value={monthlyRevenue} />} />
            </div>

            <Card>
                <CardHeader description="Free remains free. Edit the paid price here before opening subscriptions." title="Provider plans" />
                {plansResource.loading ? <LoadingBlock rows={2} /> : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {plans.map((plan) => (
                            <article className="rounded-3xl border border-slate-100 p-5" key={plan.id}>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">{plan.key}</p>
                                        <h2 className="mt-1 text-xl font-black text-slate-950">{plan.name}</h2>
                                    </div>
                                    <StatusBadge status={plan.is_active ? 'active' : 'draft'} />
                                </div>
                                <p className="mt-4 text-2xl font-black text-slate-950"><Currency currency={plan.currency} value={plan.price} /> <span className="text-sm text-slate-400">/{plan.billing_period}</span></p>
                                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                                    {(plan.features ?? []).slice(0, 6).map((feature) => <li className="flex gap-2" key={feature}><span className="mt-2 size-1.5 rounded-full bg-fuchsia-600" />{feature}</li>)}
                                </ul>
                                <Button className="mt-5" onClick={() => startEdit(plan)} type="button" variant="secondary">Edit plan</Button>
                            </article>
                        ))}
                    </div>
                )}
            </Card>

            <Card>
                <SearchInput className="mb-5" onChange={(event) => setQuery(event.target.value)} placeholder="Search subscriber or plan" value={query} />
                {subscriptionsResource.loading ? <LoadingBlock rows={5} /> : visible.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                            <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="pb-3 font-bold">Member</th><th className="pb-3 font-bold">Plan</th><th className="pb-3 font-bold">Amount</th><th className="pb-3 font-bold">Started</th><th className="pb-3 font-bold">Renews</th><th className="pb-3 text-right font-bold">Status</th></tr></thead>
                            <tbody>{visible.map((item) => (
                                <tr className="border-b border-slate-50 last:border-0" key={item.id}>
                                    <td className="py-3"><div className="flex items-center gap-3"><Avatar name={item.user?.name} size="sm" /><div><p className="font-bold text-slate-900">{item.user?.name ?? 'Member'}</p><p className="text-xs text-slate-400">{item.user?.email ?? item.email}</p></div></div></td>
                                    <td className="py-3 font-semibold capitalize text-slate-700">{item.plan ?? 'free'}</td>
                                    <td className="py-3 font-bold text-slate-900"><Currency currency={item.currency} value={item.amount} /></td>
                                    <td className="py-3 text-slate-500">{formatDate(item.starts_at ?? item.created_at)}</td>
                                    <td className="py-3 text-slate-500">{formatDate(item.renews_at ?? item.current_period_end)}</td>
                                    <td className="py-3 text-right"><StatusBadge status={item.status ?? 'active'} /></td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                ) : <EmptyState description="Subscription records will appear when members choose a plan." icon="subscription" title="No subscriptions found" />}
            </Card>

            {editingPlan && (
                <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setEditingPlan(null)}>
                    <Card className="w-full max-w-2xl rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="text-lg font-black text-slate-950">Edit {editingPlan.name}</h2>
                        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={savePlan}>
                            <Field label="Plan name"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required value={form.name} /></Field>
                            <Field label="Price"><input className={inputClass} disabled={editingPlan.key === 'free'} min="0" onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} required type="number" value={form.price} /></Field>
                            <Field label="Currency"><select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} required value={form.currency}>{supported.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></Field>
                            <Field label="Billing period"><select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, billing_period: event.target.value }))} value={form.billing_period}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
                            <Field className="sm:col-span-2" label="Features" hint="One feature per line."><textarea className={`${inputClass} min-h-44`} onChange={(event) => setForm((current) => ({ ...current, features: event.target.value }))} value={form.features} /></Field>
                            <div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={() => setEditingPlan(null)} type="button" variant="secondary">Cancel</Button><Button busy={saving} type="submit">Save plan</Button></div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
