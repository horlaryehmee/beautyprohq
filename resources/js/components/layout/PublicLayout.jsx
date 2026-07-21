import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Home, Menu, MessageCircle, Newspaper, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { buttonClass } from '../ui/Button';
import ExpandableTabs from '../ui/ExpandableTabs';
import Icon from '../ui/Icon';
import Logo from './Logo';

const OpportunityEnquiryModal = lazy(() => import('../public/OpportunityEnquiryModal'));

const links = [
    { label: 'Home', to: '/', end: true },
    { label: 'News', to: '/news' },
    { label: 'Events', to: '/events' },
    { label: 'Directory', to: '/directory' },
    { label: 'Get In Touch', action: 'contact' },
];

function dashboardPath(role) {
    if (role === 'admin') return '/admin';
    if (role === 'provider') return '/provider';
    return '/customer';
}

export default function PublicLayout() {
    const [open, setOpen] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [footerVisible, setFooterVisible] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const isBookingPage = /^\/providers\/[^/]+\/book(\/[^/]+)?\/?$/.test(location.pathname);
    const hideFooter = isBookingPage || /^\/providers\/[^/]+\/?$/.test(location.pathname);

    useEffect(() => {
        setOpen(false);
        if (location.hash) {
            window.requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' }));
        } else {
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [location.pathname, location.hash]);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 8);
        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (hideFooter) {
            setFooterVisible(false);
            return undefined;
        }

        const footer = document.querySelector('[data-public-footer]');
        if (!footer || !('IntersectionObserver' in window)) {
            return undefined;
        }

        const observer = new IntersectionObserver(
            ([entry]) => setFooterVisible(entry.isIntersecting),
            { root: null, threshold: 0.02 },
        );
        observer.observe(footer);

        return () => observer.disconnect();
    }, [hideFooter, location.pathname]);

    async function handleLogout() {
        await logout();
        navigate('/');
    }

    function openContact() {
        setOpen(false);
        setContactOpen(true);
    }

    const mobileTabs = [
        { title: 'Home', icon: Home, to: '/' },
        { title: 'News', icon: Newspaper, to: '/news' },
        { title: 'Events', icon: CalendarDays, to: '/events' },
        { title: 'Directory', icon: Search, to: '/directory' },
        { title: 'Contact', icon: MessageCircle, action: 'contact' },
        { title: 'Menu', icon: Menu, action: 'menu' },
    ];
    const activeMobileTab = mobileTabs.findIndex((tab) => (
        tab.to === '/'
            ? location.pathname === '/'
            : tab.to && location.pathname.startsWith(tab.to)
    ));

    function handleMobileTabChange(index, tab) {
        if (tab.action === 'contact') {
            openContact();
            return;
        }
        if (tab.action === 'menu') {
            setOpen(true);
            return;
        }
        navigate(tab.to);
    }

    return (
        <div className="min-h-screen bg-cream-50 text-plum-950">
            <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-[#fbf8f4]/96 shadow-[0_8px_28px_rgba(52,35,28,.06)] backdrop-blur-xl lg:hidden">
                <div className="flex h-16 items-center justify-between px-4">
                    <button type="button" className="grid size-10 place-items-center rounded-2xl border border-stone-200 bg-white text-[#26211e]" onClick={() => setOpen(true)} aria-expanded={open} aria-label="Open navigation">
                        <Icon name="menu" size={26} />
                    </button>
                    <Logo className="scale-90" />
                    <Link to={user ? dashboardPath(user.role) : '/login'} className="grid size-10 place-items-center rounded-2xl border border-stone-200 bg-white text-[#26211e]" aria-label="Account">
                        <Icon name="user" size={24} />
                    </Link>
                </div>
            </header>

            <div className={`fixed inset-0 z-[90] lg:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!open}>
                <button type="button" className={`absolute inset-0 bg-[#1f1510]/45 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={() => setOpen(false)} aria-label="Close navigation" />
                <aside className={`absolute inset-y-0 left-0 flex w-[84vw] max-w-[340px] flex-col bg-[#fbf8f4] shadow-[18px_0_60px_rgba(36,23,17,.22)] transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="flex items-center justify-between border-b border-stone-200 px-5 py-5">
                        <Logo />
                        <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full bg-white text-[#26211e] shadow-sm" aria-label="Close navigation">
                            <Icon name="x" size={20} />
                        </button>
                    </div>

                    <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Full mobile navigation">
                        <div className="grid gap-1">
                            {links.map((link) => link.action === 'contact' ? (
                                <button key={link.label} type="button" onClick={openContact} className="flex min-h-12 items-center justify-between rounded-2xl px-4 text-left text-sm font-black text-[#26211e] transition hover:bg-white">
                                    <span>{link.label}</span>
                                    <Icon name="chevronRight" size={15} />
                                </button>
                            ) : (
                                <NavLink key={link.label} to={link.to} end={link.end} className={({ isActive }) => `flex min-h-12 items-center justify-between rounded-2xl px-4 text-sm font-black transition ${isActive ? 'bg-[#241711] text-white' : 'text-[#26211e] hover:bg-white'}`}>
                                    <span>{link.label}</span>
                                    <Icon name="chevronRight" size={15} />
                                </NavLink>
                            ))}
                        </div>
                    </nav>

                    <div className="border-t border-stone-200 p-4">
                        {user ? (
                            <div className="grid gap-2">
                                <Link to={dashboardPath(user.role)} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#241711] px-4 text-sm font-black text-white">Dashboard</Link>
                                <button type="button" onClick={handleLogout} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 text-sm font-black text-[#241711]">Log out</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 text-sm font-black text-[#241711]">Login</Link>
                                <Link to="/register" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#241711] px-4 text-sm font-black text-white">Join BPHQ</Link>
                            </div>
                        )}
                    </div>
                </aside>
            </div>

            {!isBookingPage && <nav aria-label="Mobile navigation" className={`fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-[80] transition-all duration-300 ease-out lg:hidden ${footerVisible ? 'pointer-events-none translate-y-8 opacity-0' : 'translate-y-0 opacity-100'}`}>
                <ExpandableTabs
                    activeIndex={activeMobileTab >= 0 ? activeMobileTab : null}
                    className="mx-auto w-fit max-w-full"
                    onChange={handleMobileTabChange}
                    tabs={mobileTabs}
                />
            </nav>}

            <header className={`sticky top-0 z-50 hidden border-b transition lg:block ${scrolled ? 'border-stone-200/80 bg-cream-50/95 shadow-[0_6px_28px_rgba(65,31,53,.06)] backdrop-blur-xl' : 'border-transparent bg-cream-50/80 backdrop-blur-md'}`}>
                <div className="page-container flex h-18 items-center justify-between gap-5">
                    <Logo />

                    <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
                        {links.map((link) => link.action === 'contact' ? (
                            <button key={link.label} type="button" onClick={openContact} className="rounded-lg px-3.5 py-2 text-sm font-bold text-stone-600 transition hover:bg-white hover:text-plum-900">{link.label}</button>
                        ) : link.to.includes('#') ? (
                            <Link key={link.label} to={link.to} className="rounded-lg px-3.5 py-2 text-sm font-bold text-stone-600 transition hover:bg-white hover:text-plum-900">{link.label}</Link>
                        ) : (
                            <NavLink key={link.label} to={link.to} end={link.end} className={({ isActive }) => `rounded-lg px-3.5 py-2 text-sm font-bold transition ${isActive ? 'bg-white text-plum-900 shadow-sm' : 'text-stone-600 hover:bg-white hover:text-plum-900'}`}>{link.label}</NavLink>
                        ))}
                    </nav>

                    <div className="hidden items-center gap-2 lg:flex">
                        {user ? (
                            <>
                                <Link to={dashboardPath(user.role)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>Dashboard</Link>
                                <button type="button" onClick={handleLogout} className={buttonClass({ variant: 'ghost', size: 'sm' })}>Log out</button>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Login</Link>
                                <Link to="/register" className={buttonClass({ size: 'sm' })}>Join BPHQ</Link>
                            </>
                        )}
                    </div>

                </div>
            </header>

            <main className={isBookingPage ? 'pb-0' : 'pb-20 lg:pb-0'}><Outlet /></main>

            {contactOpen && <Suspense fallback={null}><OpportunityEnquiryModal onClose={() => setContactOpen(false)} /></Suspense>}

            {!hideFooter && <footer data-public-footer className="bg-plum-950 text-white">
                <div className="page-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.25fr_.7fr_.7fr_.65fr] lg:py-16">
                    <div className="max-w-md">
                        <Logo light />
                        <p className="mt-5 text-sm leading-7 text-plum-100">The trusted home for beauty professionals and customers to discover, book, grow, and build lasting relationships.</p>
                    </div>
                    <div>
                        <p className="mb-4 text-xs font-black uppercase tracking-[.16em] text-rose-200">Explore</p>
                        <div className="flex flex-col gap-3 text-sm font-semibold text-plum-100">
                            <Link to="/directory" className="hover:text-white">Professional directory</Link>
                            <Link to="/news-events" className="hover:text-white">News & events</Link>
                            <Link to="/opportunities" className="hover:text-white">Opportunities</Link>
                            <Link to="/community" className="hover:text-white">Community</Link>
                        </div>
                    </div>
                    <div>
                        <p className="mb-4 text-xs font-black uppercase tracking-[.16em] text-rose-200">For professionals</p>
                        <div className="flex flex-col gap-3 text-sm font-semibold text-plum-100">
                            <Link to="/register?role=provider" className="hover:text-white">Create a provider profile</Link>
                            <Link to="/login" className="hover:text-white">Provider login</Link>
                            <a href="mailto:hello@beautyprohq.com" className="hover:text-white">hello@beautyprohq.com</a>
                        </div>
                    </div>
                    <div>
                        <p className="mb-4 text-xs font-black uppercase tracking-[.16em] text-rose-200">Legal</p>
                        <div className="flex flex-col gap-3 text-sm font-semibold text-plum-100">
                            <Link to="/privacy-policy" className="hover:text-white">Privacy Policy</Link>
                            <Link to="/terms-and-conditions" className="hover:text-white">Terms & Conditions</Link>
                        </div>
                    </div>
                </div>
                <div className="border-t border-white/10">
                    <div className="page-container flex flex-col gap-2 py-5 text-xs text-plum-200 sm:flex-row sm:items-center sm:justify-between">
                        <p>© {new Date().getFullYear()} BeautyPro HQ. All rights reserved.</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <Link to="/privacy-policy" className="hover:text-white">Privacy Policy</Link>
                            <Link to="/terms-and-conditions" className="hover:text-white">Terms & Conditions</Link>
                        </div>
                    </div>
                </div>
            </footer>}
        </div>
    );
}
