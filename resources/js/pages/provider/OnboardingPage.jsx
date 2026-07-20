import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DashboardToastProvider, Field, LoadingBlock, apiErrorMessage, dashboardApi, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';
import { useAuth } from '../../context/AuthContext';

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
const socialOptions = ['Instagram', 'TikTok', 'Facebook', 'YouTube', 'LinkedIn', 'WhatsApp', 'Website'];

function ProviderOnboardingContent() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { notify } = useDashboardToast();
    const categoriesResource = useApiResource('/provider-categories', []);
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
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
        default_currency: 'NGN',
        base_price: '',
        availability: [
            { day_of_week: 1, start_time: '09:00', end_time: '18:00' },
            { day_of_week: 2, start_time: '09:00', end_time: '18:00' },
            { day_of_week: 3, start_time: '09:00', end_time: '18:00' },
            { day_of_week: 4, start_time: '09:00', end_time: '18:00' },
            { day_of_week: 5, start_time: '09:00', end_time: '18:00' },
        ],
        terms_accepted: false,
    });

    const categories = Array.isArray(categoriesResource.data) ? categoriesResource.data : categoriesResource.data?.data ?? [];

    const sections = useMemo(() => [
        ['General', 'Business details'],
        ['Images', 'Profile and cover'],
        ['Contact', 'Email, phone, website'],
        ['Socials', 'Social networks'],
        ['Location', 'Country and city'],
        ['Pricing', 'Base price and currency'],
        ['Work hours', 'Availability'],
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
        setSaving(true);
        try {
            const payload = new FormData();
            Object.entries(form).forEach(([key, value]) => {
                if (key === 'social_links' || key === 'availability') {
                    payload.append(key, JSON.stringify(value));
                } else if (value instanceof File) {
                    payload.append(key, value);
                } else {
                    payload.append(key, value ?? '');
                }
            });
            payload.set('terms_accepted', form.terms_accepted ? '1' : '0');
            payload.set('social_links', JSON.stringify(form.social_links.filter((item) => item.url)));
            payload.set('availability', JSON.stringify(form.availability));

            await dashboardApi.post('/provider/onboarding', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
            notify('Listing details saved.');
            navigate('/provider', { replace: true });
            window.location.reload();
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
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-fuchsia-700">Provider setup</p>
                    <h1 className="mt-2 font-display text-4xl font-normal text-slate-950">Your listing details</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Let’s help you set up your page.</p>
                </div>

                <form className="grid gap-6 lg:grid-cols-[260px_1fr]" onSubmit={submit}>
                    <aside className="lg:sticky lg:top-6 lg:self-start">
                        <Card className="p-3">
                            {sections.map(([title, subtitle], index) => (
                                <button className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${step === index ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`} key={title} onClick={() => setStep(index)} type="button">
                                    <span className={`grid size-7 place-items-center rounded-full text-xs font-black ${step === index ? 'bg-white text-slate-950' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</span>
                                    <span>
                                        <span className="block text-sm font-black">{title}</span>
                                        <span className="block text-xs opacity-70">{subtitle}</span>
                                    </span>
                                </button>
                            ))}
                        </Card>
                    </aside>

                    <Card>
                        {step === 0 && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Business name"><input className={inputClass} onChange={(event) => update('name', event.target.value)} required value={form.name} /></Field>
                                <Field label="Category">
                                    <select className={inputClass} onChange={(event) => update('provider_category_id', event.target.value)} required value={form.provider_category_id}>
                                        <option value="">Select category</option>
                                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Professional title"><input className={inputClass} onChange={(event) => update('profession', event.target.value)} placeholder="Bridal Makeup Artist" required value={form.profession} /></Field>
                                <Field className="sm:col-span-2" label="Description"><textarea className={`${inputClass} min-h-40`} minLength={20} onChange={(event) => update('bio', event.target.value)} required value={form.bio} /></Field>
                            </div>
                        )}

                        {step === 1 && (
                            <div className="grid gap-5 sm:grid-cols-2">
                                <Field label="Profile image"><input accept="image/*" className={inputClass} onChange={(event) => update('profile_photo', event.target.files?.[0] ?? null)} required type="file" /></Field>
                                <Field label="Cover image"><input accept="image/*" className={inputClass} onChange={(event) => update('cover_image', event.target.files?.[0] ?? null)} required type="file" /></Field>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Email"><input className={inputClass} onChange={(event) => update('contact_email', event.target.value)} required type="email" value={form.contact_email} /></Field>
                                <Field label="Phone number"><input className={inputClass} onChange={(event) => update('contact_phone', event.target.value)} required value={form.contact_phone} /></Field>
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
                                <Field className="sm:col-span-2" label="Location"><input className={inputClass} onChange={(event) => update('location', event.target.value)} placeholder="123 Main Street, Atlanta, GA" required value={form.location} /></Field>
                                <Field label="Country"><input className={inputClass} onChange={(event) => update('country', event.target.value)} required value={form.country} /></Field>
                                <Field label="City"><input className={inputClass} onChange={(event) => update('city', event.target.value)} required value={form.city} /></Field>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Currency">
                                    <select className={inputClass} onChange={(event) => update('default_currency', event.target.value)} required value={form.default_currency}>
                                        {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                                    </select>
                                </Field>
                                <Field label="Base price"><input className={inputClass} min="0" onChange={(event) => update('base_price', event.target.value)} required type="number" value={form.base_price} /></Field>
                            </div>
                        )}

                        {step === 6 && (
                            <div className="space-y-3">
                                {days.map(([value, label]) => {
                                    const slot = form.availability.find((item) => Number(item.day_of_week) === Number(value));
                                    return (
                                        <div className="grid gap-3 rounded-2xl border border-slate-100 p-3 sm:grid-cols-[1fr_150px_150px]" key={value}>
                                            <label className="flex items-center gap-3 text-sm font-black text-slate-800">
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
                                <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                                    <h2 className="font-black text-slate-950">BeautyPro HQ provider terms</h2>
                                    <p className="mt-3">You agree to provide accurate listing information, honour confirmed appointments, communicate professionally with customers, and keep your pricing, availability, and contact details current.</p>
                                    <p className="mt-3">You are responsible for your services, customer communication, external links, payment accounts, and compliance with applicable laws in your location.</p>
                                </div>
                                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-bold text-slate-700">
                                    <input checked={form.terms_accepted} className="mt-1 size-4 accent-fuchsia-700" onChange={(event) => update('terms_accepted', event.target.checked)} required type="checkbox" />
                                    I have read and accept the BeautyPro HQ terms and conditions.
                                </label>
                            </div>
                        )}

                        <div className="mt-8 flex justify-between gap-3 border-t border-slate-100 pt-5">
                            <Button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button" variant="secondary">Back</Button>
                            {step < sections.length - 1
                                ? <Button onClick={() => setStep((current) => Math.min(sections.length - 1, current + 1))} type="button">Continue</Button>
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
