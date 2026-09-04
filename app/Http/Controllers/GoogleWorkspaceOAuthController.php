<?php

namespace App\Http\Controllers;

use App\Models\AppSetting;
use App\Models\User;
use App\Services\GoogleWorkspaceMailService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GoogleWorkspaceOAuthController extends Controller
{
    public function redirect(Request $request, GoogleWorkspaceMailService $workspace): RedirectResponse
    {
        if (! $request->user()?->isAdmin()) {
            return $this->errorRedirect('Only an administrator can connect the platform mailbox.');
        }
        if (! $workspace->available()) {
            return $this->errorRedirect('Save the Google OAuth client ID and secret in Authentication settings first.');
        }

        $state = Str::random(64);
        $codeVerifier = Str::random(96);
        $pending = [
            'state' => $state,
            'code_verifier' => $codeVerifier,
            'user_id' => $request->user()->id,
            'started_at' => now()->timestamp,
        ];
        $request->session()->put('google_workspace_oauth', $pending);
        Cache::put($this->cacheKey($state), $pending, now()->addMinutes(10));
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $codeVerifier, true)), '+/', '-_'), '=');

        return redirect()->away($workspace->authorizationUrl($state, $challenge));
    }

    public function callback(Request $request, GoogleWorkspaceMailService $workspace): RedirectResponse
    {
        $state = (string) $request->input('state');
        $sessionPending = $request->session()->pull('google_workspace_oauth');
        $cachedPending = filled($state) ? Cache::pull($this->cacheKey($state)) : null;
        $pending = is_array($cachedPending) ? $cachedPending : $sessionPending;

        if (! is_array($pending)
            || now()->timestamp - (int) ($pending['started_at'] ?? 0) > 600
            || blank($state)
            || ! hash_equals((string) ($pending['state'] ?? ''), $state)) {
            return $this->errorRedirect('The Google mail connection expired or could not be verified. Please try again.');
        }
        if ($request->filled('error')) {
            return $this->errorRedirect('Google mail access was cancelled.');
        }
        if (blank($request->input('code'))) {
            return $this->errorRedirect('Google did not return an authorization code.');
        }

        try {
            $admin = User::find($pending['user_id']);
            if (! $admin?->isAdmin() || ! $admin->is_active) {
                return $this->errorRedirect('The administrator account is no longer available.');
            }

            $email = $workspace->connectFromCode((string) $request->input('code'), (string) $pending['code_verifier']);
            AppSetting::setValue('smtp.enabled', '1');
            AppSetting::setValue('smtp.mailer', 'google_workspace');
            AppSetting::setValue('smtp.username', $email);
            AppSetting::setValue('smtp.from_address', $email);
            AppSetting::setValue('smtp.password', null, true);

            return redirect('/admin/settings?section=email&mail_connected=1');
        } catch (\Throwable $exception) {
            report($exception);
            $message = $exception instanceof ValidationException
                ? collect($exception->errors())->flatten()->first()
                : 'Google Workspace could not be connected. Please try again.';

            return $this->errorRedirect($message);
        }
    }

    private function cacheKey(string $state): string
    {
        return 'google_workspace_oauth:'.hash('sha256', $state);
    }

    private function errorRedirect(string $message): RedirectResponse
    {
        return redirect('/admin/settings?'.http_build_query(['section' => 'email', 'mail_error' => $message]));
    }
}
