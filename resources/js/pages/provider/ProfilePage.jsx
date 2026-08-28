import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Avatar,
    Button,
    Card,
    CardHeader,
    ErrorState,
    Field,
    FileUploadCard,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';
import { hasPaidSubscription, mediaUrl } from '../../lib/utils';

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
const maxOriginalImageBytes = 12 * 1024 * 1024;
const maxOptimizedImageDimension = 1600;
const optimizedImageQuality = 0.78;
const blankImageUploads = () => ({ profile_photo: [], cover_image: [] });

function assertImageSize(file) {
    if (file?.type?.startsWith('image/') && file.size > maxOriginalImageBytes) {
        throw new Error(`${file.name} is too large. Upload images up to 12 MB; they will be optimized automatically.`);
    }
}

function imageMimeType(file) {
    if (file.type === 'image/png') return 'image/jpeg';
    if (file.type === 'image/webp') return 'image/webp';
    return 'image/jpeg';
}

async function optimizeImageFile(file) {
    if (!(file instanceof File) || !file.type.startsWith('image/')) return file;
    assertImageSize(file);
    if (!window.createImageBitmap) return file;

    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxOptimizedImageDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const mimeType = imageMimeType(file);
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error(`Could not optimize ${file.name}.`)), mimeType, optimizedImageQuality);
    });

    if (blob.size >= file.size && file.size <= 5 * 1024 * 1024) return file;

    const extension = mimeType === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}-optimized.${extension}`, {
        type: mimeType,
        lastModified: Date.now(),
    });
}

function LinkList({ items = [], onRemove }) {
    if (!items.length) return <p className="mt-3 text-sm text-slate-400">No files added yet.</p>;
    const isImage = (url) => /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(url);

    return (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {items.map((url, index) => {
                const href = mediaUrl(url);
                return (
                    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3" key={`${url}-${index}`}>
                        {isImage(url) ? (
                            <img src={href} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                        ) : (
                            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-slate-200 text-xs font-bold text-slate-500">FILE</span>
                        )}
                        <div className="min-w-0 flex-1">
                            <a className="block truncate text-sm font-semibold text-fuchsia-700" href={href} rel="noreferrer" target="_blank">{url.split('/').pop()}</a>
                            <button className="mt-1 text-xs font-bold text-rose-600" onClick={() => onRemove(index)} type="button">Remove</button>
                        </div>
                    </div>
                );
            })}
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
        portfolio_items: [],
        certification_files: [],
        license_files: [],
        professional_info: '',
    });
    const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
    const [uploadingImages, setUploadingImages] = useState({});
    const [imageUploadFiles, setImageUploadFiles] = useState(() => blankImageUploads());
    const [removingPortfolioId, setRemovingPortfolioId] = useState(null);
    const [uploadingVerificationType, setUploadingVerificationType] = useState(null);
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
            portfolio_links: current.portfolio_links ?? [],
            portfolio_items: current.portfolio_items ?? current.portfolioItems ?? [],
            certification_files: [],
            license_files: [],
            professional_info: [current.profession, current.location, current.bio].filter(Boolean).join('\n\n'),
        });
    }, [resource.data]);

    useEffect(() => {
        apiRequest('get', '/provider/verification').then((data) => {
            setVerification(data);
            if (data?.request?.certification_files?.length || data?.request?.license_files?.length) {
                setForm((current) => ({
                    ...current,
                    certification_files: data.request.certification_files ?? [],
                    license_files: data.request.license_files ?? [],
                }));
            }
        }).catch(() => {});
    }, []);

    const verified = Boolean(profile.verified);
    const categories = Array.isArray(categoriesResource.data) ? categoriesResource.data : categoriesResource.data?.data ?? [];
    const activeSubscription = profile.user?.active_subscription ?? profile.user?.activeSubscription;
    const hasPaidPlan = hasPaidSubscription(activeSubscription);
    const canEditCoverImage = hasPaidPlan;
    const profilePhotoSrc = form.profile_photo instanceof File ? null : mediaUrl(form.profile_photo);
    const coverImageSrc = form.cover_image instanceof File ? null : mediaUrl(form.cover_image);
    const isUploadingProfileImage = Object.values(uploadingImages).some(Boolean);
    const portfolioItems = [...(form.portfolio_items ?? [])].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    const sections = useMemo(() => [
        ['General', 'Business details'],
        ['Images', 'Profile and cover'],
        ['Contact', 'Email, phone, website'],
        ['Socials', 'Social networks'],
        ['Location', 'Country and city'],
        ['Pricing', 'Base price and currency'],
        ['Work hours', 'Availability'],
        ['Portfolio', 'Best work images'],
        ['Verification', 'Review material'],
    ], [hasPaidPlan]);
    const currentSection = sections[step]?.[0] ?? 'General';
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
    const updateImageUploadFile = (key, id, patch) => {
        setImageUploadFiles((current) => ({
            ...current,
            [key]: (current[key] ?? []).map((item) => item.id === id ? { ...item, ...patch } : item),
        }));
    };

    const uploadProfileImage = async (key, files, collection) => {
        const file = Array.from(files ?? [])[0];
        if (!file) return;

        const entry = {
            id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            progress: 0,
            size: file.size,
            status: 'uploading',
            type: file.type,
        };

        update(key, '');
        setImageUploadFiles((current) => ({ ...current, [key]: [entry] }));
        setUploadingImages((current) => ({ ...current, [key]: true }));

        try {
            assertImageSize(file);
            const optimized = await optimizeImageFile(file);
            const payload = new FormData();
            payload.append('file', optimized);
            payload.append('collection', collection);

            const stored = await apiRequest('post', '/upload', payload, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (event) => {
                    if (!event.total) return;
                    updateImageUploadFile(key, entry.id, { progress: Math.round((event.loaded / event.total) * 100) });
                },
                timeout: 120000,
            });

            updateImageUploadFile(key, entry.id, {
                name: stored.original_name ?? file.name,
                path: stored.path,
                progress: 100,
                size: stored.size ?? file.size,
                status: 'completed',
                type: stored.mime_type ?? file.type,
            });
            update(key, stored.path);
            notify(`${file.name} uploaded to media.`);
        } catch (error) {
            updateImageUploadFile(key, entry.id, {
                error: error.code === 'ECONNABORTED' ? 'Timed out' : apiErrorMessage(error),
                status: 'error',
            });
            notify(error.code === 'ECONNABORTED'
                ? 'The upload is taking too long. Try again with a smaller image or a stronger connection.'
                : apiErrorMessage(error), 'error');
        } finally {
            setUploadingImages((current) => ({ ...current, [key]: false }));
        }
    };

    const removeProfileImageUpload = (key, id) => {
        setImageUploadFiles((current) => ({ ...current, [key]: (current[key] ?? []).filter((item) => item.id !== id) }));
        update(key, '');
    };
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

    useEffect(() => {
        if (step >= sections.length) {
            setStep(Math.max(0, sections.length - 1));
        }
    }, [sections.length, step]);

    const saveProfile = async (event) => {
        event.preventDefault();
        if (isUploadingProfileImage) {
            notify('Wait for image uploads to finish before saving.', 'error');
            return;
        }
        setSaving(true);
        try {
            const socialLinks = rowsToSocialObject(form.social_links);
            if (form.website) socialLinks.website = form.website;

            const payload = {
                name: form.name,
                provider_category_id: form.provider_category_id || null,
                profession: form.profession,
                bio: form.bio,
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
            };
            const hasImageUpload = form.profile_photo instanceof File || form.cover_image instanceof File;
            const requestPayload = hasImageUpload ? new FormData() : payload;
            if (hasImageUpload) {
                requestPayload.append('_method', 'PUT');
                Object.entries(payload).forEach(([key, value]) => {
                    requestPayload.append(key, Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : (value ?? ''));
                });
                if (form.profile_photo instanceof File) requestPayload.append('profile_photo', await optimizeImageFile(form.profile_photo));
                if (form.cover_image instanceof File) requestPayload.append('cover_image', await optimizeImageFile(form.cover_image));
            }

            const updated = hasImageUpload
                ? await apiRequest('post', '/provider/profile', requestPayload, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })
                : await apiRequest('put', '/provider/profile', payload);
            resource.setData((current) => ({ ...current, ...(updated ?? {}) }));
            notify('Profile changes saved.');
        } catch (error) {
            notify(error.code === 'ECONNABORTED'
                ? 'The upload is taking too long. Try again with fewer images or a stronger connection.'
                : apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const uploadPortfolioImage = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (form.portfolio_items.length >= 6) {
            notify('You can add up to 6 portfolio images.', 'error');
            return;
        }
        setUploadingPortfolio(true);
        try {
            const optimized = await optimizeImageFile(file);
            const payload = new FormData();
            payload.append('image', optimized);
            const item = await apiRequest('post', '/provider/profile/portfolio', payload, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
            setForm((current) => ({ ...current, portfolio_items: [...current.portfolio_items, item].slice(0, 6) }));
            resource.setData((current) => ({ ...current, portfolio_items: [...(current?.portfolio_items ?? current?.portfolioItems ?? []), item].slice(0, 6) }));
            notify('Portfolio image uploaded.');
        } catch (error) {
            notify(error.code === 'ECONNABORTED'
                ? 'The upload is taking too long. Try again with a smaller image or a stronger connection.'
                : apiErrorMessage(error), 'error');
        } finally {
            setUploadingPortfolio(false);
        }
    };
    const removePortfolioImage = async (item) => {
        setRemovingPortfolioId(item.id);
        try {
            const updated = await apiRequest('delete', `/provider/profile/portfolio/${item.id}`);
            const items = updated?.portfolio_items ?? updated?.portfolioItems ?? [];
            setForm((current) => ({ ...current, portfolio_items: items }));
            resource.setData((current) => ({ ...current, portfolio_items: items }));
            notify('Portfolio image removed.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setRemovingPortfolioId(null);
        }
    };
    const removeVerificationLink = (key, index) => setForm((current) => ({ ...current, [key]: current[key].filter((_, itemIndex) => itemIndex !== index) }));

    const publicProfileUrl = profile.slug ? `${window.location.origin}/providers/${profile.slug}` : '';
    const shareProfile = async () => {
        if (!publicProfileUrl) {
            notify('Save your profile first to generate a public profile link.', 'error');
            return;
        }
        try {
            if (navigator.share) {
                await navigator.share({ title: form.name || 'My BeautyPro HQ profile', url: publicProfileUrl });
            } else {
                if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
                await navigator.clipboard.writeText(publicProfileUrl);
                notify('Public profile link copied.');
            }
        } catch (error) {
            if (error?.name !== 'AbortError') notify('Profile link could not be shared.', 'error');
        }
    };
    const uploadVerificationFile = async (type, event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setUploadingVerificationType(type);
        try {
            const optimized = await optimizeImageFile(file);
            const payload = new FormData();
            payload.append('type', type);
            payload.append('file', optimized);
            const stored = await apiRequest('post', '/provider/verification/files', payload, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
            const key = type === 'certification' ? 'certification_files' : 'license_files';
            setForm((current) => ({ ...current, [key]: [...current[key], stored.path].slice(0, 10) }));
            notify('Verification file uploaded.');
        } catch (error) {
            notify(error.code === 'ECONNABORTED'
                ? 'The upload is taking too long. Try again with a smaller file or a stronger connection.'
                : apiErrorMessage(error), 'error');
        } finally {
            setUploadingVerificationType(null);
        }
    };

    const submitVerification = async () => {
        setSaving(true);
        try {
            const result = await apiRequest('post', '/provider/verification', {
                portfolio_links: form.portfolio_items.map((item) => mediaUrl(item.media_url ?? item.image_url ?? item.image)).filter(Boolean).map((url) => url.startsWith('/') ? `${window.location.origin}${url}` : url),
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
            <PageHeader
                actions={<div className="flex flex-wrap gap-2"><Button disabled={!publicProfileUrl} onClick={() => window.open(publicProfileUrl, '_blank', 'noopener,noreferrer')} type="button" variant="secondary">View profile</Button><Button disabled={!publicProfileUrl} onClick={shareProfile} type="button" variant="secondary">Share profile</Button></div>}
                description="Edit the same information you answered during provider setup."
                eyebrow="Your listing"
                title="Profile"
            />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid min-w-0 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px] xl:gap-5">
                <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
                    <div className="mb-2 flex items-center justify-between px-1 xl:hidden">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Swipe steps</p>
                        <p className="text-[11px] font-bold text-slate-400">{step + 1}/{sections.length}</p>
                    </div>
                    <Card ref={stepRailRef} className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto p-2 xl:mx-0 xl:block xl:space-y-1 xl:p-3">
                        {sections.map(([title, subtitle], index) => (
                            <button ref={(element) => { stepButtonRefs.current[index] = element; }} className={`flex min-w-[132px] shrink-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition xl:w-full xl:min-w-0 xl:gap-3 xl:py-3 ${step === index ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`} key={title} onClick={() => setStep(index)} type="button">
                                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${step === index ? 'bg-white text-slate-950' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</span>
                                <span className="min-w-0"><span className="block truncate text-xs font-semibold xl:text-sm">{title}</span><span className="hidden text-xs opacity-70 xl:block">{subtitle}</span></span>
                            </button>
                        ))}
                    </Card>
                    <div className="pointer-events-none -mt-9 flex justify-end pr-2 xl:hidden">
                        <span className="rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-slate-400 shadow-sm">›</span>
                    </div>
                </aside>

                <Card className="min-w-0 p-4 sm:p-6">
                    {currentSection === 'General' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Business name"><input className={inputClass} onChange={change('name')} required value={form.name} /></Field>
                            <Field label="Category"><select className={inputClass} onChange={change('provider_category_id')} required value={form.provider_category_id}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
                            <Field label="Professional title"><input className={inputClass} onChange={change('profession')} placeholder="Bridal Makeup Artist" required value={form.profession} /></Field>
                            <Field className="sm:col-span-2" label="Description"><textarea className={`${inputClass} min-h-40 resize-y`} minLength={20} onChange={change('bio')} required value={form.bio} /></Field>
                        </div>
                    )}

                    {currentSection === 'Images' && (
                        <div className="grid gap-5 sm:grid-cols-2">
                            <div>
                                {profilePhotoSrc && <img alt="" className="mb-3 h-28 w-28 rounded-2xl object-cover ring-1 ring-slate-200" src={profilePhotoSrc} />}
                                <FileUploadCard
                                    accept="image/*"
                                    browseLabel="Browse image"
                                    description="This uploads to media as soon as you choose it."
                                    disabled={uploadingImages.profile_photo}
                                    files={imageUploadFiles.profile_photo}
                                    helper="JPG, PNG or WEBP up to 12 MB. Images are optimized automatically."
                                    onFileRemove={(id) => removeProfileImageUpload('profile_photo', id)}
                                    onFilesSelected={(files) => uploadProfileImage('profile_photo', files, 'provider_profile_photo')}
                                    title="Profile image"
                                />
                            </div>
                            <div>
                                {coverImageSrc && <img alt="" className="mb-3 h-28 w-full rounded-2xl object-cover ring-1 ring-slate-200" src={coverImageSrc} />}
                                {!canEditCoverImage && <p className="mt-2 text-xs font-semibold text-slate-400">Cover image editing is available on the Pro plan.</p>}
                                <FileUploadCard
                                    accept="image/*"
                                    browseLabel="Browse image"
                                    description="This uploads to media immediately and is reused when saving."
                                    disabled={!canEditCoverImage || uploadingImages.cover_image}
                                    files={imageUploadFiles.cover_image}
                                    helper="JPG, PNG or WEBP up to 12 MB. Large images are resized and compressed."
                                    onFileRemove={(id) => removeProfileImageUpload('cover_image', id)}
                                    onFilesSelected={(files) => uploadProfileImage('cover_image', files, 'provider_profile_cover')}
                                    title="Cover image"
                                />
                            </div>
                        </div>
                    )}

                    {currentSection === 'Contact' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Email"><input className={inputClass} onChange={change('contact_email')} required type="email" value={form.contact_email} /></Field>
                            <Field label="Phone number"><input className={inputClass} onChange={change('contact_phone')} required value={form.contact_phone} /></Field>
                            <Field className="sm:col-span-2" label="Website (optional)"><input className={inputClass} onChange={change('website')} placeholder="https://..." type="url" value={form.website} /></Field>
                        </div>
                    )}

                    {currentSection === 'Socials' && (
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

                    {currentSection === 'Location' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field className="sm:col-span-2" label="Location"><input className={inputClass} onChange={change('location')} placeholder="123 Main Street, Lekki" required value={form.location} /></Field>
                            <Field label="Country"><input className={inputClass} onChange={change('country')} required value={form.country} /></Field>
                            <Field label="City"><input className={inputClass} onChange={change('city')} required value={form.city} /></Field>
                        </div>
                    )}

                    {currentSection === 'Pricing' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Currency"><select className={inputClass} onChange={change('default_currency')} required value={form.default_currency}>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></Field>
                            <Field label="Base price"><input className={inputClass} min="0" onChange={change('base_price')} required type="number" value={form.base_price} /></Field>
                        </div>
                    )}

                    {currentSection === 'Work hours' && (
                        <div className="space-y-3">
                            {days.map(([value, label]) => {
                                const slot = form.availability.find((item) => Number(item.day_of_week) === Number(value));
                                return (
                                    <div className="grid min-w-0 gap-3 rounded-2xl border border-slate-100 p-3 sm:grid-cols-[1fr_150px_150px]" key={value}>
                                        <label className="flex items-center gap-3 text-sm font-semibold text-slate-800"><input checked={Boolean(slot)} className="size-4 accent-fuchsia-700" onChange={() => toggleDay(value)} type="checkbox" />{label}</label>
                                        <input className={inputClass} disabled={!slot} onChange={(event) => updateSlot(value, { start_time: event.target.value })} type="time" value={slot?.start_time ?? '09:00'} />
                                        <input className={inputClass} disabled={!slot} onChange={(event) => updateSlot(value, { end_time: event.target.value })} type="time" value={slot?.end_time ?? '18:00'} />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {currentSection === 'Portfolio' && (
                        <div className="space-y-5">
                            <CardHeader description="Upload up to 6 clear images of your work. Images up to 12 MB are optimized before they are saved." title="Portfolio" />
                            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-sm font-bold text-slate-900">{portfolioItems.length}/6 images added</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-400">Use real client work or portfolio-ready examples. Max original file: 12 MB.</p>
                                </div>
                                <label className={`relative inline-flex min-h-10 items-center justify-center overflow-hidden rounded-xl border border-bphq-chrome bg-white px-4 text-sm font-semibold text-bphq-espresso transition hover:bg-bphq-ivory ${uploadingPortfolio || portfolioItems.length >= 6 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                                    {uploadingPortfolio ? 'Uploading...' : 'Upload image'}
                                    <input accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" disabled={uploadingPortfolio || portfolioItems.length >= 6} onChange={uploadPortfolioImage} type="file" />
                                </label>
                            </div>
                            {portfolioItems.length ? (
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {portfolioItems.map((item, index) => {
                                        const image = mediaUrl(item.media_url ?? item.image_url ?? item.image ?? item.url);
                                        return (
                                            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" key={item.id ?? `${image}-${index}`}>
                                                <div className="aspect-[4/3] bg-slate-100">
                                                    {image ? <img alt={item.title ?? 'Portfolio image'} className="size-full object-cover" src={image} /> : null}
                                                </div>
                                                <div className="flex items-center justify-between gap-2 p-3">
                                                    <p className="min-w-0 truncate text-xs font-bold text-slate-700">{item.title ?? `Portfolio image ${index + 1}`}</p>
                                                    <button className="shrink-0 text-xs font-black text-rose-600 disabled:opacity-50" disabled={removingPortfolioId === item.id} onClick={() => removePortfolioImage(item)} type="button">{removingPortfolioId === item.id ? 'Removing...' : 'Remove'}</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm leading-6 text-slate-500">No portfolio images yet. Upload images here and they will appear on your public profile.</div>
                            )}
                        </div>
                    )}

                    {currentSection === 'Verification' && (
                        <div className="space-y-5">
                            <CardHeader description="This is what admin reviews before awarding the BPHQ verified badge." title="Verification submission" />
                            {verified ? <div className="rounded-2xl bg-[#ECFDF3] p-4 text-sm text-[#027A48] ring-1 ring-[#12B76A]/20"><p className="font-bold">Your profile is verified</p><p className="mt-1 text-[#039855]">Your BPHQ verified badge is displayed across the platform. Editing key profile fields will reset your verification status.</p></div> : null}
                            {(verification?.request?.status ?? verification?.status) === 'pending' ? <div className="rounded-2xl bg-[#FFFAEB] p-4 text-sm text-[#B54708] ring-1 ring-[#F79009]/24"><p className="font-bold">Review in progress</p><p className="mt-1">The admin team will notify you after review. Resubmitting will cancel the pending request.</p></div> : null}
                            <>
                                <Field label="Professional information" hint="Include experience, training, specialties, licenses held, and any business registration detail."><textarea className={`${inputClass} min-h-36 resize-y`} onChange={change('professional_info')} value={form.professional_info} /></Field>
                                <div className="grid gap-4 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-100 p-4">
                                        <p className="font-bold text-slate-950">Certification files</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">Upload PDF, image, Word, or DOCX files.</p>
                                        <label className={`mt-3 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-bphq-chrome bg-white px-4 text-sm font-semibold text-bphq-espresso transition hover:bg-bphq-ivory ${uploadingVerificationType === 'certification' ? 'opacity-50' : ''}`}>
                                            {uploadingVerificationType === 'certification' ? 'Uploading...' : 'Upload certification'}
                                            <input accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="sr-only" disabled={uploadingVerificationType === 'certification'} onChange={(event) => uploadVerificationFile('certification', event)} type="file" />
                                        </label>
                                        <LinkList items={form.certification_files} onRemove={(index) => removeVerificationLink('certification_files', index)} />
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 p-4">
                                        <p className="font-bold text-slate-950">License files</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">Upload PDF, image, Word, or DOCX files.</p>
                                        <label className={`mt-3 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-bphq-chrome bg-white px-4 text-sm font-semibold text-bphq-espresso transition hover:bg-bphq-ivory ${uploadingVerificationType === 'license' ? 'opacity-50' : ''}`}>
                                            {uploadingVerificationType === 'license' ? 'Uploading...' : 'Upload license'}
                                            <input accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="sr-only" disabled={uploadingVerificationType === 'license'} onChange={(event) => uploadVerificationFile('license', event)} type="file" />
                                        </label>
                                        <LinkList items={form.license_files} onRemove={(index) => removeVerificationLink('license_files', index)} />
                                    </div>
                                </div>
                                <Button busy={saving} disabled={!portfolioItems.length || !form.professional_info.trim()} onClick={submitVerification} type="button" variant="soft">Submit for verification</Button>
                            </>
                        </div>
                    )}

                    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
                        <Button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button" variant="secondary">Back</Button>
                        <div className="grid gap-2 sm:flex">
                            {step < sections.length - 1 && <Button onClick={() => setStep((current) => Math.min(sections.length - 1, current + 1))} type="button" variant="secondary">Continue</Button>}
                            <Button busy={saving} disabled={isUploadingProfileImage} type="submit">Save profile</Button>
                        </div>
                    </div>
                </Card>

                <aside className="hidden space-y-5 xl:sticky xl:top-24 xl:block xl:h-fit">
                    <Card>
                        <div className="flex items-center gap-4">
                            <Avatar name={form.name} size="lg" src={profilePhotoSrc} />
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-bold text-slate-950">{form.name || 'Your name'}</h2>{verified && <StatusBadge status="approved" />}</div>
                                <p className="text-sm text-slate-500">{form.profession || 'Your profession'}</p>
                                <p className="mt-1 text-xs text-slate-400">{form.city || form.location || 'Location not set'}</p>
                            </div>
                        </div>
                        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                            <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Profile strength</p><p className="text-xs font-semibold text-slate-700">{profileStrength}%</p></div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-400" style={{ width: `${profileStrength}%` }} /></div>
                        </div>
                    </Card>
                </aside>
            </div>
        </form>
    );
}
