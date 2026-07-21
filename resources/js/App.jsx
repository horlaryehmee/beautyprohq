import { Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import PublicLayout from './components/layout/PublicLayout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './router/ProtectedRoute';
import ScrollToTop from './router/ScrollToTop';
import NotFoundPage from './pages/NotFoundPage';
import HomePage from './pages/public/HomePage';
import DirectoryPage from './pages/public/DirectoryPage';
import NewsEventsPage from './pages/public/NewsEventsPage';
import OpportunitiesPage from './pages/public/OpportunitiesPage';
import OpportunityDetailPage from './pages/public/OpportunityDetailPage';
import BookingConfirmationPage from './pages/public/BookingConfirmationPage';
import CommunityPage from './pages/public/CommunityPage';
import ContentDetailPage from './pages/public/ContentDetailPage';
import ProviderProfilePage from './pages/public/ProviderProfilePage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';

import ProviderLayout from './pages/provider/ProviderLayout';
import ProviderOnboardingPage from './pages/provider/OnboardingPage';
import ProviderOverviewPage from './pages/provider/OverviewPage';
import ProviderProfileEditorPage from './pages/provider/ProfilePage';
import ProviderServicesPage from './pages/provider/ServicesPage';
import ProviderBookingsPage from './pages/provider/BookingsPage';
import ProviderCalendarPage from './pages/provider/CalendarPage';
import ProviderSubscriptionPage from './pages/provider/SubscriptionPage';
import ProviderCrmPage from './pages/provider/CrmPage';
import ProviderLoyaltyPage from './pages/provider/LoyaltyPage';
import ProviderPaymentsPage from './pages/provider/PaymentsPage';
import ProviderDigitalProductsPage from './pages/provider/DigitalProductsPage';
import ProviderContentCalendarPage from './pages/provider/ContentCalendarPage';
import ProviderAnalyticsPage from './pages/provider/AnalyticsPage';
import ProviderSettingsPage from './pages/provider/SettingsPage';
import ProviderDocumentationPage from './pages/provider/DocumentationPage';
import CustomerLayout from './pages/customer/CustomerLayout';
import CustomerDashboardPage from './pages/customer/DashboardPage';
import CustomerBookingsPage from './pages/customer/BookingsPage';
import CustomerRewardsPage from './pages/customer/RewardsPage';
import CustomerSavedProvidersPage from './pages/customer/SavedProvidersPage';
import CustomerNotificationsPage from './pages/customer/NotificationsPage';
import CustomerSettingsPage from './pages/customer/SettingsPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/DashboardPage';
import AdminActivityPage from './pages/admin/ActivityPage';
import AdminUsersPage from './pages/admin/UsersPage';
import AdminUserDetailPage from './pages/admin/UserDetailPage';
import AdminDirectoryPage from './pages/admin/DirectoryPage';
import AdminVerificationPage from './pages/admin/VerificationPage';
import AdminContentPage from './pages/admin/ContentPage';
import AdminContentEditorPage from './pages/admin/ContentEditorPage';
import AdminOpportunitiesPage from './pages/admin/OpportunitiesPage';
import AdminAnnouncementsPage from './pages/admin/AnnouncementsPage';
import AdminSubscriptionsPage from './pages/admin/SubscriptionsPage';
import AdminSettingsPage from './pages/admin/SettingsPage';
import AdminDocumentationPage from './pages/admin/DocumentationPage';

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
            <CurrencyProvider>
                <ScrollToTop />
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
                        <Route path="providers/:provider" element={<ProviderProfilePage />} />
                    </Route>

                    <Route path="login" element={<LoginPage />} />
                    <Route path="register" element={<RegisterPage />} />
                    <Route path="forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="reset-password" element={<ResetPasswordPage />} />
                    <Route path="verify-email" element={<VerifyEmailPage />} />
                    <Route path="verify-email/:id/:hash" element={<VerifyEmailPage />} />

                    <Route element={<ProtectedRoute roles={['provider']} />}>
                        <Route path="provider/onboarding" element={<ProviderOnboardingPage />} />
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

                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </CurrencyProvider>
        </ErrorBoundary>
    );
}
