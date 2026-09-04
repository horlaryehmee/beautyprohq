import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/layout/AuthShell';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import Icon from '../../components/ui/Icon';
import { InlineAlert } from '../../components/ui/Feedback';
import GoogleAuthButton from '../../components/auth/GoogleAuthButton';
import { useAuth } from '../../context/AuthContext';
import api, { apiError, unwrap } from '../../lib/api';
import { browserCurrency, detectIpCurrency } from '../../lib/browserCurrency';

const fallbackPlans = [
    { key: 'free', name: 'Free Plan', price: 0, currency: 'NGN', billing_period: 'monthly', features: ['Basic listing', 'Reviews', 'Email notifications'] },
    { key: 'paid', name: 'Pro Plan', price: 15000, currency: 'NGN', billing_period: 'monthly', features: ['CRM & loyalty', 'Bookings', 'Payments', 'Digital products'] },
];

const fallbackCurrencies = [
    { code: 'NGN', name: 'Nigerian Naira', rate: 1 },
    { code: 'USD', name: 'US Dollar', rate: 0.00063 },
];

const subscriptionCurrencyCodes = new Set(['NGN', 'USD']);
const subscriptionCurrency = (currency) => currency === 'NGN' ? 'NGN' : 'USD';

const currencyFlags = {
    NGN: 'https://flagcdn.com/w40/ng.png',
    USD: 'https://flagcdn.com/w40/us.png',
};

const currencySymbols = {
    NGN: '\u20A6',
    USD: '$',
};

function convertedPrice(amount, from, to, currencies) {
    const rates = Object.fromEntries(currencies.map((item) => [item.code, Number(item.rate || 1)]));
    const value = Number(amount ?? 0);
    if (!Number.isFinite(value)) return 0;
    if (from === to) return value;
    return (value / (rates[from] ?? 1)) * (rates[to] ?? 1);
}

function money(amount, code) {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: code, maximumFractionDigits: Number(amount) % 1 === 0 ? 0 : 2 }).format(Number(amount ?? 0));
}

function PlanSelector({ plans, selectedPlan, displayCurrency, currencies, onSelect }) {
    return (
        <div className="rounded-[1.75rem] border border-stone-200 bg-white p-3 shadow-[0_18px_45px_rgba(45,29,22,.08)]">
            <div className="px-2 pb-3 pt-1">
                <h2 className="text-2xl font-semibold tracking-tight text-plum-950">Select a plan</h2>
                <p className="mt-1 text-sm font-medium text-stone-500">Choose how you want to start on BeautyPro HQ.</p>
            </div>

            <div className="grid gap-3">
                {plans.map((plan) => {
                    const isSelected = selectedPlan === plan.key;
                    const price = plan.display_currency === displayCurrency && plan.display_price != null
                        ? Number(plan.display_price)
                        : convertedPrice(plan.price, plan.currency ?? 'NGN', displayCurrency, currencies);
                    const description = plan.key === 'free' ? 'directory presence' : 'booking and business tools';

                    return (
                        <button
                            className={`relative overflow-hidden rounded-2xl border text-left transition duration-300 ${isSelected ? 'border-plum-950 bg-[#2A1D14] text-white shadow-[0_18px_35px_rgba(36,23,17,.18)]' : 'border-stone-200 bg-[#FFFFFFdf9] text-plum-950 hover:border-stone-300 hover:bg-white'}`}
                            key={plan.key}
                            onClick={() => onSelect(plan.key)}
                            type="button"
                        >
                            <div className="p-4 sm:p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex min-w-0 gap-3">
                                        <span className={`mt-1 grid size-6 shrink-0 place-items-center rounded-full border-2 transition ${isSelected ? 'border-white' : 'border-stone-300'}`}>
                                            <span className={`size-3 rounded-full transition ${isSelected ? 'scale-100 bg-white' : 'scale-0 bg-transparent'}`} />
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-semibold leading-tight">{plan.name}</h3>
                                            <p className={`mt-1 text-sm font-semibold lowercase ${isSelected ? 'text-white/70' : 'text-stone-500'}`}>{description}</p>
                                        </div>
                                    </div>

                                    <div className="shrink-0 text-right">
                                        <p className="text-xl font-semibold leading-none">{money(price, displayCurrency)}</p>
                                        <p className={`mt-1 text-[11px] font-bold capitalize ${isSelected ? 'text-white/55' : 'text-stone-400'}`}>{plan.billing_period}</p>
                                    </div>
                                </div>

                                <div className={`mt-5 grid gap-3 overflow-hidden transition-all duration-300 ${isSelected ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'}`}>
                                    {(plan.features ?? []).slice(0, 6).map((feature) => (
                                        <span className={`inline-flex items-center gap-2 text-sm font-semibold ${isSelected ? 'text-white/82' : 'text-stone-600'}`} key={feature}>
                                            <span className={`grid size-5 shrink-0 place-items-center rounded-full ${isSelected ? 'bg-white/12 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                                                <Icon name="check" size={12} />
                                            </span>
                                            {feature}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requestedRole = searchParams.get('role') === 'customer' ? 'customer' : 'provider';
    const requestedEmail = searchParams.get('email') ?? '';
    const [step, setStep] = useState(1);
    const [displayCurrency, setDisplayCurrency] = useState(() => subscriptionCurrency(browserCurrency()));
    const [currencyOpen, setCurrencyOpen] = useState(false);
    const [form, setForm] = useState({ name: '', email: requestedEmail, role: requestedRole, plan: requestedRole === 'customer' ? 'free' : 'paid', password: '', password_confirmation: '' });
    const [plans, setPlans] = useState([]);
    const [currencies, setCurrencies] = useState(fallbackCurrencies);
    const [accepted, setAccepted] = useState(false);
    const [errors, setErrors] = useState({});
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        detectIpCurrency().then((currency) => {
            if (!cancelled && currency) setDisplayCurrency(subscriptionCurrency(currency));
        }).finally(() => {
            if (cancelled) return;
            api.get('/subscription-plans').then((response) => {
                const payload = unwrap(response);
                setPlans(Array.isArray(payload?.plans) ? payload.plans : []);
                if (payload?.detected_currency) setDisplayCurrency(subscriptionCurrency(payload.detected_currency));
            }).catch(() => setPlans([]));
            api.get('/currencies').then((response) => {
                const supported = response?.data?.data?.supported ?? response?.data?.supported ?? [];
                const detected = response?.data?.data?.detected ?? response?.data?.detected;
                const subscriptionCurrencies = supported.filter((item) => subscriptionCurrencyCodes.has(item.code));
                if (subscriptionCurrencies.length) setCurrencies(subscriptionCurrencies);
                if (detected) setDisplayCurrency(subscriptionCurrency(detected));
            }).catch(() => {});
        });
        return () => { cancelled = true; };
    }, []);

    const visiblePlans = (plans.length ? plans.filter((plan) => plan.is_active !== false) : fallbackPlans);
    const selectedPlan = useMemo(() => visiblePlans.find((plan) => plan.key === form.plan) ?? visiblePlans.find((plan) => plan.key === 'paid') ?? visiblePlans[0], [form.plan, visiblePlans]);
    const isCustomerSignup = form.role === 'customer';
    const steps = isCustomerSignup ? ['Account', 'Confirm'] : ['Plan', 'Account', 'Confirm'];

    useEffect(() => {
        setForm((current) => ({
            ...current,
            email: requestedEmail || current.email,
            role: requestedRole,
            plan: requestedRole === 'customer' ? 'free' : current.plan || 'paid',
        }));
        setStep(1);
    }, [requestedEmail, requestedRole]);

    function update(key, value) {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    }

    async function submit(event) {
        event.preventDefault();
        if (!accepted) {
            setError('Please confirm that you agree to the platform terms and privacy notice.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await register(form);
            navigate(isCustomerSignup ? '/customer' : '/verify-email', { replace: true });
        } catch (requestError) {
            const parsed = apiError(requestError, 'Your account could not be created.');
            setError(parsed.message);
            setErrors(parsed.fields);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AuthShell
            eyebrow={`Step ${step} of ${steps.length}`}
            title={isCustomerSignup ? 'Create your customer account' : 'Join BeautyPro HQ as a professional'}
            description={isCustomerSignup ? 'Use the same email from your booking to track bookings, payments and provider updates.' : 'Choose your provider plan first. Customers can book without creating an account.'}
            footer={<>Already have an account? <Link to="/login" className="font-semibold text-rose-700 hover:text-rose-900">Log in</Link></>}
        >
            <div className={`mb-6 grid gap-2 ${isCustomerSignup ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {steps.map((label, index) => (
                    <button
                        className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${step === index + 1 ? 'bg-plum-950 text-white' : index + 1 < step ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}
                        key={label}
                        onClick={() => index + 1 < step && setStep(index + 1)}
                        type="button"
                    >
                        {label}
                    </button>
                ))}
            </div>

            {error && <InlineAlert>{error}</InlineAlert>}
            {searchParams.get('google_error') && <InlineAlert>{searchParams.get('google_error')}</InlineAlert>}

            {!isCustomerSignup && step === 1 && (
                <div className="space-y-4">
                    <div className="relative flex justify-end">
                        <button
                            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 text-sm font-semibold text-plum-950 shadow-sm transition hover:bg-cream-100"
                            onClick={() => setCurrencyOpen((value) => !value)}
                            type="button"
                        >
                            <img
                                alt=""
                                className="h-4 w-5 rounded-sm object-cover"
                                onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                src={currencyFlags[displayCurrency]}
                            />
                            {displayCurrency}
                            <Icon name="chevronDown" size={14} />
                        </button>

                        {currencyOpen && (
                            <div className="absolute right-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl">
                                {currencies.map((item) => (
                                    <button
                                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${displayCurrency === item.code ? 'bg-plum-950 text-white' : 'text-plum-950 hover:bg-cream-100'}`}
                                        key={item.code}
                                        onClick={() => { setDisplayCurrency(item.code); setCurrencyOpen(false); }}
                                        type="button"
                                    >
                                        <img
                                            alt=""
                                            className="h-4 w-5 rounded-sm object-cover"
                                            onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                            src={currencyFlags[item.code]}
                                        />
                                        <span>{item.code}</span>
                                        <span className={`ml-auto text-xs font-bold ${displayCurrency === item.code ? 'text-white/70' : 'text-stone-400'}`}>{currencySymbols[item.code] ?? ''}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <PlanSelector plans={visiblePlans} selectedPlan={form.plan} displayCurrency={displayCurrency} currencies={currencies} onSelect={(plan) => update('plan', plan)} />

                    <Button className="w-full" onClick={() => setStep(2)} size="lg" type="button">Continue <Icon name="arrow" size={17} /></Button>
                </div>
            )}

            {(isCustomerSignup ? step === 1 : step === 2) && (
                <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setStep(isCustomerSignup ? 2 : 3); }}>
                    <GoogleAuthButton
                        href={`/auth/google/redirect?${new URLSearchParams({ intent: 'register', role: form.role, plan: form.plan })}`}
                        label="Register with Google"
                        note="By registering with Google, you accept the platform terms and privacy notice."
                    />
                    <FormField label="Full name" icon="user" autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} error={errors.name} placeholder="Your full name" required autoFocus />
                    <FormField label="Email address" type="email" icon="mail" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} error={errors.email} placeholder="you@example.com" required />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} error={errors.password} hint="Use 8+ characters with letters and numbers." placeholder="Create a password" minLength={8} required />
                        <FormField label="Confirm password" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(event) => update('password_confirmation', event.target.value)} error={errors.password_confirmation} placeholder="Repeat password" required />
                    </div>
                    <div className={`grid gap-2 ${isCustomerSignup ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {!isCustomerSignup && <Button onClick={() => setStep(1)} type="button" variant="secondary">Back</Button>}
                        <Button type="submit">Continue</Button>
                    </div>
                </form>
            )}

            {(isCustomerSignup ? step === 2 : step === 3) && (
                <form className="space-y-4" onSubmit={submit}>
                    {!isCustomerSignup && (
                        <div className="rounded-2xl border border-stone-200 bg-white p-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Selected plan</p>
                            <h2 className="mt-1 text-xl font-semibold text-plum-950">{selectedPlan?.name}</h2>
                            <p className="mt-2 text-sm text-stone-600">You can set your service pricing currency later inside Services.</p>
                        </div>
                    )}
                    {isCustomerSignup && (
                        <div className="rounded-2xl border border-stone-200 bg-white p-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Customer account</p>
                            <h2 className="mt-1 text-xl font-semibold text-plum-950">{form.email}</h2>
                            <p className="mt-2 text-sm text-stone-600">Your previous guest bookings with this email will stay connected to this account.</p>
                        </div>
                    )}
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-cream-100 p-3 text-xs font-medium leading-5 text-stone-600">
                        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 size-4 shrink-0 rounded border-stone-300 accent-plum-900" />
                        I agree to use BeautyPro HQ responsibly and accept the platform terms and privacy notice.
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => setStep(isCustomerSignup ? 1 : 2)} type="button" variant="secondary">Back</Button>
                        <Button type="submit" disabled={submitting}>{submitting ? 'Creating account...' : (isCustomerSignup ? 'Create customer account' : 'Create professional account')}</Button>
                    </div>
                </form>
            )}
        </AuthShell>
    );
}
