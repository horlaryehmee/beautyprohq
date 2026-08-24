<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use App\Services\ContentNewsletterService;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('ops:check {--production : Enforce production-only safety checks}', function (): int {
    $strict = (bool) $this->option('production');
    $checks = [
        'Application key is configured' => filled(config('app.key')),
        'Database is reachable' => false,
        'Shared cache round trip succeeds' => false,
        'Required database tables exist' => false,
        'No database migrations are pending' => false,
        'Storage directory is writable' => is_writable(storage_path()),
        'Bootstrap cache directory is writable' => is_writable(base_path('bootstrap/cache')),
        'Production asset manifest is valid' => is_file(public_path('build/manifest.json'))
            && is_array(json_decode((string) file_get_contents(public_path('build/manifest.json')), true)),
        'Configured upload disk exists' => array_key_exists(config('filesystems.upload_disk'), config('filesystems.disks', [])),
        'Configured upload disk is writable' => false,
    ];

    try {
        DB::select('select 1');
        $checks['Database is reachable'] = true;
        $checks['Required database tables exist'] = collect(['users', 'sessions', 'cache', 'cache_locks', 'jobs', 'failed_jobs'])
            ->every(fn (string $table): bool => Schema::hasTable($table));
        if (Schema::hasTable('migrations')) {
            $migrationFiles = collect(glob(database_path('migrations/*_*.php')) ?: [])
                ->map(fn (string $path): string => pathinfo($path, PATHINFO_FILENAME));
            $checks['No database migrations are pending'] = $migrationFiles
                ->diff(DB::table('migrations')->pluck('migration'))
                ->isEmpty();
        }
    } catch (\Throwable) {
        // Reported as failed below without leaking connection details.
    }

    try {
        $probe = bin2hex(random_bytes(12));
        Cache::put('ops:check', $probe, 30);
        $checks['Shared cache round trip succeeds'] = hash_equals($probe, (string) Cache::pull('ops:check'));
    } catch (\Throwable) {
        // Reported as failed below.
    }

    try {
        $disk = Storage::disk((string) config('filesystems.upload_disk'));
        $path = '.ops-check-'.bin2hex(random_bytes(8));
        $probe = bin2hex(random_bytes(12));
        $written = $disk->put($path, $probe);
        $checks['Configured upload disk is writable'] = $written && hash_equals($probe, (string) $disk->get($path));
        $disk->delete($path);
    } catch (\Throwable) {
        if (isset($disk, $path)) {
            try {
                $disk->delete($path);
            } catch (\Throwable) {
                // The failed readiness check below is sufficient.
            }
        }
    }

    foreach (['ctype', 'curl', 'dom', 'fileinfo', 'filter', 'gd', 'hash', 'mbstring', 'openssl', 'pcre', 'pdo', 'pdo_mysql', 'session', 'tokenizer', 'xml'] as $extension) {
        $checks["PHP extension {$extension} is loaded"] = extension_loaded($extension);
    }

    if ($strict) {
        $appHost = (string) parse_url((string) config('app.url'), PHP_URL_HOST);
        $trustedHostMatchesApp = $appHost !== '' && collect(config('app.trusted_hosts', []))
            ->contains(fn (string $pattern): bool => preg_match('~'.$pattern.'~i', $appHost) === 1);
        $mailUsesTls = config('mail.default') !== 'smtp'
            || config('mail.mailers.smtp.scheme') === 'smtps'
            || (config('mail.mailers.smtp.scheme') === 'smtp' && (bool) config('mail.mailers.smtp.require_tls'));

        $checks = [
            'APP_ENV is production' => app()->environment('production'),
            'APP_DEBUG is disabled' => ! config('app.debug'),
            'APP_URL uses HTTPS' => str_starts_with((string) config('app.url'), 'https://'),
            'At least one trusted host is configured' => config('app.trusted_hosts', []) !== [],
            'APP_URL host is trusted' => $trustedHostMatchesApp,
            'Trusted proxies do not use a wildcard' => ! in_array('*', config('app.trusted_proxies', []), true),
            'Production database is MySQL-compatible' => in_array(config('database.default'), ['mysql', 'mariadb'], true),
            'Session cookies require HTTPS' => (bool) config('session.secure'),
            'Session cookies are HTTP only' => (bool) config('session.http_only'),
            'Session SameSite policy is enabled' => in_array(config('session.same_site'), ['lax', 'strict'], true),
            'Database sessions are enabled' => config('session.driver') === 'database',
            'Session payload encryption is enabled' => (bool) config('session.encrypt'),
            'Shared cache store is enabled' => in_array(config('cache.default'), ['database', 'redis', 'memcached'], true),
            'Rate limits use a shared store' => in_array(config('cache.limiter'), ['database', 'redis', 'memcached'], true),
            'Production cache prefix is configured' => filled(config('cache.prefix')),
            'Database queue is enabled' => config('queue.default') === 'database',
            'Daily application log rotation is enabled' => in_array('daily', config('logging.channels.stack.channels', []), true),
            'Production application logs exclude debug level' => config('logging.channels.daily.level') !== 'debug',
            'CSP is enabled' => (bool) config('security.csp.enabled'),
            'HSTS is enabled' => (bool) config('security.hsts.enabled'),
            'Real mail transport is configured' => ! in_array(config('mail.default'), ['array', 'log'], true),
            'SMTP transport requires TLS' => $mailUsesTls,
            'Configuration is cached' => app()->configurationIsCached(),
            ...$checks,
        ];
    }

    $failed = false;
    foreach ($checks as $label => $passed) {
        if ($passed) {
            $this->info("[OK] {$label}");
            continue;
        }

        $failed = true;
        $this->error("[FAIL] {$label}");
    }

    if ($failed) {
        $this->newLine();
        $this->error('Operational checks failed.');

        return 1;
    }

    $this->newLine();
    $this->info('Operational checks passed.');

    return 0;
})->purpose('Validate hosting, security, cache, queue, and deployment requirements');

Schedule::command('queue:work --stop-when-empty --max-time=50 --tries=3 --timeout=40')
    ->everyMinute()
    ->withoutOverlapping(2);

Schedule::command('auth:clear-resets')->dailyAt('02:10');
Schedule::command('sanctum:prune-expired --hours=24')->dailyAt('02:20');
Schedule::command('queue:prune-failed --hours=168')->dailyAt('02:30');
Artisan::command('newsletter:send-due-content', function (ContentNewsletterService $newsletter): int {
    $result = $newsletter->sendDue();
    $this->info("Newsletter content sends checked. {$result['content']} content items queued for {$result['sent']} subscribers.");

    return 0;
})->purpose('Queue requested subscriber emails for content that is now published');

Schedule::command('newsletter:send-due-content')->everyFiveMinutes()->withoutOverlapping(10);

Artisan::command('subscriptions:record-periods', function (): int {
    $due = DB::table('subscriptions')
        ->where('status', 'active')
        ->whereIn('plan', ['paid', 'pro', 'daily_test'])
        ->whereNotNull('renews_at')
        ->where('renews_at', '<=', now())
        ->get();

    $recorded = 0;
    foreach ($due as $row) {
        DB::transaction(function () use ($row, &$recorded): void {
            $plan = DB::table('subscription_plans')->where('id', $row->subscription_plan_id)->first();
            $metadata = json_decode((string) ($row->metadata ?? '[]'), true) ?: [];
            $cancelAtPeriodEnd = (bool) ($metadata['cancel_at_period_end'] ?? false);

            // Close the current period
            DB::table('subscriptions')->where('id', $row->id)->update([
                'status' => $cancelAtPeriodEnd ? 'cancelled' : 'expired',
                'ends_at' => $row->renews_at,
                'updated_at' => now(),
            ]);

            if ($cancelAtPeriodEnd) {
                $freePlan = DB::table('subscription_plans')->where('key', 'free')->first();
                if ($freePlan) {
                    DB::table('subscriptions')->insert([
                        'user_id' => $row->user_id,
                        'subscription_plan_id' => $freePlan->id,
                        'plan' => 'free',
                        'status' => 'active',
                        'amount' => 0,
                        'currency' => $freePlan->currency,
                        'starts_at' => now(),
                        'metadata' => json_encode([
                            'downgraded_from_subscription_id' => $row->id,
                            'downgraded_at' => now()->toIso8601String(),
                            'paid_access_ended_at' => now()->toIso8601String(),
                        ]),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }

                DB::table('provider_profiles')
                    ->where('user_id', $row->user_id)
                    ->update(['verified' => false, 'updated_at' => now()]);

                $recorded++;

                return;
            }

            // Open the next period so every monthly/daily cycle is recorded
            $metadata['renewed_from_subscription_id'] = $row->id;
            $metadata['renewed_at'] = now()->toIso8601String();

            DB::table('subscriptions')->insert([
                'user_id' => $row->user_id,
                'subscription_plan_id' => $row->subscription_plan_id,
                'plan' => $row->plan,
                'status' => 'active',
                'amount' => $row->amount,
                'currency' => $row->currency,
                'starts_at' => now(),
                'renews_at' => ($plan?->billing_period ?? 'monthly') === 'daily' ? now()->addDay() : now()->addMonth(),
                'metadata' => json_encode($metadata),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $recorded++;
        });
    }

    $this->info("Subscription periods recorded: {$recorded}");

    return 0;
})->purpose('Record monthly/daily subscription renewals as new period rows');

Schedule::command('subscriptions:record-periods')->hourly()->withoutOverlapping(10);

Schedule::call(function (): void {
    if (Schema::hasTable('sessions')) {
        DB::table('sessions')
            ->where('last_activity', '<', now()->subMinutes((int) config('session.lifetime', 120))->getTimestamp())
            ->delete();
    }

    if (Schema::hasTable('cache')) {
        DB::table('cache')->where('expiration', '<=', now()->getTimestamp())->delete();
    }

    if (Schema::hasTable('cache_locks')) {
        DB::table('cache_locks')->where('expiration', '<=', now()->getTimestamp())->delete();
    }
})->dailyAt('02:40')->name('prune-shared-hosting-state')->withoutOverlapping();
