import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { apiError, ensureCsrfCookie, unwrap } from '../../lib/api';
import Button from '../ui/Button';
import Icon from '../ui/Icon';

const initialForm = { name: '', email: '', message: '' };

function storageKey(providerId) {
    return `bphq_live_chat_${providerId}`;
}

export default function LiveChatWidget({ providerId, providerName }) {
    const [open, setOpen] = useState(false);
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagePage, setMessagePage] = useState({ newest_id: null });
    const [form, setForm] = useState(initialForm);
    const [reply, setReply] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const stored = useMemo(() => {
        if (!providerId) return null;
        try {
            return JSON.parse(window.localStorage.getItem(storageKey(providerId)) || 'null');
        } catch {
            return null;
        }
    }, [providerId]);

    const loadConversation = useCallback(async (silent = false) => {
        if (!stored?.id || !stored?.visitor_token) return;
        if (!silent) setLoading(true);
        setError('');
        try {
            const response = await api.get(`/live-chat/conversations/${stored.id}`, {
                params: { visitor_token: stored.visitor_token, per_page: 60 },
            });
            const payload = unwrap(response);
            setConversation(payload);
            setMessages(payload?.messages ?? []);
            setMessagePage(payload?.message_page ?? {});
            setForm((current) => ({
                ...current,
                name: payload?.visitor_name ?? current.name,
                email: payload?.visitor_email ?? current.email,
            }));
        } catch {
            window.localStorage.removeItem(storageKey(providerId));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [providerId, stored?.id, stored?.visitor_token]);

    useEffect(() => {
        loadConversation(true);
    }, [loadConversation]);

    useEffect(() => {
        if (!open || !conversation?.id) return undefined;
        const timer = window.setInterval(async () => {
            try {
                const response = await api.get(`/live-chat/conversations/${conversation.id}`, {
                    params: {
                        visitor_token: conversation.visitor_token,
                        after_id: messagePage.newest_id || undefined,
                        per_page: 100,
                    },
                });
                const payload = unwrap(response);
                if (payload?.messages?.length) {
                    setMessages((current) => {
                        const map = new Map();
                        [...current, ...payload.messages].forEach((message) => map.set(message.id, message));
                        return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));
                    });
                    setMessagePage((current) => ({
                        ...current,
                        newest_id: Math.max(Number(current.newest_id ?? 0), Number(payload.message_page?.newest_id ?? 0)) || current.newest_id,
                    }));
                }
            } catch {
                // Keep background polling quiet.
            }
        }, 5000);
        return () => window.clearInterval(timer);
    }, [conversation?.id, conversation?.visitor_token, messagePage.newest_id, open]);

    function updateForm(key, value) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    async function startChat(event) {
        event.preventDefault();
        setLoading(true);
        setError('');
        try {
            await ensureCsrfCookie();
            const response = await api.post(`/providers/${providerId}/chat/conversations`, form);
            const payload = unwrap(response);
            window.localStorage.setItem(storageKey(providerId), JSON.stringify({
                id: payload.id,
                visitor_token: payload.visitor_token,
            }));
            setConversation(payload);
            setMessages(payload?.messages ?? []);
            setMessagePage(payload?.message_page ?? {});
            setReply('');
        } catch (requestError) {
            setError(apiError(requestError, 'Your message could not be sent.').message);
        } finally {
            setLoading(false);
        }
    }

    async function sendReply(event) {
        event.preventDefault();
        if (!reply.trim() || !conversation?.id) return;
        setLoading(true);
        setError('');
        try {
            await ensureCsrfCookie();
            const response = await api.post(`/live-chat/conversations/${conversation.id}/messages`, { message: reply }, {
                params: { visitor_token: conversation.visitor_token },
            });
            const created = unwrap(response);
            setMessages((current) => [...current, created].sort((a, b) => Number(a.id) - Number(b.id)));
            setMessagePage((current) => ({ ...current, newest_id: Math.max(Number(current.newest_id ?? 0), Number(created.id)) || created.id }));
            setReply('');
        } catch (requestError) {
            setError(apiError(requestError, 'Your reply could not be sent.').message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed bottom-[max(.75rem,env(safe-area-inset-bottom))] right-1 z-[90] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:right-6">
            {open && (
                <section className="mb-3 flex h-[min(640px,calc(100vh-8rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[1.6rem] border border-stone-200 bg-white shadow-[0_22px_70px_rgba(42,29,20,.22)] sm:h-[min(640px,calc(100vh-7rem))] sm:w-96">
                    <header className="flex items-center justify-between gap-3 bg-[#2A1D14] px-4 py-3 text-white">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">Chat with {providerName}</p>
                            <p className="text-xs text-white/65">Replies are sent to your email.</p>
                        </div>
                        <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/20" aria-label="Close live chat">
                            <Icon name="x" size={17} />
                        </button>
                    </header>

                    {conversation ? (
                        <>
                            <div className="flex-1 space-y-3 overflow-y-auto bg-[#F7F3ED] p-4">
                                {messages.map((message) => {
                                    const mine = message.sender_type === 'visitor';
                                    return (
                                        <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-6 ${mine ? 'bg-[#2A1D14] text-white' : 'border border-stone-200 bg-white text-stone-700'}`}>
                                                <p className="whitespace-pre-wrap">{message.body}</p>
                                                <p className={`mt-1 text-[10px] font-semibold ${mine ? 'text-white/55' : 'text-stone-400'}`}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <form className="border-t border-stone-100 p-3" onSubmit={sendReply}>
                                {error && <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
                                <div className="flex items-end gap-2">
                                    <textarea className="min-h-11 flex-1 resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#3A2A1F] focus:ring-4 focus:ring-stone-100" onChange={(event) => setReply(event.target.value)} placeholder="Type a reply..." rows={1} value={reply} />
                                    <button type="submit" disabled={loading || !reply.trim()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#2A1D14] text-white transition hover:bg-[#3A2A1F] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send reply">
                                        <Icon name="arrow" size={18} />
                                    </button>
                                </div>
                            </form>
                        </>
                    ) : (
                        <form className="space-y-3 p-4" onSubmit={startChat}>
                            <p className="text-sm leading-6 text-stone-600">Send a message and leave your details so {providerName} can reply directly.</p>
                            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
                            <input className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-[#3A2A1F] focus:ring-4 focus:ring-stone-100" onChange={(event) => updateForm('name', event.target.value)} placeholder="Your name" required value={form.name} />
                            <input className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-[#3A2A1F] focus:ring-4 focus:ring-stone-100" onChange={(event) => updateForm('email', event.target.value)} placeholder="Email for replies" required type="email" value={form.email} />
                            <textarea className="min-h-28 w-full resize-y rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-[#3A2A1F] focus:ring-4 focus:ring-stone-100" onChange={(event) => updateForm('message', event.target.value)} placeholder="How can they help?" required value={form.message} />
                            <Button className="w-full" disabled={loading} type="submit">{loading ? 'Sending...' : 'Start chat'}</Button>
                        </form>
                    )}
                </section>
            )}

            <button type="button" onClick={() => setOpen((value) => !value)} className="ml-auto grid size-14 place-items-center rounded-2xl border border-[#2A1D14] bg-[#2A1D14] text-white shadow-[0_12px_40px_rgba(41,19,31,.18)] transition hover:bg-[#3A2A1F] sm:flex sm:min-h-14 sm:w-auto sm:items-center sm:gap-2 sm:rounded-full sm:px-5 sm:text-sm sm:font-semibold" aria-label={open ? 'Close live chat' : 'Open live chat'} title={open ? 'Close live chat' : 'Live chat'}>
                <Icon name={open ? 'x' : 'chat'} size={18} />
                <span className="hidden sm:inline">{open ? 'Close' : 'Live chat'}</span>
            </button>
        </div>
    );
}
