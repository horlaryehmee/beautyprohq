import { useEffect, useState } from 'react';
import api, { unwrap } from '../../lib/api';

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

export default function GoogleAuthButton({ href, label = 'Continue with Google', note, dividerLabel = 'or use email' }) {
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        let active = true;
        api.get('/auth/google/status')
            .then((response) => active && setEnabled(Boolean(unwrap(response)?.enabled)))
            .catch(() => active && setEnabled(false));

        return () => { active = false; };
    }, []);

    if (!enabled) return null;

    return (
        <>
            <a className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white px-5 text-sm font-semibold text-plum-950 shadow-sm transition hover:border-stone-400 hover:bg-stone-50" href={href}>
                <GoogleMark />
                {label}
            </a>
            {note && <p className="text-center text-[11px] leading-5 text-stone-500">{note}</p>}
            {dividerLabel && <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-stone-400"><span className="h-px flex-1 bg-stone-200" />{dividerLabel}<span className="h-px flex-1 bg-stone-200" /></div>}
        </>
    );
}
