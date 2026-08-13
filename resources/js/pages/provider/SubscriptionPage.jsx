import { useEffect, useState } from 'react';
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
    Pagination,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    useApiResource,
} from '../../components/dashboard';
import { useAuth } from '../../context/AuthContext';

const normalize = (value, key) => {
    if (Array.isArray(value)) return value;
    const keyed = value?.[key];
    if (Array.isArray(keyed)) return keyed;
    if (Array.isArray(keyed?.data)) return keyed.data;
    if (Array.isArray(value?.data)) return value.data;
    return [];
};
const metaFrom = (value, key) => value?.[key]?.meta ?? value?.meta ?? {};

export default function ProviderSubscriptionPage() {
    const [paymentPage, setPaymentPage] = useState(1);
    const resource = useApiResource('/provider/subscription', {}, { params: { payments_page: paymentPage, payments_per_page: 10 } });
    const [busy, setBusy] = useState('');
    const [paymentResult, setPaymentResult] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const { refreshUser } = useAuth();
    const data = resource.data ?? {};
    const plans = normalize(data, 'plans');
    const payments = normalize(data, 'payments');
    const paymentsMeta = metaFrom(data, 'payments');
    const paymentPageCount = Number(paymentsMeta.last_page ?? paymentsMeta.lastPage ?? 1);
    const currentPaymentPage = Number(paymentsMeta.current_page ?? paymentsMeta.currentPage ?? paymentPage);
    const subscription = data.subscription;
    const activePlan = subscription?.plan ?? 'free';
    const activePlanDefinition = subscription?.plan_definition ?? subscription?.planDefinition;
    const activePlanKey = activePlanDefinition?.key ?? activePlan;
    const activePlanLabel = activePlanDefinition?.name ?? `${activePlan} plan`;
    const paidActive = (activePlan === 'paid' || Number(activePlanDefinition?.price ?? 0) > 0) && subscription?.status === 'active';
    const cancelAtPeriodEnd = Boolean(subscription?.metadata?.cancel_at_period_end);
    const pendingPaidSelection = Boolean(data.pending_paid_plan_selection);
    const subscriptionGateway = data.subscription_gateway ?? 'paystack';
    const gatewayConfigured = subscriptionGateway === 'stripe' ? data.stripe_configured : data.paystack_configured;
    const gatewayLabel = subscriptionGateway === 'stripe' ? 'Stripe' : 'Paystack';

    useEffect(() => {
        const reference = searchParams.get('reference') || searchParams.get('trxref');
        const sessionId = searchParams.get('session_id');
        if (!reference) return;
        let cancelled = false;
        setBusy('verify');
        apiRequest('post', '/provider/subscription/verify', { reference, session_id: sessionId || undefined })
            .then(async (subscriptionResponse) => {
                if (cancelled) return;
                await refreshUser();
                await resource.reload();
                if (cancelled) return;
                setPaymentResult({
                    status: 'success',
                    title: 'Payment successful',
                    message: 'Your paid provider tools are active. Go to the dashboard to load the Pro workspace.',
                    subscription: subscriptionResponse,
                });
                setSearchParams({}, { replace: true });
            })
            .catch((error) => {
                if (cancelled) return;
                setPaymentResult({
                    status: 'failed',
                    title: 'Payment not completed',
                    message: apiErrorMessage(error) || 'The payment was declined or could not be verified. You can try again from the subscription page.',
                });
                setSearchParams({}, { replace: true });
            })
            .finally(() => !cancelled && setBusy(''));
        return () => { cancelled = true; };
    }, [refreshUser, resource, searchParams, setSearchParams]);

    const goToDashboard = () => {
        window.location.assign('/provider');
    };

    const checkout = async (planKey) => {
        setBusy(`checkout:${planKey}`);
        try {
            const response = await apiRequest('post', '/provider/subscription/checkout', { plan: planKey, gateway: subscriptionGateway, currency: data.account_currency || data.detected_currency });
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
        if (!window.confirm('Downgrade to free? Your provider verification will be declined and dashboard access will require admin approval again.')) return;
        setBusy('downgrade');
        try {
            await apiRequest('post', '/provider/subscription/downgrade');
            notify('Downgrade requested. Provider verification was declined.');
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
            {paymentResult && (
                <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="subscription-payment-result-title">
                    <Card className="w-full max-w-lg rounded-b-none sm:rounded-3xl">
                        <div className={`grid size-12 place-items-center rounded-2xl ${paymentResult.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {paymentResult.status === 'success' ? 'OK' : '!'}
                        </div>
                        <h2 id="subscription-payment-result-title" className="mt-4 text-2xl font-semibold text-slate-950">{paymentResult.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{paymentResult.message}</p>
                        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            {paymentResult.status !== 'success' && <Button onClick={() => setPaymentResult(null)} type="button" variant="secondary">Try again</Button>}
                            <Button onClick={goToDashboard} type="button">Go to dashboard</Button>
                        </div>
                    </Card>
                </div>
            )}
            {resource.loading ? <LoadingBlock rows={5} /> : (
                <>
                    <Card>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Current plan</p>
                                <h2 className="mt-1 text-2xl font-semibold text-slate-950">{activePlanLabel}</h2>
                                <p className="mt-1 text-sm text-slate-500">{paidActive ? (cancelAtPeriodEnd ? 'Paid tools remain active until this billing period ends, but verification will need admin approval again for continued access.' : 'Advanced business tools are active.') : (pendingPaidSelection ? 'Your account is approved. Complete payment to activate paid tools.' : 'Basic listing, reviews, and email notifications are active.')}</p>
                            </div>
                            <StatusBadge status={subscription?.status ?? 'active'} />
                        </div>
                    </Card>

                    <div className="grid gap-5 lg:grid-cols-2">
                        {plans.map((plan) => {
                            const isPaid = Number(plan.price ?? 0) > 0;
                            const isCurrent = (activePlanKey === plan.key || (!activePlanDefinition && activePlan === plan.key)) && subscription?.status === 'active';
                            return (
                                <Card className={isPaid ? 'border-fuchsia-200 shadow-fuchsia-100/70' : ''} key={plan.key}>
                                    <CardHeader
                                        title={plan.name}
                                        description={isPaid ? 'Advanced features for business operations.' : 'Basic visibility and trust features.'}
                                        action={isCurrent ? <StatusBadge status="active" /> : null}
                                    />
                                    <p className="text-3xl font-semibold text-slate-950">
                                        <Currency currency={plan.display_currency ?? plan.currency} value={plan.display_price ?? plan.price} />
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
                                            paidActive ? (isCurrent ? <Button busy={busy === 'downgrade'} disabled={cancelAtPeriodEnd} onClick={downgrade} type="button" variant="secondary">{cancelAtPeriodEnd ? 'Renewal cancelled' : 'Downgrade to free'}</Button> : <Button disabled type="button" variant="secondary">Paid plan active</Button>)
                                                : <Button busy={busy === `checkout:${plan.key}`} disabled={!gatewayConfigured} onClick={() => checkout(plan.key)} type="button">{pendingPaidSelection ? `Continue payment with ${gatewayLabel}` : `Choose ${plan.name}`}</Button>
                                        ) : (
                                            paidActive ? null : <Button disabled type="button" variant="secondary">Current plan</Button>
                                        )}
                                        {isPaid && !gatewayConfigured && <p className="mt-2 text-xs text-rose-600">Admin needs to configure {gatewayLabel} before paid upgrades can be processed.</p>}
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
                                <Pagination page={currentPaymentPage} pageCount={paymentPageCount} onPageChange={setPaymentPage} />
                            </div>
                        ) : <EmptyState description="Paid plan transactions will appear here." icon="subscription" title="No subscription payments yet" />}
                    </Card>
                </>
            )}
        </div>
    );
}
