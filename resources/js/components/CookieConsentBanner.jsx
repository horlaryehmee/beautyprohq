import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Cookie, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

const consentKey = 'bphq_cookie_consent_v2';
const preferencesKey = 'bphq_cookie_preferences_v2';

const defaultPreferences = {
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
};

function PreferenceRow({ title, description, field, locked = false, preferences, setPreferences }) {
    const enabled = Boolean(preferences[field]);

    return (
        <div className="flex items-start gap-3 rounded-xl border border-plum-200/80 bg-cream-50/70 p-3">
            <button
                aria-label={`${title} cookie preference`}
                aria-pressed={enabled}
                className={cn(
                    'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md border transition',
                    locked
                        ? 'cursor-not-allowed border-plum-200 bg-plum-100 text-plum-500'
                        : 'border-plum-300 bg-white text-plum-950 hover:border-plum-500 hover:bg-plum-100'
                )}
                disabled={locked}
                onClick={() => {
                    if (!locked) {
                        setPreferences((current) => ({ ...current, [field]: !current[field] }));
                    }
                }}
                type="button"
            >
                {enabled && <Check className="size-3.5" aria-hidden="true" />}
            </button>
            <div className="min-w-0">
                <p className="text-xs font-bold text-plum-950">
                    {title}
                    {locked && <span className="ml-1 font-semibold text-plum-500">(required)</span>}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-plum-600">{description}</p>
            </div>
        </div>
    );
}

export default function CookieConsentBanner() {
    const [render, setRender] = useState(false);
    const [visible, setVisible] = useState(false);
    const [showPreferences, setShowPreferences] = useState(false);
    const [preferences, setPreferences] = useState(defaultPreferences);

    useEffect(() => {
        const storedConsent = window.localStorage.getItem(consentKey);
        const storedPreferences = window.localStorage.getItem(preferencesKey);

        if (storedPreferences) {
            try {
                setPreferences({
                    ...defaultPreferences,
                    ...JSON.parse(storedPreferences),
                    necessary: true,
                });
            } catch {
                setPreferences(defaultPreferences);
            }
        }

        if (storedConsent !== 'accepted') {
            setRender(true);
            window.requestAnimationFrame(() => setVisible(true));
        }
    }, []);

    const closePanel = ({ persist = false } = {}) => {
        if (persist) {
            window.localStorage.setItem(consentKey, 'accepted');
        }

        setVisible(false);
        window.setTimeout(() => setRender(false), 220);
    };

    const savePreferences = (nextPreferences) => {
        const normalized = { ...nextPreferences, necessary: true };
        window.localStorage.setItem(preferencesKey, JSON.stringify(normalized));
        closePanel({ persist: true });
    };

    const acceptAll = () => {
        savePreferences({
            necessary: true,
            functional: true,
            analytics: true,
            marketing: true,
        });
    };

    const acceptNecessaryOnly = () => {
        savePreferences(defaultPreferences);
    };

    if (!render) {
        return null;
    }

    return (
        <div
            aria-label="Cookie consent"
            aria-live="polite"
            className="fixed inset-x-3 bottom-3 z-[90] sm:bottom-5 sm:right-5 sm:left-auto sm:w-[390px]"
            role="dialog"
        >
            <div
                className={cn(
                    'overflow-hidden rounded-2xl border border-plum-200/80 bg-white/95 text-plum-950 shadow-2xl shadow-plum-950/20 backdrop-blur-xl transition duration-200 ease-out',
                    visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                )}
            >
                <div className="flex items-start gap-3 border-b border-plum-100 p-4">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-plum-950 text-cream-50 shadow-sm">
                        <Cookie className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-plum-950">This site uses cookies</p>
                        <p className="mt-1 text-xs leading-5 text-plum-600">
                            We use essential cookies and local storage for secure login, preferences, and platform reliability.
                        </p>
                    </div>
                    <button
                        aria-label="Close cookie banner"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-plum-500 transition hover:bg-plum-100 hover:text-plum-950"
                        onClick={() => closePanel()}
                        type="button"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </button>
                </div>

                <div className="space-y-3 p-4">
                    <p className="text-xs leading-5 text-plum-600">
                        You can accept all cookies or manage optional categories. Read our{' '}
                        <Link className="font-bold text-plum-950 underline decoration-plum-300 underline-offset-4 hover:text-plum-700" to="/privacy-policy">
                            Privacy Policy
                        </Link>{' '}
                        and{' '}
                        <Link className="font-bold text-plum-950 underline decoration-plum-300 underline-offset-4 hover:text-plum-700" to="/terms-and-conditions">
                            Terms
                        </Link>.
                    </p>

                    <button
                        aria-controls="cookie-preferences"
                        aria-expanded={showPreferences}
                        className="flex w-full items-center justify-between rounded-xl border border-plum-200 bg-cream-50 px-3 py-2 text-xs font-bold text-plum-950 transition hover:bg-plum-100"
                        onClick={() => setShowPreferences((current) => !current)}
                        type="button"
                    >
                        Customize preferences
                        {showPreferences ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
                    </button>

                    <div
                        className={cn(
                            'grid transition-[grid-template-rows] duration-200 ease-out',
                            showPreferences ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        )}
                    >
                        <div id="cookie-preferences" className="min-h-0 overflow-hidden">
                            <div className="space-y-2 pt-1">
                                <PreferenceRow
                                    description="Required for security, sign-in, CSRF protection, forms, and core site features."
                                    field="necessary"
                                    locked
                                    preferences={preferences}
                                    setPreferences={setPreferences}
                                    title="Strictly necessary"
                                />
                                <PreferenceRow
                                    description="Remembers preferences such as currency, dashboard choices, and saved interface settings."
                                    field="functional"
                                    preferences={preferences}
                                    setPreferences={setPreferences}
                                    title="Functional"
                                />
                                <PreferenceRow
                                    description="Helps us understand site performance and improve pages when analytics tools are configured."
                                    field="analytics"
                                    preferences={preferences}
                                    setPreferences={setPreferences}
                                    title="Analytics"
                                />
                                <PreferenceRow
                                    description="Supports promotional measurement if marketing tools are added in the future."
                                    field="marketing"
                                    preferences={preferences}
                                    setPreferences={setPreferences}
                                    title="Marketing"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <button
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-plum-200 bg-white px-3 text-xs font-bold text-plum-950 transition hover:bg-plum-100"
                            onClick={acceptNecessaryOnly}
                            type="button"
                        >
                            Necessary only
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-plum-200 bg-cream-50 px-3 text-xs font-bold text-plum-950 transition hover:bg-plum-100"
                                onClick={() => savePreferences(preferences)}
                                type="button"
                            >
                                <ShieldCheck className="mr-1.5 size-4" aria-hidden="true" />
                                Save choices
                            </button>
                            <button
                                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-plum-950 px-3 text-xs font-bold text-white transition hover:bg-plum-800 focus:outline-none focus:ring-2 focus:ring-plum-400 focus:ring-offset-2"
                                onClick={acceptAll}
                                type="button"
                            >
                                Accept all
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
