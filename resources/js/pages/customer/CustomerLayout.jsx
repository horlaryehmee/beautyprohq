import { customerNavigation, DashboardShell } from '../../components/dashboard';

export default function CustomerLayout(props) {
    return <DashboardShell navigation={customerNavigation} role="customer" {...props} />;
}

