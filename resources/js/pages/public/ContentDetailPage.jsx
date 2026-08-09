import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { apiError, collectionFrom, ensureCsrfCookie, unwrap } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { EmptyState, InlineAlert } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import Seo from '../../components/Seo';
import { buttonClass } from '../../components/ui/Button';
import { mediaUrl, shortDate, stripHtml } from '../../lib/utils';
import sanitizeHtml from '../../lib/sanitizeHtml';

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

function readingTime(content) {
    const words = stripHtml(content).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 220));
}

function DetailBody({ content }) {
    const value = String(content ?? '').trim();
    if (!value) return null;

    if (/<[a-z][\s\S]*>/i.test(value)) {
        return <div className="content-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }} />;
    }

    return (
        <div className="content-prose">
            {value.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
            ))}
        </div>
    );
}

function CommunityEngagement({ item, onReload }) {
    const { user } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const [comment, setComment] = useState('');
    const [saving, setSaving] = useState(false);
    const reactions = [
        ['like', 'Like'],
        ['love', 'Love'],
        ['celebrate', 'Celebrate'],
        ['helpful', 'Helpful'],
    ];

    async function requireUser() {
        if (user) return true;
        navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        return false;
    }

    async function react(type) {
        if (!await requireUser()) return;
        try {
            await ensureCsrfCookie();
            await api.post(`/community-posts/${item.id}/reactions`, { type });
            await onReload();
        } catch (requestError) {
            toast.error(apiError(requestError, 'Reaction could not be saved.').message);
        }
    }

    async function submitComment(event, parentId = null, body = comment, reset = () => setComment('')) {
        event.preventDefault();
        if (!await requireUser()) return;
        setSaving(true);
        try {
            await ensureCsrfCookie();
            await api.post(`/community-posts/${item.id}/comments`, { body, parent_id: parentId });
            reset();
            await onReload();
            toast.success('Comment posted.');
        } catch (requestError) {
            toast.error(apiError(requestError, 'Comment could not be posted.').message);
        } finally {
            setSaving(false);
        }
    }

    async function share() {
        const url = window.location.href;
        await api.post(`/community-posts/${item.id}/shares`, { channel: navigator.share ? 'native_share' : 'copy_link' }).catch(() => {});
        if (navigator.share) {
            await navigator.share({ title: stripHtml(item.title), url }).catch(() => {});
        } else {
            await navigator.clipboard?.writeText(url).catch(() => {});
            toast.success('Community link copied.');
        }
        await onReload();
    }

    async function report(commentId = null) {
        const details = window.prompt('Briefly tell moderators what is wrong with this content.');
        if (details === null) return;
        try {
            await api.post(`/community-posts/${item.id}/reports`, {
                community_comment_id: commentId,
                reason: 'other',
                details,
            });
            toast.success('Report sent to moderation.');
        } catch (requestError) {
            toast.error(apiError(requestError, 'Report could not be sent.').message);
        }
    }

    return (
        <section className="mt-10 rounded-lg border border-stone-200 bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-stone-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#3A2A1F]">Community interaction</p>
                    <h2 className="mt-2 font-display text-3xl font-normal text-[#2A1D14]">Join the conversation</h2>
                </div>
                <button type="button" onClick={share} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-stone-200 px-4 text-xs font-semibold uppercase tracking-wide text-[#2A1D14] hover:bg-[#F7F3ED]">
                    Share <Icon name="external" size={14} />
                </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                {reactions.map(([key, label]) => (
                    <button key={key} type="button" onClick={() => react(key)} className={`min-h-10 rounded-full border px-4 text-xs font-bold uppercase tracking-wide transition ${item.viewer_reaction === key ? 'border-[#2A1D14] bg-[#2A1D14] text-white' : 'border-stone-200 bg-white text-[#2A1D14] hover:bg-[#F7F3ED]'}`}>
                        {label} · {Number(item.reaction_summary?.[key] ?? 0)}
                    </button>
                ))}
                <button type="button" onClick={() => report()} className="min-h-10 rounded-full border border-rose-100 px-4 text-xs font-bold uppercase tracking-wide text-rose-700 hover:bg-rose-50">
                    Report
                </button>
            </div>

            <form className="mt-6" onSubmit={submitComment}>
                <textarea className="min-h-28 w-full resize-y rounded-lg border border-stone-200 px-4 py-3 text-sm leading-6 text-[#2A1D14] outline-none focus:border-[#3A2A1F] focus:ring-4 focus:ring-[#3A2A1F]/10" placeholder="Add a comment. Mention members with @username." value={comment} onChange={(event) => setComment(event.target.value)} />
                <button type="submit" disabled={saving || !comment.trim()} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-[#2A1D14] px-5 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50">
                    Post comment
                </button>
            </form>

            <div className="mt-7 space-y-4">
                {(item.comments ?? []).length ? item.comments.map((entry) => <CommunityComment key={entry.id} comment={entry} onReply={submitComment} onReport={report} saving={saving} />) : (
                    <p className="rounded-lg border border-dashed border-stone-200 bg-[#F7F3ED] p-5 text-sm text-stone-600">No comments yet. Start the discussion.</p>
                )}
            </div>
        </section>
    );
}

function CommunityComment({ comment, onReply, onReport, saving }) {
    const [replying, setReplying] = useState(false);
    const [reply, setReply] = useState('');
    const author = comment.user?.name ?? 'Community member';

    return (
        <article className="rounded-lg border border-stone-200 bg-[#F7F3ED] p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-bold text-[#2A1D14]">{author}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-400">{shortDate(comment.created_at)}</p>
                </div>
                <button type="button" onClick={() => onReport(comment.id)} className="text-xs font-bold uppercase tracking-wide text-stone-400 hover:text-rose-700">Report</button>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-700">{comment.body}</p>
            <button type="button" onClick={() => setReplying((value) => !value)} className="mt-3 text-xs font-bold uppercase tracking-wide text-[#3A2A1F]">Reply</button>
            {replying && (
                <form className="mt-3" onSubmit={(event) => onReply(event, comment.id, reply, () => { setReply(''); setReplying(false); })}>
                    <textarea className="min-h-20 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#3A2A1F]" value={reply} onChange={(event) => setReply(event.target.value)} />
                    <button type="submit" disabled={saving || !reply.trim()} className="mt-2 min-h-9 rounded-full bg-[#2A1D14] px-4 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50">Post reply</button>
                </form>
            )}
            {(comment.replies ?? []).length > 0 && (
                <div className="mt-4 space-y-3 border-l-2 border-stone-200 pl-4">
                    {comment.replies.map((replyItem) => <CommunityComment key={replyItem.id} comment={replyItem} onReply={onReply} onReport={onReport} saving={saving} />)}
                </div>
            )}
        </article>
    );
}

function DetailPanel({ item, type, onShare }) {
    const details = type === 'event'
        ? [
            ['Date', item.date ? shortDate(item.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'To be announced'],
            ['Location', item.location || 'BeautyPro HQ'],
            ['Format', item.location?.toLowerCase() === 'online' ? 'Virtual session' : 'In-person'],
        ]
        : [
            ['Published', item.date ? shortDate(item.date, { day: 'numeric', month: 'short', year: 'numeric' }) : 'BeautyPro HQ'],
            ['Author', item.author],
            ['Read time', `${item.readingTime} min read`],
        ];

    return (
        <aside className="lg:sticky lg:top-24">
            <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-[0_18px_45px_rgba(52,35,28,.06)]">
                <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#3A2A1F]">{type === 'event' ? 'Event details' : 'Article details'}</p>
                <dl className="mt-4 space-y-4">
                    {details.map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{label}</dt>
                            <dd className="mt-1 text-sm font-bold leading-6 text-[#2A1D14]">{value}</dd>
                        </div>
                    ))}
                </dl>
                <div className="mt-5 grid gap-2">
                    {type === 'event' && (
                        <a href="#event-registration" className={buttonClass({ className: 'w-full rounded-full' })}>
                            Register <Icon name="arrow" size={15} />
                        </a>
                    )}
                    <button type="button" onClick={onShare} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-5 text-xs font-semibold uppercase tracking-wide text-[#2A1D14] transition hover:border-[#3A2A1F] hover:text-[#3A2A1F]">
                        Share <Icon name="external" size={15} />
                    </button>
                </div>
            </div>

            {item.excerpt && (
                <div className="mt-4 rounded-lg bg-[#2A1D14] p-5 text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-rose-200">Key takeaway</p>
                    <p className="mt-3 text-sm font-semibold leading-7 text-white/86">{stripHtml(item.excerpt)}</p>
                </div>
            )}
        </aside>
    );
}

function EventRegistrationForm({ event }) {
    const [form, setForm] = useState({
        name: '',
        email: '',
        phone: '',
        business_name: '',
        professional_role: '',
        notes: '',
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const submit = async (submitEvent) => {
        submitEvent.preventDefault();
        setSaving(true);
        setMessage('');
        setError('');

        try {
            const response = await api.post(`/events/${event.slug}/registrations`, form);
            setMessage(response?.data?.message || 'Your event registration has been received.');
            setForm({ name: '', email: '', phone: '', business_name: '', professional_role: '', notes: '' });
        } catch (requestError) {
            const payload = requestError?.response?.data;
            const validationMessage = payload?.errors ? Object.values(payload.errors).flat().find(Boolean) : null;
            setError(validationMessage || payload?.message || 'We could not submit your registration. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section id="event-registration" className="mt-10 scroll-mt-24 rounded-lg border border-stone-200 bg-[#F7F3ED] p-5 sm:p-6">
            <div className="max-w-2xl">
                <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#3A2A1F]">Event registration</p>
                <h2 className="mt-2 font-display text-3xl font-normal leading-tight text-[#2A1D14]">Reserve your place</h2>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={submit}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-sm font-bold text-[#2A1D14]">Full name</span>
                        <input className="w-full rounded-md border border-stone-200 bg-white px-3.5 py-3 text-sm text-[#2A1D14] outline-none transition focus:border-[#3A2A1F] focus:ring-4 focus:ring-[#3A2A1F]/10" onChange={(input) => update('name', input.target.value)} required value={form.name} />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-sm font-bold text-[#2A1D14]">Email address</span>
                        <input className="w-full rounded-md border border-stone-200 bg-white px-3.5 py-3 text-sm text-[#2A1D14] outline-none transition focus:border-[#3A2A1F] focus:ring-4 focus:ring-[#3A2A1F]/10" onChange={(input) => update('email', input.target.value)} required type="email" value={form.email} />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-sm font-bold text-[#2A1D14]">Phone number</span>
                        <input className="w-full rounded-md border border-stone-200 bg-white px-3.5 py-3 text-sm text-[#2A1D14] outline-none transition focus:border-[#3A2A1F] focus:ring-4 focus:ring-[#3A2A1F]/10" onChange={(input) => update('phone', input.target.value)} value={form.phone} />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-sm font-bold text-[#2A1D14]">Professional role</span>
                        <input className="w-full rounded-md border border-stone-200 bg-white px-3.5 py-3 text-sm text-[#2A1D14] outline-none transition focus:border-[#3A2A1F] focus:ring-4 focus:ring-[#3A2A1F]/10" onChange={(input) => update('professional_role', input.target.value)} placeholder="Makeup artist, educator, founder..." value={form.professional_role} />
                    </label>
                </div>
                <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-[#2A1D14]">Business or brand name</span>
                    <input className="w-full rounded-md border border-stone-200 bg-white px-3.5 py-3 text-sm text-[#2A1D14] outline-none transition focus:border-[#3A2A1F] focus:ring-4 focus:ring-[#3A2A1F]/10" onChange={(input) => update('business_name', input.target.value)} value={form.business_name} />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-[#2A1D14]">Notes</span>
                    <textarea className="min-h-28 w-full resize-y rounded-md border border-stone-200 bg-white px-3.5 py-3 text-sm leading-6 text-[#2A1D14] outline-none transition focus:border-[#3A2A1F] focus:ring-4 focus:ring-[#3A2A1F]/10" onChange={(input) => update('notes', input.target.value)} placeholder="Share accessibility needs, questions, or what you hope to get from the event." value={form.notes} />
                </label>

                {message && <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p>}
                {error && <p className="rounded-md bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

                <button className="inline-flex min-h-12 w-fit items-center justify-center gap-2 rounded-full bg-[#3A2A1F] px-6 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[#3A2A1F] disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} type="submit">
                    {saving ? 'Submitting...' : 'Register for event'} <Icon name="arrow" size={15} />
                </button>
            </form>
        </section>
    );
}

function RelatedCard({ item, type }) {
    const image = mediaUrl(item.image_url ?? item.image) ?? fallbacks[type];
    const href = type === 'community'
        ? `/community/${item.slug ?? item.id}`
        : `/news-events/${type === 'event' ? 'events' : 'news'}/${item.slug}`;

    return (
        <Link to={href} className="group grid w-64 shrink-0 gap-3 bg-transparent transition hover:-translate-y-0.5 sm:w-auto sm:rounded-3xl sm:border sm:border-[#DCCCB8] sm:bg-white sm:p-3 sm:hover:shadow-[0_18px_45px_rgba(52,35,28,.08)]">
            <div className="aspect-[4/3] overflow-hidden bg-[#F7F3ED] sm:rounded-2xl">
                <img src={image} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            </div>
            <div className="px-1 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#3A2A1F]">{typeLabel(type, item)}</p>
                <h3 className="mt-2 line-clamp-2 font-display text-2xl font-normal leading-tight text-[#2A1D14]">{stripHtml(item.title)}</h3>
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
        const canonicalPath = type === 'community'
            ? `/community/${item.slug ?? item.id}`
            : `/news-events/${type === 'event' ? 'events' : 'news'}/${item.slug}`;

        return {
            ...item,
            date,
            canonicalPath,
            image: mediaUrl(item.image_url ?? item.image) ?? fallbacks[type],
            label: typeLabel(type, item),
            author: item.author?.name ?? item.provider?.user?.name ?? 'BeautyPro HQ',
            body: bodyFor(type, item),
            excerpt: item.excerpt ?? (type === 'event' ? stripHtml(item.description).slice(0, 220) : null),
            readingTime: readingTime(bodyFor(type, item)),
        };
    }, [item, type]);

    if (loading) {
        return (
            <section className="bg-[#F7F3ED] py-16">
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
            await navigator.share({ title: stripHtml(normalized.title), url }).catch(() => {});
            return;
        }
        await navigator.clipboard?.writeText(url).catch(() => {});
    }

    return (
        <>
            <Seo
                title={stripHtml(normalized.seo_title || normalized.title)}
                description={normalized.seo_description || normalized.excerpt || stripHtml(normalized.body).slice(0, 160)}
                image={normalized.image}
                type="article"
                canonical={`${window.location.origin}${normalized.canonicalPath}`}
            />
            <div className="fixed inset-x-0 top-0 z-[100] h-1 bg-transparent">
                <div className="h-full bg-[#3A2A1F] transition-[width] duration-100" style={{ width: `${progress}%` }} />
            </div>

            <section className="bg-white">
                <div className="relative">
                    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-4 sm:px-8">
                        <button type="button" onClick={() => navigate(backPath(type))} className="grid size-10 place-items-center rounded-full bg-white/90 text-[#2A1D14] shadow-sm backdrop-blur" aria-label="Go back">
                            <Icon name="chevronLeft" size={20} />
                        </button>
                        <div className="flex gap-2">
                            <button type="button" className="grid size-10 place-items-center rounded-full bg-white/90 text-[#2A1D14] shadow-sm backdrop-blur" aria-label="Save article">
                                <Icon name="heart" size={18} />
                            </button>
                            <button type="button" onClick={shareContent} className="grid size-10 place-items-center rounded-full bg-white/90 text-[#2A1D14] shadow-sm backdrop-blur" aria-label="Share article">
                                <Icon name="external" size={17} />
                            </button>
                        </div>
                    </div>

                    <div className="relative h-[460px] overflow-hidden bg-[#DCCCB8] sm:h-[560px] lg:h-[660px]">
                        <img src={normalized.image} alt="" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/20 to-black/10" />
                        <div className="absolute inset-x-0 bottom-0">
                            <div className="mx-auto max-w-6xl px-5 pb-8 sm:px-6 lg:pb-12">
                                <span className="inline-block bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[#2A1D14]">{normalized.label}</span>
                                <h1 className="mt-4 max-w-4xl font-display text-[2.65rem] font-normal leading-[.96] tracking-normal text-white sm:text-6xl lg:text-7xl">{stripHtml(normalized.title)}</h1>
                                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold uppercase tracking-[.14em] text-white/80">
                                    <span>By {normalized.author}</span>
                                    {normalized.date && <span>{shortDate(normalized.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                                    {type !== 'event' && <span>{normalized.readingTime} min read</span>}
                                    {normalized.location && <span>{normalized.location}</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <article className="mx-auto grid max-w-6xl gap-8 px-5 pb-12 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-16 lg:pt-12">
                    <div className="min-w-0">
                        <div className="mb-8 flex items-center gap-4 border-b border-stone-200 pb-6">
                            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[#F7F3ED] font-display text-xl font-normal text-[#2A1D14]">
                                {String(normalized.author || 'B').slice(0, 1)}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-xs font-semibold uppercase tracking-[.14em] text-[#2A1D14]">Published by {normalized.author}</p>
                                <p className="mt-1 text-xs font-semibold text-stone-500">
                                    {normalized.date ? shortDate(normalized.date) : 'BeautyPro HQ'}{normalized.location ? ` / ${normalized.location}` : ''}
                                </p>
                            </div>
                        </div>

                        {normalized.excerpt && (
                            <p className="mb-8 border-l-2 border-[#3A2A1F] pl-5 font-display text-2xl font-normal italic leading-tight text-[#2A1D14] sm:text-3xl">
                                {stripHtml(normalized.excerpt)}
                            </p>
                        )}

                        <div className="mx-auto max-w-3xl">
                            <DetailBody content={normalized.body} />
                            {type === 'event' ? (
                                <EventRegistrationForm event={normalized} />
                            ) : type === 'community' ? (
                                <CommunityEngagement item={normalized} onReload={load} />
                            ) : normalized.registration_url && (
                                <a href={normalized.registration_url} target="_blank" rel="noreferrer" className={buttonClass({ className: 'mt-8 rounded-full' })}>
                                    Register now <Icon name="arrow" size={15} />
                                </a>
                            )}
                        </div>
                    </div>
                    <DetailPanel item={normalized} type={type} onShare={shareContent} />
                    {type === 'community' && <CommunityRules item={normalized} />}
                </article>
            </section>

            {related.length > 0 && (
                <section className="border-t border-stone-200 bg-[#F7F3ED] py-8 sm:py-12">
                    <div className="px-5 sm:page-container">
                        <div className="mb-6 flex items-end justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#3A2A1F]">Keep reading</p>
                                <h2 className="mt-2 font-display text-3xl font-normal text-[#2A1D14]">Related updates</h2>
                            </div>
                            <Link to={backPath(type)} className="hidden text-xs font-semibold uppercase tracking-wide text-[#3A2A1F] sm:inline-flex">View all</Link>
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

function CommunityRules({ item }) {
    const rules = Array.isArray(item.rules) ? item.rules : [];
    if (!rules.length && !item.topic && !item.group_name) return null;

    return (
        <aside className="mt-4 rounded-lg border border-stone-200 bg-white p-5 shadow-[0_18px_45px_rgba(52,35,28,.06)] lg:col-start-2 lg:mt-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#3A2A1F]">Community</p>
            <div className="mt-4 space-y-3 text-sm">
                {item.topic && <p><span className="font-bold text-[#2A1D14]">Topic:</span> <span className="text-stone-600">{item.topic}</span></p>}
                {item.group_name && <p><span className="font-bold text-[#2A1D14]">Group:</span> <span className="text-stone-600">{item.group_name}</span></p>}
            </div>
            {rules.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm leading-6 text-stone-600">
                    {rules.map((rule) => <li key={rule}>- {rule}</li>)}
                </ul>
            )}
        </aside>
    );
}

