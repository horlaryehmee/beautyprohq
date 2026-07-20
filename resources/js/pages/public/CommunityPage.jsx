import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { collectionFrom } from '../../lib/api';
import Button from '../../components/ui/Button';
import { EmptyState, InlineAlert } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import Seo from '../../components/Seo';
import { mediaUrl, shortDate } from '../../lib/utils';

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
    };
}

function StoryModal({ post, onClose }) {
    if (!post) return null;

    return (
        <div className="fixed inset-0 z-[80] grid place-items-end overflow-y-auto bg-[#1d120e]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={onClose}>
            <article className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]" onMouseDown={(event) => event.stopPropagation()}>
                <div className="relative aspect-[16/9] overflow-hidden bg-[#f4efe9]">
                    <img src={post.image} alt="" className="size-full object-cover" />
                    <button type="button" onClick={onClose} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white text-[#34231c] shadow-lg" aria-label="Close">
                        <Icon name="x" size={18} />
                    </button>
                </div>
                <div className="p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[.16em] text-[#8b4b59]">{post.typeLabel}</p>
                    <h2 className="mt-3 font-display text-4xl font-normal leading-tight text-[#34231c]">{post.title}</h2>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-stone-500">
                        <span>{post.author}</span>
                        {post.date && <span>{shortDate(post.date)}</span>}
                    </div>
                    <p className="mt-6 whitespace-pre-line text-sm leading-8 text-stone-600">{post.content ?? post.excerpt}</p>
                </div>
            </article>
        </div>
    );
}

function StoryRow({ post, selected, onOpen }) {
    return (
        <button type="button" onClick={() => onOpen(post)} className={`group grid w-full gap-4 rounded-[1.25rem] border p-3 text-left transition sm:grid-cols-[168px_1fr] ${selected ? 'border-[#34231c] bg-[#fbf7f1]' : 'border-[#eadfd5] bg-white hover:border-[#c9bdb2] hover:bg-[#fbf7f1]'}`}>
            <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-[#f4efe9] sm:aspect-square">
                <img src={post.image} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
            </div>
            <div className="min-w-0 py-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#f4efe9] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#8b4b59]">{post.typeLabel}</span>
                    <span className="text-xs font-bold text-stone-400">{shortDate(post.date)}</span>
                </div>
                <h3 className="mt-3 line-clamp-2 font-display text-2xl font-normal leading-tight text-[#34231c]">{post.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{post.content ?? post.excerpt}</p>
                <p className="mt-4 text-xs font-bold text-stone-500">{post.author}</p>
            </div>
        </button>
    );
}

function StoryPreview({ post, onOpen }) {
    if (!post) {
        return (
            <div className="rounded-[1.5rem] border border-dashed border-[#ded2c7] bg-white p-8 text-center">
                <p className="font-display text-2xl font-normal text-[#34231c]">Select a story</p>
                <p className="mt-2 text-sm leading-6 text-stone-500">Community story details will appear here.</p>
            </div>
        );
    }

    return (
        <aside className="overflow-hidden rounded-[1.5rem] border border-[#ded2c7] bg-white">
            <div className="aspect-[4/3] overflow-hidden bg-[#f4efe9]">
                <img src={post.image} alt="" className="size-full object-cover" />
            </div>
            <div className="p-5">
                <p className="text-xs font-black uppercase tracking-[.16em] text-[#8b4b59]">{post.typeLabel}</p>
                <h2 className="mt-3 font-display text-3xl font-normal leading-tight text-[#34231c]">{post.title}</h2>
                <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-stone-500">
                    <span>{post.author}</span>
                    {post.date && <span>{shortDate(post.date)}</span>}
                </div>
                <p className="mt-5 line-clamp-5 text-sm leading-7 text-stone-600">{post.content ?? post.excerpt}</p>
                <Button onClick={() => onOpen(post)} className="mt-6 w-full rounded-full bg-[#34231c] hover:bg-[#4a2f26]">
                    Open story <Icon name="arrow" size={15} />
                </Button>
            </div>
        </aside>
    );
}

export default function CommunityPage() {
    const navigate = useNavigate();
    const [posts, setPosts] = useState([]);
    const [activeType, setActiveType] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/community-posts', { params: { per_page: 48 } });
            setPosts(collectionFrom(response).map(normalizePost));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || 'Community stories could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const types = useMemo(() => {
        return Array.from(new Set(posts.map((post) => post.type).filter(Boolean)));
    }, [posts]);

    const filtered = activeType === 'all' ? posts : posts.filter((post) => post.type === activeType);
    const preview = filtered[0] ?? posts[0];
    const openPost = (post) => navigate(`/community/${post.id}`);

    return (
        <>
            <Seo
                title="Community Stories"
                description="Read BeautyPro HQ community stories, member spotlights, business wins, event coverage, and day-in-the-life features."
            />
            <section className="border-b border-[#eadfd5] bg-[#f4efe9] py-10 sm:py-12">
                <div className="page-container">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[.22em] text-[#8b4b59]">Community</p>
                            <h1 className="mt-3 max-w-4xl font-display text-4xl font-normal leading-tight text-[#34231c] sm:text-6xl">Stories from the BeautyPro HQ community.</h1>
                            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6f625b]">Spotlights, business wins, event coverage, and behind-the-scenes moments from beauty professionals building with intention.</p>
                        </div>
                        <a href="mailto:community@beautyprohq.com" className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full bg-[#34231c] px-6 text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#4a2f26]">
                            Submit story <Icon name="mail" size={15} />
                        </a>
                    </div>
                </div>
            </section>

            <section className="bg-white py-8 sm:py-10">
                <div className="page-container">
                    <div className="grid gap-6 lg:grid-cols-[260px_1fr_360px]">
                        <aside className="h-fit rounded-[1.5rem] border border-[#eadfd5] bg-[#fbf8f4] p-3 lg:sticky lg:top-24">
                            <p className="px-3 py-2 text-[10px] font-black uppercase tracking-[.18em] text-[#8b4b59]">Filters</p>
                            <div className="grid gap-1">
                                <button type="button" onClick={() => setActiveType('all')} className={`rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${activeType === 'all' ? 'bg-[#34231c] text-white' : 'text-[#6f625b] hover:bg-white hover:text-[#34231c]'}`}>
                                    All stories
                                </button>
                                {types.map((type) => (
                                    <button key={type} type="button" onClick={() => setActiveType(type)} className={`rounded-2xl px-4 py-3 text-left text-sm font-bold capitalize transition ${activeType === type ? 'bg-[#34231c] text-white' : 'text-[#6f625b] hover:bg-white hover:text-[#34231c]'}`}>
                                        {typeLabel(type)}
                                    </button>
                                ))}
                            </div>
                            <Button variant="secondary" onClick={load} disabled={loading} className="mt-4 w-full">
                                Refresh <Icon name="refresh" size={15} />
                            </Button>
                        </aside>

                        <div>
                            {error && <InlineAlert className="mb-6">{error} <button type="button" onClick={load} className="ml-1 underline">Try again</button></InlineAlert>}

                            {loading ? (
                                <div className="grid gap-4">
                                    {Array.from({ length: 5 }).map((_, index) => <div key={index} className="rounded-[1.25rem] border border-stone-200 bg-white p-3"><div className="grid gap-4 sm:grid-cols-[168px_1fr]"><div className="skeleton aspect-square rounded-2xl" /><div className="space-y-3 py-2"><div className="skeleton h-3 w-24 rounded" /><div className="skeleton h-8 w-4/5 rounded" /><div className="skeleton h-4 w-full rounded" /><div className="skeleton h-4 w-2/3 rounded" /></div></div></div>)}
                                </div>
                            ) : filtered.length ? (
                                <div className="grid gap-3">
                                    {filtered.map((post) => <StoryRow key={post.id} post={post} selected={preview?.id === post.id} onOpen={openPost} />)}
                                </div>
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
