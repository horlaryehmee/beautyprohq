import { adminNavigation, DashboardShell } from '../../components/dashboard';

export default function AdminLayout(props) {
    return <DashboardShell navigation={adminNavigation} role="admin" {...props} />;
}

