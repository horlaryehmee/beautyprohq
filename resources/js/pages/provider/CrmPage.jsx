import { useMemo, useState } from 'react';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput, apiErrorMessage, apiRequest, inputClass, useApiResource, useDashboardToast, useDebouncedValue } from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.customers ?? value?.data ?? [];
const stages = ['lead', 'prospect', 'booked', 'customer', 'vip', 'inactive'];
const priorities = ['low', 'normal', 'high'];
const supportStatuses = ['none', 'open', 'waiting', 'resolved'];
const activityTypes = ['call', 'email', 'chat', 'task', 'workflow', 'support', 'note'];

function customerFrom(record) {
    return record.customer ?? record;
}

function customerId(record) {
    const customer = customerFrom(record);
    return record.customer_id ?? customer.id ?? record.id;
}

function tagsFrom(record) {
    if (Array.isArray(record.tags)) return record.tags;
    if (typeof record.tags === 'string' && record.tags.trim()) return record.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    return [];
}

function pointsFrom(record) {
    const customer = customerFrom(record);
    const loyalty = customer.loyalties?.[0] ?? record.loyalty;
    return Number(loyalty?.points ?? record.points ?? 0);
}

function activitiesFrom(record) {
    return record.activities ?? [];
}

function summaryFrom(record) {
    return record.crm_summary ?? {};
}

function dateText(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function csvCell(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export default function ProviderCrmPage() {
    const resource = useApiResource('/provider/crm', []);
    const { notify } = useDashboardToast();
    const [query, setQuery] = useState('');
    const search = useDebouncedValue(query);
    const [stageFilter, setStageFilter] = useState('all');
    const [supportFilter, setSupportFilter] = useState('all');
    const [selected, setSelected] = useState(null);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState({});
    const [activity, setActivity] = useState({ type: 'task', title: '', description: '', due_at: '' });

    const records = useMemo(() => normalize(resource.data), [resource.data]);
    const customers = useMemo(() => {
        const text = search.toLowerCase();
        return records.filter((record) => {
            const customer = customerFrom(record);
            const haystack = `${customer.name ?? ''} ${customer.email ?? ''} ${record.notes ?? ''} ${tagsFrom(record).join(' ')} ${record.stage ?? ''} ${record.support_status ?? ''}`.toLowerCase();
            return (!text || haystack.includes(text))
                && (stageFilter === 'all' || (record.stage ?? 'customer') === stageFilter)
                && (supportFilter === 'all' || (record.support_status ?? 'none') === supportFilter);
        });
    }, [records, search, stageFilter, supportFilter]);

    const reports = useMemo(() => ({
        total: records.length,
        leads: records.filter((item) => ['lead', 'prospect'].includes(item.stage)).length,
        tasks: records.flatMap(activitiesFrom).filter((item) => item.type === 'task' && item.status !== 'done').length,
        support: records.filter((item) => ['open', 'waiting'].includes(item.support_status)).length,
    }), [records]);

    function openCustomer(record) {
        setSelected(record);
        setProfile({
            notes: record.notes ?? '',
            tags: tagsFrom(record).join(', '),
            stage: record.stage ?? 'customer',
            source: record.source ?? '',
            priority: record.priority ?? 'normal',
            support_status: record.support_status ?? 'none',
            next_follow_up_at: record.next_follow_up_at ? String(record.next_follow_up_at).slice(0, 16) : '',
        });
        setActivity({ type: 'task', title: '', description: '', due_at: '' });
    }

    function updateProfile(key, value) {
        setProfile((current) => ({ ...current, [key]: value }));
    }

    function updateActivity(key, value) {
        setActivity((current) => ({ ...current, [key]: value }));
    }

    function updateRecord(id, patch) {
        resource.setData((current) => normalize(current).map((item) => customerId(item) === id ? { ...item, ...patch } : item));
        setSelected((current) => current && customerId(current) === id ? { ...current, ...patch } : current);
    }

    async function saveProfile() {
        setSaving(true);
        try {
            const id = customerId(selected);
            const payload = {
                ...profile,
                tags: profile.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
                next_follow_up_at: profile.next_follow_up_at || null,
            };
            const updated = await apiRequest('put', `/provider/crm/${id}`, payload);
            updateRecord(id, updated ?? payload);
            notify('Customer CRM profile saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    }

    async function addActivity(event) {
        event.preventDefault();
        if (!activity.title.trim()) {
            notify('Add an activity title.', 'error');
            return;
        }
        setSaving(true);
        try {
            const id = customerId(selected);
            const created = await apiRequest('post', `/provider/crm/${id}/activities`, { ...activity, due_at: activity.due_at || null });
            const nextActivities = [created, ...activitiesFrom(selected)];
            updateRecord(id, { activities: nextActivities });
            setActivity({ type: 'task', title: '', description: '', due_at: '' });
            notify('CRM activity added.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    }

    async function completeActivity(item) {
        try {
            const updated = await apiRequest('patch', `/provider/crm/activities/${item.id}`, { status: item.status === 'done' ? 'open' : 'done' });
            const id = customerId(selected);
            const nextActivities = activitiesFrom(selected).map((entry) => entry.id === item.id ? updated : entry);
            updateRecord(id, { activities: nextActivities });
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    }

    function exportCsv() {
        const headers = ['Name', 'Email', 'Stage', 'Source', 'Priority', 'Support Status', 'Next Follow Up', 'Tags', 'Loyalty Points', 'Bookings', 'Notes'];
        const rows = customers.map((record) => {
            const customer = customerFrom(record);
            return [
                customer.name,
                customer.email,
                record.stage ?? 'customer',
                record.source,
                record.priority ?? 'normal',
                record.support_status ?? 'none',
                record.next_follow_up_at,
                tagsFrom(record).join(', '),
                pointsFrom(record),
                summaryFrom(record).bookings_count ?? 0,
                record.notes,
            ];
        });
        const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bphq-crm-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        notify('CRM export downloaded.');
    }

    const selectedCustomer = selected ? customerFrom(selected) : null;

    return (
        <div className="space-y-6">
            <PageHeader
                description="Track leads, customers, communication, follow-ups, support issues, and simple pipeline status."
                eyebrow="Verified feature"
                title="Customer CRM"
                actions={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><SearchInput className="w-full sm:w-80" onChange={(event) => setQuery(event.target.value)} placeholder="Search CRM" value={query} /><Button onClick={exportCsv} type="button" variant="secondary">Export CSV</Button></div>}
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    ['Customers', reports.total],
                    ['Leads / prospects', reports.leads],
                    ['Open tasks', reports.tasks],
                    ['Support open', reports.support],
                ].map(([label, value]) => (
                    <Card key={label} className="p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                        <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
                    </Card>
                ))}
            </div>

            <Card>
                <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_220px_220px]">
                    <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Filtered list</p>
                        <p className="mt-1 text-2xl font-bold text-slate-950">{customers.length}</p>
                    </div>
                    <label className="text-sm font-bold text-slate-700">Pipeline stage
                        <select className={`${inputClass} mt-1.5`} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                            <option value="all">All stages</option>
                            {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-bold text-slate-700">Support status
                        <select className={`${inputClass} mt-1.5`} value={supportFilter} onChange={(event) => setSupportFilter(event.target.value)}>
                            <option value="all">All support</option>
                            {supportStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </label>
                </div>

                {resource.loading ? (
                    <LoadingBlock rows={7} />
                ) : customers.length ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-100">
                        <div className="hidden grid-cols-[minmax(220px,1.4fr)_120px_120px_120px_130px_110px] gap-4 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400 lg:grid">
                            <span>Customer</span>
                            <span>Stage</span>
                            <span>Priority</span>
                            <span>Support</span>
                            <span>Follow-up</span>
                            <span className="text-right">Action</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {customers.map((record) => {
                                const customer = customerFrom(record);
                                return (
                                    <article key={record.id ?? customer.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(220px,1.4fr)_120px_120px_120px_130px_110px] lg:items-center">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Avatar name={customer.name} src={customer.profile_photo} />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-slate-950">{customer.name}</p>
                                                <p className="truncate text-xs text-slate-400">{customer.email}</p>
                                                <p className="mt-1 truncate text-xs text-slate-500">{tagsFrom(record).join(', ') || 'No tags'}</p>
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold capitalize text-slate-700">{record.stage ?? 'customer'}</p>
                                        <p className="text-sm font-bold capitalize text-slate-700">{record.priority ?? 'normal'}</p>
                                        <p className="text-sm font-bold capitalize text-slate-700">{record.support_status ?? 'none'}</p>
                                        <p className="text-xs font-semibold text-slate-500">{dateText(record.next_follow_up_at)}</p>
                                        <div className="flex justify-end"><Button onClick={() => openCustomer(record)} type="button" variant="secondary">Open</Button></div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <EmptyState description="Customers appear after their first booking with you." icon="users" title="No CRM customers found" />
                )}
            </Card>

            {selected && (
                <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setSelected(null)}>
                    <Card className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <Avatar name={selectedCustomer.name} src={selectedCustomer.profile_photo} size="lg" />
                                <div className="min-w-0">
                                    <p className="truncate text-lg font-bold text-slate-950">{selectedCustomer.name}</p>
                                    <p className="truncate text-sm text-slate-400">{selectedCustomer.email}</p>
                                    <p className="mt-1 text-xs font-bold text-slate-500">{pointsFrom(selected)} loyalty points · {summaryFrom(selected).bookings_count ?? 0} bookings</p>
                                </div>
                            </div>
                            <button className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-400" onClick={() => setSelected(null)} type="button">×</button>
                        </div>

                        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_.9fr]">
                            <div className="space-y-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="text-sm font-bold text-slate-700">Pipeline stage
                                        <select className={`${inputClass} mt-1.5`} value={profile.stage} onChange={(event) => updateProfile('stage', event.target.value)}>
                                            {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                                        </select>
                                    </label>
                                    <label className="text-sm font-bold text-slate-700">Lead source
                                        <input className={`${inputClass} mt-1.5`} value={profile.source} onChange={(event) => updateProfile('source', event.target.value)} placeholder="Instagram, referral, event" />
                                    </label>
                                    <label className="text-sm font-bold text-slate-700">Priority
                                        <select className={`${inputClass} mt-1.5`} value={profile.priority} onChange={(event) => updateProfile('priority', event.target.value)}>
                                            {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                                        </select>
                                    </label>
                                    <label className="text-sm font-bold text-slate-700">Support status
                                        <select className={`${inputClass} mt-1.5`} value={profile.support_status} onChange={(event) => updateProfile('support_status', event.target.value)}>
                                            {supportStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                                        </select>
                                    </label>
                                    <label className="text-sm font-bold text-slate-700 sm:col-span-2">Next follow-up
                                        <input className={`${inputClass} mt-1.5`} type="datetime-local" value={profile.next_follow_up_at} onChange={(event) => updateProfile('next_follow_up_at', event.target.value)} />
                                    </label>
                                    <label className="text-sm font-bold text-slate-700 sm:col-span-2">Tags
                                        <input className={`${inputClass} mt-1.5`} value={profile.tags} onChange={(event) => updateProfile('tags', event.target.value)} placeholder="VIP, bridal, support" />
                                    </label>
                                    <label className="text-sm font-bold text-slate-700 sm:col-span-2">Private notes
                                        <textarea className={`${inputClass} mt-1.5 min-h-32 resize-y`} value={profile.notes} onChange={(event) => updateProfile('notes', event.target.value)} />
                                    </label>
                                </div>
                                <Button busy={saving} onClick={saveProfile} type="button">Save customer profile</Button>
                            </div>

                            <div className="space-y-5">
                                <form className="rounded-2xl border border-slate-100 p-4" onSubmit={addActivity}>
                                    <p className="text-sm font-bold text-slate-950">Add CRM activity</p>
                                    <div className="mt-4 grid gap-3">
                                        <label className="text-sm font-bold text-slate-700">Type
                                            <select className={`${inputClass} mt-1.5`} value={activity.type} onChange={(event) => updateActivity('type', event.target.value)}>
                                                {activityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                                            </select>
                                        </label>
                                        <input className={inputClass} value={activity.title} onChange={(event) => updateActivity('title', event.target.value)} placeholder="Title e.g. Call about bridal package" />
                                        <textarea className={`${inputClass} min-h-24 resize-y`} value={activity.description} onChange={(event) => updateActivity('description', event.target.value)} placeholder="Details, conversation notes, task instructions, support context..." />
                                        <input className={inputClass} type="datetime-local" value={activity.due_at} onChange={(event) => updateActivity('due_at', event.target.value)} />
                                        <Button busy={saving} type="submit">Add activity</Button>
                                    </div>
                                </form>

                                <div className="rounded-2xl border border-slate-100 p-4">
                                    <p className="text-sm font-bold text-slate-950">Communication & tasks</p>
                                    <div className="mt-3 space-y-2">
                                        {activitiesFrom(selected).length ? activitiesFrom(selected).map((item) => (
                                            <div key={item.id} className="rounded-xl bg-slate-50 p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{item.type} · {item.status}</p>
                                                        <p className="mt-1 text-sm font-bold text-slate-950">{item.title}</p>
                                                        {item.description && <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>}
                                                        {item.due_at && <p className="mt-1 text-xs font-semibold text-slate-400">Due {dateText(item.due_at)}</p>}
                                                    </div>
                                                    <button type="button" onClick={() => completeActivity(item)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600">
                                                        {item.status === 'done' ? 'Reopen' : 'Done'}
                                                    </button>
                                                </div>
                                            </div>
                                        )) : <p className="text-sm text-slate-500">No activity yet. Add calls, emails, chats, tasks, workflow notes, or support updates here.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
