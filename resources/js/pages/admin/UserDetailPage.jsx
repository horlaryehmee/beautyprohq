import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, Card, ErrorState, Field, LoadingBlock, StatusBadge, apiErrorMessage, apiRequest, inputClass, useDashboardToast } from '../../components/dashboard';
import { dashboardApi, unwrap } from '../../components/dashboard/api';
import VerifiedBadge from '../../components/ui/VerifiedBadge';

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

function latestVerification(user) {
    return (user?.provider_profile ?? user?.providerProfile)?.verification_requests?.[0] ?? null;
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
            formData.append('image', file);
            const response = await dashboardApi.post('/admin/media', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
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
    const [user, setUser] = useState(null);
    const [form, setForm] = useState(null);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

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
                preferred_currency: data.preferred_currency ?? '',
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
                    profile_photo: profile.profile_photo ?? '',
                    cover_image: profile.cover_image ?? '',
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

    const profile = form?.provider_profile ?? {};
    const hasProviderControls = form?.role === 'provider' || Boolean(user?.provider_profile ?? user?.providerProfile);
    const providerBookings = (user?.provider_profile ?? user?.providerProfile)?.bookings ?? [];
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

    const setVerification = (status) => {
        update({
            verification_status: status,
            provider_profile: { ...profile, verified: status === 'approved' },
        });
    };

    const latest = useMemo(() => latestVerification(user), [user]);

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

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-5">
                    <Card>
                        <h2 className="text-lg font-bold text-slate-950">Account details</h2>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <Field label="Name"><input className={inputClass} onChange={(event) => update({ name: event.target.value })} required value={form.name} /></Field>
                            <Field label="Email"><input className={inputClass} onChange={(event) => update({ email: event.target.value })} required type="email" value={form.email} /></Field>
                            <Field label="Phone"><input className={inputClass} onChange={(event) => update({ phone: event.target.value })} value={form.phone ?? ''} /></Field>
                            <Field label="Preferred currency"><input className={inputClass} onChange={(event) => update({ preferred_currency: event.target.value })} placeholder="NGN" value={form.preferred_currency ?? ''} /></Field>
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
                            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-bold text-slate-700">
                                <input checked={form.email_verified} onChange={(event) => update({ email_verified: event.target.checked })} type="checkbox" />
                                Email verified
                            </label>
                        </div>
                    </Card>

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
                            <Field className="mt-4" label="Portfolio links" hint="One link per line.">
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
                                <div className="mt-5 overflow-x-auto">
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
                                            {providerBookings.map((booking) => {
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
                            ) : (
                                <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No customer bookings have been recorded for this provider yet.</p>
                            )}
                        </Card>
                    )}
                </div>

                <div className="space-y-5 xl:sticky xl:top-24 xl:h-fit">
                    {hasProviderControls && (
                        <Card>
                            <h2 className="text-lg font-bold text-slate-950">BPHQ verification</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500">Approve to show the BPHQ verified badge beside the provider name across the platform.</p>
                            <div className="mt-5 grid grid-cols-3 gap-2">
                                {[
                                    ['approved', 'Verify'],
                                    ['pending', 'Pending'],
                                    ['rejected', 'Reject'],
                                ].map(([status, label]) => (
                                    <button key={status} type="button" onClick={() => setVerification(status)} className={`rounded-xl px-3 py-2 text-sm font-bold transition ${form.verification_status === status ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
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
                            {hasProviderControls && <p><span className="font-bold text-slate-900">Provider:</span> {profile.verified ? 'Verified' : 'Not verified'}</p>}
                        </div>
                    </Card>
                </div>
            </div>
        </form>
    );
}
