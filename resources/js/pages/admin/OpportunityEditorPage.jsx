import { Component, lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, Field, LoadingBlock, StatusBadge, apiErrorMessage, apiRequest, formatDate, inputClass, useDashboardToast } from '../../components/dashboard';

const ContentWysiwygEditor = lazy(() => import('./ContentWysiwygEditor').catch((error) => {
    console.error('BeautyPro HQ opportunity editor could not load', error);
    return { default: FallbackVisualEditor };
}));

const emptyForm = {
    type: 'job',
    title: '',
    short_description: '',
    description: '',
    contact_email: '',
    contact_url: '',
    location: '',
    deadline: '',
    status: 'published',
    notify_subscribers: false,
};

function statusFor(item) {
    return item?.status ?? (item?.published_at ? 'published' : 'draft');
}

function contactFrom(item = {}) {
    const info = item.contact_info ?? {};
    return typeof info === 'object' ? info : { text: info };
}

function stripHtml(value) {
    if (typeof document === 'undefined') return String(value ?? '').replace(/<[^>]*>/g, ' ');
    const container = document.createElement('div');
    container.innerHTML = String(value ?? '');
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

function formFrom(item) {
    const info = contactFrom(item);
    return {
        ...emptyForm,
        ...item,
        short_description: item.short_description ?? info.short_description ?? '',
        contact_email: info.email ?? '',
        contact_url: info.url ?? '',
        deadline: item.deadline ? String(item.deadline).slice(0, 10) : '',
        status: statusFor(item),
        notify_subscribers: false,
    };
}

function payloadFrom(form) {
    return {
        type: form.type,
        title: form.title,
        description: form.description,
        contact_info: {
            short_description: form.short_description,
            email: form.contact_email,
            url: form.contact_url,
        },
        location: form.location || null,
        deadline: form.deadline || null,
        status: form.status,
        notify_subscribers: Boolean(form.notify_subscribers),
    };
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
        console.error('BeautyPro HQ opportunity editor failed', error);
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
                className={`${inputClass} min-h-[460px] resize-y text-base leading-8`}
                onChange={(event) => {
                    setPlainText(event.target.value);
                    onChange(htmlFromPlainText(event.target.value));
                }}
                placeholder="Write the full opportunity details here."
                required
                value={plainText}
            />
        </Field>
    );
}

export default function AdminOpportunityEditorPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { notify } = useDashboardToast();
    const isNew = !id;
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (isNew) {
            setForm(emptyForm);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const item = await apiRequest('get', `/admin/opportunities/${id}`);
            setEditing(item);
            setForm(formFrom(item));
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Opportunity could not be loaded.'));
        } finally {
            setLoading(false);
        }
    }, [id, isNew]);

    useEffect(() => {
        load();
    }, [load]);

    const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const saved = await apiRequest(isNew ? 'post' : 'put', isNew ? '/admin/opportunities' : `/admin/opportunities/${id}`, payloadFrom(form));
            notify('Opportunity saved.');
            navigate(`/admin/opportunities/${saved.id}/edit`, { replace: true });
            setEditing(saved);
            setForm(formFrom(saved));
        } catch (requestError) {
            notify(apiErrorMessage(requestError), 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!editing || !window.confirm(`Delete "${editing.title}"?`)) return;
        try {
            await apiRequest('delete', `/admin/opportunities/${editing.id}`);
            notify('Opportunity deleted.');
            navigate('/admin/opportunities');
        } catch (requestError) {
            notify(apiErrorMessage(requestError), 'error');
        }
    };

    if (loading) {
        return <Card><LoadingBlock rows={8} /></Card>;
    }

    const publicPath = editing ? `/opportunities/${editing.id}` : null;

    return (
        <form className="space-y-6" onSubmit={save}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <Link className="text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-950" to="/admin/opportunities">Back to opportunities</Link>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{isNew ? 'Create' : 'Edit'} opportunity</h1>
                    <p className="mt-2 text-sm text-slate-500">Dedicated publishing workspace for jobs, training, partnerships and industry calls.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {publicPath && <a className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50" href={publicPath} rel="noreferrer" target="_blank">View public page</a>}
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
                                onChange={(event) => updateForm({ title: event.target.value })}
                                placeholder="Add opportunity title"
                                required
                                value={form.title ?? ''}
                            />
                        </Field>
                        <Field label="Short card description" hint="Shown on homepage and opportunity cards. Keep it short and direct.">
                            <textarea className={`${inputClass} min-h-24 resize-y leading-7`} maxLength={600} onChange={(event) => updateForm({ short_description: event.target.value })} value={form.short_description ?? ''} />
                        </Field>
                    </Card>

                    <Card>
                        <EditorCrashBoundary
                            fallback={<FallbackVisualEditor label="Full opportunity details" onChange={(value) => updateForm({ description: value })} value={form.description ?? ''} />}
                            resetKey={`opportunity-${id ?? 'new'}`}
                        >
                            <Suspense fallback={<LoadingBlock rows={4} />}>
                                <ContentWysiwygEditor label="Full opportunity details" onChange={(value) => updateForm({ description: value })} value={form.description ?? ''} />
                            </Suspense>
                        </EditorCrashBoundary>
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
                            {!isNew && editing?.published_at && <p className="text-xs font-semibold text-slate-400">Current publish date: {formatDate(editing.published_at)}</p>}
                            <label className={`flex items-start gap-3 rounded-2xl border p-4 ${editing?.newsletter_notified_at ? 'border-amber-100 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                                <input
                                    checked={Boolean(form.notify_subscribers)}
                                    className="mt-1 size-4 rounded border-slate-300 text-fuchsia-700 focus:ring-fuchsia-500"
                                    disabled={Boolean(editing?.newsletter_notified_at)}
                                    onChange={(event) => updateForm({ notify_subscribers: event.target.checked })}
                                    type="checkbox"
                                />
                                <span>
                                    <span className="block text-sm font-bold text-slate-900">Email subscribers when published</span>
                                    <span className="mt-1 block text-xs leading-5 text-slate-500">Queues one concise email for each active newsletter subscriber. It will not queue the opportunity twice.</span>
                                    {editing?.newsletter_notified_at && <span className="mt-2 block text-xs font-bold text-amber-700">Queued for {Number(editing.newsletter_notified_count ?? 0).toLocaleString()} subscribers on {formatDate(editing.newsletter_notified_at)}. Delivery requires the queue worker and email provider.</span>}
                                    {!editing?.newsletter_notified_at && editing?.newsletter_notify_requested_at && <span className="mt-2 block text-xs font-bold text-amber-700">Email is queued to send when the opportunity is published.</span>}
                                </span>
                            </label>
                        </div>
                    </Card>

                    <Card>
                        <h2 className="font-bold text-slate-950">Opportunity settings</h2>
                        <div className="mt-5 space-y-4">
                            <Field label="Type">
                                <select className={inputClass} onChange={(event) => updateForm({ type: event.target.value })} value={form.type}>
                                    <option value="job">Job</option>
                                    <option value="partnership">Partnership</option>
                                    <option value="vendor_call">Vendor call</option>
                                    <option value="training">Training</option>
                                    <option value="media">Media feature</option>
                                    <option value="speaking">Speaking</option>
                                </select>
                            </Field>
                            <Field label="Deadline">
                                <input className={inputClass} onChange={(event) => updateForm({ deadline: event.target.value })} type="date" value={form.deadline ?? ''} />
                            </Field>
                            <Field label="Location">
                                <input className={inputClass} onChange={(event) => updateForm({ location: event.target.value })} value={form.location ?? ''} />
                            </Field>
                        </div>
                    </Card>

                    <Card>
                        <h2 className="font-bold text-slate-950">Application contact</h2>
                        <div className="mt-5 space-y-4">
                            <Field label="Contact email">
                                <input className={inputClass} onChange={(event) => updateForm({ contact_email: event.target.value })} type="email" value={form.contact_email ?? ''} />
                            </Field>
                            <Field label="External URL optional">
                                <input className={inputClass} onChange={(event) => updateForm({ contact_url: event.target.value })} placeholder="https://..." type="url" value={form.contact_url ?? ''} />
                            </Field>
                        </div>
                    </Card>
                </div>
            </div>
        </form>
    );
}
