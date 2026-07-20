import { useMemo, useState } from 'react';
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

const emptyItem = { scheduled_date: '', title: '', channel: '', content_type: '', status: 'idea', notes: '' };
const normalize = (value) => Array.isArray(value) ? value : value?.data ?? [];
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function ProviderContentCalendarPage() {
    const [month, setMonth] = useState(currentMonth());
    const [status, setStatus] = useState('all');
    const resource = useApiResource('/provider/content-calendar', [], { params: { month, status: status === 'all' ? undefined : status } });
    const [form, setForm] = useState(emptyItem);
    const [editing, setEditing] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const items = normalize(resource.data);

    const grouped = useMemo(() => items.reduce((groups, item) => {
        const key = item.scheduled_date;
        groups[key] = [...(groups[key] ?? []), item];
        return groups;
    }, {}), [items]);

    const openForm = (item = null) => {
        setEditing(item);
        setForm(item ? {
            scheduled_date: String(item.scheduled_date ?? '').slice(0, 10),
            title: item.title ?? '',
            channel: item.channel ?? '',
            content_type: item.content_type ?? '',
            status: item.status ?? 'idea',
            notes: item.notes ?? '',
        } : { ...emptyItem, scheduled_date: `${month}-01` });
        setShowForm(true);
    };

    const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const saved = await apiRequest(editing ? 'put' : 'post', editing ? `/provider/content-calendar/${editing.id}` : '/provider/content-calendar', form);
            resource.setData((current) => editing ? normalize(current).map((item) => item.id === editing.id ? saved : item) : [...normalize(current), saved]);
            setShowForm(false);
            notify(editing ? 'Calendar item updated.' : 'Calendar item added.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (item) => {
        if (!window.confirm(`Delete "${item.title}"?`)) return;
        try {
            await apiRequest('delete', `/provider/content-calendar/${item.id}`);
            resource.setData((current) => normalize(current).filter((row) => row.id !== item.id));
            notify('Calendar item deleted.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<Button onClick={() => openForm()} type="button">Add content idea</Button>}
                description="Plan posts, launches, campaigns, and reminders for the month."
                eyebrow="Paid feature"
                title="Content calendar"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card>
                <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                    <input className={inputClass} onChange={(event) => setMonth(event.target.value)} type="month" value={month} />
                    <div className="flex flex-wrap gap-2">
                        {['all', 'idea', 'planned', 'created', 'posted'].map((item) => <button key={item} type="button" onClick={() => setStatus(item)} className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition ${status === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{item}</button>)}
                    </div>
                </div>
            </Card>

            {resource.loading ? <LoadingBlock rows={6} /> : items.length ? (
                <div className="grid gap-4">
                    {Object.entries(grouped).map(([date, rows]) => (
                        <Card key={date}>
                            <CardHeader title={formatDate(date)} description={`${rows.length} item${rows.length === 1 ? '' : 's'}`} />
                            <div className="divide-y divide-slate-100">
                                {rows.map((item) => (
                                    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto]" key={item.id}>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-black text-slate-950">{item.title}</h3>
                                                <StatusBadge status={item.status} />
                                            </div>
                                            <p className="mt-1 text-sm text-slate-500">{[item.channel, item.content_type].filter(Boolean).join(' · ') || 'No channel/type set'}</p>
                                            {item.notes && <p className="mt-2 text-sm leading-6 text-slate-600">{item.notes}</p>}
                                        </div>
                                        <div className="flex gap-2 md:self-center">
                                            <Button onClick={() => openForm(item)} type="button" variant="secondary">Edit</Button>
                                            <Button onClick={() => remove(item)} type="button" variant="danger">Delete</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            ) : <EmptyState description="Add content ideas, campaign tasks, and reminders for this month." icon="content" title="No content planned" action={<Button onClick={() => openForm()} type="button">Add first item</Button>} />}

            {showForm && (
                <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setShowForm(false)}>
                    <Card className="w-full max-w-2xl rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="text-lg font-black text-slate-950">{editing ? 'Edit content item' : 'Add content item'}</h2>
                        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={save}>
                            <Field label="Date"><input className={inputClass} onChange={update('scheduled_date')} required type="date" value={form.scheduled_date} /></Field>
                            <Field label="Status"><select className={inputClass} onChange={update('status')} value={form.status}>{['idea', 'planned', 'created', 'posted'].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
                            <Field className="sm:col-span-2" label="Title"><input className={inputClass} onChange={update('title')} required value={form.title} /></Field>
                            <Field label="Channel"><input className={inputClass} onChange={update('channel')} placeholder="Instagram, TikTok, Email..." value={form.channel} /></Field>
                            <Field label="Content type"><input className={inputClass} onChange={update('content_type')} placeholder="Reel, carousel, offer..." value={form.content_type} /></Field>
                            <Field className="sm:col-span-2" label="Notes"><textarea className={`${inputClass} min-h-28`} onChange={update('notes')} value={form.notes} /></Field>
                            <div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={() => setShowForm(false)} type="button" variant="secondary">Cancel</Button><Button busy={saving} type="submit">Save item</Button></div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
