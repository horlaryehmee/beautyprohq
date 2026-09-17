import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { rememberNewsletterSubscription } from '../../lib/newsletter';

export default function NewsletterPopup() {
    const dialogRef = useRef(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        let shown = false;
        const onScroll = () => {
            if (shown || window.scrollY < 400 || document.querySelector('dialog[open], [aria-modal="true"]')) return;
            shown = true;
            dialogRef.current?.showModal();
        };
        const onSubscribed = () => { shown = true; };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('bphq-newsletter-subscribed', onSubscribed);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('bphq-newsletter-subscribed', onSubscribed);
            dialogRef.current?.close();
        };
    }, []);

    async function subscribe(event) {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const { default: api, ensureCsrfCookie } = await import('../../lib/api');
            await ensureCsrfCookie();
            await api.post('/newsletter/subscribe', { name: name.trim(), email: email.trim() });
            rememberNewsletterSubscription();
            setSuccess(true);
        } catch (requestError) {
            const fields = requestError?.response?.data?.errors;
            setError(fields?.name?.[0] || fields?.email?.[0] || requestError?.response?.data?.message || 'We could not add you right now. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <dialog ref={dialogRef} aria-labelledby="newsletter-popup-title" aria-describedby="newsletter-popup-description"
            className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overscroll-contain overflow-y-auto rounded-t-3xl border border-white/70 bg-[#F7F3ED] p-0 pb-[env(safe-area-inset-bottom)] text-[#2A1D14] shadow-[0_24px_100px_rgba(42,29,20,.3)] backdrop:bg-black/45 backdrop:backdrop-blur-sm sm:inset-0 sm:m-auto sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-[600px] sm:rounded-2xl sm:pb-0"
            onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
            }}>
            <div className="relative grid grid-cols-1 sm:grid-cols-[38%_1fr]">
                <div className="relative h-28 overflow-hidden bg-[#DCCCB8] sm:h-auto sm:min-h-full">
                    <img src="/brand/newsletter-beauty.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[center_43%] sm:object-[48%_center]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#2A1D14]/80 via-transparent to-[#2A1D14]/10" />
                    <div className="absolute inset-x-0 bottom-0 px-5 py-4 text-white sm:p-5">
                        <span className="mb-3 hidden h-px w-7 sm:block bg-white/60" />
                        <p className="hidden font-display text-lg leading-tight sm:block sm:text-3xl">Beauty.<br />In good company.</p>
                        <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-white sm:mt-3 sm:text-[9px] sm:text-white/75">BeautyPro HQ</p>
                    </div>
                </div>
                <div className="px-5 pb-3 pt-5 sm:relative sm:p-7 sm:pt-10">
                    <button type="button" autoFocus aria-label="Close newsletter popup" onClick={() => dialogRef.current?.close()} className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-full bg-[#F7F3ED]/95 text-stone-700 shadow-sm transition hover:bg-stone-200 sm:right-1 sm:top-1 sm:bg-transparent sm:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                    </button>
                    <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] sm:text-[9px] text-stone-500"><span className="h-px w-5 bg-stone-400" />The beauty edit</p>
                    <h2 id="newsletter-popup-title" className="font-display text-[30px] leading-[1.12] sm:text-[32px]">{success ? "You're on the list!" : <>Your inbox,<br className="hidden sm:block" />{' '}<span className="italic">a little prettier.</span></>}</h2>
                    <p id="newsletter-popup-description" className="mt-2 text-[13px] leading-5 sm:text-xs text-stone-600">{success ? 'Welcome to the BeautyPro HQ community. Look out for your next beauty update.' : 'Fresh beauty news, events & opportunities. Curated for you.'}</p>
                    {success ? <button type="button" onClick={() => dialogRef.current?.close()} className="mt-5 min-h-11 w-full rounded-lg bg-[#2A1D14] px-3 text-xs font-semibold text-white">Keep exploring</button> : (
                        <form onSubmit={subscribe} className="mt-4 space-y-2.5">
                            <label className="block">
                                <span className="sr-only">Your name</span>
                                <input required maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="min-h-12 w-full rounded-xl border sm:min-h-11 sm:rounded-lg border-stone-200 bg-white/80 px-3 text-base focus:outline-2 focus:outline-[#3A2A1F] sm:text-xs" placeholder="Your name" />
                            </label>
                            <label className="block">
                                <span className="sr-only">Email address</span>
                                <input required type="email" maxLength={255} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-12 w-full rounded-xl border sm:min-h-11 sm:rounded-lg border-stone-200 bg-white/80 px-3 text-base focus:outline-2 focus:outline-[#3A2A1F] sm:text-xs" placeholder="Email address" />
                            </label>
                            {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
                            <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl sm:min-h-11 sm:rounded-lg bg-[#2A1D14] px-3 text-sm font-semibold text-white transition sm:text-xs hover:bg-[#3A2A1F] disabled:opacity-60">{busy ? 'Joining...' : <>Count me in <span aria-hidden="true">&rarr;</span></>}</button>
                            <p className="text-center text-[11px] leading-5 sm:text-[10px] sm:leading-4 text-stone-500">Unsubscribe anytime. <Link to="/privacy-policy" className="underline underline-offset-2">Privacy</Link></p>
                            <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-11 w-full text-xs sm:min-h-8 sm:text-[11px] text-stone-500 hover:text-stone-900">Maybe later</button>
                        </form>
                    )}
                </div>
            </div>
        </dialog>
    );
}
