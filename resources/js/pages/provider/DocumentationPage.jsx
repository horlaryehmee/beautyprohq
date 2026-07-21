import { Card, CardHeader, PageHeader, StatusBadge } from '../../components/dashboard';

const sections = [
    {
        title: 'How your provider account works',
        items: [
            'Your dashboard is where you set up your public profile, services, availability, bookings, payments, customers, loyalty rewards, digital products, content planning, analytics and account settings.',
            'Customers discover you from the public directory, homepage sections, profile cards and your profile detail page.',
            'A complete profile performs better. Add your profession, country, bio, profile photo, portfolio, services, availability, payment settings and booking questions before sharing your profile.',
        ],
    },
    {
        title: 'Onboarding and profile setup',
        items: [
            'Complete every onboarding step before depending on the dashboard. These answers populate your provider profile and help customers understand your service.',
            'Use Profile to update your business name, profession, category, country, bio, portfolio links, social links, profile button, website and other public details.',
            'Keep your bio realistic. Long text can be used on the detail page, but cards will only show a short preview for clean mobile display.',
            'Only your country is shown on profile cards. Full location details can be kept in your profile where needed.',
        ],
    },
    {
        title: 'Services and availability',
        items: [
            'Create services with clear names, pricing, duration, category and service type. Customers can only book active services.',
            'Set availability by day and time. The booking system checks your availability before accepting a booking request.',
            'Use blocked dates to stop bookings on days or time ranges when you are unavailable.',
            'If customers cannot book a slot, check whether the service is active, the date is not blocked and the time fits within your availability.',
        ],
    },
    {
        title: 'Bookings',
        items: [
            'Bookings start as pending requests. Review the customer details, service, date, time, notes and custom booking answers before accepting.',
            'You can update booking status from the Bookings page. Customers receive notifications when important booking updates happen.',
            'If payment is required, customers can complete payment through your connected provider payment gateway.',
            'Use booking details to prepare for the service and keep customer communication professional.',
        ],
    },
    {
        title: 'Custom booking questions',
        items: [
            'Use booking form fields to ask customers for extra information before a booking is submitted.',
            'Good examples include preferred style, skin concerns, event location, reference photo link, allergies, arrival instructions or preferred contact method.',
            'Only ask for what you truly need. Too many questions can reduce booking completion.',
            'Required fields must be answered before customers can submit the booking.',
        ],
    },
    {
        title: 'Payments',
        items: [
            'Payment settings are unique to your provider account. Payments for your bookings must go only through the gateway account you connected.',
            'Connect Paystack, Stripe or PayPal where available, then choose your default gateway in Settings.',
            'Your connected gateway is separate from the admin plan-payment gateway. Admin plan payments do not control where your customer booking payments go.',
            'Keep public keys, secret keys and account references accurate. Wrong credentials will stop checkout or verification.',
        ],
    },
    {
        title: 'Subscription',
        items: [
            'The free tier has limited access. Paid/pro access unlocks the full business tools such as bookings, services, payments, CRM, loyalty, analytics and digital products.',
            'Use Subscription to view your current plan, available plans and recent plan payment records.',
            'If a paid feature is hidden, confirm that your paid subscription is active.',
        ],
    },
    {
        title: 'CRM and customer records',
        items: [
            'CRM helps you manage customers who have booked with you. You can review booking history, notes, tags, stage, priority and follow-up information.',
            'Use notes to remember preferences, allergies, birthdays, repeat service choices and follow-up tasks.',
            'Do not store sensitive payment card data or private information that is not needed for your service.',
        ],
    },
    {
        title: 'Loyalty rewards',
        items: [
            'You can enable or disable loyalty rewards from the Loyalty page.',
            'When enabled, set how many points customers earn per booking and how many points are required before they can request a service using points.',
            'Keep reward rules simple so customers understand how to earn and redeem.',
            'You can adjust customer points manually where necessary, but use clear reasons for your records.',
        ],
    },
    {
        title: 'Digital products',
        items: [
            'Digital products are available only for paid providers.',
            'Each provider manages their own digital products. Your profile should show only the products you added.',
            'Add product name, description, price, product URL and optional image. Only active products should appear publicly.',
            'Use this for guides, templates, online classes, consultation products, presets, e-books or external shop items.',
        ],
    },
    {
        title: 'WhatsApp booking notifications',
        items: [
            'If the admin enables WhatsApp booking notifications for providers, you will see a Notifications tab in Settings.',
            'Add your WhatsApp contact in international format, for example +2348012345678, then enable WhatsApp booking notifications.',
            'When a customer books you, the system can send booking details to your WhatsApp contact.',
            'If the Notifications tab is not visible, the admin has not enabled the feature for providers.',
        ],
    },
    {
        title: 'Verification',
        items: [
            'Submit verification from the Verification area using accurate business and professional information.',
            'Add portfolio, certification or supporting links/files where available.',
            'If rejected, review the admin note, correct the issue and resubmit.',
            'Approved verification updates the verification tag shown on your public profile and cards.',
        ],
    },
    {
        title: 'Content calendar and analytics',
        items: [
            'Use the content calendar to plan marketing posts, campaigns, reminders and business content.',
            'Analytics helps you understand profile views, bookings, revenue and customer activity.',
            'Review analytics regularly and update your services, profile and portfolio based on what customers engage with.',
        ],
    },
    {
        title: 'Troubleshooting',
        items: [
            'If you cannot access a section, check that your subscription is active and that your account has completed onboarding.',
            'If bookings are not coming through, confirm services are active, availability is set and your public profile is listed.',
            'If payment checkout fails, review your connected gateway credentials and default payment gateway.',
            'If emails or WhatsApp alerts do not arrive, check your contact details and ask the admin to confirm platform notification settings.',
        ],
    },
];

export default function ProviderDocumentationPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                description="A complete provider guide for setting up your profile, managing bookings and using the business tools."
                eyebrow="Documentation"
                title="Provider documentation"
            />

            <Card>
                <CardHeader
                    action={<StatusBadge status="provider guide" />}
                    description="Use this order when preparing your account for customers."
                    title="Recommended provider workflow"
                />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {['Complete onboarding', 'Build profile', 'Add services', 'Set availability', 'Connect payments'].map((step, index) => (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4" key={step}>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</p>
                            <p className="mt-2 font-black text-slate-950">{step}</p>
                        </div>
                    ))}
                </div>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
                {sections.map((section) => (
                    <Card key={section.title}>
                        <CardHeader title={section.title} />
                        <ul className="space-y-3 text-sm leading-6 text-slate-600">
                            {section.items.map((item) => (
                                <li className="flex gap-3" key={item}>
                                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fuchsia-600" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                ))}
            </div>
        </div>
    );
}
