import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../../components/layout/AuthShell';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import Icon from '../../components/ui/Icon';
import { InlineAlert } from '../../components/ui/Feedback';
import api, { apiError, ensureCsrfCookie } from '../../lib/api';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [fieldError, setFieldError] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setSubmitting(true);
        setError('');
        setFieldError('');
        setMessage('');
        try {
            await ensureCsrfCookie();
            const response = await api.post('/auth/forgot-password', { email });
            setMessage(response?.data?.message || 'If an account exists for that email, a reset link is on its way.');
        } catch (requestError) {
            const parsed = apiError(requestError, 'We could not send the reset link.');
            setError(parsed.message);
            setFieldError(parsed.fields.email);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AuthShell
            eyebrow="Account recovery"
            title="Reset your password"
            description="Enter the email connected to your account and we will send you a secure reset link."
            footer={<Link to="/login" className="inline-flex items-center gap-1 font-black text-rose-700 hover:text-rose-900"><Icon name="chevronLeft" size={14} /> Back to login</Link>}
        >
            {message ? (
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 text-center">
                    <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm"><Icon name="mail" /></span>
                    <h2 className="mt-4 font-display text-lg font-black text-plum-950">Check your inbox</h2>
                    <p className="mt-2 text-sm leading-6 text-emerald-800">{message}</p>
                    <Button variant="secondary" className="mt-5" onClick={() => setMessage('')}>Use another email</Button>
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-5">
                    {error && <InlineAlert>{error}</InlineAlert>}
                    <FormField label="Email address" type="email" icon="mail" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} error={fieldError} placeholder="you@example.com" required autoFocus />
                    <Button type="submit" size="lg" className="w-full" disabled={submitting}>{submitting ? 'Sending link…' : 'Send reset link'} {!submitting && <Icon name="arrow" size={17} />}</Button>
                </form>
            )}
        </AuthShell>
    );
}
