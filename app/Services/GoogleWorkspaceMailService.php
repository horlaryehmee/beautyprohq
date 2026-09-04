<?php

namespace App\Services;

use App\Models\AppSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class GoogleWorkspaceMailService
{
    private const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    private const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

    private const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

    public function __construct(private readonly GoogleOAuthService $oauth) {}

    public function available(): bool
    {
        return $this->oauth->configured();
    }

    public function connected(): bool
    {
        return filled(AppSetting::getValue('google_workspace.refresh_token'))
            && filled(AppSetting::getValue('google_workspace.email'));
    }

    public function redirectUri(): string
    {
        return route('auth.google.mail.callback');
    }

    public function authorizationUrl(string $state, string $codeChallenge): string
    {
        return self::AUTHORIZE_URL.'?'.http_build_query([
            'client_id' => $this->oauth->clientId(),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'response_mode' => 'form_post',
            'scope' => 'openid email https://www.googleapis.com/auth/gmail.send',
            'state' => $state,
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
            'access_type' => 'offline',
            'include_granted_scopes' => 'true',
            'prompt' => 'consent select_account',
        ], '', '&', PHP_QUERY_RFC3986);
    }

    public function connectFromCode(string $code, string $codeVerifier): string
    {
        $token = Http::asForm()->connectTimeout(5)->timeout(15)->post(self::TOKEN_URL, [
            'code' => $code,
            'client_id' => $this->oauth->clientId(),
            'client_secret' => $this->oauth->clientSecret(),
            'redirect_uri' => $this->redirectUri(),
            'grant_type' => 'authorization_code',
            'code_verifier' => $codeVerifier,
        ])->throw()->json();

        if (blank($token['access_token'] ?? null) || blank($token['refresh_token'] ?? null)) {
            throw ValidationException::withMessages([
                'google_workspace' => 'Google did not grant permanent mail access. Please reconnect and approve email sending.',
            ]);
        }

        $profile = Http::withToken($token['access_token'])->acceptJson()->connectTimeout(5)->timeout(15)
            ->get(self::USERINFO_URL)->throw()->json();
        $email = strtolower(trim((string) ($profile['email'] ?? '')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages(['google_workspace' => 'Google did not return a valid mailbox address.']);
        }

        AppSetting::setValue('google_workspace.email', $email);
        AppSetting::setValue('google_workspace.access_token', $token['access_token'], true);
        AppSetting::setValue('google_workspace.refresh_token', $token['refresh_token'], true);
        AppSetting::setValue('google_workspace.access_token_expires_at', now()->addSeconds(max(60, (int) ($token['expires_in'] ?? 3600)))->toIso8601String());
        AppSetting::setValue('google_workspace.connected_at', now()->toIso8601String());

        return $email;
    }

    public function disconnect(): void
    {
        AppSetting::setValue('google_workspace.email', null);
        AppSetting::setValue('google_workspace.access_token', null, true);
        AppSetting::setValue('google_workspace.refresh_token', null, true);
        AppSetting::setValue('google_workspace.access_token_expires_at', null);
        AppSetting::setValue('google_workspace.connected_at', null);
    }

    public function send(string $rawMessage): string
    {
        if (! $this->connected()) {
            throw new \RuntimeException('Google Workspace mail is not connected.');
        }

        $response = Http::withToken($this->accessToken())->acceptJson()->connectTimeout(5)->timeout(20)
            ->post(self::GMAIL_SEND_URL, ['raw' => rtrim(strtr(base64_encode($rawMessage), '+/', '-_'), '=')]);

        if ($response->status() === 401) {
            AppSetting::setValue('google_workspace.access_token_expires_at', null);
            $response = Http::withToken($this->accessToken())->acceptJson()->connectTimeout(5)->timeout(20)
                ->post(self::GMAIL_SEND_URL, ['raw' => rtrim(strtr(base64_encode($rawMessage), '+/', '-_'), '=')]);
        }

        $response->throw();

        return (string) $response->json('id');
    }

    public function payload(): array
    {
        return [
            'available' => $this->available(),
            'connected' => $this->connected(),
            'email' => AppSetting::getValue('google_workspace.email'),
            'connected_at' => AppSetting::getValue('google_workspace.connected_at'),
            'connect_url' => route('auth.google.mail.redirect'),
            'redirect_uri' => $this->redirectUri(),
        ];
    }

    private function accessToken(): string
    {
        $accessToken = AppSetting::getValue('google_workspace.access_token');
        $expiresAt = AppSetting::getValue('google_workspace.access_token_expires_at');
        if (filled($accessToken) && filled($expiresAt) && Carbon::parse($expiresAt)->isAfter(now()->addMinutes(2))) {
            return $accessToken;
        }

        $refreshToken = AppSetting::getValue('google_workspace.refresh_token');
        if (blank($refreshToken)) {
            throw new \RuntimeException('Google Workspace access expired. Reconnect the mailbox from Admin settings.');
        }

        $token = Http::asForm()->connectTimeout(5)->timeout(15)->post(self::TOKEN_URL, [
            'client_id' => $this->oauth->clientId(),
            'client_secret' => $this->oauth->clientSecret(),
            'refresh_token' => $refreshToken,
            'grant_type' => 'refresh_token',
        ])->throw()->json();
        if (blank($token['access_token'] ?? null)) {
            throw new \RuntimeException('Google Workspace access could not be refreshed. Reconnect the mailbox from Admin settings.');
        }

        AppSetting::setValue('google_workspace.access_token', $token['access_token'], true);
        AppSetting::setValue('google_workspace.access_token_expires_at', now()->addSeconds(max(60, (int) ($token['expires_in'] ?? 3600)))->toIso8601String());

        return $token['access_token'];
    }
}
