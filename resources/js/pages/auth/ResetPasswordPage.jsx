import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/layout/AuthShell';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import Icon from '../../components/ui/Icon';
import { InlineAlert } from '../../components/ui/Feedback';
import api, { apiError, ensureCsrfCookie } from '../../lib/api';

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token') ?? '';
    const [form, setForm] = useState({
        email: searchParams.get('email') ?? '',
        password: '',
        password_confirmation: '',
    });
    const [errors, setErrors] = useState({});
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    function update(key, value) {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    }

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            await ensureCsrfCookie();
            const response = await api.post('/auth/reset-password', { ...form, token });
            navigate('/login', { replace: true, state: { message: response?.data?.message || 'Password reset. You can now log in.' } });
        } catch (requestError) {
            const parsed = apiError(requestError, 'Your password could not be reset. The link may have expired.');
            setError(parsed.message);
            setErrors(parsed.fields);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AuthShell eyebrow="Choose a new password" title="Create a secure password" description="Use at least eight characters and avoid a password you use elsewhere." footer={<Link to="/forgot-password" className="font-black text-rose-700 hover:text-rose-900">Request a new reset link</Link>}>
            {!token ? <InlineAlert>This reset link is missing its secure token. Request a new link to continue.</InlineAlert> : (
                <form onSubmit={submit} className="space-y-5">
                    {error && <InlineAlert>{error}</InlineAlert>}
                    <FormField label="Email address" type="email" icon="mail" value={form.email} onChange={(event) => update('email', event.target.value)} error={errors.email} required />
                    <FormField label="New password" type="password" icon="lock" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} error={errors.password} hint="Use 8+ characters with letters and numbers." minLength={8} required />
                    <FormField label="Confirm new password" type="password" icon="lock" autoComplete="new-password" value={form.password_confirmation} onChange={(event) => update('password_confirmation', event.target.value)} error={errors.password_confirmation} required />
                    <Button type="submit" size="lg" className="w-full" disabled={submitting}>{submitting ? 'Saving password…' : 'Save new password'} {!submitting && <Icon name="arrow" size={17} />}</Button>
                </form>
            )}
        </AuthShell>
    );
}
