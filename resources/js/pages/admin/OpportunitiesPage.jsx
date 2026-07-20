import { useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, StatusBadge, apiErrorMessage, apiRequest, formatDate, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';

const emptyForm = {
    type: 'job',
    title: '',
    short_description: '',
    description: '',
    contact_email: '',
    contact_url: '',
    location: '',
    deadline: '',
    show_on_homepage: true,
    homepage_order: 0,
    status: 'published',
};
const normalize = (value) => Array.isArray(value) ? value : value?.opportunities ?? value?.data ?? [];
const sortOptions = [
    ['custom', 'Custom order'],
    ['random', 'Randomize'],
    ['az', 'A-Z'],
    ['za', 'Z-A'],
    ['newest', 'Newest first'],
    ['oldest', 'Oldest first'],
];

function plainText(value) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function contactFrom(item = {}) {
    const info = item.contact_info ?? {};
    return typeof info === 'object' ? info : { text: info };
}

function ClassicEditor({ label, value, onChange }) {
    const editorRef = useRef(null);

    useEffect(() => {
        const node = editorRef.current;
        if (node && node.innerHTML !== (value || '')) node.innerHTML = value || '';
    }, [value]);

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
        ['H1', () => setBlock('h1')],
        ['H2', () => setBlock('h2')],
        ['H3', () => setBlock('h3')],
        ['H4', () => setBlock('h4')],
        ['H5', () => setBlock('h5')],
        ['H6', () => setBlock('h6')],
        ['Paragraph', () => setBlock('p')],
        ['Bold', () => run('bold')],
        ['Italic', () => run('italic')],
        ['Underline', () => run('underline')],
        ['Quote', () => setBlock('blockquote')],
        ['List', () => run('insertUnorderedList')],
        ['Numbered', () => run('insertOrderedList')],
        ['Link', addLink],
        ['Clear', () => run('removeFormat')],
    ];

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-700">{label}</span>
                <span className="text-xs font-semibold text-slate-400">Classic editor</span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 p-2">
                    {tools.map(([toolLabel, action]) => (
                        <button key={toolLabel} type="button" onClick={action} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">{toolLabel}</button>
                    ))}
                </div>
                <div
                    ref={editorRef}
                    className="content-prose min-h-[420px] w-full overflow-y-auto bg-white p-5 text-base leading-8 text-slate-900 outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]"
                    contentEditable
                    data-placeholder="Write the full opportunity details here. Use the toolbar for headings, bold text, lists, quotes, and links."
                    onBlur={sync}
                    onInput={sync}
                    role="textbox"
                    suppressContentEditableWarning
                    tabIndex={0}
                />
            </div>
        </div>
    );
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
        status: item.status ?? (item.published_at ? 'published' : 'draft'),
    };
}

export default function AdminOpportunitiesPage() {
    const resource = useApiResource('/admin/opportunities', []);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState(null);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const homepageSettings = useApiResource('/admin/homepage-settings', {});
    const items = normalize(resource.data).map((item) => ({ ...item, status: item.status ?? (item.published_at ? 'published' : 'draft') }));

    const show = (item = null) => {
        setEditing(item);
        setForm(item ? formFrom(item) : emptyForm);
        setOpen(true);
    };

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = {
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
                show_on_homepage: Boolean(form.show_on_homepage),
                homepage_order: Number(form.homepage_order || 0),
                status: form.status,
            };
            const saved = await apiRequest(editing ? 'put' : 'post', editing ? `/admin/opportunities/${editing.id}` : '/admin/opportunities', payload);
            resource.setData((current) => editing ? normalize(current).map((item) => item.id === editing.id ? { ...item, ...saved } : item) : [saved, ...normalize(current)]);
            setOpen(false);
            notify('Opportunity saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (item) => {
        if (!window.confirm(`Delete this ${item.type} opportunity?`)) return;
        try {
            await apiRequest('delete', `/admin/opportunities/${item.id}`);
            resource.setData((current) => normalize(current).filter((entry) => entry.id !== item.id));
            notify('Opportunity deleted.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    const updateHomepageSort = async (sortMode) => {
        try {
            const saved = await apiRequest('put', '/admin/homepage-settings', { section: 'opportunities', sort_mode: sortMode });
            homepageSettings.setData(saved);
            notify('Homepage sort updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader actions={<Button onClick={() => show()} type="button">Add opportunity</Button>} description="Publish jobs, collaborations, vendor calls, and training opportunities with clear application instructions." eyebrow="Growth" title="Opportunities" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            <Card>
                <div className="grid gap-3 sm:grid-cols-[1fr_260px] sm:items-end">
                    <div>
                        <h2 className="font-bold text-slate-950">Homepage opportunity order</h2>
                        <p className="mt-1 text-sm text-slate-500">Choose how selected opportunities are arranged on the public homepage.</p>
                    </div>
                    <Field label="Homepage sort">
                        <select className={inputClass} onChange={(event) => updateHomepageSort(event.target.value)} value={homepageSettings.data?.opportunities ?? 'custom'}>
                            {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </Field>
                </div>
            </Card>
            <Card>
                {resource.loading ? <LoadingBlock rows={5} /> : items.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((item) => (
                                <article className="rounded-2xl border border-slate-100 p-4" key={item.id}>
                                    <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-[11px] font-bold capitalize text-fuchsia-700">{String(item.type).replaceAll('_', ' ')}</span><StatusBadge status={item.status ?? 'published'} /></div>
                                    <h2 className="mt-4 line-clamp-2 font-bold text-slate-950">{item.title ?? `${item.type} opportunity`}</h2>
                                    <p className="mt-2 line-clamp-3 min-h-16 text-sm leading-5 text-slate-500">{item.short_description || contactFrom(item).short_description || plainText(item.description)}</p>
                                    <p className="mt-3 text-[11px] text-slate-400">Added {formatDate(item.created_at)}</p>
                                    <div className="mt-4 flex gap-2"><Button className="flex-1" onClick={() => show(item)} type="button" variant="secondary">Edit</Button><Button onClick={() => remove(item)} type="button" variant="danger">Delete</Button></div>
                                </article>
                        ))}
                    </div>
                ) : <EmptyState action={<Button onClick={() => show()} type="button" variant="soft">Post an opportunity</Button>} description="Create a detailed listing with clear requirements and application guidance." icon="opportunity" title="No opportunities yet" />}
            </Card>

            {open && (
                <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setOpen(false)}>
                    <Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="text-lg font-bold text-slate-950">{editing ? 'Edit opportunity' : 'New opportunity'}</h2>
                        <form className="mt-5 space-y-4" onSubmit={save}>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <Field label="Type"><select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} value={form.type}><option value="job">Job</option><option value="partnership">Partnership</option><option value="vendor_call">Vendor call</option><option value="training">Training</option><option value="media">Media feature</option><option value="speaking">Speaking</option></select></Field>
                                <Field label="Status"><select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}><option value="published">Published</option><option value="draft">Draft</option></select></Field>
                                <Field label="Deadline"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))} type="date" value={form.deadline} /></Field>
                            </div>
                            <Field label="Title"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required value={form.title} /></Field>
                            <Field label="Short card description" hint="This is what appears on homepage and opportunity cards. Keep it short, clear, and direct."><textarea className={`${inputClass} min-h-24 resize-y leading-7`} maxLength={600} onChange={(event) => setForm((current) => ({ ...current, short_description: event.target.value }))} value={form.short_description} /></Field>
                            <ClassicEditor label="Full opportunity details" onChange={(value) => setForm((current) => ({ ...current, description: value }))} value={form.description} />
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <h3 className="text-sm font-bold text-slate-800">Homepage display</h3>
                                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_160px]">
                                    <label className="flex items-center gap-3 rounded-xl bg-white p-3">
                                        <input checked={Boolean(form.show_on_homepage)} onChange={(event) => setForm((current) => ({ ...current, show_on_homepage: event.target.checked }))} type="checkbox" />
                                        <span className="text-sm font-bold text-slate-700">Show on homepage</span>
                                    </label>
                                    <Field label="Order"><input className={inputClass} min="0" onChange={(event) => setForm((current) => ({ ...current, homepage_order: Number(event.target.value || 0) }))} type="number" value={form.homepage_order ?? 0} /></Field>
                                </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <Field label="Location"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} value={form.location} /></Field>
                                <Field label="Contact email"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, contact_email: event.target.value }))} type="email" value={form.contact_email} /></Field>
                                <Field label="External URL optional"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, contact_url: event.target.value }))} type="url" value={form.contact_url} /></Field>
                            </div>
                            <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)} type="button" variant="secondary">Cancel</Button><Button busy={saving} type="submit">Save opportunity</Button></div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
