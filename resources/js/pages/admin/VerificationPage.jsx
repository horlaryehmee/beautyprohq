import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, StatusBadge, apiErrorMessage, apiRequest, inputClass, useApiResource, useAsyncAction, useDashboardToast } from '../../components/dashboard';
import { mediaUrl } from '../../lib/utils';

const normalize = (value) => Array.isArray(value) ? value : value?.verifications ?? value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};
const updateResourceData = (current, nextItems) => Array.isArray(current) ? nextItems : { ...current, data: nextItems };
const statusLabel = (status) => status === 'rejected' ? 'declined' : status;
const filterClass = (status, active) => {
    if (active && status === 'approved') return 'bg-[#027A48] text-white';
    if (active && status === 'pending') return 'bg-[#B54708] text-white';
    if (active && status === 'rejected') return 'bg-[#B42318] text-white';
    if (active) return 'bg-slate-950 text-white';
    return 'bg-slate-100 text-slate-500';
};

function LinkGroup({ title, items = [], tone = 'fuchsia' }) {
    const color = tone === 'sky' ? 'bg-sky-50 text-sky-700' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-fuchsia-50 text-fuchsia-700';
    const isImage = (url) => /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(url);

    return (
        <div>
            <p className="text-sm font-bold text-slate-700">{title}</p>
            <div className="mt-2 space-y-2">
                {items.length ? items.map((url) => (
                    <a className={`block truncate rounded-xl p-3 text-sm font-semibold ${color}`} href={mediaUrl(url)} key={url} rel="noreferrer" target="_blank">
                        {isImage(url) ? (
                            <>
                                <img src={mediaUrl(url)} alt="" className="mb-2 h-36 w-full rounded-lg object-cover" />
                                View image ↗
                            </>
                        ) : (
                            'Open link ↗'
                        )}
                    </a>
                )) : <p className="text-sm text-slate-400">No links provided.</p>}
            </div>
        </div>
    );
}

function PortfolioGallery({ items = [] }) {
    return (
        <div className="md:col-span-2">
            <p className="text-sm font-bold text-slate-700">Portfolio</p>
            {items.length ? (
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {items.map((path, index) => (
                        <a className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50" href={mediaUrl(path)} key={path} rel="noreferrer" target="_blank">
                            <div className="aspect-square overflow-hidden">
                                <img alt={`Portfolio image ${index + 1}`} className="size-full object-cover transition group-hover:scale-[1.03]" src={mediaUrl(path)} />
                            </div>
                            <p className="px-3 py-2 text-xs font-bold text-slate-600">View image {index + 1}</p>
                        </a>
                    ))}
                </div>
            ) : <p className="mt-2 text-sm text-slate-400">No portfolio images provided.</p>}
        </div>
    );
}

export default function AdminVerificationPage() {
    const [filter, setFilter] = useState('pending');
    const [page, setPage] = useState(1);
    const resource = useApiResource('/admin/verifications', [], {
        params: {
            page,
            per_page: 10,
            status: filter === 'all' ? undefined : filter,
        },
    });
    const [selected, setSelected] = useState(null);
    const [notes, setNotes] = useState('');
    const { run, isBusy } = useAsyncAction();
    const { notify } = useDashboardToast();
    const requests = useMemo(() => normalize(resource.data).filter((request) => filter === 'all' || request.status === filter), [filter, resource.data]);
    const meta = metaFrom(resource.data);
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? page);

    useEffect(() => {
        setPage(1);
    }, [filter]);

    const decide = (request, status) => run(`${request.id}-${status}`, async () => {
        try {
            const updated = await apiRequest('patch', `/admin/verifications/${request.id}`, { status, admin_notes: notes || undefined });
            resource.setData((current) => updateResourceData(current, normalize(current).map((item) => item.id === request.id ? { ...item, ...(updated ?? {}), status, admin_notes: notes } : item)));
            setSelected(null);
            setNotes('');
            notify(status === 'approved' ? 'Provider verified. Badge is now active.' : 'Verification declined.');
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
                        <button className={`rounded-xl px-3.5 py-2 text-sm font-bold capitalize ${filterClass(item, filter === item)}`} key={item} onClick={() => setFilter(item)} type="button">
                            {statusLabel(item)}
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
                                                <p className="truncate text-xs text-slate-400">{provider.profession} · {provider.country ?? provider.location}</p>
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
                <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
            </Card>

            {selected && (
                <div className="fixed inset-0 z-[70] grid place-items-end overflow-y-auto bg-slate-950/35 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setSelected(null)}>
                    <Card className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-slate-950">Review {selected.provider?.user?.name ?? selected.user?.name}</h2>
                                <p className="mt-1 text-sm text-slate-500">Approve only when the provider's identity and professional proof are acceptable.</p>
                            </div>
                            <StatusBadge status={selected.status} />
                        </div>

                        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                            <p className="text-sm font-bold text-slate-700">Professional information</p>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{selected.professional_info || 'No professional information provided.'}</p>
                        </div>

                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                            <PortfolioGallery items={selected.portfolio_links ?? []} />
                            <LinkGroup title="Social media links" items={Object.values(selected.social_links ?? {}).filter(Boolean)} tone="emerald" />
                            <LinkGroup title="Certifications" items={selected.certification_files ?? []} tone="sky" />
                            <LinkGroup title="Licenses" items={selected.license_files ?? []} tone="sky" />
                        </div>

                        <label className="mt-5 block text-sm font-bold text-slate-700">
                            Admin notes
                            <textarea className={`${inputClass} mt-1.5 min-h-28`} onChange={(event) => setNotes(event.target.value)} placeholder="Reason for approval/decline or internal notes" value={notes} />
                        </label>
                        <div className="mt-5 flex flex-wrap justify-end gap-2">
                            <Button onClick={() => setSelected(null)} type="button" variant="secondary">Close</Button>
                            {selected.provider?.slug && <a className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50" href={`/admin/providers/${selected.provider.slug}/preview`} rel="noreferrer" target="_blank">Frontend preview</a>}
                            {selected.status === 'pending' && (
                                <>
                                    <Button busy={isBusy(`${selected.id}-rejected`)} onClick={() => decide(selected, 'rejected')} type="button" variant="danger">Decline</Button>
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

