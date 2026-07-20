import { Link } from 'react-router-dom';

export default function NotFoundPage() {
    return (
        <main className="grid min-h-screen place-items-center bg-cream-50 px-6 text-center">
            <div>
                <p className="text-xs font-bold uppercase tracking-[.24em] text-rose-600">404 · Page not found</p>
                <h1 className="font-display mt-4 text-5xl text-plum-950">This page has moved.</h1>
                <p className="mx-auto mt-4 max-w-md text-stone-600">Let’s get you back to trusted professionals, useful opportunities, and your BeautyPro HQ workspace.</p>
                <Link className="mt-8 inline-flex rounded-full bg-plum-800 px-6 py-3 text-sm font-bold text-white transition hover:bg-plum-950" to="/">
                    Return home
                </Link>
            </div>
        </main>
    );
}
