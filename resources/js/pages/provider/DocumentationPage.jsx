import { Card, PageHeader } from '../../components/dashboard';

const sections = [
    ['Provider dashboard overview', [
        'Your dashboard manages your public profile, subscription, services, bookings, availability, payments, CRM, loyalty rewards, digital products, content planning, analytics and settings.',
        'Customers find you from the public directory, homepage sections, search, categories and your profile detail page.',
        'Your profile should be complete before you promote your link. Missing photos, services, availability or payment details can reduce bookings.',
    ]],
    ['Onboarding', [
        'Complete all onboarding questions before using the full dashboard.',
        'Onboarding answers help build your profile and determine how customers understand your business.',
        'After onboarding, review Profile and update any details that need more polish.',
        'If the dashboard keeps returning you to onboarding, a required onboarding field may still be missing.',
    ]],
    ['Profile setup', [
        'Use Profile to update your name/business details, profession, category, country, bio, profile photo, social links, portfolio links, website and public profile button.',
        'Your public cards only show compact data. The full detail page can show longer information.',
        'Keep the profile button linked to your website if available. Digital products have their own profile section.',
        'Use a strong profile photo and real portfolio work because these affect customer trust.',
    ]],
    ['Services', [
        'Create each service with a clear name, category, price, duration, description and active state.',
        'Customers can only book active services attached to your provider profile.',
        'Keep service descriptions practical: what is included, expected duration, preparation and limits.',
        'If a service should not appear publicly, deactivate it instead of deleting it.',
    ]],
    ['Availability and calendar', [
        'Set weekly availability for the days and times you accept bookings.',
        'Use blocked dates for holidays, unavailable days or partial-day blocks.',
        'The booking system checks service duration, availability and blocked dates before accepting requests.',
        'If a customer cannot select a time, confirm the service duration fits inside your available window.',
    ]],
    ['Bookings', [
        'New bookings arrive as pending requests with customer details, service, date, time, notes and custom answers.',
        'Open booking details before accepting or rejecting so you understand what the customer requested.',
        'Update booking status as the job progresses. Customers receive booking status notifications.',
        'If payment is required, customers can pay through your connected gateway where available.',
    ]],
    ['Custom booking form fields', [
        'You can add extra questions customers answer during booking.',
        'Good questions include style preference, event type, allergies, location notes, reference links, preferred contact method and timing instructions.',
        'Use required fields only for information you truly need before accepting the booking.',
        'Too many questions can reduce completed bookings, so keep the form focused.',
    ]],
    ['Payments and gateways', [
        'Your payment gateway settings belong only to your provider account.',
        'Connect Paystack, Stripe or PayPal where supported, then choose your default gateway in Settings.',
        'Customer booking payments should always go through your connected account, not another provider account and not the admin account.',
        'If payment fails, check your public key/client ID, secret key, account reference, enabled state and default gateway.',
    ]],
    ['Subscription and plan access', [
        'Free accounts have limited access. Paid/pro accounts unlock full business features.',
        'Use Subscription to view your active plan, available plans and payment history.',
        'If a paid feature is hidden, check whether your subscription is active and paid.',
        'Plan payments are paid to the platform and are separate from customer booking payments.',
    ]],
    ['CRM', [
        'CRM stores customers who have booked with you and helps you manage follow-up.',
        'Use notes, tags, stage, priority, support status and next follow-up date to organize customer relationships.',
        'Review customer booking history before repeat appointments.',
        'Do not store sensitive payment card data or unnecessary private information.',
    ]],
    ['Loyalty rewards', [
        'You can enable or disable loyalty rewards.',
        'When enabled, set points earned per booking and points required before a customer can request a service using points.',
        'Use clear reward rules customers can understand.',
        'You can manually adjust customer loyalty points where necessary and should include a reason.',
    ]],
    ['Digital products', [
        'Digital products are available only for paid providers.',
        'Only products you add should show on your public profile.',
        'Add name, description, price, URL, image and active state.',
        'Use digital products for guides, templates, e-books, courses, presets, consultation products or external shop products.',
    ]],
    ['Content calendar', [
        'Use Content calendar to plan posts, campaigns, reminders and marketing activities.',
        'Create content ideas ahead of launches, holidays, promotions and events.',
        'Use the calendar as a planning tool; it does not replace your social media account.',
    ]],
    ['Analytics', [
        'Analytics helps you review profile views, bookings, revenue and customer activity.',
        'Use analytics to decide which services, profile updates and promotions are working.',
        'If numbers look empty, confirm you have active bookings/views and that the selected date range includes activity.',
    ]],
    ['WhatsApp booking notifications', [
        'If admin enables WhatsApp notifications, you will see a Notifications tab in Settings.',
        'Add your WhatsApp number in international format, for example +2348012345678.',
        'Enable WhatsApp booking alerts if you want booking details sent to WhatsApp.',
        'If the tab is missing, the admin has not enabled the feature for providers.',
    ]],
    ['Verification', [
        'Submit verification using accurate professional/business details.',
        'Add portfolio, certification or supporting links/files where available.',
        'If rejected, read the admin note, correct the problem and resubmit.',
        'Approved verification displays the verification tag on your public profile/cards.',
    ]],
    ['Settings and security', [
        'Settings controls your default currency, default payment gateway, optional notifications and account security.',
        'Enable two-factor authentication to protect your account.',
        'Keep your email and phone accurate because notifications, bookings and account recovery depend on them.',
        'Do not share secret gateway keys with customers or other providers.',
    ]],
    ['Troubleshooting', [
        'Cannot access dashboard: check login email, password, two-factor code, account status and subscription.',
        'Bookings not showing: confirm services are active, availability is set and your profile is listed.',
        'Payments not working: confirm gateway credentials, default gateway and account enabled state.',
        'WhatsApp not working: confirm the tab is visible, your number is saved, alerts are enabled and admin has connected Twilio.',
        'Profile data wrong on public site: update Profile, then refresh the public page and clear browser cache if needed.',
    ]],
];

function DocumentationAccordion({ title, items, defaultOpen = false }) {
    return (
        <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" open={defaultOpen}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black text-slate-950">
                <span>{title}</span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-lg text-slate-500 transition group-open:rotate-45">+</span>
            </summary>
            <ul className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-600">
                {items.map((item) => (
                    <li className="flex gap-3" key={item}>
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fuchsia-600" />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </details>
    );
}

export default function ProviderDocumentationPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                description="A complete provider manual for setting up your account, receiving bookings and managing your beauty business."
                eyebrow="Documentation"
                title="Provider documentation"
            />

            <Card className="space-y-3">
                {sections.map((section, index) => (
                    <DocumentationAccordion defaultOpen={index === 0} items={section[1]} key={section[0]} title={section[0]} />
                ))}
            </Card>
        </div>
    );
}
