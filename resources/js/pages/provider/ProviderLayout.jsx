import { DashboardShell, providerNavigation } from '../../components/dashboard';

export default function ProviderLayout(props) {
    return <DashboardShell navigation={providerNavigation} role="provider" {...props} />;
}

