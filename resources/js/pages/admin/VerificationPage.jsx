import { useMemo, useState } from 'react';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge, apiErrorMessage, apiRequest, inputClass, useApiResource, useAsyncAction, useDashboardToast } from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.verifications ?? value?.data ?? [];

function LinkGroup({ title, items = [], tone = 'fuchsia' }) {
    const color = tone === 'sky' ? 'bg-sky-50 text-sky-700' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-fuchsia-50 text-fuchsia-700';

    return (
        <div>
            <p className="text-sm font-bold text-slate-700">{title}</p>
            <div className="mt-2 space-y-2">
                {items.length ? items.map((url) => (
                    <a className={`block truncate rounded-xl p-3 text-sm font-semibold ${color}`} href={url} key={url} rel="noreferrer" target="_blank">
                        Open link ↗
                    </a>
                )) : <p className="text-sm text-slate-400">No links provided.</p>}
            </div>
        </div>
    );
}

export default function AdminVerificationPage() {
    const resource = useApiResource('/admin/verifications', []);
    const [filter, setFilter] = useState('pending');
    const [selected, setSelected] = useState(null);
    const [notes, setNotes] = useState('');
    const { run, isBusy } = useAsyncAction();
    const { notify } = useDashboardToast();
    const requests = useMemo(() => normalize(resource.data).filter((request) => filter === 'all' || request.status === filter), [filter, resource.data]);

    const decide = (request, status) => run(`${request.id}-${status}`, async () => {
        try {
            const updated = await apiRequest('patch', `/admin/verifications/${request.id}`, { status, admin_notes: notes || undefined });
            resource.setData((current) => normalize(current).map((item) => item.id === request.id ? { ...item, ...(updated ?? {}), status, admin_notes: notes } : item));
            setSelected(null);
            setNotes('');
            notify(status === 'approved' ? 'Provider verified. Badge is now active.' : 'Verification rejected.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    });

    return (
        <div className="space-y-6">
            <PageHeader description="Review portfolio, social proof, professional information, certifications, and licenses before awarding the BPHQ verified badge." eyebrow="Trust & safety" title="Provider verification" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            <Card>
                <div className="mb-5 flex gap-2 overflow-x-auto">
                    {['pending', 'approved', 'rejected', 'all'].map((item) => (
                        <button className={`rounded-xl px-3.5 py-2 text-sm font-bold capitalize ${filter === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`} key={item} onClick={() => setFilter(item)} type="button">
                            {item}
                        </button>
                    ))}
                </div>

                {resource.loading ? <LoadingBlock rows={5} /> : requests.length ? (
                    <div className="space-y-3">
                        {requests.map((request) => {
                            const provider = request.provider ?? {};
                            const user = provider.user ?? request.user ?? {};
                            const portfolios = request.portfolio_links ?? [];
                            const certificates = request.certification_files ?? [];
                            const licenses = request.license_files ?? [];
                            const socials = Object.values(request.social_links ?? {}).filter(Boolean);
                            return (
                                <article className="rounded-2xl border border-slate-100 p-4" key={request.id}>
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                            <Avatar name={user.name} src={provider.profile_photo} />
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="truncate text-sm font-bold text-slate-950">{user.name}</p>
                                                    <StatusBadge status={request.status} />
                                                </div>
                                                <p className="truncate text-xs text-slate-400">{provider.profession} · {provider.location}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{portfolios.length} portfolio</span>
                                            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{socials.length} social</span>
                                            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{certificates.length} certificate</span>
                                            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{licenses.length} license</span>
                                        </div>
                                        <Button onClick={() => { setSelected(request); setNotes(request.admin_notes ?? ''); }} type="button" variant="secondary">Open review</Button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : <EmptyState description="There are no requests in this status." icon="shield" title="No verification requests" />}
            </Card>

            {selected && (
                <div className="fixed inset-0 z-[70] grid place-items-end overflow-y-auto bg-slate-950/35 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setSelected(null)}>
                    <Card className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-slate-950">Review {selected.provider?.user?.name ?? selected.user?.name}</h2>
                                <p className="mt-1 text-sm text-slate-500">Approve only when the provider’s identity and professional proof are acceptable.</p>
                            </div>
                            <StatusBadge status={selected.status} />
                        </div>

                        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                            <p className="text-sm font-bold text-slate-700">Professional information</p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{selected.professional_info || 'No professional information provided.'}</p>
                        </div>

                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                            <LinkGroup title="Portfolio" items={selected.portfolio_links ?? []} />
                            <LinkGroup title="Social media links" items={Object.values(selected.social_links ?? {}).filter(Boolean)} tone="emerald" />
                            <LinkGroup title="Certifications" items={selected.certification_files ?? []} tone="sky" />
                            <LinkGroup title="Licenses" items={selected.license_files ?? []} tone="sky" />
                        </div>

                        <label className="mt-5 block text-sm font-bold text-slate-700">
                            Admin notes
                            <textarea className={`${inputClass} mt-1.5 min-h-28`} onChange={(event) => setNotes(event.target.value)} placeholder="Reason for approval/rejection or internal notes" value={notes} />
                        </label>
                        <div className="mt-5 flex flex-wrap justify-end gap-2">
                            <Button onClick={() => setSelected(null)} type="button" variant="secondary">Close</Button>
                            {selected.status === 'pending' && (
                                <>
                                    <Button busy={isBusy(`${selected.id}-rejected`)} onClick={() => decide(selected, 'rejected')} type="button" variant="danger">Reject</Button>
                                    <Button busy={isBusy(`${selected.id}-approved`)} onClick={() => decide(selected, 'approved')} type="button">Approve & show badge</Button>
                                </>
                            )}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
