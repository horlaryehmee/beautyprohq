import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ roles = [] }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="grid min-h-screen place-items-center bg-cream-50" role="status">
                <div className="text-center">
                    <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-rose-100 border-t-plum-700" />
                    <p className="mt-4 text-sm font-semibold text-plum-800">Preparing your workspace…</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    if (roles.length > 0 && !roles.includes(user.role)) {
        const home = user.role === 'provider' ? '/provider' : user.role === 'admin' ? '/admin' : '/customer';
        return <Navigate to={home} replace />;
    }

    const providerProfile = user.provider_profile ?? user.providerProfile;
    const onboardingComplete = Boolean(providerProfile?.onboarding_complete ?? providerProfile?.onboarding_completed_at);
    if (user.role === 'provider' && !onboardingComplete && location.pathname !== '/provider/onboarding') {
        return <Navigate to="/provider/onboarding" replace />;
    }

    if (user.role === 'provider' && onboardingComplete && location.pathname === '/provider/onboarding') {
        return <Navigate to="/provider" replace />;
    }

    return <Outlet />;
}
