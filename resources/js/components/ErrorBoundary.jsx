import { Component } from 'react';
import { Link } from 'react-router-dom';

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
        if (isRecoverableAssetError(error) && !window.sessionStorage.getItem('bphq_error_boundary_reload')) {
            window.sessionStorage.removeItem('bphq_lazy_reload');
            window.sessionStorage.setItem('bphq_error_boundary_reload', '1');
            const url = new URL(window.location.href);
            url.searchParams.set('bphq_refresh', Date.now().toString());
            clearBrowserCaches().finally(() => window.location.replace(url.toString()));
        }
    }

    componentDidUpdate(previousProps) {
        if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <main className="grid min-h-screen place-items-center bg-cream-50 px-6 text-center">
                <div className="max-w-lg rounded-3xl border border-rose-100 bg-white p-8 shadow-xl shadow-plum-900/5">
                    <p className="text-xs font-bold uppercase tracking-[.2em] text-rose-600">Something went wrong</p>
                    <h1 className="font-display mt-3 text-3xl text-plum-950">We couldn’t display this page.</h1>
                    <p className="mt-3 text-sm leading-6 text-stone-600">Your information is safe. Refresh the view or return to the homepage and try again.</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <button className="rounded-full border border-plum-200 px-5 py-2.5 text-sm font-bold text-plum-800" type="button" onClick={() => window.location.reload()}>
                            Refresh
                        </button>
                        <Link className="rounded-full bg-plum-800 px-5 py-2.5 text-sm font-bold text-white" to="/">
                            Go home
                        </Link>
                    </div>
                </div>
            </main>
        );
    }
}
