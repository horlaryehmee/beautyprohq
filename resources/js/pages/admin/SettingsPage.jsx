import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, ErrorState, Field, LoadingBlock, PageHeader, StatusBadge, apiErrorMessage, apiRequest, inputClass, useApiResource, useDashboardToast } from '../../components/dashboard';
import Icon from '../../components/ui/Icon';
import SecurityPage from '../dashboard/SecurityPage';

const emailNotifications = [
    { key: 'email_verification', recipient: 'All users', title: 'Email verification', description: 'Laravel auth email sent when a user needs to confirm their email address.' },
    { key: 'password_reset', recipient: 'All users', title: 'Password reset', description: 'Laravel auth email sent when a user requests a password reset.' },
    { key: 'two_factor_code', recipient: 'All users', title: 'Two-factor authentication code', description: 'Security email used when the user chooses email-based 2FA.' },
    { key: 'newsletter_subscription', recipient: 'Newsletter subscriber', title: 'Newsletter subscription confirmation', description: 'Confirmation email sent after a public newsletter signup.' },
    { key: 'event_registration', recipient: 'Event attendee', title: 'Event registration confirmation', description: 'Confirmation email sent after registering for a published event.' },
    { key: 'opportunity_enquiry', recipient: 'Opportunity sender', title: 'Opportunity enquiry confirmation', description: 'Confirmation email sent after applying or enquiring about an opportunity.' },
    { key: 'contact_enquiry', recipient: 'Contact sender', title: 'Contact enquiry confirmation', description: 'Confirmation email sent after submitting the public contact form.' },
    { key: 'customer_booking_update', recipient: 'Customer', title: 'Booking updates', description: 'Booking request, payment, cancellation and status update emails.' },
    { key: 'provider_booking_update', recipient: 'Provider', title: 'Booking and payment updates', description: 'Provider booking request, cancellation, payment and onboarding emails.' },
    { key: 'verification_decision', recipient: 'Provider', title: 'Verification decision', description: 'Email sent when admin approves, declines or updates a verification request.' },
    { key: 'admin_alert', recipient: 'Admin', title: 'Admin alerts', description: 'New user, booking, payment, onboarding, event registration, opportunity and contact alerts.' },
    { key: 'announcement', recipient: 'Selected audience', title: 'Announcements', description: 'Admin-created announcements sent to all users, customers or providers.' },
];

const normalizePlans = (value) => Array.isArray(value) ? value : value?.plans ?? value?.data ?? [];

const platformSettingTabs = [
    { key: 'general', label: 'General', icon: 'settings', description: 'Launch mode, provider features and demo data.' },
    { key: 'security', label: 'Security', icon: 'shield', description: 'Password, sessions and two-factor authentication.' },
    { key: 'email', label: 'Email', icon: 'mail', description: 'SMTP and active notification tests.' },
    { key: 'communications', label: 'Communications', icon: 'bell', description: 'WhatsApp and non-email messaging channels.' },
    { key: 'payments', label: 'Payments', icon: 'briefcase', description: 'Gateway, Paystack and Stripe settings.' },
    { key: 'currency', label: 'Currency', icon: 'chart', description: 'Default currency and exchange rates.' },
];

export default function AdminSettingsPage() {
    const gatewayResource = useApiResource('/admin/payment-settings/gateway', {});
    const plansResource = useApiResource('/admin/subscription-plans', []);
    const paystackResource = useApiResource('/admin/payment-settings/paystack', {});
    const stripeResource = useApiResource('/admin/payment-settings/stripe', {});
    const brandingResource = useApiResource('/admin/settings/branding', {});
    const currencyResource = useApiResource('/admin/settings/currencies', {});
    const featuresResource = useApiResource('/admin/settings/features', {});
    const twilioResource = useApiResource('/admin/settings/twilio', {});
    const smtpResource = useApiResource('/admin/settings/smtp', {});
    const liveChatResource = useApiResource('/admin/settings/live-chat', {});
    const demoResource = useApiResource('/admin/demo-data', {});
    const deploymentResource = useApiResource('/admin/settings/deployment', {});
    const { notify } = useDashboardToast();
    const [sectionTab, setSectionTab] = useState('general');
    const [gatewayForm, setGatewayForm] = useState({ subscription_gateway: 'paystack' });
    const [paystackForm, setPaystackForm] = useState({ mode: 'test', test_public_key: '', test_secret_key: '', live_public_key: '', live_secret_key: '' });
    const [stripeForm, setStripeForm] = useState({ mode: 'test', test_publishable_key: '', test_secret_key: '', live_publishable_key: '', live_secret_key: '' });
    const [brandingForm, setBrandingForm] = useState({ site_name: 'BeautyPro HQ', logo_url: '/brand/bphq-logo-transparent.svg', email_logo_url: '/brand/bphq-logo-transparent.svg', favicon_url: '/brand/bphq-logo-transparent.svg', desktop_header_height: 112, mobile_header_height: 96 });
    const [currencyForm, setCurrencyForm] = useState({ default: 'NGN', rates: {} });
    const [featuresForm, setFeaturesForm] = useState({ provider_whatsapp_notifications: false, coming_soon: false });
    const [twilioForm, setTwilioForm] = useState({ account_sid: '', auth_token: '', whatsapp_from: '' });
    const [smtpForm, setSmtpForm] = useState({ enabled: false, mailer: 'smtp', host: '', port: 587, username: '', password: '', encryption: 'tls', from_address: '', from_name: '' });
    const [liveChatForm, setLiveChatForm] = useState({ inbound_secret: '', reply_domain: '' });
    const [smtpTestEmail, setSmtpTestEmail] = useState('');
    const [twilioTestPhone, setTwilioTestPhone] = useState('');
    const [twilioTestMessage, setTwilioTestMessage] = useState('BeautyPro HQ WhatsApp test message. Your Twilio WhatsApp connection is working.');
    const [emailNotificationTestType, setEmailNotificationTestType] = useState('all');
    const [savingGateway, setSavingGateway] = useState(false);
    const [savingTestPlan, setSavingTestPlan] = useState(false);
    const [savingPaystack, setSavingPaystack] = useState(false);
    const [savingStripe, setSavingStripe] = useState(false);
    const [savingBranding, setSavingBranding] = useState(false);
    const [savingCurrency, setSavingCurrency] = useState(false);
    const [fetchingRates, setFetchingRates] = useState(false);
    const [savingFeatures, setSavingFeatures] = useState(false);
    const [savingTwilio, setSavingTwilio] = useState(false);
    const [savingSmtp, setSavingSmtp] = useState(false);
    const [savingLiveChat, setSavingLiveChat] = useState(false);
    const [testingTwilio, setTestingTwilio] = useState(false);
    const [testingSmtp, setTestingSmtp] = useState(false);
    const [testingEmailNotification, setTestingEmailNotification] = useState(false);
    const [populatingDemo, setPopulatingDemo] = useState(false);
    const [clearingDemo, setClearingDemo] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [clearingCache, setClearingCache] = useState(false);
    const [heroImages, setHeroImages] = useState([]);
    const [savingHero, setSavingHero] = useState(false);
    const [uploadingHero, setUploadingHero] = useState(false);

    useEffect(() => {
        const data = gatewayResource.data;
        if (!data || !Object.keys(data).length) return;
        setGatewayForm({ subscription_gateway: data.subscription_gateway ?? 'paystack' });
    }, [gatewayResource.data]);

    useEffect(() => {
        const data = paystackResource.data;
        if (!data || !Object.keys(data).length) return;
        setPaystackForm({
            mode: data.mode ?? 'test',
            test_public_key: data.test_public_key ?? '',
            test_secret_key: '',
            live_public_key: data.live_public_key ?? '',
            live_secret_key: '',
        });
    }, [paystackResource.data]);

    useEffect(() => {
        const data = currencyResource.data;
        if (!data?.supported?.length) return;
        setCurrencyForm({
            default: data.default ?? 'NGN',
            rates: Object.fromEntries(data.supported.map((item) => [item.code, item.rate ?? 1])),
        });
    }, [currencyResource.data]);

    useEffect(() => {
        const data = stripeResource.data;
        if (!data || !Object.keys(data).length) return;
        setStripeForm({
            mode: data.mode ?? 'test',
            test_publishable_key: data.test_publishable_key ?? '',
            test_secret_key: '',
            live_publishable_key: data.live_publishable_key ?? '',
            live_secret_key: '',
        });
    }, [stripeResource.data]);

    useEffect(() => {
        const data = brandingResource.data;
        if (!data || !Object.keys(data).length) return;
            setBrandingForm({
                site_name: data.site_name ?? 'BeautyPro HQ',
                logo_url: data.logo_url ?? '/brand/bphq-logo-transparent.svg',
                email_logo_url: data.email_logo_url ?? data.logo_url ?? '/brand/bphq-logo-transparent.svg',
                favicon_url: data.favicon_url ?? '/brand/bphq-logo-transparent.svg',
                desktop_header_height: Number(data.desktop_header_height ?? 112),
                mobile_header_height: Number(data.mobile_header_height ?? 96),
            });
    }, [brandingResource.data]);

    useEffect(() => {
        const data = featuresResource.data;
        if (!data || !Object.keys(data).length) return;
        setFeaturesForm({
            provider_whatsapp_notifications: Boolean(data.provider_whatsapp_notifications),
            coming_soon: Boolean(data.coming_soon),
        });
    }, [featuresResource.data]);

    useEffect(() => {
        const data = twilioResource.data;
        if (!data || !Object.keys(data).length) return;
        setTwilioForm({
            account_sid: data.account_sid ?? '',
            auth_token: '',
            whatsapp_from: data.whatsapp_from ?? '',
        });
    }, [twilioResource.data]);

    useEffect(() => {
        const data = liveChatResource.data;
        if (!data || !Object.keys(data).length) return;
        setLiveChatForm({
            inbound_secret: '',
            reply_domain: data.reply_domain ?? '',
        });
    }, [liveChatResource.data]);

    useEffect(() => {
        const data = smtpResource.data;
        if (!data || !Object.keys(data).length) return;
        setSmtpForm({
            enabled: Boolean(data.enabled),
            mailer: data.mailer ?? 'smtp',
            host: data.host ?? '',
            port: data.port ?? 587,
            username: data.username ?? '',
            password: '',
            encryption: data.encryption ?? 'tls',
            from_address: data.from_address ?? '',
            from_name: data.from_name ?? '',
        });
        setSmtpTestEmail((current) => current || data.from_address || '');
    }, [smtpResource.data]);

    useEffect(() => {
        apiRequest('get', '/admin/settings/hero-images').then((data) => {
            const urls = (data?.images ?? []).map((url) => {
                if (url && !/^https?:\/\//.test(url) && !url.startsWith('/')) {
                    return '/storage/' + url.replace(/^storage\//, '');
                }
                return url;
            });
            setHeroImages(urls);
        }).catch(() => {});
    }, []);

    const updateHeroImage = (index, value) => setHeroImages((current) => current.map((url, i) => i === index ? value : url));
    const removeHeroImage = (index) => setHeroImages((current) => current.filter((_, i) => i !== index));
    const addHeroImage = () => setHeroImages((current) => [...current, '']);
    const uploadHeroImage = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setUploadingHero(true);
        try {
            const payload = new FormData();
            payload.append('image', file);
            const stored = await apiRequest('post', '/admin/settings/hero-images/upload', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
            const url = stored?.url ?? stored?.path ?? '';
            setHeroImages((current) => [...current, url].slice(0, 8));
            notify('Hero image uploaded.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setUploadingHero(false);
        }
    };
    const saveHeroImages = async () => {
        setSavingHero(true);
        try {
            const filtered = heroImages.filter((url) => url.trim());
            const saved = await apiRequest('put', '/admin/settings/hero-images', { images: filtered });
            setHeroImages(saved?.images ?? []);
            notify('Homepage hero images saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingHero(false);
        }
    };

    const saveGateway = async (event) => {
        event.preventDefault();
        setSavingGateway(true);
        try {
            const saved = await apiRequest('put', '/admin/payment-settings/gateway', gatewayForm);
            gatewayResource.setData(saved);
            notify('Subscription gateway saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingGateway(false);
        }
    };

    const savePaystack = async (event) => {
        event.preventDefault();
        setSavingPaystack(true);
        try {
            const saved = await apiRequest('put', '/admin/payment-settings/paystack', paystackForm);
            paystackResource.setData(saved);
            setPaystackForm((current) => ({ ...current, test_secret_key: '', live_secret_key: '' }));
            notify('Paystack settings saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingPaystack(false);
        }
    };

    const saveStripe = async (event) => {
        event.preventDefault();
        setSavingStripe(true);
        try {
            const saved = await apiRequest('put', '/admin/payment-settings/stripe', stripeForm);
            stripeResource.setData(saved);
            setStripeForm((current) => ({ ...current, test_secret_key: '', live_secret_key: '' }));
            notify('Stripe settings saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingStripe(false);
        }
    };

    const saveCurrency = async (event) => {
        event.preventDefault();
        setSavingCurrency(true);
        try {
            const saved = await apiRequest('put', '/admin/settings/currencies', currencyForm);
            currencyResource.setData(saved);
            notify('Currency rates saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingCurrency(false);
        }
    };

    const fetchRates = async () => {
        setFetchingRates(true);
        try {
            const result = await apiRequest('post', '/admin/settings/currencies/fetch-rates', { default: currencyForm.default });
            const rates = result?.rates ?? {};
            if (!Object.keys(rates).length) {
                notify('No exchange rates were returned.', 'error');
                return;
            }
            setCurrencyForm((current) => ({ ...current, default: result?.base ?? current.default, rates }));
            notify(`Live rates fetched from ${result?.source ?? 'exchange rate API'}. Review and save to apply.`);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setFetchingRates(false);
        }
    };

    const saveBranding = async (event) => {
        event.preventDefault();
        setSavingBranding(true);
        try {
            const saved = await apiRequest('put', '/admin/settings/branding', brandingForm);
            brandingResource.setData(saved);
            window.__BPHQ_BRAND__ = saved;
            notify('Branding settings saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingBranding(false);
        }
    };

    const saveFeatures = async (event) => {
        event.preventDefault();
        setSavingFeatures(true);
        try {
            const saved = await apiRequest('put', '/admin/settings/features', featuresForm);
            featuresResource.setData(saved);
            notify('Feature settings saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingFeatures(false);
        }
    };

    const copyComingSoonBypassUrl = async () => {
        const url = featuresResource.data?.coming_soon_bypass_url;
        if (!url) return;

        try {
            await navigator.clipboard.writeText(url);
            notify('Coming soon bypass link copied.');
        } catch {
            window.prompt('Copy coming soon bypass link', url);
        }
    };

    const saveTwilio = async (event) => {
        event.preventDefault();
        setSavingTwilio(true);
        try {
            const saved = await apiRequest('put', '/admin/settings/twilio', twilioForm);
            twilioResource.setData(saved);
            setTwilioForm((current) => ({ ...current, auth_token: '' }));
            notify('Twilio WhatsApp settings saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingTwilio(false);
        }
    };

    const saveSmtp = async (event) => {
        event.preventDefault();
        setSavingSmtp(true);
        try {
            const saved = await apiRequest('put', '/admin/settings/smtp', smtpForm);
            smtpResource.setData(saved);
            setSmtpForm((current) => ({ ...current, password: '' }));
            notify('SMTP settings saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingSmtp(false);
        }
    };

    const saveLiveChat = async (event) => {
        event.preventDefault();
        setSavingLiveChat(true);
        try {
            const saved = await apiRequest('put', '/admin/settings/live-chat', liveChatForm);
            liveChatResource.setData(saved);
            setLiveChatForm((current) => ({ ...current, inbound_secret: '' }));
            notify('Live chat email reply settings saved.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingLiveChat(false);
        }
    };

    const testTwilio = async () => {
        setTestingTwilio(true);
        try {
            await apiRequest('post', '/admin/settings/twilio/test', { phone: twilioTestPhone, message: twilioTestMessage });
            notify(`WhatsApp test sent to ${twilioTestPhone}.`);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setTestingTwilio(false);
        }
    };

    const testSmtp = async () => {
        setTestingSmtp(true);
        try {
            await apiRequest('post', '/admin/settings/smtp/test', { email: smtpTestEmail });
            notify(`Test email sent to ${smtpTestEmail}.`);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setTestingSmtp(false);
        }
    };

    const testEmailNotification = async () => {
        setTestingEmailNotification(true);
        try {
            const result = await apiRequest('post', '/admin/settings/email-notifications/test', { email: smtpTestEmail, type: emailNotificationTestType });
            notify(`${result.sent ?? 1} notification test email${(result.sent ?? 1) === 1 ? '' : 's'} sent to ${smtpTestEmail}.`);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setTestingEmailNotification(false);
        }
    };

    const populateDemoData = async () => {
        setPopulatingDemo(true);
        try {
            const saved = await apiRequest('post', '/admin/demo-data/populate');
            demoResource.setData(saved);
            notify('Demo data populated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setPopulatingDemo(false);
        }
    };

    const clearDemoData = async () => {
        setClearingDemo(true);
        try {
            const saved = await apiRequest('delete', '/admin/demo-data');
            demoResource.setData(saved);
            notify('Demo data cleared.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setClearingDemo(false);
        }
    };

    const runDeployment = async () => {
        if (!window.confirm('Deploy latest committed code from origin/main now?')) {
            return;
        }

        setDeploying(true);
        try {
            const result = await apiRequest('post', '/admin/settings/deployment/run');
            deploymentResource.setData(result);
            notify('Deployment completed.');
        } catch (error) {
            const payload = error?.response?.data?.data;
            if (payload) {
                deploymentResource.setData(payload);
            }
            notify(apiErrorMessage(error), 'error');
        } finally {
            setDeploying(false);
        }
    };

    const hardClearCache = async () => {
        if (!window.confirm('Hard clear server caches now? This clears Laravel caches, restarts queues, and resets OPcache when available.')) {
            return;
        }

        setClearingCache(true);
        try {
            const result = await apiRequest('post', '/admin/settings/cache/clear');
            deploymentResource.setData(result);
            notify('Hard cache clear completed.');
        } catch (error) {
            const payload = error?.response?.data?.data;
            if (payload) {
                deploymentResource.setData(payload);
            }
            notify(apiErrorMessage(error), 'error');
        } finally {
            setClearingCache(false);
        }
    };

    const toggleDailyTestPlan = async (enabled) => {
        const plan = normalizePlans(plansResource.data).find((item) => item.key === 'daily_test');
        if (!plan) {
            notify('Daily test plan was not found.', 'error');
            return;
        }

        setSavingTestPlan(true);
        try {
            const saved = await apiRequest('put', `/admin/subscription-plans/${plan.id}`, { is_active: enabled });
            plansResource.setData((current) => normalizePlans(current).map((item) => item.id === saved.id ? saved : item));
            notify(enabled ? 'Daily test card enabled.' : 'Daily test card disabled.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSavingTestPlan(false);
        }
    };

    const updateRate = (code, value) => setCurrencyForm((current) => ({ ...current, rates: { ...current.rates, [code]: value } }));
    const dailyTestPlan = normalizePlans(plansResource.data).find((item) => item.key === 'daily_test');
    const deploymentLog = deploymentResource.data?.artisan_output || deploymentResource.data?.log || '';
    const deploymentStatus = deploymentResource.data?.status ?? 'never_run';
    const error = gatewayResource.error || plansResource.error || paystackResource.error || stripeResource.error || brandingResource.error || currencyResource.error || featuresResource.error || twilioResource.error || smtpResource.error || liveChatResource.error || demoResource.error || deploymentResource.error;

    return (
        <div className="space-y-6">
            <PageHeader description="Configure platform-level payment and currency behavior." eyebrow="Platform" title="Settings" />
            {error && <ErrorState message={error} onRetry={() => { gatewayResource.reload(); plansResource.reload(); paystackResource.reload(); stripeResource.reload(); brandingResource.reload(); currencyResource.reload(); featuresResource.reload(); twilioResource.reload(); smtpResource.reload(); liveChatResource.reload(); demoResource.reload(); deploymentResource.reload(); }} />}

            <div className="grid min-w-0 gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
                <aside className="min-w-0 lg:sticky lg:top-5 lg:self-start">
                    <div className="relative -mx-1 lg:mx-0">
                        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-bphq-ivory via-bphq-ivory/90 to-transparent lg:hidden" />
                        <div className="scrollbar-none flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 pr-8 lg:flex-col lg:overflow-visible lg:rounded-3xl lg:border lg:border-bphq-chrome/80 lg:bg-white lg:p-2 lg:pr-2 lg:shadow-sm">
                        {platformSettingTabs.map((item) => (
                            <button
                                className={`shrink-0 rounded-full px-3 py-2 text-left transition lg:w-full lg:rounded-2xl lg:px-3 lg:py-3 ${sectionTab === item.key ? 'bg-bphq-espresso text-white shadow-sm' : 'border border-bphq-chrome/70 bg-white text-bphq-coffee hover:bg-bphq-ivory lg:border-transparent lg:bg-transparent lg:shadow-none'}`}
                                key={item.key}
                                onClick={() => setSectionTab(item.key)}
                                type="button"
                            >
                                <span className="flex min-w-0 items-center gap-2 text-xs font-bold lg:text-sm">
                                    <Icon name={item.icon} size={15} className="lg:size-[17px]" />
                                    <span className="whitespace-nowrap">{item.label}</span>
                                </span>
                                <span className={`mt-1 hidden pl-7 text-xs leading-5 lg:block ${sectionTab === item.key ? 'text-bphq-ivory' : 'text-bphq-coffee/70'}`}>{item.description}</span>
                            </button>
                        ))}
                        </div>
                    </div>
                </aside>
                <div className="min-w-0 space-y-6">
            {sectionTab === 'security' && <SecurityPage embedded />}
            <Card className={sectionTab === 'general' ? '' : 'hidden'}>
                <CardHeader
                    title="Branding"
                    description="Set the default website name, logo, favicon and email notification logo."
                    action={<StatusBadge status="site-wide" />}
                />
                {brandingResource.loading ? <LoadingBlock rows={4} /> : (
                    <form className="mt-5 space-y-4" onSubmit={saveBranding}>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Field label="Website name">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setBrandingForm((current) => ({ ...current, site_name: event.target.value }))}
                                    placeholder="BeautyPro HQ"
                                    value={brandingForm.site_name}
                                />
                            </Field>
                            <Field hint="Use a full URL or a public path like /brand/logo.svg." label="Website logo URL">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setBrandingForm((current) => ({ ...current, logo_url: event.target.value }))}
                                    placeholder="/brand/bphq-logo-transparent.svg"
                                    value={brandingForm.logo_url}
                                />
                            </Field>
                            <Field hint="Recommended for emails. Relative paths are converted to the site URL." label="Email logo URL">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setBrandingForm((current) => ({ ...current, email_logo_url: event.target.value }))}
                                    placeholder="/brand/bphq-logo-transparent.svg"
                                    value={brandingForm.email_logo_url}
                                />
                            </Field>
                            <Field label="Favicon URL">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setBrandingForm((current) => ({ ...current, favicon_url: event.target.value }))}
                                    placeholder="/brand/bphq-logo-transparent.svg"
                                    value={brandingForm.favicon_url}
                                />
                            </Field>
                            <Field hint="Pixels. Applies to the desktop public header." label="Desktop header height">
                                <input
                                    className={inputClass}
                                    min="64"
                                    max="260"
                                    onChange={(event) => setBrandingForm((current) => ({ ...current, desktop_header_height: Number(event.target.value) }))}
                                    type="number"
                                    value={brandingForm.desktop_header_height}
                                />
                            </Field>
                            <Field hint="Pixels. Applies to the mobile public header." label="Mobile header height">
                                <input
                                    className={inputClass}
                                    min="56"
                                    max="220"
                                    onChange={(event) => setBrandingForm((current) => ({ ...current, mobile_header_height: Number(event.target.value) }))}
                                    type="number"
                                    value={brandingForm.mobile_header_height}
                                />
                            </Field>
                        </div>
                        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current logo</p>
                                <p className="mt-1 truncate text-sm font-semibold text-slate-700">{brandingForm.logo_url || 'Default logo'}</p>
                            </div>
                            {brandingForm.logo_url && <img alt="" className="h-14 w-auto max-w-[140px] object-contain" src={brandingForm.logo_url} />}
                        </div>
                        <div className="flex justify-end"><Button busy={savingBranding} type="submit">Save branding</Button></div>
                    </form>
                )}
            </Card>
            <Card className={sectionTab === 'general' ? '' : 'hidden'}>
                <CardHeader
                    title="Provider features"
                    description="Control public launch mode and optional platform features."
                    action={<StatusBadge status={featuresForm.coming_soon ? 'Coming soon' : 'Live'} />}
                />
                {featuresResource.loading ? <LoadingBlock rows={2} /> : (
                    <form className="mt-5 space-y-4" onSubmit={saveFeatures}>
                        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <input
                                checked={featuresForm.coming_soon}
                                className="mt-1 h-5 w-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                onChange={(event) => setFeaturesForm((current) => ({ ...current, coming_soon: event.target.checked }))}
                                type="checkbox"
                            />
                            <span>
                                <span className="block text-sm font-bold text-slate-900">Show coming soon page on public routes</span>
                                <span className="block text-sm text-slate-500">When on, visitors see the launch waitlist page while login, admin, provider and customer dashboard routes remain available.</span>
                                {featuresResource.data?.coming_soon_defaulted && <span className="mt-1 block text-xs font-bold text-amber-600">No saved preference yet. Production will auto-enable this until you save a setting.</span>}
                            </span>
                        </label>
                        {featuresResource.data?.coming_soon && featuresResource.data?.coming_soon_bypass_url && (
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-950">Temporary website access link</p>
                                        <p className="mt-2 break-all font-mono text-xs text-slate-700">{featuresResource.data.coming_soon_bypass_url}</p>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <Button onClick={copyComingSoonBypassUrl} type="button" variant="secondary"><Icon name="copy" size={16} /> Copy</Button>
                                        <a className="inline-flex min-h-10 items-center justify-center rounded-xl bg-plum-900 px-4 text-sm font-semibold text-white transition hover:bg-plum-800" href={featuresResource.data.coming_soon_bypass_url} target="_blank" rel="noreferrer">Open</a>
                                    </div>
                                </div>
                            </div>
                        )}
                        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <input
                                checked={featuresForm.provider_whatsapp_notifications}
                                className="mt-1 h-5 w-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                onChange={(event) => setFeaturesForm((current) => ({ ...current, provider_whatsapp_notifications: event.target.checked }))}
                                type="checkbox"
                            />
                            <span>
                                <span className="block text-sm font-bold text-slate-900">Allow providers to use WhatsApp booking notifications</span>
                                <span className="block text-sm text-slate-500">When off, the WhatsApp notification tab is hidden from providers and no WhatsApp booking alerts are sent.</span>
                            </span>
                        </label>
                        <div className="flex justify-end"><Button busy={savingFeatures} type="submit">Save feature settings</Button></div>
                    </form>
                )}
            </Card>

            <Card className={sectionTab === 'general' ? '' : 'hidden'}>
                <CardHeader
                    title="Demo data"
                    description="Populate or clear temporary demo records. Clear only removes records tagged as demo and leaves manually-created records untouched."
                    action={<StatusBadge status={Object.values(demoResource.data ?? {}).some(Boolean) ? 'active' : 'empty'} />}
                />
                {demoResource.loading ? <LoadingBlock rows={2} /> : (
                    <div className="mt-5 space-y-5">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                                ['Users', demoResource.data?.users ?? 0],
                                ['Providers', demoResource.data?.providers ?? 0],
                                ['Services', demoResource.data?.services ?? 0],
                                ['Bookings', demoResource.data?.bookings ?? 0],
                                ['Payments', demoResource.data?.payments ?? 0],
                                ['Usage records', demoResource.data?.usage_records ?? 0],
                                ['Content', demoResource.data?.content ?? 0],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                                    <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <Button busy={clearingDemo} disabled={populatingDemo} onClick={clearDemoData} type="button" variant="danger">Clear demo data</Button>
                            <Button busy={populatingDemo} disabled={clearingDemo} onClick={populateDemoData} type="button">Populate demo data</Button>
                        </div>
                    </div>
                )}
            </Card>

            <Card className={sectionTab === 'general' ? '' : 'hidden'}>
                <CardHeader
                    title="Deployment"
                    description="Pull the latest committed main branch and run the fixed production update steps."
                    action={<StatusBadge status={deploymentStatus.replaceAll('_', ' ')} />}
                />
                {deploymentResource.loading ? <LoadingBlock rows={3} /> : (
                    <div className="mt-5 space-y-5">
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Source</p>
                                <p className="mt-1 break-all text-sm font-bold text-slate-950">{deploymentResource.data?.remote ?? 'origin'}/{deploymentResource.data?.branch ?? 'main'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Started</p>
                                <p className="mt-1 text-sm font-bold text-slate-950">{deploymentResource.data?.started_at ? new Date(deploymentResource.data.started_at).toLocaleString() : 'Never'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Finished</p>
                                <p className="mt-1 text-sm font-bold text-slate-950">{deploymentResource.data?.finished_at ? new Date(deploymentResource.data.finished_at).toLocaleString() : 'Not finished'}</p>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                            Deploy pulls the latest code and prebuilt frontend assets, verifies the asset bundle, runs migrations, rebuilds Laravel caches, and restarts queues. Production does not require npm. Hard clear cache clears server-side Laravel caches and resets OPcache when available.
                        </div>
                        {deploymentLog && (
                            <pre className="max-h-80 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{deploymentLog}</pre>
                        )}
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <Button disabled={deploying || clearingCache} onClick={() => deploymentResource.reload()} type="button" variant="secondary">Refresh status</Button>
                            <Button busy={clearingCache} disabled={deploying} onClick={hardClearCache} type="button" variant="soft"><Icon name="refresh" size={16} /> Hard clear cache</Button>
                            <Button busy={deploying} disabled={clearingCache} onClick={runDeployment} type="button"><Icon name="refresh" size={16} /> Deploy latest</Button>
                        </div>
                    </div>
                )}
            </Card>

            <Card className={sectionTab === 'general' ? '' : 'hidden'}>
                <CardHeader
                    title="Homepage hero images"
                    description="Upload hero images for the homepage marquee. When 2+ are saved, they replace provider photos. Drag to reorder."
                    action={<StatusBadge status={`${heroImages.length} images`} />}
                />
                <div className="mt-5 space-y-5">
                    {heroImages.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                            {heroImages.map((url, index) => (
                                <div className="group relative overflow-hidden rounded-2xl border border-slate-200" key={index}>
                                    <img src={url} alt="" className="aspect-square w-full object-cover" onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23f1f5f9%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-size=%2212%22 font-family=%22sans-serif%22>No preview</text></svg>'; }} />
                                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-white/90 px-3 py-2 text-xs backdrop-blur-sm">
                                        <span className="truncate font-bold text-slate-700">{index + 1}</span>
                                        <button className="font-black text-rose-600" onClick={() => removeHeroImage(index)} type="button">Remove</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="space-y-3">
                        {heroImages.map((url, index) => (
                            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3" key={index}>
                                <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                <input
                                    className={inputClass}
                                    onChange={(event) => updateHeroImage(index, event.target.value)}
                                    placeholder="Paste an image URL or use Upload"
                                    value={url}
                                />
                                <button className="shrink-0 text-xs font-bold text-rose-600" onClick={() => removeHeroImage(index)} type="button">Remove</button>
                            </div>
                        ))}
                        <div className="flex gap-3">
                            {heroImages.length < 8 && (
                                <button className="inline-flex min-h-10 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-sm font-semibold text-slate-500 hover:bg-slate-50" onClick={addHeroImage} type="button">
                                    + Paste URL
                                </button>
                            )}
                            {heroImages.length < 8 && (
                                <label className={`inline-flex min-h-10 items-center justify-center rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 text-sm font-semibold text-fuchsia-700 hover:bg-fuchsia-100 ${uploadingHero ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                                    {uploadingHero ? 'Uploading...' : 'Upload image'}
                                    <input accept="image/*" className="sr-only" disabled={uploadingHero} onChange={uploadHeroImage} type="file" />
                                </label>
                            )}
                        </div>
                    </div>
                </div>
                <div className="mt-5 flex justify-end">
                    <Button busy={savingHero} onClick={saveHeroImages} type="button">Save homepage images</Button>
                </div>
            </Card>

            <Card className={sectionTab === 'communications' ? '' : 'hidden'}>
                <CardHeader
                    title="Twilio WhatsApp connection"
                    description="Connect the WhatsApp sender used for provider booking notifications."
                    action={twilioResource.data?.configured ? <StatusBadge status="connected" /> : <StatusBadge status="not connected" />}
                />
                {twilioResource.loading ? <LoadingBlock rows={4} /> : (
                    <form className="mt-5 space-y-5" onSubmit={saveTwilio}>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Field label="Account SID">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setTwilioForm((current) => ({ ...current, account_sid: event.target.value }))}
                                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                    value={twilioForm.account_sid}
                                />
                            </Field>
                            <Field hint="Leave blank to keep the saved token." label="Auth token">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setTwilioForm((current) => ({ ...current, auth_token: event.target.value }))}
                                    placeholder="Twilio auth token"
                                    type="password"
                                    value={twilioForm.auth_token}
                                />
                            </Field>
                            <Field hint="Use Twilio format, for example whatsapp:+14155238886 or your approved live sender." label="WhatsApp sender number">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setTwilioForm((current) => ({ ...current, whatsapp_from: event.target.value }))}
                                    placeholder="whatsapp:+14155238886"
                                    value={twilioForm.whatsapp_from}
                                />
                            </Field>
                            <div className="flex items-end">
                                {twilioResource.data?.auth_token_configured && (
                                    <StatusBadge status={`auth token ends ${twilioResource.data.auth_token_last4}`} />
                                )}
                            </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                            Use the Twilio sandbox sender for testing. For live notifications, use an approved Twilio WhatsApp sender.
                        </div>
                        <div className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 lg:grid-cols-[1fr_auto] lg:items-end">
                            <Field hint="Use international format, for example +2348012345678. Sandbox recipients must join your Twilio sandbox first." label="Test WhatsApp recipient">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setTwilioTestPhone(event.target.value)}
                                    placeholder="+2348012345678"
                                    value={twilioTestPhone}
                                />
                            </Field>
                            <Button busy={testingTwilio} disabled={!twilioTestPhone || !twilioTestMessage || savingTwilio} onClick={testTwilio} type="button" variant="secondary">Send WhatsApp test</Button>
                            <Field className="lg:col-span-2" hint="This is the exact text that will be sent to the recipient." label="Test message">
                                <textarea
                                    className={inputClass}
                                    maxLength={1500}
                                    onChange={(event) => setTwilioTestMessage(event.target.value)}
                                    rows={4}
                                    value={twilioTestMessage}
                                />
                            </Field>
                        </div>
                        <div className="flex justify-end"><Button busy={savingTwilio} disabled={testingTwilio} type="submit">Save Twilio settings</Button></div>
                    </form>
                )}
            </Card>

            <Card className={sectionTab === 'communications' ? '' : 'hidden'}>
                <CardHeader
                    title="Live chat reply-by-email"
                    description="Let customers reply to live chat by email. When they reply, the message is added back into the provider's chat automatically."
                    action={liveChatResource.data?.configured ? <StatusBadge status="email replies on" /> : <StatusBadge status="email replies off" />}
                />
                {liveChatResource.loading ? <LoadingBlock rows={4} /> : (
                    <form className="mt-5 space-y-5" onSubmit={saveLiveChat}>
                        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <input
                                checked={liveChatResource.data?.inbound_secret_configured}
                                className="mt-1 h-5 w-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                disabled
                                readOnly
                                type="checkbox"
                            />
                            <span>
                                <span className="block text-sm font-bold text-slate-900">Capture live chat replies from email</span>
                                <span className="block text-sm text-slate-500">When a provider sends a chat message, the customer receives an email with a Reply-To address. Replying to that email posts the reply into the provider's live chat.</span>
                            </span>
                        </label>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Field hint="Leave blank to keep the saved secret. Used to sign and verify incoming reply emails." label="Inbound secret">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setLiveChatForm((current) => ({ ...current, inbound_secret: event.target.value }))}
                                    placeholder="A long, random secret code"
                                    type="password"
                                    value={liveChatForm.inbound_secret}
                                />
                            </Field>
                            <Field hint="The domain that receives chat reply emails, for example chat.example.com." label="Reply-to domain">
                                <input
                                    className={inputClass}
                                    onChange={(event) => setLiveChatForm((current) => ({ ...current, reply_domain: event.target.value }))}
                                    placeholder="chat.example.com"
                                    value={liveChatForm.reply_domain}
                                />
                            </Field>
                            <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
                                {liveChatResource.data?.inbound_secret_configured && <StatusBadge status={`Inbound secret ends ${liveChatResource.data.inbound_secret_last4}`} />}
                                {liveChatResource.data?.reply_domain && <StatusBadge status={`Reply domain ${liveChatResource.data.reply_domain}`} />}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                            <span className="font-bold text-slate-950">Inbound webhook URL:</span>{' '}
                            <span className="font-mono break-all">{liveChatResource.data?.webhook_url}</span>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm leading-6 text-slate-600">
                            <h3 className="text-sm font-bold text-slate-950">How to set up email replies</h3>
                            <ol className="mt-2 list-decimal space-y-1 px-4">
                                <li>Create a catch-all mailbox (or a forwarding rule) on <span className="font-mono">{liveChatResource.data?.reply_domain ?? 'your reply-to domain'}</span> that accepts incoming mail.</li>
                                <li>Forward inbound mail to the webhook URL above (as a POST with the email content).</li>
                                <li>Send the same inbound secret value as the <span className="font-mono">token</span> field on each forwarded request.</li>
                            </ol>
                            <p className="mt-2 text-slate-500">Customers can also reply by tapping the "Reply to this chat" link in the notification email, which works without any mailbox setup.</p>
                        </div>

                        <div className="flex justify-end"><Button busy={savingLiveChat} type="submit">Save live chat settings</Button></div>
                    </form>
                )}
            </Card>

            <Card className={sectionTab === 'email' ? '' : 'hidden'}>
                <CardHeader
                    title="Email connection"
                    description="Connect Bluehost SMTP or use cPanel/PHP mail for platform email notifications."
                    action={smtpResource.data?.configured ? <StatusBadge status={smtpForm.mailer === 'php_mail' ? 'PHP mail enabled' : 'SMTP connected'} /> : <StatusBadge status="Email not connected" />}
                />
                {smtpResource.loading ? <LoadingBlock rows={5} /> : (
                    <form className="mt-5 space-y-5" onSubmit={saveSmtp}>
                        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <input
                                checked={smtpForm.enabled}
                                className="mt-1 h-5 w-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                onChange={(event) => setSmtpForm((current) => ({ ...current, enabled: event.target.checked }))}
                                type="checkbox"
                            />
                            <span>
                                <span className="block text-sm font-bold text-slate-900">Enable website emails</span>
                                <span className="block text-sm text-slate-500">When enabled, login, booking, onboarding, customer and admin notifications use the selected email method.</span>
                            </span>
                        </label>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Field label="Delivery method">
                                <select className={inputClass} onChange={(event) => setSmtpForm((current) => ({ ...current, mailer: event.target.value }))} value={smtpForm.mailer}>
                                    <option value="smtp">SMTP server</option>
                                    <option value="php_mail">cPanel / PHP mail</option>
                                </select>
                            </Field>
                            <Field label="From email address">
                                <input className={inputClass} onChange={(event) => setSmtpForm((current) => ({ ...current, from_address: event.target.value }))} placeholder="hello@beautyprohq.com" type="email" value={smtpForm.from_address} />
                            </Field>
                            <Field label="From name">
                                <input className={inputClass} onChange={(event) => setSmtpForm((current) => ({ ...current, from_name: event.target.value }))} placeholder="BeautyPro HQ" value={smtpForm.from_name} />
                            </Field>
                            {smtpForm.mailer === 'smtp' && (
                                <>
                                    <Field label="SMTP host">
                                        <input className={inputClass} onChange={(event) => setSmtpForm((current) => ({ ...current, host: event.target.value }))} placeholder="mail.yourdomain.com" value={smtpForm.host} />
                                    </Field>
                                    <Field label="SMTP port">
                                        <input className={inputClass} min="1" max="65535" onChange={(event) => setSmtpForm((current) => ({ ...current, port: event.target.value }))} placeholder="465, 587 or 25" type="number" value={smtpForm.port} />
                                    </Field>
                                    <Field label="SMTP username">
                                        <input className={inputClass} onChange={(event) => setSmtpForm((current) => ({ ...current, username: event.target.value }))} placeholder="Full email address" value={smtpForm.username} />
                                    </Field>
                                    <Field hint="Leave blank to keep the saved password." label="SMTP password">
                                        <input className={inputClass} onChange={(event) => setSmtpForm((current) => ({ ...current, password: event.target.value }))} placeholder="Email account password" type="password" value={smtpForm.password} />
                                    </Field>
                                    <Field label="Encryption">
                                        <select className={inputClass} onChange={(event) => setSmtpForm((current) => ({ ...current, encryption: event.target.value }))} value={smtpForm.encryption}>
                                            <option value="ssl">SSL, usually port 465</option>
                                            <option value="tls">TLS, usually port 587</option>
                                            <option value="">None, usually port 25 or 26</option>
                                        </select>
                                    </Field>
                                    <div className="flex items-end">
                                        {smtpResource.data?.password_configured && <StatusBadge status={`password ends ${smtpResource.data.password_last4}`} />}
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                            {smtpForm.mailer === 'smtp'
                                ? 'For Bluehost, try mail.yourdomain.com with SSL/465 first. If that fails, try TLS/587. Use the full mailbox address as the username.'
                                : `cPanel/PHP mail uses the server sendmail path${smtpResource.data?.sendmail_path ? ` (${smtpResource.data.sendmail_path})` : ''}. This is useful when outbound SMTP ports are blocked by hosting.`}
                        </div>
                        <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
                            <Field hint="Save SMTP settings before sending a test email." label="Test recipient email">
                                <input className={inputClass} onChange={(event) => setSmtpTestEmail(event.target.value)} placeholder="you@example.com" type="email" value={smtpTestEmail} />
                            </Field>
                            <Button busy={testingSmtp} disabled={!smtpTestEmail || savingSmtp} onClick={testSmtp} type="button" variant="secondary">Send test email</Button>
                            <Button busy={savingSmtp} disabled={testingSmtp} type="submit">Save SMTP settings</Button>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white p-4">
                            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-950">Active email notifications</h3>
                                    <p className="mt-1 text-sm text-slate-500">These emails use the BeautyPro HQ branded template when SMTP is connected.</p>
                                </div>
                                <StatusBadge status={`${emailNotifications.length} active`} />
                            </div>
                            <div className="mb-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
                                <Field hint="Use the same test recipient email above." label="Test notification type">
                                    <select className={inputClass} onChange={(event) => setEmailNotificationTestType(event.target.value)} value={emailNotificationTestType}>
                                        <option value="all">All active email notifications</option>
                                        {emailNotifications.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
                                    </select>
                                </Field>
                                <Button busy={testingEmailNotification} disabled={!smtpTestEmail || savingSmtp || testingSmtp} onClick={testEmailNotification} type="button" variant="secondary">Send notification test</Button>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2">
                                {emailNotifications.map((item) => (
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4" key={item.key}>
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{item.recipient}</p>
                                            <StatusBadge status="active" />
                                        </div>
                                        <p className="mt-2 font-bold text-slate-950">{item.title}</p>
                                        <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </form>
                )}
            </Card>

            <Card className={sectionTab === 'payments' ? '' : 'hidden'}>
                <CardHeader title="Provider plan checkout gateway" description="Choose which gateway providers use when they pay for a paid plan." action={<StatusBadge status={gatewayForm.subscription_gateway} />} />
                {gatewayResource.loading ? <LoadingBlock rows={2} /> : (
                    <form className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={saveGateway}>
                        <Field className="flex-1" label="Active subscription gateway">
                            <select className={inputClass} onChange={(event) => setGatewayForm({ subscription_gateway: event.target.value })} value={gatewayForm.subscription_gateway}>
                                <option value="paystack">Paystack</option>
                                <option value="stripe">Stripe</option>
                            </select>
                        </Field>
                        <Button busy={savingGateway} type="submit">Save gateway</Button>
                    </form>
                )}
            </Card>

            <Card className={sectionTab === 'payments' ? '' : 'hidden'}>
                <CardHeader
                    title="Daily test subscription card"
                    description="Show or hide the N100 daily test plan from the provider subscription page."
                    action={<StatusBadge status={dailyTestPlan?.is_active ? 'enabled' : 'disabled'} />}
                />
                {plansResource.loading ? <LoadingBlock rows={2} /> : (
                    <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-bold text-slate-950">{dailyTestPlan?.name ?? 'Daily Test Plan'}</p>
                            <p className="mt-1 text-sm text-slate-500">When enabled, providers can choose the N100 daily subscription for payment testing.</p>
                        </div>
                        <label className="inline-flex items-center gap-3">
                            <input
                                checked={Boolean(dailyTestPlan?.is_active)}
                                className="h-5 w-5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                disabled={!dailyTestPlan || savingTestPlan}
                                onChange={(event) => toggleDailyTestPlan(event.target.checked)}
                                type="checkbox"
                            />
                            <span className="text-sm font-bold text-slate-700">{dailyTestPlan?.is_active ? 'Enabled' : 'Disabled'}</span>
                        </label>
                    </div>
                )}
            </Card>

            <Card className={sectionTab === 'payments' ? '' : 'hidden'}>
                <CardHeader
                    title="Paystack plan payment gateway"
                    description="These keys are used only for provider subscription plan payments. Provider payout/settlement settings are separate."
                    action={paystackResource.data?.active_secret_configured ? <StatusBadge status={`${paystackForm.mode} ready`} /> : <StatusBadge status="missing active secret" />}
                />
                {paystackResource.loading ? <LoadingBlock rows={4} /> : (
                    <form className="mt-5 space-y-5" onSubmit={savePaystack}>
                        <Field label="Active Paystack mode">
                            <select className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, mode: event.target.value }))} value={paystackForm.mode}>
                                <option value="test">Test mode</option>
                                <option value="live">Live mode</option>
                            </select>
                        </Field>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                            <p className="font-semibold text-slate-950">Paystack webhook URL</p>
                            <p className="mt-2 break-all font-mono text-xs text-slate-700">{paystackResource.data?.webhook_url ?? `${window.location.origin}/api/paystack/webhook`}</p>
                            <p className="mt-4 font-semibold text-slate-950">Paystack callback URL</p>
                            <p className="mt-2 break-all font-mono text-xs text-slate-700">{paystackResource.data?.callback_url ?? `${window.location.origin}/provider/subscription`}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {(paystackResource.data?.webhook_events ?? []).map((event) => <StatusBadge key={event} status={event} />)}
                            </div>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-3xl border border-slate-100 p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h2 className="font-semibold text-slate-950">Test keys</h2>
                                    {paystackResource.data?.test_secret_configured && <StatusBadge status={`secret ends ${paystackResource.data.test_secret_last4}`} />}
                                </div>
                                <div className="space-y-4">
                                    <Field label="Test public key"><input className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, test_public_key: event.target.value }))} placeholder="pk_test_..." value={paystackForm.test_public_key} /></Field>
                                    <Field label="Test secret key" hint="Leave blank to keep the saved secret."><input className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, test_secret_key: event.target.value }))} placeholder="sk_test_..." type="password" value={paystackForm.test_secret_key} /></Field>
                                </div>
                            </div>
                            <div className="rounded-3xl border border-slate-100 p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h2 className="font-semibold text-slate-950">Live keys</h2>
                                    {paystackResource.data?.live_secret_configured && <StatusBadge status={`secret ends ${paystackResource.data.live_secret_last4}`} />}
                                </div>
                                <div className="space-y-4">
                                    <Field label="Live public key"><input className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, live_public_key: event.target.value }))} placeholder="pk_live_..." value={paystackForm.live_public_key} /></Field>
                                    <Field label="Live secret key" hint="Leave blank to keep the saved secret."><input className={inputClass} onChange={(event) => setPaystackForm((current) => ({ ...current, live_secret_key: event.target.value }))} placeholder="sk_live_..." type="password" value={paystackForm.live_secret_key} /></Field>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end"><Button busy={savingPaystack} type="submit">Save Paystack settings</Button></div>
                    </form>
                )}
            </Card>

            <Card className={sectionTab === 'payments' ? '' : 'hidden'}>
                <CardHeader
                    title="Stripe plan payment gateway"
                    description="Stripe Checkout is used only for provider subscription plan payments when Stripe is selected as the active gateway."
                    action={stripeResource.data?.active_secret_configured ? <StatusBadge status={`${stripeForm.mode} ready`} /> : <StatusBadge status="missing active secret" />}
                />
                {stripeResource.loading ? <LoadingBlock rows={4} /> : (
                    <form className="mt-5 space-y-5" onSubmit={saveStripe}>
                        <Field label="Active Stripe mode">
                            <select className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, mode: event.target.value }))} value={stripeForm.mode}>
                                <option value="test">Test mode</option>
                                <option value="live">Live mode</option>
                            </select>
                        </Field>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-3xl border border-slate-100 p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h2 className="font-semibold text-slate-950">Test keys</h2>
                                    {stripeResource.data?.test_secret_configured && <StatusBadge status={`secret ends ${stripeResource.data.test_secret_last4}`} />}
                                </div>
                                <div className="space-y-4">
                                    <Field label="Test publishable key"><input className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, test_publishable_key: event.target.value }))} placeholder="pk_test_..." value={stripeForm.test_publishable_key} /></Field>
                                    <Field label="Test secret key" hint="Leave blank to keep the saved secret."><input className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, test_secret_key: event.target.value }))} placeholder="sk_test_..." type="password" value={stripeForm.test_secret_key} /></Field>
                                </div>
                            </div>
                            <div className="rounded-3xl border border-slate-100 p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h2 className="font-semibold text-slate-950">Live keys</h2>
                                    {stripeResource.data?.live_secret_configured && <StatusBadge status={`secret ends ${stripeResource.data.live_secret_last4}`} />}
                                </div>
                                <div className="space-y-4">
                                    <Field label="Live publishable key"><input className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, live_publishable_key: event.target.value }))} placeholder="pk_live_..." value={stripeForm.live_publishable_key} /></Field>
                                    <Field label="Live secret key" hint="Leave blank to keep the saved secret."><input className={inputClass} onChange={(event) => setStripeForm((current) => ({ ...current, live_secret_key: event.target.value }))} placeholder="sk_live_..." type="password" value={stripeForm.live_secret_key} /></Field>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end"><Button busy={savingStripe} type="submit">Save Stripe settings</Button></div>
                    </form>
                )}
            </Card>

            <Card className={sectionTab === 'currency' ? '' : 'hidden'}>
                <CardHeader title="Currency exchange rates" description="Set the rates used when users switch display currency on the frontend. Rates are relative to the platform base/default currency." />
                {currencyResource.loading ? <LoadingBlock rows={4} /> : (
                    <form className="mt-5 space-y-5" onSubmit={saveCurrency}>
                        <Field label="Default currency">
                            <select className={inputClass} onChange={(event) => setCurrencyForm((current) => ({ ...current, default: event.target.value }))} value={currencyForm.default}>
                                {(currencyResource.data?.supported ?? []).map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
                            </select>
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {(currencyResource.data?.supported ?? []).map((item) => (
                                <Field key={item.code} label={`${item.code} rate`} hint={`${item.symbol} ${item.name}`}>
                                    <input className={inputClass} min="0" onChange={(event) => updateRate(item.code, event.target.value)} step="0.00000001" type="number" value={currencyForm.rates[item.code] ?? item.rate ?? 1} />
                                </Field>
                            ))}
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                            Example: if NGN is the base and USD is 0.00063, ₦100,000 displays as about $63 when a user switches to USD.
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs font-semibold text-slate-400">
                                Fetch live rates from a published exchange rate source, then review and save to apply.
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button busy={fetchingRates} disabled={savingCurrency} onClick={fetchRates} type="button" variant="secondary">Fetch latest rates</Button>
                                <Button busy={savingCurrency} disabled={fetchingRates} type="submit">Save currency rates</Button>
                            </div>
                        </div>
                    </form>
                )}
            </Card>
                </div>
            </div>
        </div>
    );
}
