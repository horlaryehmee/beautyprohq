import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { collectionFrom } from '../../lib/api';
import Button from '../../components/ui/Button';
import { EmptyState, InlineAlert } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import Seo from '../../components/Seo';
import { mediaUrl, shortDate } from '../../lib/utils';

const fallbackImages = [
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
];

const fallbackNews = [
    {
        id: 'fallback-news-1',
        title: 'Beauty professionals shaping the future of service',
        excerpt: 'Stories, resources, and practical updates for beauty businesses will appear here.',
        content: 'BeautyPro HQ will publish stories, resources, and practical updates for beauty professionals here.',
        image: fallbackImages[0],
        fallback: true,
    },
    {
        id: 'fallback-news-2',
        title: 'Business tips for growing beauty professionals',
        excerpt: 'Useful guidance for bookings, client care, profile building, and growth.',
        content: 'Useful guidance for bookings, client care, profile building, and growth will appear as articles are published.',
        image: fallbackImages[2],
        fallback: true,
    },
];

const fallbackEvents = [
    {
        id: 'fallback-event-1',
        title: 'Workshops, launches, and community events',
        description: 'Upcoming BeautyPro HQ events and industry gatherings will be published here.',
        location: 'BeautyPro HQ',
        image: fallbackImages[1],
        fallback: true,
    },
    {
        id: 'fallback-event-2',
        title: 'Member spotlights and industry sessions',
        description: 'Check back for featured sessions, networking moments, and learning opportunities.',
        location: 'BeautyPro HQ',
        image: fallbackImages[3],
        fallback: true,
    },
];

function normalize(item, kind, index) {
    const date = item.date ?? item.published_at ?? item.created_at;

    return {
        ...item,
        kind,
        date,
        sortDate: date ? new Date(date).getTime() : 0,
        image: mediaUrl(item.image_url ?? item.image) ?? fallbackImages[index % fallbackImages.length],
        summary: item.excerpt ?? item.description ?? item.content,
        cta: kind === 'event' ? 'View event' : 'Read more',
        href: item.slug ? `/news-events/${kind === 'event' ? 'events' : 'news'}/${item.slug}` : null,
    };
}

function FeaturedCard({ item, onOpen }) {
    if (!item) return null;

    return (
        <article className="group relative flex min-h-[360px] overflow-hidden rounded-lg bg-[#34231c] text-white shadow-[0_16px_40px_rgba(45,29,22,.12)] sm:min-h-[430px]">
            <img src={item.image} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/25 to-black/76" />
            <div className="relative z-10 flex h-full min-h-[360px] flex-col p-6 sm:min-h-[430px] sm:p-8">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide">
                    <span className="rounded-sm bg-white/90 px-2 py-1 text-[#34231c]">{item.kind === 'event' ? 'Event' : 'News'}</span>
                    {item.date && <span className="text-white/78">{shortDate(item.date, { year: 'numeric' })}</span>}
                </div>
                <h2 className="mt-auto max-w-2xl font-display text-4xl font-normal leading-tight sm:text-5xl">{item.title}</h2>
                {item.summary && <p className="mt-4 line-clamp-2 max-w-xl text-sm font-semibold leading-6 text-white/82">{item.summary}</p>}
                <button type="button" onClick={() => onOpen(item)} className="mt-6 inline-flex w-fit items-center gap-2 text-xs font-black uppercase tracking-wide text-white">
                    {item.cta} <Icon name="arrow" size={14} />
                </button>
            </div>
        </article>
    );
}

function UpdateCard({ item, onOpen }) {
    return (
        <article className="group relative flex h-[320px] overflow-hidden rounded-lg bg-[#34231c] text-white shadow-[0_16px_40px_rgba(45,29,22,.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(52,35,28,.14)]">
            <img src={item.image} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/30 to-black/72" />
            <div className="relative z-10 flex h-full flex-col p-6">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide">
                    <span className="rounded-sm bg-white/90 px-2 py-1 text-[#34231c]">{item.kind === 'event' ? 'Event' : 'News'}</span>
                    {item.date && <span className="text-white/78">{shortDate(item.date, { year: 'numeric' })}</span>}
                </div>
                <h3 className="mt-7 max-w-[15rem] font-display text-2xl font-normal leading-tight">{item.title}</h3>
                {item.summary && <p className="mt-4 line-clamp-2 max-w-[13rem] text-xs font-semibold leading-5 text-white/82">{item.summary}</p>}
                <button type="button" onClick={() => onOpen(item)} className="mt-auto inline-flex w-fit items-center gap-2 text-xs font-black uppercase tracking-wide text-white">
                    {item.cta} <Icon name="arrow" size={14} />
                </button>
            </div>
        </article>
    );
}

function DetailModal({ item, onClose }) {
    if (!item) return null;

    return (
        <div className="fixed inset-0 z-[80] grid place-items-end overflow-y-auto bg-[#1d120e]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={onClose}>
            <article className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]" onMouseDown={(event) => event.stopPropagation()}>
                <div className="relative aspect-[16/9] overflow-hidden bg-[#f4efe9]">
                    <img src={item.image} alt="" className="size-full object-cover" />
                    <button type="button" onClick={onClose} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white text-[#34231c] shadow-lg" aria-label="Close">
                        <Icon name="x" size={18} />
                    </button>
                </div>
                <div className="p-6 sm:p-8">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-wide text-[#8b4b59]">
                        <span>{item.kind}</span>
                        <span className="text-stone-300">/</span>
                        <span>{shortDate(item.date)}</span>
                        {item.location && <><span className="text-stone-300">/</span><span>{item.location}</span></>}
                    </div>
                    <h2 className="mt-4 font-display text-4xl font-normal leading-tight text-[#34231c]">{item.title}</h2>
                    <p className="mt-5 whitespace-pre-line text-sm leading-8 text-stone-600">{item.content ?? item.description ?? item.summary}</p>
                    {item.registration_url && (
                        <a href={item.registration_url} target="_blank" rel="noreferrer" className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#34231c] px-6 text-xs font-black uppercase tracking-wide text-white">
                            Register now <Icon name="arrow" size={14} />
                        </a>
                    )}
                </div>
            </article>
        </div>
    );
}

export default function NewsEventsPage({ initialTab = 'all' }) {
    const navigate = useNavigate();
    const [news, setNews] = useState([]);
    const [events, setEvents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [active, setActive] = useState(initialTab);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [newsResponse, eventsResponse] = await Promise.all([
                api.get('/news', { params: { per_page: 24 } }),
                api.get('/events', { params: { per_page: 24 } }),
            ]);
            setNews(collectionFrom(newsResponse));
            setEvents(collectionFrom(eventsResponse));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || 'News and events could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        setActive(initialTab);
    }, [initialTab]);

    const items = useMemo(() => {
        const sourceNews = news.length ? news : fallbackNews;
        const sourceEvents = events.length ? events : fallbackEvents;

        return [
            ...sourceNews.map((item, index) => normalize(item, 'news', index)),
            ...sourceEvents.map((item, index) => normalize(item, 'event', index + sourceNews.length)),
        ].sort((a, b) => b.sortDate - a.sortDate);
    }, [news, events]);

    function openItem(item) {
        if (item.href) {
            navigate(item.href);
            return;
        }

        setSelected(item);
    }

    const standalone = initialTab === 'news' || initialTab === 'event';
    const pageKind = standalone ? initialTab : active;
    const pageTitle = initialTab === 'event' ? 'Events' : initialTab === 'news' ? 'News' : 'News & Events';
    const pageSubtitle = initialTab === 'event'
        ? 'Upcoming beauty industry events, workshops, launches, and professional gatherings.'
        : initialTab === 'news'
            ? 'Latest beauty industry updates, launches, resources, and professional stories.'
            : 'Latest beauty updates and industry events.';
    const filtered = pageKind === 'all' ? items : items.filter((item) => item.kind === pageKind);
    const featured = filtered[0] ?? items[0];
    const gridItems = standalone ? filtered : filtered.filter((item) => item !== featured);

    return (
        <>
            <Seo
                title={pageTitle}
                description={pageSubtitle}
            />
            <section className="bg-white py-5 sm:py-8">
                <div className="page-container">
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <div>
                            <h1 className="font-display text-3xl font-normal leading-none text-[#34231c] sm:text-4xl">{pageTitle}</h1>
                            <p className="mt-1 max-w-xl text-xs font-semibold text-stone-500 sm:text-sm">{pageSubtitle}</p>
                        </div>
                        <Button variant="secondary" onClick={load} disabled={loading} className="hidden sm:inline-flex">
                            Refresh <Icon name="refresh" size={15} />
                        </Button>
                    </div>

                    <div className={`mb-6 flex items-center justify-between gap-4 ${standalone ? 'hidden' : ''}`}>
                        <div className="flex overflow-x-auto rounded-full border border-[#ded2c7] bg-[#f8f3ee] p-1">
                            {['all', 'news', 'event'].map((tab) => (
                                <button key={tab} type="button" onClick={() => setActive(tab)} className={`min-h-10 rounded-full px-5 text-xs font-black uppercase tracking-wide transition ${active === tab ? 'bg-[#34231c] text-white shadow-sm' : 'text-[#6f625b] hover:bg-white'}`}>
                                    {tab === 'all' ? 'All updates' : tab === 'event' ? 'Events' : 'News'}
                                </button>
                            ))}
                        </div>
                        <Button variant="secondary" onClick={load} disabled={loading} className="sm:hidden">
                            Refresh <Icon name="refresh" size={15} />
                        </Button>
                    </div>

                    {error && <InlineAlert className="mb-6">{error} <button type="button" onClick={load} className="ml-1 underline">Try again</button></InlineAlert>}

                    {loading ? (
                        <div className="grid gap-5 md:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton h-[320px] rounded-lg" />)}
                        </div>
                    ) : filtered.length ? (
                        <>
                            {!standalone && <FeaturedCard item={featured} onOpen={openItem} />}
                            {gridItems.length > 0 && (
                                <div className={`${standalone ? '' : 'mt-8'} grid gap-5 sm:grid-cols-2 lg:grid-cols-3`}>
                                    {gridItems.map((item) => <UpdateCard key={`${item.kind}-${item.id}`} item={item} onOpen={openItem} />)}
                                </div>
                            )}
                        </>
                    ) : !error && (
                        <EmptyState icon="calendar" title="No updates found" message="Published news and upcoming events will appear here." />
                    )}
                </div>
            </section>
            <DetailModal item={selected} onClose={() => setSelected(null)} />
        </>
    );
}
