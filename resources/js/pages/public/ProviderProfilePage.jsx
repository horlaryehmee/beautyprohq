import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { apiError, collectionFrom, ensureCsrfCookie, unwrap } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button, { buttonClass } from '../../components/ui/Button';
import { EmptyState, InlineAlert, PageLoader } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import VerifiedBadge from '../../components/ui/VerifiedBadge';
import BookingModal from '../../components/public/BookingModal';
import { currency, mediaUrl, normalizeLinks, providerIdentity, safeUrl, shortDate } from '../../lib/utils';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const tabs = [
    ['booking', 'Booking'],
    ['about', 'About'],
    ['reviews', 'Review'],
];

function digitalProductImage(product) {
    return mediaUrl(product?.image ?? product?.image_url ?? product?.cover_image);
}

function digitalProductUrl(product) {
    return safeUrl(product?.url ?? product?.link ?? product?.product_url);
}

function displayTime(time) {
    if (!time) return '';
    const [hour, minute] = String(time).slice(0, 5).split(':').map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function portfolioItems(provider) {
    const profile = provider?.provider_profile ?? provider?.profile ?? provider ?? {};
    const source = profile.portfolio_items ?? profile.portfolio ?? profile.portfolio_images ?? provider?.portfolio_items ?? provider?.portfolio ?? [];
    if (!Array.isArray(source)) return [];
    return source
        .map((item, index) => typeof item === 'string' ? { id: index, image: mediaUrl(item) } : { id: item.id ?? index, image: mediaUrl(item.media_url ?? item.image_url ?? item.image ?? item.url), title: item.title })
        .filter((item) => item.image);
}

function availabilityItems(provider) {
    const profile = provider?.provider_profile ?? provider?.profile ?? provider ?? {};
    const source = profile.availability ?? provider?.availability ?? [];
    return Array.isArray(source) ? source : source?.data ?? [];
}

function ReviewModal({ open, onClose, providerName, onSubmit, submitting }) {
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');

    useEffect(() => {
        if (open) {
            setRating(5);
            setComment('');
        }
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[80] grid place-items-end overflow-y-auto bg-[#1d120e]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={onClose}>
            <form
                className="w-full max-w-lg rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem] sm:p-7"
                onMouseDown={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit({ rating, comment });
                }}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="section-eyebrow">Client review</p>
                        <h2 className="font-display text-3xl font-black leading-tight text-plum-950">Review {providerName}</h2>
                        <p className="mt-2 text-sm leading-6 text-stone-600">Reviews are accepted from customers with a completed booking.</p>
                    </div>
                    <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-stone-100 text-stone-600" aria-label="Close review form">
                        <Icon name="x" size={18} />
                    </button>
                </div>

                <div className="mt-6">
                    <p className="text-sm font-black text-plum-950">Rating</p>
                    <div className="mt-3 flex gap-2">
                        {[1, 2, 3, 4, 5].map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setRating(value)}
                                className={`grid size-11 place-items-center rounded-xl border transition ${value <= rating ? 'border-amber-300 bg-amber-50 text-amber-500' : 'border-stone-200 bg-white text-stone-300 hover:bg-stone-50'}`}
                                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                            >
                                <Icon name="star" size={20} fill="currentColor" strokeWidth={0} />
                            </button>
                        ))}
                    </div>
                </div>

                <label className="mt-5 block">
                    <span className="text-sm font-black text-plum-950">Comment</span>
                    <textarea
                        className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="Share what the experience was like..."
                        value={comment}
                    />
                </label>

                <div className="mt-6 flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit review'}</Button>
                </div>
            </form>
        </div>
    );
}

function ServiceCard({ service, onBook, canBook = true }) {
    const originalCurrency = service.currency ?? 'NGN';
    return (
        <article className="group grid grid-cols-[1fr_auto] items-center gap-3 border-b border-stone-100 bg-white px-1 py-4 transition last:border-b-0 hover:bg-[#fffaf1] sm:gap-4 sm:py-5">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-[#26211e] sm:text-base">{service.name}</h3>
                    {service.service_type && <Badge tone="neutral">{String(service.service_type).replaceAll('_', ' ')}</Badge>}
                </div>
                {service.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500 sm:text-sm sm:leading-6">{service.description}</p>}
                <p className="mt-2 text-xs font-black text-[#15816f] sm:text-sm">
                    {currency(service.price, originalCurrency)} {service.duration_minutes ? `/ ${Math.round(service.duration_minutes / 60) || 1}hr` : ''}
                </p>
            </div>
            <button type="button" disabled={!canBook} onClick={() => onBook(service)} className="grid size-10 place-items-center rounded-full border border-[#79b9ad] text-[#15816f] transition group-hover:scale-105 hover:bg-[#15816f] hover:text-white disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300 disabled:hover:bg-white sm:size-11" aria-label={`Book ${service.name}`}>
                <Icon name="plus" size={18} />
            </button>
        </article>
    );
}

function SocialIcon({ label }) {
    const key = String(label || '').toLowerCase();
    if (key.includes('instagram')) {
        return <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.2" /><circle cx="17" cy="7" r="0.8" fill="currentColor" strokeWidth="0" /></svg>;
    }
    if (key.includes('tiktok')) {
        return <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d="M15.6 3c.4 2.4 1.8 3.9 4.4 4.1v3.1a7.4 7.4 0 0 1-4.3-1.4v6.4c0 3.2-2.1 5.8-5.7 5.8-3 0-5.2-1.9-5.2-4.8 0-3.4 3-5.3 6-4.7v3.3c-1.4-.4-2.8.2-2.8 1.4 0 .9.7 1.5 1.8 1.5 1.5 0 2.1-.9 2.1-2.5V3h3.7Z" /></svg>;
    }
    if (key.includes('whatsapp')) {
        return <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d="M12 3a8.7 8.7 0 0 0-7.5 13.1L3.6 21l5-1.3A8.7 8.7 0 1 0 12 3Zm0 15.7c-1.3 0-2.5-.3-3.6-1l-.3-.2-2.1.6.6-2-.2-.3A6.9 6.9 0 1 1 12 18.7Zm3.8-5.1c-.2-.1-1.2-.6-1.4-.7-.2-.1-.4-.1-.5.1l-.7.8c-.1.2-.3.2-.5.1a5.6 5.6 0 0 1-2.8-2.4c-.1-.2 0-.4.1-.5l.4-.5c.1-.1.1-.3.2-.4v-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4H9c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.6 4 3.5 2 .8 2.4.5 2.8.5.4 0 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1l-.4-.2Z" /></svg>;
    }
    return <Icon name="external" size={18} />;
}

export default function ProviderProfilePage() {
    const { provider: routeProvider, id, slug } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const identifier = routeProvider ?? id ?? slug;
    const [provider, setProvider] = useState(null);
    const [services, setServices] = useState([]);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('booking');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [bookingService, setBookingService] = useState(null);
    const [showBooking, setShowBooking] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showReview, setShowReview] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [digitalPage, setDigitalPage] = useState(1);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [profileResult, servicesResult, reviewsResult] = await Promise.allSettled([
                api.get(`/providers/${identifier}`),
                api.get(`/providers/${identifier}/services`),
                api.get(`/providers/${identifier}/reviews`),
            ]);
            if (profileResult.status === 'rejected') throw profileResult.reason;
            const nextProvider = unwrap(profileResult.value);
            const profilePayload = nextProvider?.provider ?? nextProvider;
            setProvider(profilePayload);
            setSaved(Boolean(profilePayload?.is_saved ?? profilePayload?.saved_by_customer ?? profilePayload?.saved));
            const embeddedServices = nextProvider?.services ?? nextProvider?.provider?.services ?? [];
            const embeddedReviews = nextProvider?.reviews ?? nextProvider?.provider?.reviews ?? [];
            setServices(servicesResult.status === 'fulfilled' ? collectionFrom(servicesResult.value) : embeddedServices);
            setReviews(reviewsResult.status === 'fulfilled' ? collectionFrom(reviewsResult.value) : embeddedReviews);
        } catch (requestError) {
            setError(requestError?.response?.status === 404 ? 'This professional profile could not be found.' : requestError?.response?.data?.message || 'The professional profile could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [identifier]);

    useEffect(() => { load(); }, [load]);

    const pro = useMemo(() => providerIdentity(provider ?? {}), [provider]);
    const portfolio = useMemo(() => portfolioItems(provider), [provider]);
    const availability = useMemo(() => availabilityItems(provider), [provider]);
    const socialLinks = useMemo(() => normalizeLinks(pro.profile.social_links), [pro.profile]);
    const digitalLinks = useMemo(() => normalizeLinks(pro.profile.digital_product_links ?? provider?.digital_products), [pro.profile, provider]);
    const visibleTabs = useMemo(() => digitalLinks.length ? [...tabs, ['digital-products', 'Digital products']] : tabs, [digitalLinks.length]);
    const digitalPerPage = 9;
    const digitalPageCount = Math.max(1, Math.ceil(digitalLinks.length / digitalPerPage));
    const paginatedDigitalLinks = useMemo(() => {
        const start = (digitalPage - 1) * digitalPerPage;
        return digitalLinks.slice(start, start + digitalPerPage);
    }, [digitalLinks, digitalPage]);
    const portfolioLinks = useMemo(() => normalizeLinks(pro.profile.portfolio_links), [pro.profile]);
    const profileCtaUrl = pro.profile.profile_cta_url ?? provider?.profile_cta_url ?? digitalLinks[0]?.url ?? '';
    const profileCtaLabel = pro.profile.profile_cta_label ?? provider?.profile_cta_label ?? digitalLinks[0]?.label ?? 'Digital product';
    const categories = useMemo(() => ['All', ...Array.from(new Set(services.map((service) => service.category).filter(Boolean)))], [services]);
    const filteredServices = useMemo(() => selectedCategory === 'All' ? services : services.filter((service) => service.category === selectedCategory), [selectedCategory, services]);
    const ratingBreakdown = useMemo(() => [5, 4, 3, 2, 1].map((rating) => ({ rating, count: reviews.filter((review) => Number(review.rating) === rating).length })), [reviews]);
    const canBookDirectly = Boolean(provider?.can_book_directly ?? provider?.user?.active_subscription?.plan === 'paid' ?? provider?.user?.activeSubscription?.plan === 'paid');

    useEffect(() => {
        if (activeTab === 'digital-products' && !digitalLinks.length) {
            setActiveTab('booking');
        }
    }, [activeTab, digitalLinks.length]);

    useEffect(() => {
        setDigitalPage(1);
    }, [identifier, digitalLinks.length]);

    useEffect(() => {
        if (digitalPage > digitalPageCount) {
            setDigitalPage(digitalPageCount);
        }
    }, [digitalPage, digitalPageCount]);

    function book(service = null) {
        if (!canBookDirectly) {
            toast.error('This provider is not accepting direct bookings on BeautyPro HQ yet.');
            return;
        }
        setBookingService(service);
        setShowBooking(true);
    }

    async function shareProfile() {
        const url = window.location.href;
        try {
            if (navigator.share) {
                await navigator.share({ title: pro.name, text: `Book ${pro.name} on BeautyPro HQ`, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            toast.success('Profile link copied.');
        } catch {
            toast.error('Profile link could not be shared.');
        }
    }

    async function toggleSaved() {
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

    function openReview() {
        if (!user) {
            navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            return;
        }
        if (user.role !== 'customer') {
            toast.error('Reviews can only be submitted from a customer account.');
            return;
        }
        setShowReview(true);
    }

    async function submitReview(payload) {
        setReviewSubmitting(true);
        try {
            await ensureCsrfCookie();
            await api.post(`/providers/${pro.id}/reviews`, payload);
            toast.success('Thank you. Your review has been added.');
            setShowReview(false);
            await load();
        } catch (requestError) {
            const message = requestError?.response?.status === 404
                ? 'You need a completed booking with this professional before leaving a review.'
                : apiError(requestError, 'Your review could not be submitted.').message;
            toast.error(message);
        } finally {
            setReviewSubmitting(false);
        }
    }

    if (loading) return <PageLoader label="Loading professional profile..." />;
    if (error || !provider) return <div className="page-container py-20"><EmptyState icon="user" title="Profile unavailable" message={error} action={<div className="flex justify-center gap-2"><Button onClick={load}>Try again</Button><Link to="/directory" className={buttonClass({ variant: 'secondary' })}>Back to directory</Link></div>} /></div>;

    const coverImage = mediaUrl(pro.profile.cover_photo ?? provider?.cover_photo ?? provider?.cover_image) ?? portfolio[0]?.image ?? pro.photo;
    return (
        <>
            <section className="bg-[#fbf9f4]">
                <div className="relative">
                    <div className="page-container absolute inset-x-0 top-3 z-20 flex items-center justify-between gap-2 sm:top-5">
                        <Link to="/directory" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/70 bg-white/92 px-3 text-xs font-black text-[#26211e] shadow-sm backdrop-blur transition hover:bg-white sm:min-h-10 sm:gap-2 sm:px-4 sm:text-sm">
                            <Icon name="chevronLeft" size={16} /> Directory
                        </Link>
                        <div className="flex items-center gap-2">
                            {(!user || user.role === 'customer') && (
                                <button type="button" onClick={toggleSaved} disabled={saving} className="grid size-9 place-items-center rounded-full border border-white/70 bg-white/92 text-[#26211e] shadow-sm backdrop-blur transition hover:bg-white sm:size-10" aria-label={saved ? 'Saved' : 'Save'}>
                                    <Icon name="heart" size={17} fill={saved ? 'currentColor' : 'none'} />
                                </button>
                            )}
                            <button type="button" onClick={shareProfile} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/70 bg-white/92 px-3 text-[11px] font-black uppercase tracking-wide text-[#26211e] shadow-sm backdrop-blur transition hover:bg-white sm:min-h-10 sm:gap-2 sm:px-4 sm:text-xs" aria-label="Share profile">
                                <Icon name="external" size={14} /> Share
                            </button>
                        </div>
                    </div>

                    <div className="relative w-full overflow-hidden bg-[#d8d3cc] shadow-[0_24px_70px_rgba(52,35,28,.08)]">
                        <div className="relative h-[250px] overflow-hidden sm:h-[390px] lg:h-[460px]">
                            {coverImage ? (
                                <img src={coverImage} alt={pro.name} className="size-full object-cover" />
                            ) : (
                                <div className="size-full bg-gradient-to-br from-[#efe5da] via-[#c8b7a8] to-[#7f6a5d]" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                        </div>
                    </div>
                </div>

                <div className="page-container">
                    <div className="relative z-10 -mt-11 grid gap-3 px-3 pb-5 sm:-mt-20 sm:gap-5 sm:px-6 sm:pb-8 lg:grid-cols-[auto_1fr_auto] lg:items-end lg:px-8">
                        <Avatar src={pro.photo} name={pro.name} className="size-24 border-[3px] border-white bg-white shadow-[0_12px_30px_rgba(52,35,28,.16)] sm:size-40 sm:border-4 lg:size-48" />
                        <div className="min-w-0">
                            <h1 className="font-display text-[2rem] font-normal leading-none tracking-[-.03em] text-[#26211e] sm:text-3xl sm:leading-tight lg:text-4xl">
                                <span className="align-middle">{pro.name}</span>
                                <VerifiedBadge show={pro.verified} size="md" className="ml-2 inline-grid align-middle" />
                            </h1>
                            <p className="mt-1.5 text-sm font-bold text-stone-700 sm:mt-2 sm:text-base">{pro.profession}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-semibold text-stone-500 sm:mt-3 sm:gap-x-4 sm:text-sm">
                                <span className="inline-flex items-center gap-1.5"><Icon name="map" size={14} />{pro.location}</span>
                                <span className="inline-flex items-center gap-1.5"><Icon name="star" size={14} fill="currentColor" strokeWidth={0} className="text-amber-500" />{pro.rating ? pro.rating.toFixed(1) : 'New'} rating</span>
                            </div>
                        </div>
                        {profileCtaUrl && (
                            <a href={safeUrl(profileCtaUrl)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-xl bg-[#26211e] px-5 text-xs font-black text-white shadow-[0_14px_30px_rgba(52,35,28,.16)] transition hover:bg-[#7d2e3c] sm:min-h-12 sm:px-6 sm:text-sm lg:mb-1">
                                {profileCtaLabel || 'Digital product'} <Icon name="external" size={15} />
                            </a>
                        )}
                    </div>
                </div>
            </section>

            <nav className="sticky top-16 z-30 mt-2 bg-[#fbf9f4]/95 py-2 backdrop-blur-xl sm:top-18 sm:mt-8 sm:py-3">
                <div className="page-container">
                    <div className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1 shadow-[0_12px_35px_rgba(52,35,28,.06)] sm:w-fit">
                    {visibleTabs.map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setActiveTab(key)} className={`min-h-10 flex-1 shrink-0 rounded-xl px-3 text-xs font-black transition sm:min-h-11 sm:flex-none sm:px-7 sm:text-sm ${activeTab === key ? 'bg-[#26211e] text-white shadow-sm' : 'text-stone-500 hover:bg-[#f4efe9] hover:text-[#26211e]'}`}>
                            {label}
                        </button>
                    ))}
                    </div>
                </div>
            </nav>

            <section className="bg-[#fbf9f4] py-4 sm:py-12">
                <div className="page-container">
                    {activeTab === 'booking' && (
                        <div className="grid gap-4 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
                            <div>
                                <div className="overflow-hidden rounded-[1.35rem] border border-stone-200 bg-white px-4 shadow-sm sm:rounded-[1.8rem] sm:px-5">
                                    {categories.length > 1 && (
                                        <div className="flex gap-2 overflow-x-auto border-b border-stone-100 py-3 sm:py-4">
                                            {categories.map((category) => (
                                                <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide transition sm:px-5 sm:text-xs ${selectedCategory === category ? 'border-[#15816f] bg-[#15816f] text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-[#15816f]/40'}`}>
                                                    {category}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {filteredServices.length ? filteredServices.map((service) => <ServiceCard key={service.id} service={service} onBook={book} canBook={canBookDirectly} />) : <div className="py-8"><EmptyState compact title="No services found" message="Try another category or check back later." /></div>}
                                </div>
                                {!canBookDirectly && <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">This provider is currently listed for discovery and reviews. Direct booking is available when they activate a paid provider plan.</p>}
                            </div>

                            <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
                                <div className="rounded-[1.35rem] border border-stone-200 bg-white p-4 sm:rounded-[1.8rem] sm:p-5">
                                    <h3 className="font-display text-lg font-black text-[#26211e]">Weekly availability</h3>
                                    {availability.length ? (
                                        <div className="mt-4 divide-y divide-stone-100">
                                            {dayNames.map((day, index) => {
                                                const rows = availability.filter((item) => String(item.day_of_week).toLowerCase() === day.toLowerCase() || Number(item.day_of_week) === index);
                                                return <div key={day} className="flex items-start justify-between gap-3 py-2.5 text-xs"><span className="font-bold text-stone-500">{day.slice(0, 3)}</span><span className="text-right font-black text-[#26211e]">{rows.length ? rows.map((row) => `${displayTime(row.start_time)} - ${displayTime(row.end_time)}`).join(', ') : 'Closed'}</span></div>;
                                            })}
                                        </div>
                                    ) : <p className="mt-3 text-sm leading-6 text-stone-500">Choose a date in the booking form to see open times.</p>}
                                </div>
                            </aside>
                        </div>
                    )}

                    {activeTab === 'reviews' && (
                        <div>
                            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <p className="section-eyebrow">Client feedback</p>
                                    <h2 className="section-title">Reviews</h2>
                                </div>
                                <Button onClick={openReview} variant="secondary"><Icon name="star" size={16} fill="currentColor" strokeWidth={0} /> Add review</Button>
                            </div>

                            {reviews.length ? (
                                <>
                                    <div className="grid gap-5 rounded-[1.8rem] border border-stone-200 bg-white p-6 sm:grid-cols-[180px_1fr] sm:p-7">
                                        <div className="text-center sm:border-r sm:border-stone-100">
                                            <p className="font-display text-5xl font-black text-[#26211e]">{pro.rating ? pro.rating.toFixed(1) : (reviews.reduce((sum, item) => sum + Number(item.rating), 0) / reviews.length).toFixed(1)}</p>
                                            <div className="mt-2 flex justify-center gap-0.5 text-amber-400">{Array.from({ length: 5 }).map((_, index) => <Icon key={index} name="star" size={15} fill="currentColor" strokeWidth={0} />)}</div>
                                            <p className="mt-2 text-xs font-bold text-stone-400">{reviews.length} review{reviews.length === 1 ? '' : 's'}</p>
                                        </div>
                                        <div className="space-y-2">
                                            {ratingBreakdown.map((row) => (
                                                <div key={row.rating} className="grid grid-cols-[14px_1fr_24px] items-center gap-2 text-xs font-bold text-stone-500">
                                                    <span>{row.rating}</span>
                                                    <span className="h-1.5 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${reviews.length ? (row.count / reviews.length) * 100 : 0}%` }} /></span>
                                                    <span>{row.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mt-5 grid gap-4">
                                        {reviews.map((review) => {
                                            const customer = review.customer ?? review.user ?? {};
                                            return (
                                                <article key={review.id} className="rounded-2xl border border-stone-200 bg-white p-5">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar src={customer.profile_photo_url} name={customer.name ?? review.customer_name} size="sm" />
                                                            <div>
                                                                <p className="text-sm font-black text-[#26211e]">{customer.name ?? review.customer_name ?? 'BeautyPro customer'}</p>
                                                                <p className="mt-0.5 text-[11px] font-semibold text-stone-400">{shortDate(review.created_at)}</p>
                                                            </div>
                                                        </div>
                                                        <span className="inline-flex items-center gap-1 text-xs font-black text-amber-700"><Icon name="star" size={13} fill="currentColor" strokeWidth={0} />{Number(review.rating).toFixed(1)}</span>
                                                    </div>
                                                    {review.comment && <p className="mt-4 text-sm leading-7 text-stone-600">{review.comment}</p>}
                                                </article>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : <EmptyState compact icon="star" title="No reviews yet" message="Completed customer reviews will appear here." action={<Button onClick={openReview} variant="soft">Add the first review</Button>} />}
                        </div>
                    )}

                    {activeTab === 'digital-products' && digitalLinks.length > 0 && (
                        <div>
                            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <p className="section-eyebrow">Shop</p>
                                    <h2 className="section-title">Digital products</h2>
                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">Guides, templates, resources, downloads, and external products published by {pro.name}.</p>
                                </div>
                                <span className="w-fit rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-stone-500">
                                    {digitalLinks.length} product{digitalLinks.length === 1 ? '' : 's'}
                                </span>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {paginatedDigitalLinks.map((item) => {
                                    const image = digitalProductImage(item);
                                    const url = digitalProductUrl(item);
                                    return (
                                        <article key={`${item.id ?? item.label}-${item.url}`} className="group overflow-hidden rounded-[1.6rem] border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#7d2e3c]/30 hover:shadow-[0_18px_50px_rgba(52,35,28,.10)]">
                                            <a href={url} target="_blank" rel="noreferrer" className="block">
                                                <div className="relative aspect-[4/3] overflow-hidden bg-[#f4efe9]">
                                                    {image ? (
                                                        <img src={image} alt={item.label} className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                                                    ) : (
                                                        <div className="grid size-full place-items-center bg-gradient-to-br from-[#f4efe9] via-white to-[#ead8c7]">
                                                            <span className="font-display text-5xl font-normal text-[#26211e]">BPHQ</span>
                                                        </div>
                                                    )}
                                                    <span className="absolute left-3 top-3 rounded-full bg-white/92 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#26211e] shadow-sm">Digital</span>
                                                </div>
                                            </a>
                                            <div className="p-4 sm:p-5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <h3 className="font-display text-xl font-normal leading-tight text-[#26211e]">{item.label}</h3>
                                                    {item.price != null && <p className="shrink-0 text-sm font-black text-[#7d2e3c]">{currency(item.price, item.currency ?? 'NGN')}</p>}
                                                </div>
                                                {item.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">{item.description}</p>}
                                                <a href={url} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#26211e] px-4 text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#7d2e3c]">
                                                    {item.price != null && Number(item.price) > 0 ? 'Buy product' : 'Open product'} <Icon name="external" size={14} />
                                                </a>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>

                            {digitalPageCount > 1 && (
                                <div className="mt-7 flex flex-col gap-3 rounded-[1.4rem] border border-stone-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="px-2 text-xs font-bold text-stone-500">
                                        Showing {(digitalPage - 1) * digitalPerPage + 1}-{Math.min(digitalPage * digitalPerPage, digitalLinks.length)} of {digitalLinks.length}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={digitalPage <= 1}
                                            onClick={() => setDigitalPage((page) => Math.max(1, page - 1))}
                                            className="min-h-9 rounded-xl border border-stone-200 px-3 text-xs font-black text-[#26211e] transition hover:bg-[#f4efe9] disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Prev
                                        </button>
                                        {Array.from({ length: digitalPageCount }).map((_, index) => {
                                            const page = index + 1;
                                            return (
                                                <button
                                                    type="button"
                                                    key={page}
                                                    onClick={() => setDigitalPage(page)}
                                                    className={`grid size-9 place-items-center rounded-xl text-xs font-black transition ${digitalPage === page ? 'bg-[#26211e] text-white' : 'border border-stone-200 text-[#26211e] hover:bg-[#f4efe9]'}`}
                                                >
                                                    {page}
                                                </button>
                                            );
                                        })}
                                        <button
                                            type="button"
                                            disabled={digitalPage >= digitalPageCount}
                                            onClick={() => setDigitalPage((page) => Math.min(digitalPageCount, page + 1))}
                                            className="min-h-9 rounded-xl border border-stone-200 px-3 text-xs font-black text-[#26211e] transition hover:bg-[#f4efe9] disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'about' && (
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
                            <div className="space-y-6">
                                <section className="rounded-[1.8rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-7">
                                    <p className="section-eyebrow">About</p>
                                    <h2 className="font-display text-3xl font-normal leading-tight text-[#26211e] sm:text-4xl">Meet {pro.name.split(' ')[0]}</h2>
                                    {pro.bio ? <p className="mt-5 whitespace-pre-line text-sm leading-7 text-stone-600 sm:text-base sm:leading-8">{pro.bio}</p> : <p className="mt-5 text-sm text-stone-500">This professional has not added a bio yet.</p>}
                                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                        {[
                                            ['Profession', pro.profession],
                                            ['Services', `${services.length} listed`],
                                            ['Trust', pro.verified ? 'BPHQ verified' : 'Not verified yet'],
                                        ].map(([label, value]) => (
                                            <div key={label} className="rounded-2xl bg-[#f4efe9] p-4">
                                                <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">{label}</p>
                                                <p className="mt-2 text-sm font-black text-[#26211e]">{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className="rounded-[1.8rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-7">
                                    <div className="flex items-end justify-between gap-4">
                                        <div>
                                            <p className="section-eyebrow">Portfolio</p>
                                            <h2 className="font-display text-3xl font-normal text-[#26211e]">Gallery</h2>
                                        </div>
                                    </div>
                                    {portfolio.length > 0 ? (
                                        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                            {portfolio.slice(0, 7).map((item, index) => (
                                                <figure key={item.id} className={`group relative overflow-hidden rounded-2xl bg-[#f4efe9] ${index === 0 ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square'}`}>
                                                    <img src={item.image} alt={item.title || `${pro.name} portfolio work`} className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                                                    <div className="absolute inset-0 opacity-0 transition group-hover:bg-black/18 group-hover:opacity-100" />
                                                </figure>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-6 rounded-2xl border border-dashed border-stone-200 bg-[#fffdf8] p-6 text-sm leading-6 text-stone-500">Portfolio images will appear here when this professional uploads gallery work.</div>
                                    )}
                                </section>
                            </div>

                            <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
                                <section className="overflow-hidden rounded-[1.8rem] border border-stone-200 bg-white shadow-sm">
                                    <div className="flex items-center gap-2 p-4 pb-3 text-sm font-black text-[#26211e]">
                                        <Icon name="map" size={17} className="text-stone-400" /> Location
                                    </div>
                                    <div className="relative h-56 overflow-hidden bg-[#e8dfd5]">
                                        <iframe
                                            title={`${pro.name} location map`}
                                            src={`https://maps.google.com/maps?q=${encodeURIComponent(pro.location)}&output=embed`}
                                            className="absolute inset-0 size-full border-0"
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-4 p-4">
                                        <p className="min-w-0 truncate text-sm font-semibold text-stone-700">{pro.location}</p>
                                        <a className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#f4efe9] px-4 text-sm font-black text-[#26211e] transition hover:bg-[#eadfd3]" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pro.location)}`} target="_blank" rel="noreferrer">
                                            Get Directions
                                        </a>
                                    </div>
                                </section>

                                <section className="rounded-[1.8rem] border border-stone-200 bg-white p-5 shadow-sm">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="section-eyebrow">Social</p>
                                            <h3 className="font-display text-2xl font-normal text-[#26211e]">Connect</h3>
                                        </div>
                                        <Icon name="external" className="text-[#7d2e3c]" />
                                    </div>
                                    {socialLinks.length ? (
                                        <div className="mt-5 grid grid-cols-2 gap-3">
                                            {socialLinks.map((item) => (
                                                <a key={`${item.label}-${item.url}`} href={safeUrl(item.url)} target="_blank" rel="noreferrer" className="group flex min-h-16 items-center gap-3 rounded-2xl border border-stone-200 bg-[#fffdf8] p-3 transition hover:border-[#7d2e3c]/30 hover:bg-[#f4efe9]">
                                                    <span className="grid size-10 place-items-center rounded-full bg-white text-[#7d2e3c] shadow-sm"><SocialIcon label={item.label} /></span>
                                                    <span className="min-w-0 truncate text-sm font-black capitalize text-[#26211e]">{item.label}</span>
                                                </a>
                                            ))}
                                        </div>
                                    ) : <p className="mt-4 text-sm leading-6 text-stone-500">Social media accounts have not been added yet.</p>}
                                </section>

                                <section className="rounded-[1.8rem] border border-stone-200 bg-[#26211e] p-5 text-white shadow-sm">
                                    <p className="section-eyebrow text-rose-100">Terms</p>
                                    <h3 className="mt-2 font-display text-2xl font-normal">Before you book</h3>
                                    <p className="mt-3 text-sm leading-6 text-white/70">Review booking expectations, cancellation guidance, and customer responsibilities.</p>
                                    <button type="button" onClick={() => setShowTerms(true)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-[#26211e] transition hover:bg-[#f4efe9]">
                                        View terms <Icon name="arrow" size={14} />
                                    </button>
                                </section>
                            </aside>
                        </div>
                    )}

                    {false && activeTab === 'about' && (
                        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
                            <div className="space-y-10">
                                <section className="rounded-[1.8rem] border border-stone-200 bg-white p-6 sm:p-7">
                                    <p className="section-eyebrow">About</p>
                                    <h2 className="section-title">Meet {pro.name.split(' ')[0]}</h2>
                                    {pro.bio ? <p className="mt-4 whitespace-pre-line text-sm leading-7 text-stone-600 sm:text-base sm:leading-8">{pro.bio}</p> : <p className="mt-4 text-sm text-stone-500">This professional has not added a bio yet.</p>}
                                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-2xl bg-[#f4efe9] p-4">
                                            <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Profession</p>
                                            <p className="mt-2 text-sm font-black text-[#26211e]">{pro.profession}</p>
                                        </div>
                                        <div className="rounded-2xl bg-[#f4efe9] p-4">
                                            <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Location</p>
                                            <p className="mt-2 text-sm font-black text-[#26211e]">{pro.location}</p>
                                        </div>
                                        <div className="rounded-2xl bg-[#f4efe9] p-4">
                                            <p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Trust</p>
                                            <p className="mt-2 text-sm font-black text-[#26211e]">{pro.verified ? 'BPHQ verified' : 'Not verified yet'}</p>
                                        </div>
                                    </div>
                                </section>

                                <section className="rounded-[1.8rem] border border-stone-200 bg-white p-6 sm:p-7">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <p className="section-eyebrow">Portfolio / Gallery</p>
                                            <h2 className="section-title">Selected work</h2>
                                        </div>
                                        {portfolioLinks.length > 0 && <a href={safeUrl(portfolioLinks[0].url ?? portfolioLinks[0].link)} target="_blank" rel="noreferrer" className="text-xs font-black uppercase tracking-wide text-[#7d2e3c]">Open portfolio</a>}
                                    </div>
                                    {portfolio.length > 0 ? (
                                        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                            {portfolio.map((item, index) => (
                                                <figure key={item.id} className={`group relative overflow-hidden rounded-2xl bg-rose-50 ${index === 0 ? 'col-span-2 row-span-2 aspect-square sm:col-span-2' : 'aspect-square'}`}>
                                                    <img src={item.image} alt={item.title || `${pro.name} portfolio work`} className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                                                    {item.title && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-plum-950/80 to-transparent p-4 pt-12 text-xs font-bold text-white">{item.title}</figcaption>}
                                                </figure>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-6 rounded-2xl border border-dashed border-stone-200 bg-[#fffdf8] p-6 text-sm leading-6 text-stone-500">Portfolio images will appear here when this professional uploads gallery work.</div>
                                    )}
                                </section>

                                <section className="grid gap-5 md:grid-cols-2">
                                    <div className="rounded-[1.8rem] border border-stone-200 bg-white p-6">
                                        <p className="section-eyebrow">Location</p>
                                        <h2 className="font-display text-3xl font-normal text-[#26211e]">{pro.location}</h2>
                                        <p className="mt-3 text-sm leading-7 text-stone-600">Customers can use this location to understand the provider’s service area before booking.</p>
                                        <a className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-black text-[#26211e] transition hover:bg-[#f4efe9]" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pro.location)}`} target="_blank" rel="noreferrer">
                                            View map <Icon name="external" size={14} />
                                        </a>
                                    </div>

                                    <div className="rounded-[1.8rem] border border-stone-200 bg-white p-6">
                                        <p className="section-eyebrow">Availability</p>
                                        <h2 className="font-display text-3xl font-normal text-[#26211e]">Working hours</h2>
                                        {availability.length ? (
                                            <div className="mt-4 divide-y divide-stone-100">
                                                {dayNames.slice(0, 5).map((day, index) => {
                                                    const rows = availability.filter((item) => String(item.day_of_week).toLowerCase() === day.toLowerCase() || Number(item.day_of_week) === index);
                                                    return <div key={day} className="flex items-start justify-between gap-3 py-2 text-xs"><span className="font-bold text-stone-500">{day.slice(0, 3)}</span><span className="text-right font-black text-[#26211e]">{rows.length ? rows.map((row) => `${displayTime(row.start_time)} - ${displayTime(row.end_time)}`).join(', ') : 'Closed'}</span></div>;
                                                })}
                                            </div>
                                        ) : <p className="mt-3 text-sm leading-7 text-stone-600">Availability will appear here when the provider sets a schedule.</p>}
                                    </div>
                                </section>

                                <section className="rounded-[1.8rem] border border-stone-200 bg-white p-6 sm:p-7">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <p className="section-eyebrow">Services snapshot</p>
                                            <h2 className="section-title">Popular services</h2>
                                        </div>
                                        <button type="button" onClick={() => setActiveTab('booking')} className="text-xs font-black uppercase tracking-wide text-[#7d2e3c]">View booking</button>
                                    </div>
                                    {services.length ? (
                                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                            {services.slice(0, 4).map((service) => (
                                                <button key={service.id} type="button" onClick={() => book(service)} className="rounded-2xl border border-stone-200 bg-[#fffdf8] p-4 text-left transition hover:border-[#15816f]/40 hover:bg-[#f7f4ee]">
                                                    <p className="font-black text-[#26211e]">{service.name}</p>
                                                    <p className="mt-1 text-sm font-black text-[#15816f]">{currency(service.price, service.currency ?? 'NGN')}</p>
                                                </button>
                                            ))}
                                        </div>
                                    ) : <p className="mt-4 text-sm text-stone-500">Services will appear here after the provider publishes them.</p>}
                                </section>
                            </div>

                            <aside className="space-y-5">
                                <div className="rounded-[1.8rem] border border-stone-200 bg-white p-5">
                                    <h3 className="font-display text-lg font-black text-[#26211e]">Profile summary</h3>
                                    <div className="mt-4 space-y-3 text-sm text-stone-600">
                                        <div className="flex justify-between gap-4"><span>Rating</span><span className="font-black text-[#26211e]">{pro.rating ? pro.rating.toFixed(1) : 'New'}</span></div>
                                        <div className="flex justify-between gap-4"><span>Reviews</span><span className="font-black text-[#26211e]">{pro.reviewsCount || reviews.length}</span></div>
                                        <div className="flex justify-between gap-4"><span>Services</span><span className="font-black text-[#26211e]">{services.length}</span></div>
                                        <div className="flex justify-between gap-4"><span>Verified</span><span className="font-black text-[#26211e]">{pro.verified ? 'Yes' : 'No'}</span></div>
                                    </div>
                                </div>

                                {(socialLinks.length > 0 || portfolioLinks.length > 0) && (
                                    <div className="rounded-[1.8rem] border border-stone-200 bg-white p-5">
                                        <h3 className="font-display text-lg font-black text-[#26211e]">Contact & links</h3>
                                        <div className="mt-4 grid gap-2">
                                            {[...socialLinks, ...portfolioLinks].map((item) => <a key={`${item.label}-${item.url}`} href={safeUrl(item.url ?? item.link)} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'secondary', size: 'sm', className: 'justify-between' })}>{item.label} <Icon name="external" size={13} /></a>)}
                                        </div>
                                    </div>
                                )}

                            </aside>
                        </div>
                    )}
                </div>
            </section>

            <div className="fixed inset-x-3 bottom-[calc(max(.75rem,env(safe-area-inset-bottom))+4.75rem)] z-[60] rounded-[1.5rem] border border-stone-200 bg-white/95 p-3 shadow-[0_16px_40px_rgba(38,33,30,.16)] backdrop-blur lg:hidden">
                <Button className="w-full" disabled={!services.length || !canBookDirectly} onClick={() => book()}><Icon name="calendar" size={17} /> Request booking</Button>
            </div>
            <div className="h-36 lg:hidden" />

            {showTerms && (
                <div className="fixed inset-0 z-[85] grid place-items-end overflow-y-auto bg-[#1d120e]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={() => setShowTerms(false)}>
                    <article className="w-full max-w-2xl rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem] sm:p-8" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="section-eyebrow">Terms of service</p>
                                <h2 className="font-display text-3xl font-normal text-[#26211e]">Before booking {pro.name}</h2>
                            </div>
                            <button type="button" onClick={() => setShowTerms(false)} className="grid size-10 place-items-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200" aria-label="Close terms">
                                <Icon name="x" size={18} />
                            </button>
                        </div>
                        <div className="mt-6 space-y-4 text-sm leading-7 text-stone-600">
                            <p>Booking requests are subject to provider confirmation. Your appointment is not confirmed until the provider accepts it from their dashboard.</p>
                            <p>Please arrive on time and provide accurate service details, location context, and any preparation notes requested by the provider.</p>
                            <p>Cancellations, reschedules, deposits, travel fees, and late-arrival policies may vary by provider. Confirm any special terms directly with the provider before your appointment.</p>
                            <p>Payments and external product purchases made through third-party links are handled by the linked platform or provider.</p>
                        </div>
                        <button type="button" onClick={() => setShowTerms(false)} className="mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#26211e] px-5 text-sm font-black text-white transition hover:bg-[#7d2e3c] sm:w-auto">
                            I understand
                        </button>
                    </article>
                </div>
            )}

            <BookingModal open={showBooking && canBookDirectly} onClose={() => setShowBooking(false)} provider={provider} services={services} initialService={bookingService} />
            <ReviewModal open={showReview} onClose={() => setShowReview(false)} providerName={pro.name} onSubmit={submitReview} submitting={reviewSubmitting} />
        </>
    );
}
