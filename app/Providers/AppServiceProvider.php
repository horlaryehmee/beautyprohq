<?php

namespace App\Providers;

use App\Models\AppSetting;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
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
        $this->configureAdminSmtp();

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

    private function configureAdminSmtp(): void
    {
        try {
            if (! Schema::hasTable('app_settings') || AppSetting::getValue('smtp.enabled', '0') !== '1') {
                return;
            }

            $host = AppSetting::getValue('smtp.host');
            $port = AppSetting::getValue('smtp.port');
            $fromAddress = AppSetting::getValue('smtp.from_address');

            if (blank($host) || blank($port) || blank($fromAddress)) {
                return;
            }

            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp.host' => $host,
                'mail.mailers.smtp.port' => (int) $port,
                'mail.mailers.smtp.username' => AppSetting::getValue('smtp.username'),
                'mail.mailers.smtp.password' => AppSetting::getValue('smtp.password'),
                'mail.mailers.smtp.encryption' => AppSetting::getValue('smtp.encryption') ?: null,
                'mail.mailers.smtp.scheme' => null,
                'mail.mailers.smtp.url' => null,
                'mail.from.address' => $fromAddress,
                'mail.from.name' => AppSetting::getValue('smtp.from_name') ?: config('app.name'),
            ]);
        } catch (\Throwable) {
            return;
        }
    }
}
