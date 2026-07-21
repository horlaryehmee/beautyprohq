import { Card, CardHeader, PageHeader, StatusBadge } from '../../components/dashboard';

const sections = [
    {
        title: 'Admin role and platform flow',
        items: [
            'The admin controls users, provider directory visibility, verification, homepage content, opportunities, announcements, subscriptions, payment gateway settings, SMTP email, Twilio WhatsApp, security and platform feature access.',
            'A provider registers, completes onboarding, chooses a plan, pays if required, completes profile/service setup, then receives bookings from customers through the public profile.',
            'Customers can browse the public website, save providers, book services, pay for bookings where payment gateways are connected, earn/redeem loyalty points where enabled, and receive email/in-app notifications.',
        ],
    },
    {
        title: 'Initial setup checklist',
        items: [
            'Open Settings and configure SMTP first so account verification, password reset, booking, onboarding, payment and admin notification emails can be delivered.',
            'Configure subscription gateways under Settings. Paystack and Stripe settings are used for provider plan payments only.',
            'Configure currency rates under Settings so frontend currency switching uses your chosen exchange rates.',
            'Configure Twilio WhatsApp only if you want providers to receive WhatsApp booking alerts. After saving the Twilio keys, enable the provider WhatsApp feature from Provider features.',
            'Review subscription plans and confirm which plan is active, the price, billing period and included features.',
        ],
    },
    {
        title: 'Users and customer management',
        items: [
            'Use Users to search all admin, provider and customer accounts. Open a user record to review their profile, role, activity, bookings and related account information.',
            'Admins can edit customer information where needed. Keep email addresses accurate because login, password reset and booking updates depend on them.',
            'If a user cannot access the dashboard, check account status, role, email verification state, two-factor status and subscription status where applicable.',
        ],
    },
    {
        title: 'Directory management',
        items: [
            'Directory is split into Directory list, Provider categories and Pro of the week. Use Directory list for provider visibility, profile review and account adjustments.',
            'Provider categories control public filtering and provider classification. Keep category names short and clear.',
            'Use Pro of the week to select the provider featured on the homepage. The card uses the provider profile data, so ensure their photo, profession, country and summary are clean.',
            'Only list providers whose profiles are ready for public viewing. If a provider profile is incomplete, update it or ask the provider to complete missing fields.',
        ],
    },
    {
        title: 'Verification workflow',
        items: [
            'Providers submit verification details and supporting profile links/files from their dashboard.',
            'Use Verification to approve or reject submissions. Approval updates the provider verification state shown across profile cards and detail pages.',
            'Use admin notes when rejecting so the provider knows what to correct before resubmitting.',
        ],
    },
    {
        title: 'Content, news, events and community',
        items: [
            'Use Content to manage News, Events and Community posts. Each item should have a clear title, short excerpt and full body content.',
            'The backend editor is designed for formatted content. Use headings, paragraphs, lists, quotes and links to structure longer posts.',
            'Homepage cards should use concise short descriptions. Full explanations belong on detail pages so mobile cards stay responsive.',
            'If live content is missing, confirm the content is published/active, the database has been migrated and the live server has the latest deployed build.',
        ],
    },
    {
        title: 'Opportunities',
        items: [
            'Use Opportunities to create job leads, collaborations, grants, calls for stylists, beauty brand campaigns and other professional opportunities.',
            'Each opportunity should have a short description for cards and a detailed body for the detail page. Put requirements, responsibilities, deadlines, location, eligibility and application notes in the full details field.',
            'Customers/providers apply through the opportunity enquiry process, not a generic get-in-touch link. Review submissions from Opportunity enquiries.',
        ],
    },
    {
        title: 'Subscriptions and payments',
        items: [
            'Subscription settings control provider plan payments to the platform. These payments must remain separate from provider booking payments.',
            'Provider booking payments use the payment gateway credentials connected by each provider in their own dashboard. This keeps provider A payments tied to provider A only.',
            'When troubleshooting plan payment issues, check active subscription gateway, gateway keys, selected mode, callback/return URL and payment records.',
        ],
    },
    {
        title: 'SMTP email settings',
        items: [
            'Enable SMTP in Settings only after adding host, port, from email and the required login credentials.',
            'Use TLS with port 587 for most providers. Use SSL with port 465 if your mail provider requires it.',
            'Leave the password field blank when editing other SMTP fields if you want to keep the saved password.',
            'All major website emails use this connection when enabled: account verification, password reset, two-factor codes, booking updates, provider onboarding, subscription updates, announcements and admin alerts.',
        ],
    },
    {
        title: 'Twilio WhatsApp settings',
        items: [
            'Add Account SID, Auth Token and WhatsApp sender number from Twilio Settings. Use the sandbox sender for testing and an approved WhatsApp sender for production.',
            'After Twilio is connected, enable the provider WhatsApp notification feature in Provider features. Providers will then see the WhatsApp notification tab in their settings.',
            'Providers must add their own WhatsApp contact and enable alerts before booking notifications are sent to them.',
            'If the feature is off, providers do not see the section and no WhatsApp booking messages are sent.',
        ],
    },
    {
        title: 'Security and access',
        items: [
            'Use Settings > Security for account password and two-factor authentication.',
            'Two-factor authentication applies to platform users and helps protect admin, provider and customer accounts.',
            'Do not share admin payment, SMTP or Twilio credentials with providers. Providers only manage their own profile, booking, payment and notification settings.',
        ],
    },
    {
        title: 'Deployment and troubleshooting',
        items: [
            'After code updates on live hosting, run migrations, clear Laravel caches and ensure the latest public/build assets are deployed.',
            'If a page is blank, check browser console errors, Vite manifest, cached assets and Laravel logs.',
            'If database errors mention missing tables or columns, run php artisan migrate --force on the live server.',
            'If email or WhatsApp fails, check saved credentials, provider status, logs and whether the feature is enabled.',
        ],
    },
];

export default function AdminDocumentationPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                description="A practical operating guide for managing BeautyPro HQ from the admin dashboard."
                eyebrow="Documentation"
                title="Admin documentation"
            />

            <Card>
                <CardHeader
                    action={<StatusBadge status="admin guide" />}
                    description="Follow this order when setting up a fresh install or reviewing a live deployment."
                    title="Recommended admin workflow"
                />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {['Configure settings', 'Review plans', 'Prepare content', 'Manage users'].map((step, index) => (
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
