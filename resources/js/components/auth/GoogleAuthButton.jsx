import { useEffect, useRef, useState } from 'react';
import api, { apiError, unwrap } from '../../lib/api';
import { clearGoogleAttempt, prepareGoogleIdentity, selectGoogleAttempt } from '../../lib/googleIdentity';

function GoogleMark() {
    return (
        <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
            <path d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.8 3.1-4.4 3.1-7.6Z" fill="#4285F4" />
            <path d="M12 22c2.7 0 5-.9 6.7-2.3l-3.2-2.6c-.9.6-2 1-3.5 1a5.9 5.9 0 0 1-5.5-4.1H3.2v2.6A10 10 0 0 0 12 22Z" fill="#34A853" />
            <path d="M6.5 14a6 6 0 0 1 0-3.8V7.6H3.2a10 10 0 0 0 0 9l3.3-2.6Z" fill="#FBBC05" />
            <path d="M12 6.1c1.6 0 3 .5 4.1 1.6l3.1-3A10 10 0 0 0 3.2 7.6l3.3 2.6A5.9 5.9 0 0 1 12 6.1Z" fill="#EA4335" />
        </svg>
    );
}

export default function GoogleAuthButton({ href, label = 'Continue with Google', note, dividerLabel = 'or use email', onClick }) {
    const [enabled, setEnabled] = useState(false);
    const [popup, setPopup] = useState(false);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const buttonRef = useRef(null);
    const latest = useRef({ href, onClick });
    useEffect(() => { latest.current = { href, onClick }; }, [href, onClick]);

    useEffect(() => {
        let active = true;
        api.get('/auth/google/status')
            .then((response) => {
                if (!active) return;
                const settings = unwrap(response);
                setEnabled(Boolean(settings?.enabled));
                setPopup(Boolean(settings?.popup_enabled));
            })
            .catch(() => active && setEnabled(false));

        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!enabled || !popup) return;
        let active = true;
        const owner = {};
        const container = buttonRef.current;
        prepareGoogleIdentity().then((identity) => {
            if (!active || !container) return;
            identity.renderButton(container, {
                type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
                width: container.clientWidth || 300,
                click_listener: () => {
                    const { href: currentHref, onClick: currentOnClick } = latest.current;
                    currentOnClick?.();
                    const parameters = new URL(currentHref, window.location.origin).searchParams;
                    const context = Object.fromEntries(['intent', 'role', 'plan', 'redirect']
                        .filter((key) => parameters.has(key)).map((key) => [key, parameters.get(key)]));
                    selectGoogleAttempt(owner, async ({ credential }) => {
                        if (!active) return;
                        setBusy(true);
                        setError('');
                        try {
                            const result = unwrap(await api.post('/auth/google/popup', { ...context, intent: context.intent || 'login', credential }));
                            window.location.assign(result.redirect);
                        } catch (failure) {
                            if (active) {
                                setError(failure.response?.status === 406
                                    ? 'The hosting firewall blocked Google sign-in. Please use email and password.'
                                    : apiError(failure).message);
                                setBusy(false);
                            }
                        }
                    });
                },
            });
            setReady(true);
        }).catch((failure) => active && setError(failure.message));
        return () => {
            active = false;
            clearGoogleAttempt(owner);
            container?.replaceChildren();
        };
    }, [enabled, popup]);

    if (!enabled) return null;

    return (
        <>
            {popup ? <div className="w-full space-y-2">
                <div aria-label={label} className={`w-full [&>div]:!w-full [&>div>iframe]:!w-full ${busy ? 'pointer-events-none opacity-60' : ''}`} ref={buttonRef} />
                {(!ready || busy) && !error && <p role="status" className="text-center text-xs text-stone-500">{busy ? 'Signing in…' : 'Loading Google sign-in…'}</p>}
                {error && <div role="alert" className="text-center text-xs text-rose-700">{error} <button className="underline" type="button" onClick={() => window.location.reload()}>Reload to retry</button></div>}
            </div> : <a className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white px-5 text-sm font-semibold text-plum-950 shadow-sm transition hover:border-stone-400 hover:bg-stone-50" href={href} onClick={onClick}>
                <GoogleMark />
                {label}
            </a>}
            {note && <p className="text-center text-[11px] leading-5 text-stone-500">{note}</p>}
            {dividerLabel && <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-stone-400"><span className="h-px flex-1 bg-stone-200" />{dividerLabel}<span className="h-px flex-1 bg-stone-200" /></div>}
        </>
    );
}
