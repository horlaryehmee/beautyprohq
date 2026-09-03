import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
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
    useDashboardToast,
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
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');
const paidPlans = ['paid', 'pro', 'daily_test'];
const isPaidActiveSubscription = (subscription) => paidPlans.includes(subscription?.plan) && subscription?.status === 'active';
const fallbackSubscriptionCurrencies = [
    { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', rate: 1 },
    { code: 'USD', name: 'US Dollar', symbol: '$', rate: 0.00063 },
];
const currencyFlags = {
    NGN: 'https://flagcdn.com/w40/ng.png',
    USD: 'https://flagcdn.com/w40/us.png',
};

const convertedPrice = (amount, from, to, currencies) => {
    const rates = Object.fromEntries(currencies.map((currency) => [currency.code, Number(currency.rate || 1)]));
    const value = Number(amount ?? 0);
    if (!Number.isFinite(value) || from === to) return value;
    return Math.round(((value / (rates[from] ?? 1)) * (rates[to] ?? 1)) * 100) / 100;
};

export default function ProviderSubscriptionPage() {
    const [paymentPage, setPaymentPage] = useState(1);
    const resource = useApiResource('/provider/subscription', {}, { params: { payments_page: paymentPage, payments_per_page: 10 } });
    const [busy, setBusy] = useState('');
    const [paymentResult, setPaymentResult] = useState(null);
    const [selectedCurrency, setSelectedCurrency] = useState('');
    const [currencyOpen, setCurrencyOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const handledPaymentReturn = useRef('');
    const { refreshUser } = useAuth();
    const { notify } = useDashboardToast();
    const { data: resourceData, setData: setSubscriptionData, loading, error, reload } = resource;
    const data = resourceData ?? {};
    const plans = normalize(data, 'plans').filter((plan) => plan.is_active !== false);
    const payments = normalize(data, 'payments');
    const paymentsMeta = metaFrom(data, 'payments');
    const paymentPageCount = Number(paymentsMeta.last_page ?? paymentsMeta.lastPage ?? 1);
    const currentPaymentPage = Number(paymentsMeta.current_page ?? paymentsMeta.currentPage ?? paymentPage);
    const subscription = data.subscription;
    const history = normalize(data, 'subscription_history');
    const activePlan = subscription?.plan ?? 'free';
    const activePlanDefinition = subscription?.plan_definition ?? subscription?.planDefinition;
    const activePlanKey = activePlanDefinition?.key ?? activePlan;
    const activePlanLabel = activePlanDefinition?.name ?? `${activePlan} plan`;
    const paidActive = isPaidActiveSubscription(subscription);
    const cancelAtPeriodEnd = Boolean(subscription?.metadata?.cancel_at_period_end);
    const pendingPaidSelection = Boolean(data.pending_paid_plan_selection);
    const subscriptionGateway = data.subscription_gateway ?? 'paystack';
    const subscriptionCurrencies = data.subscription_currencies?.length ? data.subscription_currencies : fallbackSubscriptionCurrencies;
    const displayCurrency = selectedCurrency || data.account_currency || data.detected_currency || 'NGN';
    const gatewayConfigured = subscriptionGateway === 'stripe' ? data.stripe_configured : data.paystack_configured;
    const gatewayLabel = subscriptionGateway === 'stripe' ? 'Stripe' : 'Paystack';
    const paymentReference = searchParams.get('reference') || searchParams.get('trxref') || '';
    const paymentSessionId = searchParams.get('session_id') || '';

    useEffect(() => {
        if (!selectedCurrency && (data.account_currency || data.detected_currency)) {
            setSelectedCurrency(data.account_currency || data.detected_currency);
        }
    }, [data.account_currency, data.detected_currency, selectedCurrency]);

    useEffect(() => {
        if (!paymentReference) return;
        const returnKey = `${paymentReference}:${paymentSessionId}`;
        if (handledPaymentReturn.current === returnKey) return;
        handledPaymentReturn.current = returnKey;

        let cancelled = false;
        setBusy('verify');
        apiRequest('post', '/provider/subscription/verify', { reference: paymentReference, session_id: paymentSessionId || undefined })
            .then(async (subscriptionResponse) => {
                if (cancelled) return;
                await refreshUser();
                await reload();
                if (cancelled) return;
                setPaymentResult({
                    status: 'success',
                    title: 'Payment successful',
                    message: 'Your paid provider tools are active. Go to the dashboard to load the Pro workspace.',
                    subscription: subscriptionResponse,
                });
                setSearchParams({}, { replace: true });
            })
            .catch(async (error) => {
                if (cancelled) return;
                const latest = await apiRequest('get', '/provider/subscription').catch(() => null);
                if (cancelled) return;
                if (isPaidActiveSubscription(latest?.subscription)) {
                    setSubscriptionData(latest);
                    await refreshUser();
                    if (cancelled) return;
                    setPaymentResult({
                        status: 'success',
                        title: 'Payment successful',
                        message: 'Your paid provider tools are active. Go to the dashboard to load the Pro workspace.',
                        subscription: latest.subscription,
                    });
                    setSearchParams({}, { replace: true });
                    return;
                }

                setPaymentResult({
                    status: 'failed',
                    title: 'Payment not completed',
                    message: apiErrorMessage(error) || 'The payment was declined or could not be verified. You can try again from the subscription page.',
                });
                setSearchParams({}, { replace: true });
            })
            .finally(() => !cancelled && setBusy(''));
        return () => { cancelled = true; };
    }, [paymentReference, paymentSessionId, refreshUser, reload, setSearchParams, setSubscriptionData]);

    const goToDashboard = () => {
        window.location.assign('/provider');
    };

    const checkout = async (planKey) => {
        setBusy(`checkout:${planKey}`);
        try {
            const response = await apiRequest('post', '/provider/subscription/checkout', { plan: planKey, gateway: subscriptionGateway, currency: displayCurrency });
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
        if (!window.confirm('Cancel subscription renewal? You will keep paid provider tools until your current paid period ends.')) return;
        setBusy('downgrade');
        try {
            await apiRequest('post', '/provider/subscription/downgrade');
            notify('Subscription renewal cancelled. Paid tools remain active until the period ends.');
            await refreshUser();
            reload();
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={(
                    <div className="relative min-w-48">
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Display currency</p>
                        <button
                            aria-expanded={currencyOpen}
                            aria-haspopup="listbox"
                            className="inline-flex min-h-11 w-full items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 text-sm font-semibold text-plum-950 shadow-sm transition hover:bg-cream-100"
                            onClick={() => setCurrencyOpen((open) => !open)}
                            type="button"
                        >
                            <img
                                alt=""
                                className="h-4 w-5 rounded-sm object-cover"
                                onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                src={currencyFlags[displayCurrency]}
                            />
                            {displayCurrency}
                            <Icon className="ml-auto" name="chevronDown" size={14} />
                        </button>

                        {currencyOpen && (
                            <div className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl" role="listbox">
                                {subscriptionCurrencies.map((currency) => (
                                    <button
                                        aria-selected={displayCurrency === currency.code}
                                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${displayCurrency === currency.code ? 'bg-plum-950 text-white' : 'text-plum-950 hover:bg-cream-100'}`}
                                        key={currency.code}
                                        onClick={() => { setSelectedCurrency(currency.code); setCurrencyOpen(false); }}
                                        role="option"
                                        type="button"
                                    >
                                        <img
                                            alt=""
                                            className="h-4 w-5 rounded-sm object-cover"
                                            onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                            src={currencyFlags[currency.code]}
                                        />
                                        <span>{currency.code}</span>
                                        <span className={`ml-auto text-xs font-bold ${displayCurrency === currency.code ? 'text-white/70' : 'text-stone-400'}`}>{currency.symbol ?? ''}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                description="Choose the plan that matches how you want to use BeautyPro HQ."
                eyebrow="Provider plan"
                title="Subscription"
            />

            {error && <ErrorState message={error} onRetry={reload} />}
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
            {loading ? <LoadingBlock rows={5} /> : (
                <>
                    <Card>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Current plan</p>
                                <h2 className="mt-1 text-2xl font-semibold text-slate-950">{activePlanLabel}</h2>
                                <p className="mt-1 text-sm text-slate-500">{paidActive ? (cancelAtPeriodEnd ? 'Renewal is cancelled. Paid tools remain active until the current period ends.' : 'Advanced business tools are active.') : (pendingPaidSelection ? 'Your account is approved. Complete payment to activate paid tools.' : 'Basic listing, reviews, and email notifications are active.')}</p>
                                {subscription && (
                                    <p className="mt-2 text-xs font-medium text-slate-500">
                                        Started: {formatDateTime(subscription.starts_at)}
                                        <span className="mx-2 text-slate-300">|</span>
                                        {cancelAtPeriodEnd ? 'Access ends' : 'Renews'}: {formatDateTime(subscription.renews_at ?? subscription.ends_at)}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={subscription?.status ?? 'active'} />
                                {paidActive && (
                                    <Button busy={busy === 'downgrade'} disabled={cancelAtPeriodEnd} onClick={downgrade} type="button" variant={cancelAtPeriodEnd ? 'secondary' : 'danger'}>{cancelAtPeriodEnd ? 'Cancellation scheduled' : 'Cancel subscription'}</Button>
                                )}
                            </div>
                        </div>
                    </Card>

                    <div className="grid gap-5 lg:grid-cols-2">
                        {plans.map((plan) => {
                            const isPaid = Number(plan.price ?? 0) > 0;
                            const isCurrent = (activePlanKey === plan.key || (!activePlanDefinition && activePlan === plan.key)) && subscription?.status === 'active';
                            const price = plan.display_currency === displayCurrency && plan.display_price != null
                                ? Number(plan.display_price)
                                : convertedPrice(plan.billing_price ?? plan.price, plan.billing_currency ?? plan.currency ?? 'NGN', displayCurrency, subscriptionCurrencies);
                            return (
                                <Card className={isPaid ? 'border-fuchsia-200 shadow-fuchsia-100/70' : ''} key={plan.key}>
                                    <CardHeader
                                        title={plan.name}
                                        description={isPaid ? 'Advanced features for business operations.' : 'Basic visibility and trust features.'}
                                        action={isCurrent ? <StatusBadge status="active" /> : null}
                                    />
                                    <p className="text-3xl font-semibold text-slate-950">
                                        <Currency currency={displayCurrency} value={price} />
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
                                            paidActive ? (isCurrent ? <Button busy={busy === 'downgrade'} disabled={cancelAtPeriodEnd} onClick={downgrade} type="button" variant="secondary">{cancelAtPeriodEnd ? 'Cancellation scheduled' : 'Cancel renewal'}</Button> : <Button disabled type="button" variant="secondary">Paid plan active</Button>)
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
                    <Card>
                        <CardHeader title="Subscription history" description="Every monthly and daily subscription period is recorded here." />
                        {history.length ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-left text-sm">
                                    <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="pb-3">Plan</th><th className="pb-3">Started</th><th className="pb-3">Renews / Ended</th><th className="pb-3">Amount</th><th className="pb-3 text-right">Status</th></tr></thead>
                                    <tbody>{history.map((period) => (
                                        <tr className="border-b border-slate-50 last:border-0" key={period.id}>
                                            <td className="py-3 font-semibold text-slate-800">{period.plan_definition?.name ?? period.planDefinition?.name ?? `${period.plan} plan`}</td>
                                            <td className="py-3 text-slate-500">{formatDateTime(period.starts_at)}</td>
                                            <td className="py-3 text-slate-500">{period.status === 'active' && period.renews_at ? formatDateTime(period.renews_at) : formatDateTime(period.ends_at)}</td>
                                            <td className="py-3 font-bold text-slate-950"><Currency currency={period.currency} value={period.amount} /></td>
                                            <td className="py-3 text-right"><StatusBadge status={period.status} /></td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        ) : <EmptyState description="Your subscription periods will appear here." icon="subscription" title="No subscription history yet" />}
                    </Card>
                </>
            )}
        </div>
    );
}
