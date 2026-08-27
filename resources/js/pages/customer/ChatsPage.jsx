import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Avatar,
    Button,
    Card,
    EmptyState,
    ErrorState,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.data ?? value?.conversations ?? [];

function lastMessage(conversation) {
    return (conversation.messages ?? [])[0] ?? conversation.last_message ?? null;
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

export default function CustomerChatsPage() {
    const [selected, setSelected] = useState(null);
    const [messages, setMessages] = useState([]);
    const [page, setPage] = useState({ has_older: false, oldest_id: null, newest_id: null });
    const [threadLoading, setThreadLoading] = useState(false);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    const scroller = useRef(null);
    const { notify } = useDashboardToast();
    const resource = useApiResource('/customer/live-chat', [], { refreshInterval: 8000 });
    const conversations = useMemo(() => normalize(resource.data), [resource.data]);

    useEffect(() => {
        if (!selected?.id) return undefined;
        const timer = window.setInterval(async () => {
            try {
                const payload = await apiRequest('get', `/customer/live-chat/${selected.id}`, undefined, {
                    params: { after_id: page.newest_id || undefined, per_page: 100 },
                });
                if (payload?.messages?.length) {
                    setMessages((current) => mergeMessages(current, payload.messages));
                    setPage((current) => ({ ...current, newest_id: payload.message_page?.newest_id ?? current.newest_id }));
                    window.setTimeout(scrollToBottom, 30);
                }
            } catch {
                // Poll quietly; manual actions surface errors.
            }
        }, 5000);
        return () => window.clearInterval(timer);
    }, [page.newest_id, selected?.id]);

    function scrollToBottom() {
        if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    }

    async function openConversation(conversation) {
        setSelected(conversation);
        setMessages([]);
        setThreadLoading(true);
        setReply('');
        try {
            const payload = await apiRequest('get', `/customer/live-chat/${conversation.id}`, undefined, { params: { per_page: 60 } });
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

    async function sendReply(event) {
        event.preventDefault();
        if (!reply.trim() || !selected?.id) return;
        const body = reply.trim();
        setReply('');
        setSending(true);
        try {
            const created = await apiRequest('post', `/customer/live-chat/${selected.id}/messages`, { message: body });
            setMessages((current) => mergeMessages(current, [created]));
            setPage((current) => ({ ...current, newest_id: Math.max(Number(current.newest_id ?? 0), Number(created.id)) || created.id }));
            resource.reload(true);
            window.setTimeout(scrollToBottom, 30);
        } catch (error) {
            setReply(body);
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader description="Chat with providers for bookings that are currently pending or confirmed." eyebrow="Bookings" title="Chats" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card className="overflow-hidden p-0">
                <div className="grid min-h-[calc(100dvh-12rem)] lg:min-h-[680px] lg:grid-cols-[340px_minmax(0,1fr)]">
                    <aside className={`${selected ? 'hidden lg:block' : 'block'} border-b border-slate-100 lg:border-b-0 lg:border-r`}>
                        <div className="h-[calc(100dvh-16rem)] min-h-[28rem] overflow-y-auto lg:h-[620px]">
                            {resource.loading ? <div className="p-4"><LoadingBlock rows={7} /></div> : conversations.length ? (
                                <div className="divide-y divide-slate-100">
                                    {conversations.map((conversation) => {
                                        const provider = conversation.provider?.user ?? {};
                                        const message = lastMessage(conversation);
                                        const active = selected?.id === conversation.id;
                                        const hasUnread = Number(conversation.visitor_unread_count ?? 0) > 0;

                                        return (
                                            <button className={`flex w-full gap-3 px-4 py-4 text-left transition ${active ? 'bg-slate-950 text-white' : 'hover:bg-slate-50'}`} key={conversation.id} onClick={() => openConversation(conversation)} type="button">
                                                <Avatar name={provider.name ?? conversation.provider_name} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className={`truncate text-sm font-bold ${active ? 'text-white' : 'text-slate-950'}`}>{provider.name ?? conversation.provider_name}</p>
                                                        <span className={`shrink-0 text-[10px] font-semibold ${active ? 'text-white/55' : 'text-slate-400'}`}>{timeText(conversation.last_message_at)}</span>
                                                    </div>
                                                    <p className={`truncate text-xs ${active ? 'text-white/55' : 'text-slate-400'}`}>{conversation.service_name ?? conversation.booking?.service?.name ?? 'Booking chat'}</p>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <p className={`line-clamp-1 flex-1 text-xs ${active ? 'text-white/70' : 'text-slate-500'}`}>{message?.body ?? 'No message yet'}</p>
                                                        {hasUnread && <span className="grid min-w-5 place-items-center rounded-full bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{conversation.visitor_unread_count}</span>}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : <EmptyState description="Active booking chats will appear here after you book a service." icon="chat" title="No active chats" />}
                        </div>
                    </aside>

                    <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col bg-slate-50`}>
                        {selected ? (
                            <>
                                <header className="flex items-center gap-2 border-b border-slate-100 bg-white p-3 sm:gap-3 sm:p-4">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Button className="shrink-0 lg:hidden" onClick={() => setSelected(null)} type="button" variant="secondary">Back</Button>
                                        <Avatar name={selected.provider_name} size="lg" />
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="truncate text-base font-bold text-slate-950">{selected.provider_name}</h2>
                                                <StatusBadge status={selected.status} />
                                            </div>
                                            <p className="truncate text-xs text-slate-500">{selected.service_name ?? 'Booking chat'}</p>
                                        </div>
                                    </div>
                                </header>

                                <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#efe7dc] p-3 sm:p-4">
                                    {threadLoading ? <LoadingBlock rows={7} /> : messages.map((message) => {
                                        const mine = message.sender_type === 'visitor';
                                        return (
                                            <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`} key={message.id}>
                                                <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm sm:max-w-[78%] sm:px-4 ${mine ? 'rounded-br-md bg-[#DCF8C6] text-slate-900' : 'rounded-bl-md bg-white text-slate-800'}`}>
                                                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                                                    <p className="mt-1 text-right text-[10px] font-semibold text-slate-400">{timeText(message.created_at)}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <form className="border-t border-slate-100 bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:p-4" onSubmit={sendReply}>
                                    <div className="flex items-end gap-3">
                                        <textarea className={`${inputClass} max-h-36 min-h-11 resize-none rounded-2xl`} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) sendReply(event); }} placeholder="Message" value={reply} />
                                        <Button busy={sending} className="min-h-11 rounded-2xl" disabled={!reply.trim()} type="submit">Send</Button>
                                    </div>
                                </form>
                            </>
                        ) : (
                            <div className="grid flex-1 place-items-center p-8">
                                <EmptyState description="Choose an active booking chat to open the message thread." icon="chat" title="Select a chat" />
                            </div>
                        )}
                    </section>
                </div>
            </Card>
        </div>
    );
}
