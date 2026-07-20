import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { collectionFrom, unwrap } from '../../lib/api';
import { EmptyState, InlineAlert } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import Seo from '../../components/Seo';
import { buttonClass } from '../../components/ui/Button';
import { mediaUrl, shortDate } from '../../lib/utils';

const fallbacks = {
    news: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1600&q=80',
    event: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1600&q=80',
    community: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1600&q=80',
};

function endpointFor(type, value) {
    if (type === 'event') return `/events/${value}`;
    if (type === 'community') return `/community-posts/${value}`;
    return `/news/${value}`;
}

function listingEndpoint(type) {
    if (type === 'event') return '/events';
    if (type === 'community') return '/community-posts';
    return '/news';
}

function backPath(type) {
    return type === 'community' ? '/community' : '/news-events';
}

function typeLabel(type, item = {}) {
    if (type === 'event') return 'Event';
    if (type === 'community') return String(item.type ?? 'Community story').replaceAll('_', ' ');
    return 'News';
}

function bodyFor(type, item = {}) {
    return type === 'event' ? item.description : item.content;
}

function DetailBody({ content }) {
    const value = String(content ?? '').trim();
    if (!value) return null;

    if (/<[a-z][\s\S]*>/i.test(value)) {
        return <div className="content-prose" dangerouslySetInnerHTML={{ __html: value }} />;
    }

    return (
        <div className="content-prose">
            {value.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
            ))}
        </div>
    );
}

function RelatedCard({ item, type }) {
    const image = mediaUrl(item.image_url ?? item.image) ?? fallbacks[type];
    const href = type === 'community'
        ? `/community/${item.id}`
        : `/news-events/${type === 'event' ? 'events' : 'news'}/${item.slug}`;

    return (
        <Link to={href} className="group grid w-64 shrink-0 gap-3 bg-transparent transition hover:-translate-y-0.5 sm:w-auto sm:rounded-3xl sm:border sm:border-[#eadfd5] sm:bg-white sm:p-3 sm:hover:shadow-[0_18px_45px_rgba(52,35,28,.08)]">
            <div className="aspect-[4/3] overflow-hidden bg-[#f4efe9] sm:rounded-2xl">
                <img src={image} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
            </div>
            <div className="px-1 pb-2">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#8b4b59]">{typeLabel(type, item)}</p>
                <h3 className="mt-2 line-clamp-2 font-display text-2xl font-normal leading-tight text-[#34231c]">{item.title}</h3>
            </div>
        </Link>
    );
}

export default function ContentDetailPage({ type = 'news' }) {
    const params = useParams();
    const navigate = useNavigate();
    const identifier = params.slug ?? params.id;
    const [item, setItem] = useState(null);
    const [related, setRelated] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState(0);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [detailResponse, relatedResponse] = await Promise.all([
                api.get(endpointFor(type, identifier)),
                api.get(listingEndpoint(type), { params: { per_page: 4 } }),
            ]);
            const detail = unwrap(detailResponse);
            setItem(detail);
            setRelated(collectionFrom(relatedResponse).filter((entry) => entry.id !== detail?.id).slice(0, 3));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || 'This content could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [identifier, type]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const updateProgress = () => {
            const scrollable = document.documentElement.scrollHeight - window.innerHeight;
            setProgress(scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0);
        };
        updateProgress();
        window.addEventListener('scroll', updateProgress, { passive: true });
        return () => window.removeEventListener('scroll', updateProgress);
    }, []);

    const normalized = useMemo(() => {
        if (!item) return null;
        const date = type === 'event' ? item.date : item.published_at ?? item.created_at;
        return {
            ...item,
            date,
            image: mediaUrl(item.image_url ?? item.image) ?? fallbacks[type],
            label: typeLabel(type, item),
            author: item.author?.name ?? item.provider?.user?.name ?? 'BeautyPro HQ',
            body: bodyFor(type, item),
        };
    }, [item, type]);

    if (loading) {
        return (
            <section className="bg-[#f4efe9] py-16">
                <div className="page-container">
                    <div className="mx-auto max-w-5xl rounded-[2rem] bg-white p-5">
                        <div className="skeleton aspect-[16/8] rounded-[1.5rem]" />
                        <div className="mt-8 space-y-4">
                            <div className="skeleton h-4 w-36 rounded" />
                            <div className="skeleton h-14 w-4/5 rounded" />
                            <div className="skeleton h-4 w-full rounded" />
                            <div className="skeleton h-4 w-2/3 rounded" />
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    if (error || !normalized) {
        return (
            <section className="bg-white py-16">
                <div className="page-container">
                    {error ? <InlineAlert>{error}</InlineAlert> : <EmptyState icon="content" title="Content not found" message="The item you opened is not available." />}
                    <Link to={backPath(type)} className={buttonClass({ variant: 'secondary', className: 'mt-6' })}>Back</Link>
                </div>
            </section>
        );
    }

    async function shareContent() {
        const url = window.location.href;
        if (navigator.share) {
            await navigator.share({ title: normalized.title, url }).catch(() => {});
            return;
        }
        await navigator.clipboard?.writeText(url).catch(() => {});
    }

    return (
        <>
            <Seo
                title={normalized.seo_title || normalized.title}
                description={normalized.seo_description || normalized.excerpt || String(normalized.body ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}
                image={normalized.image}
                type="article"
            />
            <div className="fixed inset-x-0 top-0 z-[100] h-1 bg-transparent">
                <div className="h-full bg-[#7d2e3c] transition-[width] duration-100" style={{ width: `${progress}%` }} />
            </div>

            <section className="bg-white">
                <div className="relative">
                    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-4 sm:px-8">
                        <button type="button" onClick={() => navigate(backPath(type))} className="grid size-10 place-items-center rounded-full bg-white/90 text-[#241711] shadow-sm backdrop-blur" aria-label="Go back">
                            <Icon name="chevronLeft" size={20} />
                        </button>
                        <div className="flex gap-2">
                            <button type="button" className="grid size-10 place-items-center rounded-full bg-white/90 text-[#241711] shadow-sm backdrop-blur" aria-label="Save article">
                                <Icon name="heart" size={18} />
                            </button>
                            <button type="button" onClick={shareContent} className="grid size-10 place-items-center rounded-full bg-white/90 text-[#241711] shadow-sm backdrop-blur" aria-label="Share article">
                                <Icon name="external" size={17} />
                            </button>
                        </div>
                    </div>

                    <div className="relative h-[420px] overflow-hidden bg-[#d8d3cc] sm:h-[520px] lg:h-[620px]">
                        <img src={normalized.image} alt="" className="size-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    </div>
                </div>

                <article className="mx-auto max-w-3xl px-5 pb-12 pt-5 sm:px-6 sm:pt-8 lg:pb-16">
                    <span className="inline-block bg-[#241711] px-2.5 py-1 text-[10px] font-black uppercase tracking-[.16em] text-white">{normalized.label}</span>
                    <h1 className="mt-4 font-display text-[2.55rem] font-normal leading-[.98] tracking-[-.03em] text-[#241711] sm:text-6xl">{normalized.title}</h1>

                    <div className="my-6 flex items-center gap-4 border-y border-stone-200 py-4">
                        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[#f4efe9] font-display text-xl font-normal text-[#241711]">
                            {String(normalized.author || 'B').slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-black uppercase tracking-[.14em] text-[#241711]">By {normalized.author}</p>
                            <p className="mt-1 text-xs font-semibold text-stone-500">
                                {normalized.date ? shortDate(normalized.date) : 'BeautyPro HQ'}{normalized.location ? ` · ${normalized.location}` : ''}
                            </p>
                        </div>
                    </div>

                    {(normalized.excerpt || type === 'event') && (
                        <p className="mb-7 border-l-2 border-[#7d2e3c] pl-4 font-display text-2xl font-normal italic leading-tight text-[#34231c]">
                            {normalized.excerpt ?? normalized.description}
                        </p>
                    )}

                    <div className="mx-auto">
                            <DetailBody content={normalized.body} />
                            {normalized.registration_url && (
                                <a href={normalized.registration_url} target="_blank" rel="noreferrer" className={buttonClass({ className: 'mt-8 rounded-full' })}>
                                    Register now <Icon name="arrow" size={15} />
                                </a>
                            )}
                    </div>
                </article>
            </section>

            {related.length > 0 && (
                <section className="border-t border-stone-200 bg-[#f4efe9] py-8 sm:py-12">
                    <div className="px-5 sm:page-container">
                        <div className="mb-6 flex items-end justify-between gap-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[.18em] text-[#8b4b59]">Keep reading</p>
                                <h2 className="mt-2 font-display text-3xl font-normal text-[#34231c]">Related updates</h2>
                            </div>
                            <Link to={backPath(type)} className="hidden text-xs font-black uppercase tracking-wide text-[#7d2e3c] sm:inline-flex">View all</Link>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
                            {related.map((entry) => <RelatedCard key={entry.id} item={entry} type={type} />)}
                        </div>
                    </div>
                </section>
            )}
        </>
    );
}
