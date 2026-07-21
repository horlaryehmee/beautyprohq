import { Card, PageHeader } from '../../components/dashboard';

const sections = [
    ['System overview', [
        'BeautyPro HQ has three main account types: admin, provider and customer. Admin manages the platform; providers sell and manage services; customers discover providers, book services and receive updates.',
        'The public website pulls data from providers, content, opportunities, community posts, reviews, events and homepage selections. The dashboards control the data shown publicly.',
        'Core flow: provider registers, completes onboarding, selects a plan, sets profile/services/availability/payments, then customers can book from the public profile.',
    ]],
    ['First setup after deployment', [
        'Run database migrations on the live server after every update that adds tables or columns.',
        'Open Admin Settings and configure SMTP so verification emails, password resets, two-factor codes, booking emails, onboarding emails and admin alerts can send.',
        'Configure subscription gateways for provider plan payments. These are platform payments, not provider booking payouts.',
        'Configure currency rates if users can switch currencies on the frontend.',
        'Configure Twilio WhatsApp if WhatsApp booking alerts will be offered to providers, then enable the provider WhatsApp feature.',
        'Review subscription plans, provider categories, homepage content, sample news/events/opportunities and admin security.',
    ]],
    ['Users and account control', [
        'Use Users to search, inspect and update admin, provider and customer accounts.',
        'Check role, active status, email verification, two-factor status, profile data, bookings and subscriptions when troubleshooting login or dashboard access.',
        'Admins can adjust customer information where needed, especially booking contact details and account status.',
        'Avoid changing a user role unless it is intentional because dashboard access and permissions depend on role.',
    ]],
    ['Directory management', [
        'Directory should contain Directory list, Provider categories and Pro of the week areas.',
        'Directory list is for managing provider visibility and profile readiness. Use list and pagination for easier backend review.',
        'Provider categories control public filtering and provider classification.',
        'Pro of the week should be manually selected from real provider users. The frontend card uses provider photo, name, profession, country, verification state and profile link.',
        'Only list providers whose public data is acceptable. Hide incomplete or inactive providers.',
    ]],
    ['Provider verification', [
        'Providers submit verification details from their dashboard.',
        'Admin reviews submitted identity/business details, portfolio, certificates and supporting links.',
        'Approval updates the provider verification tag across the website.',
        'Rejection should include a useful admin note so the provider knows what to fix.',
    ]],
    ['Content management', [
        'News, events and community posts are managed from Content.',
        'Each content item should have a clear title, short excerpt, featured image where needed and detailed body.',
        'Use the editor formatting tools for headings, paragraphs, lists, quotes and links. Card descriptions should remain short because mobile cards need fixed responsive heights.',
        'If content is missing on live, confirm the item exists on the live database, is published/active, migrations have run and the latest build is deployed.',
    ]],
    ['Opportunities management', [
        'Opportunities should have a short description for cards and one full rich-text/plain content body for detailed information.',
        'The full detail can include overview, requirements, responsibilities, benefits, location, deadline, application process and contact notes.',
        'Opportunity frontend cards should show the correct type tag selected from backend.',
        'Users apply or enquire through the opportunity enquiry process, not a generic get-in-touch button.',
        'Admins review opportunity enquiries from the backend and update their status.',
    ]],
    ['Announcements and notifications', [
        'Announcements are used to broadcast updates to selected audiences.',
        'Platform notifications can appear in-app and by email depending on the notification type.',
        'Important events that should notify users include registration, onboarding, verification decision, booking creation/status, payment updates, announcements, opportunity enquiries and security updates.',
    ]],
    ['Subscription plans and platform payments', [
        'Subscription plans control provider access to paid tools.',
        'Admin Paystack/Stripe settings are only for provider plan payments to the platform.',
        'Provider booking payments are separate and must use the individual provider gateway setup.',
        'When a provider payment fails, check active gateway, mode, public/secret keys, plan price/currency and payment logs.',
    ]],
    ['Provider booking payments', [
        'Providers connect their own Paystack, Stripe or PayPal credentials in their dashboard.',
        'A booking payment must always be tied to the booking provider ID, provider payment account ID, amount, currency and gateway reference.',
        'Never use admin subscription payment credentials for provider booking payouts.',
        'If checkout fails, review provider gateway credentials, default gateway, account enabled state and payment status.',
    ]],
    ['SMTP email setup', [
        'Admin can connect SMTP from Settings.',
        'Required fields are enabled state, host, port, from email and usually username/password.',
        'Use TLS/587 for most SMTP providers and SSL/465 where required.',
        'Password is encrypted. Leaving the password field blank keeps the saved password.',
        'When SMTP is enabled, platform emails use admin-saved SMTP settings first, with environment settings as fallback.',
    ]],
    ['Twilio WhatsApp setup', [
        'Admin can connect Twilio WhatsApp from Settings using Account SID, Auth Token and WhatsApp sender number.',
        'Use Twilio sandbox for testing. Production requires an approved Twilio WhatsApp sender.',
        'After credentials are saved, enable provider WhatsApp notifications in Provider features.',
        'Providers only see the WhatsApp notification section when admin enables the feature.',
        'Booking WhatsApp messages are sent only when admin feature is enabled and provider has enabled alerts with a WhatsApp number.',
    ]],
    ['Currency settings', [
        'Currency settings control the rates used when users switch display currency on the frontend.',
        'Rates should be maintained by admin based on the platform’s preferred conversion model.',
        'Provider service prices remain stored in their selected/default currency; frontend display can convert using saved rates.',
    ]],
    ['Security settings', [
        'Security settings include password management and two-factor authentication.',
        'Admins should enable two-factor authentication for their own accounts.',
        'If a user is redirected after login, check token/session state, two-factor challenge, role route, account status and browser cache.',
        'Do not expose admin SMTP, Twilio or subscription gateway secrets to providers.',
    ]],
    ['Live deployment troubleshooting', [
        'Blank page: check browser console, Vite manifest, public/build assets, cached old JS and Laravel logs.',
        '404 LiteSpeed page: confirm domain document root points to Laravel public folder and rewrite rules are active.',
        'Missing build/manifest: run npm install/build locally or in CI and deploy public/build.',
        'Missing table/column SQL errors: run php artisan migrate --force on live.',
        'Cache issues: run php artisan optimize:clear after config, route, view or deployment changes.',
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

export default function AdminDocumentationPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                description="A complete admin manual for operating, configuring and troubleshooting BeautyPro HQ."
                eyebrow="Documentation"
                title="Admin documentation"
            />

            <Card className="space-y-3">
                {sections.map((section, index) => (
                    <DocumentationAccordion defaultOpen={index === 0} items={section[1]} key={section[0]} title={section[0]} />
                ))}
            </Card>
        </div>
    );
}
