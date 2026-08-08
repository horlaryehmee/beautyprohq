import { Component } from 'react';

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
    } catch (error) {
        console.warn('BeautyPro HQ cache clear failed', error);
    }
}

function reloadWithFreshAssets() {
    window.sessionStorage.removeItem('bphq_lazy_reload');
    const url = new URL(window.location.href);
    url.searchParams.set('bphq_refresh', Date.now().toString());
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
        if (isRecoverableAssetError(error)) reloadWithFreshAssets();
    }

    componentDidUpdate(previousProps) {
        if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    render() {
        if (!this.state.error) return this.props.children;

        if (isRecoverableAssetError(this.state.error)) {
            return (
                <div className="grid min-h-screen place-items-center bg-bphq-ivory px-6 text-center" role="status">
                    <div>
                        <div className="mx-auto size-10 animate-spin rounded-full border-2 border-bphq-chrome border-r-bphq-coffee" />
                        <p className="mt-4 text-sm font-bold text-bphq-espresso">Refreshing the latest BeautyPro HQ files...</p>
                    </div>
                </div>
            );
        }

        return (
            <main className="min-h-screen bg-bphq-ivory px-4 py-6 sm:px-6">
                <div className="mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-700">View recovered</p>
                    <h1 className="mt-2 font-display text-2xl font-semibold text-bphq-espresso">This view hit a render error.</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-bphq-coffee">
                        The blocking crash page has been removed. Reload the view after saving your latest work, or go back to the previous dashboard screen.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <button className="rounded-xl bg-bphq-coffee px-4 py-2.5 text-sm font-bold text-white" type="button" onClick={() => window.location.reload()}>
                            Reload view
                        </button>
                        <button className="rounded-xl border border-bphq-chrome bg-white px-4 py-2.5 text-sm font-bold text-bphq-espresso" type="button" onClick={() => window.history.back()}>
                            Go back
                        </button>
                    </div>
                </div>
            </main>
        );
    }
}
