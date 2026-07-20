import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Button,
    Card,
    CardHeader,
    Currency,
    EmptyState,
    ErrorState,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';

const normalize = (value, key) => Array.isArray(value) ? value : value?.[key] ?? value?.data ?? [];

export default function ProviderSubscriptionPage() {
    const resource = useApiResource('/provider/subscription', {});
    const [busy, setBusy] = useState('');
    const [searchParams, setSearchParams] = useSearchParams();
    const { notify } = useDashboardToast();
    const data = resource.data ?? {};
    const plans = normalize(data, 'plans');
    const payments = normalize(data, 'payments');
    const subscription = data.subscription;
    const activePlan = subscription?.plan ?? 'free';
    const paidActive = activePlan === 'paid' && subscription?.status === 'active';

    const paidPlan = useMemo(() => plans.find((plan) => plan.key === 'paid'), [plans]);

    useEffect(() => {
        const reference = searchParams.get('reference') || searchParams.get('trxref');
        if (!reference) return;
        let cancelled = false;
        setBusy('verify');
        apiRequest('post', '/provider/subscription/verify', { reference })
            .then(() => {
                if (cancelled) return;
                notify('Paid plan activated.');
                resource.reload();
                setSearchParams({}, { replace: true });
            })
            .catch((error) => !cancelled && notify(apiErrorMessage(error), 'error'))
            .finally(() => !cancelled && setBusy(''));
        return () => { cancelled = true; };
    }, [notify, resource, searchParams, setSearchParams]);

    const checkout = async () => {
        setBusy('checkout');
        try {
            const response = await apiRequest('post', '/provider/subscription/checkout', { plan: 'paid' });
            if (response.authorization_url) {
                window.location.href = response.authorization_url;
                return;
            }
            notify('Paystack checkout could not be opened.', 'error');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setBusy('');
        }
    };

    const downgrade = async () => {
        if (!window.confirm('Move this account back to the free plan? Paid tools will no longer be available.')) return;
        setBusy('downgrade');
        try {
            await apiRequest('post', '/provider/subscription/downgrade');
            notify('You are now on the free plan.');
            resource.reload();
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                description="Choose the plan that matches how you want to use BeautyPro HQ."
                eyebrow="Provider plan"
                title="Subscription"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            {resource.loading ? <LoadingBlock rows={5} /> : (
                <>
                    <Card>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Current plan</p>
                                <h2 className="mt-1 text-2xl font-black capitalize text-slate-950">{activePlan} plan</h2>
                                <p className="mt-1 text-sm text-slate-500">{paidActive ? 'Advanced business tools are active.' : 'Basic listing, reviews, and email notifications are active.'}</p>
                            </div>
                            <StatusBadge status={subscription?.status ?? 'active'} />
                        </div>
                    </Card>

                    <div className="grid gap-5 lg:grid-cols-2">
                        {plans.map((plan) => {
                            const isPaid = plan.key === 'paid';
                            const isCurrent = activePlan === plan.key && subscription?.status === 'active';
                            return (
                                <Card className={isPaid ? 'border-fuchsia-200 shadow-fuchsia-100/70' : ''} key={plan.key}>
                                    <CardHeader
                                        title={plan.name}
                                        description={isPaid ? 'Advanced features for business operations.' : 'Basic visibility and trust features.'}
                                        action={isCurrent ? <StatusBadge status="active" /> : null}
                                    />
                                    <p className="text-3xl font-black text-slate-950">
                                        <Currency currency={plan.currency} value={plan.price} />
                                        <span className="ml-1 text-sm font-bold text-slate-400">/{plan.billing_period}</span>
                                    </p>
                                    <ul className="mt-5 space-y-3">
                                        {(plan.features ?? []).map((feature) => (
                                            <li className="flex gap-3 text-sm leading-6 text-slate-600" key={feature}>
                                                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fuchsia-600" />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-6">
                                        {isPaid ? (
                                            paidActive ? <Button busy={busy === 'downgrade'} onClick={downgrade} type="button" variant="secondary">Downgrade to free</Button>
                                                : <Button busy={busy === 'checkout'} disabled={!data.paystack_configured} onClick={checkout} type="button">Upgrade with Paystack</Button>
                                        ) : (
                                            paidActive ? null : <Button disabled type="button" variant="secondary">Current plan</Button>
                                        )}
                                        {isPaid && !data.paystack_configured && <p className="mt-2 text-xs text-rose-600">Admin needs to add PAYSTACK_SECRET_KEY before paid upgrades can be processed.</p>}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>

                    <Card>
                        <CardHeader title="Subscription payments" />
                        {payments.length ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-left text-sm">
                                    <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="pb-3">Reference</th><th className="pb-3">Plan</th><th className="pb-3">Amount</th><th className="pb-3 text-right">Status</th></tr></thead>
                                    <tbody>{payments.map((payment) => (
                                        <tr className="border-b border-slate-50 last:border-0" key={payment.id}>
                                            <td className="py-3 font-semibold text-slate-800">{payment.reference}</td>
                                            <td className="py-3 text-slate-500">{payment.plan?.name ?? payment.plan ?? 'Paid Plan'}</td>
                                            <td className="py-3 font-bold text-slate-950"><Currency currency={payment.currency} value={payment.amount} /></td>
                                            <td className="py-3 text-right"><StatusBadge status={payment.status} /></td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        ) : <EmptyState description="Paid plan transactions will appear here." icon="subscription" title="No subscription payments yet" />}
                    </Card>
                </>
            )}
        </div>
    );
}
