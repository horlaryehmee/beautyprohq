import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchInput, StatusBadge, apiErrorMessage, apiRequest, inputClass, useApiResource, useDashboardToast, useDebouncedValue } from '../../components/dashboard';

const statuses = ['all', 'open', 'pending_provider', 'resolved', 'closed'];
const normalize = (value) => Array.isArray(value) ? value : value?.data ?? [];
const timeText = (value) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export default function AdminSupportPage() {
    const [status, setStatus] = useState('all');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(null);
    const [reply, setReply] = useState('');
    const [replyStatus, setReplyStatus] = useState('pending_provider');
    const [sending, setSending] = useState(false);
    const [updating, setUpdating] = useState(false);
    const threadRef = useRef(null);
    const { notify } = useDashboardToast();
    const search = useDebouncedValue(query);
    const resource = useApiResource('/admin/support', [], { params: { status: status === 'all' ? undefined : status, search: search || undefined, per_page: 60 }, refreshInterval: 10000 });
    const tickets = useMemo(() => normalize(resource.data), [resource.data]);
    const unread = tickets.reduce((total, item) => total + Number(item.admin_unread_count ?? 0), 0);
    const active = tickets.filter((item) => ['open', 'pending_provider'].includes(item.status)).length;

    useEffect(() => {
        if (!selected?.id) return undefined;
        const timer = window.setInterval(() => openTicket(selected.id, true), 7000);
        return () => window.clearInterval(timer);
    }, [selected?.id]);

    const scrollToBottom = () => window.setTimeout(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, 20);

    async function openTicket(id, quiet = false) {
        try {
            const ticket = await apiRequest('get', `/admin/support/${id}`);
            setSelected(ticket);
            resource.reload(true);
            if (!quiet) scrollToBottom();
        } catch (error) {
            if (!quiet) notify(apiErrorMessage(error), 'error');
        }
    }

    async function sendReply(event) {
        event.preventDefault();
        if (!reply.trim() || !selected) return;
        const body = reply.trim();
        setReply('');
        setSending(true);
        try {
            const ticket = await apiRequest('post', `/admin/support/${selected.id}/messages`, { message: body, status: replyStatus });
            setSelected(ticket);
            resource.reload(true);
            scrollToBottom();
            notify(replyStatus === 'resolved' ? 'Reply sent and request marked resolved.' : 'Support reply sent.');
        } catch (error) {
            setReply(body);
            notify(apiErrorMessage(error), 'error');
        } finally { setSending(false); }
    }

    async function updateTicket(patch) {
        if (!selected) return;
        setUpdating(true);
        try {
            const ticket = await apiRequest('patch', `/admin/support/${selected.id}`, patch);
            setSelected((current) => ({ ...current, ...ticket }));
            resource.reload(true);
            notify('Support request updated.');
        } catch (error) { notify(apiErrorMessage(error), 'error'); } finally { setUpdating(false); }
    }

    return <div className="space-y-6">
        <PageHeader actions={<SearchInput className="w-full sm:w-80" onChange={(event) => setQuery(event.target.value)} placeholder="Search provider or request" value={query} />} description="A focused inbox for provider support. Read the full context, respond clearly, and keep every request accountable." eyebrow="Provider care" title="Support inbox" />
        {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
        <div className="grid gap-4 sm:grid-cols-3"><Card padding={false}><div className="p-5"><p className="text-sm font-semibold text-slate-500">Visible requests</p><p className="mt-2 text-3xl font-bold text-slate-950">{tickets.length}</p></div></Card><Card padding={false}><div className="p-5"><p className="text-sm font-semibold text-slate-500">Need a response</p><p className="mt-2 text-3xl font-bold text-fuchsia-700">{unread}</p></div></Card><Card padding={false}><div className="p-5"><p className="text-sm font-semibold text-slate-500">Active</p><p className="mt-2 text-3xl font-bold text-emerald-700">{active}</p></div></Card></div>
        <Card className="overflow-hidden p-0"><div className="grid min-h-[650px] lg:grid-cols-[365px_minmax(0,1fr)]"><aside className={`${selected ? 'hidden lg:block' : 'block'} border-b border-slate-100 lg:border-b-0 lg:border-r`}><div className="border-b border-slate-100 p-4"><div className="flex gap-2 overflow-x-auto pb-1">{statuses.map((item) => <button className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold capitalize ${status === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`} key={item} onClick={() => setStatus(item)} type="button">{item.replace('_', ' ')}</button>)}</div></div><div className="max-h-[570px] overflow-y-auto">{resource.loading ? <div className="p-4"><LoadingBlock rows={6} /></div> : tickets.length ? tickets.map((ticket) => { const selectedTicket = selected?.id === ticket.id; const unreadTicket = Number(ticket.admin_unread_count ?? 0) > 0; const provider = ticket.provider?.user ?? {}; return <button className={`flex w-full gap-3 border-b border-slate-50 px-4 py-4 text-left transition ${selectedTicket ? 'bg-slate-950 text-white' : 'hover:bg-slate-50'}`} key={ticket.id} onClick={() => openTicket(ticket.id)} type="button"><Avatar name={provider.name ?? 'Provider'} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{provider.name ?? 'Provider'}</span>{unreadTicket && <span className="grid size-5 place-items-center rounded-full bg-fuchsia-600 text-[10px] font-bold text-white">{ticket.admin_unread_count}</span>}</span><span className={`mt-1 block truncate text-xs font-semibold ${selectedTicket ? 'text-white/75' : 'text-slate-700'}`}>#{ticket.id} · {ticket.subject}</span><span className={`mt-1 block truncate text-xs ${selectedTicket ? 'text-white/55' : 'text-slate-400'}`}>{ticket.category} · {timeText(ticket.last_message_at)}</span><span className="mt-2 flex gap-2"><StatusBadge status={ticket.status} />{ticket.priority === 'high' && <StatusBadge status="pending" />}</span></span></button>; }) : <EmptyState description="Provider support requests will appear here." icon="chat" title="Inbox is clear" />}</div></aside><section className={`${selected ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col bg-slate-50`}>{selected ? <><header className="border-b border-slate-100 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><Button className="lg:hidden" onClick={() => setSelected(null)} type="button" variant="secondary">Back</Button><Avatar name={selected.provider?.user?.name ?? 'Provider'} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-bold text-slate-950">{selected.subject}</h2><StatusBadge status={selected.status} /></div><p className="mt-1 truncate text-xs text-slate-500">#{selected.id} · {selected.provider?.user?.name} · {selected.provider?.user?.email}</p></div></div><div className="flex shrink-0 gap-2"><select className="rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700" disabled={updating} onChange={(event) => updateTicket({ priority: event.target.value })} value={selected.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select><Button busy={updating} onClick={() => updateTicket({ status: selected.status === 'closed' ? 'open' : 'closed' })} type="button" variant="secondary">{selected.status === 'closed' ? 'Reopen' : 'Close'}</Button></div></div></header><div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" ref={threadRef}>{(selected.messages ?? []).map((message) => <article className={`flex gap-3 ${message.sender_role === 'admin' ? 'justify-end' : 'justify-start'}`} key={message.id}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.sender_role === 'admin' ? 'rounded-br-md bg-slate-950 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'}`}><div className={`mb-1 text-[10px] font-bold uppercase tracking-wide ${message.sender_role === 'admin' ? 'text-white/55' : 'text-fuchsia-600'}`}>{message.sender_role === 'admin' ? 'You / Support' : (message.sender?.name ?? 'Provider')} <span className="ml-1 font-medium normal-case tracking-normal">{timeText(message.created_at)}</span></div><p className="whitespace-pre-wrap">{message.body}</p></div></article>)}</div>{selected.status === 'closed' ? <p className="border-t border-slate-100 bg-white p-4 text-center text-sm text-slate-500">This request is closed. Reopen it to continue the conversation.</p> : <form className="border-t border-slate-100 bg-white p-3 sm:p-4" onSubmit={sendReply}><div className="mb-2 flex justify-end"><select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700" onChange={(event) => setReplyStatus(event.target.value)} value={replyStatus}><option value="pending_provider">Await provider reply</option><option value="resolved">Mark resolved after sending</option></select></div><div className="flex gap-2"><textarea className={`${inputClass} min-h-12 flex-1 resize-none`} onChange={(event) => setReply(event.target.value)} placeholder="Write a clear, helpful support reply…" rows="2" value={reply} /><Button busy={sending} type="submit">Send</Button></div></form>}</> : <EmptyState description="Select a request to see its complete conversation and respond." icon="chat" title="Provider support inbox" />}</section></div></Card>
    </div>;
}
