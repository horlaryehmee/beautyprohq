import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, Field, LoadingBlock, StatusBadge, apiErrorMessage, apiRequest, cx, formatDate, inputClass, useDashboardToast } from '../../components/dashboard';
import { dashboardApi, unwrap } from '../../components/dashboard/api';

const contentTypes = {
    news: {
        label: 'News article',
        listPath: '/admin/content',
        endpoint: '/admin/news',
        publicPath: (item) => item?.slug ? `/news-events/news/${item.slug}` : null,
        empty: { title: '', slug: '', excerpt: '', content: '', image: '', status: 'published', published_at: '', seo_title: '', seo_description: '' },
        bodyKey: 'content',
    },
    events: {
        label: 'Event',
        listPath: '/admin/content',
        endpoint: '/admin/events',
        publicPath: (item) => item?.slug ? `/news-events/events/${item.slug}` : null,
        empty: { title: '', slug: '', date: '', location: '', description: '', image: '', registration_url: '', status: 'published', published_at: '', seo_title: '', seo_description: '' },
        bodyKey: 'description',
    },
    community: {
        label: 'Community story',
        listPath: '/admin/content',
        endpoint: '/admin/community-posts',
        publicPath: (item) => item?.id ? `/community/${item.id}` : null,
        empty: { title: '', content: '', type: 'story', image: '', status: 'published', published_at: '', seo_title: '', seo_description: '' },
        bodyKey: 'content',
    },
};

function statusFor(item) {
    return item?.status ?? (item?.published_at ? 'published' : 'draft');
}

function slugify(value) {
    return String(value ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function stripHtml(value) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toForm(item, type) {
    const config = contentTypes[type];
    if (!item) return { ...config.empty };

    return {
        ...config.empty,
        ...item,
        status: statusFor(item),
        date: item.date ? String(item.date).slice(0, 10) : '',
        published_at: item.published_at ? String(item.published_at).slice(0, 16) : '',
    };
}

function cleanPayload(form, type) {
    const payload = { ...form };

    if (type !== 'community' && !payload.slug) delete payload.slug;
    if (payload.status === 'published' && !payload.published_at) delete payload.published_at;
    if (type === 'events' && !payload.registration_url) delete payload.registration_url;

    Object.keys(payload).forEach((key) => {
        if (payload[key] === '') payload[key] = null;
    });

    return payload;
}

export function RichEditor({ label, value, onChange }) {
    const editorRef = useRef(null);
    const [mode, setMode] = useState('write');

    useEffect(() => {
        const node = editorRef.current;
        if (node && node.innerHTML !== (value || '')) node.innerHTML = value || '';
    }, [value, mode]);

    const sync = () => {
        onChange(editorRef.current?.innerHTML ?? '');
    };

    const run = (command, option = null) => {
        editorRef.current?.focus();
        document.execCommand(command, false, option);
        sync();
    };

    const setBlock = (tag) => run('formatBlock', tag);
    const addLink = () => {
        const url = window.prompt('Enter link URL');
        if (!url) return;
        run('createLink', url);
    };

    const tools = [
        ['H2', () => setBlock('h2')],
        ['H3', () => setBlock('h3')],
        ['Bold', () => run('bold')],
        ['Quote', () => setBlock('blockquote')],
        ['List', () => run('insertUnorderedList')],
        ['Link', addLink],
    ];

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-700">{label}</span>
                <div className="rounded-xl bg-slate-100 p-1">
                    {['write', 'preview'].map((item) => (
                        <button key={item} type="button" onClick={() => setMode(item)} className={cx('rounded-lg px-3 py-1 text-xs font-bold capitalize', mode === item ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500')}>
                            {item}
                        </button>
                    ))}
                </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {mode === 'write' ? (
                    <>
                        <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 p-2">
                            {tools.map(([toolLabel, action]) => (
                                <button key={toolLabel} type="button" onClick={action} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">{toolLabel}</button>
                            ))}
                        </div>
                        <div
                            ref={editorRef}
                            className="content-prose min-h-[520px] w-full overflow-y-auto bg-white p-5 text-base leading-8 text-slate-900 outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]"
                            contentEditable
                            data-placeholder="Write the full content here. Use headings, quotes, links and lists where useful."
                            onBlur={sync}
                            onInput={sync}
                            role="textbox"
                            suppressContentEditableWarning
                            tabIndex={0}
                        />
                    </>
                ) : (
                    <div className="min-h-[520px] p-6">
                        {value ? (
                            /<[a-z][\s\S]*>/i.test(value)
                                ? <div className="content-prose" dangerouslySetInnerHTML={{ __html: value }} />
                                : <div className="content-prose">{value.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
                        ) : <p className="text-sm text-slate-400">Preview will appear here.</p>}
                    </div>
                )}
            </div>
        </div>
    );
}

function ImageUploader({ value, onChange }) {
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
            const payload = unwrap(response);
            onChange(payload.url);
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Image upload failed.'));
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    return (
        <div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                {value ? <img src={value} alt="" className="aspect-[16/10] w-full object-cover" /> : <div className="grid aspect-[16/10] place-items-center text-xs font-bold uppercase tracking-wide text-slate-400">No featured image</div>}
            </div>
            <div className="mt-3 grid gap-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-fuchsia-700">
                    {uploading ? 'Uploading...' : 'Upload from device'}
                    <input accept="image/*" className="sr-only" disabled={uploading} onChange={upload} type="file" />
                </label>
                {value && <button type="button" onClick={() => onChange('')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">Remove image</button>}
                {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
            </div>
        </div>
    );
}

function PreviewCard({ form, type }) {
    const config = contentTypes[type];
    const body = form[config.bodyKey];
    const label = type === 'events' ? 'Event' : type === 'community' ? String(form.type ?? 'Story').replaceAll('_', ' ') : 'News';

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            {form.image ? <img src={form.image} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="grid aspect-[16/9] place-items-center bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-400">Image preview</div>}
            <div className="p-5">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-fuchsia-700">{label}</p>
                <h3 className="mt-3 font-serif text-3xl font-normal leading-tight text-slate-950">{form.title || 'Untitled content'}</h3>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-500">{form.excerpt || stripHtml(body) || 'Summary preview will appear here.'}</p>
            </div>
        </div>
    );
}

export default function AdminContentEditorPage() {
    const { type = 'news', id } = useParams();
    const navigate = useNavigate();
    const { notify } = useDashboardToast();
    const config = contentTypes[type] ?? contentTypes.news;
    const isNew = !id;
    const [form, setForm] = useState({ ...config.empty });
    const [editing, setEditing] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const bodyKey = config.bodyKey;

    const load = useCallback(async () => {
        if (isNew) {
            setForm({ ...config.empty });
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const item = await apiRequest('get', `${config.endpoint}/${id}`);
            setEditing(item);
            setForm(toForm(item, type));
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Content could not be loaded.'));
        } finally {
            setLoading(false);
        }
    }, [config, id, isNew, type]);

    useEffect(() => {
        load();
    }, [load]);

    const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = cleanPayload(form, type);
            const saved = await apiRequest(isNew ? 'post' : 'put', isNew ? config.endpoint : `${config.endpoint}/${id}`, payload);
            notify(`${config.label} saved.`);
            navigate(`${config.listPath}/${type}/${saved.id}/edit`, { replace: true });
            setEditing(saved);
            setForm(toForm(saved, type));
        } catch (requestError) {
            notify(apiErrorMessage(requestError), 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!editing || !window.confirm(`Delete "${editing.title}"?`)) return;
        try {
            await apiRequest('delete', `${config.endpoint}/${editing.id}`);
            notify('Content deleted.');
            navigate(config.listPath);
        } catch (requestError) {
            notify(apiErrorMessage(requestError), 'error');
        }
    };

    const publicPath = editing ? config.publicPath(editing) : null;
    const seoDescription = form.seo_description || form.excerpt || stripHtml(form[bodyKey]).slice(0, 160);

    if (!contentTypes[type]) {
        return <ErrorState message="Unknown content type." onRetry={() => navigate('/admin/content')} />;
    }

    if (loading) {
        return <Card><LoadingBlock rows={8} /></Card>;
    }

    return (
        <form onSubmit={save} className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <Link to="/admin/content" className="text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-950">Back to content</Link>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{isNew ? 'Create' : 'Edit'} {config.label.toLowerCase()}</h1>
                    <p className="mt-2 text-sm text-slate-500">Dedicated publishing workspace with SEO, featured image upload, preview and publishing controls.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {publicPath && <a className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50" href={publicPath} target="_blank" rel="noreferrer">View public page</a>}
                    {!isNew && <Button onClick={remove} type="button" variant="danger">Delete</Button>}
                    <Button busy={saving} type="submit">Save</Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-5">
                    <Card>
                        <Field label="Title">
                            <input
                                className="w-full border-0 bg-transparent px-0 py-2 font-serif text-4xl font-normal leading-tight text-slate-950 outline-none placeholder:text-slate-300 sm:text-5xl"
                                onChange={(event) => updateForm({
                                    title: event.target.value,
                                    ...(type !== 'community' && isNew ? { slug: slugify(event.target.value) } : {}),
                                })}
                                placeholder={`Add ${config.label.toLowerCase()} title`}
                                required
                                value={form.title ?? ''}
                            />
                        </Field>

                        {type !== 'community' && (
                            <Field label="Slug" hint="Used in the public URL.">
                                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                                    <input className={inputClass} onChange={(event) => updateForm({ slug: slugify(event.target.value) })} required value={form.slug ?? ''} />
                                    <Button onClick={() => updateForm({ slug: slugify(form.title) })} type="button" variant="secondary">Generate</Button>
                                </div>
                            </Field>
                        )}

                        {type === 'news' && (
                            <Field label="Excerpt">
                                <textarea className={`${inputClass} min-h-24 resize-y`} onChange={(event) => updateForm({ excerpt: event.target.value })} placeholder="Short summary shown on cards, previews and SEO." value={form.excerpt ?? ''} />
                            </Field>
                        )}
                    </Card>

                    <Card>
                        <RichEditor label={type === 'events' ? 'Event description' : 'Content body'} onChange={(value) => updateForm({ [bodyKey]: value })} value={form[bodyKey] ?? ''} />
                    </Card>

                    <Card>
                        <h2 className="font-bold text-slate-950">SEO</h2>
                        <p className="mt-1 text-sm text-slate-500">These fields shape the browser title, Google snippet and social preview.</p>
                        <div className="mt-5 grid gap-4">
                            <Field label="SEO title">
                                <input className={inputClass} maxLength={70} onChange={(event) => updateForm({ seo_title: event.target.value })} placeholder={form.title || 'Recommended: 50–60 characters'} value={form.seo_title ?? ''} />
                            </Field>
                            <Field label="SEO description">
                                <textarea className={`${inputClass} min-h-24 resize-y`} maxLength={170} onChange={(event) => updateForm({ seo_description: event.target.value })} placeholder="Recommended: 140–160 characters" value={form.seo_description ?? ''} />
                            </Field>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="line-clamp-1 text-base text-blue-700">{form.seo_title || form.title || 'SEO title preview'}</p>
                                <p className="mt-1 text-xs text-emerald-700">beautyprohq.com{publicPath ?? '/...'}</p>
                                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{seoDescription || 'SEO description preview.'}</p>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="space-y-5 xl:sticky xl:top-24 xl:h-fit">
                    <Card>
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="font-bold text-slate-950">Publish</h2>
                            <StatusBadge status={form.status ?? 'draft'} />
                        </div>
                        <div className="mt-5 space-y-4">
                            <Field label="Status">
                                <select className={inputClass} onChange={(event) => updateForm({ status: event.target.value })} value={form.status ?? 'published'}>
                                    <option value="published">Published</option>
                                    <option value="draft">Draft</option>
                                </select>
                            </Field>
                            <Field label="Publish date" hint="Leave empty to publish immediately.">
                                <input className={inputClass} onChange={(event) => updateForm({ published_at: event.target.value })} type="datetime-local" value={form.published_at ?? ''} />
                            </Field>
                            {!isNew && editing?.published_at && <p className="text-xs font-semibold text-slate-400">Current publish date: {formatDate(editing.published_at)}</p>}
                        </div>
                    </Card>

                    <Card>
                        <h2 className="font-bold text-slate-950">Featured image</h2>
                        <p className="mt-1 text-sm text-slate-500">Upload directly from the admin device. Recommended: landscape image, 1600px wide.</p>
                        <div className="mt-4">
                            <ImageUploader value={form.image ?? ''} onChange={(image) => updateForm({ image })} />
                        </div>
                    </Card>

                    <Card>
                        <h2 className="font-bold text-slate-950">Content settings</h2>
                        <div className="mt-5 space-y-4">
                            {type === 'events' && (
                                <>
                                    <Field label="Event date">
                                        <input className={inputClass} onChange={(event) => updateForm({ date: event.target.value })} required type="date" value={form.date ?? ''} />
                                    </Field>
                                    <Field label="Location">
                                        <input className={inputClass} onChange={(event) => updateForm({ location: event.target.value })} required value={form.location ?? ''} />
                                    </Field>
                                    <Field label="Registration URL">
                                        <input className={inputClass} onChange={(event) => updateForm({ registration_url: event.target.value })} placeholder="https://..." type="url" value={form.registration_url ?? ''} />
                                    </Field>
                                </>
                            )}

                            {type === 'community' && (
                                <Field label="Story type">
                                    <select className={inputClass} onChange={(event) => updateForm({ type: event.target.value })} value={form.type ?? 'story'}>
                                        <option value="story">Success story</option>
                                        <option value="spotlight">Member spotlight</option>
                                        <option value="pro_of_the_week">Pro of the week</option>
                                        <option value="business_win">Beauty business win</option>
                                        <option value="event_coverage">Event coverage</option>
                                        <option value="day_in_the_life">Day in the life</option>
                                    </select>
                                </Field>
                            )}
                        </div>
                    </Card>

                    <PreviewCard form={form} type={type} />
                </div>
            </div>
        </form>
    );
}
