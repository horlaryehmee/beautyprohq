import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const consentKey = 'bphq_cookie_consent_v1';

export default function CookieConsentBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setVisible(window.localStorage.getItem(consentKey) !== 'accepted');
    }, []);

    const acceptCookies = () => {
        window.localStorage.setItem(consentKey, 'accepted');
        setVisible(false);
    };

    if (!visible) {
        return null;
    }

    return (
        <div className="fixed inset-x-0 bottom-0 z-[80] px-4 pb-4 sm:px-6">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-950/15 backdrop-blur md:flex-row md:items-center md:justify-between">
                <div className="max-w-3xl">
                    <p className="text-sm font-bold text-slate-950">Cookie notice</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                        BeautyPro HQ uses essential cookies and local storage to keep the site secure, remember preferences, and support login features.
                        See our <Link className="font-bold text-plum-700 hover:text-plum-900" to="/privacy-policy">Privacy Policy</Link> and{' '}
                        <Link className="font-bold text-plum-700 hover:text-plum-900" to="/terms-and-conditions">Terms</Link>.
                    </p>
                </div>
                <button
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-plum-950 px-5 text-sm font-bold text-white transition hover:bg-plum-800 focus:outline-none focus:ring-2 focus:ring-plum-400 focus:ring-offset-2"
                    onClick={acceptCookies}
                    type="button"
                >
                    Accept cookies
                </button>
            </div>
        </div>
    );
}
