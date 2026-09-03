import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Card, EmptyState, ErrorState, Field, LoadingBlock, StatusBadge, apiErrorMessage, apiRequest, formatDate, inputClass, useApiResource, useDashboardToast } from '../dashboard';

const categories = [
    ['general', 'General question'],
    ['account', 'Account & profile'],
    ['billing', 'Billing & subscription'],
    ['technical', 'Technical issue'],
    ['verification', 'Verification'],
];

const statuses = ['all', 'open', 'pending_provider', 'resolved', 'closed'];
const normalize = (value) => Array.isArray(value) ? value : value?.data ?? [];
const timeText = (value) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export default function ProviderSupportPanel() {
    const [status, setStatus] = useState('all');
    const [selected, setSelected] = useState(null);
    const [message, setMessage] = useState('');
    const [form, setForm] = useState({ subject: '', category: 'general', message: '' });
    const [creating, setCreating] = useState(false);
    const [sending, setSending] = useState(false);
    const threadRef = useRef(null);
    const { notify } = useDashboardToast();
    const resource = useApiResource('/provider/support', [], {
        params: { status: status === 'all' ? undefined : status, per_page: 50 },
        refreshInterval: 12000,
    });
    const tickets = useMemo(() => normalize(resource.data), [resource.data]);
    const unread = tickets.reduce((total, ticket) => total + Number(ticket.provider_unread_count ?? 0), 0);

    useEffect(() => {
        if (!selected?.id) return undefined;
        const interval = window.setInterval(() => openTicket(selected.id, true), 7000);
        return () => window.clearInterval(interval);
    }, [selected?.id]);

    function scrollToBottom() {
        window.setTimeout(() => {
            if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
        }, 20);
    }

    async function openTicket(ticketId, quiet = false) {
        try {
            const ticket = await apiRequest('get', `/provider/support/${ticketId}`);
            setSelected(ticket);
            resource.reload(true);
            if (!quiet) scrollToBottom();
        } catch (error) {
            if (!quiet) notify(apiErrorMessage(error), 'error');
        }
    }

    async function createTicket(event) {
        event.preventDefault();
        setCreating(true);
        try {
            const ticket = await apiRequest('post', '/provider/support', form);
            setForm({ subject: '', category: 'general', message: '' });
            setSelected(ticket);
            resource.reload(true);
            scrollToBottom();
            notify('Your support request has been sent.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setCreating(false);
        }
    }

    async function sendReply(event) {
        event.preventDefault();
        if (!message.trim() || !selected) return;
        const body = message.trim();
        setMessage('');
        setSending(true);
        try {
            const ticket = await apiRequest('post', `/provider/support/${selected.id}/messages`, { message: body });
            setSelected(ticket);
            resource.reload(true);
            scrollToBottom();
        } catch (error) {
            setMessage(body);
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="space-y-5">
            <Card className="overflow-hidden border-bphq-chrome/70 bg-gradient-to-br from-bphq-ivory via-white to-fuchsia-50" padding={false}>
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-bphq-coffee">Provider care</p>
                        <h2 className="mt-1 font-display text-2xl font-semibold text-bphq-espresso">How can we help?</h2>
                        <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Start a private request, follow every reply in one place, and keep your business moving.</p>
                    </div>
                    <Button onClick={() => { setSelected(null); setCreating(true); }} type="button">New support request</Button>
                </div>
            </Card>

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card className="overflow-hidden p-0">
                <div className="grid min-h-[620px] lg:grid-cols-[330px_minmax(0,1fr)]">
                    <aside className={`${selected ? 'hidden lg:block' : 'block'} border-b border-slate-100 lg:border-b-0 lg:border-r`}>
                        <div className="border-b border-slate-100 p-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Requests</p><p className="mt-1 text-xl font-bold text-slate-950">{tickets.length}</p></div>
                                <div className="rounded-2xl bg-fuchsia-50 p-3"><p className="text-[10px] font-bold uppercase text-fuchsia-500">New replies</p><p className="mt-1 text-xl font-bold text-fuchsia-700">{unread}</p></div>
                            </div>
                            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                                {statuses.map((item) => <button className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold capitalize ${status === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`} key={item} onClick={() => setStatus(item)} type="button">{item.replace('_', ' ')}</button>)}
                            </div>
                        </div>
                        <div className="max-h-[540px] overflow-y-auto">
                            {resource.loading ? <div className="p-4"><LoadingBlock rows={5} /></div> : tickets.length ? tickets.map((ticket) => {
                                const active = selected?.id === ticket.id;
                                const hasUnread = Number(ticket.provider_unread_count ?? 0) > 0;
                                return <button className={`flex w-full gap-3 border-b border-slate-50 px-4 py-4 text-left transition ${active ? 'bg-slate-950 text-white' : 'hover:bg-slate-50'}`} key={ticket.id} onClick={() => openTicket(ticket.id)} type="button">
                                    <span className={`mt-1 grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${active ? 'bg-white/15 text-white' : 'bg-fuchsia-50 text-fuchsia-700'}`}>#{ticket.id}</span>
                                    <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{ticket.subject}</span>{hasUnread && <span className="grid size-5 place-items-center rounded-full bg-fuchsia-600 text-[10px] font-bold text-white">{ticket.provider_unread_count}</span>}</span><span className={`mt-1 block truncate text-xs ${active ? 'text-white/60' : 'text-slate-500'}`}>{ticket.category.replace('_', ' ')} · {timeText(ticket.last_message_at)}</span><span className="mt-2 block"><StatusBadge status={ticket.status} /></span></span>
                                </button>;
                            }) : <EmptyState action={<Button onClick={() => setCreating(true)} type="button" variant="soft">Start a request</Button>} description="When you need our team, your requests will live here." icon="chat" title="No support requests" />}
                        </div>
                    </aside>

                    <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col bg-slate-50`}>
                        {selected ? <>
                            <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white p-4"><div className="flex min-w-0 items-center gap-3"><Button className="lg:hidden" onClick={() => setSelected(null)} type="button" variant="secondary">Back</Button><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate text-base font-bold text-slate-950">{selected.subject}</h3><StatusBadge status={selected.status} /></div><p className="mt-1 text-xs text-slate-500">Request #{selected.id} · {selected.category.replace('_', ' ')}</p></div></div><Button onClick={() => setCreating(true)} type="button" variant="secondary">New</Button></header>
                            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" ref={threadRef}>{(selected.messages ?? []).map((item) => <article className={`flex gap-3 ${item.sender_role === 'provider' ? 'justify-end' : 'justify-start'}`} key={item.id}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${item.sender_role === 'provider' ? 'rounded-br-md bg-slate-950 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'}`}><div className={`mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide ${item.sender_role === 'provider' ? 'text-white/55' : 'text-fuchsia-600'}`}>{item.sender_role === 'provider' ? 'You' : (item.sender?.name ?? 'BeautyPro HQ support')}<span className="font-medium normal-case tracking-normal">{timeText(item.created_at)}</span></div><p className="whitespace-pre-wrap">{item.body}</p></div></article>)}</div>
                            {selected.status === 'closed' ? <p className="border-t border-slate-100 bg-white p-4 text-center text-sm text-slate-500">This request is closed. Create a new request if you need more help.</p> : <form className="border-t border-slate-100 bg-white p-3 sm:p-4" onSubmit={sendReply}><div className="flex gap-2"><textarea className={`${inputClass} min-h-12 flex-1 resize-none`} onChange={(event) => setMessage(event.target.value)} placeholder="Add a reply…" rows="2" value={message} /><Button busy={sending} type="submit">Send</Button></div></form>}
                        </> : <EmptyState description="Choose a request to read the conversation, or start a new one." icon="chat" title="Your support inbox" />}
                    </section>
                </div>
            </Card>

            {creating && <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setCreating(false)}><Card className="w-full max-w-xl rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}><CardHeader description="Share enough detail for us to investigate quickly. Never include passwords, card details, or API keys." title="New support request" /><form className="space-y-4" onSubmit={createTicket}><Field label="What do you need help with?"><input className={inputClass} maxLength="180" onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="For example: I need help with my provider profile" required value={form.subject} /></Field><Field label="Category"><select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} value={form.category}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Details"><textarea className={`${inputClass} min-h-36`} maxLength="6000" minLength="10" onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Tell us what happened, what you expected, and any useful details." required value={form.message} /></Field><div className="flex justify-end gap-2"><Button onClick={() => setCreating(false)} type="button" variant="secondary">Cancel</Button><Button busy={creating} type="submit">Send request</Button></div></form></Card></div>}
        </div>
    );
}
