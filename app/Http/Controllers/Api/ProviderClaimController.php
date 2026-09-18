<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProviderProfile;
use App\Models\User;
use App\Notifications\ProviderClaimNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rules\Password as PasswordRule;

class ProviderClaimController extends Controller
{
    public function request(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'email', 'max:255']]);
        $email = Str::lower(trim($validated['email']));
        $message = 'If this address belongs to an unclaimed imported listing, a secure claim link has been sent.';
        $rateKey = 'provider-claim:'.hash('sha256', $email);

        if (RateLimiter::tooManyAttempts($rateKey, 3)) {
            return $this->success(null, $message);
        }

        $profiles = ProviderProfile::query()
            ->whereNotNull('wordpress_listing_id')
            ->whereNull('claimed_at')
            ->whereRaw('lower(imported_email) = ?', [$email])
            ->whereHas('user', fn ($query) => $query->where('is_active', true)->where('role', 'provider'))
            ->with('user:id,name')
            ->get();

        if ($profiles->isNotEmpty()) {
            RateLimiter::hit($rateKey, 3600);
        }

        foreach ($profiles as $provider) {
            $token = Str::random(64);
            $provider->forceFill([
                'claim_token_hash' => hash('sha256', $token),
                'claim_expires_at' => now()->addHour(),
            ])->save();

            try {
                Notification::route('mail', $email)->notify(new ProviderClaimNotification(
                    $provider->id,
                    $provider->user->name,
                    $token,
                ));
            } catch (\Throwable $exception) {
                $provider->forceFill(['claim_token_hash' => null, 'claim_expires_at' => null])->save();
                report($exception);
            }
        }

        return $this->success(null, $message);
    }

    public function complete(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'listing' => ['required', 'integer', 'min:1'],
            'token' => ['required', 'string', 'size:64'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
            'login_email' => ['nullable', 'email', 'max:255'],
            'accept_terms' => ['required', 'accepted'],
        ]);

        [$user, $needsVerification] = DB::transaction(function () use ($validated): array {
            $provider = ProviderProfile::query()
                ->whereKey($validated['listing'])
                ->whereNotNull('wordpress_listing_id')
                ->lockForUpdate()
                ->first();

            if (! $provider || $provider->claimed_at || ! $provider->claim_expires_at
                || $provider->claim_expires_at->isPast()
                || ! $provider->claim_token_hash
                || ! hash_equals($provider->claim_token_hash, hash('sha256', $validated['token']))) {
                throw ValidationException::withMessages(['token' => 'This claim link is invalid, expired, or already used. Request a new link.']);
            }

            $user = User::query()->whereKey($provider->user_id)->lockForUpdate()->firstOrFail();
            if (! $user->is_active || ! $user->isProvider()) {
                throw ValidationException::withMessages(['token' => 'This listing cannot be claimed.']);
            }

            $currentEmail = Str::lower($user->email);
            $sourceEmail = Str::lower((string) $provider->imported_email);
            $needsNewLogin = str_ends_with($currentEmail, '@import.beautyprohq.invalid');
            $loginEmail = $needsNewLogin ? Str::lower(trim((string) ($validated['login_email'] ?? ''))) : $currentEmail;

            if ($needsNewLogin && $loginEmail === '') {
                throw ValidationException::withMessages(['login_email' => 'This address owns another imported listing. Enter a different email for this dashboard account.']);
            }
            if ($needsNewLogin && User::where('email', $loginEmail)->whereKeyNot($user->id)->exists()) {
                throw ValidationException::withMessages(['login_email' => 'This email is already used by another account.']);
            }

            $needsVerification = $loginEmail !== $sourceEmail;
            $user->forceFill([
                'email' => $loginEmail,
                'password' => Hash::make($validated['password']),
                'email_verified_at' => $needsVerification ? null : now(),
                'remember_token' => Str::random(60),
                'last_login_at' => now(),
            ])->save();
            $user->tokens()->delete();

            $provider->forceFill([
                'claim_token_hash' => null,
                'claim_expires_at' => null,
                'claimed_at' => now(),
                'terms_accepted_at' => $provider->terms_accepted_at ?: now(),
                'onboarding_completed_at' => $provider->onboarding_completed_at ?: now(),
                'account_approved_at' => $provider->account_approved_at ?: now(),
            ])->save();

            return [$user, $needsVerification];
        });

        if ($request->hasSession()) {
            Auth::login($user);
            $request->session()->regenerate();
        }

        if ($needsVerification) {
            try {
                $user->sendEmailVerificationNotification();
            } catch (\Throwable $exception) {
                report($exception);
            }
        }

        return $this->success([
            'redirect' => $needsVerification ? '/verify-email' : '/provider',
            'email_verification_required' => $needsVerification,
        ], $needsVerification
            ? 'Listing claimed. Verify your new login email to open the dashboard.'
            : 'Listing claimed. Your provider dashboard is ready.');
    }
}
