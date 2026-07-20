import { useEffect, useState } from 'react';
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

export default function ProviderProfilePage() {
    const resource = useApiResource('/provider/profile', {});
    const categoriesResource = useApiResource('/provider-categories', []);
    const profile = resource.data ?? {};
    const [form, setForm] = useState({
        name: '',
        provider_category_id: '',
        profession: '',
        bio: '',
        location: '',
        profile_photo: '',
        instagram: '',
        website: '',
        profile_cta_label: 'Digital product',
        profile_cta_url: '',
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

    useEffect(() => {
        if (!resource.data || !Object.keys(resource.data).length) return;
        const current = resource.data;
        setForm({
            name: current.user?.name ?? current.name ?? '',
            provider_category_id: current.provider_category_id ?? current.category?.id ?? '',
            profession: current.profession ?? '',
            bio: current.bio ?? '',
            location: current.location ?? '',
            profile_photo: current.profile_photo ?? '',
            instagram: current.social_links?.instagram ?? '',
            website: current.social_links?.website ?? '',
            profile_cta_label: current.profile_cta_label ?? 'Digital product',
            profile_cta_url: current.profile_cta_url ?? '',
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
    const profileStrength = Math.min(100, [form.name, form.profession, form.bio, form.location, form.profile_photo].filter(Boolean).length * 20);

    const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

    const saveProfile = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const updated = await apiRequest('put', '/provider/profile', {
                name: form.name,
                provider_category_id: form.provider_category_id || null,
                profession: form.profession,
                bio: form.bio,
                location: form.location,
                profile_photo: form.profile_photo || null,
                social_links: { instagram: form.instagram || null, website: form.website || null },
                profile_cta_label: form.profile_cta_label || 'Digital product',
                profile_cta_url: form.profile_cta_url || null,
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

    const removePortfolioLink = (index) => {
        setForm((current) => ({ ...current, portfolio_links: current.portfolio_links.filter((_, itemIndex) => itemIndex !== index) }));
    };

    const addVerificationLink = (key, value, reset) => {
        if (!value.trim()) return;
        setForm((current) => ({ ...current, [key]: [...current[key], value.trim()] }));
        reset('');
    };

    const removeVerificationLink = (key, index) => {
        setForm((current) => ({ ...current, [key]: current[key].filter((_, itemIndex) => itemIndex !== index) }));
    };

    const submitVerification = async () => {
        setSaving(true);
        try {
            const result = await apiRequest('post', '/provider/verification', {
                portfolio_links: form.portfolio_links,
                social_links: { instagram: form.instagram || null, website: form.website || null },
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

    if (resource.loading) return <LoadingBlock rows={7} />;

    return (
        <div className="space-y-6">
            <PageHeader
                description="Manage the business information customers see on your public profile."
                eyebrow="Your listing"
                title="Profile"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid gap-5 xl:grid-cols-[1.5fr_0.8fr]">
                <Card>
                    <CardHeader description="Visible on your public provider profile." title="Business details" />
                    <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveProfile}>
                        <Field label="Display name">
                            <input className={inputClass} onChange={change('name')} required value={form.name} />
                        </Field>
                        <Field label="Provider category">
                            <select className={inputClass} onChange={change('provider_category_id')} required value={form.provider_category_id}>
                                <option value="">Select category</option>
                                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Profession">
                            <input className={inputClass} onChange={change('profession')} placeholder="Hair stylist, nail artist..." required value={form.profession} />
                        </Field>
                        <Field className="sm:col-span-2" label="About">
                            <textarea className={`${inputClass} min-h-28 resize-y`} maxLength={1000} onChange={change('bio')} value={form.bio} />
                        </Field>
                        <Field label="Location">
                            <input className={inputClass} onChange={change('location')} placeholder="Lekki, Lagos" required value={form.location} />
                        </Field>
                        <Field label="Profile photo URL">
                            <input className={inputClass} onChange={change('profile_photo')} placeholder="https://..." type="url" value={form.profile_photo} />
                        </Field>
                        <Field label="Instagram">
                            <input className={inputClass} onChange={change('instagram')} placeholder="https://instagram.com/..." type="url" value={form.instagram} />
                        </Field>
                        <Field label="Website">
                            <input className={inputClass} onChange={change('website')} placeholder="https://..." type="url" value={form.website} />
                        </Field>
                        <Field label="Profile button text" hint="Default is Digital product.">
                            <input className={inputClass} onChange={change('profile_cta_label')} placeholder="Digital product" value={form.profile_cta_label} />
                        </Field>
                        <Field label="Profile button link" hint="Shopify, digital product, external website, or product page.">
                            <input className={inputClass} onChange={change('profile_cta_url')} placeholder="https://your-shop.com/product" type="url" value={form.profile_cta_url} />
                        </Field>
                        <div className="sm:col-span-2">
                            <Button busy={saving} type="submit">Save profile</Button>
                        </div>
                    </form>
                </Card>

                <div className="space-y-5">
                    <Card>
                        <div className="flex items-center gap-4">
                            <Avatar name={form.name} size="lg" src={form.profile_photo} />
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="truncate font-bold text-slate-950">{form.name || 'Your name'}</h2>
                                    {verified && <StatusBadge status="approved" />}
                                </div>
                                <p className="text-sm text-slate-500">{form.profession || 'Your profession'}</p>
                                <p className="mt-1 text-xs text-slate-400">{form.location || 'Location not set'}</p>
                            </div>
                        </div>
                        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Profile strength</p>
                                <p className="text-xs font-black text-slate-700">{profileStrength}%</p>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-400" style={{ width: `${profileStrength}%` }} />
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader title="Verification" />
                        {verified ? (
                            <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
                                <p className="font-bold">Your profile is verified</p>
                                <p className="mt-1 text-emerald-600">Your BPHQ verified badge is displayed across the platform.</p>
                            </div>
                        ) : (verification?.request?.status ?? verification?.status) === 'pending' ? (
                            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
                                <p className="font-bold">Review in progress</p>
                                <p className="mt-1">The admin team will notify you after review.</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm leading-6 text-slate-500">Submit your work, social presence, professional background, certifications, and licenses for admin review.</p>
                                <div className="mt-4 space-y-2 text-xs font-bold text-slate-500">
                                    <p>Portfolio links: {form.portfolio_links.length}</p>
                                    <p>Social links: {[form.instagram, form.website].filter(Boolean).length}</p>
                                    <p>Certifications: {form.certification_files.length}</p>
                                    <p>Licenses: {form.license_files.length}</p>
                                </div>
                                <Button busy={saving} className="mt-4 w-full" disabled={!form.portfolio_links.length || !form.professional_info.trim()} onClick={submitVerification} type="button" variant="soft">Submit for verification</Button>
                            </>
                        )}
                    </Card>
                </div>
            </div>

            {!verified && (verification?.request?.status ?? verification?.status) !== 'pending' && (
                <Card>
                    <CardHeader description="This is what admin reviews before awarding the BPHQ verified badge." title="Verification submission" />
                    <div className="grid gap-5 lg:grid-cols-2">
                        <Field className="lg:col-span-2" label="Professional information" hint="Include experience, training, specialties, licenses held, and any business registration detail.">
                            <textarea className={`${inputClass} min-h-36 resize-y`} onChange={change('professional_info')} value={form.professional_info} />
                        </Field>

                        <div className="rounded-2xl border border-slate-100 p-4">
                            <p className="font-bold text-slate-950">Certification links/files</p>
                            <div className="mt-3 flex gap-2">
                                <input className={inputClass} onChange={(event) => setCertificationUrl(event.target.value)} placeholder="https://certificate-link..." type="url" value={certificationUrl} />
                                <Button onClick={() => addVerificationLink('certification_files', certificationUrl, setCertificationUrl)} type="button" variant="secondary">Add</Button>
                            </div>
                            <LinkList items={form.certification_files} onRemove={(index) => removeVerificationLink('certification_files', index)} />
                        </div>

                        <div className="rounded-2xl border border-slate-100 p-4">
                            <p className="font-bold text-slate-950">License links/files</p>
                            <div className="mt-3 flex gap-2">
                                <input className={inputClass} onChange={(event) => setLicenseUrl(event.target.value)} placeholder="https://license-link..." type="url" value={licenseUrl} />
                                <Button onClick={() => addVerificationLink('license_files', licenseUrl, setLicenseUrl)} type="button" variant="secondary">Add</Button>
                            </div>
                            <LinkList items={form.license_files} onRemove={(index) => removeVerificationLink('license_files', index)} />
                        </div>
                    </div>
                </Card>
            )}

            <Card>
                <CardHeader description="Add links to your best work. These can also support verification." title="Portfolio" />
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input className={inputClass} onChange={(event) => setPortfolioUrl(event.target.value)} placeholder="https://instagram.com/p/... or image URL" type="url" value={portfolioUrl} />
                    <Button onClick={addPortfolioLink} type="button" variant="secondary">Add link</Button>
                </div>
                {form.portfolio_links.length ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {form.portfolio_links.map((url, index) => (
                            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3" key={`${url}-${index}`}>
                                <a className="min-w-0 flex-1 truncate text-sm font-semibold text-fuchsia-700" href={url} rel="noreferrer" target="_blank">{url}</a>
                                <button className="text-xs font-bold text-rose-600" onClick={() => removePortfolioLink(index)} type="button">Remove</button>
                            </div>
                        ))}
                    </div>
                ) : <p className="mt-5 text-sm text-slate-400">No portfolio links added yet.</p>}
                <Button busy={saving} className="mt-4" onClick={saveProfile} type="button">Save portfolio</Button>
            </Card>
        </div>
    );
}
