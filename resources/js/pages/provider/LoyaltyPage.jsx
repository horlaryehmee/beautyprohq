import { useMemo, useState } from 'react';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, StatCard, apiErrorMessage, apiRequest, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.loyalty ?? value?.customers ?? value?.data ?? [];

export default function ProviderLoyaltyPage() {
    const resource = useApiResource('/provider/loyalty', []);
    const [editing, setEditing] = useState(null);
    const [points, setPoints] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const records = normalize(resource.data);
    const totalPoints = useMemo(() => records.reduce((sum, record) => sum + Number(record.points ?? 0), 0), [records]);

    const save = async () => {
        setSaving(true);
        try {
            const customerId = editing.customer_id ?? editing.customer?.id;
            const updated = await apiRequest('put', `/provider/loyalty/${customerId}`, { points: Number(points), reason: reason || undefined });
            resource.setData((current) => normalize(current).map((item) => (item.customer_id ?? item.customer?.id) === customerId ? { ...item, ...(updated ?? {}), points: updated?.points ?? Number(item.points ?? 0) + Number(points) } : item));
            setEditing(null); notify('Loyalty balance updated.');
        } catch (error) { notify(apiErrorMessage(error), 'error'); } finally { setSaving(false); }
    };

    return <div className="space-y-6"><PageHeader description="Reward repeat customers with a simple points balance." eyebrow="Verified feature" title="Loyalty rewards" /><div className="grid gap-4 sm:grid-cols-3"><StatCard icon="loyalty" label="Points issued" tone="rose" value={totalPoints.toLocaleString()} /><StatCard icon="users" label="Members" tone="plum" value={records.length} /><StatCard icon="analytics" label="Average balance" tone="sky" value={records.length ? Math.round(totalPoints / records.length).toLocaleString() : 0} /></div>{resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}<Card>{resource.loading ? <LoadingBlock rows={5} /> : records.length ? <div className="divide-y divide-slate-100">{records.map((record) => { const customer = record.customer ?? {}; return <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center" key={record.id}><Avatar name={customer.name} src={customer.profile_photo} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{customer.name ?? 'Customer'}</p><p className="truncate text-xs text-slate-400">{customer.email}</p></div><div className="sm:text-right"><p className="text-lg font-bold text-fuchsia-700">{Number(record.points ?? 0).toLocaleString()} pts</p><p className="text-xs text-slate-400">Current balance</p></div><Button onClick={() => { setEditing(record); setPoints(0); setReason(''); }} type="button" variant="secondary">Adjust points</Button></div>; })}</div> : <EmptyState description="Loyalty records appear as customers earn points." icon="loyalty" title="No loyalty members yet" />}</Card>{editing && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" onMouseDown={() => setEditing(null)}><Card className="w-full max-w-md" onMouseDown={(event) => event.stopPropagation()}><h2 className="font-bold text-slate-950">Adjust {editing.customer?.name}’s balance</h2><p className="mt-1 text-sm text-slate-500">Current balance: {Number(editing.points ?? 0).toLocaleString()} points</p><label className="mt-5 block text-sm font-bold text-slate-700">Points to add or remove<input className={`${inputClass} mt-1.5`} onChange={(event) => setPoints(event.target.value)} required type="number" value={points} /></label><p className="mt-1 text-xs text-slate-400">Use a negative number to deduct points.</p><label className="mt-4 block text-sm font-bold text-slate-700">Reason<input className={`${inputClass} mt-1.5`} onChange={(event) => setReason(event.target.value)} placeholder="Completed appointment" value={reason} /></label><div className="mt-5 flex justify-end gap-2"><Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancel</Button><Button busy={saving} onClick={save} type="button">Update balance</Button></div></Card></div>}</div>;
}
