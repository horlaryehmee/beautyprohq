import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Button,
    Card,
    CardHeader,
    EmptyState,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    formatDate,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';
import { mediaUrl } from '../../lib/utils';

const ContentWysiwygEditor = lazy(() => import('../../pages/admin/ContentWysiwygEditor').catch((error) => {
    console.error('BeautyPro HQ WYSIWYG editor could not load', error);
    return { default: ({ onChange, value }) => <textarea className={`${inputClass} min-h-56`} onChange={(e) => onChange(e.target.value)} value={value} /> };
}));

const emptyPost = { title: '', content: '', type: 'community', topic: 'General', group_name: '', mentions: '', image: '', image_file: null };
const normalize = (value) => Array.isArray(value) ? value : value?.data ?? [];
const plain = (value) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function formFrom(item) {
    return {
        title: item?.title ?? '',
        content: item?.content ?? '',
        type: item?.type ?? 'community',
        topic: item?.topic ?? 'General',
        group_name: item?.group_name ?? '',
        mentions: Array.isArray(item?.mentions) ? item.mentions.join(', ') : '',
        image: item?.image_url ?? item?.image ?? '',
        image_file: null,
    };
}

export default function ProviderCommunityPostsPage() {
    const resource = useApiResource('/provider/community-posts', [], { params: { per_page: 24 } });
    const posts = normalize(resource.data);
    const [form, setForm] = useState(emptyPost);
    const [editing, setEditing] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();

    const openForm = (item = null) => {
        setEditing(item);
        setForm(item ? formFrom(item) : emptyPost);
        setShowForm(true);
    };

    const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
    const updateContent = (value) => setForm((current) => ({ ...current, content: value }));

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = new FormData();
            if (editing) payload.append('_method', 'PUT');
            payload.append('title', form.title);
            payload.append('content', form.content);
            payload.append('type', form.type || 'community');
            payload.append('topic', form.topic || 'General');
            payload.append('group_name', form.group_name || '');
            form.mentions.split(',').map((item) => item.trim()).filter(Boolean).forEach((mention) => payload.append('mentions[]', mention));
            if (form.image_file instanceof File) payload.append('image_file', form.image_file);
            else if (form.image) payload.append('image', form.image);

            const saved = await apiRequest('post', editing ? `/provider/community-posts/${editing.id}` : '/provider/community-posts', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
            resource.setData((current) => editing ? normalize(current).map((item) => item.id === editing.id ? saved : item) : [saved, ...normalize(current)]);
            setShowForm(false);
            notify(editing ? 'Community post updated for approval.' : 'Community post submitted for approval.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (item) => {
        if (!window.confirm(`Delete "${item.title}"?`)) return;
        try {
            await apiRequest('delete', `/provider/community-posts/${item.id}`);
            resource.setData((current) => normalize(current).filter((post) => post.id !== item.id));
            notify('Community post removed.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<Button onClick={() => openForm()} type="button">Submit post</Button>}
                description="Share useful community content. New and edited posts stay hidden until an admin approves them."
                eyebrow="Paid feature"
                title="Community posts"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            {resource.loading ? <LoadingBlock rows={6} /> : posts.length ? (
                <div className="grid gap-4">
                    {posts.map((post) => {
                        const published = post.status === 'published' || Boolean(post.published_at);
                        return (
                            <Card key={post.id}>
                                <div className="grid gap-4 md:grid-cols-[96px_1fr_auto] md:items-center">
                                    <div className="aspect-square overflow-hidden rounded-2xl bg-slate-100">
                                        {post.image_url || post.image ? <img alt="" className="size-full object-cover" src={mediaUrl(post.image_url ?? post.image)} onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="grid size-full place-items-center text-xs font-bold uppercase tracking-wide text-slate-400">Image</div>}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusBadge status={post.status ?? (published ? 'published' : 'pending approval')} />
                                            <span className="text-xs font-semibold text-slate-400">{published ? formatDate(post.published_at) : 'Waiting for review'}</span>
                                            {post.topic && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{post.topic}</span>}
                                        </div>
                                        <h2 className="mt-2 line-clamp-1 font-display text-2xl font-medium text-slate-950">{post.title}</h2>
                                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{plain(post.content)}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 md:justify-end">
                                        {published && <Link to={`/community/${post.slug ?? post.id}`}><Button type="button" variant="secondary">View</Button></Link>}
                                        <Button onClick={() => openForm(post)} type="button" variant="secondary">Edit</Button>
                                        <Button onClick={() => remove(post)} type="button" variant="danger">Delete</Button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    action={<Button onClick={() => openForm()} type="button">Submit first post</Button>}
                    description="Submit helpful stories, questions, spotlights, or lessons for the community page."
                    icon="content"
                    title="No community posts yet"
                />
            )}

            {showForm && (
                <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setShowForm(false)}>
                    <Card className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="text-lg font-semibold text-slate-950">{editing ? 'Edit community post' : 'Submit community post'}</h2>
                        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={save}>
                            <Field className="sm:col-span-2" label="Title"><input className={inputClass} onChange={update('title')} required value={form.title} /></Field>
                            <Field label="Type"><select className={inputClass} onChange={update('type')} value={form.type}>{['community', 'story', 'spotlight', 'help', 'business_win', 'event_coverage'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></Field>
                            <Field label="Topic"><input className={inputClass} onChange={update('topic')} placeholder="Client experience, pricing, growth..." value={form.topic} /></Field>
                            <Field label="Group"><input className={inputClass} onChange={update('group_name')} placeholder="General, Studio owners..." value={form.group_name} /></Field>
                                <Field label="Featured image">
                                {form.image && !(form.image_file instanceof File) && <img alt="" className="mb-3 h-28 w-full rounded-2xl object-cover ring-1 ring-slate-200" src={mediaUrl(form.image)} />}
                                {form.image_file instanceof File && <p className="mb-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">{form.image_file.name}</p>}
                                <input accept="image/*" className={inputClass} onChange={(event) => setForm((current) => ({ ...current, image_file: event.target.files?.[0] ?? null }))} type="file" />
                            </Field>
                            <Field className="sm:col-span-2" label="Mentions"><input className={inputClass} onChange={update('mentions')} placeholder="@beautyprohq, @profile-slug" value={form.mentions} /></Field>
                            <Field className="sm:col-span-2" label="Content">
                                <Suspense fallback={<LoadingBlock rows={4} />}>
                                    <ContentWysiwygEditor
                                        onChange={updateContent}
                                        value={form.content}
                                    />
                                </Suspense>
                            </Field>
                            <div className="flex justify-end gap-2 sm:col-span-2">
                                <Button onClick={() => setShowForm(false)} type="button" variant="secondary">Cancel</Button>
                                <Button busy={saving} type="submit">Submit for approval</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
