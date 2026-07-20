import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';
import Logo from './Logo';

export default function AuthShell({ eyebrow = 'Welcome to BeautyPro HQ', title, description, children, footer }) {
    return (
        <div className="grid min-h-screen bg-cream-50 lg:grid-cols-[.9fr_1.1fr]">
            <aside className="relative hidden overflow-hidden bg-plum-950 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
                <div className="auth-orb auth-orb-one" />
                <div className="auth-orb auth-orb-two" />
                <Logo light className="relative z-10" />
                <div className="relative z-10 max-w-xl py-16">
                    <span className="mb-7 grid size-14 place-items-center rounded-2xl bg-white/10 text-rose-200 ring-1 ring-white/10"><Icon name="quote" size={26} /></span>
                    <blockquote className="font-display text-4xl font-black leading-[1.14] xl:text-5xl">Your craft deserves a platform built to help it thrive.</blockquote>
                    <p className="mt-6 max-w-lg text-base leading-8 text-plum-100">Showcase your work, manage every booking, and create customer relationships that last.</p>
                    <div className="mt-9 flex items-center gap-3">
                        <div className="flex -space-x-3">
                            {['AM', 'TO', 'NK'].map((item) => <span key={item} className="grid size-10 place-items-center rounded-full border-2 border-plum-950 bg-rose-100 text-[10px] font-black text-plum-800">{item}</span>)}
                        </div>
                        <p className="text-xs font-bold text-plum-200">A growing community of beauty professionals</p>
                    </div>
                </div>
                <p className="relative z-10 text-xs text-plum-300">BeautyPro HQ · Discover. Book. Grow.</p>
            </aside>

            <main className="flex min-h-screen flex-col">
                <div className="flex items-center justify-between px-5 py-5 sm:px-8 lg:justify-end">
                    <Logo className="lg:hidden" />
                    <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 transition hover:text-plum-900">
                        <Icon name="chevronLeft" size={15} /> Back home
                    </Link>
                </div>
                <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8 lg:py-12">
                    <div className="w-full max-w-[470px]">
                        <p className="mb-2 text-xs font-black uppercase tracking-[.18em] text-rose-600">{eyebrow}</p>
                        <h1 className="font-display text-3xl font-black leading-tight text-plum-950 sm:text-4xl">{title}</h1>
                        {description && <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>}
                        <div className="mt-8">{children}</div>
                        {footer && <div className="mt-7 text-center text-sm text-stone-600">{footer}</div>}
                    </div>
                </div>
            </main>
        </div>
    );
}
