import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import api, { apiError, ensureCsrfCookie, unwrap } from '../../lib/api';
import Icon from '../../components/ui/Icon';

function timeOf(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function PublicChatThreadPage() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';

    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [reply, setReply] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (afterId) => {
        if (!id || !token) {
            setLoading(false);
            setError('This chat link is invalid or has expired.');
            return;
        }
        try {
            const opts = { params: { visitor_token: token, per_page: 100 } };
            if (afterId) opts.params.after_id = afterId;
            const response = await api.get(`/live-chat/conversations/${id}`, opts);
            const payload = unwrap(response);
            setConversation(payload);
            setMessages((current) => {
                const map = new Map();
                [...current, ...(payload?.messages ?? [])].forEach((message) => map.set(message.id, message));
                return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));
            });
        } catch (requestError) {
            setError(apiError(requestError, 'This chat could not be loaded.').message);
        } finally {
            setLoading(false);
        }
    }, [id, token]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const send = async (event) => {
        event.preventDefault();
        if (!reply.trim() || !id) return;
        setSending(true);
        setError('');
        try {
            await ensureCsrfCookie();
            const response = await api.post(`/live-chat/conversations/${id}/messages`, { message: reply }, {
                params: { visitor_token: token },
            });
            const created = unwrap(response);
            setMessages((current) => [...current, created].sort((a, b) => Number(a.id) - Number(b.id)));
            setReply('');
        } catch (requestError) {
            setError(apiError(requestError, 'Your reply could not be sent.').message);
        } finally {
            setSending(false);
        }
    };

    const providerName = useMemo(() => conversation?.provider_name ?? 'your beauty professional', [conversation]);

    if (loading) {
        return (
            <div className="min-h-[70vh] grid place-items-center px-4">
                <div className="animate-pulse space-y-3">
                    <div className="h-10 w-64 rounded-2xl bg-stone-200" />
                    <div className="h-24 w-full max-w-md rounded-2xl bg-stone-100" />
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-2xl px-4 py-8">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2A1D14]/60">Live chat</p>
                    <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-[#2A1D14]">Chat with {providerName}</h1>
                    <p className="mt-1 text-sm text-stone-500">Replies are added to your chat and sent to the provider.</p>
                </div>
                <Link className="hidden shrink-0 text-sm font-semibold text-[#2A1D14] underline sm:inline" to="/">BeautyPro HQ</Link>
            </div>

            <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
                <div className="flex h-[min(62vh,540px)] flex-col overflow-y-auto bg-[#F7F3ED] p-4 space-y-3" role="log" aria-live="polite">
                    {messages.length ? messages.map((message) => {
                        const mine = message.sender_type === 'visitor';
                        return (
                            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-6 ${mine ? 'bg-[#2A1D14] text-white' : 'border border-stone-200 bg-white text-stone-700'}`}>
                                    <p className="whitespace-pre-wrap">{message.body}</p>
                                    <p className={`mt-1 text-[10px] font-semibold ${mine ? 'text-white/55' : 'text-stone-400'}`}>{timeOf(message.created_at)}</p>
                                </div>
                            </div>
                        );
                    }) : (
                        <p className="m-auto text-sm text-stone-500">No messages yet. Start the conversation below.</p>
                    )}
                </div>

                <form className="border-t border-stone-100 p-3" onSubmit={send}>
                    {error && <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
                    <div className="flex items-end gap-2">
                        <textarea
                            className="min-h-11 flex-1 resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[#3A2A1F] focus:ring-4 focus:ring-stone-100"
                            onChange={(event) => setReply(event.target.value)}
                            placeholder="Type a reply..."
                            rows={1}
                            value={reply}
                        />
                        <button type="submit" disabled={sending || !reply.trim()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#2A1D14] text-white transition hover:bg-[#3A2A1F] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send reply">
                            <Icon name="arrow" size={18} />
                        </button>
                    </div>
                </form>
            </div>

            <p className="mt-4 text-center text-xs text-stone-500">This is a private conversation. For help, contact BeautyPro HQ support.</p>
        </div>
    );
}
