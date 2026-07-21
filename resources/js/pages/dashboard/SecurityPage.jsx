import { useEffect, useState } from 'react';
import {
    Button,
    Card,
    CardHeader,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';

export default function SecurityPage({ embedded = false }) {
    const resource = useApiResource('/auth/two-factor', {});
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [awaitingCode, setAwaitingCode] = useState(false);
    const [busy, setBusy] = useState('');
    const { notify } = useDashboardToast();
    const enabled = Boolean(resource.data?.enabled);

    useEffect(() => {
        if (enabled) setAwaitingCode(false);
    }, [enabled]);

    const startEnable = async () => {
        setBusy('enable');
        try {
            await apiRequest('post', '/auth/two-factor/enable');
            setAwaitingCode(true);
            notify('Confirmation code sent to your email.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setBusy('');
        }
    };

    const confirmEnable = async (event) => {
        event.preventDefault();
        setBusy('confirm');
        try {
            const updated = await apiRequest('post', '/auth/two-factor/confirm', { code });
            resource.setData(updated);
            setCode('');
            setAwaitingCode(false);
            notify('Two-factor authentication enabled.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setBusy('');
        }
    };

    const disable = async (event) => {
        event.preventDefault();
        setBusy('disable');
        try {
            const updated = await apiRequest('post', '/auth/two-factor/disable', { password });
            resource.setData(updated);
            setPassword('');
            notify('Two-factor authentication disabled.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setBusy('');
        }
    };

    if (resource.loading) return <LoadingBlock rows={5} />;

    return (
        <div className="space-y-6">
            {!embedded && <PageHeader description="Protect your account with a second verification code during login." eyebrow="Account" title="Security" />}
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card>
                <CardHeader
                    action={<StatusBadge status={enabled ? 'enabled' : 'disabled'} />}
                    description="When enabled, BeautyPro HQ sends a one-time code to your email after your password is accepted."
                    title="Two-factor authentication"
                />

                {!enabled && !awaitingCode && (
                    <div className="space-y-4">
                        <p className="text-sm leading-6 text-slate-500">Start setup to receive a confirmation code by email. 2FA will only turn on after you enter that code.</p>
                        <Button busy={busy === 'enable'} onClick={startEnable} type="button">Enable 2FA</Button>
                    </div>
                )}

                {!enabled && awaitingCode && (
                    <form className="max-w-md space-y-4" onSubmit={confirmEnable}>
                        <Field label="Confirmation code" hint="Check your email for the 6-digit code.">
                            <input autoComplete="one-time-code" className={inputClass} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" required value={code} />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                            <Button busy={busy === 'confirm'} type="submit">Confirm and enable</Button>
                            <Button onClick={startEnable} type="button" variant="secondary">Resend code</Button>
                        </div>
                    </form>
                )}

                {enabled && (
                    <form className="max-w-md space-y-4" onSubmit={disable}>
                        <p className="text-sm leading-6 text-slate-500">2FA is active. Enter your password to disable it.</p>
                        <Field label="Current password">
                            <input autoComplete="current-password" className={inputClass} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                        </Field>
                        <Button busy={busy === 'disable'} type="submit" variant="danger">Disable 2FA</Button>
                    </form>
                )}
            </Card>
        </div>
    );
}
