<?php

namespace App\Services;

use App\Models\AppSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class GoogleOAuthService
{
    private const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    private const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

    public function enabled(): bool
    {
        return $this->setting('google.enabled', '0') === '1' && $this->configured();
    }

    public function configured(): bool
    {
        return filled($this->clientId()) && filled($this->clientSecret());
    }

    public function clientId(): ?string
    {
        return $this->setting('google.client_id') ?: config('services.google.client_id');
    }

    public function clientSecret(): ?string
    {
        return $this->setting('google.client_secret') ?: config('services.google.client_secret');
    }

    public function redirectUri(): string
    {
        return route('auth.google.callback');
    }

    public function calendarRedirectUri(): string
    {
        return route('auth.google.calendar.callback');
    }

    public function javascriptOrigin(): string
    {
        $parts = parse_url($this->redirectUri());

        if (! is_array($parts) || blank($parts['scheme'] ?? null) || blank($parts['host'] ?? null)) {
            return rtrim((string) config('app.url'), '/');
        }

        $origin = $parts['scheme'].'://'.$parts['host'];

        return isset($parts['port']) ? $origin.':'.$parts['port'] : $origin;
    }

    public function authorizationUrl(string $state, string $codeChallenge): string
    {
        return self::AUTHORIZE_URL.'?'.http_build_query([
            'client_id' => $this->clientId(),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'response_mode' => 'form_post',
            'scope' => 'openid email profile',
            'state' => $state,
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
            'prompt' => 'select_account',
        ], '', '&', PHP_QUERY_RFC3986);
    }

    public function userFromCode(string $code, string $codeVerifier): array
    {
        $token = Http::asForm()
            ->connectTimeout(5)
            ->timeout(15)
            ->post(self::TOKEN_URL, [
                'code' => $code,
                'client_id' => $this->clientId(),
                'client_secret' => $this->clientSecret(),
                'redirect_uri' => $this->redirectUri(),
                'grant_type' => 'authorization_code',
                'code_verifier' => $codeVerifier,
            ])
            ->throw()
            ->json();

        $accessToken = $token['access_token'] ?? null;
        if (! $accessToken) {
            throw ValidationException::withMessages(['google' => 'Google did not return a valid access token.']);
        }

        $profile = Http::withToken($accessToken)
            ->acceptJson()
            ->connectTimeout(5)
            ->timeout(15)
            ->get(self::USERINFO_URL)
            ->throw()
            ->json();

        if (blank($profile['sub'] ?? null) || blank($profile['email'] ?? null) || ! filter_var($profile['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            throw ValidationException::withMessages(['google' => 'Google did not provide a verified email address.']);
        }

        return $profile;
    }

    private function setting(string $key, mixed $default = null): mixed
    {
        if (! Schema::hasTable('app_settings')) {
            return $default;
        }

        return AppSetting::getValue($key, $default);
    }
}
