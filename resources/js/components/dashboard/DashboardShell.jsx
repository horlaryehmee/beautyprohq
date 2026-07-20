import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiRequest, ensureSanctumCookie } from './api';
import Icon from './Icon';
import { DashboardToastProvider, useDashboardToast } from './ToastProvider';
import { Avatar, Button, cx } from './ui';
import { useApiResource } from './useDashboard';
import Logo from '../layout/Logo';

export const providerNavigation = [
    { label: 'Overview', to: '/provider', icon: 'overview', end: true },
    { label: 'Profile', to: '/provider/profile', icon: 'profile' },
    { label: 'Subscription', to: '/provider/subscription', icon: 'subscription' },
    { label: 'Services', to: '/provider/services', icon: 'booking', paidOnly: true },
    { label: 'Bookings', to: '/provider/bookings', icon: 'booking', paidOnly: true },
    { label: 'Calendar', to: '/provider/calendar', icon: 'calendar', paidOnly: true },
    { label: 'CRM', to: '/provider/crm', icon: 'users', paidOnly: true },
    { label: 'Loyalty', to: '/provider/loyalty', icon: 'loyalty', paidOnly: true },
    { label: 'Payments', to: '/provider/payments', icon: 'wallet', paidOnly: true },
    { label: 'Digital products', to: '/provider/digital-products', icon: 'product', paidOnly: true },
    { label: 'Content calendar', to: '/provider/content-calendar', icon: 'content', paidOnly: true },
    { label: 'Analytics', to: '/provider/analytics', icon: 'analytics', paidOnly: true },
];

export const customerNavigation = [
    { label: 'Dashboard', to: '/customer', icon: 'overview', end: true },
    { label: 'Bookings', to: '/customer/bookings', icon: 'booking' },
    { label: 'Rewards', to: '/customer/rewards', icon: 'loyalty' },
    { label: 'Saved providers', to: '/customer/saved-providers', icon: 'saved' },
    { label: 'Notifications', to: '/customer/notifications', icon: 'bell' },
];

export const adminNavigation = [
    { label: 'Dashboard', to: '/admin', icon: 'overview', end: true },
    { label: 'Activity', to: '/admin/activity', icon: 'analytics' },
    { label: 'Users', to: '/admin/users', icon: 'users' },
    { label: 'Directory', to: '/admin/directory', icon: 'profile' },
    { label: 'Content', to: '/admin/content', icon: 'content' },
    { label: 'Opportunities', to: '/admin/opportunities', icon: 'opportunity' },
    { label: 'Announcements', to: '/admin/announcements', icon: 'megaphone' },
    { label: 'Subscriptions', to: '/admin/subscriptions', icon: 'subscription' },
];

const roleLabels = { provider: 'Provider workspace', customer: 'Customer portal', admin: 'Admin console' };

function ShellContent({ role, navigation, user: suppliedUser, onLogout }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { notify } = useDashboardToast();
    const userResource = useApiResource('/auth/me', suppliedUser, { enabled: !suppliedUser });
    const user = suppliedUser ?? userResource.data ?? {};
    const verified = Boolean(user.provider_profile?.verified ?? user.providerProfile?.verified ?? user.verified);
    const activeSubscription = user.active_subscription ?? user.activeSubscription;
    const paid = ['paid', 'pro'].includes(activeSubscription?.plan) && activeSubscription?.status === 'active';

    useEffect(() => setMobileOpen(false), [location.pathname]);

    useEffect(() => {
        const handleUnauthenticated = () => navigate('/login', { replace: true });
        window.addEventListener('bphq:unauthenticated', handleUnauthenticated);
        return () => window.removeEventListener('bphq:unauthenticated', handleUnauthenticated);
    }, [navigate]);

    const visibleNavigation = useMemo(
        () => navigation.filter((item) => (!item.verifiedOnly || verified) && (!item.paidOnly || paid)),
        [navigation, paid, verified],
    );

    const logout = async () => {
        try {
            if (onLogout) {
                await onLogout();
            } else {
                await ensureSanctumCookie();
                await apiRequest('post', '/auth/logout');
            }
            navigate('/login', { replace: true });
        } catch {
            notify('We could not sign you out. Please try again.', 'error');
        }
    };

    const sidebar = (
        <div className="flex h-full flex-col">
            <div className="flex h-20 items-center justify-between px-5">
                <div>
                    <Logo />
                    <span className="mt-1 block text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{roleLabels[role]}</span>
                </div>
                <button className="grid size-10 place-items-center rounded-xl text-slate-500 lg:hidden" onClick={() => setMobileOpen(false)} type="button"><Icon name="close" /></button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
                {visibleNavigation.map((item) => (
                    <NavLink
                        className={({ isActive }) => cx(
                            'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition',
                            isActive ? 'bg-slate-950 text-white shadow-lg shadow-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
                        )}
                        end={item.end}
                        key={item.to}
                        to={item.to}
                    >
                        <Icon className="size-[18px]" name={item.icon} />
                        <span>{item.label}</span>
                        {(item.verifiedOnly || item.paidOnly) && <span className="ml-auto rounded-full bg-fuchsia-100 px-2 py-0.5 text-[9px] uppercase tracking-wide text-fuchsia-700 group-[.active]:bg-white/10 group-[.active]:text-white">Pro</span>}
                    </NavLink>
                ))}
            </nav>

            <div className="border-t border-slate-100 p-3">
                <div className="mb-2 flex items-center gap-3 rounded-2xl p-2">
                    <Avatar name={user.name} src={user.profile_photo ?? user.provider_profile?.profile_photo ?? user.avatar_url} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{user.name || 'BeautyPro member'}</p>
                        <p className="truncate text-xs text-slate-400">{user.email || roleLabels[role]}</p>
                    </div>
                </div>
                <Button className="w-full justify-start" onClick={logout} type="button" variant="ghost"><Icon className="size-4" name="logout" /> Sign out</Button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#f8f8fb] text-slate-900">
            <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200/80 bg-white lg:block">{sidebar}</aside>

            {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} type="button" />}
            <aside className={cx('fixed inset-y-0 left-0 z-50 w-[min(82vw,20rem)] border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 lg:hidden', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>{sidebar}</aside>

            <div className="lg:pl-64">
                <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/70 bg-[#f8f8fb]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
                    <button className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden" onClick={() => setMobileOpen(true)} type="button"><Icon name="menu" /></button>
                    <p className="hidden text-sm font-semibold text-slate-500 sm:block">Welcome back, <span className="text-slate-900">{user.name?.split(' ')[0] || 'there'}</span></p>
                    <div className="ml-auto flex items-center gap-2">
                        <NavLink className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:text-fuchsia-700" to={role === 'customer' ? '/customer/notifications' : `/${role}`}><Icon className="size-[18px]" name="bell" /></NavLink>
                        <Avatar name={user.name} size="sm" src={user.profile_photo ?? user.provider_profile?.profile_photo ?? user.avatar_url} />
                    </div>
                </header>
                <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
                    <Outlet context={{ role, user, refreshUser: userResource.reload }} />
                </main>
            </div>
        </div>
    );
}

export default function DashboardShell(props) {
    return <DashboardToastProvider><ShellContent {...props} /></DashboardToastProvider>;
}
