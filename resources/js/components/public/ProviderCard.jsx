import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { apiError, ensureCsrfCookie } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Icon from '../ui/Icon';
import VerifiedBadge from '../ui/VerifiedBadge';
import { providerIdentity } from '../../lib/utils';

export default function ProviderCard({ provider, featured = false }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const pro = providerIdentity(provider);
    const reviews = pro.reviewsCount || provider.reviews_count || provider.review_count || 0;
    const hasRating = Number(pro.rating) > 0;
    const [saved, setSaved] = useState(Boolean(provider.is_saved ?? provider.saved_by_customer ?? provider.saved));
    const [saving, setSaving] = useState(false);

    async function toggleSaved(event) {
        event.preventDefault();
        event.stopPropagation();

        if (!user) {
            navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            return;
        }

        if (user.role !== 'customer') {
            toast.error('Saved professionals are available from a customer account.');
            return;
        }

        const previous = saved;
        setSaved(!previous);
        setSaving(true);

        try {
            await ensureCsrfCookie();
            const response = previous
                ? await api.delete(`/customer/saved-providers/${pro.id}`)
                : await api.post(`/customer/saved-providers/${pro.id}`);
            toast.success(response?.data?.message || (previous ? 'Professional removed from saved profiles.' : 'Professional saved to your account.'));
        } catch (requestError) {
            if (!previous && requestError?.response?.status === 409) {
                setSaved(true);
                toast.success('This professional is already in your saved profiles.');
            } else {
                setSaved(previous);
                toast.error(apiError(requestError, 'Your saved profiles could not be updated.').message);
            }
        } finally {
            setSaving(false);
        }
    }

    const saveLabel = saved ? 'Remove from saved providers' : 'Save provider';

    return (
        <article className={`group overflow-hidden rounded-lg border border-stone-200 bg-white text-[#241711] shadow-none transition duration-300 hover:-translate-y-0.5 sm:relative sm:border-0 sm:bg-[#34231c] sm:text-white sm:shadow-[0_16px_40px_rgba(45,29,22,.14)] sm:hover:-translate-y-1 sm:hover:shadow-[0_22px_55px_rgba(45,29,22,.18)] ${featured ? 'sm:min-h-[380px]' : 'sm:min-h-[330px]'}`}>
            <div className="grid h-[148px] grid-cols-[41%_1fr] sm:hidden">
                <Link to={`/providers/${pro.slug}`} className="relative block h-full overflow-hidden bg-[#d6c9bd]" aria-label={`View ${pro.name}'s profile`}>
                    {pro.photo ? (
                        <img src={pro.photo} alt={pro.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                    ) : (
                        <div className="size-full bg-gradient-to-br from-[#806c5d] to-[#2f211b]" />
                    )}
                </Link>

                <div className="relative min-w-0 p-3">
                    <button type="button" onClick={toggleSaved} disabled={saving} className={`absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-sm border transition ${saved ? 'border-[#7d2e3c] bg-[#7d2e3c] text-white' : 'border-[#241711]/30 text-[#241711]/80 hover:bg-[#f4efe9]'}`} aria-label={saveLabel}>
                        <Icon name="heart" size={15} fill={saved ? 'currentColor' : 'none'} />
                    </button>
                    <div className="min-w-0 pb-10 pr-8">
                        <h3 className="flex min-w-0 items-center gap-1.5 font-display text-[1.45rem] font-normal leading-none tracking-[-.03em]">
                            <span className="truncate">{pro.name}</span>
                            <VerifiedBadge show={pro.verified} size="sm" className="shrink-0" />
                        </h3>
                        <p className="mt-1.5 truncate text-[11px] font-semibold text-[#241711]/80">{pro.profession}</p>
                        <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#241711]/72"><Icon name="map" size={12} />{pro.location}</p>
                        {hasRating && <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-[#241711]">
                            <Icon name="star" size={12} fill="currentColor" strokeWidth={0} className="text-[#d39331]" />{pro.rating.toFixed(1)} {reviews ? `(${reviews})` : ''}
                        </p>}
                    </div>
                    <Link to={`/providers/${pro.slug}`} className="absolute bottom-5 right-3 inline-flex h-8 min-w-[104px] items-center justify-center rounded-md bg-[#241711] px-3 text-[9px] font-black uppercase tracking-wide text-white transition hover:bg-[#3b251b]">
                        View Profile
                    </Link>
                </div>
            </div>

            <div className={`relative hidden overflow-hidden sm:block ${featured ? 'min-h-[380px]' : 'min-h-[330px]'}`}>
            <Link to={`/providers/${pro.slug}`} className="absolute inset-0" aria-label={`View ${pro.name}'s profile`}>
                {pro.photo ? (
                    <img src={pro.photo} alt={pro.name} className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                ) : (
                    <div className="size-full bg-gradient-to-br from-[#806c5d] to-[#2f211b]" />
                )}
                <span className="absolute inset-0 bg-gradient-to-b from-black/12 via-black/12 to-black/78" />
            </Link>

            <div className={`pointer-events-none relative z-10 flex flex-col ${featured ? 'min-h-[380px]' : 'min-h-[330px]'} p-5`}>
                <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex max-w-[78%] items-center gap-1 rounded-sm bg-white/85 px-2 py-1 text-[10px] font-black uppercase text-[#34231c]">
                        <Icon name="map" size={12} />
                        <span className="truncate">{pro.location}</span>
                    </span>
                    <button type="button" onClick={toggleSaved} disabled={saving} className={`pointer-events-auto ml-auto grid size-8 place-items-center rounded-sm border transition ${saved ? 'border-white bg-white text-[#7d2e3c]' : 'border-white/55 text-white/80 hover:bg-white/12'}`} aria-label={saveLabel}>
                        <Icon name="heart" size={15} fill={saved ? 'currentColor' : 'none'} />
                    </button>
                </div>

                <div className="mt-auto">
                    <h3 className="flex min-w-0 items-center gap-2 font-display text-2xl font-normal leading-tight">
                        <span className="truncate">{pro.name}</span>
                        <VerifiedBadge show={pro.verified} size="md" className="shrink-0" />
                    </h3>
                    <p className="mt-2 text-xs font-bold text-white/82">{pro.profession}</p>
                    <div className={`mt-3 flex items-center gap-3 ${hasRating ? 'justify-between' : 'justify-end'}`}>
                        {hasRating && <span className="inline-flex items-center gap-1 text-xs font-black text-white">
                            <Icon name="star" size={13} fill="currentColor" strokeWidth={0} className="text-amber-400" />{pro.rating.toFixed(1)} {reviews ? `(${reviews})` : ''}
                        </span>}
                        <Link to={`/providers/${pro.slug}`} className="pointer-events-auto inline-flex min-h-10 items-center justify-center rounded border border-white/20 bg-black/28 px-4 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur transition hover:bg-black/45">
                            View Profile
                        </Link>
                    </div>
                </div>
            </div>
            </div>
        </article>
    );
}
