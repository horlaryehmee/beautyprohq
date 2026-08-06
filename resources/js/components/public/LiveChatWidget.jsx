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
                params: { visitor_token: stored.visitor_token },
            });
            const payload = unwrap(response);
            setConversation(payload);
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
        const timer = window.setInterval(() => loadConversation(true), 10000);
        return () => window.clearInterval(timer);
    }, [conversation?.id, loadConversation, open]);

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
            await api.post(`/live-chat/conversations/${conversation.id}/messages`, { message: reply }, {
                params: { visitor_token: conversation.visitor_token },
            });
            setReply('');
            await loadConversation(true);
        } catch (requestError) {
            setError(apiError(requestError, 'Your reply could not be sent.').message);
        } finally {
            setLoading(false);
        }
    }

    const messages = conversation?.messages ?? [];

    return (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[75] sm:right-6">
            {open && (
                <section className="mb-3 flex h-[min(640px,calc(100vh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[1.6rem] border border-stone-200 bg-white shadow-[0_22px_70px_rgba(42,29,20,.22)] sm:w-96">
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

            <button type="button" onClick={() => setOpen((value) => !value)} className="ml-auto flex min-h-14 items-center gap-2 rounded-full bg-[#2A1D14] px-5 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(42,29,20,.28)] transition hover:bg-[#3A2A1F]">
                <Icon name={open ? 'x' : 'mail'} size={18} />
                {open ? 'Close' : 'Live chat'}
            </button>
        </div>
    );
}
