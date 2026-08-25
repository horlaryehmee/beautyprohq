<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use App\Services\ContentNewsletterService;
use App\Models\Subscription;
use App\Models\User;
use Symfony\Component\Process\Process;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('deploy:from-git {--remote=origin} {--branch=main}', function (): int {
    $remote = (string) $this->option('remote');
    $branch = (string) $this->option('branch');

    if (! preg_match('/^[A-Za-z0-9._-]+$/', $remote) || ! preg_match('/^[A-Za-z0-9._\/-]+$/', $branch)) {
        $this->error('Deployment failed: invalid remote or branch name.');

        return 1;
    }

    $lock = Cache::lock('deploy-from-git', 900);
    if (! $lock->get()) {
        $this->error('Deployment failed: another deployment is already running.');

        return 1;
    }

    $startedAt = now();
    $lines = [];
    $statusPath = 'admin-deploy-latest.json';
    $writeStatus = function (string $status, ?int $exitCode = null) use (&$lines, $startedAt, $remote, $branch, $statusPath): void {
        Storage::disk('local')->put($statusPath, json_encode([
            'status' => $status,
            'exit_code' => $exitCode,
            'remote' => $remote,
            'branch' => $branch,
            'started_at' => $startedAt->toIso8601String(),
            'finished_at' => in_array($status, ['succeeded', 'failed'], true) ? now()->toIso8601String() : null,
            'log' => implode("\n", array_slice($lines, -600)),
        ], JSON_PRETTY_PRINT));
    };

    $run = function (string $label, array $command, int $timeout = 300) use (&$lines): int {
        $lines[] = '';
        $lines[] = '$ '.$label;
        $this->line('$ '.$label);

        $process = new Process($command, base_path(), null, null, $timeout);
        $process->run(function (string $type, string $buffer) use (&$lines): void {
            foreach (preg_split('/\r\n|\r|\n/', rtrim($buffer)) as $line) {
                if ($line === '') {
                    continue;
                }

                $lines[] = $line;
                $this->line($line);
            }
        });

        return $process->getExitCode() ?? 1;
    };

    $commandExists = function (string $command): bool {
        $lookup = PHP_OS_FAMILY === 'Windows' ? 'where' : 'command';
        $arguments = PHP_OS_FAMILY === 'Windows' ? [$lookup, $command] : ['sh', '-lc', 'command -v '.escapeshellarg($command)];
        $process = new Process($arguments, base_path(), null, null, 30);
        $process->run();

        return $process->isSuccessful();
    };

    $phpCommand = function () use ($commandExists): array {
        return $commandExists('php') ? ['php'] : [PHP_BINARY];
    };

    $artisanCommand = function (string ...$arguments) use ($phpCommand): array {
        return [...$phpCommand(), 'artisan', ...$arguments];
    };

    $composerCommand = function () use ($commandExists, $phpCommand): ?array {
        if ($commandExists('composer')) {
            return ['composer', 'install', '--no-dev', '--no-interaction', '--prefer-dist', '--optimize-autoloader'];
        }

        if (is_file(base_path('composer.phar'))) {
            return [...$phpCommand(), 'composer.phar', 'install', '--no-dev', '--no-interaction', '--prefer-dist', '--optimize-autoloader'];
        }

        return null;
    };

    try {
        $writeStatus('running');

        $beforeRefProcess = new Process(['git', 'rev-parse', 'HEAD'], base_path(), null, null, 60);
        $beforeRefProcess->run();
        $beforeRef = $beforeRefProcess->isSuccessful() ? trim($beforeRefProcess->getOutput()) : null;

        $dirtyCheck = new Process(['git', 'status', '--porcelain'], base_path(), null, null, 60);
        $dirtyCheck->run();
        if (! $dirtyCheck->isSuccessful()) {
            $lines[] = trim($dirtyCheck->getErrorOutput() ?: $dirtyCheck->getOutput());
            $writeStatus('failed', $dirtyCheck->getExitCode());
            $this->error('Deployment failed: could not inspect Git status.');

            return 1;
        }

        if (trim($dirtyCheck->getOutput()) !== '') {
            $lines[] = 'Deployment stopped: the server working tree has uncommitted changes.';
            $lines[] = trim($dirtyCheck->getOutput());
            $writeStatus('failed', 1);
            $this->error('Deployment stopped: the server working tree has uncommitted changes.');

            return 1;
        }

        $run('php artisan optimize:clear', $artisanCommand('optimize:clear'), 120);

        $commands = [
            ["git fetch {$remote} {$branch} --no-tags", ['git', 'fetch', $remote, $branch, '--no-tags'], 120, false],
            ["git pull --ff-only {$remote} {$branch}", ['git', 'pull', '--ff-only', $remote, $branch], 180, false],
        ];

        foreach ($commands as [$label, $command, $timeout, $optional]) {
            $exitCode = $run($label, $command, $timeout);
            if ($exitCode !== 0) {
                if ($optional) {
                    $lines[] = "Optional step failed with exit code {$exitCode}; continuing.";
                    $this->warn("Optional step failed with exit code {$exitCode}; continuing.");

                    continue;
                }

                $writeStatus('failed', $exitCode);

                return $exitCode;
            }
        }

        $afterRefProcess = new Process(['git', 'rev-parse', 'HEAD'], base_path(), null, null, 60);
        $afterRefProcess->run();
        $afterRef = $afterRefProcess->isSuccessful() ? trim($afterRefProcess->getOutput()) : null;
        $dependencyFilesChanged = true;

        if ($beforeRef && $afterRef && $beforeRef !== $afterRef) {
            $diffProcess = new Process(['git', 'diff', '--name-only', $beforeRef, $afterRef, '--', 'composer.json', 'composer.lock'], base_path(), null, null, 60);
            $diffProcess->run();
            $dependencyFilesChanged = trim($diffProcess->getOutput()) !== '';
        } elseif ($beforeRef && $afterRef) {
            $dependencyFilesChanged = false;
        }

        $resolvedComposerCommand = $composerCommand();
        if ($resolvedComposerCommand) {
            $exitCode = $run('composer install --no-dev --optimize-autoloader', $resolvedComposerCommand, 300);
            if ($exitCode !== 0) {
                $writeStatus('failed', $exitCode);

                return $exitCode;
            }
        } elseif ($dependencyFilesChanged || ! is_file(base_path('vendor/autoload.php'))) {
            $lines[] = 'Deployment failed: Composer is unavailable and dependencies may need installation.';
            $writeStatus('failed', 1);
            $this->error('Deployment failed: Composer is unavailable and dependencies may need installation.');

            return 1;
        } else {
            $lines[] = 'Composer is unavailable; dependency files did not change and vendor/autoload.php exists, so continuing.';
            $this->warn('Composer is unavailable; dependency files did not change and vendor/autoload.php exists, so continuing.');
        }

        foreach ([
            ['php artisan migrate --force', $artisanCommand('migrate', '--force'), 300, false],
            ['php artisan storage:link', $artisanCommand('storage:link'), 120, true],
            ['php artisan optimize:clear', $artisanCommand('optimize:clear'), 120, false],
            ['php artisan optimize', $artisanCommand('optimize'), 120, false],
            ['php artisan queue:restart', $artisanCommand('queue:restart'), 120, true],
        ] as [$label, $command, $timeout, $optional]) {
            $exitCode = $run($label, $command, $timeout);
            if ($exitCode !== 0) {
                if ($optional) {
                    $lines[] = "Optional step failed with exit code {$exitCode}; continuing.";
                    $this->warn("Optional step failed with exit code {$exitCode}; continuing.");

                    continue;
                }

                $writeStatus('failed', $exitCode);

                return $exitCode;
            }
        }

        $writeStatus('succeeded', 0);

        return 0;
    } finally {
        optional($lock)->release();
    }
})->purpose('Temporarily deploy the latest committed release from Git for admin dashboard use');

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

Artisan::command('subscriptions:repair-cancelled-access', function (): int {
    $userIds = DB::table('subscriptions')
        ->whereIn('plan', Subscription::PAID_PLANS)
        ->where('status', 'cancelled')
        ->whereNotNull('renews_at')
        ->where('renews_at', '>', now())
        ->distinct()
        ->pluck('user_id');

    $repaired = 0;
    User::whereIn('id', $userIds)->cursor()->each(function (User $user) use (&$repaired): void {
        if ($user->restorePrematurelyCancelledPaidAccess()) {
            $repaired++;
        }
    });

    $this->info("Premature subscription cancellations repaired: {$repaired}");

    return 0;
})->purpose('Restore paid access for subscriptions that were cancelled before the paid period ended');

Artisan::command('subscriptions:record-periods', function (): int {
    $due = DB::table('subscriptions')
        ->where('status', 'active')
        ->whereIn('plan', Subscription::PAID_PLANS)
        ->whereNotNull('renews_at')
        ->where('renews_at', '<=', now())
        ->get();

    $recorded = 0;
    foreach ($due as $row) {
        DB::transaction(function () use ($row, &$recorded): void {
            $metadata = json_decode((string) ($row->metadata ?? '[]'), true) ?: [];
            $cancelAtPeriodEnd = (bool) ($metadata['cancel_at_period_end'] ?? false);
            $cancelled = $cancelAtPeriodEnd || $row->cancelled_at !== null;

            $metadata['paid_access_ended_at'] = now()->toIso8601String();

            DB::table('subscriptions')->where('id', $row->id)->update([
                'status' => $cancelled ? 'cancelled' : 'expired',
                'ends_at' => $row->renews_at,
                'metadata' => json_encode($metadata),
                'updated_at' => now(),
            ]);

            $freePlan = DB::table('subscription_plans')->where('key', 'free')->first();
            if ($freePlan && ! DB::table('subscriptions')->where('user_id', $row->user_id)->where('plan', 'free')->where('status', 'active')->exists()) {
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
