import { useEffect, useMemo, useRef, useState } from 'react';
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

function timeText(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mergeMessages(current, incoming) {
    const map = new Map();
    [...current, ...incoming].forEach((message) => map.set(message.id, message));
    return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));
}

export default function ProviderLiveChatPage() {
    const [status, setStatus] = useState('all');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(null);
    const [messages, setMessages] = useState([]);
    const [page, setPage] = useState({ has_older: false, oldest_id: null, newest_id: null });
    const [threadLoading, setThreadLoading] = useState(false);
    const [olderLoading, setOlderLoading] = useState(false);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const scroller = useRef(null);
    const search = useDebouncedValue(query);
    const { notify } = useDashboardToast();
    const resource = useApiResource('/provider/live-chat', [], {
        params: { status: status === 'all' ? undefined : status, search: search || undefined, per_page: 50 },
        refreshInterval: 8000,
    });
    const conversations = useMemo(() => normalize(resource.data), [resource.data]);
    const unread = conversations.reduce((sum, item) => sum + Number(item.provider_unread_count ?? 0), 0);

    useEffect(() => {
        if (!selected?.id) return undefined;
        const timer = window.setInterval(async () => {
            try {
                const payload = await apiRequest('get', `/provider/live-chat/${selected.id}`, undefined, {
                    params: { after_id: page.newest_id || undefined, per_page: 100 },
                });
                if (payload?.messages?.length) {
                    setMessages((current) => mergeMessages(current, payload.messages));
                    setPage((current) => ({
                        ...current,
                        newest_id: Math.max(Number(current.newest_id ?? 0), Number(payload.message_page?.newest_id ?? 0)) || current.newest_id,
                    }));
                    window.setTimeout(scrollToBottom, 30);
                }
            } catch {
                // Keep polling quiet; manual reload/open will surface errors.
            }
        }, 5000);
        return () => window.clearInterval(timer);
    }, [page.newest_id, selected?.id]);

    function scrollToBottom() {
        if (!scroller.current) return;
        scroller.current.scrollTop = scroller.current.scrollHeight;
    }

    async function openConversation(conversation) {
        setSelected(conversation);
        setMessages([]);
        setPage({ has_older: false, oldest_id: null, newest_id: null });
        setThreadLoading(true);
        setReply('');
        try {
            const payload = await apiRequest('get', `/provider/live-chat/${conversation.id}`, undefined, { params: { per_page: 60 } });
            setSelected(payload);
            setMessages(payload.messages ?? []);
            setPage(payload.message_page ?? {});
            resource.reload(true);
            window.setTimeout(scrollToBottom, 40);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setThreadLoading(false);
        }
    }

    async function loadOlder() {
        if (!selected?.id || !page.has_older || olderLoading) return;
        const previousHeight = scroller.current?.scrollHeight ?? 0;
        setOlderLoading(true);
        try {
            const payload = await apiRequest('get', `/provider/live-chat/${selected.id}`, undefined, {
                params: { before_id: page.oldest_id, per_page: 60 },
            });
            setMessages((current) => mergeMessages(payload.messages ?? [], current));
            setPage((current) => ({
                ...current,
                has_older: Boolean(payload.message_page?.has_older),
                oldest_id: payload.message_page?.oldest_id ?? current.oldest_id,
            }));
            window.setTimeout(() => {
                if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight - previousHeight;
            }, 30);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setOlderLoading(false);
        }
    }

    async function sendReply(event) {
        event.preventDefault();
        if (!reply.trim() || !selected?.id) return;
        const body = reply.trim();
        setReply('');
        setSending(true);
        try {
            const created = await apiRequest('post', `/provider/live-chat/${selected.id}/messages`, { message: body });
            setMessages((current) => mergeMessages(current, [created]));
            setPage((current) => ({ ...current, newest_id: Math.max(Number(current.newest_id ?? 0), Number(created.id)) || created.id }));
            setSelected((current) => current ? { ...current, status: 'waiting', last_message_at: created.created_at } : current);
            resource.reload(true);
            window.setTimeout(scrollToBottom, 30);
        } catch (error) {
            setReply(body);
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSending(false);
        }
    }

    async function updateStatus(nextStatus) {
        try {
            const payload = await apiRequest('patch', `/provider/live-chat/${selected.id}`, { status: nextStatus });
            setSelected((current) => ({ ...(current ?? {}), ...payload, messages: undefined }));
            resource.reload(true);
            notify(nextStatus === 'closed' ? 'Conversation closed.' : 'Conversation reopened.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<SearchInput className="w-full sm:w-80" onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" value={query} />}
                description="Manage customer conversations in separated threads with message paging and live polling."
                eyebrow="Pro feature"
                title="Live chat"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card className="overflow-hidden p-0">
                <div className="grid min-h-[calc(100dvh-12rem)] lg:min-h-[720px] lg:grid-cols-[360px_minmax(0,1fr)]">
                    <aside className={`${selected ? 'hidden lg:block' : 'block'} border-b border-slate-100 lg:border-b-0 lg:border-r`}>
                        <div className="border-b border-slate-100 p-4">
                            <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-[10px] font-bold uppercase text-slate-400">Shown</p>
                                    <p className="text-lg font-bold text-slate-950">{conversations.length}</p>
                                </div>
                                <div className="rounded-xl bg-fuchsia-50 p-3">
                                    <p className="text-[10px] font-bold uppercase text-fuchsia-500">Unread</p>
                                    <p className="text-lg font-bold text-fuchsia-700">{unread}</p>
                                </div>
                                <div className="rounded-xl bg-emerald-50 p-3">
                                    <p className="text-[10px] font-bold uppercase text-emerald-600">Open</p>
                                    <p className="text-lg font-bold text-emerald-700">{conversations.filter((item) => item.status !== 'closed').length}</p>
                                </div>
                            </div>
                            <div className="mt-4 flex gap-2 overflow-x-auto">
                                {filters.map((item) => (
                                    <button className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold capitalize transition ${status === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-900'}`} key={item} onClick={() => setStatus(item)} type="button">
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="h-[calc(100dvh-22rem)] min-h-[24rem] overflow-y-auto lg:h-[540px]">
                            {resource.loading ? <div className="p-4"><LoadingBlock rows={7} /></div> : conversations.length ? (
                                <div className="divide-y divide-slate-100">
                                    {conversations.map((conversation) => {
                                        const message = lastMessage(conversation);
                                        const active = selected?.id === conversation.id;
                                        const hasUnread = Number(conversation.provider_unread_count ?? 0) > 0;
                                        return (
                                            <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} className={`flex w-full gap-3 px-4 py-4 text-left transition ${active ? 'bg-slate-950 text-white' : 'hover:bg-slate-50'}`}>
                                                <Avatar name={conversation.visitor_name} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className={`truncate text-sm font-bold ${active ? 'text-white' : 'text-slate-950'}`}>{conversation.visitor_name}</p>
                                                        <span className={`shrink-0 text-[10px] font-semibold ${active ? 'text-white/55' : 'text-slate-400'}`}>{timeText(conversation.last_message_at)}</span>
                                                    </div>
                                                    <p className={`truncate text-xs ${active ? 'text-white/55' : 'text-slate-400'}`}>{conversation.service_name ?? conversation.booking?.service?.name ?? conversation.visitor_email}</p>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <p className={`line-clamp-1 flex-1 text-xs ${active ? 'text-white/70' : 'text-slate-500'}`}>{message?.body ?? 'No message yet'}</p>
                                                        {hasUnread && <span className="grid min-w-5 place-items-center rounded-full bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{conversation.provider_unread_count}</span>}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : <EmptyState description="Messages from profile visitors will appear as separate threads." icon="chat" title="No chats yet" />}
                        </div>
                    </aside>

                    <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col bg-slate-50`}>
                        {selected ? (
                            <>
                                <header className="flex items-center justify-between gap-2 border-b border-slate-100 bg-white p-3 sm:gap-3 sm:p-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Button className="shrink-0 lg:hidden" onClick={() => setSelected(null)} type="button" variant="secondary">Back</Button>
                                        <Avatar name={selected.visitor_name} size="lg" />
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="truncate text-base font-bold text-slate-950">{selected.visitor_name}</h2>
                                                <StatusBadge status={selected.status} />
                                            </div>
                                            <p className="truncate text-xs text-slate-500">{selected.service_name ?? 'Live chat'} · {selected.visitor_email}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        {selected.status === 'closed'
                                            ? <Button className="px-2.5 sm:px-4" onClick={() => updateStatus('open')} type="button" variant="secondary">Reopen</Button>
                                            : <Button className="px-2.5 sm:px-4" onClick={() => updateStatus('closed')} type="button" variant="secondary">Close</Button>}
                                    </div>
                                </header>

                                <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#efe7dc] p-3 sm:p-4">
                                    {threadLoading ? <LoadingBlock rows={7} /> : (
                                        <>
                                            {page.has_older && (
                                                <div className="flex justify-center">
                                                    <Button busy={olderLoading} onClick={loadOlder} type="button" variant="secondary">Load earlier messages</Button>
                                                </div>
                                            )}
                                            {messages.map((message) => {
                                                const mine = message.sender_type === 'provider';
                                                return (
                                                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm sm:max-w-[78%] sm:px-4 ${mine ? 'rounded-br-md bg-[#DCF8C6] text-slate-900' : 'rounded-bl-md bg-white text-slate-800'}`}>
                                                            <p className="whitespace-pre-wrap break-words">{message.body}</p>
                                                            <p className="mt-1 text-right text-[10px] font-semibold text-slate-400">{timeText(message.created_at)}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>

                                <form className="border-t border-slate-100 bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:p-4" onSubmit={sendReply}>
                                    <div className="flex items-end gap-3">
                                        <textarea className={`${inputClass} max-h-36 min-h-11 resize-none rounded-2xl`} disabled={selected.status === 'closed'} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) sendReply(event); }} placeholder={selected.status === 'closed' ? 'Reopen this conversation to reply.' : 'Message'} value={reply} />
                                        <Button busy={sending} className="min-h-11 rounded-2xl" disabled={selected.status === 'closed' || !reply.trim()} type="submit">Send</Button>
                                    </div>
                                </form>
                            </>
                        ) : (
                            <div className="grid flex-1 place-items-center p-8">
                                <EmptyState description="Choose a conversation on the left to open a dedicated message thread." icon="chat" title="Select a chat" />
                            </div>
                        )}
                    </section>
                </div>
            </Card>
        </div>
    );
}
