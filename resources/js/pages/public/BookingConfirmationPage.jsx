import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { apiError, unwrap } from '../../lib/api';
import Button, { buttonClass } from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';

export default function BookingConfirmationPage() {
    const [params] = useSearchParams();
    const reference = params.get('reference') || params.get('trxref') || '';
    const sessionId = params.get('session_id') || '';
    const paymentToken = params.get('payment_token') || '';
    const cancelled = params.get('cancelled') === '1';
    const [state, setState] = useState(cancelled ? 'cancelled' : 'verifying');
    const [message, setMessage] = useState('');
    const [payment, setPayment] = useState(null);

    const title = useMemo(() => {
        if (state === 'success') return 'Payment confirmed';
        if (state === 'cancelled') return 'Payment was not completed';
        if (state === 'error') return 'Payment needs attention';
        return 'Confirming your payment';
    }, [state]);

    useEffect(() => {
        if (cancelled) {
            setMessage('The checkout was cancelled. The booking request may still exist as pending payment.');
            return;
        }

        if (!reference && !sessionId) {
            setState('error');
            setMessage('No payment reference was found.');
            return;
        }

        let active = true;
        setState('verifying');
        api.post('/booking-payments/verify', {
            reference: reference || undefined,
            session_id: sessionId || undefined,
            payment_token: paymentToken || undefined,
        })
            .then((response) => {
                if (!active) return;
                const verified = unwrap(response);
                setPayment(verified);
                setState('success');
                setMessage(response?.data?.message || 'Your payment has been verified successfully.');
            })
            .catch((requestError) => {
                if (!active) return;
                setState('error');
                setMessage(apiError(requestError, 'We could not verify this payment yet.').message);
            });

        return () => { active = false; };
    }, [cancelled, paymentToken, reference, sessionId]);

    return (
        <section className="min-h-[70vh] bg-[#fbf9f4] px-4 py-16">
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-stone-200 bg-white p-6 text-center shadow-sm sm:p-10">
                <span className={`mx-auto grid size-16 place-items-center rounded-full ${state === 'success' ? 'bg-emerald-50 text-emerald-600' : state === 'error' || state === 'cancelled' ? 'bg-amber-50 text-amber-600' : 'bg-[#f4efe9] text-[#7d2e3c]'}`}>
                    {state === 'verifying' ? <span className="loading-ring loading-ring-small" /> : <Icon name={state === 'success' ? 'check' : 'clock'} size={28} />}
                </span>
                <p className="mt-6 section-eyebrow">Booking payment</p>
                <h1 className="mt-2 font-display text-4xl font-normal text-[#26211e]">{title}</h1>
                <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-stone-600">{message || 'Please wait while we confirm the transaction with the payment gateway.'}</p>

                {payment && (
                    <div className="mx-auto mt-7 max-w-md rounded-2xl border border-stone-200 bg-[#fffdf8] p-4 text-left text-sm">
                        <div className="flex justify-between gap-4 py-2">
                            <span className="text-stone-500">Status</span>
                            <span className="font-black capitalize text-[#26211e]">{payment.status}</span>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-stone-100 py-2">
                            <span className="text-stone-500">Amount</span>
                            <span className="font-black text-[#26211e]">{payment.currency} {Number(payment.amount ?? 0).toLocaleString()}</span>
                        </div>
                        {payment.reference && (
                            <div className="flex justify-between gap-4 border-t border-stone-100 py-2">
                                <span className="text-stone-500">Reference</span>
                                <span className="font-black text-[#26211e]">{payment.reference}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Link to="/directory" className={buttonClass({ variant: 'secondary' })}>Back to directory</Link>
                    <Link to="/" className={buttonClass()}>Go home</Link>
                </div>
            </div>
        </section>
    );
}
