# BeautyPro HQ (BPHQ)

BeautyPro HQ is a Laravel 13 + React single-page application for beauty professionals, customers, and platform administrators. It includes a public professional directory, availability-aware booking, verification, role-specific dashboards, CRM and loyalty tools, content management, opportunities, notifications, and payment-provider connection scaffolding.

## Stack

- Laravel 13 REST API, Laravel Sanctum, MySQL 8+
- React 19, React Router, Axios, Vite 7
- Tailwind CSS 4
- PHPUnit feature tests and seeded demo data

## Local setup

Requirements: PHP 8.3+, Composer, Node 20+, npm, and MySQL 8+.

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
```

Create a MySQL database named `beautyprohq`, then update the `DB_*` values in `.env` and run:

```bash
php artisan migrate:fresh --seed
php artisan storage:link
```

Start the application in two terminals:

```bash
php artisan serve
npm run dev
```

Open `http://127.0.0.1:8000`. The React router owns all browser navigation; API routes live under `/api`.

For a production bundle:

```bash
npm run build
php artisan optimize
```

## Demo accounts

All seeded accounts use the password `password`.

| Role | Email | Notes |
| --- | --- | --- |
| Admin | `admin@beautyprohq.test` | Full administration console |
| Provider | `amara@beautyprohq.test` | Verified; CRM and loyalty enabled |
| Provider | `ifeoma@beautyprohq.test` | Pending verification request |
| Customer | `ada@beautyprohq.test` | Bookings, rewards, and saved providers |

Additional seeded provider and customer accounts are listed in `database/seeders/DatabaseSeeder.php`.

## Main modules

- Public homepage, directory filters, provider profiles, reviews, availability, bookings, newsletter, news/events, community, and opportunity enquiries
- Authentication: provider/customer registration, login/logout, password reset, and signed email verification
- Provider workspace: profile/services, bookings, availability and blocked dates, verified-only CRM/loyalty, payments, digital products, and analytics
- Customer portal: booking management, rewards, saved providers, reminders, and notifications
- Admin console: users, directory listings, verification, content, opportunities/enquiries, announcements, and subscriptions
- Payment-account schema for Paystack, Stripe, and PayPal; provider funds are represented against each provider account and booking

## Testing

Automated tests use an in-memory SQLite database, separate from local MySQL data.

```bash
php artisan test
npm run build
```

Mail is logged locally by default. Configure a real mail transport in `.env` for reset, verification, and booking emails. Payment gateway credentials and production webhooks are intentionally environment-specific and are not committed.
