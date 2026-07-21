import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import PublicLayout from './components/layout/PublicLayout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './router/ProtectedRoute';
import ScrollToTop from './router/ScrollToTop';
import HomePage from './pages/public/HomePage';
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const DirectoryPage = lazy(() => import('./pages/public/DirectoryPage'));
const NewsEventsPage = lazy(() => import('./pages/public/NewsEventsPage'));
const OpportunitiesPage = lazy(() => import('./pages/public/OpportunitiesPage'));
const OpportunityDetailPage = lazy(() => import('./pages/public/OpportunityDetailPage'));
const BookingConfirmationPage = lazy(() => import('./pages/public/BookingConfirmationPage'));
const ProviderBookingPage = lazy(() => import('./pages/public/ProviderBookingPage'));
const CommunityPage = lazy(() => import('./pages/public/CommunityPage'));
const ContentDetailPage = lazy(() => import('./pages/public/ContentDetailPage'));
const ProviderProfilePage = lazy(() => import('./pages/public/ProviderProfilePage'));
const PrivacyPolicyPage = lazy(() => import('./pages/public/PrivacyPolicyPage'));
const TermsConditionsPage = lazy(() => import('./pages/public/TermsConditionsPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const ProviderLayout = lazy(() => import('./pages/provider/ProviderLayout'));
const ProviderOnboardingPage = lazy(() => import('./pages/provider/OnboardingPage'));
const ProviderOverviewPage = lazy(() => import('./pages/provider/OverviewPage'));
const ProviderProfileEditorPage = lazy(() => import('./pages/provider/ProfilePage'));
const ProviderServicesPage = lazy(() => import('./pages/provider/ServicesPage'));
const ProviderBookingsPage = lazy(() => import('./pages/provider/BookingsPage'));
const ProviderCalendarPage = lazy(() => import('./pages/provider/CalendarPage'));
const ProviderSubscriptionPage = lazy(() => import('./pages/provider/SubscriptionPage'));
const ProviderCrmPage = lazy(() => import('./pages/provider/CrmPage'));
const ProviderLoyaltyPage = lazy(() => import('./pages/provider/LoyaltyPage'));
const ProviderPaymentsPage = lazy(() => import('./pages/provider/PaymentsPage'));
const ProviderDigitalProductsPage = lazy(() => import('./pages/provider/DigitalProductsPage'));
const ProviderContentCalendarPage = lazy(() => import('./pages/provider/ContentCalendarPage'));
const ProviderAnalyticsPage = lazy(() => import('./pages/provider/AnalyticsPage'));
const ProviderSettingsPage = lazy(() => import('./pages/provider/SettingsPage'));
const ProviderDocumentationPage = lazy(() => import('./pages/provider/DocumentationPage'));
const CustomerLayout = lazy(() => import('./pages/customer/CustomerLayout'));
const CustomerDashboardPage = lazy(() => import('./pages/customer/DashboardPage'));
const CustomerBookingsPage = lazy(() => import('./pages/customer/BookingsPage'));
const CustomerRewardsPage = lazy(() => import('./pages/customer/RewardsPage'));
const CustomerSavedProvidersPage = lazy(() => import('./pages/customer/SavedProvidersPage'));
const CustomerNotificationsPage = lazy(() => import('./pages/customer/NotificationsPage'));
const CustomerSettingsPage = lazy(() => import('./pages/customer/SettingsPage'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const AdminActivityPage = lazy(() => import('./pages/admin/ActivityPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/UsersPage'));
const AdminUserDetailPage = lazy(() => import('./pages/admin/UserDetailPage'));
const AdminDirectoryPage = lazy(() => import('./pages/admin/DirectoryPage'));
const AdminVerificationPage = lazy(() => import('./pages/admin/VerificationPage'));
const AdminContentPage = lazy(() => import('./pages/admin/ContentPage'));
const AdminContentEditorPage = lazy(() => import('./pages/admin/ContentEditorPage'));
const AdminOpportunitiesPage = lazy(() => import('./pages/admin/OpportunitiesPage'));
const AdminAnnouncementsPage = lazy(() => import('./pages/admin/AnnouncementsPage'));
const AdminSubscriptionsPage = lazy(() => import('./pages/admin/SubscriptionsPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const AdminDocumentationPage = lazy(() => import('./pages/admin/DocumentationPage'));
const CurrencyRoute = lazy(() => import('./router/CurrencyRoute'));

function RouteLoader() {
    return (
        <div className="grid min-h-[70vh] place-items-center bg-cream-50" role="status">
            <div className="text-center">
                <span className="loading-ring mx-auto block" />
                <p className="mt-4 text-sm font-bold text-plum-800">Loading BeautyPro HQ…</p>
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
    return (
        <ErrorBoundary>
            <ScrollToTop />
            <Suspense fallback={<RouteLoader />}>
                <Routes>
                    <Route element={<PublicLayout />}>
                        <Route index element={<HomePage />} />
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
                                <Route path="users" element={<AdminUsersPage />} />
                                <Route path="users/:id" element={<AdminUserDetailPage />} />
                                <Route path="directory" element={<AdminDirectoryPage />} />
                                <Route path="verification" element={<AdminVerificationPage />} />
                                <Route path="content" element={<AdminContentPage />} />
                                <Route path="content/:type/new" element={<AdminContentEditorPage />} />
                                <Route path="content/:type/:id/edit" element={<AdminContentEditorPage />} />
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
