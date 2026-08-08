import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import PublicLayout from './components/layout/PublicLayout';
import ErrorBoundary from './components/ErrorBoundary';
import LumaSpin from './components/ui/LumaSpin';
import ProtectedRoute from './router/ProtectedRoute';
import ScrollToTop from './router/ScrollToTop';
import HomeLandingPage from './pages/public/HomeLandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';

function lazyWithReload(importer) {
    return lazy(() => importer().catch((error) => {
        const message = String(error?.message ?? error);
        const isChunkError = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(message);
        if (isChunkError && !window.sessionStorage.getItem('bphq_lazy_reload')) {
            window.sessionStorage.setItem('bphq_lazy_reload', '1');
            window.location.reload();
            return new Promise(() => {});
        }
        throw error;
    }));
}

const NotFoundPage = lazyWithReload(() => import('./pages/NotFoundPage'));
const DirectoryPage = lazyWithReload(() => import('./pages/public/DirectoryPage'));
const NewsEventsPage = lazyWithReload(() => import('./pages/public/NewsEventsPage'));
const OpportunitiesPage = lazyWithReload(() => import('./pages/public/OpportunitiesPage'));
const OpportunityDetailPage = lazyWithReload(() => import('./pages/public/OpportunityDetailPage'));
const BookingConfirmationPage = lazyWithReload(() => import('./pages/public/BookingConfirmationPage'));
const ProviderBookingPage = lazyWithReload(() => import('./pages/public/ProviderBookingPage'));
const CommunityPage = lazyWithReload(() => import('./pages/public/CommunityPage'));
const ContentDetailPage = lazyWithReload(() => import('./pages/public/ContentDetailPage'));
const ProviderProfilePage = lazyWithReload(() => import('./pages/public/ProviderProfilePage'));
const PrivacyPolicyPage = lazyWithReload(() => import('./pages/public/PrivacyPolicyPage'));
const TermsConditionsPage = lazyWithReload(() => import('./pages/public/TermsConditionsPage'));
const ProviderLayout = lazyWithReload(() => import('./pages/provider/ProviderLayout'));
const ProviderOnboardingPage = lazyWithReload(() => import('./pages/provider/OnboardingPage'));
const ProviderOverviewPage = lazyWithReload(() => import('./pages/provider/OverviewPage'));
const ProviderProfileEditorPage = lazyWithReload(() => import('./pages/provider/ProfilePage'));
const ProviderServicesPage = lazyWithReload(() => import('./pages/provider/ServicesPage'));
const ProviderBookingsPage = lazyWithReload(() => import('./pages/provider/BookingsPage'));
const ProviderLiveChatPage = lazyWithReload(() => import('./pages/provider/LiveChatPage'));
const ProviderCalendarPage = lazyWithReload(() => import('./pages/provider/CalendarPage'));
const ProviderSubscriptionPage = lazyWithReload(() => import('./pages/provider/SubscriptionPage'));
const ProviderCrmPage = lazyWithReload(() => import('./pages/provider/CrmPage'));
const ProviderLoyaltyPage = lazyWithReload(() => import('./pages/provider/LoyaltyPage'));
const ProviderPaymentsPage = lazyWithReload(() => import('./pages/provider/PaymentsPage'));
const ProviderDigitalProductsPage = lazyWithReload(() => import('./pages/provider/DigitalProductsPage'));
const ProviderContentCalendarPage = lazyWithReload(() => import('./pages/provider/ContentCalendarPage'));
const ProviderAnalyticsPage = lazyWithReload(() => import('./pages/provider/AnalyticsPage'));
const ProviderSettingsPage = lazyWithReload(() => import('./pages/provider/SettingsPage'));
const ProviderDocumentationPage = lazyWithReload(() => import('./pages/provider/DocumentationPage'));
const CustomerLayout = lazyWithReload(() => import('./pages/customer/CustomerLayout'));
const CustomerDashboardPage = lazyWithReload(() => import('./pages/customer/DashboardPage'));
const CustomerBookingsPage = lazyWithReload(() => import('./pages/customer/BookingsPage'));
const CustomerChatsPage = lazyWithReload(() => import('./pages/customer/ChatsPage'));
const CustomerRewardsPage = lazyWithReload(() => import('./pages/customer/RewardsPage'));
const CustomerSavedProvidersPage = lazyWithReload(() => import('./pages/customer/SavedProvidersPage'));
const CustomerNotificationsPage = lazyWithReload(() => import('./pages/customer/NotificationsPage'));
const CustomerSettingsPage = lazyWithReload(() => import('./pages/customer/SettingsPage'));
const AdminLayout = lazyWithReload(() => import('./pages/admin/AdminLayout'));
const AdminDashboardPage = lazyWithReload(() => import('./pages/admin/DashboardPage'));
const AdminActivityPage = lazyWithReload(() => import('./pages/admin/ActivityPage'));
const AdminWaitlistPage = lazyWithReload(() => import('./pages/admin/WaitlistPage'));
const AdminUsersPage = lazyWithReload(() => import('./pages/admin/UsersPage'));
const AdminUserDetailPage = lazyWithReload(() => import('./pages/admin/UserDetailPage'));
const AdminDirectoryPage = lazyWithReload(() => import('./pages/admin/DirectoryPage'));
const AdminVerificationPage = lazyWithReload(() => import('./pages/admin/VerificationPage'));
const AdminContentPage = lazyWithReload(() => import('./pages/admin/ContentPage'));
const AdminContentEditorPage = lazyWithReload(() => import('./pages/admin/ContentEditorPage'));
const AdminMediaPage = lazyWithReload(() => import('./pages/admin/MediaPage'));
const AdminEventRegistrationsPage = lazyWithReload(() => import('./pages/admin/EventRegistrationsPage'));
const AdminOpportunitiesPage = lazyWithReload(() => import('./pages/admin/OpportunitiesPage'));
const AdminAnnouncementsPage = lazyWithReload(() => import('./pages/admin/AnnouncementsPage'));
const AdminSubscriptionsPage = lazyWithReload(() => import('./pages/admin/SubscriptionsPage'));
const AdminSettingsPage = lazyWithReload(() => import('./pages/admin/SettingsPage'));
const AdminDocumentationPage = lazyWithReload(() => import('./pages/admin/DocumentationPage'));
const CurrencyRoute = lazyWithReload(() => import('./router/CurrencyRoute'));

function RouteLoader() {
    return (
        <div className="grid min-h-[70vh] place-items-center bg-cream-50" role="status">
            <div className="text-center">
                <LumaSpin className="mx-auto" />
                <p className="mt-4 text-sm font-bold text-plum-800">Loading BeautyPro HQ...</p>
            </div>
        </div>
    );
}

function ProviderWorkspace() {
    const { user, logout } = useAuth();
    return <ProviderLayout user={user} onLogout={logout} />;
}

function CustomerWorkspace() {
    const { user, logout } = useAuth();
    return <CustomerLayout user={user} onLogout={logout} />;
}

function AdminWorkspace() {
    const { user, logout } = useAuth();
    return <AdminLayout user={user} onLogout={logout} />;
}

export default function App() {
    const location = useLocation();

    useEffect(() => {
        window.sessionStorage.removeItem('bphq_lazy_reload');
        window.sessionStorage.removeItem('bphq_error_boundary_reload');
    }, [location.pathname]);

    return (
        <ErrorBoundary resetKey={location.pathname}>
            <ScrollToTop />
            <Suspense fallback={<RouteLoader />}>
                <Routes>
                    <Route element={<PublicLayout />}>
                        <Route index element={<HomeLandingPage />} />
                        <Route path="directory" element={<DirectoryPage />} />
                        <Route path="news" element={<NewsEventsPage initialTab="news" />} />
                        <Route path="events" element={<NewsEventsPage initialTab="event" />} />
                        <Route path="resources" element={<NewsEventsPage initialTab="news" />} />
                        <Route path="news-events" element={<NewsEventsPage />} />
                        <Route path="news-events/news/:slug" element={<ContentDetailPage type="news" />} />
                        <Route path="news-events/events/:slug" element={<ContentDetailPage type="event" />} />
                        <Route path="opportunities" element={<OpportunitiesPage />} />
                        <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
                        <Route path="booking-confirmation" element={<BookingConfirmationPage />} />
                        <Route path="community" element={<CommunityPage />} />
                        <Route path="community/:id" element={<ContentDetailPage type="community" />} />
                        <Route path="providers/:provider/book/:serviceId" element={<ProviderBookingPage />} />
                        <Route path="providers/:provider/book" element={<ProviderBookingPage />} />
                        <Route path="providers/:provider" element={<ProviderProfilePage />} />
                        <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
                        <Route path="terms-and-conditions" element={<TermsConditionsPage />} />
                    </Route>

                    <Route path="login" element={<LoginPage />} />
                    <Route path="register" element={<RegisterPage />} />
                    <Route path="forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="reset-password" element={<ResetPasswordPage />} />
                    <Route path="verify-email" element={<VerifyEmailPage />} />
                    <Route path="verify-email/:id/:hash" element={<VerifyEmailPage />} />

                    <Route element={<ProtectedRoute roles={['provider']} />}>
                        <Route path="provider/onboarding" element={<ProviderOnboardingPage />} />
                        <Route element={<CurrencyRoute />}>
                            <Route path="provider" element={<ProviderWorkspace />}>
                                <Route index element={<ProviderOverviewPage />} />
                                <Route path="profile" element={<ProviderProfileEditorPage />} />
                                <Route path="services" element={<ProviderServicesPage />} />
                                <Route path="bookings" element={<ProviderBookingsPage />} />
                                <Route path="live-chat" element={<ProviderLiveChatPage />} />
                                <Route path="calendar" element={<ProviderCalendarPage />} />
                                <Route path="subscription" element={<ProviderSubscriptionPage />} />
                                <Route path="crm" element={<ProviderCrmPage />} />
                                <Route path="loyalty" element={<ProviderLoyaltyPage />} />
                                <Route path="payments" element={<ProviderPaymentsPage />} />
                                <Route path="digital-products" element={<ProviderDigitalProductsPage />} />
                                <Route path="content-calendar" element={<ProviderContentCalendarPage />} />
                                <Route path="analytics" element={<ProviderAnalyticsPage />} />
                                <Route path="settings" element={<ProviderSettingsPage />} />
                                <Route path="documentation" element={<ProviderDocumentationPage />} />
                            </Route>
                        </Route>
                    </Route>

                    <Route element={<ProtectedRoute roles={['customer']} />}>
                        <Route path="customer" element={<CustomerWorkspace />}>
                            <Route index element={<CustomerDashboardPage />} />
                            <Route path="bookings" element={<CustomerBookingsPage />} />
                            <Route path="chats" element={<CustomerChatsPage />} />
                            <Route path="rewards" element={<CustomerRewardsPage />} />
                            <Route path="saved-providers" element={<CustomerSavedProvidersPage />} />
                            <Route path="notifications" element={<CustomerNotificationsPage />} />
                            <Route path="settings" element={<CustomerSettingsPage />} />
                        </Route>
                    </Route>

                    <Route element={<ProtectedRoute roles={['admin']} />}>
                        <Route element={<CurrencyRoute />}>
                            <Route path="admin" element={<AdminWorkspace />}>
                                <Route index element={<AdminDashboardPage />} />
                                <Route path="activity" element={<AdminActivityPage />} />
                                <Route path="waitlist" element={<AdminWaitlistPage />} />
                                <Route path="users" element={<AdminUsersPage />} />
                                <Route path="users/:id" element={<AdminUserDetailPage />} />
                                <Route path="directory" element={<AdminDirectoryPage />} />
                                <Route path="verification" element={<AdminVerificationPage />} />
                                <Route path="content" element={<AdminContentPage />} />
                                <Route path="content/:type/new" element={<AdminContentEditorPage />} />
                                <Route path="content/events/:eventId/registrations" element={<AdminEventRegistrationsPage />} />
                                <Route path="content/:type/:id/edit" element={<AdminContentEditorPage />} />
                                <Route path="media" element={<AdminMediaPage />} />
                                <Route path="event-registrations" element={<AdminEventRegistrationsPage />} />
                                <Route path="opportunities" element={<AdminOpportunitiesPage />} />
                                <Route path="announcements" element={<AdminAnnouncementsPage />} />
                                <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
                                <Route path="settings" element={<AdminSettingsPage />} />
                                <Route path="documentation" element={<AdminDocumentationPage />} />
                            </Route>
                        </Route>
                    </Route>

                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </Suspense>
        </ErrorBoundary>
    );
}
