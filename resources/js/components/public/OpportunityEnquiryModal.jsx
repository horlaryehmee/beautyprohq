import { useEffect, useMemo, useState } from 'react';
import api, { apiError, ensureCsrfCookie } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Icon from '../ui/Icon';
import { InlineAlert } from '../ui/Feedback';

const reasons = [
    'Work With Us',
    'Join BeautyProHQ',
    'Need Support',
    'Partnership / Brand Collaboration',
    'General Enquiry',
];

const dynamicOptions = {
    'Work With Us': {
        label: 'What best describes you?',
        field: 'detail_type',
        messageLabel: 'Briefly tell us about your project',
        options: ['Makeup Artist', 'Hairstylist', 'Beauty Brand', 'Content Creator', 'Beauty Educator', 'Other'],
    },
    'Join BeautyProHQ': {
        label: 'What are you interested in?',
        field: 'detail_type',
        messageLabel: 'Anything you’d like us to know?',
        options: ['Directory Listing', 'Membership', 'Events', 'Training & Resources', 'Not Sure Yet'],
    },
    'Need Support': {
        label: 'What do you need help with?',
        field: 'detail_type',
        messageLabel: 'Describe the issue',
        options: ['Account Access', 'Directory Profile', 'Payments', 'Technical Issue', 'Other'],
    },
    'Partnership / Brand Collaboration': {
        label: 'Collaboration details',
        field: 'company_name',
        messageLabel: 'Tell us about the collaboration',
        options: [],
    },
    'General Enquiry': {
        label: 'Tell us more',
        field: 'detail_type',
        messageLabel: 'How can we help?',
        options: [],
    },
};

function OptionButton({ active, children, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex min-h-12 items-center justify-between rounded-2xl border px-4 text-left text-sm font-black transition ${
                active ? 'border-[#241711] bg-[#241711] text-white' : 'border-stone-200 bg-white text-[#241711] hover:bg-[#f4efe9]'
            }`}
        >
            <span>{children}</span>
            <span className={`grid size-5 place-items-center rounded-full border ${active ? 'border-white bg-white text-[#241711]' : 'border-stone-300'}`}>
                {active && <Icon name="check" size={12} />}
            </span>
        </button>
    );
}

export default function OpportunityEnquiryModal({ opportunity, onClose }) {
    const { user } = useAuth();
    const toast = useToast();
    const [step, setStep] = useState(1);
    const [form, setForm] = useState({
        reason: opportunity ? 'Partnership / Brand Collaboration' : '',
        name: user?.name ?? '',
        email: user?.email ?? '',
        phone: '',
        instagram: '',
        company_name: '',
        website: '',
        detail_type: '',
        message: opportunity ? `I am interested in: ${opportunity.title ?? opportunity.type}` : '',
    });
    const [errors, setErrors] = useState({});
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const config = useMemo(() => dynamicOptions[form.reason] ?? dynamicOptions['General Enquiry'], [form.reason]);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const onKey = (event) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    function update(key, value) {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    }

    function next() {
        if (step === 1 && !form.reason) {
            setError('Choose what you need help with.');
            return;
        }
        if (step === 2 && (!form.name || !form.email)) {
            setError('Add your name and email address.');
            return;
        }
        setError('');
        setStep((current) => Math.min(3, current + 1));
    }

    function payload() {
        const lines = [
            opportunity ? `Opportunity: ${opportunity.title ?? opportunity.type}` : null,
            form.detail_type ? `Selected option: ${form.detail_type}` : null,
            form.instagram ? `Instagram: ${form.instagram}` : null,
            form.company_name ? `Company: ${form.company_name}` : null,
            form.website ? `Website / social: ${form.website}` : null,
            '',
            form.message,
        ].filter((line) => line !== null).join('\n');

        return {
            reason: form.reason,
            name: form.name,
            email: form.email,
            phone: form.phone,
            instagram: form.instagram,
            company_name: form.company_name,
            website: form.website,
            detail_type: form.detail_type,
            message: lines.trim(),
        };
    }

    async function submit(event) {
        event.preventDefault();
        if (!form.message.trim()) {
            setError('Tell us a little more before submitting.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await ensureCsrfCookie();
            const data = payload();
            const response = opportunity?.id
                ? await api.post(`/opportunities/${opportunity.id}/enquiries`, {
                    name: data.name,
                    email: data.email,
                    phone: data.phone,
                    message: data.message,
                })
                : await api.post('/contact-enquiries', data);
            toast.success(response?.data?.message || 'Your message has been sent.');
            onClose();
        } catch (requestError) {
            const parsed = apiError(requestError, 'Your message could not be sent.');
            setError(parsed.message);
            setErrors(parsed.fields);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#241711]/55 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section className="max-h-[94vh] w-full overflow-y-auto rounded-t-[2rem] bg-[#fbf8f4] p-5 shadow-2xl sm:max-w-2xl sm:rounded-[2rem] sm:p-7" role="dialog" aria-modal="true" aria-labelledby="contact-title">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[.18em] text-[#8b4b59]">Get in touch</p>
                        <h2 id="contact-title" className="mt-1 font-display text-3xl font-normal leading-tight text-[#241711]">
                            {step === 1 ? 'What can we help you with?' : step === 2 ? 'How should we reach you?' : 'Tell us more'}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white text-[#241711] shadow-sm" aria-label="Close"><Icon name="x" /></button>
                </div>

                <div className="mt-5">
                    <div className="flex items-center gap-2">
                        {[1, 2, 3].map((item) => (
                            <span key={item} className={`h-1.5 flex-1 rounded-full ${item <= step ? 'bg-[#241711]' : 'bg-stone-200'}`} />
                        ))}
                    </div>
                    <p className="mt-2 text-xs font-black uppercase tracking-wide text-stone-500">Step {step} of 3</p>
                </div>

                {opportunity?.description && <p className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-stone-600">{opportunity.description}</p>}
                {error && <InlineAlert className="mt-4">{error}</InlineAlert>}

                <form onSubmit={submit} className="mt-6">
                    {step === 1 && (
                        <div className="grid gap-2">
                            {reasons.map((reason) => (
                                <OptionButton key={reason} active={form.reason === reason} onClick={() => update('reason', reason)}>
                                    {reason}
                                </OptionButton>
                            ))}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField label="Name" value={form.name} onChange={(event) => update('name', event.target.value)} error={errors.name} required />
                            <FormField label="Email address" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} error={errors.email} required />
                            <FormField label="Phone number (optional)" value={form.phone} onChange={(event) => update('phone', event.target.value)} error={errors.phone} />
                            <FormField label="Instagram handle (optional)" value={form.instagram} onChange={(event) => update('instagram', event.target.value)} error={errors.instagram} placeholder="@yourhandle" />
                        </div>
                    )}

                    {step === 3 && (
                        <div className="grid gap-4">
                            {form.reason === 'Partnership / Brand Collaboration' ? (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FormField label="Company name" value={form.company_name} onChange={(event) => update('company_name', event.target.value)} error={errors.company_name} />
                                    <FormField label="Website / social media" value={form.website} onChange={(event) => update('website', event.target.value)} error={errors.website} />
                                </div>
                            ) : config.options.length ? (
                                <div>
                                    <p className="mb-2 text-sm font-black text-[#241711]">{config.label}</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {config.options.map((option) => (
                                            <OptionButton key={option} active={form.detail_type === option} onClick={() => update('detail_type', option)}>
                                                {option}
                                            </OptionButton>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <FormField as="textarea" label={config.messageLabel} value={form.message} onChange={(event) => update('message', event.target.value)} error={errors.message} minLength={10} maxLength={3000} required />
                        </div>
                    )}

                    <div className="mt-6 flex gap-2">
                        {step > 1 && <Button type="button" variant="secondary" onClick={() => setStep((current) => current - 1)}>Back</Button>}
                        {step < 3 ? (
                            <Button type="button" className="flex-1" onClick={next}>Continue <Icon name="arrow" size={16} /></Button>
                        ) : (
                            <Button type="submit" className="flex-1" disabled={submitting}>{submitting ? 'Sending...' : 'Submit'} <Icon name="arrow" size={16} /></Button>
                        )}
                    </div>
                </form>
            </section>
        </div>
    );
}
