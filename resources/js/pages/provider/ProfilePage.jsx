import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Avatar,
    Button,
    Card,
    CardHeader,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';

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

function LinkList({ items = [], onRemove }) {
    if (!items.length) return <p className="mt-3 text-sm text-slate-400">No links added yet.</p>;

    return (
        <div className="mt-3 space-y-2">
            {items.map((url, index) => (
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3" key={`${url}-${index}`}>
                    <a className="min-w-0 flex-1 truncate text-sm font-semibold text-fuchsia-700" href={url} rel="noreferrer" target="_blank">{url}</a>
                    <button className="text-xs font-bold text-rose-600" onClick={() => onRemove(index)} type="button">Remove</button>
                </div>
            ))}
        </div>
    );
}

const defaultAvailability = [
    { day_of_week: 1, start_time: '09:00', end_time: '18:00' },
    { day_of_week: 2, start_time: '09:00', end_time: '18:00' },
    { day_of_week: 3, start_time: '09:00', end_time: '18:00' },
    { day_of_week: 4, start_time: '09:00', end_time: '18:00' },
    { day_of_week: 5, start_time: '09:00', end_time: '18:00' },
];

function socialObjectToRows(value = {}) {
    const rows = Object.entries(value ?? {})
        .filter(([, url]) => Boolean(url))
        .map(([platform, url]) => ({ platform: platform[0]?.toUpperCase() + platform.slice(1), url }));

    return rows.length ? rows : [{ platform: 'Instagram', url: '' }];
}

function rowsToSocialObject(rows = []) {
    return Object.fromEntries(
        rows
            .filter((item) => item.url)
            .map((item) => [String(item.platform || 'website').toLowerCase(), item.url]),
    );
}

export default function ProviderProfilePage() {
    const resource = useApiResource('/provider/profile', {});
    const categoriesResource = useApiResource('/provider-categories', []);
    const profile = resource.data ?? {};
    const stepRailRef = useRef(null);
    const stepButtonRefs = useRef([]);
    const [step, setStep] = useState(0);
    const [form, setForm] = useState({
        name: '',
        provider_category_id: '',
        profession: '',
        bio: '',
        profile_photo: '',
        cover_image: '',
        contact_email: '',
        contact_phone: '',
        website: '',
        social_links: [{ platform: 'Instagram', url: '' }],
        location: '',
        country: '',
        city: '',
        default_currency: 'NGN',
        base_price: '',
        availability: defaultAvailability,
        portfolio_links: [],
        certification_files: [],
        license_files: [],
        professional_info: '',
    });
    const [portfolioUrl, setPortfolioUrl] = useState('');
    const [certificationUrl, setCertificationUrl] = useState('');
    const [licenseUrl, setLicenseUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [verification, setVerification] = useState(null);
    const { notify } = useDashboardToast();

    const sections = useMemo(() => [
        ['General', 'Business details'],
        ['Images', 'Profile and cover'],
        ['Contact', 'Email, phone, website'],
        ['Socials', 'Social networks'],
        ['Location', 'Country and city'],
        ['Pricing', 'Base price and currency'],
        ['Work hours', 'Availability'],
        ['Portfolio', 'Best work links'],
        ['Verification', 'Review material'],
    ], []);

    useEffect(() => {
        if (!resource.data || !Object.keys(resource.data).length) return;
        const current = resource.data;
        setForm({
            name: current.user?.name ?? current.name ?? '',
            provider_category_id: current.provider_category_id ?? current.category?.id ?? '',
            profession: current.profession ?? '',
            bio: current.bio ?? '',
            profile_photo: current.profile_photo ?? '',
            cover_image: current.cover_image ?? '',
            contact_email: current.contact_email ?? current.user?.email ?? '',
            contact_phone: current.contact_phone ?? current.user?.phone ?? '',
            website: current.website ?? current.social_links?.website ?? '',
            social_links: socialObjectToRows(current.social_links),
            location: current.location ?? '',
            country: current.country ?? '',
            city: current.city ?? '',
            default_currency: current.default_currency ?? 'NGN',
            base_price: current.base_price ?? '',
            availability: current.availability?.length ? current.availability.map((slot) => ({
                day_of_week: Number(slot.day_of_week),
                start_time: String(slot.start_time ?? '09:00').slice(0, 5),
                end_time: String(slot.end_time ?? '18:00').slice(0, 5),
            })) : defaultAvailability,
            portfolio_links: current.portfolio_links ?? current.portfolio_items?.map((item) => item.url ?? item.image_url).filter(Boolean) ?? [],
            certification_files: [],
            license_files: [],
            professional_info: [current.profession, current.location, current.bio].filter(Boolean).join('\n\n'),
        });
    }, [resource.data]);

    useEffect(() => {
        apiRequest('get', '/provider/verification').then(setVerification).catch(() => {});
    }, []);

    const verified = Boolean(profile.verified);
    const categories = Array.isArray(categoriesResource.data) ? categoriesResource.data : categoriesResource.data?.data ?? [];
    const profileStrength = Math.min(100, [
        form.name,
        form.provider_category_id,
        form.profession,
        form.bio,
        form.profile_photo,
        form.cover_image,
        form.contact_email,
        form.contact_phone,
        form.location,
        form.country,
        form.city,
        form.base_price,
        form.availability.length,
    ].filter(Boolean).length * 8);

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const change = (key) => (event) => update(key, event.target.value);
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

    useEffect(() => {
        stepButtonRefs.current[step]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [step]);

    const saveProfile = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const socialLinks = rowsToSocialObject(form.social_links);
            if (form.website) socialLinks.website = form.website;

            const updated = await apiRequest('put', '/provider/profile', {
                name: form.name,
                provider_category_id: form.provider_category_id || null,
                profession: form.profession,
                bio: form.bio,
                profile_photo: form.profile_photo || null,
                cover_image: form.cover_image || null,
                contact_email: form.contact_email || null,
                contact_phone: form.contact_phone || null,
                website: form.website || null,
                social_links: socialLinks,
                location: form.location,
                country: form.country || null,
                city: form.city || null,
                default_currency: form.default_currency,
                base_price: form.base_price || null,
                availability: form.availability,
                portfolio_links: form.portfolio_links,
            });
            resource.setData((current) => ({ ...current, ...(updated ?? {}) }));
            notify('Profile changes saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const addPortfolioLink = () => {
        if (!portfolioUrl.trim()) return;
        setForm((current) => ({ ...current, portfolio_links: [...current.portfolio_links, portfolioUrl.trim()] }));
        setPortfolioUrl('');
    };
    const removePortfolioLink = (index) => setForm((current) => ({ ...current, portfolio_links: current.portfolio_links.filter((_, itemIndex) => itemIndex !== index) }));
    const addVerificationLink = (key, value, reset) => {
        if (!value.trim()) return;
        setForm((current) => ({ ...current, [key]: [...current[key], value.trim()] }));
        reset('');
    };
    const removeVerificationLink = (key, index) => setForm((current) => ({ ...current, [key]: current[key].filter((_, itemIndex) => itemIndex !== index) }));

    const submitVerification = async () => {
        setSaving(true);
        try {
            const result = await apiRequest('post', '/provider/verification', {
                portfolio_links: form.portfolio_links,
                social_links: rowsToSocialObject(form.social_links),
                professional_info: form.professional_info || [form.profession, form.location, form.bio].filter(Boolean).join('\n\n'),
                certification_files: form.certification_files,
                license_files: form.license_files,
            });
            setVerification(result);
            notify('Verification request submitted.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    if (resource.loading || categoriesResource.loading) return <LoadingBlock rows={7} />;

    return (
        <form className="space-y-6" onSubmit={saveProfile}>
            <PageHeader description="Edit the same information you answered during provider setup." eyebrow="Your listing" title="Profile" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid min-w-0 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px] xl:gap-5">
                <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
                    <div className="mb-2 flex items-center justify-between px-1 xl:hidden">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Swipe steps</p>
                        <p className="text-[11px] font-bold text-slate-400">{step + 1}/{sections.length}</p>
                    </div>
                    <Card ref={stepRailRef} className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto p-2 xl:mx-0 xl:block xl:space-y-1 xl:p-3">
                        {sections.map(([title, subtitle], index) => (
                            <button ref={(element) => { stepButtonRefs.current[index] = element; }} className={`flex min-w-[132px] shrink-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition xl:w-full xl:min-w-0 xl:gap-3 xl:py-3 ${step === index ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`} key={title} onClick={() => setStep(index)} type="button">
                                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${step === index ? 'bg-white text-slate-950' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</span>
                                <span className="min-w-0"><span className="block truncate text-xs font-black xl:text-sm">{title}</span><span className="hidden text-xs opacity-70 xl:block">{subtitle}</span></span>
                            </button>
                        ))}
                    </Card>
                    <div className="pointer-events-none -mt-9 flex justify-end pr-2 xl:hidden">
                        <span className="rounded-full bg-white/90 px-2 py-1 text-xs font-black text-slate-400 shadow-sm">›</span>
                    </div>
                </aside>

                <Card className="min-w-0 p-4 sm:p-6">
                    {step === 0 && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Business name"><input className={inputClass} onChange={change('name')} required value={form.name} /></Field>
                            <Field label="Category"><select className={inputClass} onChange={change('provider_category_id')} required value={form.provider_category_id}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
                            <Field label="Professional title"><input className={inputClass} onChange={change('profession')} placeholder="Bridal Makeup Artist" required value={form.profession} /></Field>
                            <Field className="sm:col-span-2" label="Description"><textarea className={`${inputClass} min-h-40 resize-y`} minLength={20} onChange={change('bio')} required value={form.bio} /></Field>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="grid gap-5 sm:grid-cols-2">
                            <Field label="Profile image URL"><input className={inputClass} onChange={change('profile_photo')} placeholder="https://..." type="url" value={form.profile_photo} /></Field>
                            <Field label="Cover image URL"><input className={inputClass} onChange={change('cover_image')} placeholder="https://..." type="url" value={form.cover_image} /></Field>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Email"><input className={inputClass} onChange={change('contact_email')} required type="email" value={form.contact_email} /></Field>
                            <Field label="Phone number"><input className={inputClass} onChange={change('contact_phone')} required value={form.contact_phone} /></Field>
                            <Field className="sm:col-span-2" label="Website (optional)"><input className={inputClass} onChange={change('website')} placeholder="https://..." type="url" value={form.website} /></Field>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            {form.social_links.map((item, index) => (
                                <div className="grid min-w-0 gap-3 sm:grid-cols-[180px_1fr_auto]" key={index}>
                                    <select className={inputClass} onChange={(event) => updateSocial(index, { platform: event.target.value })} value={item.platform}>{socialOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                                    <input className={inputClass} onChange={(event) => updateSocial(index, { url: event.target.value })} placeholder="https://..." type="url" value={item.url} />
                                    <Button onClick={() => removeSocial(index)} type="button" variant="secondary">Remove</Button>
                                </div>
                            ))}
                            <Button onClick={addSocial} type="button" variant="soft">Add social link</Button>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field className="sm:col-span-2" label="Location"><input className={inputClass} onChange={change('location')} placeholder="123 Main Street, Lekki" required value={form.location} /></Field>
                            <Field label="Country"><input className={inputClass} onChange={change('country')} required value={form.country} /></Field>
                            <Field label="City"><input className={inputClass} onChange={change('city')} required value={form.city} /></Field>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Currency"><select className={inputClass} onChange={change('default_currency')} required value={form.default_currency}>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></Field>
                            <Field label="Base price"><input className={inputClass} min="0" onChange={change('base_price')} required type="number" value={form.base_price} /></Field>
                        </div>
                    )}

                    {step === 6 && (
                        <div className="space-y-3">
                            {days.map(([value, label]) => {
                                const slot = form.availability.find((item) => Number(item.day_of_week) === Number(value));
                                return (
                                    <div className="grid min-w-0 gap-3 rounded-2xl border border-slate-100 p-3 sm:grid-cols-[1fr_150px_150px]" key={value}>
                                        <label className="flex items-center gap-3 text-sm font-black text-slate-800"><input checked={Boolean(slot)} className="size-4 accent-fuchsia-700" onChange={() => toggleDay(value)} type="checkbox" />{label}</label>
                                        <input className={inputClass} disabled={!slot} onChange={(event) => updateSlot(value, { start_time: event.target.value })} type="time" value={slot?.start_time ?? '09:00'} />
                                        <input className={inputClass} disabled={!slot} onChange={(event) => updateSlot(value, { end_time: event.target.value })} type="time" value={slot?.end_time ?? '18:00'} />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {step === 7 && (
                        <div>
                            <CardHeader description="Add links to your best work. These can also support verification." title="Portfolio" />
                            <div className="flex min-w-0 flex-col gap-2 sm:flex-row"><input className={inputClass} onChange={(event) => setPortfolioUrl(event.target.value)} placeholder="https://instagram.com/p/... or image URL" type="url" value={portfolioUrl} /><Button onClick={addPortfolioLink} type="button" variant="secondary">Add link</Button></div>
                            <LinkList items={form.portfolio_links} onRemove={removePortfolioLink} />
                        </div>
                    )}

                    {step === 8 && (
                        <div className="space-y-5">
                            <CardHeader description="This is what admin reviews before awarding the BPHQ verified badge." title="Verification submission" />
                            {verified ? <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700"><p className="font-bold">Your profile is verified</p><p className="mt-1 text-emerald-600">Your BPHQ verified badge is displayed across the platform.</p></div> : (verification?.request?.status ?? verification?.status) === 'pending' ? <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700"><p className="font-bold">Review in progress</p><p className="mt-1">The admin team will notify you after review.</p></div> : <>
                                <Field label="Professional information" hint="Include experience, training, specialties, licenses held, and any business registration detail."><textarea className={`${inputClass} min-h-36 resize-y`} onChange={change('professional_info')} value={form.professional_info} /></Field>
                                <div className="grid gap-4 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-100 p-4"><p className="font-bold text-slate-950">Certification links/files</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className={inputClass} onChange={(event) => setCertificationUrl(event.target.value)} placeholder="https://certificate-link..." type="url" value={certificationUrl} /><Button onClick={() => addVerificationLink('certification_files', certificationUrl, setCertificationUrl)} type="button" variant="secondary">Add</Button></div><LinkList items={form.certification_files} onRemove={(index) => removeVerificationLink('certification_files', index)} /></div>
                                    <div className="rounded-2xl border border-slate-100 p-4"><p className="font-bold text-slate-950">License links/files</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className={inputClass} onChange={(event) => setLicenseUrl(event.target.value)} placeholder="https://license-link..." type="url" value={licenseUrl} /><Button onClick={() => addVerificationLink('license_files', licenseUrl, setLicenseUrl)} type="button" variant="secondary">Add</Button></div><LinkList items={form.license_files} onRemove={(index) => removeVerificationLink('license_files', index)} /></div>
                                </div>
                                <Button busy={saving} disabled={!form.portfolio_links.length || !form.professional_info.trim()} onClick={submitVerification} type="button" variant="soft">Submit for verification</Button>
                            </>}
                        </div>
                    )}

                    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
                        <Button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button" variant="secondary">Back</Button>
                        <div className="grid gap-2 sm:flex">
                            {step < sections.length - 1 && <Button onClick={() => setStep((current) => Math.min(sections.length - 1, current + 1))} type="button" variant="secondary">Continue</Button>}
                            <Button busy={saving} type="submit">Save profile</Button>
                        </div>
                    </div>
                </Card>

                <aside className="hidden space-y-5 xl:sticky xl:top-24 xl:block xl:h-fit">
                    <Card>
                        <div className="flex items-center gap-4">
                            <Avatar name={form.name} size="lg" src={form.profile_photo} />
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-bold text-slate-950">{form.name || 'Your name'}</h2>{verified && <StatusBadge status="approved" />}</div>
                                <p className="text-sm text-slate-500">{form.profession || 'Your profession'}</p>
                                <p className="mt-1 text-xs text-slate-400">{form.city || form.location || 'Location not set'}</p>
                            </div>
                        </div>
                        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                            <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Profile strength</p><p className="text-xs font-black text-slate-700">{profileStrength}%</p></div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-400" style={{ width: `${profileStrength}%` }} /></div>
                        </div>
                    </Card>
                </aside>
            </div>
        </form>
    );
}
