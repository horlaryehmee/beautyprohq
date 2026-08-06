import { useMemo, useState } from 'react';
import {
    Avatar,
    Button,
    Card,
    EmptyState,
    ErrorState,
    LoadingBlock,
    PageHeader,
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

const normalize = (value) => Array.isArray(value) ? value : value?.data ?? value?.conversations ?? [];
const filters = ['all', 'open', 'waiting', 'closed'];

function lastMessage(conversation) {
    const messages = conversation.messages ?? [];
    return messages[0] ?? conversation.last_message ?? null;
}

export default function ProviderLiveChatPage() {
    const [status, setStatus] = useState('all');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(null);
    const [threadLoading, setThreadLoading] = useState(false);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const search = useDebouncedValue(query);
    const { notify } = useDashboardToast();
    const resource = useApiResource('/provider/live-chat', [], {
        params: { status: status === 'all' ? undefined : status, search: search || undefined },
        refreshInterval: 12000,
    });
    const conversations = useMemo(() => normalize(resource.data), [resource.data]);
    const unread = conversations.reduce((sum, item) => sum + Number(item.provider_unread_count ?? 0), 0);

    async function openConversation(conversation) {
        setSelected(conversation);
        setThreadLoading(true);
        setReply('');
        try {
            const payload = await apiRequest('get', `/provider/live-chat/${conversation.id}`);
            setSelected(payload);
            resource.reload(true);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setThreadLoading(false);
        }
    }

    async function sendReply(event) {
        event.preventDefault();
        if (!reply.trim() || !selected?.id) return;
        setSending(true);
        try {
            await apiRequest('post', `/provider/live-chat/${selected.id}/messages`, { message: reply });
            setReply('');
            const payload = await apiRequest('get', `/provider/live-chat/${selected.id}`);
            setSelected(payload);
            resource.reload(true);
            notify('Reply sent to customer email.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSending(false);
        }
    }

    async function updateStatus(nextStatus) {
        try {
            const payload = await apiRequest('patch', `/provider/live-chat/${selected.id}`, { status: nextStatus });
            setSelected(payload);
            resource.reload(true);
            notify(nextStatus === 'closed' ? 'Conversation closed.' : 'Conversation reopened.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<SearchInput className="w-full sm:w-80" onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, message" value={query} />}
                description="Answer profile visitors from your dashboard. Customers receive an email notification when you reply."
                eyebrow="Pro feature"
                title="Live chat"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Active threads</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{conversations.filter((item) => item.status !== 'closed').length}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Unread</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{unread}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total shown</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{conversations.length}</p>
                </Card>
            </div>

            <Card>
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {filters.map((item) => (
                        <button className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold capitalize transition ${status === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-900'}`} key={item} onClick={() => setStatus(item)} type="button">
                            {item}
                        </button>
                    ))}
                </div>

                {resource.loading ? <div className="mt-5"><LoadingBlock rows={6} /></div> : conversations.length ? (
                    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
                        <div className="divide-y divide-slate-100">
                            {conversations.map((conversation) => {
                                const message = lastMessage(conversation);
                                const hasUnread = Number(conversation.provider_unread_count ?? 0) > 0;
                                return (
                                    <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} className="grid w-full gap-4 px-4 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[minmax(220px,1fr)_1.3fr_110px_120px] lg:items-center">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Avatar name={conversation.visitor_name} />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-sm font-bold text-slate-950">{conversation.visitor_name}</p>
                                                    {hasUnread && <span className="rounded-full bg-fuchsia-600 px-2 py-0.5 text-[10px] font-bold text-white">{conversation.provider_unread_count}</span>}
                                                </div>
                                                <p className="truncate text-xs text-slate-400">{conversation.visitor_email}</p>
                                            </div>
                                        </div>
                                        <p className="line-clamp-2 text-sm leading-6 text-slate-600">{message?.body ?? 'No message yet'}</p>
                                        <StatusBadge status={conversation.status} />
                                        <p className="text-xs font-semibold text-slate-400">{formatDate(conversation.last_message_at ?? conversation.updated_at, { year: undefined })}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : <EmptyState description="Live chat messages from your public provider profile will appear here." icon="chat" title="No live chats yet" />}
            </Card>

            {selected && (
                <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setSelected(null)}>
                    <Card className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-b-none p-0 sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
                            <div className="flex min-w-0 items-center gap-3">
                                <Avatar name={selected.visitor_name} size="lg" />
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="truncate text-lg font-bold text-slate-950">{selected.visitor_name}</h2>
                                        <StatusBadge status={selected.status} />
                                    </div>
                                    <p className="truncate text-sm text-slate-500">{selected.visitor_email}</p>
                                </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                {selected.status === 'closed'
                                    ? <Button onClick={() => updateStatus('open')} type="button" variant="secondary">Reopen</Button>
                                    : <Button onClick={() => updateStatus('closed')} type="button" variant="secondary">Close</Button>}
                                <Button onClick={() => setSelected(null)} type="button" variant="ghost">Dismiss</Button>
                            </div>
                        </header>

                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
                            {threadLoading ? <LoadingBlock rows={5} /> : (selected.messages ?? []).map((message) => {
                                const mine = message.sender_type === 'provider';
                                return (
                                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${mine ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
                                            <p className="whitespace-pre-wrap">{message.body}</p>
                                            <p className={`mt-1 text-[10px] font-semibold ${mine ? 'text-white/55' : 'text-slate-400'}`}>{new Date(message.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <form className="border-t border-slate-100 p-4" onSubmit={sendReply}>
                            <textarea className={`${inputClass} min-h-28 resize-y`} disabled={selected.status === 'closed'} onChange={(event) => setReply(event.target.value)} placeholder={selected.status === 'closed' ? 'Reopen this conversation to reply.' : 'Type your reply...'} value={reply} />
                            <div className="mt-3 flex justify-end">
                                <Button busy={sending} disabled={selected.status === 'closed' || !reply.trim()} type="submit">Send reply</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
