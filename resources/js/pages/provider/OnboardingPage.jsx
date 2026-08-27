import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DashboardToastProvider, Field, FileUploadCard, LoadingBlock, apiErrorMessage, dashboardApi, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';
import { useAuth } from '../../context/AuthContext';
import { defaultCountries } from 'react-international-phone';
import { browserCurrency } from '../../lib/browserCurrency';
import { hasPaidSubscription } from '../../lib/utils';

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
const maxOriginalImageBytes = 12 * 1024 * 1024;
const maxOptimizedImageDimension = 1600;
const optimizedImageQuality = 0.78;
const uploadFieldKeys = ['profile_photo', 'cover_image', 'portfolio_images', 'certification_documents', 'license_documents'];
const blankUploadFiles = () => Object.fromEntries(uploadFieldKeys.map((key) => [key, []]));
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
    const { user, refreshUser } = useAuth();
    const { notify } = useDashboardToast();
    const categoriesResource = useApiResource('/provider-categories', []);
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [uploadingFields, setUploadingFields] = useState({});
    const [uploadFiles, setUploadFiles] = useState(() => blankUploadFiles());
    const [submitted, setSubmitted] = useState(false);

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
        verification_years: '',
        verification_experience: '',
        verification_credentials: '',
        verification_license_details: '',
        certification_documents: [],
        license_documents: [],
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
                    certification_documents: [],
                    license_documents: [],
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
                const { profile_photo, cover_image, portfolio_images, certification_documents, license_documents, ...serializable } = form;
                sessionStorage.setItem('bphq_onboarding_draft', JSON.stringify(serializable));
            } catch {}
        }, 500);
        return () => clearTimeout(timer);
    }, [form]);

    const categories = Array.isArray(categoriesResource.data) ? categoriesResource.data : categoriesResource.data?.data ?? [];
    const bioWords = wordCount(form.bio);
    const activeSubscription = user?.active_subscription ?? user?.activeSubscription;
    const selectedPaidPlan = Boolean(user?.pending_paid_plan_selection)
        || hasPaidSubscription(activeSubscription);

    const sections = useMemo(() => [
        ['General', 'Business details'],
        ['Images', 'Profile and cover'],
        ['Contact', 'Email, phone, website'],
        ['Socials', 'Social networks'],
        ['Location', 'Country and city'],
        ['Pricing', 'Base price and currency'],
        ['Work hours', 'Availability'],
        ['Portfolio', 'Up to 6 images'],
        ...(selectedPaidPlan ? [['Verification', 'Paid plan review']] : []),
        ['Terms', 'Review and accept'],
    ], [selectedPaidPlan]);

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const updateUploadFile = (key, id, patch) => {
        setUploadFiles((current) => ({
            ...current,
            [key]: (current[key] ?? []).map((item) => item.id === id ? { ...item, ...patch } : item),
        }));
    };

    const uploadStoredFile = async (file, collection, onProgress) => {
        const optimized = await optimizeImageFile(file);
        const payload = new FormData();
        payload.append('file', optimized);
        payload.append('collection', collection);

        const response = await dashboardApi.post('/upload', payload, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (event) => {
                if (!event.total) return;
                onProgress?.(Math.round((event.loaded / event.total) * 100));
            },
            timeout: 120000,
        });

        return response?.data?.data ?? response?.data;
    };

    const uploadSelectedFiles = async (key, files, { limit = 1, multiple = false, collection = `provider_onboarding_${key}` } = {}) => {
        const currentFiles = uploadFiles[key] ?? [];
        const selected = Array.from(files ?? []);
        const openSlots = multiple ? Math.max(0, limit - currentFiles.length) : 1;
        const filesToUpload = selected.slice(0, openSlots);

        if (!filesToUpload.length) {
            if (selected.length && multiple) notify(`You can upload up to ${limit} files for this section.`, 'error');
            return;
        }

        if (!multiple) update(key, null);
        if (multiple && currentFiles.length + selected.length > limit) {
            notify(`Only ${openSlots} more ${openSlots === 1 ? 'file' : 'files'} can be added here.`, 'error');
        }

        const entries = filesToUpload.map((file, index) => ({
            id: `${key}-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            size: file.size,
            type: file.type,
            progress: 0,
            status: 'uploading',
        }));

        setUploadFiles((current) => ({
            ...current,
            [key]: multiple ? [...(current[key] ?? []), ...entries] : entries,
        }));
        setUploadingFields((current) => ({ ...current, [key]: true }));

        const results = await Promise.all(entries.map(async (entry, index) => {
            const file = filesToUpload[index];
            try {
                assertImageSize(file);
                const stored = await uploadStoredFile(file, collection, (progress) => updateUploadFile(key, entry.id, { progress }));
                updateUploadFile(key, entry.id, {
                    name: stored.original_name ?? file.name,
                    path: stored.path,
                    progress: 100,
                    size: stored.size ?? file.size,
                    status: 'completed',
                    type: stored.mime_type ?? file.type,
                });
                setForm((current) => ({
                    ...current,
                    [key]: multiple ? [...(current[key] ?? []), stored.path].slice(0, limit) : stored.path,
                }));
                return stored;
            } catch (error) {
                updateUploadFile(key, entry.id, {
                    error: error.code === 'ECONNABORTED' ? 'Timed out' : (error.message || apiErrorMessage(error)),
                    status: 'error',
                });
                return null;
            }
        }));

        const uploaded = results.filter(Boolean);
        if (uploaded.length) notify(`${uploaded.length} ${uploaded.length === 1 ? 'file' : 'files'} uploaded to media.`);
        if (uploaded.length < filesToUpload.length) {
            notify('Some files could not upload. Remove failed files and try again.', 'error');
        }
        setUploadingFields((current) => ({ ...current, [key]: false }));
    };

    const removeUploadedFile = (key, id, multiple = false) => {
        const nextFiles = (uploadFiles[key] ?? []).filter((item) => item.id !== id);
        setUploadFiles((current) => ({ ...current, [key]: nextFiles }));
        update(key, multiple ? nextFiles.filter((item) => item.status === 'completed' && item.path).map((item) => item.path) : null);
    };

    const isUploading = Object.values(uploadingFields).some(Boolean);
    const hasCompletedUpload = (key) => Boolean(form[key])
        && (uploadFiles[key]?.length ? uploadFiles[key].some((item) => item.status === 'completed' && item.path === form[key]) : true);
    const validateStepBeforeLeaving = (targetStep = step + 1) => {
        if (targetStep <= step) return true;
        if (isUploading) {
            notify('Please wait for the upload to finish before continuing.', 'error');
            return false;
        }
        if (step === 0 && bioWords < minimumBioWords) {
            notify(`About Me / Description must be well written and at least ${minimumBioWords} words.`, 'error');
            return false;
        }
        if (currentSection === 'Images' && (!hasCompletedUpload('profile_photo') || !hasCompletedUpload('cover_image'))) {
            notify('Upload both profile and cover images before continuing.', 'error');
            return false;
        }
        return true;
    };
    const goToStep = (targetStep) => {
        if (!validateStepBeforeLeaving(targetStep)) return;
        setStep(Math.max(0, Math.min(sections.length - 1, targetStep)));
    };
    const continueToNextStep = () => goToStep(step + 1);
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
        if (!form.profile_photo || !form.cover_image) {
            setStep(1);
            notify('Select a profile image and cover image before submitting.', 'error');
            return;
        }
        if (isUploading) {
            notify('Wait for uploads to finish before submitting.', 'error');
            return;
        }
        setSaving(true);
        try {
            const response = await dashboardApi.post('/provider/onboarding', {
                ...form,
                terms_accepted: form.terms_accepted ? '1' : '0',
                social_links: form.social_links.filter((item) => item.url),
            }, { timeout: 30000 });
            const data = response?.data?.data ?? {};
            sessionStorage.removeItem('bphq_onboarding_draft');
            notify(data.approval_required ? 'Details received. Admin approval is required before dashboard access.' : 'Listing details saved.');
            setSubmitted(true);
            await refreshUser?.();
            navigate(data.redirect_to ?? '/provider/onboarding', { replace: true });
        } catch (error) {
            notify(error.code === 'ECONNABORTED'
                ? 'The upload is taking too long. Try again with fewer images or a stronger connection.'
                : apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    if (categoriesResource.loading) return <LoadingBlock rows={6} />;

    const providerProfile = user?.provider_profile ?? user?.providerProfile;
    const onboardingComplete = Boolean(providerProfile?.onboarding_complete ?? providerProfile?.onboarding_completed_at);
    const providerApproved = Boolean(providerProfile?.account_approved ?? providerProfile?.account_approved_at);
    const currentSection = sections[step]?.[0] ?? 'General';
    const reviewCopy = selectedPaidPlan
        ? {
            eyebrow: 'Paid provider review',
            title: 'Your application is under review',
            description: 'We have received your listing details and verification documents. An admin will review them before your provider account is approved.',
            note: 'You will receive an email notification once your account is approved. After approval, sign in to your dashboard to complete payment and activate paid tools.',
        }
        : {
            eyebrow: 'Provider listing review',
            title: 'Your listing has been submitted',
            description: 'We have received your provider details. An admin will review your listing before your account is approved for dashboard access.',
            note: 'You will receive an email notification once your account is approved.',
        };
    if ((onboardingComplete && !providerApproved) || submitted) {
        return (
            <div className="min-h-screen bg-slate-50 px-4 py-8 lg:px-8">
                <div className="mx-auto max-w-3xl">
                    <Card className="p-8">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-700">{reviewCopy.eyebrow}</p>
                        <h1 className="mt-3 font-display text-4xl font-normal text-slate-950">{reviewCopy.title}</h1>
                        <p className="mt-3 text-sm leading-6 text-slate-500">
                            {reviewCopy.description}
                        </p>
                        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
                            {reviewCopy.note}
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

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
                                <button className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${step === index ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`} key={title} onClick={() => goToStep(index)} type="button">
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
                                <FileUploadCard
                                    accept="image/*"
                                    browseLabel="Browse image"
                                    description="This uploads to media as soon as you choose it."
                                    disabled={uploadingFields.profile_photo}
                                    files={uploadFiles.profile_photo}
                                    helper="JPG, PNG or WEBP up to 12 MB. Images are optimized automatically."
                                    onFileRemove={(id) => removeUploadedFile('profile_photo', id)}
                                    onFilesSelected={(files) => uploadSelectedFiles('profile_photo', files, { collection: 'provider_onboarding_profile', limit: 1 })}
                                    title="Profile image"
                                />
                                <FileUploadCard
                                    accept="image/*"
                                    browseLabel="Browse image"
                                    description="This uploads to media immediately and is reused on submit."
                                    disabled={uploadingFields.cover_image}
                                    files={uploadFiles.cover_image}
                                    helper="JPG, PNG or WEBP up to 12 MB. Large images are resized and compressed."
                                    onFileRemove={(id) => removeUploadedFile('cover_image', id)}
                                    onFilesSelected={(files) => uploadSelectedFiles('cover_image', files, { collection: 'provider_onboarding_cover', limit: 1 })}
                                    title="Cover image"
                                />
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
                                <FileUploadCard
                                    accept="image/*"
                                    browseLabel="Browse images"
                                    description="Add up to 6 gallery images. Each one is saved to media on upload."
                                    disabled={uploadingFields.portfolio_images || uploadFiles.portfolio_images.length >= 6}
                                    files={uploadFiles.portfolio_images}
                                    helper="JPG, PNG or WEBP up to 12 MB each. Images are optimized automatically."
                                    multiple
                                    onFileRemove={(id) => removeUploadedFile('portfolio_images', id, true)}
                                    onFilesSelected={(files) => uploadSelectedFiles('portfolio_images', files, { collection: 'provider_onboarding_portfolio', limit: 6, multiple: true })}
                                    title="Portfolio gallery images"
                                />
                            </div>
                        )}

                        {currentSection === 'Verification' && (
                            <div className="grid gap-4">
                                <Field label="Years of professional experience" required>
                                    <input
                                        className={inputClass}
                                        min="0"
                                        max="80"
                                        onChange={(event) => update('verification_years', event.target.value)}
                                        placeholder="5"
                                        required
                                        type="number"
                                        value={form.verification_years}
                                    />
                                </Field>
                                <Field
                                    hint="Include client types, specialist services, studio or mobile work, and the kind of paid beauty work you handle."
                                    label="Professional experience"
                                    required
                                >
                                    <textarea
                                        className={`${inputClass} min-h-32`}
                                        onChange={(event) => update('verification_experience', event.target.value)}
                                        placeholder="Example: I have worked with bridal, editorial, and private beauty clients for five years..."
                                        required
                                        value={form.verification_experience}
                                    />
                                </Field>
                                <Field
                                    hint="Optional. List training, certificates, awards, apprenticeships, brand courses, or other proof of skill if you have them."
                                    label="Training or credentials (optional)"
                                >
                                    <textarea
                                        className={`${inputClass} min-h-28`}
                                        onChange={(event) => update('verification_credentials', event.target.value)}
                                        placeholder="Example: Certified makeup artist, completed sanitation training, trained with..."
                                        value={form.verification_credentials}
                                    />
                                </Field>
                                <Field label="License or business registration details (optional)">
                                    <textarea
                                        className={`${inputClass} min-h-24`}
                                        onChange={(event) => update('verification_license_details', event.target.value)}
                                        placeholder="License number, registered business name, studio registration, or N/A if not applicable."
                                        value={form.verification_license_details}
                                    />
                                </Field>
                                <FileUploadCard
                                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                                    browseLabel="Browse files"
                                    description="Certificates and proof files are saved to media immediately."
                                    disabled={uploadingFields.certification_documents || uploadFiles.certification_documents.length >= 5}
                                    files={uploadFiles.certification_documents}
                                    helper="PDF, DOC, DOCX, JPG, PNG or WEBP up to 12 MB each."
                                    multiple
                                    onFileRemove={(id) => removeUploadedFile('certification_documents', id, true)}
                                    onFilesSelected={(files) => uploadSelectedFiles('certification_documents', files, { collection: 'provider_verification_certification', limit: 5, multiple: true })}
                                    title="Certification documents"
                                />
                                <FileUploadCard
                                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                                    browseLabel="Browse files"
                                    description="Licenses and business documents upload before final submit."
                                    disabled={uploadingFields.license_documents || uploadFiles.license_documents.length >= 5}
                                    files={uploadFiles.license_documents}
                                    helper="PDF, DOC, DOCX, JPG, PNG or WEBP up to 12 MB each."
                                    multiple
                                    onFileRemove={(id) => removeUploadedFile('license_documents', id, true)}
                                    onFilesSelected={(files) => uploadSelectedFiles('license_documents', files, { collection: 'provider_verification_license', limit: 5, multiple: true })}
                                    title="License or business documents"
                                />
                            </div>
                        )}

                        {currentSection === 'Terms' && (
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
                                ? <Button disabled={isUploading} onClick={continueToNextStep} type="button">{isUploading ? 'Uploading...' : 'Continue'}</Button>
                                : <Button busy={saving} disabled={isUploading} type="submit">Submit listing details</Button>}
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
