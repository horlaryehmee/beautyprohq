import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, Card, ErrorState, Field, LoadingBlock, Pagination, StatusBadge, apiErrorMessage, apiRequest, formatDate, inputClass, useDashboardToast, usePagination } from '../../components/dashboard';
import { dashboardApi, unwrap } from '../../components/dashboard/api';
import VerifiedBadge from '../../components/ui/VerifiedBadge';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl } from '../../lib/utils';

const socialKeys = ['instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'whatsapp', 'website'];
const currencies = ['NGN', 'USD', 'EUR', 'GBP'];
const days = [
    [1, 'Monday'],
    [2, 'Tuesday'],
    [3, 'Wednesday'],
    [4, 'Thursday'],
    [5, 'Friday'],
    [6, 'Saturday'],
    [0, 'Sunday'],
];

function verifiedState(user) {
    const profile = user?.provider_profile ?? user?.providerProfile;
    if (profile?.verified) return 'approved';
    return profile?.verification_requests?.[0]?.status ?? 'pending';
}

function verificationControlClass(status, active) {
    if (active && status === 'approved') return 'bg-[#027A48] text-white';
    if (active && status === 'pending') return 'bg-[#B54708] text-white';
    if (active && status === 'rejected') return 'bg-[#B42318] text-white';
    return 'bg-slate-100 text-slate-600 hover:bg-slate-200';
}

function latestVerification(user) {
    return (user?.provider_profile ?? user?.providerProfile)?.verification_requests?.[0] ?? null;
}

function usageValue(value) {
    return Number(value ?? 0).toLocaleString();
}

function money(value, currency = 'NGN') {
    return `${currency} ${Number(value ?? 0).toLocaleString()}`;
}

function mediaLabel(item) {
    if (String(item?.mime_type ?? '').startsWith('image/')) return 'Image';
    return String(item?.extension ?? 'File').toUpperCase();
}

function formatMediaSize(value) {
    const size = Number(value ?? 0);
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 ** 2)).toFixed(1)} MB`;
}

function ReviewField({ label, value }) {
    return (
        <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">{value || 'Not provided'}</p>
        </div>
    );
}

function ExternalLink({ children, href }) {
    if (!href) return null;
    return <a className="break-all text-sm font-semibold text-fuchsia-700 hover:underline" href={mediaUrl(href)} rel="noreferrer" target="_blank">{children || href}</a>;
}

function OnboardingChecklist({ form, profile, hasProviderControls }) {
    if (!hasProviderControls) return null;

    const checks = [
        ['General', Boolean(form.name && profile.provider_category_id && profile.profession && profile.bio)],
        ['Images', Boolean(profile.profile_photo && profile.cover_image)],
        ['Contact', Boolean(profile.contact_email && profile.contact_phone)],
        ['Socials', Object.values(profile.social_links ?? {}).some(Boolean)],
        ['Location', Boolean(profile.location && profile.country && profile.city)],
        ['Pricing', Boolean(profile.default_currency && profile.base_price)],
        ['Work hours', Boolean((profile.availability ?? []).length)],
    ];
    const complete = checks.filter(([, value]) => value).length;

    return (
        <Card>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-950">Onboarding alignment</h2>
                    <p className="mt-1 text-sm text-slate-500">Matches the provider setup sections.</p>
                </div>
                <StatusBadge status={`${complete}/${checks.length}`} />
            </div>
            <div className="mt-4 grid gap-2">
                {checks.map(([label, done]) => (
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm" key={label}>
                        <span className="font-semibold text-slate-700">{label}</span>
                        <StatusBadge status={done ? 'completed' : 'pending'} />
                    </div>
                ))}
            </div>
        </Card>
    );
}

function ImageUpload({ value, onChange }) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    const upload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await dashboardApi.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            onChange(unwrap(response).url);
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Upload failed.'));
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    return (
        <div>
            <div className="flex items-center gap-4">
                <Avatar name="Provider" src={value} size="lg" />
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                    {uploading ? 'Uploading...' : 'Upload photo'}
                    <input accept="image/*" className="sr-only" disabled={uploading} onChange={upload} type="file" />
                </label>
                {value && <button type="button" onClick={() => onChange('')} className="text-sm font-bold text-rose-600">Remove</button>}
            </div>
            {error && <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
        </div>
    );
}

export default function AdminUserDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { notify } = useDashboardToast();
    const { user: authenticatedUser } = useAuth();
    const [user, setUser] = useState(null);
    const [form, setForm] = useState(null);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [emailChange, setEmailChange] = useState({ email: '', current_password: '' });
    const [requestingEmailChange, setRequestingEmailChange] = useState(false);
    const [error, setError] = useState('');
    const [providerMedia, setProviderMedia] = useState([]);
    const [providerMediaMeta, setProviderMediaMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [providerMediaLoading, setProviderMediaLoading] = useState(true);
    const [providerMediaError, setProviderMediaError] = useState('');

    const loadProviderMedia = useCallback(async (page = 1) => {
        setProviderMediaLoading(true);
        setProviderMediaError('');
        try {
            const result = await apiRequest('get', `/admin/media?user_id=${encodeURIComponent(id)}&page=${page}&per_page=8`);
            setProviderMedia(result?.data ?? []);
            setProviderMediaMeta(result?.meta ?? { current_page: page, last_page: 1, total: 0 });
        } catch (requestError) {
            setProviderMediaError(apiErrorMessage(requestError, 'Provider media could not be loaded.'));
        } finally {
            setProviderMediaLoading(false);
        }
    }, [id]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [data, categoryData] = await Promise.all([
                apiRequest('get', `/admin/users/${id}`),
                apiRequest('get', '/admin/provider-categories'),
            ]);
            const profile = data.provider_profile ?? data.providerProfile ?? {};
            const verification = latestVerification(data);
            setUser(data);
            setCategories(Array.isArray(categoryData) ? categoryData : categoryData?.data ?? []);
            setForm({
                name: data.name ?? '',
                email: data.email ?? '',
                phone: data.phone ?? '',
                role: data.role ?? 'customer',
                is_active: Boolean(data.is_active ?? true),
                email_verified: Boolean(data.email_verified_at),
                verification_status: verifiedState(data),
                verification_notes: verification?.admin_notes ?? '',
                provider_profile: {
                    provider_category_id: profile.provider_category_id ?? profile.category?.id ?? '',
                    profession: profile.profession ?? '',
                    bio: profile.bio ?? '',
                    location: profile.location ?? '',
                    country: profile.country ?? '',
                    city: profile.city ?? '',
                    profile_photo: profile.profile_photo_url ?? profile.profile_photo ?? '',
                    cover_image: profile.cover_image_url ?? profile.cover_image ?? '',
                    contact_email: profile.contact_email ?? '',
                    contact_phone: profile.contact_phone ?? '',
                    website: profile.website ?? profile.social_links?.website ?? '',
                    default_currency: profile.default_currency ?? 'NGN',
                    base_price: profile.base_price ?? '',
                    verified: Boolean(profile.verified),
                    is_listed: Boolean(profile.is_listed ?? true),
                    is_pro_of_week: Boolean(profile.is_pro_of_week),
                    social_links: profile.social_links ?? {},
                    portfolio_links: profile.portfolio_links ?? [],
                    availability: (profile.availability ?? []).map((slot) => ({
                        day_of_week: Number(slot.day_of_week),
                        start_time: String(slot.start_time ?? '09:00').slice(0, 5),
                        end_time: String(slot.end_time ?? '18:00').slice(0, 5),
                    })),
                },
            });
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'User could not be loaded.'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        loadProviderMedia(1);
    }, [loadProviderMedia]);

    const profile = form?.provider_profile ?? {};
    const hasProviderControls = form?.role === 'provider' || Boolean(user?.provider_profile ?? user?.providerProfile);
    const providerBookings = (user?.provider_profile ?? user?.providerProfile)?.bookings ?? [];
    const {
        page: providerBookingsPage,
        setPage: setProviderBookingsPage,
        pageCount: providerBookingsPageCount,
        pagedItems: pagedProviderBookings,
    } = usePagination(providerBookings, 5);
    const bookedCustomers = useMemo(() => {
        const seen = new Set();
        return providerBookings
            .filter((booking) => booking.customer)
            .filter((booking) => {
                const key = booking.customer?.id ?? booking.customer?.email;
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [providerBookings]);

    const update = (patch) => setForm((current) => ({ ...current, ...patch }));
    const updateProfile = (patch) => setForm((current) => ({ ...current, provider_profile: { ...current.provider_profile, ...patch } }));
    const toggleAvailabilityDay = (day) => {
        updateProfile({
            availability: (profile.availability ?? []).some((slot) => Number(slot.day_of_week) === Number(day))
                ? (profile.availability ?? []).filter((slot) => Number(slot.day_of_week) !== Number(day))
                : [...(profile.availability ?? []), { day_of_week: Number(day), start_time: '09:00', end_time: '18:00' }].sort((a, b) => Number(a.day_of_week) - Number(b.day_of_week)),
        });
    };
    const updateAvailabilitySlot = (day, patch) => {
        updateProfile({
            availability: (profile.availability ?? []).map((slot) => Number(slot.day_of_week) === Number(day) ? { ...slot, ...patch } : slot),
        });
    };

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = { ...form };
            delete payload.email;
            delete payload.email_verified;
            if (payload.provider_profile) {
                payload.provider_profile = {
                    ...payload.provider_profile,
                    provider_category_id: payload.provider_profile.provider_category_id || null,
                    base_price: payload.provider_profile.base_price || null,
                    default_currency: payload.provider_profile.default_currency || null,
                };
            }
            if (!hasProviderControls) {
                delete payload.provider_profile;
                delete payload.verification_status;
                delete payload.verification_notes;
            }
            const updated = await apiRequest('patch', `/admin/users/${id}`, payload);
            notify('User updated.');
            setUser(updated);
            await load();
        } catch (requestError) {
            notify(apiErrorMessage(requestError), 'error');
        } finally {
            setSaving(false);
        }
    };

    const deleteUser = async () => {
        if (deleteConfirm !== 'DELETE') {
            notify('Type DELETE to confirm user deletion.', 'error');
            return;
        }

        setDeleting(true);
        try {
            await apiRequest('delete', `/admin/users/${id}`, { confirmation: deleteConfirm });
            notify('User deleted.');
            navigate('/admin/users', { replace: true });
        } catch (requestError) {
            notify(apiErrorMessage(requestError), 'error');
        } finally {
            setDeleting(false);
        }
    };

    const requestManagedEmailChange = async () => {
        setRequestingEmailChange(true);
        try {
            await apiRequest('post', `/admin/users/${id}/email-change`, emailChange);
            notify('Verification sent to the new email address.');
            setEmailChange({ email: '', current_password: '' });
            await load();
        } catch (requestError) {
            notify(apiErrorMessage(requestError), 'error');
        } finally {
            setRequestingEmailChange(false);
        }
    };

    const setVerification = (status) => {
        update({
            verification_status: status,
            provider_profile: { ...profile, verified: status === 'approved' },
        });
    };

    const latest = useMemo(() => latestVerification(user), [user]);
    const submittedProfile = user?.provider_profile ?? user?.providerProfile ?? {};
    const submittedSocials = Object.entries(submittedProfile.social_links ?? {}).filter(([, value]) => Boolean(value));
    const portfolioRecords = submittedProfile.portfolio_items ?? submittedProfile.portfolioItems ?? [];
    const submittedPortfolio = (latest?.portfolio_links?.length ? latest.portfolio_links : (submittedProfile.portfolio_links ?? [])).map((path) => {
        const record = portfolioRecords.find((item) => item.media_url === path || item.url === path);
        return { path, url: record?.url ?? mediaUrl(path) };
    });
    const usage = user?.platform_usage ?? {};
    const providerUsage = usage.provider ?? {};
    const customerUsage = usage.customer ?? {};
    const subscriptionUsage = usage.subscription ?? {};
    const accountUsage = usage.account ?? {};
    const isAdminAccount = form?.role === 'admin';
    const isOwnAccount = Number(authenticatedUser?.id) === Number(user?.id ?? id);
    const isEmailChangeLocked = isAdminAccount && Boolean(user?.login_email_changed_at);

    if (loading) return <Card><LoadingBlock rows={8} /></Card>;
    if (error || !form) return <ErrorState message={error || 'User not found.'} onRetry={load} />;

    return (
        <form className="space-y-6" onSubmit={save}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <button type="button" onClick={() => navigate('/admin/users')} className="text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-950">Back to users</button>
                    <div className="mt-3 flex items-center gap-3">
                        <Avatar name={form.name} src={profile.profile_photo} size="lg" />
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-3xl font-bold tracking-tight text-slate-950">{form.name || 'User'}</h1>
                                <VerifiedBadge show={Boolean(profile.verified)} size="lg" />
                            </div>
                            <p className="mt-1 text-sm text-slate-500">{form.email}</p>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge status={form.is_active ? 'active' : 'suspended'} />
                    <StatusBadge status={form.email_verified ? 'confirmed' : 'pending'} />
                    {hasProviderControls && <StatusBadge status={profile.verified ? 'verified' : 'unverified'} />}
                    <Button busy={saving} type="submit">Save changes</Button>
                </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
                <div className="min-w-0 space-y-5">
                    <Card>
                        <h2 className="text-lg font-bold text-slate-950">Account details</h2>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <Field label="Name"><input className={inputClass} onChange={(event) => update({ name: event.target.value })} required value={form.name} /></Field>
                            <Field hint={isOwnAccount ? 'Use Settings → Security for your own one-time verified administrator email change.' : 'Use the secure email-change section below to send a verification link.'} label="Current login email">
                                <input className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500`} disabled readOnly type="email" value={form.email} />
                            </Field>
                            <Field label="Phone"><input className={inputClass} onChange={(event) => update({ phone: event.target.value })} value={form.phone ?? ''} /></Field>
                            <Field label="Role">
                                <select className={inputClass} onChange={(event) => update({ role: event.target.value })} value={form.role}>
                                    <option value="customer">Customer</option>
                                    <option value="provider">Provider</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </Field>
                            <Field label="Account status">
                                <select className={inputClass} onChange={(event) => update({ is_active: event.target.value === '1' })} value={form.is_active ? '1' : '0'}>
                                    <option value="1">Active</option>
                                    <option value="0">Suspended</option>
                                </select>
                            </Field>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-bold text-slate-700">
                                <span>Email verification</span>
                                <StatusBadge status={form.email_verified ? 'confirmed' : 'pending'} />
                            </div>
                            {isAdminAccount && (
                                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-bold text-slate-700">
                                    <span>One-time email change</span>
                                    <StatusBadge status={user?.login_email_changed_at ? 'used' : 'available'} />
                                </div>
                            )}
                        </div>
                    </Card>

                    <Card>
                        <h2 className="text-lg font-bold text-slate-950">Login email</h2>
                        {isOwnAccount ? (
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                Manage your own one-time administrator email change from Settings → Security. Your current email remains active until the new address is verified.
                            </p>
                        ) : (
                            <>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    Enter the user’s new address and your administrator password. The address changes only after the user confirms the signed link sent to the new inbox.
                                </p>
                                {isEmailChangeLocked ? (
                                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                                        This administrator’s one-time email change has already been used and is permanently locked.
                                    </div>
                                ) : (
                                    <>
                                        {user?.pending_email && (
                                            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                                Verification pending for <span className="font-bold">{user.pending_email}</span>.
                                            </div>
                                        )}
                                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                            <Field label="New login email">
                                                <input
                                                    autoComplete="off"
                                                    className={inputClass}
                                                    onChange={(event) => setEmailChange((current) => ({ ...current, email: event.target.value }))}
                                                    type="email"
                                                    value={emailChange.email}
                                                />
                                            </Field>
                                            <Field hint="Confirms that you authorized this sensitive change." label="Your administrator password">
                                                <input
                                                    autoComplete="current-password"
                                                    className={inputClass}
                                                    onChange={(event) => setEmailChange((current) => ({ ...current, current_password: event.target.value }))}
                                                    type="password"
                                                    value={emailChange.current_password}
                                                />
                                            </Field>
                                        </div>
                                        <Button
                                            busy={requestingEmailChange}
                                            className="mt-4"
                                            disabled={!emailChange.email || !emailChange.current_password || requestingEmailChange}
                                            onClick={requestManagedEmailChange}
                                            type="button"
                                        >
                                            Send verification email
                                        </Button>
                                    </>
                                )}
                            </>
                        )}
                    </Card>

                    {hasProviderControls && (
                        <Card>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-950">Onboarding submission review</h2>
                                    <p className="mt-1 text-sm text-slate-500">All details and files submitted during provider onboarding, grouped for admin review.</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge status={submittedProfile.account_approval_status ?? 'pending'} />
                                    {submittedProfile.slug && <Link className="text-sm font-bold text-fuchsia-700 hover:underline" target="_blank" to={`/admin/providers/${submittedProfile.slug}/preview`}>Frontend preview</Link>}
                                </div>
                            </div>

                            <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 md:grid-cols-2 xl:grid-cols-3">
                                <section className="space-y-3">
                                    <h3 className="font-bold text-slate-950">Business details</h3>
                                    <ReviewField label="Business name" value={user?.name} />
                                    <ReviewField label="Category" value={submittedProfile.category?.name} />
                                    <ReviewField label="Professional title" value={submittedProfile.profession} />
                                </section>
                                <section className="space-y-3">
                                    <h3 className="font-bold text-slate-950">Contact and location</h3>
                                    <ReviewField label="Email" value={submittedProfile.contact_email} />
                                    <ReviewField label="Phone" value={submittedProfile.contact_phone} />
                                    <ReviewField label="Location" value={[submittedProfile.location, submittedProfile.city, submittedProfile.country].filter(Boolean).join(', ')} />
                                    {submittedProfile.website && <ExternalLink href={submittedProfile.website}>Website</ExternalLink>}
                                </section>
                                <section className="space-y-3">
                                    <h3 className="font-bold text-slate-950">Pricing and completion</h3>
                                    <ReviewField label="Base price" value={submittedProfile.base_price ? money(submittedProfile.base_price, submittedProfile.default_currency) : ''} />
                                    <ReviewField label="Onboarding submitted" value={formatDate(submittedProfile.onboarding_completed_at)} />
                                    <ReviewField label="Terms accepted" value={submittedProfile.terms_accepted_at ? formatDate(submittedProfile.terms_accepted_at) : 'Not accepted'} />
                                </section>
                            </div>

                            <section className="mt-5 border-t border-slate-100 pt-5">
                                <h3 className="font-bold text-slate-950">About the provider</h3>
                                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{submittedProfile.bio || 'Not provided'}</p>
                            </section>

                            <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 md:grid-cols-2">
                                <section>
                                    <h3 className="font-bold text-slate-950">Social links</h3>
                                    {submittedSocials.length ? <div className="mt-3 grid gap-2">{submittedSocials.map(([platform, url]) => <ExternalLink href={url} key={platform}>{platform}</ExternalLink>)}</div> : <p className="mt-2 text-sm text-slate-500">No social links submitted.</p>}
                                </section>
                                <section>
                                    <h3 className="font-bold text-slate-950">Portfolio</h3>
                                    {submittedPortfolio.length ? (
                                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                            {submittedPortfolio.map((item, index) => (
                                                <a className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-50" href={item.url} key={item.path} rel="noreferrer" target="_blank">
                                                    <div className="aspect-square overflow-hidden">
                                                        <img alt={`Portfolio image ${index + 1}`} className="size-full object-cover transition group-hover:scale-[1.03]" src={item.url} />
                                                    </div>
                                                    <p className="truncate px-3 py-2 text-xs font-bold text-slate-600">View image {index + 1}</p>
                                                </a>
                                            ))}
                                        </div>
                                    ) : <p className="mt-2 text-sm text-slate-500">No portfolio images submitted.</p>}
                                </section>
                            </div>

                            <section className="mt-5 border-t border-slate-100 pt-5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="font-bold text-slate-950">Verification submission</h3>
                                    <StatusBadge status={latest?.status ?? 'not submitted'} />
                                </div>
                                {latest ? (
                                    <div className="mt-3 space-y-3">
                                        <p className="whitespace-pre-line rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">{latest.professional_info || 'No written verification details provided.'}</p>
                                        <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                                            <span className="rounded-full bg-slate-100 px-3 py-1.5">{(latest.portfolio_links ?? []).length} portfolio images</span>
                                            <span className="rounded-full bg-slate-100 px-3 py-1.5">{(latest.certification_files ?? []).length} certificates</span>
                                            <span className="rounded-full bg-slate-100 px-3 py-1.5">{(latest.license_files ?? []).length} licenses</span>
                                            <span className="rounded-full bg-slate-100 px-3 py-1.5">Submitted {formatDate(latest.created_at)}</span>
                                        </div>
                                    </div>
                                ) : <p className="mt-2 text-sm text-slate-500">No verification request was submitted.</p>}
                            </section>

                            <section className="mt-5 border-t border-slate-100 pt-5">
                                <h3 className="font-bold text-slate-950">Work hours</h3>
                                {(submittedProfile.availability ?? []).length ? (
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {(submittedProfile.availability ?? []).map((slot) => (
                                            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm" key={slot.id ?? `${slot.day_of_week}-${slot.start_time}`}>
                                                <span className="font-semibold text-slate-700">{days.find(([value]) => Number(value) === Number(slot.day_of_week))?.[1] ?? 'Day'}</span>
                                                <span className="text-slate-500">{String(slot.start_time).slice(0, 5)} - {String(slot.end_time).slice(0, 5)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="mt-2 text-sm text-slate-500">No work hours submitted.</p>}
                            </section>

                            <section className="mt-5 border-t border-slate-100 pt-5">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h3 className="font-bold text-slate-950">Uploaded media and documents</h3>
                                        <p className="mt-1 text-sm text-slate-500">Profile, cover, portfolio, certificate, license, PDF, and other onboarding uploads.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <StatusBadge status={`${providerMediaMeta.total ?? 0} files`} />
                                        <Link className="text-sm font-bold text-fuchsia-700 hover:underline" to="/admin/media">Media library</Link>
                                    </div>
                                </div>
                                {providerMediaLoading ? <div className="mt-4"><LoadingBlock rows={4} /></div> : providerMediaError ? (
                                    <div className="mt-4"><ErrorState message={providerMediaError} onRetry={() => loadProviderMedia(providerMediaMeta.current_page ?? 1)} /></div>
                                ) : providerMedia.length === 0 ? (
                                    <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">This provider has not uploaded any media yet.</p>
                                ) : (
                                    <>
                                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                            {providerMedia.map((item) => {
                                                const url = mediaUrl(item.url);
                                                const image = String(item.mime_type ?? '').startsWith('image/');
                                                return (
                                                    <a className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-fuchsia-300 hover:shadow-sm" href={url} key={item.id ?? item.path} rel="noreferrer" target="_blank">
                                                        <div className="aspect-[4/3] bg-slate-100">{image ? <img alt="" className="size-full object-cover" src={url} /> : <span className="grid size-full place-items-center text-sm font-bold text-slate-500">{mediaLabel(item)}</span>}</div>
                                                        <div className="min-w-0 p-3">
                                                            <p className="truncate text-sm font-bold text-slate-900">{item.name ?? item.filename}</p>
                                                            <p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.collection?.replaceAll('_', ' ') ?? 'Upload'}</p>
                                                            <p className="mt-2 text-xs text-slate-400">{formatMediaSize(item.size)} | {formatDate(item.created_at)}</p>
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                        <Pagination page={providerMediaMeta.current_page ?? 1} pageCount={providerMediaMeta.last_page ?? 1} onPageChange={loadProviderMedia} />
                                    </>
                                )}
                            </section>
                        </Card>
                    )}

                    {hasProviderControls && (
                        <Card>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-950">Provider profile</h2>
                                    <p className="mt-1 text-sm text-slate-500">Edit the details customers see in the directory and profile page.</p>
                                </div>
                                <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                                    <VerifiedBadge show={Boolean(profile.verified)} />
                                    {profile.verified ? 'Verified profile' : 'Not verified'}
                                </div>
                            </div>
                            <div className="mt-5 space-y-4">
                                <ImageUpload value={profile.profile_photo} onChange={(profile_photo) => updateProfile({ profile_photo })} />
                                <Field label="Cover image URL"><input className={inputClass} onChange={(event) => updateProfile({ cover_image: event.target.value })} placeholder="https://..." type="url" value={profile.cover_image ?? ''} /></Field>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Provider category">
                                        <select className={inputClass} onChange={(event) => updateProfile({ provider_category_id: event.target.value })} value={profile.provider_category_id ?? ''}>
                                            <option value="">No category selected</option>
                                            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Profession"><input className={inputClass} onChange={(event) => updateProfile({ profession: event.target.value })} value={profile.profession ?? ''} /></Field>
                                    <Field label="Location"><input className={inputClass} onChange={(event) => updateProfile({ location: event.target.value })} value={profile.location ?? ''} /></Field>
                                    <Field label="Country"><input className={inputClass} onChange={(event) => updateProfile({ country: event.target.value })} value={profile.country ?? ''} /></Field>
                                    <Field label="City"><input className={inputClass} onChange={(event) => updateProfile({ city: event.target.value })} value={profile.city ?? ''} /></Field>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Contact email"><input className={inputClass} onChange={(event) => updateProfile({ contact_email: event.target.value })} type="email" value={profile.contact_email ?? ''} /></Field>
                                    <Field label="Contact phone"><input className={inputClass} onChange={(event) => updateProfile({ contact_phone: event.target.value })} value={profile.contact_phone ?? ''} /></Field>
                                    <Field label="Website"><input className={inputClass} onChange={(event) => updateProfile({ website: event.target.value, social_links: { ...(profile.social_links ?? {}), website: event.target.value } })} placeholder="https://..." type="url" value={profile.website ?? ''} /></Field>
                                    <Field label="Default currency">
                                        <select className={inputClass} onChange={(event) => updateProfile({ default_currency: event.target.value })} value={profile.default_currency ?? 'NGN'}>
                                            {currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Base price"><input className={inputClass} min="0" onChange={(event) => updateProfile({ base_price: event.target.value })} type="number" value={profile.base_price ?? ''} /></Field>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Review rating</p>
                                        <p className="mt-2 text-2xl font-bold text-slate-950">{Number((user.provider_profile ?? user.providerProfile)?.rating ?? 0).toFixed(1)}</p>
                                        <p className="mt-1 text-xs text-slate-500">Calculated from approved customer reviews.</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Review count</p>
                                        <p className="mt-2 text-2xl font-bold text-slate-950">{Number((user.provider_profile ?? user.providerProfile)?.review_count ?? 0)}</p>
                                        <p className="mt-1 text-xs text-slate-500">Updates when profile reviews change.</p>
                                    </div>
                                </div>
                                <Field label="Bio"><textarea className={`${inputClass} min-h-32 resize-y`} onChange={(event) => updateProfile({ bio: event.target.value })} value={profile.bio ?? ''} /></Field>
                            </div>
                        </Card>
                    )}

                    {hasProviderControls && (
                        <Card>
                            <h2 className="text-lg font-bold text-slate-950">Social and portfolio links</h2>
                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                {socialKeys.map((key) => (
                                    <Field key={key} label={key}>
                                        <input className={inputClass} onChange={(event) => updateProfile({ social_links: { ...(profile.social_links ?? {}), [key]: event.target.value } })} value={profile.social_links?.[key] ?? ''} />
                                    </Field>
                                ))}
                            </div>
                            <Field className="mt-4" label="Portfolio / verification links" hint="One link per line. This is added after onboarding and supports portfolio display or verification review.">
                                <textarea className={`${inputClass} min-h-28 resize-y`} onChange={(event) => updateProfile({ portfolio_links: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) })} value={(profile.portfolio_links ?? []).join('\n')} />
                            </Field>
                        </Card>
                    )}

                    {hasProviderControls && (
                        <Card>
                            <h2 className="text-lg font-bold text-slate-950">Work hours</h2>
                            <p className="mt-1 text-sm text-slate-500">Matches the availability questions from provider onboarding.</p>
                            <div className="mt-5 space-y-3">
                                {days.map(([day, label]) => {
                                    const slot = (profile.availability ?? []).find((item) => Number(item.day_of_week) === Number(day));
                                    return (
                                        <div className="grid gap-3 rounded-2xl border border-slate-100 p-3 sm:grid-cols-[1fr_150px_150px]" key={day}>
                                            <label className="flex items-center gap-3 text-sm font-bold text-slate-800">
                                                <input checked={Boolean(slot)} className="size-4 accent-fuchsia-700" onChange={() => toggleAvailabilityDay(day)} type="checkbox" />
                                                {label}
                                            </label>
                                            <input className={inputClass} disabled={!slot} onChange={(event) => updateAvailabilitySlot(day, { start_time: event.target.value })} type="time" value={slot?.start_time ?? '09:00'} />
                                            <input className={inputClass} disabled={!slot} onChange={(event) => updateAvailabilitySlot(day, { end_time: event.target.value })} type="time" value={slot?.end_time ?? '18:00'} />
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    {hasProviderControls && (
                        <Card>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-950">Customers booked on this provider</h2>
                                    <p className="mt-1 text-sm text-slate-500">Recent customers who booked from this provider profile, with contact and booking context.</p>
                                </div>
                                <StatusBadge status={`${bookedCustomers.length} customers`} />
                            </div>
                            {providerBookings.length ? (
                                <>
                                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-100">
                                    <table className="w-full min-w-[920px] text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                                                <th className="pb-3 font-bold">Customer</th>
                                                <th className="pb-3 font-bold">Contact</th>
                                                <th className="pb-3 font-bold">Service</th>
                                                <th className="pb-3 font-bold">Booking</th>
                                                <th className="pb-3 font-bold">Payment</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pagedProviderBookings.map((booking) => {
                                                const customer = booking.customer ?? {};
                                                const payment = booking.payment ?? {};
                                                return (
                                                    <tr className="border-b border-slate-50 last:border-0" key={booking.id}>
                                                        <td className="py-3">
                                                            <div className="flex items-center gap-3">
                                                                <Avatar name={customer.name} size="sm" />
                                                                <div>
                                                                    <p className="font-bold text-slate-900">{customer.name ?? 'Customer'}</p>
                                                                    <p className="text-xs text-slate-400">Joined {formatDate(customer.created_at)}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3">
                                                            <p className="font-semibold text-slate-700">{customer.email ?? 'No email'}</p>
                                                            <p className="mt-1 text-xs text-slate-400">{customer.phone ?? 'No phone'}</p>
                                                        </td>
                                                        <td className="py-3">
                                                            <p className="font-semibold text-slate-700">{booking.service?.name ?? booking.service_name ?? 'Service'}</p>
                                                            <p className="mt-1 text-xs text-slate-400">{booking.notes ? `Note: ${booking.notes}` : 'No booking note'}</p>
                                                        </td>
                                                        <td className="py-3">
                                                            <StatusBadge status={booking.status ?? 'pending'} />
                                                            <p className="mt-1 text-xs text-slate-400">{formatDate(booking.date ?? booking.created_at)} {booking.time ? `· ${String(booking.time).slice(0, 5)}` : ''}</p>
                                                        </td>
                                                        <td className="py-3">
                                                            <StatusBadge status={payment.status ?? 'unpaid'} />
                                                            <p className="mt-1 text-xs text-slate-400">{payment.amount ? `${payment.currency ?? 'NGN'} ${Number(payment.amount).toLocaleString()}` : 'No payment amount'}</p>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <Pagination page={providerBookingsPage} pageCount={providerBookingsPageCount} onPageChange={setProviderBookingsPage} />
                                </>
                            ) : (
                                <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No customer bookings have been recorded for this provider yet.</p>
                            )}
                        </Card>
                    )}
                </div>

                <div className="space-y-5 lg:sticky lg:top-24 lg:h-fit">
                    {hasProviderControls && (
                        <Card>
                            <h2 className="text-lg font-bold text-slate-950">BPHQ verification</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500">Approve to show the BPHQ verified badge beside the provider name across the platform.</p>
                            <div className="mt-5 grid grid-cols-3 gap-2">
                                {[
                                    ['approved', 'Verify'],
                                    ['pending', 'Pending'],
                                    ['rejected', 'Decline'],
                                ].map(([status, label]) => (
                                    <button key={status} type="button" onClick={() => setVerification(status)} className={`rounded-xl px-3 py-2 text-sm font-bold transition ${verificationControlClass(status, form.verification_status === status)}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <Field className="mt-4" label="Verification notes">
                                <textarea className={`${inputClass} min-h-28 resize-y`} onChange={(event) => update({ verification_notes: event.target.value })} placeholder="Internal decision notes" value={form.verification_notes ?? ''} />
                            </Field>
                            {latest && (
                                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                                    <p className="font-bold text-slate-900">Latest verification request</p>
                                    <p className="mt-1">Status: {latest.status}</p>
                                    <p>Portfolio links: {(latest.portfolio_links ?? []).length}</p>
                                    <p>Social links: {Object.values(latest.social_links ?? {}).filter(Boolean).length}</p>
                                    <p>Certificates: {(latest.certification_files ?? []).length}</p>
                                    <p>Licenses: {(latest.license_files ?? []).length}</p>
                                    {latest.professional_info && <p className="mt-2 line-clamp-4 whitespace-pre-line text-xs leading-5">{latest.professional_info}</p>}
                                </div>
                            )}
                        </Card>
                    )}

                    {hasProviderControls && (
                        <Card>
                            <h2 className="text-lg font-bold text-slate-950">Directory controls</h2>
                            <div className="mt-5 space-y-3">
                                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-bold text-slate-700">
                                    Listed in directory
                                    <input checked={Boolean(profile.is_listed)} onChange={(event) => updateProfile({ is_listed: event.target.checked })} type="checkbox" />
                                </label>
                                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-bold text-slate-700">
                                    Pro of the week
                                    <input checked={Boolean(profile.is_pro_of_week)} onChange={(event) => updateProfile({ is_pro_of_week: event.target.checked })} type="checkbox" />
                                </label>
                            </div>
                        </Card>
                    )}

                    <Card>
                        <h2 className="text-lg font-bold text-slate-950">Quick summary</h2>
                        <div className="mt-4 space-y-3 text-sm text-slate-600">
                            <p><span className="font-bold text-slate-900">Role:</span> {form.role}</p>
                            <p><span className="font-bold text-slate-900">Account:</span> {form.is_active ? 'Active' : 'Suspended'}</p>
                            <p><span className="font-bold text-slate-900">Email:</span> {form.email_verified ? 'Verified' : 'Not verified'}</p>
                            {isAdminAccount && <p><span className="font-bold text-slate-900">Email change:</span> {user?.login_email_changed_at ? 'One-time change used and locked' : 'One-time verified change available in Settings → Security'}</p>}
                            {hasProviderControls && <p><span className="font-bold text-slate-900">Provider:</span> {profile.verified ? 'Verified' : 'Not verified'}</p>}
                            <p><span className="font-bold text-slate-900">Joined:</span> {formatDate(accountUsage.joined_at ?? user?.created_at)}</p>
                            <p><span className="font-bold text-slate-900">Last login:</span> {formatDate(accountUsage.last_login_at ?? user?.last_login_at)}</p>
                        </div>
                    </Card>

                    <OnboardingChecklist form={form} profile={profile} hasProviderControls={hasProviderControls} />

                    <Card>
                        <h2 className="text-lg font-bold text-slate-950">Platform usage</h2>
                        <div className="mt-4 grid gap-3 text-sm">
                            {hasProviderControls && (
                                <>
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Provider activity</p>
                                        <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600">
                                            <p><span className="font-bold text-slate-900">{usageValue(providerUsage.services)}</span> services</p>
                                            <p><span className="font-bold text-slate-900">{usageValue(providerUsage.bookings)}</span> bookings</p>
                                            <p><span className="font-bold text-slate-900">{usageValue(providerUsage.digital_products)}</span> products</p>
                                            <p><span className="font-bold text-slate-900">{usageValue(providerUsage.reviews)}</span> reviews</p>
                                        </div>
                                        <p className="mt-2 text-xs font-semibold text-slate-500">Revenue tracked: {money(providerUsage.paid_revenue)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Provider controls</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <StatusBadge status={providerUsage.listed ? 'active' : 'suspended'} />
                                            <StatusBadge status={providerUsage.verified ? 'verified' : 'unverified'} />
                                            <StatusBadge status={providerUsage.onboarding_complete ? 'completed' : 'pending'} />
                                        </div>
                                    </div>
                                </>
                            )}
                            {!isAdminAccount && form.role === 'customer' && <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Customer activity</p>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600">
                                    <p><span className="font-bold text-slate-900">{usageValue(customerUsage.bookings)}</span> bookings</p>
                                    <p><span className="font-bold text-slate-900">{usageValue(customerUsage.saved_providers)}</span> saved pros</p>
                                    <p><span className="font-bold text-slate-900">{usageValue(customerUsage.loyalty_programs)}</span> loyalty</p>
                                    <p><span className="font-bold text-slate-900">{usageValue(customerUsage.loyalty_points)}</span> points</p>
                                </div>
                                <p className="mt-2 text-xs font-semibold text-slate-500">Spend tracked: {money(customerUsage.paid_spend)}</p>
                            </div>}
                            {hasProviderControls && <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Subscription</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <StatusBadge status={subscriptionUsage.status ?? 'inactive'} />
                                    {subscriptionUsage.plan && <StatusBadge status={subscriptionUsage.plan} />}
                                </div>
                                <p className="mt-2 text-xs font-semibold text-slate-500">Paid total: {money(subscriptionUsage.paid_total)}</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">Renews: {formatDate(subscriptionUsage.renews_at)}</p>
                            </div>}
                            {isAdminAccount && <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Administrative account</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <StatusBadge status={form.email_verified ? 'email confirmed' : 'email pending'} />
                                    <StatusBadge status={accountUsage.two_factor_enabled ? '2FA enabled' : '2FA disabled'} />
                                    <StatusBadge status={user?.login_email_changed_at ? 'email locked' : 'email change available'} />
                                </div>
                            </div>}
                        </div>
                    </Card>

                    {!isOwnAccount && <Card className="border-[#FECDCA] bg-[#FEF3F2]">
                        <h2 className="text-lg font-bold text-[#B42318]">Delete user data</h2>
                        <p className="mt-2 text-sm leading-6 text-[#912018]">
                            Permanently deletes this user and related platform records, including provider profile data, bookings, payments, subscriptions, CRM, loyalty, saved providers, and verification records. This cannot be undone.
                        </p>
                        <Field className="mt-4" label="Type DELETE to confirm">
                            <input
                                className={`${inputClass} border-[#FDA29B] focus:border-[#B42318] focus:ring-[#FEE4E2]`}
                                onChange={(event) => setDeleteConfirm(event.target.value)}
                                placeholder="DELETE"
                                value={deleteConfirm}
                            />
                        </Field>
                        <Button
                            busy={deleting}
                            className="mt-4 w-full"
                            disabled={deleteConfirm !== 'DELETE' || deleting}
                            onClick={deleteUser}
                            type="button"
                            variant="danger"
                        >
                            Delete user permanently
                        </Button>
                    </Card>}
                </div>
            </div>
        </form>
    );
}
