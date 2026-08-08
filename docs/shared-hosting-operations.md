# Shared Hosting Operations

This application is hardened for a single cPanel/shared-hosting account. Shared hosting cannot provide a real multi-server load balancer, but application state is kept out of local sessions, cache, and queues so it can move to multiple web nodes later.

## 1. Document Root

Point the domain document root to Laravel's `public` directory, never the repository root. For the current cPanel deployment this should be similar to:

```text
/home/bakhtech/beautyprohq.bakhtech.com.ng/public
```

Keep `.env`, `vendor`, `storage`, source files, and deployment backups outside the public document root. The included `public/.htaccess` blocks common sensitive files, applies security headers, compresses responses, and gives versioned Vite assets long-lived browser caching.

## 2. Production Environment

Start with `.env.production.example`, insert real credentials, and update every hostname. Required production choices are:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.example
TRUSTED_HOSTS=your-domain.example,www.your-domain.example
SANCTUM_STATEFUL_DOMAINS=your-domain.example,www.your-domain.example
CORS_ALLOWED_ORIGINS=https://your-domain.example,https://www.your-domain.example

SESSION_DRIVER=database
SESSION_ENCRYPT=true
SESSION_SECURE_COOKIE=true
CACHE_STORE=database
RATE_LIMITER_STORE=database
QUEUE_CONNECTION=database

MAIL_SCHEME=smtp
MAIL_PORT=587
MAIL_REQUIRE_TLS=true
```

Generate `APP_KEY` once with `php artisan key:generate`. Do not rotate it without a migration plan because encrypted settings, cookies, and other encrypted data depend on it.

Set `TRUSTED_PROXIES` only when the host or CDN provides exact proxy addresses or CIDR ranges. Never trust every proxy. If Cloudflare is enabled, configure its current published proxy ranges and force Full (strict) TLS.

Run this after changing `.env`:

```bash
php artisan optimize:clear
php artisan optimize
php artisan ops:check --production
```

The operational check intentionally fails on insecure settings, missing database tables, unwritable storage, absent frontend assets, missing required PHP extensions, or unavailable database/cache connectivity.

## 3. Deployment

The checked-in `.cpanel.yml` calls `scripts/cpanel-deploy.sh`. The script stages and validates the release, creates a backup, enables maintenance mode, installs production Composer dependencies, migrates the database, caches Laravel configuration/routes/views, restarts queue workers, runs the production check, and restores prior application files when deployment fails.

The host needs PHP 8.3 or newer with `curl`, `dom`, `fileinfo`, `gd`, `mbstring`, `openssl`, `pdo_mysql`, and `zip`, plus Composer, Git, `flock`, `rsync`, and `tar`. Build and commit Vite assets before deployment when Node.js is unavailable on the host.

Keep cPanel deployment backups outside the web root and retain off-host database backups. Test restoration periodically; a backup that has never been restored is unverified.

## 4. Cron and Queues

Add these cPanel cron entries. Replace the path and PHP binary with the values shown by the host:

```cron
* * * * * cd /home/bakhtech/beautyprohq.bakhtech.com.ng && /usr/local/bin/php artisan schedule:run >> /dev/null 2>&1
```

The scheduler runs a short, overlap-protected queue drain every minute, prunes expired password-reset and Sanctum records, removes old failed jobs, and clears expired database sessions/cache records. This avoids requiring Supervisor, which most shared hosts do not provide. Database jobs use `after_commit` so workers do not observe uncommitted records.

## 5. Error Tracking and Logging

Production logs rotate daily in `storage/logs` and retain seven days by default. Security events use a separate fourteen-day log. Every HTTP response includes `X-Request-ID`; the same ID is attached to logs so a user report can be traced without exposing a stack trace.

Set `LOG_LEVEL=warning` in production. For urgent alerts, configure `LOG_SLACK_WEBHOOK_URL`, set `LOG_SLACK_LEVEL=critical`, and change `LOG_STACK` to `daily,slack`. Never expose Laravel logs through the web server or return exception messages, file paths, stack traces, payment gateway payloads, secrets, or customer data to clients.

Monitor at least:

- `/up` from an external uptime service; it checks application, database, and cache health.
- HTTP 5xx and 429 counts in access logs.
- `storage/logs/laravel-*.log` and `security-*.log`.
- Failed jobs with `php artisan queue:failed`.
- Disk usage, database size, PHP worker saturation, and account CPU limits in cPanel.

Do not use `/api/status` as a public diagnostics dump. It intentionally returns only a generic state and request ID.

## 6. Security Controls

The application enforces trusted hosts, secure browser sessions, active-account checks, email verification for paid provider operations, CSRF-protected Sanctum cookies, a nonce-based Content Security Policy, HSTS on HTTPS, restrictive browser headers, sanitized published HTML, bounded uploads, generic production errors, and outbound HTTP timeouts.

Operational requirements:

- Redirect HTTP to HTTPS at the hosting/CDN layer and keep TLS certificates renewing automatically.
- Use unique database, SMTP, gateway, Twilio, and Mailchimp credentials; rotate any credential exposed in logs or tickets.
- Protect cPanel and registrar accounts with MFA.
- Give the MySQL user access only to this application database.
- Keep PHP and Composer packages patched; run `composer audit` and `npm audit --omit=dev` before releases.
- Keep writable permissions limited to `storage`, `bootstrap/cache`, and the configured local upload directory.
- Configure Mailchimp webhook signing; unsigned webhooks are rejected.
- Restrict upload MIME types and sizes at both Laravel and PHP (`upload_max_filesize` and `post_max_size`).

## 7. Rate Limits

Rate counters use the shared database cache so limits survive separate PHP workers. Current policies combine account, email, conversation, and IP identifiers:

| Surface | Main limit |
| --- | --- |
| General authenticated API | 240 requests/minute |
| General guest API | 90 requests/minute |
| Login | 5/email+IP and 20/IP per minute |
| Registration | 3/IP per 10 minutes and 10/hour |
| Password reset | 3/email+IP per 10 minutes and 12/IP/hour |
| Public forms | 6/IP per minute and 30/hour |
| Live chat | 30/conversation+actor per minute and 300/actor/hour |
| Payments | 10/actor per minute and 60/hour |
| Uploads | 10/actor per minute |
| Sensitive admin/account actions | 6/actor per minute |

Repeated 429 responses appear in the security log. Add CDN/WAF limits for obvious abusive traffic before it consumes a PHP worker, but keep application limits because CDN rules cannot enforce account- or conversation-aware quotas.

## 8. Caching and Performance

Public home and directory data use shared-cache stale-while-revalidate behavior. Public pages and SEO files emit browser/CDN cache headers. Authenticated responses and all writes are forced private/no-store. Vite filenames are content-hashed and cached immutably by Apache.

Use database cache on shared hosting unless the host supplies a private Redis service. Do not switch sessions, rate limits, or cache to local files for production: PHP workers and future nodes would disagree. Run `php artisan optimize` after deployment and clear/rebuild it after any environment change.

Avoid full cache clears during ordinary content updates. Version or forget only affected keys. Track slow-request warnings and add indexes only from measured query patterns; the operational migration includes high-use booking, payment, subscription, and queue indexes.

## 9. Scaling Path

Within shared hosting, scale by enabling LiteSpeed/Cloudflare caching for public GET responses, optimizing images, keeping queue work off web requests, reducing third-party latency, and upgrading account CPU/RAM/PHP-worker limits. A CDN is not an application load balancer, but it reduces traffic reaching the origin.

When one account is no longer sufficient, move in this order:

1. Managed MySQL and Redis reachable by all nodes.
2. Object storage for uploads by setting `UPLOAD_DISK` to an S3-compatible disk.
3. Dedicated queue workers with Supervisor or a managed worker service.
4. Two or more stateless web nodes behind a managed load balancer.
5. Centralized logs/error tracking and database read replicas only when measurements justify them.

Before adding a second web node, verify that sessions, cache, rate limits, queues, uploads, and scheduled tasks are shared. Run the scheduler on exactly one node and use a central lock-capable cache.

## 10. Incident Checklist

1. Capture the request ID, timestamp, account, route, and user-visible error without collecting passwords or payment data.
2. Check uptime, PHP/account resource limits, database connectivity, disk space, relevant application/security logs, and failed jobs.
3. Put the application in maintenance mode if writes could corrupt data.
4. Rotate exposed credentials and invalidate affected sessions/tokens.
5. Roll back the application only when the release caused the fault; do not roll back database migrations blindly.
6. Restore from a verified backup when data is damaged, then document cause and prevention.

Framework references: [Laravel deployment](https://laravel.com/docs/13.x/deployment), [logging](https://laravel.com/docs/13.x/logging), [errors](https://laravel.com/docs/13.x/errors), [rate limiting](https://laravel.com/docs/13.x/rate-limiting), and [scheduling](https://laravel.com/docs/13.x/scheduling).
