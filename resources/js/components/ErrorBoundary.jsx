import { Component } from 'react';
import { Link } from 'react-router-dom';

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
