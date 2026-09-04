import { useEffect, useMemo, useState } from 'react';
import api, { apiError, ensureCsrfCookie, unwrap } from '../../lib/api';
import { currency, providerIdentity, stripHtml } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { defaultCountries } from 'react-international-phone';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Icon from '../ui/Icon';
import { InlineAlert } from '../ui/Feedback';

function toMinutes(time) {
    const [hour, minute] = String(time).slice(0, 5).split(':').map(Number);
    return (hour * 60) + minute;
}

function fromMinutes(total) {
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function buildRange(start, end, duration = 30) {
    const slots = [];
    let cursor = toMinutes(start);
    const stop = toMinutes(end);
    let guard = 0;

    while (Number.isFinite(cursor) && Number.isFinite(stop) && cursor + duration <= stop && guard < 48) {
        slots.push(fromMinutes(cursor));
        cursor += 30;
        guard += 1;
    }

    return slots;
}

function localDateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeSlots(payload, duration = 30, selectedDate = '') {
    const source = payload?.slots ?? payload?.available_slots ?? payload?.availability ?? payload ?? [];
    if (!Array.isArray(source)) return [];

    const blocks = Array.isArray(payload?.blocked) ? payload.blocked : [];
    const hasWholeDayBlock = blocks.some((block) => {
        if (typeof block === 'string') return !block.includes(':');
        return block?.all_day || block?.whole_day || (!block?.start_time && !block?.end_time);
    });
    if (hasWholeDayBlock) return [];

    const bookedTimes = new Set((payload?.booked_times ?? []).map((item) => String(typeof item === 'string' ? item : item?.time ?? item?.start_time).slice(0, 5)));
    const timedBlocks = blocks
        .filter((block) => typeof block === 'object' && block?.start_time && block?.end_time)
        .map((block) => [toMinutes(block.start_time), toMinutes(block.end_time)]);

    const results = source.flatMap((item) => {
        if (typeof item === 'string') return [item.slice(0, 5)];
        if (item?.time) return [String(item.time).slice(0, 5)];
        if (item?.start_time && item?.end_time) return buildRange(item.start_time, item.end_time, duration);
        if (item?.start_time) return [String(item.start_time).slice(0, 5)];
        return [];
    });

    return [...new Set(results)]
        .filter((slot) => {
            if (bookedTimes.has(slot)) return false;
            const start = toMinutes(slot);
            const end = start + duration;
            const now = new Date();
            const today = localDateString(now);
            if (selectedDate === today && start <= (now.getHours() * 60) + now.getMinutes()) return false;
            return !timedBlocks.some(([blockStart, blockEnd]) => start < blockEnd && end > blockStart);
        })
        .sort();
}

function displayTime(value) {
    if (!value) return '';
    const [hour, minute] = value.split(':').map(Number);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function zonedDateTime(date, time, timeZone) {
    if (!date || !time) return null;
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;

    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(utcGuess).reduce((carry, part) => ({ ...carry, [part.type]: part.value }), {});
        const shifted = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
        return new Date(utcGuess.getTime() - (shifted - utcGuess.getTime()));
    } catch {
        return utcGuess;
    }
}

function fullDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function monthDateOptions(offset = 0) {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    const firstAllowed = offset === 0 ? today.getDate() : 1;
    const count = Math.max(0, end.getDate() - firstAllowed + 1);

    return Array.from({ length: count }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth(), firstAllowed + index);

        return {
            value: localDateString(date),
            weekday: new Intl.DateTimeFormat('en-NG', { weekday: 'short' }).format(date),
            day: new Intl.DateTimeFormat('en-NG', { day: '2-digit' }).format(date),
            month: new Intl.DateTimeFormat('en-NG', { month: 'short' }).format(date),
        };
    });
}

function calendarMonthDays(offset = 0) {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    const todayValue = localDateString(today);
    const leading = Array.from({ length: start.getDay() }, (_, index) => ({ key: `blank-${index}`, blank: true }));
    const days = Array.from({ length: end.getDate() }, (_, index) => {
        const current = new Date(start.getFullYear(), start.getMonth(), index + 1);
        const value = localDateString(current);

        return {
            key: value,
            value,
            day: index + 1,
            disabled: value < todayValue,
            today: value === todayValue,
        };
    });

    return [...leading, ...days];
}

function monthLabel(offset = 0) {
    const date = new Date();
    date.setMonth(date.getMonth() + offset);
    return new Intl.DateTimeFormat('en-NG', { month: 'long', year: 'numeric' }).format(date);
}

function timezoneDisplayName(timezone) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' }).formatToParts(new Date());
        const offset = parts.find((part) => part.type === 'timeZoneName')?.value?.replace('GMT', 'UTC') ?? 'UTC';
        return `${String(timezone).replaceAll('_', ' ')} (${offset})`;
    } catch {
        return timezone || 'Africa/Lagos';
    }
}

function detectedBrowserTimezone() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone && timezone.includes('/') ? timezone : 'Africa/Lagos';
}

function timezoneOptions(fallback = 'Africa/Lagos') {
    const common = [
        detectedBrowserTimezone(),
        fallback,
        'Africa/Lagos',
        'UTC',
        'Europe/London',
        'Europe/Paris',
        'America/New_York',
        'America/Chicago',
        'America/Los_Angeles',
        'Asia/Dubai',
        'Asia/Kolkata',
    ];
    const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return Array.from(new Set([...common, ...supported].filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

const phoneCountries = [
    ['NG', 'Nigeria', '+234', '🇳🇬'],
    ['GH', 'Ghana', '+233', '🇬🇭'],
    ['KE', 'Kenya', '+254', '🇰🇪'],
    ['ZA', 'South Africa', '+27', '🇿🇦'],
    ['UG', 'Uganda', '+256', '🇺🇬'],
    ['TZ', 'Tanzania', '+255', '🇹🇿'],
    ['AE', 'United Arab Emirates', '+971', '🇦🇪'],
    ['GB', 'United Kingdom', '+44', '🇬🇧'],
    ['US', 'United States', '+1', '🇺🇸'],
    ['CA', 'Canada', '+1', '🇨🇦'],
    ['FR', 'France', '+33', '🇫🇷'],
    ['DE', 'Germany', '+49', '🇩🇪'],
    ['IT', 'Italy', '+39', '🇮🇹'],
    ['ES', 'Spain', '+34', '🇪🇸'],
    ['NL', 'Netherlands', '+31', '🇳🇱'],
    ['IN', 'India', '+91', '🇮🇳'],
    ['CN', 'China', '+86', '🇨🇳'],
    ['BR', 'Brazil', '+55', '🇧🇷'],
    ['AU', 'Australia', '+61', '🇦🇺'],
];
const phoneCountryOptions = defaultCountries.map(([name, iso2, dialCode]) => [iso2.toUpperCase(), name, `+${dialCode}`]);
const defaultPhoneCountry = phoneCountryOptions.find(([code]) => code === 'NG') ?? phoneCountryOptions[0];

function CountryPhoneField({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const selectedCountry = phoneCountryOptions.find((country) => value?.startsWith(country[2])) ?? defaultPhoneCountry;
    const localNumber = String(value ?? '').replace(selectedCountry[2], '').trim();
    const selectedFlagUrl = `https://flagcdn.com/w40/${selectedCountry[0].toLowerCase()}.png`;

    function updateCountry(countryCode) {
        const nextCountry = phoneCountryOptions.find((country) => country[0] === countryCode) ?? defaultPhoneCountry;
        onChange(`${nextCountry[2]}${localNumber ? ` ${localNumber}` : ''}`);
        setOpen(false);
    }

    function updateLocalNumber(nextValue) {
        onChange(`${selectedCountry[2]}${nextValue ? ` ${nextValue}` : ''}`);
    }

    return (
        <div className="block text-sm font-bold text-plum-950">
            <span>Phone number</span>
            <div className="relative mt-1.5 flex min-h-12 overflow-visible rounded-xl border border-stone-200 bg-white focus-within:border-rose-400 focus-within:ring-4 focus-within:ring-rose-100">
                <button
                    type="button"
                    className="relative flex w-16 items-center justify-center gap-1 rounded-l-xl border-r border-stone-200 bg-white text-base"
                    onClick={() => setOpen((current) => !current)}
                    aria-expanded={open}
                    aria-label="Select country code"
                >
                    <img
                        src={selectedFlagUrl}
                        alt={`${selectedCountry[1]} flag`}
                        className="h-4 w-6 rounded-[2px] object-cover"
                        loading="lazy"
                    />
                    <Icon name="chevronDown" size={13} className="text-plum-950" />
                </button>
                {open && (
                    <div className="absolute left-0 top-[calc(100%+.35rem)] z-50 max-h-72 w-72 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-xl">
                        {phoneCountryOptions.map(([code, name, dialCode]) => (
                            <button
                                key={`${code}-${dialCode}`}
                                type="button"
                                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-semibold text-plum-950 hover:bg-stone-50 ${selectedCountry[0] === code ? 'bg-stone-50' : ''}`}
                                onClick={() => updateCountry(code)}
                            >
                                <img
                                    src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
                                    alt={`${name} flag`}
                                    className="h-4 w-6 rounded-[2px] object-cover"
                                    loading="lazy"
                                />
                                <span className="min-w-0 flex-1 truncate">{name}</span>
                                <span className="shrink-0 font-black">{dialCode}</span>
                            </button>
                        ))}
                    </div>
                )}
                <span className="flex min-w-20 items-center justify-center border-r border-stone-200 px-3 text-sm font-black text-plum-950">{selectedCountry[2]}</span>
                <input
                    className="min-w-0 flex-1 px-3.5 text-sm text-plum-950 outline-none placeholder:text-stone-400"
                    value={localNumber}
                    onChange={(event) => updateLocalNumber(event.target.value)}
                    placeholder="802 123 4567"
                    required
                    type="tel"
                />
            </div>
        </div>
    );
}

function ProviderSummary({ pro }) {
    return (
        <div className="flex items-center gap-3">
            {pro.photo ? <img src={pro.photo} alt="" className="size-14 rounded-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <span className="grid size-14 place-items-center rounded-full bg-[#2A1D14] font-display text-xl text-white">{String(pro.name || 'B').slice(0, 1)}</span>}
            <div className="min-w-0">
                <p className="truncate font-bold text-[#2A1D14]">{pro.name}</p>
                <p className="truncate text-sm text-stone-500">{pro.profession}</p>
                {pro.cardLocation && <p className="mt-0.5 truncate text-xs font-bold text-stone-400">{pro.cardLocation}</p>}
            </div>
        </div>
    );
}

function SummaryRow({ icon, label, value }) {
    return (
        <div className="flex gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#3A2A1F]"><Icon name={icon} size={16} /></span>
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
                <p className="mt-0.5 text-sm font-bold leading-5 text-[#2A1D14]">{value}</p>
            </div>
        </div>
    );
}

function Stepper({ step }) {
    const steps = ['Date', 'Time', 'Details', 'Payment'];
    return (
        <div className="flex gap-2 overflow-x-auto pb-1">
            {steps.map((label, index) => {
                const active = step === index + 1;
                const done = step > index + 1;
                return (
                    <div key={label} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide ${active ? 'bg-[#2A1D14] text-white' : done ? 'bg-emerald-50 text-emerald-700' : 'bg-[#F7F3ED] text-stone-500'}`}>
                        <span className="grid size-6 place-items-center rounded-full bg-white/20">{done ? <Icon name="check" size={13} /> : index + 1}</span>
                        {label}
                    </div>
                );
            })}
        </div>
    );
}

function CustomBookingField({ field, value, onChange }) {
    const label = `${field.label ?? 'Additional question'}${field.required ? ' *' : ''}`;
    if (field.type === 'select') {
        return <FormField as="select" label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Choose an option</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</FormField>;
    }
    if (field.type === 'checkbox') {
        const selected = Array.isArray(value) ? value : [];
        return <div><p className="mb-2 text-sm font-bold text-[#2A1D14]">{label}</p><div className="space-y-2">{(field.options ?? []).map((option) => <label className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm font-semibold text-[#2A1D14]" key={option}><input checked={selected.includes(option)} className="mt-1 size-4 accent-[#3A2A1F]" onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} type="checkbox" />{option}</label>)}</div></div>;
    }
    return <FormField as={field.type === 'textarea' ? 'textarea' : 'input'} label={label} value={value} onChange={(event) => onChange(event.target.value)} maxLength={1000} placeholder="Your answer" />;
}

export default function BookingModal({ open, onClose, provider, services = [], initialService, onBooked, standalone = false }) {
    const pro = providerIdentity(provider);
    const providerId = provider?.provider_id ?? pro.id ?? provider?.id;
    const bookingFields = Array.isArray(provider?.booking_form_fields) ? provider.booking_form_fields : [];
    const { user } = useAuth();
    const toast = useToast();
    const [step, setStep] = useState(1);
    const [serviceId, setServiceId] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [notes, setNotes] = useState('');
    const [customAnswers, setCustomAnswers] = useState({});
    const [referralCode, setReferralCode] = useState('');
    const [redeemLoyalty, setRedeemLoyalty] = useState(false);
    const [customer, setCustomer] = useState({ name: '', email: '', phone: '', create_account: false, password: '', password_confirmation: '' });
    const [paymentMethod, setPaymentMethod] = useState('');
    const [manualBooking, setManualBooking] = useState(null);
    const [availabilityData, setAvailabilityData] = useState(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [checkoutUrl, setCheckoutUrl] = useState('');
    const [monthOffset, setMonthOffset] = useState(0);
    const [selectedTimezone, setSelectedTimezone] = useState(detectedBrowserTimezone);

    const availableServices = useMemo(() => initialService ? [initialService] : services, [initialService, services]);
    const selectedService = useMemo(() => availableServices.find((item) => String(item.id) === String(serviceId)), [availableServices, serviceId]);
    const days = useMemo(() => monthDateOptions(monthOffset), [monthOffset]);
    const calendarDays = useMemo(() => {
        const availability = Array.isArray(provider?.availability) ? provider.availability : [];
        const availableWeekdays = new Set(availability.map((item) => Number(item.day_of_week)).filter((day) => Number.isFinite(day)));

        return calendarMonthDays(monthOffset).map((item) => {
            if (item.blank || !availableWeekdays.size) return item;
            const weekday = new Date(`${item.value}T00:00:00`).getDay();
            return { ...item, disabled: item.disabled || !availableWeekdays.has(weekday) };
        });
    }, [monthOffset, provider?.availability]);
    const slots = useMemo(() => normalizeSlots(availabilityData, Number(selectedService?.duration_minutes) || 30, date), [availabilityData, selectedService?.duration_minutes, date]);
    const passwordComplete = customer.password.length >= 8 && customer.password === customer.password_confirmation;
    const detailsComplete = customer.name.trim() && customer.email.trim() && customer.phone.trim() && (!customer.create_account || passwordComplete);
    const providerTimezone = provider?.timezone || provider?.provider_timezone || 'Africa/Lagos';
    const timezoneChoices = useMemo(() => timezoneOptions(providerTimezone), [providerTimezone]);
    const timezoneLabel = useMemo(() => timezoneDisplayName(selectedTimezone), [selectedTimezone]);
    const durationLabel = `${selectedService?.duration_minutes ?? 30} Minutes`;
    const locationOptionCount = useMemo(() => {
        const serviceTypes = new Set(availableServices.map((service) => service.service_type).filter(Boolean));
        return Math.max(1, serviceTypes.size || (selectedService?.service_type ? 1 : 0));
    }, [availableServices, selectedService]);
    const serviceTypeLabel = selectedService?.service_type ? String(selectedService.service_type).replaceAll('_', ' ') : null;
    const serviceLocationLabel = locationOptionCount > 1
        ? `${locationOptionCount} location options`
        : (serviceTypeLabel ? serviceTypeLabel : `${locationOptionCount} location option`);
    const selectedServiceDescription = selectedService?.description ? stripHtml(selectedService.description) : '';
    const selectedServicePrice = selectedService ? currency(selectedService.price, selectedService.currency ?? 'NGN') : '';
    const referralRewardsAvailable = Boolean(
        provider?.referral_rewards_available
        ?? (provider?.loyalty_enabled && provider?.referral_rewards_enabled && Number(provider?.loyalty_referral_points ?? 0) > 0),
    );
    const loyaltyPointsRequired = useMemo(() => {
        const minimum = Number(provider?.loyalty_points_required ?? 0);
        const value = Number(provider?.loyalty_reward_value_amount ?? 0);
        const price = Number(selectedService?.price ?? 0);
        if (!minimum || !value || !price) return minimum;
        return Math.max(minimum, Math.ceil((price / value) * minimum));
    }, [provider?.loyalty_points_required, provider?.loyalty_reward_value_amount, selectedService?.price]);
    const paymentMethods = useMemo(() => {
        const methods = Array.isArray(provider?.payment_methods) ? provider.payment_methods : [];
        return methods;
    }, [provider]);
    const selectedPaymentMethod = paymentMethods.find((method) => method.gateway === paymentMethod) ?? paymentMethods[0];

    useEffect(() => {
        if (!open) return undefined;
        setStep(1);
        setServiceId(String(initialService?.id ?? availableServices[0]?.id ?? ''));
        setDate('');
        setTime('');
        setNotes('');
        setCustomAnswers({});
        setReferralCode(referralRewardsAvailable ? (new URLSearchParams(window.location.search).get('ref') ?? '') : '');
        setRedeemLoyalty(false);
        setCustomer({ name: user?.role === 'customer' ? user.name ?? '' : '', email: user?.role === 'customer' ? user.email ?? '' : '', phone: user?.phone ?? '', create_account: false, password: '', password_confirmation: '' });
        setPaymentMethod(paymentMethods[0]?.gateway || '');
        setManualBooking(null);
        setAvailabilityData(null);
        setCheckoutUrl('');
        setMonthOffset(0);
        setSelectedTimezone(detectedBrowserTimezone());
        setError('');
        if (!standalone) {
            document.body.style.overflow = 'hidden';
        }
        const onKeyDown = (event) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKeyDown);
        return () => {
            if (!standalone) {
                document.body.style.overflow = '';
            }
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open, initialService, availableServices, onClose, standalone, user, paymentMethods, referralRewardsAvailable]);

    useEffect(() => {
        if (!open || !date || !pro.slug) return;
        let active = true;
        setLoadingSlots(true);
        setTime('');
        setError('');
        api.get(`/providers/${pro.slug}/availability`, { params: { date, timezone: selectedTimezone } })
            .then((response) => active && setAvailabilityData(unwrap(response)))
            .catch((requestError) => active && setError(apiError(requestError, 'We could not load availability for this date.').message))
            .finally(() => active && setLoadingSlots(false));
        return () => { active = false; };
    }, [open, date, pro.slug, selectedTimezone]);

    useEffect(() => {
        if (!open || !standalone || date) return;
        const firstAvailableDate = calendarDays.find((item) => !item.blank && !item.disabled)?.value;
        if (firstAvailableDate) {
            setDate(firstAvailableDate);
        }
    }, [calendarDays, date, open, standalone]);

    useEffect(() => { setTime(''); }, [serviceId]);

    if (!open) return null;

    function nextStep() {
        setError('');
        if (step === 1 && (!serviceId || !date)) {
            setError('Choose a service and date to continue.');
            return;
        }
        if (step === 2 && !time) {
            setError('Choose an available time to continue.');
            return;
        }
        if (step === 3 && !detailsComplete) {
            setError(customer.create_account ? 'Name, email, phone number and matching passwords of at least 8 characters are required.' : 'Name, email and phone number are required.');
            return;
        }
        if (step === 3) {
            const missing = bookingFields.find((field, index) => field.required && (field.type === 'checkbox' ? !customAnswers[index] : !String(customAnswers[index] ?? '').trim()));
            if (missing) {
                setError(`Please answer: ${missing.label}`);
                return;
            }
        }
        if (step === 4 && !selectedPaymentMethod && !redeemLoyalty) {
            setError('Choose a payment method to continue.');
            return;
        }
        setStep((current) => Math.min(4, current + 1));
    }

    function chooseDate(value) {
        setDate(value);
        if (standalone && window.matchMedia('(max-width: 1023px)').matches) {
            setStep(2);
        }
    }

    function chooseTime(value) {
        setTime(value);
        if (standalone) {
            setStep(3);
        }
    }

    function displaySlotTime(value) {
        if (!value || !date) return displayTime(value);
        const instant = zonedDateTime(date, value, providerTimezone);
        if (!instant) return displayTime(value);
        try {
            return new Intl.DateTimeFormat('en-NG', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: selectedTimezone,
            }).format(instant);
        } catch {
            return displayTime(value);
        }
    }

    function TimezoneSelect({ compact = false }) {
        return (
            <label className="relative block">
                <Icon name="calendar" size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-bphq-coffee/70" />
                <select
                    className={`w-full appearance-none rounded-xl border border-bphq-chrome bg-white pl-10 pr-9 text-left text-sm font-bold text-bphq-espresso outline-none transition focus:border-bphq-coffee focus:ring-4 focus:ring-bphq-beige/60 ${compact ? 'min-h-10' : 'min-h-11'}`}
                    value={selectedTimezone}
                    onChange={(event) => setSelectedTimezone(event.target.value)}
                >
                    {timezoneChoices.map((timezone) => (
                        <option key={timezone} value={timezone}>{timezoneDisplayName(timezone)}</option>
                    ))}
                </select>
                <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-bphq-coffee/70" />
            </label>
        );
    }

    async function createBookingAndCheckout() {
        if (!serviceId || !date || !time || !detailsComplete) {
            setError('Complete all required booking steps before payment.');
            return;
        }
        if (!redeemLoyalty && !selectedPaymentMethod) {
            setError('Select an available payment method before continuing.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            await ensureCsrfCookie();
            const payload = {
                provider_id: providerId,
                service_id: Number(serviceId),
                date,
                time,
                notes: notes.trim(),
                referral_code: referralRewardsAvailable ? (referralCode.trim() || undefined) : undefined,
                custom_fields: {
                    _booking_timezone: selectedTimezone,
                    ...Object.fromEntries(Object.entries(customAnswers).map(([index, answer]) => [`_field_${index}`, answer])),
                },
                redeem_loyalty: redeemLoyalty || undefined,
                payment_method: selectedPaymentMethod?.gateway,
            };
            const response = await api.post(user?.role === 'customer' ? '/bookings' : '/guest-bookings', { ...payload, customer });
            const booking = unwrap(response);
            const payment = booking?.payment;
            const token = payment?.metadata?.payment_token;
            onBooked?.(booking);

            if (payment?.gateway === 'manual') {
                setManualBooking(booking);
                toast.success('Booking created. Send the manual payment, then the provider will confirm it.');
                return;
            }

            if (payment?.id && token && payment.status !== 'paid' && Number(payment.amount ?? 0) > 0) {
                const checkout = unwrap(await api.post(`/booking-payments/${payment.id}/checkout`, { payment_token: token, gateway: selectedPaymentMethod?.gateway }));
                setCheckoutUrl(checkout.authorization_url);
                toast.success('Booking created. Continue to payment to confirm.');
                return;
            }

            toast.success(response?.data?.message || 'Booking request sent to the professional.');
            window.location.href = `/booking-confirmation?reference=${encodeURIComponent(payment?.reference ?? '')}&payment_token=${encodeURIComponent(token ?? '')}`;
        } catch (requestError) {
            setError(apiError(requestError, 'Your booking request could not be sent.').message);
        } finally {
            setSubmitting(false);
        }
    }

    const standaloneScheduler = standalone && step <= 2 ? (
        <section className="mx-auto w-full max-w-md bg-bphq-ivory px-3 py-3 text-bphq-espresso sm:px-4 sm:py-5 lg:max-w-7xl lg:overflow-hidden lg:rounded-2xl lg:border lg:border-bphq-chrome/80 lg:bg-white lg:p-0 lg:shadow-sm lg:shadow-bphq-beige/40" aria-labelledby="booking-title">
            {user && user.role !== 'customer' ? (
                <div className="p-4 lg:p-7"><InlineAlert>Provider and admin accounts cannot create customer bookings from this page.</InlineAlert></div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[0.8fr_1fr_0.75fr] lg:gap-0">
                    <aside className={`${step <= 2 ? 'block' : 'hidden'} lg:block lg:border-r lg:border-bphq-chrome/80 lg:bg-bphq-ivory/70 lg:p-8`}>
                        <h1 id="booking-title" className="font-display text-2xl font-semibold leading-tight text-bphq-espresso lg:text-3xl">{selectedService?.name ?? 'Service'}</h1>
                        {selectedServicePrice && <p className="mt-2 text-lg font-black text-bphq-coffee lg:text-xl">{selectedServicePrice}</p>}
                        <div className="mt-3 space-y-2 text-sm font-medium capitalize text-bphq-espresso">
                            <div className="flex items-center gap-2"><Icon name="clock" size={15} /> {durationLabel}</div>
                            <div className="flex items-center gap-2"><Icon name="map" size={15} /> {serviceLocationLabel}</div>
                            <div className="flex items-center gap-2 normal-case"><Icon name="calendar" size={15} /> {timezoneLabel}</div>
                        </div>
                        {selectedServiceDescription && <p className="mt-4 max-w-sm text-sm leading-6 text-bphq-coffee lg:mt-6 lg:text-base lg:leading-7">{selectedServiceDescription}</p>}
                    </aside>

                    <section className={`${step === 1 ? 'block' : 'hidden'} lg:block lg:border-r lg:border-bphq-chrome/80 lg:p-8`}>
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="font-display text-lg font-semibold text-bphq-espresso lg:text-xl">{monthLabel(monthOffset)}</h2>
                            <div className="flex items-center gap-1">
                                <button type="button" disabled={monthOffset === 0} onClick={() => setMonthOffset((current) => Math.max(0, current - 1))} className="grid size-8 place-items-center rounded-full text-bphq-coffee/70 transition hover:bg-bphq-ivory disabled:opacity-30" aria-label="Previous month"><Icon name="chevronLeft" size={17} /></button>
                                <button type="button" onClick={() => setMonthOffset((current) => current + 1)} className="grid size-8 place-items-center rounded-full text-bphq-coffee transition hover:bg-bphq-ivory" aria-label="Next month"><Icon name="chevronRight" size={17} /></button>
                            </div>
                        </div>

                        <div className="mt-4 rounded-3xl border border-bphq-chrome/80 bg-bphq-ivory p-2 sm:p-3 lg:mt-6">
                            <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase text-bphq-coffee/70 lg:text-xs">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
                            </div>
                            <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-sm sm:gap-2 lg:mt-5">
                                {calendarDays.map((item) => item.blank ? (
                                    <span key={item.key} className="h-10 sm:h-12 lg:h-14" />
                                ) : (
                                    <button
                                        key={item.key}
                                        type="button"
                                        disabled={item.disabled}
                                        onClick={() => chooseDate(item.value)}
                                        className={`relative grid h-10 w-full place-items-center rounded-2xl border text-xs transition sm:h-12 lg:h-14 lg:text-sm ${date === item.value ? 'border-bphq-espresso bg-bphq-espresso font-bold text-white shadow-lg shadow-bphq-beige/70' : item.disabled ? 'border-transparent text-bphq-chrome' : 'border-bphq-chrome/70 bg-white text-bphq-espresso shadow-sm shadow-bphq-beige/40 hover:border-bphq-coffee lg:shadow-md'} `}
                                    >
                                        {item.day}
                                        {item.today && date !== item.value && <span className="absolute bottom-1 size-1 rounded-full bg-bphq-coffee lg:bottom-2" />}
                                        {date === item.value && <span className="absolute bottom-1 size-1.5 rounded-full bg-white lg:bottom-2" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-5 lg:mt-8">
                            <p className="text-sm font-black text-bphq-espresso lg:text-lg">Timezone</p>
                            <div className="mt-2"><TimezoneSelect /></div>
                            <p className="mt-2 text-xs leading-5 text-bphq-coffee/70">Times are shown in {timezoneLabel}. The provider calendar uses {timezoneDisplayName(providerTimezone)}.</p>
                        </div>
                    </section>

                    <aside className={`${step === 2 ? 'block' : 'hidden'} min-h-0 lg:block lg:p-8`}>
                        <div className="flex items-center justify-between gap-4">
                            <button type="button" onClick={() => setStep(1)} className="flex items-center gap-3 text-sm font-bold text-bphq-espresso lg:pointer-events-none lg:cursor-default">
                                <span className="grid size-9 place-items-center rounded-full border border-bphq-chrome bg-white lg:hidden"><Icon name="chevronLeft" size={16} /></span>
                                <span className="text-lg font-black lg:text-xl">{date ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`)) : 'Choose date'}</span>
                            </button>
                        </div>
                        <div className="mt-4 max-h-none space-y-3 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-10rem)] lg:space-y-4">
                            {loadingSlots ? (
                                <div className="flex items-center gap-2 rounded-lg border border-bphq-chrome bg-white p-4 text-sm font-semibold text-bphq-coffee"><span className="loading-ring loading-ring-small" /> Checking calendar...</div>
                            ) : slots.length ? (
                                slots.map((slot) => (
                                    <button key={slot} type="button" onClick={() => chooseTime(slot)} className={`min-h-11 w-full rounded-lg border px-4 text-left text-sm font-medium transition lg:min-h-14 lg:px-5 lg:text-base ${time === slot ? 'border-bphq-espresso bg-bphq-espresso text-white' : 'border-bphq-chrome bg-white text-bphq-espresso hover:border-bphq-coffee hover:bg-bphq-ivory'}`}>
                                        {displaySlotTime(slot)}
                                    </button>
                                ))
                            ) : (
                                <p className="rounded-lg border border-dashed border-bphq-chrome bg-white p-5 text-sm leading-6 text-bphq-coffee">No open times for this date. Choose another day.</p>
                            )}
                        </div>
                    </aside>
                </div>
            )}
        </section>
    ) : null;

    const content = standaloneScheduler ?? (
            <section className={`flex w-full flex-col overflow-hidden ${standalone ? 'min-h-[calc(100dvh-2rem)] bg-bphq-ivory lg:min-h-[calc(100dvh-5rem)] lg:rounded-[1.5rem] lg:border lg:border-bphq-chrome/80 lg:bg-white lg:shadow-sm lg:shadow-bphq-beige/40' : 'h-[100dvh] rounded-t-[2rem] bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:max-w-6xl sm:rounded-[2rem]'}`} role={standalone ? undefined : 'dialog'} aria-modal={standalone ? undefined : true} aria-labelledby="booking-title">
                <div className={`shrink-0 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4 ${standalone ? 'hidden' : ''}`}>
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#3A2A1F]">Booking</p>
                            <h2 id="booking-title" className="mt-0.5 truncate font-display text-xl font-normal text-[#2A1D14] sm:text-2xl">Book with {pro.name}</h2>
                        </div>
                        <button type="button" className="grid size-10 place-items-center rounded-full border border-stone-200 bg-white text-stone-500 hover:text-[#2A1D14]" onClick={onClose} aria-label={standalone ? 'Go back' : 'Close booking form'}><Icon name={standalone ? 'chevronLeft' : 'x'} /></button>
                    </div>
                    <div className="mt-3"><Stepper step={step} /></div>
                </div>

                {user && user.role !== 'customer' ? (
                    <div className="p-7"><InlineAlert>Provider and admin accounts cannot create customer bookings from this popup.</InlineAlert></div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                        {error && <div className="border-b border-stone-200 p-4 sm:px-6"><InlineAlert>{error}</InlineAlert></div>}

                        <div className={`grid min-h-0 flex-1 ${standalone ? '' : 'lg:grid-cols-[310px_1fr]'}`}>
                            <aside className={`${standalone ? 'hidden' : 'hidden border-b border-stone-200 bg-[#F7F3ED] p-5 lg:block lg:border-b-0 lg:border-r lg:p-6'}`}>
                                <ProviderSummary pro={pro} />
                                <div className="mt-7 space-y-4">
                                    <SummaryRow icon="scissors" label="Service" value={selectedService?.name ?? 'Choose a service'} />
                                    <SummaryRow icon="calendar" label="Date" value={date ? fullDate(date) : 'Choose a date'} />
                                    <SummaryRow icon="clock" label="Time" value={time ? displaySlotTime(time) : 'Choose a time'} />
                                </div>
                                {selectedService && (
                                    <div className="mt-7 rounded-2xl border border-[#DCCCB8] bg-white p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-[#3A2A1F]">Total</p>
                                        <p className="mt-1 font-display text-3xl font-normal text-[#2A1D14]">{currency(selectedService.price, selectedService.currency ?? 'NGN')}</p>
                                        <p className="mt-1 text-xs font-bold text-stone-500">{selectedService.duration_minutes ?? 30} minutes</p>
                                        {selectedService.description && <p className="mt-3 text-xs leading-5 text-stone-600">{stripHtml(selectedService.description)}</p>}
                                        {user?.role === 'customer' && provider?.loyalty_enabled && loyaltyPointsRequired > 0 && (
                                            <label className="mt-4 flex items-start gap-3 rounded-2xl bg-[#F7F3ED] p-3 text-xs font-bold leading-5 text-[#2A1D14]">
                                                <input checked={redeemLoyalty} className="mt-0.5 size-4 accent-[#3A2A1F]" onChange={(event) => setRedeemLoyalty(event.target.checked)} type="checkbox" />
                                                Use {Number(loyaltyPointsRequired).toLocaleString()} loyalty points for this booking request.
                                            </label>
                                        )}
                                    </div>
                                )}
                            </aside>

                            <main className={`flex min-h-0 min-w-0 flex-col overflow-y-auto ${standalone ? 'px-3 py-3 pb-28 lg:bg-white lg:px-6 lg:py-6' : 'px-4 py-4 pb-28 lg:p-6'}`}>
                                {step === 1 && (
                                    <div className="space-y-5">
                                        <section className={`${standalone ? 'block lg:hidden' : 'hidden'}`}>
                                            <div className="px-0 pb-4 pt-1">
                                                <h1 className="font-display text-[24px] font-semibold leading-tight text-bphq-espresso">{selectedService?.name ?? 'Consultation'}</h1>
                                                {selectedServicePrice && <p className="mt-2 text-base font-black text-bphq-coffee">{selectedServicePrice}</p>}
                                                <div className="mt-4 space-y-2 text-[13px] font-medium text-bphq-espresso">
                                                    <div className="flex items-center gap-2"><Icon name="clock" size={15} /> {durationLabel}</div>
                                                    <div className="flex items-center gap-2"><Icon name="map" size={15} /> {locationOptionCount} location option{locationOptionCount === 1 ? '' : 's'}</div>
                                                    <div className="flex items-center gap-2"><Icon name="calendar" size={15} /> {timezoneLabel}</div>
                                                </div>
                                            </div>

                                            <div className="mt-8 flex items-center justify-between">
                                                <h2 className="font-display text-base font-semibold text-bphq-espresso">{monthLabel(monthOffset)}</h2>
                                                <div className="flex items-center gap-5">
                                                    <button type="button" disabled={monthOffset === 0} onClick={() => setMonthOffset((current) => Math.max(0, current - 1))} className="grid size-8 place-items-center rounded-full text-bphq-coffee/70 disabled:opacity-30" aria-label="Previous month"><Icon name="chevronLeft" size={18} /></button>
                                                    <button type="button" onClick={() => setMonthOffset((current) => current + 1)} className="grid size-8 place-items-center rounded-full text-bphq-coffee" aria-label="Next month"><Icon name="chevronRight" size={18} /></button>
                                                </div>
                                            </div>

                                            <div className="mt-6 rounded-[1.35rem] border border-bphq-chrome/80 bg-bphq-ivory p-4">
                                                <div className="grid grid-cols-7 text-center text-xs font-medium uppercase text-bphq-coffee/70">
                                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
                                                </div>
                                                <div className="mt-5 grid grid-cols-7 gap-y-2 text-center text-sm">
                                                    {calendarDays.map((item) => item.blank ? (
                                                        <span key={item.key} className="h-10" />
                                                    ) : (
                                                        <button
                                                            key={item.key}
                                                            type="button"
                                                            disabled={item.disabled}
                                                            onClick={() => chooseDate(item.value)}
                                                            className={`relative mx-auto grid size-10 place-items-center rounded-2xl border text-sm transition ${date === item.value ? 'border-bphq-espresso bg-bphq-espresso font-bold text-white shadow-md shadow-bphq-beige/70' : item.disabled ? 'border-transparent text-bphq-chrome' : 'border-transparent text-bphq-coffee/70 hover:bg-white hover:text-bphq-espresso'}`}
                                                        >
                                                            {item.day}
                                                            {item.today && date !== item.value && <span className="absolute bottom-1 size-1 rounded-full bg-bphq-coffee" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="mt-5">
                                                <p className="text-sm font-bold text-bphq-espresso">Timezone</p>
                                                <div className="mt-2"><TimezoneSelect /></div>
                                                <p className="mt-2 text-xs text-bphq-coffee/70">Times are shown in {timezoneLabel}.</p>
                                            </div>
                                        </section>

                                        <section className={standalone ? 'hidden lg:block' : ''}>
                                            <div className="flex items-end justify-between gap-3">
                                                <div>
                                                    <h3 className="font-display text-xl font-normal text-[#2A1D14] sm:text-2xl">{initialService ? 'Selected service' : 'Choose service'}</h3>
                                                    <p className="text-xs font-semibold text-stone-500">{initialService ? 'This booking is based on the service selected from the profile.' : 'Swipe to see more services.'}</p>
                                                </div>
                                                {selectedService && <span className="shrink-0 rounded-full bg-[#F7F3ED] px-3 py-1 text-xs font-semibold text-[#3A2A1F]">{currency(selectedService.price, selectedService.currency ?? 'NGN')}</span>}
                                            </div>
                                            <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
                                                {availableServices.map((service) => (
                                                    <button key={service.id} type="button" onClick={() => setServiceId(String(service.id))} className={`min-w-[76vw] snap-start rounded-2xl border p-4 text-left transition sm:min-w-0 ${String(serviceId) === String(service.id) ? 'border-[#2A1D14] bg-[#2A1D14] text-white' : 'border-stone-200 bg-white text-[#2A1D14] hover:border-[#BFC3C8]'}`}>
                                                        <p className="line-clamp-1 font-bold">{service.name}</p>
                                                        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold">
                                                            <span className={String(serviceId) === String(service.id) ? 'text-white/70' : 'text-stone-500'}>{service.duration_minutes ?? 30} mins</span>
                                                            <span className={String(serviceId) === String(service.id) ? 'text-white' : 'text-[#3A2A1F]'}>{currency(service.price, service.currency ?? 'NGN')}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </section>

                                        <section className={standalone ? 'hidden lg:block' : ''}>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="font-display text-xl font-normal text-[#2A1D14] sm:text-2xl">Pick date</h3>
                                                    <p className="text-xs font-semibold text-stone-500">Swipe days or change month.</p>
                                                </div>
                                                <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-white p-1">
                                                    <button type="button" disabled={monthOffset === 0} onClick={() => setMonthOffset((current) => Math.max(0, current - 1))} className="grid size-8 place-items-center rounded-full text-stone-500 disabled:opacity-30"><Icon name="chevronLeft" size={16} /></button>
                                                    <span className="min-w-28 text-center text-xs font-semibold text-[#2A1D14]">{monthLabel(monthOffset)}</span>
                                                    <button type="button" onClick={() => setMonthOffset((current) => current + 1)} className="grid size-8 place-items-center rounded-full text-stone-500"><Icon name="chevronRight" size={16} /></button>
                                                </div>
                                            </div>
                                            <div className="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-2">
                                                {days.map((item) => (
                                                    <button key={item.value} type="button" onClick={() => chooseDate(item.value)} className={`min-h-20 min-w-16 snap-start rounded-2xl border p-2 text-center transition ${date === item.value ? 'border-[#2A1D14] bg-[#2A1D14] text-white shadow-lg shadow-stone-200' : 'border-stone-200 bg-white text-[#2A1D14] hover:border-[#BFC3C8] hover:bg-[#F7F3ED]'}`}>
                                                        <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70">{item.weekday}</span>
                                                        <span className="mt-1 block font-display text-2xl font-normal">{item.day}</span>
                                                        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide opacity-70">{item.month}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <label className="mt-2 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-500">
                                                Other date
                                                <input type="date" min={localDateString()} value={date} onChange={(event) => chooseDate(event.target.value)} className="ml-auto bg-transparent text-sm font-bold text-[#2A1D14] outline-none" />
                                            </label>
                                        </section>
                                    </div>
                                )}

                                {step === 2 && (
                                    <section className={standalone ? 'lg:hidden' : 'hidden'}>
                                        <div>
                                            <h1 className="font-display text-[24px] font-semibold leading-tight text-bphq-espresso">{selectedService?.name ?? 'Consultation'}</h1>
                                            {selectedServicePrice && <p className="mt-2 text-base font-black text-bphq-coffee">{selectedServicePrice}</p>}
                                            <div className="mt-4 space-y-2 text-[13px] font-medium text-bphq-espresso">
                                                <div className="flex items-center gap-2"><Icon name="clock" size={15} /> {durationLabel}</div>
                                                <div className="flex items-center gap-2"><Icon name="map" size={15} /> {locationOptionCount} location option{locationOptionCount === 1 ? '' : 's'}</div>
                                                <div className="flex items-center gap-2"><Icon name="calendar" size={15} /> {timezoneLabel}</div>
                                            </div>
                                            {selectedService?.description && <p className="mt-5 text-sm leading-7 text-bphq-coffee">{stripHtml(selectedService.description)}</p>}
                                        </div>

                                        <div className="mt-8 flex items-center justify-between gap-3">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <button type="button" onClick={() => setStep(1)} className="grid size-9 shrink-0 place-items-center rounded-full border border-bphq-chrome bg-white text-bphq-espresso" aria-label="Back to date"><Icon name="chevronLeft" size={18} /></button>
                                                <p className="truncate text-sm font-bold text-bphq-espresso">{date ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`)) : 'Choose date'}</p>
                                            </div>
                                        </div>

                                        <div className="mt-4 min-h-48">
                                            {loadingSlots ? (
                                                <div className="flex items-center gap-2 rounded-md border border-bphq-chrome bg-white p-4 text-sm font-semibold text-bphq-coffee"><span className="loading-ring loading-ring-small" /> Checking calendar...</div>
                                            ) : slots.length ? (
                                                <div className="space-y-3">
                                                    {slots.map((slot) => <button key={slot} type="button" onClick={() => chooseTime(slot)} className={`min-h-10 w-full rounded border px-4 text-left text-sm font-medium transition ${time === slot ? 'border-bphq-espresso bg-bphq-espresso text-white' : 'border-bphq-chrome bg-white text-bphq-espresso hover:border-bphq-coffee hover:bg-bphq-ivory'}`}>{displaySlotTime(slot)}</button>)}
                                                </div>
                                            ) : (
                                                <p className="rounded-md border border-dashed border-bphq-chrome bg-white p-5 text-sm leading-6 text-bphq-coffee">No open times for this date. Go back and try another day.</p>
                                            )}
                                        </div>
                                    </section>
                                )}

                                {step === 2 && (
                                    <section className={standalone ? 'hidden lg:block' : ''}>
                                        <div className="flex items-end justify-between gap-3">
                                            <div>
                                                <h3 className="font-display text-xl font-normal text-[#2A1D14] sm:text-2xl">Pick time</h3>
                                                <p className="mt-1 text-xs font-semibold leading-5 text-stone-500">{date ? fullDate(date) : 'Select a date to view available times.'}</p>
                                            </div>
                                            <button type="button" onClick={() => setStep(1)} className="shrink-0 rounded-full bg-[#F7F3ED] px-3 py-2 text-xs font-semibold text-[#2A1D14]">Change date</button>
                                        </div>
                                        <div className="mt-4 min-h-48">
                                            {loadingSlots ? (
                                                <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-5 text-sm font-semibold text-stone-500"><span className="loading-ring loading-ring-small" /> Checking calendar...</div>
                                            ) : slots.length ? (
                                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                                                    {slots.map((slot) => <button key={slot} type="button" onClick={() => chooseTime(slot)} className={`min-h-12 rounded-xl border px-2 text-xs font-semibold transition sm:text-sm ${time === slot ? 'border-[#2A1D14] bg-[#2A1D14] text-white' : 'border-stone-200 bg-white text-[#2A1D14] hover:border-[#BFC3C8] hover:bg-[#F7F3ED]'}`}>{displaySlotTime(slot)}</button>)}
                                                </div>
                                            ) : (
                                                <p className="rounded-2xl border border-dashed border-stone-200 bg-[#F7F3ED] p-5 text-sm leading-6 text-stone-500">No open times for this date. Go back and try another day.</p>
                                            )}
                                        </div>
                                    </section>
                                )}

                                {step === 3 && (
                                    <section className="mx-auto w-full max-w-md space-y-5 lg:max-w-5xl">
                                        <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
                                            <aside className="hidden border-r border-stone-200 pr-8 lg:block">
                                                <h2 className="font-display text-3xl font-semibold leading-tight text-bphq-espresso">{selectedService?.name ?? 'Service'}</h2>
                                                {selectedServicePrice && <p className="mt-2 text-xl font-black text-bphq-coffee">{selectedServicePrice}</p>}
                                                <div className="mt-4 grid gap-2 text-sm font-medium text-bphq-coffee">
                                                    <div className="flex items-center gap-2"><Icon name="clock" size={15} /> {durationLabel}</div>
                                                    <div className="flex items-center gap-2"><Icon name="map" size={15} /> {serviceLocationLabel}</div>
                                                    <div className="flex items-center gap-2"><Icon name="calendar" size={15} /> {displaySlotTime(time)}, {fullDate(date)}</div>
                                                    <div className="flex items-center gap-2"><Icon name="calendar" size={15} /> {timezoneLabel}</div>
                                                </div>
                                            </aside>
                                            <div className="space-y-5 lg:pl-8">
                                                <div className="flex items-center gap-3">
                                                    <button type="button" onClick={() => setStep(2)} className="grid size-9 place-items-center rounded-full border border-bphq-chrome bg-white text-bphq-espresso" aria-label="Back to time"><Icon name="chevronLeft" size={16} /></button>
                                                    <div>
                                                        <h3 className="font-display text-lg font-semibold text-bphq-espresso">Enter Details</h3>
                                                        <p className="mt-0.5 text-xs font-semibold leading-5 text-bphq-coffee/70">Name, email and phone number are required.</p>
                                                    </div>
                                                </div>
                                                <div className="lg:hidden">
                                                    <h2 className="font-display text-2xl font-semibold leading-tight text-bphq-espresso">{selectedService?.name ?? 'Service'}</h2>
                                                    {selectedServicePrice && <p className="mt-2 text-lg font-black text-bphq-coffee">{selectedServicePrice}</p>}
                                                    <div className="mt-3 grid gap-2 text-sm font-medium text-bphq-coffee">
                                                        <div className="flex items-center gap-2"><Icon name="clock" size={15} /> {durationLabel}</div>
                                                        <div className="flex items-center gap-2"><Icon name="calendar" size={15} /> {displaySlotTime(time)}, {fullDate(date)}</div>
                                                        <div className="flex items-center gap-2"><Icon name="calendar" size={15} /> {timezoneLabel}</div>
                                                    </div>
                                                </div>
                                                <div className="grid gap-4 sm:grid-cols-2">
                                                    <FormField label="Name" value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" required />
                                                    <FormField label="Email" type="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" required />
                                                    <div className="sm:col-span-2">
                                                        <CountryPhoneField value={customer.phone} onChange={(phone) => setCustomer((current) => ({ ...current, phone }))} />
                                                    </div>
                                                    {user?.role !== 'customer' && (
                                                        <div className="sm:col-span-2">
                                                            <label className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-[#F7F3ED] p-4 text-sm font-semibold text-[#2A1D14]">
                                                                <input
                                                                    checked={customer.create_account}
                                                                    className="mt-1 size-4 accent-[#3A2A1F]"
                                                                    onChange={(event) => setCustomer((current) => ({ ...current, create_account: event.target.checked, password: event.target.checked ? current.password : '', password_confirmation: event.target.checked ? current.password_confirmation : '' }))}
                                                                    type="checkbox"
                                                                />
                                                                <span>
                                                                    <span className="block">Create a customer account</span>
                                                                    <span className="mt-1 block text-xs font-medium leading-5 text-stone-500">Use this email and password to track bookings and payments later.</span>
                                                                </span>
                                                            </label>
                                                            {customer.create_account && (
                                                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                                    <FormField
                                                                        label="Password"
                                                                        type="password"
                                                                        value={customer.password}
                                                                        onChange={(event) => setCustomer((current) => ({ ...current, password: event.target.value }))}
                                                                        placeholder="Minimum 8 characters"
                                                                        required
                                                                    />
                                                                    <FormField
                                                                        label="Confirm password"
                                                                        type="password"
                                                                        value={customer.password_confirmation}
                                                                        onChange={(event) => setCustomer((current) => ({ ...current, password_confirmation: event.target.value }))}
                                                                        placeholder="Repeat password"
                                                                        required
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {referralRewardsAvailable && <FormField label="Referral code (optional)" value={referralCode} onChange={(event) => setReferralCode(event.target.value.toUpperCase())} maxLength={60} placeholder="BPHQ-..." />}
                                                {bookingFields.map((field, index) => (
                                                    <CustomBookingField field={field} key={`${field.label}-${index}`} value={customAnswers[index] ?? ''} onChange={(value) => setCustomAnswers((current) => ({ ...current, [index]: value }))} />
                                                ))}
                                                <FormField as="textarea" label="Note (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Share any extra details..." />
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {step === 4 && (
                                    <section className="mx-auto max-w-2xl">
                                        <h3 className="font-display text-2xl font-normal text-[#2A1D14]">Review and payment</h3>
                                        <div className="mt-5 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-[#FFFFFF] p-4 text-sm">
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Service</span><span className="font-semibold text-[#2A1D14]">{selectedService?.name}</span></div>
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Date</span><span className="font-semibold text-[#2A1D14]">{fullDate(date)}</span></div>
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Time</span><span className="font-semibold text-[#2A1D14]">{displaySlotTime(time)}</span></div>
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Customer</span><span className="font-semibold text-[#2A1D14]">{customer.name}</span></div>
                                            <div className="flex justify-between gap-4 py-3"><span className="text-stone-500">Amount</span><span className="font-semibold text-[#3A2A1F]">{currency(selectedService?.price, selectedService?.currency ?? 'NGN')}</span></div>
                                        </div>
                                        {!!manualBooking && (
                                            <div className="mt-5 rounded-2xl border border-bphq-chrome bg-bphq-ivory p-4 text-sm leading-6 text-bphq-coffee">
                                                <p className="font-bold text-bphq-espresso">Manual payment selected</p>
                                                <p className="mt-1">Send payment using the provider account details below. The provider will confirm payment and accept your booking from their backend.</p>
                                                {manualBooking?.manual_payment?.account_name && <p className="mt-3"><span className="font-bold">Account name:</span> {manualBooking.manual_payment.account_name}</p>}
                                                {manualBooking?.manual_payment?.account_reference && <p><span className="font-bold">Account details:</span> {manualBooking.manual_payment.account_reference}</p>}
                                                {manualBooking?.manual_payment?.instructions && <p className="mt-2 whitespace-pre-line">{manualBooking.manual_payment.instructions}</p>}
                                            </div>
                                        )}
                                        {!checkoutUrl && !manualBooking ? (
                                            <>
                                                <div className="mt-5 space-y-3">
                                                    <p className="text-sm font-bold text-[#2A1D14]">Payment method</p>
                                                    {paymentMethods.map((method) => (
                                                        <label className={`flex items-start gap-3 rounded-2xl border p-4 text-sm transition ${paymentMethod === method.gateway ? 'border-[#2A1D14] bg-[#F7F3ED]' : 'border-stone-200 bg-white'}`} key={method.gateway}>
                                                            <input
                                                                checked={paymentMethod === method.gateway}
                                                                className="mt-1 size-4 accent-[#3A2A1F]"
                                                                onChange={() => setPaymentMethod(method.gateway)}
                                                                type="radio"
                                                            />
                                                            <span>
                                                                <span className="block font-bold text-[#2A1D14]">{method.label ?? method.gateway}</span>
                                                                <span className="mt-1 block text-xs leading-5 text-stone-500">
                                                                    {method.gateway === 'manual' ? 'Transfer or pay manually. Provider confirms payment before accepting.' : 'Pay securely online. Booking confirms automatically after successful payment.'}
                                                                </span>
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                                {!paymentMethods.length && <p className="mt-5 rounded-2xl border border-dashed border-stone-200 p-4 text-sm text-stone-500">This provider has not connected a payment method yet.</p>}
                                            </>
                                        ) : null}
                                        {!checkoutUrl && !manualBooking ? (
                                            <Button type="button" className="mt-6 w-full rounded-full bg-[#2A1D14] hover:bg-[#2A1D14]" disabled={submitting || (!redeemLoyalty && !selectedPaymentMethod)} onClick={createBookingAndCheckout}>
                                                {submitting ? 'Preparing...' : selectedPaymentMethod?.gateway === 'manual' ? 'Continue' : 'Pay now'} <Icon name="arrow" size={16} />
                                            </Button>
                                        ) : checkoutUrl ? (
                                            <a className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#2A1D14] px-5 text-sm font-semibold text-white transition hover:bg-[#2A1D14]" href={checkoutUrl}>
                                                Pay securely now <Icon name="arrow" size={16} />
                                            </a>
                                        ) : null}
                                        <p className="mt-3 text-center text-xs leading-5 text-stone-500">{selectedPaymentMethod?.gateway === 'manual' ? 'Manual bookings are accepted after provider payment confirmation.' : 'After successful payment, the gateway returns to the booking confirmation page.'}</p>
                                    </section>
                                )}

                                <div className={`${standalone ? `${step === 1 ? 'hidden lg:flex' : 'flex'} fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(.85rem,env(safe-area-inset-bottom))] pt-3 lg:static lg:px-0 lg:pb-0` : 'sticky bottom-0 -mx-4 flex px-4 py-3 sm:mx-0 sm:px-0'} mt-auto flex-row items-center justify-between gap-2 border-t border-stone-200 bg-white/95 backdrop-blur`}>
                                    <Button variant="ghost" onClick={step === 1 ? onClose : () => setStep((current) => Math.max(1, current - 1))}>{step === 1 ? 'Cancel' : 'Back'}</Button>
                                    {step < 4 && <Button type="button" onClick={nextStep} className="rounded-full bg-[#2A1D14] hover:bg-[#2A1D14]">Continue <Icon name="arrow" size={16} /></Button>}
                                </div>
                            </main>
                        </div>
                    </div>
                )}
            </section>
    );

    if (standalone) {
        return content;
    }

    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#2A1D14]/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            {content}
        </div>
    );
}
