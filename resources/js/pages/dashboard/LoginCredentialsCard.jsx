import { useEffect, useState } from 'react';
import {
    Button,
    Card,
    CardHeader,
    Field,
    apiErrorMessage,
    apiRequest,
    inputClass,
    useDashboardToast,
} from '../../components/dashboard';
import { useAuth } from '../../context/AuthContext';

export default function LoginCredentialsCard() {
    const { user, refreshUser } = useAuth();
    const { notify } = useDashboardToast();
    const [emailForm, setEmailForm] = useState({ email: '', current_password: '' });
    const [passwordForm, setPasswordForm] = useState({ current_password: '', password: '', password_confirmation: '' });
    const [busy, setBusy] = useState('');
    const isAdmin = user?.role === 'admin';
    const emailChangeUsed = Boolean(user?.login_email_changed_at);

    useEffect(() => {
        setEmailForm((current) => ({ ...current, email: user?.pending_email || user?.email || '' }));
    }, [user?.email, user?.pending_email]);

    const updateEmail = async (event) => {
        event.preventDefault();
        setBusy('email');
        try {
            await apiRequest('post', '/auth/email-change', emailForm);
            await refreshUser();
            setEmailForm((current) => ({ ...current, current_password: '' }));
            notify('Verification sent to your new email address.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setBusy('');
        }
    };

    const updatePassword = async (event) => {
        event.preventDefault();
        setBusy('password');
        try {
            await apiRequest('put', '/auth/password', passwordForm);
            setPasswordForm({ current_password: '', password: '', password_confirmation: '' });
            notify('Your password has been updated securely.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setBusy('');
        }
    };

    return (
        <div className={`grid gap-6 ${isAdmin ? 'xl:grid-cols-2' : ''}`}>
            {isAdmin && !emailChangeUsed && <Card>
                <CardHeader
                    description="The administrator login email can be changed once. The new address becomes active only after verification."
                    title="One-time administrator email change"
                />
                <form className="space-y-4" onSubmit={updateEmail}>
                    <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Current login: <strong className="text-slate-900">{user?.email}</strong></p>
                    {user?.pending_email && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Awaiting verification: {user.pending_email}</p>}
                    <Field label="New login email">
                        <input autoComplete="email" className={inputClass} onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))} required type="email" value={emailForm.email} />
                    </Field>
                    <Field label="Current password">
                        <input autoComplete="current-password" className={inputClass} onChange={(event) => setEmailForm((current) => ({ ...current, current_password: event.target.value }))} required type="password" value={emailForm.current_password} />
                    </Field>
                    <Button busy={busy === 'email'} disabled={busy === 'password'} type="submit">Verify new email</Button>
                </form>
            </Card>}

            {isAdmin && emailChangeUsed && <Card>
                <CardHeader
                    description="The permitted one-time email change has been completed and cannot be used again."
                    title="Login email locked"
                />
                <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Current verified administrator login: <strong>{user?.email}</strong></p>
            </Card>}

            <Card className={isAdmin ? '' : 'max-w-2xl'}>
                <CardHeader
                    description="Use at least 8 characters with both letters and numbers. Other sessions and API tokens will be revoked."
                    title="Login password"
                />
                <form className="space-y-4" onSubmit={updatePassword}>
                    <Field label="Current password">
                        <input autoComplete="current-password" className={inputClass} onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))} required type="password" value={passwordForm.current_password} />
                    </Field>
                    <Field label="New password">
                        <input autoComplete="new-password" className={inputClass} minLength={8} onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))} required type="password" value={passwordForm.password} />
                    </Field>
                    <Field label="Confirm new password">
                        <input autoComplete="new-password" className={inputClass} minLength={8} onChange={(event) => setPasswordForm((current) => ({ ...current, password_confirmation: event.target.value }))} required type="password" value={passwordForm.password_confirmation} />
                    </Field>
                    <Button busy={busy === 'password'} disabled={busy === 'email'} type="submit">Update password</Button>
                </form>
            </Card>
        </div>
    );
}
