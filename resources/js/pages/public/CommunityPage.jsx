import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { collectionFrom, metaFrom } from '../../lib/api';
import Button from '../../components/ui/Button';
import { EmptyState, InlineAlert } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import Seo from '../../components/Seo';
import { mediaUrl, shortDate, stripHtml } from '../../lib/utils';

const fallbackImages = [
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80',
];

function typeLabel(value) {
    if (!value) return 'Story';
    return String(value).replaceAll('_', ' ');
}

function normalizePost(item, index) {
    return {
        ...item,
        image: mediaUrl(item.image_url ?? item.image) ?? fallbackImages[index % fallbackImages.length],
        date: item.published_at ?? item.created_at,
        typeLabel: typeLabel(item.type),
        author: item.provider?.user?.name ?? item.author?.name ?? 'BeautyPro HQ',
        topic: item.topic ?? 'General',
        groupName: item.group_name ?? item.groupName,
        reactionCount: Number(item.reaction_count ?? 0),
        commentCount: Number(item.comment_count ?? 0),
        shareCount: Number(item.share_count ?? 0),
    };
}

function StoryModal({ post, onClose }) {
    if (!post) return null;

    return (
        <div className="fixed inset-0 z-[80] grid place-items-end overflow-y-auto bg-[#2A1D14]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={onClose}>
            <article className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]" onMouseDown={(event) => event.stopPropagation()}>
                <div className="relative aspect-[16/9] overflow-hidden bg-[#F7F3ED]">
                    <img src={post.image} alt="" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                    <button type="button" onClick={onClose} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white text-[#2A1D14] shadow-lg" aria-label="Close">
                        <Icon name="x" size={18} />
                    </button>
                </div>
                <div className="p-6 sm:p-8">
                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#3A2A1F]">{post.typeLabel}</p>
                    <h2 className="mt-3 font-display text-4xl font-normal leading-tight text-[#2A1D14]">{stripHtml(post.title)}</h2>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-stone-500">
                        <span>{post.author}</span>
                        {post.date && <span>{shortDate(post.date)}</span>}
                    </div>
                    <p className="mt-6 whitespace-pre-line text-sm leading-8 text-stone-600">{stripHtml(post.content ?? post.excerpt)}</p>
                </div>
            </article>
        </div>
    );
}

function StoryRow({ post, selected, onOpen }) {
    return (
        <button type="button" onClick={() => onOpen(post)} className={`group grid w-full grid-cols-[72px_1fr] gap-2.5 rounded-lg border p-2 text-left transition lg:grid-cols-[168px_1fr] lg:gap-4 lg:rounded-[1.25rem] lg:p-3 ${selected ? 'border-[#2A1D14] bg-[#F7F3ED]' : 'border-[#DCCCB8] bg-white hover:border-[#BFC3C8] hover:bg-[#F7F3ED]'}`}>
            <div className="aspect-square overflow-hidden rounded-lg bg-[#F7F3ED] lg:rounded-2xl">
                <img src={post.image} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            </div>
            <div className="min-w-0 py-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#F7F3ED] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#3A2A1F] lg:px-2.5 lg:py-1 lg:text-[10px]">{post.typeLabel}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-stone-500 ring-1 ring-stone-200 lg:px-2.5 lg:py-1 lg:text-[10px]">{post.topic}</span>
                    <span className="text-[10px] font-bold text-stone-400 lg:text-xs">{shortDate(post.date)}</span>
                </div>
                <h3 className="mt-1 line-clamp-2 font-display text-base font-normal leading-tight text-[#2A1D14] lg:mt-3 lg:text-2xl">{stripHtml(post.title)}</h3>
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-stone-600 lg:mt-2 lg:line-clamp-2 lg:text-sm lg:leading-6">{stripHtml(post.content ?? post.excerpt)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-stone-500 lg:mt-4 lg:text-xs">
                    <span className="truncate">{post.author}</span>
                    {post.groupName && <span>{post.groupName}</span>}
                    <span>{post.reactionCount} reactions</span>
                    <span>{post.commentCount} comments</span>
                </div>
            </div>
        </button>
    );
}

function StoryPreview({ post, onOpen }) {
    if (!post) {
        return (
            <div className="rounded-[1.5rem] border border-dashed border-[#BFC3C8] bg-white p-8 text-center">
                <p className="font-display text-2xl font-normal text-[#2A1D14]">Select a story</p>
                <p className="mt-2 text-sm leading-6 text-stone-500">Community story details will appear here.</p>
            </div>
        );
    }

    return (
        <aside className="overflow-hidden rounded-[1.5rem] border border-[#BFC3C8] bg-white">
            <div className="aspect-[4/3] overflow-hidden bg-[#F7F3ED]">
                <img src={post.image} alt="" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            </div>
            <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#3A2A1F]">{post.typeLabel}</p>
                <h2 className="mt-3 font-display text-3xl font-normal leading-tight text-[#2A1D14]">{stripHtml(post.title)}</h2>
                <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-stone-500">
                    <span>{post.author}</span>
                    {post.date && <span>{shortDate(post.date)}</span>}
                    <span>{post.topic}</span>
                    {post.groupName && <span>{post.groupName}</span>}
                </div>
                <p className="mt-5 line-clamp-5 text-sm leading-7 text-stone-600">{stripHtml(post.content ?? post.excerpt)}</p>
                <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-[#F7F3ED] p-2 text-center text-xs font-bold text-[#2A1D14]">
                    <span>{post.reactionCount} likes</span>
                    <span>{post.commentCount} replies</span>
                    <span>{post.shareCount} shares</span>
                </div>
                <Button onClick={() => onOpen(post)} className="mt-6 w-full rounded-full bg-[#2A1D14] hover:bg-[#2A1D14]">
                    Open story <Icon name="arrow" size={15} />
                </Button>
            </div>
        </aside>
    );
}

function PaginationNav({ currentPage, lastPage, onPage }) {
    if (lastPage <= 1) return null;

    const start = Math.max(1, currentPage - 1);
    const end = Math.min(lastPage, start + 2);
    const adjustedStart = Math.max(1, end - 2);
    const pages = Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);

    return (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Community pages">
            <Button variant="secondary" size="icon" disabled={currentPage <= 1} onClick={() => onPage(currentPage - 1)} aria-label="Previous page"><Icon name="chevronLeft" /></Button>
            {pages[0] > 1 && (
                <>
                    <button type="button" onClick={() => onPage(1)} className="grid size-10 place-items-center rounded-xl border border-stone-200 bg-white text-sm font-semibold text-[#2A1D14]">1</button>
                    {pages[0] > 2 && <span className="px-1 text-sm font-semibold text-stone-400">...</span>}
                </>
            )}
            {pages.map((page) => (
                <button key={page} type="button" onClick={() => onPage(page)} aria-current={currentPage === page ? 'page' : undefined} className={`grid size-10 place-items-center rounded-xl text-sm font-semibold transition ${currentPage === page ? 'bg-[#2A1D14] text-white' : 'border border-stone-200 bg-white text-[#2A1D14] hover:bg-[#F7F3ED]'}`}>
                    {page}
                </button>
            ))}
            {pages.at(-1) < lastPage && (
                <>
                    {pages.at(-1) < lastPage - 1 && <span className="px-1 text-sm font-semibold text-stone-400">...</span>}
                    <button type="button" onClick={() => onPage(lastPage)} className="grid size-10 place-items-center rounded-xl border border-stone-200 bg-white text-sm font-semibold text-[#2A1D14]">{lastPage}</button>
                </>
            )}
            <Button variant="secondary" size="icon" disabled={currentPage >= lastPage} onClick={() => onPage(currentPage + 1)} aria-label="Next page"><Icon name="chevronRight" /></Button>
        </nav>
    );
}

export default function CommunityPage() {
    const navigate = useNavigate();
    const [posts, setPosts] = useState([]);
    const [meta, setMeta] = useState({});
    const [filters, setFilters] = useState({});
    const [activeType, setActiveType] = useState('all');
    const [activeTopic, setActiveTopic] = useState('all');
    const [activeGroup, setActiveGroup] = useState('all');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/community-posts', {
                params: {
                    page,
                    per_page: 10,
                    type: activeType === 'all' ? undefined : activeType,
                    topic: activeTopic === 'all' ? undefined : activeTopic,
                    group: activeGroup === 'all' ? undefined : activeGroup,
                },
            });
            setPosts(collectionFrom(response).map(normalizePost));
            setMeta(metaFrom(response));
            setFilters(response?.data?.filters ?? response?.data?.meta?.filters ?? {});
        } catch (requestError) {
            setError(requestError?.response?.data?.message || 'Community stories could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [activeGroup, activeTopic, activeType, page]);

    useEffect(() => {
        load();
    }, [load]);

    const types = useMemo(() => {
        return filters.types?.length ? filters.types : Array.from(new Set(posts.map((post) => post.type).filter(Boolean)));
    }, [filters.types, posts]);
    const topics = useMemo(() => filters.topics?.length ? filters.topics : Array.from(new Set(posts.map((post) => post.topic).filter(Boolean))), [filters.topics, posts]);
    const groups = useMemo(() => filters.groups?.length ? filters.groups : Array.from(new Set(posts.map((post) => post.groupName).filter(Boolean))), [filters.groups, posts]);

    const preview = posts[0];
    const openPost = (post) => navigate(`/community/${post.slug ?? post.id}`);
    const currentPage = Number(meta.current_page ?? page);
    const lastPage = Number(meta.last_page ?? 1);

    function selectType(type) {
        setActiveType(type);
        setPage(1);
    }

    function selectTopic(topic) {
        setActiveTopic(topic);
        setPage(1);
    }

    function selectGroup(group) {
        setActiveGroup(group);
        setPage(1);
    }

    function goToPage(nextPage) {
        setPage(nextPage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    return (
        <>
            <Seo
                title="Community Stories"
                description="Read BeautyPro HQ community stories, member spotlights, business wins, event coverage, and day-in-the-life features."
            />
            <section className="border-b border-[#DCCCB8] bg-[#F7F3ED] py-10 sm:py-12">
                <div className="page-container">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#3A2A1F]">Community</p>
                            <h1 className="mt-3 max-w-4xl font-display text-3xl font-normal leading-tight text-[#2A1D14] sm:text-6xl">Stories from the BeautyPro HQ community.</h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#3A2A1F] sm:mt-4 sm:leading-7">Spotlights, business wins, event coverage, and behind-the-scenes moments from beauty professionals building with intention.</p>
                        </div>
                        <a href="mailto:community@beautyprohq.com" className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full bg-[#2A1D14] px-6 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[#2A1D14]">
                            Submit story <Icon name="mail" size={15} />
                        </a>
                    </div>
                </div>
            </section>

            <section className="bg-white py-5 sm:py-10">
                <div className="page-container">
                    <div className="grid gap-4 lg:grid-cols-[260px_1fr_360px] lg:gap-6">
                        <aside className="h-fit rounded-[1.5rem] border border-[#DCCCB8] bg-[#F7F3ED] p-2.5 lg:sticky lg:top-24 lg:p-3">
                            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#3A2A1F]">Filters</p>
                            <div className="flex gap-1 overflow-x-auto scrollbar-none lg:grid lg:overflow-visible">
                                <button type="button" onClick={() => selectType('all')} className={`min-h-10 shrink-0 rounded-xl px-4 text-left text-xs font-bold transition lg:rounded-2xl lg:py-3 lg:text-sm ${activeType === 'all' ? 'bg-[#2A1D14] text-white' : 'text-[#3A2A1F] hover:bg-white hover:text-[#2A1D14]'}`}>
                                    All stories
                                </button>
                                {types.map((type) => (
                                    <button key={type} type="button" onClick={() => selectType(type)} className={`min-h-10 shrink-0 rounded-xl px-4 text-left text-xs font-bold capitalize transition lg:rounded-2xl lg:py-3 lg:text-sm ${activeType === type ? 'bg-[#2A1D14] text-white' : 'text-[#3A2A1F] hover:bg-white hover:text-[#2A1D14]'}`}>
                                        {typeLabel(type)}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-4 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#3A2A1F]">Topics</p>
                            <div className="flex gap-1 overflow-x-auto scrollbar-none lg:grid lg:overflow-visible">
                                <button type="button" onClick={() => selectTopic('all')} className={`min-h-10 shrink-0 rounded-xl px-4 text-left text-xs font-bold transition lg:rounded-2xl lg:py-3 lg:text-sm ${activeTopic === 'all' ? 'bg-[#2A1D14] text-white' : 'text-[#3A2A1F] hover:bg-white hover:text-[#2A1D14]'}`}>All topics</button>
                                {topics.map((topic) => (
                                    <button key={topic} type="button" onClick={() => selectTopic(topic)} className={`min-h-10 shrink-0 rounded-xl px-4 text-left text-xs font-bold transition lg:rounded-2xl lg:py-3 lg:text-sm ${activeTopic === topic ? 'bg-[#2A1D14] text-white' : 'text-[#3A2A1F] hover:bg-white hover:text-[#2A1D14]'}`}>{topic}</button>
                                ))}
                            </div>
                            {groups.length > 0 && (
                                <>
                                    <p className="mt-4 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#3A2A1F]">Groups</p>
                                    <div className="flex gap-1 overflow-x-auto scrollbar-none lg:grid lg:overflow-visible">
                                        <button type="button" onClick={() => selectGroup('all')} className={`min-h-10 shrink-0 rounded-xl px-4 text-left text-xs font-bold transition lg:rounded-2xl lg:py-3 lg:text-sm ${activeGroup === 'all' ? 'bg-[#2A1D14] text-white' : 'text-[#3A2A1F] hover:bg-white hover:text-[#2A1D14]'}`}>All groups</button>
                                        {groups.map((group) => (
                                            <button key={group} type="button" onClick={() => selectGroup(group)} className={`min-h-10 shrink-0 rounded-xl px-4 text-left text-xs font-bold transition lg:rounded-2xl lg:py-3 lg:text-sm ${activeGroup === group ? 'bg-[#2A1D14] text-white' : 'text-[#3A2A1F] hover:bg-white hover:text-[#2A1D14]'}`}>{group}</button>
                                        ))}
                                    </div>
                                </>
                            )}
                            <Button variant="secondary" onClick={load} disabled={loading} className="mt-3 w-full lg:mt-4">
                                Refresh <Icon name="refresh" size={15} />
                            </Button>
                        </aside>

                        <div>
                            {error && <InlineAlert className="mb-6">{error} <button type="button" onClick={load} className="ml-1 underline">Try again</button></InlineAlert>}

                            {loading ? (
                                <div className="grid gap-3 sm:gap-4">
                                    {Array.from({ length: 5 }).map((_, index) => <div key={index} className="rounded-lg border border-stone-200 bg-white p-2 lg:rounded-[1.25rem] lg:p-3"><div className="grid grid-cols-[72px_1fr] gap-2.5 lg:grid-cols-[168px_1fr] lg:gap-4"><div className="skeleton aspect-square rounded-lg lg:rounded-2xl" /><div className="space-y-1.5 py-1 lg:space-y-3 lg:py-2"><div className="skeleton h-3 w-24 rounded" /><div className="skeleton h-5 w-4/5 rounded lg:h-8" /><div className="skeleton h-3 w-full rounded lg:h-4" /><div className="skeleton h-3 w-2/3 rounded lg:h-4" /></div></div></div>)}
                                </div>
                            ) : posts.length ? (
                                <>
                                    <div className="grid gap-3">
                                        {posts.map((post) => <StoryRow key={post.id} post={post} selected={preview?.id === post.id} onOpen={openPost} />)}
                                    </div>
                                    <PaginationNav currentPage={currentPage} lastPage={lastPage} onPage={goToPage} />
                                </>
                            ) : !error && (
                                <EmptyState icon="heart" title="No community stories yet" message="Approved member spotlights, wins, and event coverage will appear here." />
                            )}
                        </div>

                        <div className="hidden lg:block lg:sticky lg:top-24 lg:h-fit">
                            <StoryPreview post={preview} onOpen={openPost} />
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
