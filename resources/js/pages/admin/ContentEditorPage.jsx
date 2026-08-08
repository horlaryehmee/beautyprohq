import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import { Table as TableExtension, TableCell as TableCellExtension, TableHeader as TableHeaderExtension, TableRow as TableRowExtension } from '@tiptap/extension-table';
import TextAlignExtension from '@tiptap/extension-text-align';
import UnderlineExtension from '@tiptap/extension-underline';
import { AlignCenter, AlignLeft, AlignRight, Bold, Heading2, Heading3, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, Minus, Pilcrow, Quote, Table, Underline } from 'lucide-react';
import { Button, Card, ErrorState, Field, LoadingBlock, StatusBadge, apiErrorMessage, apiRequest, formatDate, inputClass, useDashboardToast } from '../../components/dashboard';
import { dashboardApi, unwrap } from '../../components/dashboard/api';
import sanitizeHtml from '../../lib/sanitizeHtml';

const contentTypes = {
    news: {
        label: 'News article',
        listPath: '/admin/content',
        endpoint: '/admin/news',
        publicPath: (item) => item?.slug ? `/news-events/news/${item.slug}` : null,
        empty: { title: '', slug: '', excerpt: '', content: '', image: '', status: 'published', published_at: '', notify_subscribers: false, seo_title: '', seo_description: '', show_on_homepage: false, homepage_sort_order: '' },
        bodyKey: 'content',
    },
    events: {
        label: 'Event',
        listPath: '/admin/content',
        endpoint: '/admin/events',
        publicPath: (item) => item?.slug ? `/news-events/events/${item.slug}` : null,
        empty: { title: '', slug: '', date: '', location: '', description: '', image: '', registration_url: '', status: 'published', published_at: '', notify_subscribers: false, seo_title: '', seo_description: '', show_on_homepage: false, homepage_sort_order: '' },
        bodyKey: 'description',
    },
    community: {
        label: 'Community story',
        listPath: '/admin/content',
        endpoint: '/admin/community-posts',
        publicPath: (item) => item?.slug ? `/community/${item.slug}` : (item?.id ? `/community/${item.id}` : null),
        empty: { title: '', slug: '', content: '', type: 'story', image: '', status: 'published', published_at: '', notify_subscribers: false, seo_title: '', seo_description: '' },
        bodyKey: 'content',
    },
};

function statusFor(item) {
    return item?.status ?? (item?.published_at ? 'published' : 'draft');
}

function slugify(value) {
    return String(value ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
        notify_subscribers: false,
    };
}

function cleanPayload(form, type) {
    const payload = { ...form };

    if (!payload.slug) delete payload.slug;
    if (payload.status === 'published' && !payload.published_at) delete payload.published_at;
    payload.notify_subscribers = Boolean(payload.notify_subscribers);
    if (type === 'events' && !payload.registration_url) delete payload.registration_url;
    if (type === 'community') {
        delete payload.show_on_homepage;
        delete payload.homepage_sort_order;
    }
    if (!payload.show_on_homepage) payload.homepage_sort_order = null;

    Object.keys(payload).forEach((key) => {
        if (payload[key] === '') payload[key] = null;
    });

    return payload;
}

function normalizeUrl(value) {
    const url = String(value ?? '').trim();
    if (!url) return '';
    if (url.startsWith('/') || url.startsWith('#') || /^https?:\/\//i.test(url) || /^mailto:/i.test(url) || /^tel:/i.test(url)) return url;
    return `https://${url}`;
}

function stripHtml(value) {
    const container = document.createElement('div');
    container.innerHTML = sanitizeHtml(value || '');
    return container.textContent || '';
}

function htmlFromPlainText(value) {
    return String(value ?? '')
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${paragraph.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/\n/g, '<br>')}</p>`)
        .join('');
}

class EditorCrashBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        console.error('BeautyPro HQ editor failed', error);
    }

    componentDidUpdate(previousProps) {
        if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ failed: false });
        }
    }

    render() {
        if (this.state.failed) return this.props.fallback;
        return this.props.children;
    }
}

function FallbackVisualEditor({ label, value, onChange }) {
    const [plainText, setPlainText] = useState(() => stripHtml(value));

    useEffect(() => {
        setPlainText(stripHtml(value));
    }, [value]);

    return (
        <Field label={label} hint="Simple visual editor fallback. Save once, then refresh to reload the full toolbar.">
            <textarea
                className={`${inputClass} min-h-[520px] resize-y text-base leading-8`}
                onChange={(event) => {
                    setPlainText(event.target.value);
                    onChange(htmlFromPlainText(event.target.value));
                }}
                placeholder="Write the full content here."
                required
                value={plainText}
            />
        </Field>
    );
}

function ContentBodyEditor({ label, value, onChange }) {
    const lastExternalValue = useRef(String(value ?? ''));
    const editor = useEditor({
        extensions: [
            StarterKit.configure({ link: false }),
            LinkExtension.configure({
                autolink: true,
                defaultProtocol: 'https',
                openOnClick: false,
                protocols: ['http', 'https', 'mailto', 'tel'],
            }),
            ImageExtension.configure({ allowBase64: false, inline: false }),
            TableExtension.configure({ resizable: true }),
            TableRowExtension,
            TableHeaderExtension,
            TableCellExtension,
            TextAlignExtension.configure({ types: ['heading', 'paragraph'] }),
            UnderlineExtension,
        ],
        content: sanitizeHtml(value || ''),
        editorProps: {
            attributes: {
                class: 'content-prose min-h-[520px] w-full max-w-none bg-white p-5 text-base leading-8 text-bphq-espresso outline-none',
            },
        },
        immediatelyRender: true,
        onContentError: ({ editor: activeEditor }) => {
            activeEditor.commands.setContent(htmlFromPlainText(stripHtml(value || '')), { emitUpdate: false });
        },
        onUpdate: ({ editor: activeEditor }) => {
            const html = activeEditor.getHTML();
            lastExternalValue.current = html;
            onChange(html);
        },
    });

    const addLink = () => {
        const url = normalizeUrl(window.prompt('Enter link URL'));
        if (!url) return;
        editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    const addImage = () => {
        const src = normalizeUrl(window.prompt('Enter image URL'));
        if (!src) return;
        const alt = String(window.prompt('Describe the image for SEO/accessibility') ?? '').trim() || 'Content image';
        editor?.chain().focus().setImage({ src, alt }).run();
    };

    const addTable = () => {
        editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run();
    };

    useEffect(() => {
        if (!editor) return;
        const nextValue = String(value ?? '');
        if (nextValue === lastExternalValue.current) return;
        if (nextValue !== editor.getHTML()) {
            editor.commands.setContent(sanitizeHtml(nextValue), { emitUpdate: false });
            lastExternalValue.current = nextValue;
        }
    }, [editor, value]);

    const active = (name, attributes = {}) => typeof name === 'object' ? editor?.isActive(name) : editor?.isActive(name, attributes);
    const canEditTable = editor?.isActive('table');
    const iconClass = 'size-4';
    const buttonClass = (isActive = false) => `grid size-9 place-items-center rounded-lg border text-bphq-espresso transition ${isActive ? 'border-bphq-coffee bg-bphq-beige' : 'border-bphq-chrome bg-white hover:bg-bphq-beige'}`;
    const tools = [
        { label: 'Bold', icon: <Bold className={iconClass} />, active: active('bold'), action: () => editor?.chain().focus().toggleBold().run() },
        { label: 'Italic', icon: <Italic className={iconClass} />, active: active('italic'), action: () => editor?.chain().focus().toggleItalic().run() },
        { label: 'Underline', icon: <Underline className={iconClass} />, active: active('underline'), action: () => editor?.chain().focus().toggleUnderline().run() },
        { label: 'Bulleted list', icon: <List className={iconClass} />, active: active('bulletList'), action: () => editor?.chain().focus().toggleBulletList().run() },
        { label: 'Numbered list', icon: <ListOrdered className={iconClass} />, active: active('orderedList'), action: () => editor?.chain().focus().toggleOrderedList().run() },
        { label: 'Quote', icon: <Quote className={iconClass} />, active: active('blockquote'), action: () => editor?.chain().focus().toggleBlockquote().run() },
        { label: 'Align left', icon: <AlignLeft className={iconClass} />, active: active({ textAlign: 'left' }), action: () => editor?.chain().focus().setTextAlign('left').run() },
        { label: 'Align center', icon: <AlignCenter className={iconClass} />, active: active({ textAlign: 'center' }), action: () => editor?.chain().focus().setTextAlign('center').run() },
        { label: 'Align right', icon: <AlignRight className={iconClass} />, active: active({ textAlign: 'right' }), action: () => editor?.chain().focus().setTextAlign('right').run() },
        { label: 'Link', icon: <LinkIcon className={iconClass} />, active: active('link'), action: addLink },
        { label: 'Image', icon: <ImageIcon className={iconClass} />, action: addImage },
        { label: 'Table', icon: <Table className={iconClass} />, active: active('table'), action: addTable },
        { label: 'Divider', icon: <Minus className={iconClass} />, action: () => editor?.chain().focus().setHorizontalRule().run() },
    ];

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-700">{label}</span>
                <span className="text-xs text-slate-400">Format visually. Content is cleaned safely before publishing.</span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-bphq-chrome bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-bphq-chrome bg-bphq-ivory p-2">
                    <button aria-label="Paragraph" className={buttonClass(active('paragraph'))} onClick={() => editor?.chain().focus().setParagraph().run()} title="Paragraph" type="button"><Pilcrow className={iconClass} /></button>
                    <button aria-label="Heading 2" className={buttonClass(active('heading', { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2" type="button"><Heading2 className={iconClass} /></button>
                    <button aria-label="Heading 3" className={buttonClass(active('heading', { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3" type="button"><Heading3 className={iconClass} /></button>
                    {tools.map((tool) => (
                        <button
                            aria-label={tool.label}
                            className={buttonClass(tool.active)}
                            key={tool.label}
                            onClick={tool.action}
                            title={tool.label}
                            type="button"
                        >
                            {tool.icon}
                        </button>
                    ))}
                    {canEditTable && (
                        <button aria-label="Delete table" className={buttonClass()} onClick={() => editor?.chain().focus().deleteTable().run()} title="Delete table" type="button">
                            <span className="text-[10px] font-bold">DEL</span>
                        </button>
                    )}
                </div>
                <EditorContent editor={editor} />
                <textarea className="sr-only" readOnly required tabIndex={-1} value={value ?? ''} />
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
            formData.append('file', file);
            const response = await dashboardApi.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
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
                {value ? <img src={value} alt="" className="aspect-[16/10] w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="grid aspect-[16/10] place-items-center text-xs font-bold uppercase tracking-wide text-slate-400">No featured image</div>}
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
                    <p className="mt-2 text-sm text-slate-500">Dedicated publishing workspace with SEO, featured image upload and publishing controls.</p>
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
                                    ...(isNew ? { slug: slugify(event.target.value) } : {}),
                                })}
                                placeholder={`Add ${config.label.toLowerCase()} title`}
                                required
                                value={form.title ?? ''}
                            />
                        </Field>

                        <Field label="Permalink" hint="SEO-friendly public URL. Use lowercase words separated by hyphens.">
                            <div className="mb-2 truncate rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                                {type === 'events' ? '/news-events/events/' : type === 'news' ? '/news-events/news/' : '/community/'}
                                <span className="text-slate-900">{form.slug || slugify(form.title) || 'your-url-slug'}</span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                                <input className={inputClass} onChange={(event) => updateForm({ slug: slugify(event.target.value) })} required value={form.slug ?? ''} />
                                <Button onClick={() => updateForm({ slug: slugify(form.title) })} type="button" variant="secondary">Generate</Button>
                            </div>
                        </Field>

                        {type === 'news' && (
                            <Field label="Excerpt">
                                <textarea className={`${inputClass} min-h-24 resize-y`} onChange={(event) => updateForm({ excerpt: event.target.value })} placeholder="Short summary shown on cards and SEO." value={form.excerpt ?? ''} />
                            </Field>
                        )}
                    </Card>

                    <Card>
                        <EditorCrashBoundary
                            fallback={(
                                <FallbackVisualEditor
                                    label={type === 'events' ? 'Event description' : 'Content body'}
                                    onChange={(value) => updateForm({ [bodyKey]: value })}
                                    value={form[bodyKey] ?? ''}
                                />
                            )}
                            resetKey={`${type}-${id ?? 'new'}`}
                        >
                            <ContentBodyEditor
                                label={type === 'events' ? 'Event description' : 'Content body'}
                                onChange={(value) => updateForm({ [bodyKey]: value })}
                                value={form[bodyKey] ?? ''}
                            />
                        </EditorCrashBoundary>
                    </Card>

                    <Card>
                        <h2 className="font-bold text-slate-950">SEO</h2>
                        <p className="mt-1 text-sm text-slate-500">These fields shape the browser title, Google snippet and social sharing text.</p>
                        <div className="mt-5 grid gap-4">
                            <Field label="SEO title">
                                <input className={inputClass} maxLength={70} onChange={(event) => updateForm({ seo_title: event.target.value })} placeholder={form.title || 'Recommended: 50–60 characters'} value={form.seo_title ?? ''} />
                            </Field>
                            <Field label="SEO description">
                                <textarea className={`${inputClass} min-h-24 resize-y`} maxLength={170} onChange={(event) => updateForm({ seo_description: event.target.value })} placeholder="Recommended: 140–160 characters" value={form.seo_description ?? ''} />
                            </Field>
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
                            <label className={`flex items-start gap-3 rounded-2xl border p-4 ${editing?.newsletter_notified_at ? 'border-emerald-100 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                                <input
                                    checked={Boolean(form.notify_subscribers)}
                                    className="mt-1 size-4 rounded border-slate-300 text-fuchsia-700 focus:ring-fuchsia-500"
                                    disabled={Boolean(editing?.newsletter_notified_at)}
                                    onChange={(event) => updateForm({ notify_subscribers: event.target.checked })}
                                    type="checkbox"
                                />
                                <span>
                                    <span className="block text-sm font-bold text-slate-900">Email subscribers when published</span>
                                    <span className="mt-1 block text-xs leading-5 text-slate-500">Sends one concise email to active newsletter subscribers only. It will not resend after this item has been emailed.</span>
                                    {editing?.newsletter_notified_at && <span className="mt-2 block text-xs font-bold text-emerald-700">Sent to {Number(editing.newsletter_notified_count ?? 0).toLocaleString()} subscribers on {formatDate(editing.newsletter_notified_at)}.</span>}
                                    {!editing?.newsletter_notified_at && editing?.newsletter_notify_requested_at && <span className="mt-2 block text-xs font-bold text-amber-700">Email is queued to send when the publish date arrives.</span>}
                                </span>
                            </label>
                        </div>
                    </Card>

                    {type !== 'community' && (
                        <Card>
                            <h2 className="font-bold text-slate-950">Homepage placement</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500">Select the news and events that should appear on the homepage. The homepage displays the first 10 selected items in one slide row.</p>
                            <div className="mt-5 space-y-4">
                                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <input
                                        checked={Boolean(form.show_on_homepage)}
                                        className="mt-1 size-4 rounded border-slate-300 text-fuchsia-700 focus:ring-fuchsia-500"
                                        onChange={(event) => updateForm({ show_on_homepage: event.target.checked })}
                                        type="checkbox"
                                    />
                                    <span>
                                        <span className="block text-sm font-bold text-slate-900">Show on homepage</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">Use this for the four featured News & Events cards on the homepage.</span>
                                    </span>
                                </label>
                                <Field label="Homepage order" hint="Lower numbers appear first. Leave empty to sort by date.">
                                    <input
                                        className={inputClass}
                                        disabled={!form.show_on_homepage}
                                        min="1"
                                        max="99"
                                        onChange={(event) => updateForm({ homepage_sort_order: event.target.value })}
                                        placeholder="1"
                                        type="number"
                                        value={form.homepage_sort_order ?? ''}
                                    />
                                </Field>
                            </div>
                        </Card>
                    )}

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

                </div>
            </div>
        </form>
    );
}
