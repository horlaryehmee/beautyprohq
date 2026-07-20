import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, StatusBadge, apiErrorMessage, apiRequest, formatDate, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';

const emptyForm = {
    type: 'job',
    title: '',
    description: '',
    requirements: '',
    application_notes: '',
    contact_email: '',
    contact_url: '',
    location: '',
    deadline: '',
    status: 'published',
};
const normalize = (value) => Array.isArray(value) ? value : value?.opportunities ?? value?.data ?? [];

function contactFrom(item = {}) {
    const info = item.contact_info ?? {};
    return typeof info === 'object' ? info : { text: info };
}

function formFrom(item) {
    const info = contactFrom(item);
    return {
        ...emptyForm,
        ...item,
        requirements: info.requirements ?? '',
        application_notes: info.application_notes ?? info.text ?? '',
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
                    requirements: form.requirements,
                    application_notes: form.application_notes,
                    email: form.contact_email,
                    url: form.contact_url,
                },
                location: form.location || null,
                deadline: form.deadline || null,
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

    return (
        <div className="space-y-6">
            <PageHeader actions={<Button onClick={() => show()} type="button">Add opportunity</Button>} description="Publish jobs, collaborations, vendor calls, and training opportunities with clear application instructions." eyebrow="Growth" title="Opportunities" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            <Card>
                {resource.loading ? <LoadingBlock rows={5} /> : items.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((item) => {
                            const info = contactFrom(item);
                            return (
                                <article className="rounded-2xl border border-slate-100 p-4" key={item.id}>
                                    <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-[11px] font-bold capitalize text-fuchsia-700">{String(item.type).replaceAll('_', ' ')}</span><StatusBadge status={item.status ?? 'published'} /></div>
                                    <h2 className="mt-4 line-clamp-2 font-bold text-slate-950">{item.title ?? `${item.type} opportunity`}</h2>
                                    <p className="mt-2 line-clamp-3 min-h-16 text-sm leading-5 text-slate-500">{item.description}</p>
                                    {info.requirements && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500"><span className="font-bold text-slate-700">Requirements:</span> {info.requirements}</div>}
                                    <p className="mt-3 text-[11px] text-slate-400">Added {formatDate(item.created_at)}</p>
                                    <div className="mt-4 flex gap-2"><Button className="flex-1" onClick={() => show(item)} type="button" variant="secondary">Edit</Button><Button onClick={() => remove(item)} type="button" variant="danger">Delete</Button></div>
                                </article>
                            );
                        })}
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
                            <Field label="Full opportunity description" hint="Add the complete context applicants need: who it is for, scope, location, dates, compensation if available, and what happens next."><textarea className={`${inputClass} min-h-56 resize-y leading-7`} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} required value={form.description} /></Field>
                            <Field label="Requirements / eligibility" hint="Examples: portfolio link, city, years of experience, tools/kit, availability, niche."><textarea className={`${inputClass} min-h-32 resize-y leading-7`} onChange={(event) => setForm((current) => ({ ...current, requirements: event.target.value }))} value={form.requirements} /></Field>
                            <Field label="Application instructions" hint="This appears on the detail page and helps applicants know what to submit."><textarea className={`${inputClass} min-h-28 resize-y leading-7`} onChange={(event) => setForm((current) => ({ ...current, application_notes: event.target.value }))} value={form.application_notes} /></Field>
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
