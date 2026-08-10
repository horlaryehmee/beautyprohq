import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DashboardToastProvider, Field, LoadingBlock, apiErrorMessage, apiRequest, dashboardApi, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';
import { useAuth } from '../../context/AuthContext';
import { defaultCountries } from 'react-international-phone';
import { browserCurrency, detectIpCurrency } from '../../lib/browserCurrency';

const days = [
    ['1', 'Monday'],
    ['2', 'Tuesday'],
    ['3', 'Wednesday'],
    ['4', 'Thursday'],
    ['5', 'Friday'],
    ['6', 'Saturday'],
    ['0', 'Sunday'],
];

const currencies = ['NGN', 'USD', 'EUR', 'GBP'];
const socialOptions = ['Instagram', 'TikTok', 'Pinterest', 'Website', 'Facebook', 'YouTube', 'LinkedIn', 'WhatsApp'];
const minimumBioWords = 40;
const countryOptions = defaultCountries
    .map(([name, iso2, dialCode]) => ({ code: iso2.toUpperCase(), name, dialCode: `+${dialCode}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
const defaultPhoneCountry = countryOptions.find((country) => country.code === 'NG') ?? countryOptions[0];

function flagUrl(countryCode) {
    return `https://flagcdn.com/w40/${String(countryCode).toLowerCase()}.png`;
}

function wordCount(value) {
    return String(value ?? '').trim().match(/\b[\w'-]+\b/g)?.length ?? 0;
}

function CountryPhoneField({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const selectedCountry = countryOptions.find((country) => String(value ?? '').startsWith(country.dialCode)) ?? defaultPhoneCountry;
    const localNumber = String(value ?? '').replace(selectedCountry.dialCode, '').trim();

    function updateCountry(countryCode) {
        const nextCountry = countryOptions.find((country) => country.code === countryCode) ?? defaultPhoneCountry;
        onChange(`${nextCountry.dialCode}${localNumber ? ` ${localNumber}` : ''}`);
        setOpen(false);
    }

    function updateLocalNumber(nextValue) {
        onChange(`${selectedCountry.dialCode}${nextValue ? ` ${nextValue}` : ''}`);
    }

    return (
        <div className="block text-sm font-bold text-slate-700">
            <span>Phone number <span aria-hidden="true" className="text-rose-600">*</span></span>
            <div className="relative mt-1.5 flex min-h-12 overflow-visible rounded-xl border border-slate-200 bg-white focus-within:border-fuchsia-400 focus-within:ring-4 focus-within:ring-fuchsia-100">
                <button
                    type="button"
                    className="flex w-16 items-center justify-center gap-1 rounded-l-xl border-r border-slate-200 bg-white"
                    onClick={() => setOpen((current) => !current)}
                    aria-expanded={open}
                    aria-label="Select country code"
                >
                    <img src={flagUrl(selectedCountry.code)} alt={`${selectedCountry.name} flag`} className="h-4 w-6 rounded-[2px] object-cover" loading="lazy" />
                    <span className="text-xs text-slate-500">v</span>
                </button>
                {open && (
                    <div className="absolute left-0 top-[calc(100%+.35rem)] z-50 max-h-72 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                        {countryOptions.map((country) => (
                            <button
                                key={`${country.code}-${country.dialCode}`}
                                type="button"
                                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 ${selectedCountry.code === country.code ? 'bg-slate-50' : ''}`}
                                onClick={() => updateCountry(country.code)}
                            >
                                <img src={flagUrl(country.code)} alt={`${country.name} flag`} className="h-4 w-6 rounded-[2px] object-cover" loading="lazy" />
                                <span className="min-w-0 flex-1 truncate">{country.name}</span>
                                <span className="shrink-0 font-black">{country.dialCode}</span>
                            </button>
                        ))}
                    </div>
                )}
                <span className="flex min-w-20 items-center justify-center border-r border-slate-200 px-3 text-sm font-black text-slate-800">{selectedCountry.dialCode}</span>
                <input
                    className="min-w-0 flex-1 px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    value={localNumber}
                    onChange={(event) => updateLocalNumber(event.target.value)}
                    placeholder="802 123 4567"
                    required
                    type="tel"
                />
            </div>
        </div>
    );
}

function CountrySelectField({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const selectedCountry = countryOptions.find((country) => country.name.toLowerCase() === String(value ?? '').toLowerCase());

    function choose(country) {
        onChange(country.name);
        setOpen(false);
    }

    return (
        <div className="block text-sm font-bold text-slate-700">
            <span>Country <span aria-hidden="true" className="text-rose-600">*</span></span>
            <div className="relative mt-1.5">
                <button
                    type="button"
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 transition focus:border-fuchsia-400 focus:outline-none focus:ring-4 focus:ring-fuchsia-100"
                    onClick={() => setOpen((current) => !current)}
                    aria-expanded={open}
                >
                    {selectedCountry ? <img src={flagUrl(selectedCountry.code)} alt={`${selectedCountry.name} flag`} className="h-4 w-6 rounded-[2px] object-cover" loading="lazy" /> : <span className="h-4 w-6 rounded-[2px] bg-slate-100" />}
                    <span className={`min-w-0 flex-1 truncate ${selectedCountry ? 'font-semibold' : 'text-slate-400'}`}>{selectedCountry?.name ?? 'Select country'}</span>
                    <span className="text-xs text-slate-500">v</span>
                </button>
                {open && (
                    <div className="absolute left-0 right-0 top-[calc(100%+.35rem)] z-50 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                        {countryOptions.map((country) => (
                            <button
                                key={country.code}
                                type="button"
                                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 ${selectedCountry?.code === country.code ? 'bg-slate-50' : ''}`}
                                onClick={() => choose(country)}
                            >
                                <img src={flagUrl(country.code)} alt={`${country.name} flag`} className="h-4 w-6 rounded-[2px] object-cover" loading="lazy" />
                                <span className="min-w-0 flex-1 truncate">{country.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function ProviderOnboardingContent() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { notify } = useDashboardToast();
    const categoriesResource = useApiResource('/provider-categories', []);
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);

    const defaultForm = {
        name: user?.name ?? '',
        provider_category_id: '',
        profession: '',
        bio: '',
        profile_photo: null,
        cover_image: null,
        contact_email: user?.email ?? '',
        contact_phone: user?.phone ?? '',
        website: '',
        social_links: [{ platform: 'Instagram', url: '' }],
        location: '',
        country: '',
        city: '',
        default_currency: browserCurrency(),
        base_price: '',
        availability: [
            { day_of_week: 1, start_time: '09:00', end_time: '18:00' },
            { day_of_week: 2, start_time: '09:00', end_time: '18:00' },
            { day_of_week: 3, start_time: '09:00', end_time: '18:00' },
            { day_of_week: 4, start_time: '09:00', end_time: '18:00' },
            { day_of_week: 5, start_time: '09:00', end_time: '18:00' },
        ],
        portfolio_images: [],
        terms_accepted: false,
    };

    const [form, setForm] = useState(() => {
        try {
            const saved = sessionStorage.getItem('bphq_onboarding_draft');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    ...defaultForm,
                    ...parsed,
                    profile_photo: null,
                    cover_image: null,
                    portfolio_images: [],
                };
            }
        } catch {}
        return defaultForm;
    });

    const hasRestoredDraft = Boolean(sessionStorage.getItem('bphq_onboarding_draft'));

    // Save form to sessionStorage on changes (debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                const { profile_photo, cover_image, portfolio_images, ...serializable } = form;
                sessionStorage.setItem('bphq_onboarding_draft', JSON.stringify(serializable));
            } catch {}
        }, 500);
        return () => clearTimeout(timer);
    }, [form]);

    const categories = Array.isArray(categoriesResource.data) ? categoriesResource.data : categoriesResource.data?.data ?? [];
    const bioWords = wordCount(form.bio);

    const sections = useMemo(() => [
        ['General', 'Business details'],
        ['Images', 'Profile and cover'],
        ['Contact', 'Email, phone, website'],
        ['Socials', 'Social networks'],
        ['Location', 'Country and city'],
        ['Pricing', 'Base price and currency'],
        ['Work hours', 'Availability'],
        ['Portfolio', 'Up to 6 images'],
        ['Terms', 'Review and accept'],
    ], []);

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const updateSocial = (index, patch) => setForm((current) => ({ ...current, social_links: current.social_links.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
    const addSocial = () => setForm((current) => ({ ...current, social_links: [...current.social_links, { platform: 'Instagram', url: '' }] }));
    const removeSocial = (index) => setForm((current) => ({ ...current, social_links: current.social_links.filter((_, itemIndex) => itemIndex !== index) }));
    const toggleDay = (day) => setForm((current) => {
        const exists = current.availability.some((slot) => Number(slot.day_of_week) === Number(day));
        return {
            ...current,
            availability: exists
                ? current.availability.filter((slot) => Number(slot.day_of_week) !== Number(day))
                : [...current.availability, { day_of_week: Number(day), start_time: '09:00', end_time: '18:00' }].sort((a, b) => Number(a.day_of_week) - Number(b.day_of_week)),
        };
    });
    const updateSlot = (day, patch) => setForm((current) => ({ ...current, availability: current.availability.map((slot) => Number(slot.day_of_week) === Number(day) ? { ...slot, ...patch } : slot) }));

    const submit = async (event) => {
        event.preventDefault();
        if (bioWords < minimumBioWords) {
            setStep(0);
            notify(`About Me / Description must be well written and at least ${minimumBioWords} words.`, 'error');
            return;
        }
        setSaving(true);
        try {
            const payload = new FormData();
            Object.entries(form).forEach(([key, value]) => {
                if (key === 'social_links' || key === 'availability') {
                    payload.append(key, JSON.stringify(value));
                } else if (key === 'portfolio_images') {
                    value.forEach((file) => payload.append('portfolio_images[]', file));
                } else if (value instanceof File) {
                    payload.append(key, value);
                } else {
                    payload.append(key, value ?? '');
                }
            });
            payload.set('terms_accepted', form.terms_accepted ? '1' : '0');
            payload.set('social_links', JSON.stringify(form.social_links.filter((item) => item.url)));
            payload.set('availability', JSON.stringify(form.availability));

            const response = await dashboardApi.post('/provider/onboarding', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
            const data = response?.data?.data ?? {};
            const nextPath = data.redirect_to ?? '/provider';
            sessionStorage.removeItem('bphq_onboarding_draft');
            if (data.checkout_required) {
                notify('Listing details saved. Opening payment checkout...');
                const detectedCurrency = await detectIpCurrency();
                const checkout = await apiRequest('post', '/provider/subscription/checkout', { plan: 'paid', currency: detectedCurrency || browserCurrency() });
                if (checkout.authorization_url) {
                    window.location.href = checkout.authorization_url;
                    return;
                }
                notify('Payment checkout could not be opened.', 'error');
                return;
            }
            notify(data.payment_required ? 'Listing details saved. Continue to payment to activate your paid plan.' : 'Listing details saved.');
            window.location.href = nextPath;
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    if (categoriesResource.loading) return <LoadingBlock rows={6} />;

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-700">Provider setup</p>
                    <h1 className="mt-2 font-display text-4xl font-normal text-slate-950">Your listing details</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Let’s help you set up your page.</p>
                    {hasRestoredDraft && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                            <span className="font-bold">Your progress was restored.</span> Text fields have been saved. Please re-select any images (profile, cover, portfolio) that were previously uploaded.
                            <button className="ml-3 font-bold underline" type="button" onClick={() => { sessionStorage.removeItem('bphq_onboarding_draft'); window.location.reload(); }}>Clear draft</button>
                        </div>
                    )}
                </div>

                <form className="grid gap-6 lg:grid-cols-[260px_1fr]" onSubmit={submit}>
                    <aside className="lg:sticky lg:top-6 lg:self-start">
                        <Card className="p-3">
                            {sections.map(([title, subtitle], index) => (
                                <button className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${step === index ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`} key={title} onClick={() => setStep(index)} type="button">
                                    <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${step === index ? 'bg-white text-slate-950' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</span>
                                    <span>
                                        <span className="block text-sm font-semibold">{title}</span>
                                        <span className="block text-xs opacity-70">{subtitle}</span>
                                    </span>
                                </button>
                            ))}
                        </Card>
                    </aside>

                    <Card>
                        {step === 0 && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Business name" required><input className={inputClass} onChange={(event) => update('name', event.target.value)} required value={form.name} /></Field>
                                <Field label="Category" required>
                                    <select className={inputClass} onChange={(event) => update('provider_category_id', event.target.value)} required value={form.provider_category_id}>
                                        <option value="">Select category</option>
                                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Professional title" required><input className={inputClass} onChange={(event) => update('profession', event.target.value)} placeholder="Bridal Makeup Artist" required value={form.profession} /></Field>
                                <Field
                                    className="sm:col-span-2"
                                    hint={`Write at least ${minimumBioWords} words about your experience, services, style, clients and what makes your work trustworthy. Current: ${bioWords} words.`}
                                    label="About Me / Description"
                                    required
                                >
                                    <textarea
                                        className={`${inputClass} min-h-40`}
                                        minLength={180}
                                        onChange={(event) => update('bio', event.target.value)}
                                        placeholder="Example: I am a certified bridal makeup artist with five years of experience creating soft glam, editorial and event looks for clients who want polished, long-lasting results..."
                                        required
                                        value={form.bio}
                                    />
                                </Field>
                            </div>
                        )}

                        {step === 1 && (
                            <div className="grid gap-5 sm:grid-cols-2">
                                <Field label="Profile image" required><input accept="image/*" className={inputClass} onChange={(event) => update('profile_photo', event.target.files?.[0] ?? null)} required type="file" /></Field>
                                <Field label="Cover image" required><input accept="image/*" className={inputClass} onChange={(event) => update('cover_image', event.target.files?.[0] ?? null)} required type="file" /></Field>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Email" required><input className={inputClass} onChange={(event) => update('contact_email', event.target.value)} required type="email" value={form.contact_email} /></Field>
                                <CountryPhoneField value={form.contact_phone} onChange={(phone) => update('contact_phone', phone)} />
                                <Field className="sm:col-span-2" label="Website (optional)"><input className={inputClass} onChange={(event) => update('website', event.target.value)} placeholder="https://..." type="url" value={form.website} /></Field>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-3">
                                {form.social_links.map((item, index) => (
                                    <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]" key={index}>
                                        <select className={inputClass} onChange={(event) => updateSocial(index, { platform: event.target.value })} value={item.platform}>
                                            {socialOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                                        </select>
                                        <input className={inputClass} onChange={(event) => updateSocial(index, { url: event.target.value })} placeholder="https://..." type="url" value={item.url} />
                                        <Button onClick={() => removeSocial(index)} type="button" variant="secondary">Remove</Button>
                                    </div>
                                ))}
                                <Button onClick={addSocial} type="button" variant="soft">Add social link</Button>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field className="sm:col-span-2" label="Location" required><input className={inputClass} onChange={(event) => update('location', event.target.value)} placeholder="123 Main Street, Atlanta, GA" required value={form.location} /></Field>
                                <CountrySelectField value={form.country} onChange={(country) => update('country', country)} />
                                <Field label="City" required><input className={inputClass} onChange={(event) => update('city', event.target.value)} required value={form.city} /></Field>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Currency" required>
                                    <select className={inputClass} onChange={(event) => update('default_currency', event.target.value)} required value={form.default_currency}>
                                        {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                                    </select>
                                </Field>
                                <Field label="Base price" required><input className={inputClass} min="0" onChange={(event) => update('base_price', event.target.value)} required type="number" value={form.base_price} /></Field>
                            </div>
                        )}

                        {step === 6 && (
                            <div className="space-y-3">
                                {days.map(([value, label]) => {
                                    const slot = form.availability.find((item) => Number(item.day_of_week) === Number(value));
                                    return (
                                        <div className="grid gap-3 rounded-2xl border border-slate-100 p-3 sm:grid-cols-[1fr_150px_150px]" key={value}>
                                            <label className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                                                <input checked={Boolean(slot)} className="size-4 accent-fuchsia-700" onChange={() => toggleDay(value)} type="checkbox" />
                                                {label}
                                            </label>
                                            <input className={inputClass} disabled={!slot} onChange={(event) => updateSlot(value, { start_time: event.target.value })} type="time" value={slot?.start_time ?? '09:00'} />
                                            <input className={inputClass} disabled={!slot} onChange={(event) => updateSlot(value, { end_time: event.target.value })} type="time" value={slot?.end_time ?? '18:00'} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {step === 7 && (
                            <div className="space-y-5">
                                <Field label="Portfolio gallery images (optional)">
                                    <input
                                        accept="image/*"
                                        className={inputClass}
                                        multiple
                                        onChange={(event) => update('portfolio_images', Array.from(event.target.files ?? []).slice(0, 6))}
                                        type="file"
                                    />
                                    <p className="mt-2 text-xs font-semibold text-slate-400">Add up to 6 images. If you skip this, your profile picture will be used in the gallery.</p>
                                </Field>
                                {form.portfolio_images.length > 0 && (
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        {form.portfolio_images.map((file, index) => (
                                            <div key={`${file.name}-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                                                <span className="block truncate">{file.name}</span>
                                                <span className="mt-1 block text-xs text-slate-400">{Math.round(file.size / 1024)} KB</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 8 && (
                            <div className="space-y-5">
                                <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                                    <h2 className="font-semibold text-slate-950">BeautyPro HQ provider terms</h2>
                                    <p className="mt-3">You agree to provide accurate listing information, honour confirmed appointments, communicate professionally with customers, and keep your pricing, availability, and contact details current.</p>
                                    <p className="mt-3">You are responsible for your services, customer communication, external links, payment accounts, and compliance with applicable laws in your location.</p>
                                </div>
                                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-bold text-slate-700">
                                    <input checked={form.terms_accepted} className="mt-1 size-4 accent-fuchsia-700" onChange={(event) => update('terms_accepted', event.target.checked)} required type="checkbox" />
                                    <span>I have read and accept the BeautyPro HQ terms and conditions. <span aria-hidden="true" className="text-rose-600">*</span></span>
                                </label>
                            </div>
                        )}

                        <div className="mt-8 flex justify-between gap-3 border-t border-slate-100 pt-5">
                            <Button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button" variant="secondary">Back</Button>
                            {step < sections.length - 1
                                ? <Button onClick={() => {
                                    if (step === 0 && bioWords < minimumBioWords) {
                                        notify(`About Me / Description must be well written and at least ${minimumBioWords} words.`, 'error');
                                        return;
                                    }
                                    setStep((current) => Math.min(sections.length - 1, current + 1));
                                }} type="button">Continue</Button>
                                : <Button busy={saving} type="submit">Submit listing details</Button>}
                        </div>
                    </Card>
                </form>
            </div>
        </div>
    );
}

export default function ProviderOnboardingPage() {
    return (
        <DashboardToastProvider>
            <ProviderOnboardingContent />
        </DashboardToastProvider>
    );
}
