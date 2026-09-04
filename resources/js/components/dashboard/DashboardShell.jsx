import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiErrorMessage, apiRequest, ensureSanctumCookie, registerAdminStepUpHandler } from './api';
import Icon from './Icon';
import { DashboardToastProvider, useDashboardToast } from './ToastProvider';
import { Avatar, Button, cx } from './ui';
import { useApiResource } from './useDashboard';
import Logo from '../layout/Logo';
import { hasPaidSubscription } from '../../lib/utils';

export const providerNavigation = [
    { label: 'Overview', to: '/provider', icon: 'overview', end: true },
    { label: 'Profile', to: '/provider/profile', icon: 'profile' },
    { label: 'Subscription', to: '/provider/subscription', icon: 'subscription' },
    { label: 'Services', to: '/provider/services', icon: 'booking', paidOnly: true },
    { label: 'Bookings', to: '/provider/bookings', icon: 'booking', paidOnly: true },
    { label: 'Live chat', to: '/provider/live-chat', icon: 'chat', paidOnly: true },
    { label: 'Calendar', to: '/provider/calendar', icon: 'calendar', paidOnly: true },
    { label: 'CRM', to: '/provider/crm', icon: 'users', paidOnly: true },
    { label: 'Loyalty', to: '/provider/loyalty', icon: 'loyalty', paidOnly: true },
    { label: 'Payments', to: '/provider/payments', icon: 'wallet', paidOnly: true },
    { label: 'Digital products', to: '/provider/digital-products', icon: 'product', paidOnly: true },
    { label: 'Community posts', to: '/provider/community-posts', icon: 'content', paidOnly: true },
    { label: 'Analytics', to: '/provider/analytics', icon: 'analytics', paidOnly: true },
    { label: 'Notifications', to: '/provider/notifications', icon: 'bell' },
    { label: 'Settings', to: '/provider/settings', icon: 'settings' },
    { label: 'Documentation', to: '/provider/documentation', icon: 'docs' },
];

export const customerNavigation = [
    { label: 'Dashboard', to: '/customer', icon: 'overview', end: true },
    { label: 'Bookings', to: '/customer/bookings', icon: 'booking' },
    { label: 'Chats', to: '/customer/chats', icon: 'chat' },
    { label: 'Rewards', to: '/customer/rewards', icon: 'loyalty' },
    { label: 'Saved providers', to: '/customer/saved-providers', icon: 'saved' },
    { label: 'Notifications', to: '/customer/notifications', icon: 'bell' },
    { label: 'Settings', to: '/customer/settings', icon: 'settings' },
];

export const adminNavigation = [
    { label: 'Dashboard', to: '/admin', icon: 'overview', end: true },
    { label: 'Activity', to: '/admin/activity', icon: 'analytics' },
    { label: 'Subscribers', to: '/admin/waitlist', icon: 'bell' },
    { label: 'Users', to: '/admin/users', icon: 'users' },
    { label: 'Directory', to: '/admin/directory', icon: 'profile' },
    { label: 'Content', to: '/admin/content', icon: 'content' },
    { label: 'Media', to: '/admin/media', icon: 'content' },
    { label: 'Opportunities', to: '/admin/opportunities', icon: 'opportunity' },
    { label: 'Announcements', to: '/admin/announcements', icon: 'megaphone' },
    { label: 'Subscriptions', to: '/admin/subscriptions', icon: 'subscription' },
    { label: 'Support', to: '/admin/support', icon: 'chat' },
    { label: 'Settings', to: '/admin/settings', icon: 'settings' },
    { label: 'Documentation', to: '/admin/documentation', icon: 'docs' },
];

const roleLabels = { provider: 'Provider workspace', customer: 'Customer portal', admin: 'Admin console' };

const searchKeywords = {
    provider: {
        Overview: 'home summary revenue bookings profile subscription verification alerts',
        Profile: 'onboarding profile photos logo cover bio location portfolio social links verification questions',
        Subscription: 'plan billing paid pro renewal subscription upgrade',
        Services: 'services prices pricing duration menu offers categories',
        Bookings: 'appointments customers schedule status confirmed completed cancelled paid',
        'Live chat': 'messages inbox customer questions profile visitors replies email',
        Calendar: 'availability schedule hours days slots blocked dates',
        CRM: 'customers clients contacts notes repeat bookings',
        Loyalty: 'rewards points offers referrals retention',
        Payments: 'wallet payout bank account revenue transactions paid invoices',
        'Digital products': 'ebooks downloads products shop files digital sales',
        'Community posts': 'community posts stories questions approval publishing',
        Analytics: 'reports metrics growth performance revenue bookings customers',
        Notifications: 'alerts announcements bookings reviews enquiries messages activity unread',
        Settings: 'account password security currency notifications preferences',
        Documentation: 'help guide docs support setup instructions',
    },
    customer: {
        Dashboard: 'home summary upcoming bookings saved providers rewards',
        Bookings: 'appointments reservations services schedule completed cancelled',
        Chats: 'messages chat providers active bookings replies inbox',
        Rewards: 'loyalty points rewards offers benefits',
        'Saved providers': 'favorites saved beauty professionals providers',
        Notifications: 'alerts messages updates reminders',
        Settings: 'account password security currency notifications preferences',
    },
    admin: {
        Dashboard: 'home summary metrics platform revenue activity',
        Activity: 'audit logs recent events actions platform usage',
        Subscribers: 'newsletter subscribers waitlist leads emails signups audience',
        Users: 'members providers customers accounts onboarding profile verification usage',
        Directory: 'providers listings categories featured pro of week approval',
        Content: 'news events articles community stories pages html',
        Media: 'images uploads files gallery broken images',
        Opportunities: 'jobs grants partnerships applications',
        Announcements: 'broadcast messages notifications email users',
        Subscriptions: 'plans billing payments renewals providers revenue',
        Support: 'provider care support inbox tickets replies billing technical account verification',
        Settings: 'configuration currencies demo data populate clear integrations',
        Documentation: 'help guide docs support setup instructions',
    },
};

function ShellContent({ role, navigation, user: suppliedUser, onLogout }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [dashboardSearch, setDashboardSearch] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const [stepUp, setStepUp] = useState(null);
    const [stepUpPassword, setStepUpPassword] = useState('');
    const [stepUpCode, setStepUpCode] = useState('');
    const [stepUpBusy, setStepUpBusy] = useState(false);
    const [stepUpError, setStepUpError] = useState('');
    const location = useLocation();
    const navigate = useNavigate();
    const { notify } = useDashboardToast();
    const userResource = useApiResource('/auth/me', suppliedUser, { enabled: !suppliedUser });
    const user = suppliedUser ?? userResource.data ?? {};
    const verified = Boolean(user.provider_profile?.verified ?? user.providerProfile?.verified ?? user.verified);
    const activeSubscription = user.active_subscription ?? user.activeSubscription;
    const paid = hasPaidSubscription(activeSubscription);
    const notificationPath = ['customer', 'provider'].includes(role) ? `/${role}/notifications` : `/${role}`;
    const headerNotifications = useApiResource('/notifications', [], {
        enabled: ['customer', 'provider'].includes(role),
        params: { per_page: 1 },
        refreshInterval: 30000,
    });
    const unreadCount = Number(headerNotifications.data?.meta?.unread_count ?? 0);

    useEffect(() => setMobileOpen(false), [location.pathname]);

    useEffect(() => {
        if (!['customer', 'provider'].includes(role)) return undefined;

        const refreshNotifications = () => headerNotifications.reload(true);
        window.addEventListener('bphq:notifications-changed', refreshNotifications);
        return () => window.removeEventListener('bphq:notifications-changed', refreshNotifications);
    }, [headerNotifications.reload, role]);

    useEffect(() => {
        const handleUnauthenticated = () => navigate('/login', { replace: true });
        window.addEventListener('bphq:unauthenticated', handleUnauthenticated);
        return () => window.removeEventListener('bphq:unauthenticated', handleUnauthenticated);
    }, [navigate]);

    useEffect(() => {
        if (role !== 'admin') return undefined;

        return registerAdminStepUpHandler((details) => new Promise((resolve, reject) => {
            setStepUpPassword('');
            setStepUpCode('');
            setStepUpError('');
            setStepUp({ details, resolve, reject });

            if (details?.code === 'ADMIN_STEP_UP_REQUIRED' && details?.data?.two_factor_method === 'email') {
                apiRequest('post', '/admin/security/step-up/code')
                    .then(() => notify('A security code was sent to your admin email.'))
                    .catch((error) => setStepUpError(apiErrorMessage(error)));
            }
        }));
    }, [notify, role]);

    const closeStepUp = () => {
        stepUp?.reject?.(new Error('Admin identity confirmation cancelled.'));
        setStepUp(null);
    };

    const confirmStepUp = async (event) => {
        event.preventDefault();
        setStepUpBusy(true);
        setStepUpError('');
        try {
            await apiRequest('post', '/admin/security/step-up', {
                password: stepUpPassword,
                code: stepUpCode || undefined,
            });
            const resolve = stepUp?.resolve;
            setStepUp(null);
            resolve?.();
            notify('Identity confirmed. The admin action will continue.');
        } catch (error) {
            setStepUpError(apiErrorMessage(error));
        } finally {
            setStepUpBusy(false);
        }
    };

    const visibleNavigation = useMemo(
        () => navigation.filter((item) => (!item.verifiedOnly || verified) && (!item.paidOnly || paid)),
        [navigation, paid, verified],
    );
    const mobileDockItems = useMemo(() => {
        const preferred = {
            provider: ['/provider', '/provider/bookings', '/provider/live-chat', '/provider/calendar'],
            customer: ['/customer', '/customer/bookings', '/customer/chats', '/customer/notifications'],
            admin: ['/admin', '/admin/users', '/admin/directory', '/admin/content'],
        }[role] ?? [];
        const ordered = preferred
            .map((path) => visibleNavigation.find((item) => item.to === path))
            .filter(Boolean);
        const fallback = visibleNavigation.filter((item) => !ordered.some((selected) => selected.to === item.to));

        return [...ordered, ...fallback].slice(0, 4);
    }, [role, visibleNavigation]);

    const dashboardSearchItems = useMemo(() => visibleNavigation.map((item) => ({
        ...item,
        keywords: `${item.label} ${searchKeywords[role]?.[item.label] ?? ''}`.toLowerCase(),
    })), [role, visibleNavigation]);

    const dashboardSearchResults = useMemo(() => {
        const query = dashboardSearch.trim().toLowerCase();
        if (!query) return dashboardSearchItems.slice(0, 6);

        const terms = query.split(/\s+/).filter(Boolean);
        return dashboardSearchItems
            .filter((item) => terms.every((term) => item.keywords.includes(term)))
            .slice(0, 6);
    }, [dashboardSearch, dashboardSearchItems]);

    const runDashboardSearch = (event) => {
        event.preventDefault();
        const target = dashboardSearchResults[0];
        if (!target) return;

        navigate(target.to);
        setDashboardSearch('');
        setSearchFocused(false);
    };

    const selectSearchResult = (target) => {
        navigate(target.to);
        setDashboardSearch('');
        setSearchFocused(false);
    };

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

    const notificationBell = () => (
        <NavLink
            aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
            className="relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:text-bphq-coffee"
            title={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
            to={notificationPath}
        >
            <Icon className="size-[18px]" name="bell" />
            {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-fuchsia-600 px-1.5 text-[10px] font-bold leading-5 text-white ring-2 ring-[#F7F3ED]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </NavLink>
    );

    const sidebar = (
        <div className="flex h-full flex-col">
            <div className="flex min-h-28 items-start justify-between px-5 py-5">
                <div className="flex min-w-0 flex-col items-start gap-2">
                    <Logo imageClassName="h-14 sm:h-14" />
                    <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{roleLabels[role]}</span>
                </div>
                <button className="grid size-10 place-items-center rounded-xl text-slate-500 lg:hidden" onClick={() => setMobileOpen(false)} type="button"><Icon name="close" /></button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3 pt-1">
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
        <div className="min-h-screen bg-[#F7F3ED] text-slate-900">
            <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200/80 bg-white lg:block">{sidebar}</aside>

            {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} type="button" />}
            <aside className={cx('fixed inset-y-0 left-0 z-50 w-[min(82vw,20rem)] border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 lg:hidden', mobileOpen ? 'translate-x-0' : '-translate-x-full')} {...(!mobileOpen && { inert: '', 'aria-hidden': 'true' })}>{sidebar}</aside>

            <div className="lg:pl-64">
                <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#F7F3ED]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
                    <div className="flex min-h-10 flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="flex items-center justify-between gap-3 lg:w-56 lg:justify-start">
                            <button className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden" onClick={() => setMobileOpen(true)} type="button"><Icon name="menu" /></button>
                            <p className="min-w-0 truncate text-sm font-semibold text-slate-500">Welcome back, <span className="text-slate-900">{user.name?.split(' ')[0] || 'there'}</span></p>
                            <div className="flex items-center gap-2 lg:hidden">
                                {notificationBell()}
                                <Avatar name={user.name} size="sm" src={user.profile_photo ?? user.provider_profile?.profile_photo ?? user.avatar_url} />
                            </div>
                        </div>

                        <form className="relative w-full lg:max-w-2xl" onSubmit={runDashboardSearch}>
                            <Icon className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-bphq-coffee/60" name="search" />
                            <input
                                aria-label="Search dashboard"
                                autoComplete="off"
                                className="h-11 w-full rounded-2xl border border-bphq-chrome bg-white py-2 pl-11 pr-4 text-sm font-medium text-bphq-espresso outline-none transition placeholder:text-slate-400 focus:border-bphq-coffee focus:ring-4 focus:ring-bphq-beige/60"
                                onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                                onChange={(event) => setDashboardSearch(event.target.value)}
                                onFocus={() => setSearchFocused(true)}
                                placeholder={`Search ${roleLabels[role].toLowerCase()}...`}
                                type="search"
                                value={dashboardSearch}
                            />
                            {searchFocused && (
                                <div className="absolute left-0 right-0 top-[calc(100%+.5rem)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                                    {dashboardSearchResults.length > 0 ? dashboardSearchResults.map((item) => (
                                        <button
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-bphq-ivory hover:text-bphq-espresso"
                                            key={item.to}
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={() => selectSearchResult(item)}
                                            type="button"
                                        >
                                            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-bphq-ivory text-bphq-coffee"><Icon className="size-4" name={item.icon} /></span>
                                            <span className="min-w-0">
                                                <span className="block truncate">{item.label}</span>
                                                <span className="block truncate text-xs font-medium text-slate-400">{item.to}</span>
                                            </span>
                                        </button>
                                    )) : (
                                        <div className="px-4 py-4 text-sm font-medium text-slate-500">No matching dashboard section</div>
                                    )}
                                </div>
                            )}
                        </form>

                        <div className="ml-auto hidden items-center gap-2 lg:flex">
                            {notificationBell()}
                            <Avatar name={user.name} size="sm" src={user.profile_photo ?? user.provider_profile?.profile_photo ?? user.avatar_url} />
                        </div>
                    </div>
                </header>
                <main className="mx-auto max-w-[1500px] p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8">
                    <Outlet context={{ role, user, refreshUser: userResource.reload }} />
                </main>
            </div>

            <nav aria-label="Dashboard mobile navigation" className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 lg:hidden">
                <div className="mx-auto flex w-fit max-w-full items-center gap-1 rounded-[1.65rem] border border-slate-200/80 bg-white/95 p-2 shadow-[0_18px_55px_rgba(15,23,42,.16)] backdrop-blur-xl">
                    {mobileDockItems.map((item) => (
                        <NavLink
                            className={({ isActive }) => cx(
                                'flex min-h-12 items-center justify-center gap-2 rounded-[1.15rem] px-3 text-slate-500 transition',
                                isActive ? 'bg-fuchsia-50 text-fuchsia-700' : 'hover:bg-slate-50 hover:text-slate-900',
                            )}
                            end={item.end}
                            key={item.to}
                            to={item.to}
                        >
                            {({ isActive }) => (
                                <>
                                    <Icon className="size-5 shrink-0" name={item.icon} />
                                    <span className={cx('max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all', isActive ? 'max-w-28' : '')}>{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    ))}
                    <button type="button" onClick={() => setMobileOpen(true)} className="grid size-12 shrink-0 place-items-center rounded-[1.15rem] text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" aria-label="Open full dashboard menu">
                        <Icon className="size-5" name="menu" />
                    </button>
                </div>
            </nav>

            {stepUp && (
                <div aria-modal="true" className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog">
                    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-bphq-coffee">Sensitive admin action</p>
                                <h2 className="mt-1 font-display text-2xl font-semibold text-bphq-espresso">Confirm your identity</h2>
                            </div>
                            <button aria-label="Cancel identity confirmation" className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" onClick={closeStepUp} type="button"><Icon name="close" /></button>
                        </div>

                        {stepUp.details?.code === 'ADMIN_TWO_FACTOR_REQUIRED' ? (
                            <div className="mt-5 space-y-4">
                                <p className="text-sm leading-6 text-slate-600">Production-critical actions require two-factor authentication. Open Admin Settings, choose Security, and enable 2FA first.</p>
                                <div className="flex justify-end gap-2">
                                    <Button onClick={closeStepUp} type="button" variant="secondary">Cancel</Button>
                                    <Button onClick={() => { closeStepUp(); navigate('/admin/settings'); }} type="button">Open settings</Button>
                                </div>
                            </div>
                        ) : (
                            <form className="mt-5 space-y-4" onSubmit={confirmStepUp}>
                                <p className="text-sm leading-6 text-slate-600">Re-enter your current password{stepUp.details?.data?.two_factor_enabled ? ' and your two-factor code' : ''}. Confirmation lasts for a short, session-bound window.</p>
                                <label className="block">
                                    <span className="mb-1.5 block text-sm font-bold text-slate-700">Current password</span>
                                    <input autoComplete="current-password" className="w-full rounded-xl border border-bphq-chrome px-3.5 py-2.5 text-sm outline-none focus:border-bphq-coffee focus:ring-4 focus:ring-bphq-beige/60" onChange={(event) => setStepUpPassword(event.target.value)} required type="password" value={stepUpPassword} />
                                </label>
                                {stepUp.details?.data?.two_factor_enabled && (
                                    <label className="block">
                                        <span className="mb-1.5 block text-sm font-bold text-slate-700">Two-factor or backup code</span>
                                        <input autoComplete="one-time-code" className="w-full rounded-xl border border-bphq-chrome px-3.5 py-2.5 text-sm outline-none focus:border-bphq-coffee focus:ring-4 focus:ring-bphq-beige/60" inputMode="numeric" onChange={(event) => setStepUpCode(event.target.value)} required value={stepUpCode} />
                                    </label>
                                )}
                                {stepUpError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{stepUpError}</p>}
                                <div className="flex justify-end gap-2">
                                    <Button onClick={closeStepUp} type="button" variant="secondary">Cancel</Button>
                                    <Button busy={stepUpBusy} type="submit">Confirm and continue</Button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DashboardShell(props) {
    return <DashboardToastProvider><ShellContent {...props} /></DashboardToastProvider>;
}
