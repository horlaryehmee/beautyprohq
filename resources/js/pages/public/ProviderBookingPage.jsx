import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { collectionFrom, unwrap } from '../../lib/api';
import BookingModal from '../../components/public/BookingModal';
import Button, { buttonClass } from '../../components/ui/Button';
import { EmptyState, PageLoader } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';

export default function ProviderBookingPage() {
    const { provider, serviceId } = useParams();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [profileResponse, servicesResponse] = await Promise.all([
                api.get(`/providers/${provider}`),
                api.get(`/providers/${provider}/services`),
            ]);
            const profilePayload = unwrap(profileResponse);
            setProfile(profilePayload?.provider ?? profilePayload);
            setServices(collectionFrom(servicesResponse));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || 'This booking page could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [provider]);

    useEffect(() => { load(); }, [load]);

    const selectedService = useMemo(() => services.find((service) => String(service.id) === String(serviceId)), [serviceId, services]);

    if (loading) return <PageLoader label="Loading booking page..." />;
    if (error || !profile) {
        return (
            <div className="page-container py-20">
                <EmptyState
                    icon="calendar"
                    title="Booking unavailable"
                    message={error}
                    action={<div className="flex justify-center gap-2"><Button onClick={load}>Try again</Button><Link to="/directory" className={buttonClass({ variant: 'secondary' })}>Back to directory</Link></div>}
                />
            </div>
        );
    }

    if (serviceId && !selectedService) {
        return (
            <div className="page-container py-20">
                <EmptyState
                    icon="calendar"
                    title="Service unavailable"
                    message="The selected service could not be found or is no longer available."
                    action={<Link to={`/providers/${provider}`} className={buttonClass({ variant: 'secondary' })}>Back to profile</Link>}
                />
            </div>
        );
    }

    return (
        <section className="bg-[#fbf9f4] px-3 py-4 sm:px-5 sm:py-8">
            <div className="mx-auto max-w-5xl">
                <Link to={`/providers/${provider}`} className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-[#34231c] shadow-sm">
                    <Icon name="chevronLeft" size={15} /> Back to profile
                </Link>
                <BookingModal
                    open
                    standalone
                    onClose={() => navigate(`/providers/${provider}`)}
                    provider={profile}
                    services={services}
                    initialService={selectedService}
                />
            </div>
        </section>
    );
}
