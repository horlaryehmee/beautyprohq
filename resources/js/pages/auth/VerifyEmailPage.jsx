import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/layout/AuthShell';
import Button, { buttonClass } from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { InlineAlert } from '../../components/ui/Feedback';
import api, { apiError, ensureCsrfCookie } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function dashboardFor(role) {
    if (role === 'admin') return '/admin';
    if (role === 'provider') return '/provider';
    return '/customer';
}

export default function VerifyEmailPage() {
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();
    const id = params.id ?? searchParams.get('id');
    const hash = params.hash ?? searchParams.get('hash');
    const attempted = useRef(false);
    const [status, setStatus] = useState(id && hash ? 'verifying' : 'waiting');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [resending, setResending] = useState(false);

    useEffect(() => {
        if (!id || !hash || attempted.current) return;
        attempted.current = true;
        const verificationQuery = Object.fromEntries([...searchParams.entries()].filter(([key]) => !['id', 'hash'].includes(key)));
        api.get(`/email/verify/${id}/${hash}`, { params: verificationQuery })
            .then(async (response) => {
                setStatus('verified');
                setMessage(response?.data?.message || 'Your email address is verified.');
                await refreshUser();
            })
            .catch((requestError) => {
                setStatus('failed');
                setError(apiError(requestError, 'This verification link is invalid or has expired.').message);
            });
    }, [id, hash, searchParams, refreshUser]);

    async function resend() {
        setResending(true);
        setError('');
        try {
            await ensureCsrfCookie();
            const response = await api.post('/email/verification-notification');
            setMessage(response?.data?.message || 'A new verification link has been sent.');
        } catch (requestError) {
            setError(apiError(requestError, 'We could not send a new verification link.').message);
        } finally {
            setResending(false);
        }
    }

    return (
        <AuthShell eyebrow="Email verification" title={status === 'verified' ? 'You’re verified' : status === 'verifying' ? 'Verifying your email…' : 'Check your inbox'} description={status === 'waiting' ? `We sent a verification link${user?.email ? ` to ${user.email}` : ''}. Open it to activate every part of your account.` : undefined}>
            <div className="text-center">
                <span className={`mx-auto grid size-16 place-items-center rounded-3xl ${status === 'verified' ? 'bg-emerald-100 text-emerald-700' : status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-rose-100 text-rose-700'}`}>
                    {status === 'verifying' ? <span className="loading-ring" /> : <Icon name={status === 'verified' ? 'check' : status === 'failed' ? 'alert' : 'mail'} size={28} />}
                </span>
                {message && <InlineAlert tone="success" className="mt-6 text-left">{message}</InlineAlert>}
                {error && <InlineAlert className="mt-6 text-left">{error}</InlineAlert>}

                {status === 'verified' ? (
                    <button type="button" className={`${buttonClass({ size: 'lg' })} mt-7 w-full`} onClick={() => navigate(dashboardFor(user?.role), { replace: true })}>Continue to dashboard <Icon name="arrow" size={17} /></button>
                ) : status !== 'verifying' && (
                    <div className="mt-7 space-y-3">
                        {user ? <Button size="lg" className="w-full" onClick={resend} disabled={resending}>{resending ? 'Sending…' : 'Send a new verification link'}</Button> : <Link to="/login" className={`${buttonClass({ size: 'lg' })} w-full`}>Log in to resend</Link>}
                        <Link to="/" className={`${buttonClass({ variant: 'ghost' })} w-full`}>I’ll do this later</Link>
                    </div>
                )}
            </div>
        </AuthShell>
    );
}
