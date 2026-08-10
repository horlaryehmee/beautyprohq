import { Component } from 'react';

const RELOAD_KEY = 'bphq_error_ts';

function isRecoverableAssetError(error) {
    const message = String(error?.message ?? error ?? '');
    return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|dynamically imported module/i.test(message);
}

async function clearBrowserCaches() {
    try {
        if ('caches' in window) {
            const names = await window.caches.keys();
            await Promise.all(names.map((name) => window.caches.delete(name)));
        }
    } catch {}
}

function wasRecentlyReloaded() {
    const ts = sessionStorage.getItem(RELOAD_KEY);
    if (!ts) return false;
    return (Date.now() - Number(ts)) < 10000; // 10 seconds
}

function markReloaded() {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
}

function forceReload() {
    markReloaded();
    const url = new URL(window.location.href);
    url.searchParams.set('_t', Date.now().toString());
    clearBrowserCaches().finally(() => window.location.replace(url.toString()));
}

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, details) {
        console.error('BeautyPro HQ render error', error, details);

        if (!wasRecentlyReloaded() && isRecoverableAssetError(error)) {
            forceReload();
        }
    }

    componentDidUpdate(previousProps) {
        if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
            sessionStorage.removeItem(RELOAD_KEY);
        }
    }

    render() {
        if (!this.state.error) return this.props.children;

        // If we already tried reloading, show recovery UI instead of looping
        if (wasRecentlyReloaded()) {
            return (
                <main className="min-h-screen bg-bphq-ivory px-4 py-6 sm:px-6">
                    <div className="mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-700">View recovered</p>
                        <h1 className="mt-2 font-display text-2xl font-semibold text-bphq-espresso">A new version was deployed.</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-bphq-coffee">
                            Please reload to get the latest files.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <button className="rounded-xl bg-bphq-coffee px-4 py-2.5 text-sm font-bold text-white" type="button" onClick={() => { sessionStorage.removeItem(RELOAD_KEY); forceReload(); }}>
                                Reload view
                            </button>
                        </div>
                    </div>
                </main>
            );
        }

        // Auto-reloading — show spinner briefly
        return (
            <div className="fixed inset-0 z-[999] flex h-screen w-screen items-center justify-center bg-bphq-ivory" role="status">
                <div className="text-center">
                    <div className="mx-auto size-10 animate-spin rounded-full border-2 border-bphq-chrome border-r-bphq-coffee" />
                    <p className="mt-4 text-sm font-bold text-bphq-espresso">Loading latest BeautyPro HQ...</p>
                </div>
            </div>
        );
    }
}
