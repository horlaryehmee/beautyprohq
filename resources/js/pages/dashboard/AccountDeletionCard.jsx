import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Button,
    Card,
    CardHeader,
    Field,
    apiErrorMessage,
    apiRequest,
    inputClass,
} from '../../components/dashboard';
import { useAuth } from '../../context/AuthContext';

export default function AccountDeletionCard() {
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const { user, setUser } = useAuth();
    const navigate = useNavigate();

    if (!user || user.role === 'admin') return null;

    const destroyAccount = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');

        try {
            await apiRequest('delete', '/auth/account', { password, confirmation });
            setUser(null);
            navigate('/login', {
                replace: true,
                state: { message: 'Your account has been permanently deleted.' },
            });
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Your account could not be deleted.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card className="border-red-200">
            <CardHeader
                description="This permanently removes your profile, bookings, messages, content, rewards, and other account data. This action cannot be undone."
                title="Delete account"
            />
            <form className="max-w-lg space-y-4" onSubmit={destroyAccount}>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
                    Any active provider renewal will be stopped before deletion. If billing cannot be stopped safely, your account will remain intact and you will be asked to contact support.
                </div>
                {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
                <Field label="Current password">
                    <input
                        autoComplete="current-password"
                        className={inputClass}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        type="password"
                        value={password}
                    />
                </Field>
                <Field hint="Enter DELETE in uppercase to confirm." label="Type DELETE">
                    <input
                        autoComplete="off"
                        className={inputClass}
                        onChange={(event) => setConfirmation(event.target.value)}
                        required
                        value={confirmation}
                    />
                </Field>
                <Button
                    busy={busy}
                    disabled={!password || confirmation !== 'DELETE'}
                    type="submit"
                    variant="danger"
                >
                    Permanently delete account
                </Button>
            </form>
        </Card>
    );
}
