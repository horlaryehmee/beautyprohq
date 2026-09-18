import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/layout/AuthShell';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import { InlineAlert } from '../../components/ui/Feedback';
import api, { apiError, ensureCsrfCookie, unwrap } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function ClaimAccountPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { refreshUser } = useAuth();
    const listing = params.get('listing');
    const token = params.get('token');
    const hasLink = Boolean(listing && token);
    const [email, setEmail] = useState('');
    const [form, setForm] = useState({ password: '', password_confirmation: '', login_email: '', accept_terms: false });
    const [error, setError] = useState('');
    const [errors, setErrors] = useState({});
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setError('');
        setErrors({});
        setSubmitting(true);
        try {
            await ensureCsrfCookie();
            if (!hasLink) {
                const response = await api.post('/auth/claim/request', { email });
                setMessage(response?.data?.message || 'Check your email for a claim link.');
                return;
            }
            const response = await api.post('/auth/claim/complete', { listing, token, ...form });
            const payload = unwrap(response);
            await refreshUser();
            navigate(payload?.redirect || '/provider', { replace: true });
        } catch (requestError) {
            const parsed = apiError(requestError, 'The claim could not be completed. Please try again.');
            setError(parsed.message);
            setErrors(parsed.fields || {});
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AuthShell
            eyebrow="Provider account"
            title={hasLink ? 'Claim your listing' : 'Claim your provider account'}
            description={hasLink
                ? 'Set a password to manage your imported listing from the provider dashboard.'
                : 'Enter the email used for your Beautypreneur Hub listing. We will send a private claim link for each listing connected to it.'}
            footer={<Link to="/login" className="font-semibold text-rose-700 hover:text-rose-900">Back to login</Link>}
        >
            {message ? <InlineAlert tone="success">{message}</InlineAlert> : (
                <form onSubmit={submit} className="space-y-5">
                    {error && <InlineAlert>{error}</InlineAlert>}
                    {!hasLink ? (
                        <FormField label="Email used on Beautypreneur Hub" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email} required autoFocus />
                    ) : (
                        <>
                            <FormField label="New password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} error={errors.password} hint="Use at least 8 characters with letters and numbers." required />
                            <FormField label="Confirm password" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(event) => setForm((current) => ({ ...current, password_confirmation: event.target.value }))} error={errors.password_confirmation} required />
                            <FormField label="Different login email (only if prompted)" type="email" autoComplete="email" value={form.login_email} onChange={(event) => setForm((current) => ({ ...current, login_email: event.target.value }))} error={errors.login_email} hint="If two listings share the same source email, the second dashboard needs another login email. You will verify that new address next." />
                            <label className="flex gap-2 text-sm text-stone-700">
                                <input type="checkbox" checked={form.accept_terms} onChange={(event) => setForm((current) => ({ ...current, accept_terms: event.target.checked }))} required />
                                <span>I accept the <Link to="/terms-and-conditions" target="_blank" className="font-semibold underline">terms and conditions</Link>.</span>
                            </label>
                            {errors.accept_terms && <p className="text-sm text-red-700">{errors.accept_terms}</p>}
                        </>
                    )}
                    <Button type="submit" size="lg" className="w-full" disabled={submitting}>{submitting ? 'Please wait...' : hasLink ? 'Claim listing' : 'Send claim link'}</Button>
                </form>
            )}
        </AuthShell>
    );
}
