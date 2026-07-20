import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { collectionFrom, ensureCsrfCookie, unwrap } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { EmptyState, InlineAlert } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import SectionHeading from '../../components/ui/SectionHeading';
import VerifiedBadge from '../../components/ui/VerifiedBadge';
import { ShuffleHero } from '../../components/ui/shuffle-grid';
import { Marquee } from '../../components/ui/marquee';
import OpportunityEnquiryModal from '../../components/public/OpportunityEnquiryModal';
import Seo from '../../components/Seo';
import { mediaUrl, providerIdentity, shortDate } from '../../lib/utils';

function list(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.items)) return value.items;
    return [];
}

function mergedContent(home, responses) {
    const [newsResponse, eventsResponse, opportunitiesResponse, communityResponse, providersResponse] = responses;
    return {
        ...home,
        news: list(home.news).length ? list(home.news) : collectionFrom(newsResponse),
        events: list(home.events).length ? list(home.events) : collectionFrom(eventsResponse),
        opportunities: list(home.opportunities).length ? list(home.opportunities) : collectionFrom(opportunitiesResponse),
        community_posts: list(home.community_posts ?? home.community).length ? list(home.community_posts ?? home.community) : collectionFrom(communityResponse),
        verified_professionals: list(home.verified_professionals ?? home.providers).length ? list(home.verified_professionals ?? home.providers) : collectionFrom(providersResponse),
    };
}

function LoadingCards({ count = 3, className = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3' }) {
    return (
        <div className={className} aria-hidden="true">
            {Array.from({ length: count }).map((_, index) => (
                <div key={index} className="rounded-3xl border border-stone-200 bg-white p-5">
                    <div className="skeleton h-40 rounded-2xl" />
                    <div className="skeleton mt-5 h-5 w-3/4 rounded-full" />
                    <div className="skeleton mt-3 h-3 w-full rounded-full" />
                    <div className="skeleton mt-2 h-3 w-2/3 rounded-full" />
                </div>
            ))}
        </div>
    );
}

const newsEventFallbacks = [
    'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=900&q=80',
];

const communityFallbackImages = [
    'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?auto=format&fit=crop&w=1000&q=85',
    'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=1000&q=85',
    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1000&q=85',
    'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1000&q=85',
    'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1000&q=85',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=85',
];

const providerCategories = [
    ['all', 'All Categories'],
    ['makeup', 'Makeup Artist'],
    ['hair', 'Hairstylist'],
    ['nail', 'Nail Technician'],
    ['lash', 'Lash Technician'],
    ['skin', 'Esthetician / Skin Specialist'],
    ['barber', 'Barber'],
];

const providerFilters = [
    ['verified', 'Verified Only'],
    ['bridal', 'Bridal Specialist'],
    ['educator', 'Beauty Educator'],
    ['mobile', 'Mobile Service'],
    ['salon', 'Salon Based'],
];

function searchableProviderText(provider) {
    const pro = providerIdentity(provider);
    const services = (pro.services ?? []).map((service) => `${service.name ?? ''} ${service.service_type ?? ''} ${service.description ?? ''}`).join(' ');
    return `${pro.name} ${pro.profession} ${pro.location} ${pro.bio} ${services}`.toLowerCase();
}

function matchesProviderCategory(text, category) {
    if (category === 'all') return true;
    const keywords = {
        makeup: ['makeup', 'make-up', 'mua'],
        hair: ['hair', 'hairstylist', 'stylist', 'wig', 'colourist', 'colorist'],
        nail: ['nail', 'manicure', 'pedicure'],
        lash: ['lash', 'brow', 'eyelash'],
        skin: ['skin', 'esthetician', 'aesthetician', 'skincare', 'facial'],
        barber: ['barber', 'barbing', 'grooming'],
    };
    return (keywords[category] ?? []).some((word) => text.includes(word));
}

function matchesProviderFilters(provider, text, filters) {
    const pro = providerIdentity(provider);
    return filters.every((filter) => {
        if (filter === 'verified') return pro.verified;
        if (filter === 'bridal') return text.includes('bridal') || text.includes('wedding');
        if (filter === 'educator') return text.includes('educator') || text.includes('training') || text.includes('academy');
        if (filter === 'mobile') return text.includes('mobile') || text.includes('home service');
        if (filter === 'salon') return text.includes('salon') || text.includes('studio');
        return true;
    });
}

function NewsEventCard({ item, index }) {
    const kind = item._kind === 'event' ? 'event' : 'news';
    const date = item.date ?? item.published_at ?? item.created_at;
    const image = mediaUrl(item.image_url ?? item.image) ?? newsEventFallbacks[index % newsEventFallbacks.length];
    const copy = item.excerpt ?? item.description ?? item.content;
    const cta = kind === 'event' ? 'Register Now' : 'Read More';
    const href = item.slug ? `/news-events/${kind === 'event' ? 'events' : 'news'}/${item.slug}` : '/news-events';

    return (
        <article className="group relative flex h-[320px] overflow-hidden rounded-lg bg-[#34231c] text-white shadow-[0_16px_40px_rgba(45,29,22,.12)]">
            <img src={image} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/30 to-black/72" />
            <div className="relative z-10 flex h-full flex-col p-6">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide">
                    <span className="rounded-sm bg-white/90 px-2 py-1 text-[#34231c]">{kind === 'event' ? 'Event' : 'News'}</span>
                    {date && <span className="text-white/78">{shortDate(date, { year: 'numeric' })}</span>}
                </div>
                <h3 className="mt-7 max-w-[15rem] font-display text-2xl font-normal leading-tight">{item.title}</h3>
                {copy && <p className="mt-4 line-clamp-2 max-w-[13rem] text-xs font-semibold leading-5 text-white/82">{copy}</p>}
                <Link to={href} className="mt-auto inline-flex w-fit items-center gap-2 text-xs font-black uppercase tracking-wide text-white">
                    {cta} <Icon name="arrow" size={14} />
                </Link>
            </div>
        </article>
    );
}

function VerifiedProfessionalCard({ provider }) {
    const pro = providerIdentity(provider);
    const reviews = pro.reviewsCount || provider.reviews_count || provider.review_count || 0;

    return (
        <article className="group relative min-h-[330px] overflow-hidden rounded-lg bg-[#34231c] text-white shadow-[0_16px_40px_rgba(45,29,22,.14)]">
            {pro.photo ? <img src={pro.photo} alt={pro.name} className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="absolute inset-0 bg-gradient-to-br from-[#806c5d] to-[#2f211b]" />}
            <div className="absolute inset-0 bg-gradient-to-b from-black/12 via-black/12 to-black/78" />
            <div className="relative z-10 flex min-h-[330px] flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                    <VerifiedBadge show={pro.verified} size="md" className="rounded-full bg-white/90 p-0.5 shadow-sm" />
                    <span className="ml-auto rounded-sm border border-white/55 p-1.5 text-white/80"><Icon name="heart" size={15} /></span>
                </div>
                <div className="mt-auto">
                    <h3 className="flex min-w-0 items-center gap-2 font-display text-2xl font-normal leading-tight">
                        <span className="truncate">{pro.name}</span>
                        <VerifiedBadge show={pro.verified} size="md" className="shrink-0" />
                    </h3>
                    <p className="mt-2 text-xs font-bold text-white/82">{pro.profession}</p>
                    <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-white/78"><Icon name="map" size={13} />{pro.location}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1 text-xs font-black text-white"><Icon name="star" size={13} fill="currentColor" strokeWidth={0} className="text-amber-400" />{pro.rating ? pro.rating.toFixed(1) : 'New'} {reviews ? `(${reviews})` : ''}</span>
                        <Link to={`/providers/${pro.slug}`} className="inline-flex min-h-10 items-center justify-center rounded border border-white/20 bg-black/28 px-4 text-[10px] font-black uppercase tracking-wide text-white backdrop-blur transition hover:bg-black/45">
                            View Profile
                        </Link>
                    </div>
                </div>
            </div>
        </article>
    );
}

export default function HomePage() {
    const toast = useToast();
    const railRef = useRef(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [email, setEmail] = useState('');
    const [newsletterLoading, setNewsletterLoading] = useState(false);
    const [opportunity, setOpportunity] = useState(null);
    const [showAllNewsEvents, setShowAllNewsEvents] = useState(false);
    const [showAllCommunity, setShowAllCommunity] = useState(false);
    const [providerCategory, setProviderCategory] = useState('all');
    const [activeProviderFilters, setActiveProviderFilters] = useState(['verified']);
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [homeResult, ...results] = await Promise.allSettled([
                api.get('/home'),
                api.get('/news', { params: { per_page: 6 } }),
                api.get('/events', { params: { per_page: 6 } }),
                api.get('/opportunities', { params: { per_page: 4 } }),
                api.get('/community-posts', { params: { per_page: 8 } }),
                api.get('/providers', { params: { verified: 1, per_page: 6 } }),
            ]);
            if (homeResult.status === 'rejected') throw homeResult.reason;
            const home = unwrap(homeResult.value) ?? {};
            const successfulResponses = results.map((result) => result.status === 'fulfilled' ? result.value : undefined);
            setData(mergedContent(home, successfulResponses));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || 'We could not load BeautyPro HQ right now.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const verified = useMemo(() => list(data?.verified_professionals ?? data?.featured_providers), [data]);
    const newsAndEvents = useMemo(() => [
        ...list(data?.news).map((item) => ({ ...item, _kind: 'news' })),
        ...list(data?.events).map((item) => ({ ...item, _kind: 'event' })),
    ].sort((a, b) => new Date(b.published_at ?? b.date ?? 0) - new Date(a.published_at ?? a.date ?? 0)), [data]);
    const proOfWeek = data?.pro_of_the_week ?? data?.pro_of_week ?? data?.featured_professional ?? null;
    const community = list(data?.community_posts ?? data?.community);
    const opportunities = list(data?.opportunities);
    const partners = list(data?.partner_brands ?? data?.partners);
    const displayPartners = partners.length ? partners : ['GlowLab', 'LuxeSkin', 'Beauty Business Africa', 'NailPro Collective', 'StyleHouse', 'BPHQ Academy'];
    const visibleNewsAndEvents = showAllNewsEvents ? newsAndEvents : newsAndEvents.slice(0, 8);
    const visibleCommunity = showAllCommunity ? community : community.slice(0, 4);
    const filteredVerifiedProviders = useMemo(() => {
        return verified.filter((provider) => {
            const text = searchableProviderText(provider);
            return matchesProviderCategory(text, providerCategory) && matchesProviderFilters(provider, text, activeProviderFilters);
        });
    }, [activeProviderFilters, providerCategory, verified]);

    function toggleProviderFilter(filter) {
        setActiveProviderFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]);
    }

    async function subscribe(event) {
        event.preventDefault();
        setNewsletterLoading(true);
        try {
            await ensureCsrfCookie();
            const response = await api.post('/newsletter/subscribe', { email });
            toast.success(response?.data?.message || 'You are on the BeautyPro HQ list.');
            setEmail('');
        } catch (requestError) {
            toast.error(requestError?.response?.data?.message || 'We could not add you right now.');
        } finally {
            setNewsletterLoading(false);
        }
    }


    return (
        <>
            <Seo
                title="The Beauty Service Ecosystem"
                description="Discover trusted beauty professionals, stay updated on industry news and events, and connect with opportunities across the beauty industry."
            />
            <ShuffleHero providers={verified} />

            {error && (
                <div className="page-container py-6">
                    <InlineAlert>
                        {error} <button type="button" onClick={load} className="font-black underline underline-offset-2">Try again</button>
                    </InlineAlert>
                </div>
            )}

            {proOfWeek && (() => {
                const pro = providerIdentity(proOfWeek);
                const quote = pro.raw?.spotlight_quote ?? pro.raw?.quote ?? pro.bio;
                return (
                    <section className="bg-[linear-gradient(#f4efe9_0%_50%,#fff_50%_100%)] py-12 sm:py-16">
                        <div className="page-container overflow-hidden rounded-xl bg-white shadow-[0_18px_55px_rgba(60,38,29,.08)] ring-1 ring-stone-200/70">
                            <div className="grid md:grid-cols-[1fr_1fr]">
                                <div className="relative min-h-72 bg-[#e8d9cf] md:min-h-[360px]">
                                    {pro.photo ? <img src={pro.photo} alt={pro.name} className="absolute inset-0 size-full object-cover object-center" /> : <div className="absolute inset-0 grid place-items-center"><Avatar name={pro.name} size="xl" className="scale-125" /></div>}
                                </div>
                                <div className="flex flex-col justify-center px-7 py-9 sm:px-10 lg:px-14">
                                    <p className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[.16em] text-[#8b4b59]">
                                        <span className="h-px w-12 bg-[#b98a92]" /> Pro of the week
                                    </p>
                                    <div className="mt-5 flex flex-wrap items-center gap-2">
                                        <h2 className="font-display text-3xl font-semibold leading-tight text-[#3b2921] sm:text-4xl">{pro.name}</h2>
                                        {pro.verified && <Icon name="shield" size={18} className="text-amber-500" />}
                                    </div>
                                    {false && (
                                    <p className="mt-2 text-sm font-bold text-rose-200">{pro.profession} · {pro.location}</p>
                                    )}
                                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-stone-500">
                                        <span>{pro.profession}</span>
                                        <span className="inline-flex items-center gap-1"><Icon name="map" size={13} />{pro.location}</span>
                                    </div>
                                    {quote && <p className="mt-6 border-l border-rose-200 pl-5 font-display text-xl font-semibold italic leading-snug text-[#9b4e5d] sm:text-2xl">"{quote}"</p>}
                                    <div className="mt-8 flex flex-wrap gap-3">
                                        <Link to={`/providers/${pro.slug}#about`} className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#7d2e3c] px-7 text-xs font-black text-white transition hover:bg-[#682533]">
                                            Read Story <Icon name="arrow" size={14} />
                                        </Link>
                                        <Link to={`/providers/${pro.slug}`} className="inline-flex min-h-11 items-center justify-center border border-rose-200 bg-white px-7 text-xs font-black text-[#8b4b59] transition hover:bg-rose-50">
                                            View Profile
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                );
            })()}

            <section id="news-events" className="overflow-hidden bg-white py-7 sm:py-20">
                <div className="page-container">
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <h2 className="text-sm font-black uppercase tracking-wide text-[#34231c]">News & Events</h2>
                        {newsAndEvents.length > 0 && (
                            <Link to="/news-events" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#34231c]">
                                View All News & Events <Icon name="arrow" size={14} />
                            </Link>
                        )}
                    </div>
                    <div className="relative">
                        {newsAndEvents.length > 3 && (
                            <>
                                <button type="button" onClick={() => railRef.current?.scrollBy({ left: -340, behavior: 'smooth' })} className="absolute -left-4 top-1/2 z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-[#8b7a70] shadow-[0_10px_28px_rgba(45,29,22,.12)] ring-1 ring-stone-200 md:grid" aria-label="Previous news and events"><Icon name="chevronLeft" size={18} /></button>
                                <button type="button" onClick={() => railRef.current?.scrollBy({ left: 340, behavior: 'smooth' })} className="absolute -right-4 top-1/2 z-20 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-[#8b7a70] shadow-[0_10px_28px_rgba(45,29,22,.12)] ring-1 ring-stone-200 md:grid" aria-label="Next news and events"><Icon name="chevronRight" size={18} /></button>
                            </>
                        )}
                        {loading ? <LoadingCards count={4} className="grid gap-4 md:grid-cols-4" /> : newsAndEvents.length ? <div ref={railRef} className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">{visibleNewsAndEvents.map((item, index) => <div key={`${item._kind}-${item.id ?? index}`} className="w-[78vw] shrink-0 snap-start sm:w-[315px]"><NewsEventCard item={item} index={index} /></div>)}</div> : <EmptyState icon="calendar" title="More updates are on the way" message="News and event posts will appear here as they are published." />}
                    </div>
                </div>
            </section>

            <section className="border-y border-stone-200/70 bg-[#f8f3ee] py-8 sm:py-20">
                <div className="page-container">
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="font-display text-2xl font-semibold uppercase leading-tight text-[#34231c]">Verified Beauty Professionals</h2>
                                <Icon name="shield" size={18} className="text-[#7f7068]" />
                            </div>
                            <p className="mt-1 text-xs font-bold text-[#6f625b]">Trusted. Verified. Recommended.</p>
                        </div>
                        <Link to="/directory" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#34231c]">Explore Directory <Icon name="arrow" size={14} /></Link>
                    </div>

                    <div className="mb-6 flex items-center gap-2 overflow-x-auto border-y border-[#ded2c7] py-3 scrollbar-none">
                        {providerCategories.map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setProviderCategory(value)} className={`min-h-9 shrink-0 rounded-full px-4 text-[11px] font-black uppercase tracking-wide transition ${providerCategory === value ? 'bg-[#34231c] text-white' : 'bg-white/70 text-[#6f625b] ring-1 ring-[#ded2c7] hover:bg-white'}`}>
                                {label}
                            </button>
                        ))}
                        <span className="mx-1 h-7 w-px shrink-0 bg-[#ded2c7]" aria-hidden="true" />
                        {providerFilters.map(([value, label]) => (
                            <button key={value} type="button" onClick={() => toggleProviderFilter(value)} className={`min-h-9 shrink-0 rounded-full px-4 text-[11px] font-black uppercase tracking-wide transition ${activeProviderFilters.includes(value) ? 'bg-[#34231c] text-white' : 'bg-white/70 text-[#6f625b] ring-1 ring-[#ded2c7] hover:bg-white'}`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {loading ? <LoadingCards count={6} /> : filteredVerifiedProviders.length ? <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3">{filteredVerifiedProviders.slice(0, 6).map((provider) => <div key={provider.id ?? provider.slug ?? provider.user_id} className="w-[72vw] shrink-0 snap-start sm:w-auto"><VerifiedProfessionalCard provider={provider} /></div>)}</div> : <EmptyState title="No verified professionals found" message="Try another service, location, or filter combination." />}

                    <div className="mt-7 text-center">
                        <Link to="/directory" className="inline-flex min-h-12 min-w-[280px] items-center justify-center gap-2 rounded-md border border-[#c9bdb2] bg-white px-8 text-xs font-black uppercase tracking-wide text-[#34231c] transition hover:bg-[#fdfaf6]">
                            Explore Directory <Icon name="arrow" size={14} />
                        </Link>
                    </div>
                </div>
            </section>

            <section className="relative isolate overflow-hidden bg-[#231812] py-20 text-white sm:py-28">
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(148,72,88,.34),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(244,239,233,.18),transparent_24%),linear-gradient(135deg,#2a1b14_0%,#160f0c_54%,#3d1c26_100%)]" />
                <div className="absolute inset-x-0 top-0 -z-10 h-px bg-white/15" />
                <div className="page-container">
                    <div className="grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-end">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[.22em] text-rose-200">Why Join BPHQ</p>
                            <h2 className="mt-4 max-w-xl font-display text-4xl font-normal leading-[1.02] sm:text-5xl lg:text-6xl">
                                Built for beauty professionals ready to move differently.
                            </h2>
                            <p className="mt-5 max-w-lg text-sm leading-7 text-white/68">
                                BeautyPro HQ gives providers and customers one connected place to build trust, manage bookings, and find real opportunities in the beauty industry.
                            </p>
                            <div className="mt-8 flex flex-wrap gap-3">
                                <Link to="/register?role=provider" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-xs font-black uppercase tracking-wide text-[#2a1b14] transition hover:-translate-y-0.5 hover:bg-[#f4efe9]">
                                    Join BPHQ <Icon name="arrow" size={15} />
                                </Link>
                                <Link to="/directory" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/20 px-6 text-xs font-black uppercase tracking-wide text-white transition hover:-translate-y-0.5 hover:bg-white/10">
                                    Explore Directory <Icon name="arrow" size={15} />
                                </Link>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                ['users', 'Connect', 'Build meaningful relationships within the beauty industry.'],
                                ['search', 'Discover', 'Increase visibility and get discovered by customers.'],
                                ['chart', 'Grow', 'Manage clients, bookings, rewards and payments.'],
                                ['briefcase', 'Thrive', 'Access resources, tools and opportunities designed to support long-term success.'],
                            ].map(([icon, title, copy], index) => (
                                <article key={title} className="group relative min-h-56 overflow-hidden rounded-3xl border border-white/10 bg-white/[.07] p-6 shadow-[0_24px_70px_rgba(0,0,0,.22)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-rose-200/35 hover:bg-white/[.11]">
                                    <div className="absolute -right-10 -top-10 size-28 rounded-full bg-rose-200/10 blur-2xl transition duration-300 group-hover:bg-rose-200/20" />
                                    <div className="flex items-center justify-between">
                                        <span className="grid size-12 place-items-center rounded-2xl bg-white text-[#3d1c26] transition duration-300 group-hover:scale-105 group-hover:bg-rose-100">
                                            <Icon name={icon} size={21} />
                                        </span>
                                        <span className="font-display text-5xl font-normal leading-none text-white/10">0{index + 1}</span>
                                    </div>
                                    <h3 className="mt-8 font-display text-3xl font-normal leading-none text-white">{title}</h3>
                                    <p className="mt-4 max-w-sm text-sm font-medium leading-7 text-white/68">{copy}</p>
                                    <div className="absolute inset-x-6 bottom-0 h-px origin-left scale-x-0 bg-rose-200/70 transition duration-300 group-hover:scale-x-100" />
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {false && (
            <section className="py-20 sm:py-28">
                <div className="page-container">
                    <SectionHeading eyebrow="Made for both sides of beauty" title="One platform. Better beauty experiences." description="Whether you provide the service or book it, BeautyPro HQ keeps the important details close." align="center" />
                    <div className="mx-auto mb-8 flex w-fit rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm" role="tablist">
                        <button type="button" onClick={() => setAudience('provider')} className={`min-h-10 rounded-xl px-5 text-sm font-black transition ${audience === 'provider' ? 'bg-plum-900 text-white shadow-sm' : 'text-stone-500 hover:text-plum-900'}`}>For providers</button>
                        <button type="button" onClick={() => setAudience('customer')} className={`min-h-10 rounded-xl px-5 text-sm font-black transition ${audience === 'customer' ? 'bg-plum-900 text-white shadow-sm' : 'text-stone-500 hover:text-plum-900'}`}>For customers</button>
                    </div>
                    <div className="grid gap-5 md:grid-cols-3">
                        {(audience === 'provider' ? [
                            ['user', 'A profile that sells your craft', 'Show your services, work, location, reviews, and trusted verification in one polished profile.'],
                            ['calendar', 'Bookings without the back-and-forth', 'Publish availability and manage requests, confirmations, and customer notes from one dashboard.'],
                            ['chart', 'Tools that help you grow', 'Use CRM, loyalty, payments, digital products, and useful analytics as your business expands.'],
                        ] : [
                            ['search', 'Discover the right professional', 'Search by name, service, location, rating, and verification—then compare with confidence.'],
                            ['calendar', 'Request a real available time', 'Choose a service and open time directly from the provider profile, with every update in your portal.'],
                            ['heart', 'Keep your favourites close', 'Track bookings and rewards while building lasting relationships with professionals you trust.'],
                        ]).map(([icon, title, copy], index) => (
                            <article key={title} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_12px_36px_rgba(70,28,54,.06)] sm:p-7">
                                <div className="flex items-center justify-between"><span className="grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-700"><Icon name={icon} /></span><span className="font-display text-4xl font-black text-stone-100">0{index + 1}</span></div>
                                <h3 className="mt-6 font-display text-xl font-black text-plum-950">{title}</h3><p className="mt-3 text-sm leading-7 text-stone-600">{copy}</p>
                            </article>
                        ))}
                    </div>
                    <div className="mt-8 text-center"><Link to={`/register?role=${audience}`} className={buttonClass({ size: 'lg' })}>{audience === 'provider' ? 'Grow your beauty business' : 'Create a customer account'} <Icon name="arrow" size={17} /></Link></div>
                </div>
            </section>

            )}

            <section id="opportunities" className="relative overflow-hidden bg-[#f4efe9] py-20 sm:py-28">
                <div className="page-container relative">
                    <div className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[.22em] text-[#8b4b59]">Opportunities</p>
                            <h2 className="mt-4 max-w-3xl font-display text-4xl font-normal leading-tight text-[#34231c] sm:text-5xl lg:text-6xl">Find the next door into the beauty industry.</h2>
                            <p className="mt-5 max-w-xl text-sm font-medium leading-7 text-[#6f625b]">
                                Opportunities submitted through the Get In Touch flow, reviewed and surfaced for beauty professionals ready to collaborate, speak, partner, and grow.
                            </p>
                        </div>
                        <Link to="/opportunities" className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full bg-rose-600 px-7 text-sm font-bold text-white shadow-[0_10px_24px_rgba(216,86,124,.2)] transition hover:bg-rose-700">
                            View Opportunities <Icon name="arrow" size={16} />
                        </Link>
                    </div>

                    <div className="rounded-[2rem] border border-[#ded2c7] bg-[#fbf8f4] p-3 shadow-[0_22px_70px_rgba(52,35,28,.10)] sm:p-4">
                        {loading ? (
                            <LoadingCards count={4} className="grid gap-3 md:grid-cols-2" />
                        ) : opportunities.length ? (
                            <div className="grid gap-3">
                                {opportunities.slice(0, 5).map((item, index) => (
                                    <article key={item.id} className="group grid gap-4 rounded-[1.4rem] border border-transparent bg-white p-5 transition duration-300 hover:-translate-y-0.5 hover:border-[#c9bdb2] hover:shadow-[0_18px_50px_rgba(52,35,28,.08)] md:grid-cols-[88px_1fr_auto] md:items-center">
                                        <div className="flex items-center gap-4 md:block">
                                            <span className="grid size-14 place-items-center rounded-2xl bg-[#f4efe9] font-display text-2xl font-normal text-[#7d2e3c]">{String(index + 1).padStart(2, '0')}</span>
                                            <span className="md:hidden text-[10px] font-black uppercase tracking-wide text-[#8b4b59]">{item.type ?? 'Opportunity'}</span>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="hidden md:flex flex-wrap items-center gap-2">
                                                <span className="text-[10px] font-black uppercase tracking-wide text-[#8b4b59]">{item.type ?? 'Opportunity'}</span>
                                                {item.deadline && <span className="text-[11px] font-bold text-stone-400">Closes {shortDate(item.deadline)}</span>}
                                            </div>
                                            <h3 className="mt-1 font-display text-2xl font-normal leading-tight text-[#34231c]">{item.title ?? item.type}</h3>
                                            <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-[#6f625b]">{item.description}</p>
                                        </div>
                                        <button type="button" onClick={() => setOpportunity(item)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#34231c] px-5 text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#4a2f26] md:justify-self-end">
                                            Get In Touch <Icon name="arrow" size={14} />
                                        </button>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <EmptyState title="New opportunities are being reviewed" message="Approved opportunities submitted through Get In Touch will appear here." />
                        )}
                    </div>
                </div>
            </section>

            {false && (
            <section className="py-20 sm:py-28">
                <div className="page-container">
                    <SectionHeading eyebrow="Open doors" title="Opportunities for beauty talent" description="Find collaborations, jobs, training, and brand opportunities—then send your interest directly." />
                    {loading ? <LoadingCards count={4} className="grid gap-5 md:grid-cols-2" /> : opportunities.length ? <div className="grid gap-5 md:grid-cols-2">{opportunities.slice(0, 6).map((item) => <article key={item.id} className="group rounded-3xl border border-stone-200 bg-white p-6 transition hover:border-rose-200 hover:shadow-[0_18px_45px_rgba(70,28,54,.08)] sm:p-7"><div className="flex items-start justify-between gap-4"><Badge tone="plum">{item.type ?? 'Opportunity'}</Badge>{item.deadline && <span className="text-xs font-bold text-stone-400">Closes {shortDate(item.deadline)}</span>}</div><h3 className="mt-5 font-display text-xl font-black text-plum-950">{item.title ?? item.type}</h3><p className="mt-2 line-clamp-3 text-sm leading-7 text-stone-600">{item.description}</p><Button variant="ghost" className="mt-5 -ml-3 text-rose-700" onClick={() => setOpportunity(item)}>Get in touch <Icon name="arrow" size={16} /></Button></article>)}</div> : <EmptyState title="New opportunities are being reviewed" message="Approved opportunities will be published here." />}
                </div>
            </section>

            )}

            <section id="community" className="relative isolate overflow-hidden bg-white py-20 sm:py-28">
                <div className="absolute -left-24 top-20 -z-10 size-72 rounded-full bg-[#eadfd5]/55 blur-3xl" />
                <div className="absolute -right-24 bottom-12 -z-10 size-80 rounded-full bg-[#f0dfe2]/35 blur-3xl" />
                <div className="page-container">
                    <div className="mx-auto mb-10 max-w-3xl text-center">
                        <p className="text-xs font-black uppercase tracking-[.22em] text-[#8b4b59]">Community</p>
                        <h2 className="mt-4 font-display text-4xl font-normal leading-tight text-[#34231c] sm:text-5xl lg:text-6xl">Stories, wins, and real beauty business moments.</h2>
                        <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-7 text-[#6f625b]">
                                Community-driven content from members, spotlights, success stories, events, and day-in-the-life features.
                        </p>
                    </div>

                    {loading ? (
                        <LoadingCards count={4} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" />
                    ) : community.length ? (
                        <>
                            <div className="overflow-hidden rounded-[2rem] border border-[#ded2c7] bg-white shadow-[0_28px_90px_rgba(52,35,28,.10)]">
                                <div className="grid lg:grid-cols-[1.08fr_.92fr]">
                                    <article className="group relative min-h-[520px] overflow-hidden">
                                        <img src={mediaUrl(community[0].image_url ?? community[0].image) ?? communityFallbackImages[0]} alt="" className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-[1.04]" />
                                        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/15 to-black/72" />
                                        <div className="relative flex min-h-[520px] flex-col p-7 text-white sm:p-10">
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#34231c]">{community[0].type ? String(community[0].type).replaceAll('_', ' ') : 'Community story'}</span>
                                                <span className="grid size-11 place-items-center rounded-full bg-white/15 backdrop-blur"><Icon name="quote" size={20} /></span>
                                            </div>
                                            <div className="mt-auto max-w-xl">
                                                <h3 className="font-display text-4xl font-normal leading-tight sm:text-5xl">{community[0].title}</h3>
                                                <p className="mt-5 line-clamp-3 text-sm font-semibold leading-7 text-white/78">{community[0].excerpt ?? community[0].content}</p>
                                                <Link to={community[0].id ? `/community/${community[0].id}` : '/community'} className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-xs font-black uppercase tracking-wide text-[#34231c] transition hover:bg-[#f4efe9]">
                                                    Read Story <Icon name="arrow" size={14} />
                                                </Link>
                                            </div>
                                        </div>
                                    </article>

                                    <div className="grid divide-y divide-[#eadfd5]">
                                        {visibleCommunity.slice(1, 4).map((item, index) => (
                                            <Link to={item.id ? `/community/${item.id}` : '/community'} key={item.id} className="group grid min-h-[172px] grid-cols-[120px_1fr] gap-4 p-4 transition hover:bg-[#fbf7f1] sm:grid-cols-[170px_1fr] sm:p-5">
                                                <div className="overflow-hidden rounded-2xl bg-[#f4efe9]">
                                                    <img src={mediaUrl(item.image_url ?? item.image) ?? communityFallbackImages[(index + 1) % communityFallbackImages.length]} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.06]" />
                                                </div>
                                                <div className="flex min-w-0 flex-col justify-center">
                                                    <span className="text-[10px] font-black uppercase tracking-wide text-[#8b4b59]">{item.type ? String(item.type).replaceAll('_', ' ') : 'Community story'}</span>
                                                    <h3 className="mt-2 line-clamp-2 font-display text-2xl font-normal leading-tight text-[#34231c]">{item.title}</h3>
                                                    <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-[#6f625b]">{item.excerpt ?? item.content}</p>
                                                    <span className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#7d2e3c]">Read Story <Icon name="arrow" size={14} /></span>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {visibleCommunity.length > 4 && (
                                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    {visibleCommunity.slice(4).map((item, index) => (
                                        <Link to={item.id ? `/community/${item.id}` : '/community'} key={item.id} className="group overflow-hidden rounded-3xl border border-[#ded2c7] bg-white shadow-[0_18px_50px_rgba(52,35,28,.07)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(52,35,28,.12)]">
                                            <div className="aspect-[4/3] overflow-hidden bg-[#f4efe9]">
                                                <img src={mediaUrl(item.image_url ?? item.image) ?? communityFallbackImages[(index + 4) % communityFallbackImages.length]} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.06]" />
                                            </div>
                                            <div className="p-5">
                                                <span className="text-[10px] font-black uppercase tracking-wide text-[#8b4b59]">{item.type ? String(item.type).replaceAll('_', ' ') : 'Community story'}</span>
                                                <h3 className="mt-3 line-clamp-2 font-display text-xl font-normal leading-tight text-[#34231c]">{item.title}</h3>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}

                            {!showAllCommunity && community.length > 4 && (
                                <div className="mt-8 text-center">
                                    <Link to="/community" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#34231c] px-7 text-xs font-black uppercase tracking-wide text-white transition hover:-translate-y-0.5 hover:bg-[#4a2f26]">
                                        View Community Stories <Icon name="arrow" size={15} />
                                    </Link>
                                </div>
                            )}
                        </>
                    ) : (
                        <EmptyState title="Community stories are coming soon" message="Approved spotlights, wins, event coverage, and day-in-the-life features will appear here." />
                    )}
                </div>
            </section>

            <section className="overflow-hidden bg-[#f4efe9] py-14 sm:py-18">
                <div className="page-container">
                    <div className="mb-7 flex flex-col gap-3 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[.18em] text-[#8b4b59]">Partner brands & community allies</p>
                            <h2 className="mt-2 font-display text-3xl font-normal leading-tight text-[#34231c]">Connected with brands shaping beauty.</h2>
                        </div>
                        {!partners.length && (
                            <a href="mailto:partners@beautyprohq.com" className="inline-flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wide text-[#7d2e3c]">
                                Become a partner <Icon name="arrow" size={15} />
                            </a>
                        )}
                    </div>
                </div>

                <Marquee pauseOnHover speed={28} className="py-6" trackClassName="gap-14">
                    {displayPartners.map((partner, index) => {
                        const logo = mediaUrl(partner.logo_url ?? partner.logo);
                        const name = partner.name ?? partner;
                        return (
                            <div key={partner.id ?? name ?? index} className="flex h-12 min-w-max items-center justify-center">
                                {logo ? (
                                    <img src={logo} alt={name} className="max-h-9 max-w-40 object-contain grayscale opacity-70 transition hover:grayscale-0 hover:opacity-100" />
                                ) : (
                                    <span className="font-display text-2xl font-normal text-[#6f625b]/75">{name}</span>
                                )}
                            </div>
                        );
                    })}
                </Marquee>
            </section>

            <section className="bg-[#f4efe9] py-20 sm:py-24">
                <div className="page-container">
                    <div className="newsletter-panel overflow-hidden rounded-[34px] px-6 py-10 text-white sm:px-10 sm:py-14 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-14">
                        <div className="max-w-xl"><p className="text-xs font-black uppercase tracking-[.18em] text-rose-200">The beauty brief</p><h2 className="mt-3 font-display text-3xl font-black sm:text-4xl">Fresh opportunities, useful news, zero clutter.</h2><p className="mt-3 text-sm leading-7 text-plum-100">Get the best of BeautyPro HQ delivered to your inbox.</p></div>
                        <form onSubmit={subscribe} className="mt-7 flex w-full max-w-lg flex-col gap-2 rounded-2xl bg-white/10 p-2 ring-1 ring-white/15 sm:flex-row lg:mt-0"><label className="flex min-h-12 flex-1 items-center gap-2 px-3"><Icon name="mail" size={18} className="text-rose-200" /><span className="sr-only">Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-plum-300" /></label><Button type="submit" variant="rose" disabled={newsletterLoading}>{newsletterLoading ? 'Joining…' : 'Join the list'}</Button></form>
                    </div>
                </div>
            </section>

            {opportunity && <OpportunityEnquiryModal opportunity={opportunity} onClose={() => setOpportunity(null)} />}
        </>
    );
}
