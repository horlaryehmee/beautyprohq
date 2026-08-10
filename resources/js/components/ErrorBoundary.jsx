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
    } catch {}
}

function forceReload() {
    const url = new URL(window.location.href);
    url.searchParams.set('_t', Date.now().toString());
    clearBrowserCaches().finally(() => window.location.replace(url.toString()));
}

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
        this.reloaded = false;
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, details) {
        console.error('BeautyPro HQ render error', error, details);
        if (!this.reloaded) {
            this.reloaded = true;
            if (isRecoverableAssetError(error)) {
                forceReload();
            } else {
                // Wait 200ms then reload — gives React time to render the spinner
                setTimeout(() => forceReload(), 200);
            }
        }
    }

    componentDidUpdate(previousProps) {
        if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
            this.reloaded = false;
        }
    }

    render() {
        if (this.state.error) {
            return (
                <div className="fixed inset-0 z-[999] flex h-screen w-screen items-center justify-center bg-bphq-ivory" role="status">
                    <div className="text-center">
                        <div className="mx-auto size-10 animate-spin rounded-full border-2 border-bphq-chrome border-r-bphq-coffee" />
                        <p className="mt-4 text-sm font-bold text-bphq-espresso">Refreshing BeautyPro HQ...</p>
                        <button
                            className="mt-6 rounded-xl bg-bphq-coffee px-4 py-2 text-sm font-bold text-white"
                            type="button"
                            onClick={() => forceReload()}
                        >
                            Reload now
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
