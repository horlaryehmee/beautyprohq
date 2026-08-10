<?php

namespace App\Providers;

use App\Models\AppSetting;
use App\Models\NewsletterSubscriber;
use App\Models\User;
use App\Observers\NewsletterSubscriberMailchimpObserver;
use App\Observers\UserMailchimpObserver;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Events\DiagnosingHealth;
use Illuminate\Http\Request;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (config('app.trusted_proxies', []) !== []) {
            TrustProxies::at(config('app.trusted_proxies'));
        }

        Http::macro('external', fn () => Http::connectTimeout((int) config('services.http.connect_timeout', 5))
            ->timeout((int) config('services.http.timeout', 15)));

        $this->configureRateLimiting();
        $this->configureHealthChecks();
        $this->configureAdminSmtp();
        User::observe(UserMailchimpObserver::class);
        NewsletterSubscriber::observe(NewsletterSubscriberMailchimpObserver::class);

        ResetPassword::createUrlUsing(function (object $notifiable, string $token): string {
            return rtrim(config('app.frontend_url'), '/').'/reset-password?'.http_build_query([
                'token' => $token,
                'email' => $notifiable->getEmailForPasswordReset(),
            ]);
        });

        VerifyEmail::createUrlUsing(function (object $notifiable): string {
            $hash = sha1($notifiable->getEmailForVerification());
            $apiUrl = URL::temporarySignedRoute(
                'verification.verify',
                now()->addMinutes((int) config('auth.verification.expire', 60)),
                ['id' => $notifiable->getKey(), 'hash' => $hash]
            );
            $query = parse_url($apiUrl, PHP_URL_QUERY);

            return rtrim(config('app.frontend_url'), '/')."/verify-email/{$notifiable->getKey()}/{$hash}?{$query}";
        });
    }

    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', fn (Request $request): Limit => $this->withRateLimitResponse(
            Limit::perMinute($request->user() ? 240 : 90)->by($this->actorKey($request))
        ));

        RateLimiter::for('login', fn (Request $request): array => [
            $this->withRateLimitResponse(Limit::perMinute(5)->by('login:'.hash('sha256', Str::lower((string) $request->input('email')).'|'.$request->ip()))),
            $this->withRateLimitResponse(Limit::perMinute(20)->by('login-ip:'.$request->ip())),
        ]);

        RateLimiter::for('registration', fn (Request $request): array => [
            $this->withRateLimitResponse(Limit::perMinutes(10, 3)->by('registration:'.$request->ip())),
            $this->withRateLimitResponse(Limit::perHour(10)->by('registration-hour:'.$request->ip())),
        ]);

        RateLimiter::for('password-reset', fn (Request $request): array => [
            $this->withRateLimitResponse(Limit::perMinutes(10, 3)->by('password:'.hash('sha256', Str::lower((string) $request->input('email')).'|'.$request->ip()))),
            $this->withRateLimitResponse(Limit::perHour(12)->by('password-ip:'.$request->ip())),
        ]);

        RateLimiter::for('email-verification', fn (Request $request): Limit => $this->withRateLimitResponse(
            Limit::perSecond(1, 30)->by('email-verification:'.$this->actorKey($request))
        ));

        RateLimiter::for('public-form', fn (Request $request): array => [
            $this->withRateLimitResponse(Limit::perMinute(6)->by('public-form:'.$request->ip())),
            $this->withRateLimitResponse(Limit::perHour(30)->by('public-form-hour:'.$request->ip())),
        ]);

        RateLimiter::for('chat', fn (Request $request): array => [
            $this->withRateLimitResponse(Limit::perMinute(30)->by('chat:'.$this->actorKey($request).':'.$request->route('conversation'))),
            $this->withRateLimitResponse(Limit::perHour(300)->by('chat-hour:'.$this->actorKey($request))),
        ]);

        RateLimiter::for('payment', fn (Request $request): array => [
            $this->withRateLimitResponse(Limit::perMinute(10)->by('payment:'.$this->actorKey($request))),
            $this->withRateLimitResponse(Limit::perHour(60)->by('payment-hour:'.$this->actorKey($request))),
        ]);

        RateLimiter::for('upload', fn (Request $request): Limit => $this->withRateLimitResponse(
            Limit::perMinute(10)->by('upload:'.$this->actorKey($request))
        ));

        RateLimiter::for('sensitive', fn (Request $request): Limit => $this->withRateLimitResponse(
            Limit::perMinute(6)->by('sensitive:'.$this->actorKey($request))
        ));
    }

    private function withRateLimitResponse(Limit $limit): Limit
    {
        return $limit->response(function (Request $request, array $headers) {
            Log::channel('security')->notice('Request rate limit exceeded.', [
                'request_id' => $request->attributes->get('request_id'),
                'method' => $request->method(),
                'path' => $request->path(),
                'user_id' => $request->user()?->id,
                'ip' => $request->ip(),
            ]);

            return response()->json([
                'message' => 'Too many requests. Please wait before trying again.',
                'request_id' => $request->attributes->get('request_id'),
            ], 429, $headers);
        });
    }

    private function actorKey(Request $request): string
    {
        return $request->user() ? 'user:'.$request->user()->id : 'ip:'.$request->ip();
    }

    private function configureHealthChecks(): void
    {
        Event::listen(DiagnosingHealth::class, function (): void {
            DB::select('select 1');

            $key = (string) config('operations.health_cache_key', 'health:last-check');
            $value = Str::random(24);
            Cache::put($key, $value, 30);

            if (! hash_equals($value, (string) Cache::get($key))) {
                throw new \RuntimeException('Application cache health check failed.');
            }
        });
    }

    private function configureAdminSmtp(): void
    {
        try {
            if (! Schema::hasTable('app_settings') || AppSetting::getValue('smtp.enabled', '0') !== '1') {
                return;
            }

            $host = AppSetting::getValue('smtp.host');
            $port = AppSetting::getValue('smtp.port');
            $fromAddress = AppSetting::getValue('smtp.from_address');
            $encryption = AppSetting::getValue('smtp.encryption');

            if (blank($host) || blank($port) || blank($fromAddress)) {
                return;
            }

            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp.host' => $host,
                'mail.mailers.smtp.port' => (int) $port,
                'mail.mailers.smtp.username' => AppSetting::getValue('smtp.username'),
                'mail.mailers.smtp.password' => AppSetting::getValue('smtp.password'),
                'mail.mailers.smtp.scheme' => $encryption === 'ssl' ? 'smtps' : 'smtp',
                'mail.mailers.smtp.require_tls' => $encryption === 'tls',
                'mail.mailers.smtp.url' => null,
                'mail.from.address' => $fromAddress,
                'mail.from.name' => AppSetting::getValue('smtp.from_name') ?: config('app.name'),
            ]);
        } catch (\Throwable) {
            return;
        }
    }
}
