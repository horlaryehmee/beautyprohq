import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Home, MessageCircle, Newspaper, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { buttonClass } from '../ui/Button';
import ExpandableTabs from '../ui/ExpandableTabs';
import OpportunityEnquiryModal from '../public/OpportunityEnquiryModal';
import Icon from '../ui/Icon';
import Logo from './Logo';

const links = [
    { label: 'Home', to: '/', end: true },
    { label: 'News', to: '/news' },
    { label: 'Events', to: '/events' },
    { label: 'Directory', to: '/directory' },
    { label: 'Resources', to: '/resources' },
    { label: 'Get In Touch', action: 'contact' },
];

function dashboardPath(role) {
    if (role === 'admin') return '/admin';
    if (role === 'provider') return '/provider';
    return '/customer';
}

export default function PublicLayout() {
    const [contactOpen, setContactOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const hideFooter = /^\/providers\/[^/]+\/?$/.test(location.pathname);

    useEffect(() => {
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

    async function handleLogout() {
        await logout();
        navigate('/');
    }

    function openContact() {
        setContactOpen(true);
    }

    const mobileTabs = [
        { title: 'Home', icon: Home, to: '/' },
        { title: 'News', icon: Newspaper, to: '/news' },
        { title: 'Events', icon: CalendarDays, to: '/events' },
        { title: 'Directory', icon: Search, to: '/directory' },
        { title: 'Contact', icon: MessageCircle, action: 'contact' },
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
        navigate(tab.to);
    }

    return (
        <div className="min-h-screen bg-cream-50 text-plum-950">
            <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-[#fbf8f4]/96 shadow-[0_8px_28px_rgba(52,35,28,.06)] backdrop-blur-xl lg:hidden">
                <div className="flex h-16 items-center justify-between px-4">
                    <span className="size-10" aria-hidden="true" />
                    <Link to="/" className="text-center text-[#26211e]" aria-label="BeautyPro HQ home">
                        <span className="block font-display text-3xl font-normal leading-none tracking-[-.08em]">BPHQ</span>
                        <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[.28em] text-stone-500">BeautyProHQ</span>
                    </Link>
                    <Link to={user ? dashboardPath(user.role) : '/login'} className="grid size-10 place-items-center rounded-2xl border border-stone-200 bg-white text-[#26211e]" aria-label="Account">
                        <Icon name="user" size={24} />
                    </Link>
                </div>
            </header>

            <nav aria-label="Mobile navigation" className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-[80] lg:hidden">
                <ExpandableTabs
                    activeIndex={activeMobileTab >= 0 ? activeMobileTab : null}
                    className="mx-auto w-fit max-w-full"
                    onChange={handleMobileTabChange}
                    tabs={mobileTabs}
                />
            </nav>

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

            <main className="pb-20 lg:pb-0"><Outlet /></main>

            {contactOpen && <OpportunityEnquiryModal onClose={() => setContactOpen(false)} />}

            {!hideFooter && <footer className="bg-plum-950 text-white">
                <div className="page-container grid gap-10 py-14 md:grid-cols-[1.3fr_.7fr_.7fr] lg:py-16">
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
                </div>
                <div className="border-t border-white/10">
                    <div className="page-container flex flex-col gap-2 py-5 text-xs text-plum-200 sm:flex-row sm:items-center sm:justify-between">
                        <p>© {new Date().getFullYear()} BeautyPro HQ. All rights reserved.</p>
                        <p>Made for the beauty community.</p>
                    </div>
                </div>
            </footer>}
        </div>
    );
}
