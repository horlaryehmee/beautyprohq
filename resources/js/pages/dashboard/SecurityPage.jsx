import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
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
    const [method, setMethod] = useState('totp');
    const [setup, setSetup] = useState(null);
    const [qrCode, setQrCode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState([]);
    const [awaitingCode, setAwaitingCode] = useState(false);
    const [busy, setBusy] = useState('');
    const { notify } = useDashboardToast();
    const enabled = Boolean(resource.data?.enabled);

    useEffect(() => {
        if (enabled) setAwaitingCode(false);
    }, [enabled]);

    useEffect(() => {
        if (resource.data?.method) setMethod(resource.data.method);
    }, [resource.data?.method]);

    useEffect(() => {
        if (!setup?.setup_uri) {
            setQrCode('');
            return;
        }

        QRCode.toDataURL(setup.setup_uri, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 220,
            color: {
                dark: '#2A1D14',
                light: '#FFFFFF',
            },
        }).then(setQrCode).catch(() => setQrCode(''));
    }, [setup?.setup_uri]);

    const startEnable = async () => {
        setBusy('enable');
        try {
            const result = await apiRequest('post', '/auth/two-factor/enable', { method });
            setSetup(result?.method === 'totp' ? result : null);
            setAwaitingCode(true);
            notify(method === 'totp' ? 'Authenticator setup started.' : 'Confirmation code sent to your email.');
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
            const updated = await apiRequest('post', '/auth/two-factor/confirm', { code, method });
            resource.setData(updated);
            setRecoveryCodes(updated?.recovery_codes ?? []);
            setCode('');
            setSetup(null);
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
            setSetup(null);
            setRecoveryCodes([]);
            setMethod('totp');
            notify('Two-factor authentication disabled.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setBusy('');
        }
    };

    const regenerateRecoveryCodes = async () => {
        setBusy('recovery');
        try {
            const updated = await apiRequest('post', '/auth/two-factor/recovery-codes', { password });
            resource.setData(updated);
            setRecoveryCodes(updated?.recovery_codes ?? []);
            setPassword('');
            notify('New backup codes generated.');
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
                    action={<StatusBadge status={enabled ? `${resource.data?.method === 'totp' ? 'auth app' : 'email'} enabled` : 'disabled'} />}
                    description="Choose whether login verification codes come from an authenticator app or email."
                    title="Two-factor authentication"
                />

                {recoveryCodes.length > 0 && (
                    <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-sm font-bold text-emerald-950">Save your backup codes now</p>
                        <p className="mt-1 text-sm leading-6 text-emerald-800">Each backup code can be used once if you lose access to your 2FA method. They will not be shown again.</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {recoveryCodes.map((recoveryCode) => (
                                <code className="rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold text-stone-900" key={recoveryCode}>{recoveryCode}</code>
                            ))}
                        </div>
                    </div>
                )}

                {!enabled && !awaitingCode && (
                    <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                            {[
                                ['totp', 'Authenticator app', 'Use Google Authenticator, Microsoft Authenticator, 1Password, Authy, or another TOTP app.'],
                                ['email', 'Email code', 'Receive a one-time code by email after your password is accepted.'],
                            ].map(([key, title, description]) => (
                                <button
                                    className={`rounded-2xl border p-4 text-left transition ${method === key ? 'border-plum-950 bg-plum-950 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'}`}
                                    key={key}
                                    onClick={() => setMethod(key)}
                                    type="button"
                                >
                                    <span className="block text-sm font-bold">{title}</span>
                                    <span className={`mt-1 block text-xs leading-5 ${method === key ? 'text-white/75' : 'text-stone-500'}`}>{description}</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-sm leading-6 text-slate-500">2FA will only turn on after you enter a valid confirmation code.</p>
                        <Button busy={busy === 'enable'} onClick={startEnable} type="button">Enable 2FA</Button>
                    </div>
                )}

                {!enabled && awaitingCode && (
                    <form className="max-w-md space-y-4" onSubmit={confirmEnable}>
                        {method === 'totp' && setup?.secret && (
                            <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                                <div>
                                    <p className="text-sm font-bold text-stone-900">Add BeautyPro HQ to your authenticator app</p>
                                    <p className="mt-1 text-sm leading-6 text-stone-500">Scan the QR code or choose manual setup in your app and enter the setup key.</p>
                                </div>
                                {qrCode && (
                                    <div className="inline-flex rounded-2xl border border-stone-200 bg-white p-3">
                                        <img alt="Authenticator app setup QR code" className="h-44 w-44" src={qrCode} />
                                    </div>
                                )}
                                <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 font-mono text-sm font-bold tracking-wider text-stone-900 break-all">{setup.secret}</div>
                                <details className="text-xs text-stone-500">
                                    <summary className="cursor-pointer font-bold text-stone-700">Advanced setup URI</summary>
                                    <p className="mt-2 break-all font-mono">{setup.setup_uri}</p>
                                </details>
                            </div>
                        )}
                        <Field label="Confirmation code" hint={method === 'totp' ? 'Enter the current 6-digit code from your authenticator app.' : 'Check your email for the 6-digit code.'}>
                            <input autoComplete="one-time-code" className={inputClass} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" required value={code} />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                            <Button busy={busy === 'confirm'} type="submit">Confirm and enable</Button>
                            {method === 'email' && <Button onClick={startEnable} type="button" variant="secondary">Resend code</Button>}
                            <Button onClick={() => { setAwaitingCode(false); setSetup(null); setCode(''); }} type="button" variant="secondary">Change method</Button>
                        </div>
                    </form>
                )}

                {enabled && (
                    <form className="max-w-md space-y-4" onSubmit={disable}>
                        <p className="text-sm leading-6 text-slate-500">
                            2FA is active. You have {resource.data?.recovery_codes_count ?? 0} backup codes available.
                        </p>
                        <Field label="Current password">
                            <input autoComplete="current-password" className={inputClass} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                            <Button busy={busy === 'recovery'} disabled={!password || busy === 'disable'} onClick={regenerateRecoveryCodes} type="button" variant="secondary">Generate new backup codes</Button>
                            <Button busy={busy === 'disable'} disabled={busy === 'recovery'} type="submit" variant="danger">Disable 2FA</Button>
                        </div>
                    </form>
                )}
            </Card>
        </div>
    );
}
