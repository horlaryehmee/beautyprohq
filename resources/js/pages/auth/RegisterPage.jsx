import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../../components/layout/AuthShell';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import Icon from '../../components/ui/Icon';
import { InlineAlert } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import api, { apiError, collectionFrom } from '../../lib/api';

const fallbackPlans = [
    { key: 'free', name: 'Free Plan', price: 0, currency: 'NGN', billing_period: 'monthly', features: ['Basic listing', 'Reviews', 'Email notifications'] },
    { key: 'paid', name: 'Pro Plan', price: 15000, currency: 'NGN', billing_period: 'monthly', features: ['CRM & loyalty', 'Bookings', 'Payments', 'Digital products'] },
];

const fallbackCurrencies = [
    { code: 'NGN', name: 'Nigerian Naira', rate: 1 },
    { code: 'USD', name: 'US Dollar', rate: 0.00063 },
    { code: 'EUR', name: 'Euro', rate: 0.00054 },
    { code: 'GBP', name: 'British Pound', rate: 0.00047 },
];

const currencyFlags = {
    NGN: 'https://flagcdn.com/w40/ng.png',
    USD: 'https://flagcdn.com/w40/us.png',
    EUR: 'https://flagcdn.com/w40/eu.png',
    GBP: 'https://flagcdn.com/w40/gb.png',
};

const currencySymbols = {
    NGN: '\u20A6',
    USD: '$',
    EUR: '\u20AC',
    GBP: '\u00A3',
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
                <h2 className="text-2xl font-black tracking-tight text-plum-950">Select a plan</h2>
                <p className="mt-1 text-sm font-medium text-stone-500">Choose how you want to start on BeautyPro HQ.</p>
            </div>

            <div className="grid gap-3">
                {plans.map((plan) => {
                    const isSelected = selectedPlan === plan.key;
                    const price = convertedPrice(plan.price, plan.currency ?? 'NGN', displayCurrency, currencies);
                    const description = plan.key === 'free' ? 'directory presence' : 'booking and business tools';

                    return (
                        <button
                            className={`relative overflow-hidden rounded-2xl border text-left transition duration-300 ${isSelected ? 'border-plum-950 bg-[#241711] text-white shadow-[0_18px_35px_rgba(36,23,17,.18)]' : 'border-stone-200 bg-[#fffdf9] text-plum-950 hover:border-stone-300 hover:bg-white'}`}
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
                                            <h3 className="text-lg font-black leading-tight">{plan.name}</h3>
                                            <p className={`mt-1 text-sm font-semibold lowercase ${isSelected ? 'text-white/70' : 'text-stone-500'}`}>{description}</p>
                                        </div>
                                    </div>

                                    <div className="shrink-0 text-right">
                                        <p className="text-xl font-black leading-none">{money(price, displayCurrency)}</p>
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
    const [step, setStep] = useState(1);
    const [displayCurrency, setDisplayCurrency] = useState('NGN');
    const [currencyOpen, setCurrencyOpen] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', role: 'provider', plan: 'paid', password: '', password_confirmation: '' });
    const [plans, setPlans] = useState([]);
    const [currencies, setCurrencies] = useState(fallbackCurrencies);
    const [accepted, setAccepted] = useState(false);
    const [errors, setErrors] = useState({});
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        api.get('/subscription-plans').then((response) => setPlans(collectionFrom(response))).catch(() => setPlans([]));
        api.get('/currencies').then((response) => {
            const supported = response?.data?.data?.supported ?? response?.data?.supported ?? [];
            if (supported.length) setCurrencies(supported);
        }).catch(() => {});
    }, []);

    const visiblePlans = plans.length ? plans : fallbackPlans;
    const selectedPlan = useMemo(() => visiblePlans.find((plan) => plan.key === form.plan) ?? visiblePlans.find((plan) => plan.key === 'paid') ?? visiblePlans[0], [form.plan, visiblePlans]);

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
            navigate('/provider/onboarding', { replace: true });
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
            eyebrow={`Step ${step} of 3`}
            title="Join BeautyPro HQ as a professional"
            description="Choose your provider plan first. Customers can book without creating an account."
            footer={<>Already have an account? <Link to="/login" className="font-black text-rose-700 hover:text-rose-900">Log in</Link></>}
        >
            <div className="mb-6 grid grid-cols-3 gap-2">
                {['Plan', 'Account', 'Confirm'].map((label, index) => (
                    <button
                        className={`rounded-2xl px-3 py-2 text-xs font-black transition ${step === index + 1 ? 'bg-plum-950 text-white' : index + 1 < step ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}
                        key={label}
                        onClick={() => index + 1 < step && setStep(index + 1)}
                        type="button"
                    >
                        {label}
                    </button>
                ))}
            </div>

            {error && <InlineAlert>{error}</InlineAlert>}

            {step === 1 && (
                <div className="space-y-4">
                    <div className="relative flex justify-end">
                        <button
                            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 text-sm font-black text-plum-950 shadow-sm transition hover:bg-cream-100"
                            onClick={() => setCurrencyOpen((value) => !value)}
                            type="button"
                        >
                            <img
                                alt=""
                                className="h-4 w-5 rounded-sm object-cover"
                                src={currencyFlags[displayCurrency]}
                            />
                            {displayCurrency}
                            <Icon name="chevronDown" size={14} />
                        </button>

                        {currencyOpen && (
                            <div className="absolute right-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl">
                                {currencies.map((item) => (
                                    <button
                                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-black transition ${displayCurrency === item.code ? 'bg-plum-950 text-white' : 'text-plum-950 hover:bg-cream-100'}`}
                                        key={item.code}
                                        onClick={() => { setDisplayCurrency(item.code); setCurrencyOpen(false); }}
                                        type="button"
                                    >
                                        <img
                                            alt=""
                                            className="h-4 w-5 rounded-sm object-cover"
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

            {step === 2 && (
                <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setStep(3); }}>
                    <FormField label="Full name" icon="user" autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} error={errors.name} placeholder="Your full name" required autoFocus />
                    <FormField label="Email address" type="email" icon="mail" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} error={errors.email} placeholder="you@example.com" required />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} error={errors.password} hint="Use 8+ characters with letters and numbers." placeholder="Create a password" minLength={8} required />
                        <FormField label="Confirm password" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(event) => update('password_confirmation', event.target.value)} error={errors.password_confirmation} placeholder="Repeat password" required />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => setStep(1)} type="button" variant="secondary">Back</Button>
                        <Button type="submit">Continue</Button>
                    </div>
                </form>
            )}

            {step === 3 && (
                <form className="space-y-4" onSubmit={submit}>
                    <div className="rounded-2xl border border-stone-200 bg-white p-5">
                        <p className="text-xs font-black uppercase tracking-wide text-stone-400">Selected plan</p>
                        <h2 className="mt-1 text-xl font-black text-plum-950">{selectedPlan?.name}</h2>
                        <p className="mt-2 text-sm text-stone-600">You can set your service pricing currency later inside Services.</p>
                    </div>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-cream-100 p-3 text-xs font-medium leading-5 text-stone-600">
                        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 size-4 shrink-0 rounded border-stone-300 accent-plum-900" />
                        I agree to use BeautyPro HQ responsibly and accept the platform terms and privacy notice.
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => setStep(2)} type="button" variant="secondary">Back</Button>
                        <Button type="submit" disabled={submitting}>{submitting ? 'Creating account...' : 'Create professional account'}</Button>
                    </div>
                </form>
            )}
        </AuthShell>
    );
}
