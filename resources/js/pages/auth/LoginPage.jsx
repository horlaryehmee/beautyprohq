import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/layout/AuthShell';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import Icon from '../../components/ui/Icon';
import { InlineAlert } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { apiError } from '../../lib/api';

function dashboardFor(role) {
    if (role === 'admin') return '/admin';
    if (role === 'provider') return '/provider';
    return '/customer';
}

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [form, setForm] = useState({ email: '', password: '', remember: false });
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
            const user = await login(form);
            const redirect = searchParams.get('redirect') ?? location.state?.from;
            navigate(redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : dashboardFor(user?.role), { replace: true });
        } catch (requestError) {
            const parsed = apiError(requestError, 'We could not log you in with those details.');
            setError(parsed.message);
            setErrors(parsed.fields);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AuthShell
            title="Welcome back"
            description="Log in to manage your bookings, profile, and BeautyPro HQ activity."
            footer={<>New to BeautyPro HQ? <Link to="/register" className="font-black text-rose-700 hover:text-rose-900">Create an account</Link></>}
        >
            <form onSubmit={submit} className="space-y-5">
                {location.state?.message && <InlineAlert tone="success">{location.state.message}</InlineAlert>}
                {error && <InlineAlert>{error}</InlineAlert>}
                <FormField label="Email address" type="email" icon="mail" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} error={errors.email} placeholder="you@example.com" required autoFocus />
                <FormField label="Password" type="password" icon="lock" autoComplete="current-password" value={form.password} onChange={(event) => update('password', event.target.value)} error={errors.password} placeholder="Enter your password" required />
                <div className="flex items-center justify-between gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-stone-600"><input type="checkbox" checked={form.remember} onChange={(event) => update('remember', event.target.checked)} className="size-4 rounded border-stone-300 accent-plum-900" />Keep me logged in</label>
                    <Link to="/forgot-password" className="text-xs font-black text-rose-700 hover:text-rose-900">Forgot password?</Link>
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'} {!submitting && <Icon name="arrow" size={17} />}</Button>
            </form>
        </AuthShell>
    );
}
