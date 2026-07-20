import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    CardHeader,
    EmptyState,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    Pagination,
    SearchInput,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    formatDate,
    inputClass,
    useApiResource,
    useDashboardToast,
    useDebouncedValue,
} from '../../components/dashboard';

const emptyForm = {
    title: '',
    message: '',
    audience: 'all',
    published_at: '',
    expires_at: '',
};

const normalize = (value) => Array.isArray(value) ? value : value?.announcements ?? value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};
const updateResourceData = (current, nextItems) => Array.isArray(current) ? nextItems : { ...current, data: nextItems };

function statusFor(item) {
    const now = Date.now();
    const published = item.published_at ? new Date(item.published_at).getTime() : null;
    const expires = item.expires_at ? new Date(item.expires_at).getTime() : null;
    if (published && published > now) return 'scheduled';
    if (expires && expires <= now) return 'expired';
    return 'published';
}

function toDateTimeInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 16);
}

export default function AdminAnnouncementsPage() {
    const [query, setQuery] = useState('');
    const [audience, setAudience] = useState('all');
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState(null);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [page, setPage] = useState(1);
    const search = useDebouncedValue(query);
    const resource = useApiResource('/admin/announcements', [], {
        params: {
            page,
            search: search || undefined,
            audience: audience === 'all' ? undefined : audience,
            per_page: 12,
        },
    });
    const { notify } = useDashboardToast();
    const announcements = normalize(resource.data);
    const meta = metaFrom(resource.data);
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? page);

    const counts = useMemo(() => ({
        all: announcements.length,
        active: announcements.filter((item) => statusFor(item) === 'published').length,
        scheduled: announcements.filter((item) => statusFor(item) === 'scheduled').length,
    }), [announcements]);

    useEffect(() => {
        setPage(1);
    }, [search, audience]);

    const startCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setOpen(true);
    };

    const startEdit = (item) => {
        setEditing(item);
        setForm({
            title: item.title ?? '',
            message: item.message ?? '',
            audience: item.audience ?? 'all',
            published_at: toDateTimeInput(item.published_at),
            expires_at: toDateTimeInput(item.expires_at),
        });
        setOpen(true);
    };

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...form,
                published_at: form.published_at || null,
                expires_at: form.expires_at || null,
            };
            const saved = await apiRequest(editing ? 'put' : 'post', editing ? `/admin/announcements/${editing.id}` : '/admin/announcements', payload);
            resource.setData((current) => updateResourceData(current, editing
                ? normalize(current).map((item) => item.id === saved.id ? saved : item)
                : [saved, ...normalize(current)]));
            setOpen(false);
            notify(editing ? 'Announcement updated.' : 'Announcement created.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (item) => {
        if (!window.confirm(`Delete "${item.title}"?`)) return;
        try {
            await apiRequest('delete', `/admin/announcements/${item.id}`);
            resource.setData((current) => updateResourceData(current, normalize(current).filter((entry) => entry.id !== item.id)));
            notify('Announcement deleted.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<Button onClick={startCreate} type="button">New announcement</Button>}
                description="Send platform-wide updates to everyone, providers only, or customers only. Keep active, scheduled, and expired messages controlled from here."
                eyebrow="Communication"
                title="Announcements"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid gap-4 sm:grid-cols-3">
                {[
                    ['All messages', counts.all],
                    ['Active now', counts.active],
                    ['Scheduled', counts.scheduled],
                ].map(([label, value]) => (
                    <Card key={label} padding={false}>
                        <div className="p-5">
                            <p className="text-sm font-semibold text-slate-500">{label}</p>
                            <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
                        </div>
                    </Card>
                ))}
            </div>

            <Card>
                <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_14rem]">
                    <SearchInput onChange={(event) => setQuery(event.target.value)} placeholder="Search announcement title or message" value={query} />
                    <select className={inputClass} onChange={(event) => setAudience(event.target.value)} value={audience}>
                        <option value="all">All audiences</option>
                        <option value="provider">Providers</option>
                        <option value="customer">Customers</option>
                    </select>
                </div>

                {resource.loading ? <LoadingBlock rows={6} /> : announcements.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[850px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                                    <th className="pb-3 font-bold">Message</th>
                                    <th className="pb-3 font-bold">Audience</th>
                                    <th className="pb-3 font-bold">Publish</th>
                                    <th className="pb-3 font-bold">Expires</th>
                                    <th className="pb-3 text-right font-bold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {announcements.map((item) => (
                                    <tr className="border-b border-slate-50 last:border-0" key={item.id}>
                                        <td className="max-w-md py-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-bold text-slate-950">{item.title}</p>
                                                <StatusBadge status={statusFor(item)} />
                                            </div>
                                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.message}</p>
                                        </td>
                                        <td className="py-4 font-semibold capitalize text-slate-700">{item.audience === 'all' ? 'All members' : item.audience}</td>
                                        <td className="py-4 text-slate-500">{formatDate(item.published_at ?? item.created_at)}</td>
                                        <td className="py-4 text-slate-500">{item.expires_at ? formatDate(item.expires_at) : 'No expiry'}</td>
                                        <td className="py-4">
                                            <div className="flex justify-end gap-2">
                                                <Button onClick={() => startEdit(item)} type="button" variant="secondary">Edit</Button>
                                                <Button onClick={() => remove(item)} type="button" variant="danger">Delete</Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
                    </div>
                ) : (
                    <EmptyState action={<Button onClick={startCreate} type="button" variant="soft">Create message</Button>} description="Announcements you create will appear here." icon="megaphone" title="No announcements found" />
                )}
            </Card>

            {open && (
                <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setOpen(false)}>
                    <Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="text-lg font-bold text-slate-950">{editing ? 'Edit announcement' : 'Create announcement'}</h2>
                        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={save}>
                            <Field className="sm:col-span-2" label="Title">
                                <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required value={form.title} />
                            </Field>
                            <Field label="Audience">
                                <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))} value={form.audience}>
                                    <option value="all">All members</option>
                                    <option value="provider">Providers only</option>
                                    <option value="customer">Customers only</option>
                                </select>
                            </Field>
                            <Field label="Publish date" hint="Leave empty to publish now.">
                                <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, published_at: event.target.value }))} type="datetime-local" value={form.published_at} />
                            </Field>
                            <Field label="Expiry date" hint="Optional.">
                                <input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, expires_at: event.target.value }))} type="datetime-local" value={form.expires_at} />
                            </Field>
                            <Field className="sm:col-span-2" label="Message">
                                <textarea className={`${inputClass} min-h-40`} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} required value={form.message} />
                            </Field>
                            <div className="flex justify-end gap-2 sm:col-span-2">
                                <Button onClick={() => setOpen(false)} type="button" variant="secondary">Cancel</Button>
                                <Button busy={saving} type="submit">{editing ? 'Save changes' : 'Create announcement'}</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
