import { Card, PageHeader } from '../../components/dashboard';

const sections = [
    ['Provider dashboard overview', [
        'The provider dashboard manages public profile data, subscription state, services, bookings, availability, payments, CRM, loyalty rewards, digital products, content planning, analytics and settings.',
        'Customers discover providers from the public directory, homepage sections, search, categories and provider profile detail pages.',
        'A complete provider profile requires profile media, profession, country, services, availability, payment setup and accurate contact/profile information.',
    ]],
    ['Onboarding', [
        'The onboarding flow collects required profile and business information before the full provider workspace is used.',
        'Onboarding answers populate provider profile fields and improve how customers understand the business.',
        'After onboarding, review Profile and update any details that need more polish.',
        'If the dashboard redirects back to onboarding, a required onboarding field or completion marker may still be missing.',
    ]],
    ['Profile setup', [
        'Profile updates name/business details, profession, category, country, bio, profile photo, social links, portfolio links, website and public profile button.',
        'Public provider cards show compact data. The full detail page can show longer information.',
        'The profile button should point to the provider website when available. Digital products are displayed through their own profile section.',
        'Use a strong profile photo and real portfolio work because these affect customer trust.',
    ]],
    ['Services', [
        'Create each service with a clear name, category, price, duration, description and active state.',
        'Customers can only book active services attached to the provider profile.',
        'Keep service descriptions practical: what is included, expected duration, preparation and limits.',
        'If a service should not appear publicly, deactivate it instead of deleting it.',
    ]],
    ['Availability and calendar', [
        'Weekly availability defines the days and times available for customer bookings.',
        'Use blocked dates for holidays, unavailable days or partial-day blocks.',
        'The booking system checks service duration, availability and blocked dates before accepting requests.',
        'If customers cannot select a time, the service duration, availability window and blocked dates should be reviewed.',
    ]],
    ['Bookings', [
        'New bookings arrive as pending requests with customer details, service, date, time, notes and custom answers.',
        'Booking details should be reviewed before accepting or rejecting so customer request data is visible.',
        'Update booking status as the job progresses. Customers receive booking status notifications.',
        'If payment is required, customers pay through the provider-connected gateway where available.',
    ]],
    ['Custom booking form fields', [
        'Providers can add extra questions customers answer during booking.',
        'Good questions include style preference, event type, allergies, location notes, reference links, preferred contact method and timing instructions.',
        'Required fields should be reserved for information needed before the booking can be reviewed.',
        'Too many questions can reduce completed bookings, so keep the form focused.',
    ]],
    ['Payments and gateways', [
        'Payment gateway settings are scoped to the provider account.',
        'Paystack, Stripe or PayPal can be connected where supported, then selected as the default gateway in Settings.',
        'Customer booking payments are routed through the connected account for the booking provider.',
        'If payment fails, public key/client ID, secret key, account reference, enabled state and default gateway should be checked.',
    ]],
    ['Subscription and plan access', [
        'Free accounts have limited access. Paid/pro accounts unlock full business features.',
        'Subscription displays active plan, available plans and provider plan payment history.',
        'If a paid feature is hidden, subscription status and plan access should be checked.',
        'Plan payments are paid to the platform and are separate from customer booking payments.',
    ]],
    ['CRM', [
        'CRM stores customers who have booked with the provider and supports follow-up management.',
        'Use notes, tags, stage, priority, support status and next follow-up date to organize customer relationships.',
        'Review customer booking history before repeat appointments.',
        'CRM notes should be limited to service-relevant customer information.',
    ]],
    ['Loyalty rewards', [
        'Providers can enable or disable loyalty rewards.',
        'When enabled, set points earned per booking and points required before a customer can request a service using points.',
        'Use clear reward rules customers can understand.',
        'Customer loyalty points can be adjusted manually where necessary, with a reason stored for record keeping.',
    ]],
    ['Digital products', [
        'Digital products are available only for paid providers.',
        'Only products added by the provider should show on that provider public profile.',
        'Add name, description, price, URL, image and active state.',
        'Use digital products for guides, templates, e-books, courses, presets, consultation products or external shop products.',
    ]],
    ['Content calendar', [
        'Use Content calendar to plan posts, campaigns, reminders and marketing activities.',
        'Create content ideas ahead of launches, holidays, promotions and events.',
        'The calendar is a planning tool for content activity; it does not publish directly to social platforms.',
    ]],
    ['Analytics', [
        'Analytics shows profile views, bookings, revenue and customer activity.',
        'Use analytics to decide which services, profile updates and promotions are working.',
        'If analytics data is empty, confirm that bookings/views exist and that the selected date range includes activity.',
    ]],
    ['WhatsApp booking notifications', [
        'When admin enables WhatsApp notifications, a Notifications tab appears in provider Settings.',
        'The WhatsApp number should be saved in international format, for example +2348012345678.',
        'WhatsApp booking alerts must be enabled before booking details are sent to WhatsApp.',
        'If the tab is missing, the admin has not enabled the feature for providers.',
    ]],
    ['Verification', [
        'Submit verification using accurate professional/business details.',
        'Add portfolio, certification or supporting links/files where available.',
        'If rejected, read the admin note, correct the problem and resubmit.',
        'Approved verification displays the verification tag on public provider profiles and cards.',
    ]],
    ['Settings and security', [
        'Settings controls default currency, default payment gateway, optional notifications and account security.',
        'Two-factor authentication is available for account protection.',
        'Email and phone details are used for notifications, bookings and account recovery.',
        'Gateway secret keys are stored for provider payment processing and should be kept accurate.',
    ]],
    ['Troubleshooting', [
        'Cannot access dashboard: check login email, password, two-factor code, account status and subscription.',
        'Bookings not showing: confirm services are active, availability is set and the profile is listed.',
        'Payments not working: confirm gateway credentials, default gateway and account enabled state.',
        'WhatsApp not working: confirm the tab is visible, the number is saved, alerts are enabled and Twilio is connected by admin.',
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
                description="A complete provider manual for account setup, bookings, payments and business tools."
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
