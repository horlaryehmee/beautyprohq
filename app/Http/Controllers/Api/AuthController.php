<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProviderProfile;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Notifications\EmailChangeVerificationNotification;
use App\Notifications\PlatformUpdateNotification;
use App\Notifications\TwoFactorCodeNotification;
use App\Services\AccountDeletionService;
use App\Support\CurrencyResolver;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:255'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
            'role' => ['required', Rule::in(['provider', 'customer'])],
            'plan' => ['nullable', Rule::in(['free', 'paid'])],
        ]);
        $validated['email'] = Str::lower(trim($validated['email']));
        $validated['plan'] = $validated['plan'] ?? 'free';
        $detectedCurrency = CurrencyResolver::currencyForRequest($request);

        $existingUser = User::where('email', $validated['email'])->first();
        if ($existingUser && (! $existingUser->is_guest || ! $existingUser->isCustomer() || $validated['role'] !== 'customer')) {
            return response()->json([
                'message' => $existingUser->isCustomer()
                    ? 'An account already exists with this email. Please log in instead.'
                    : 'This email is already used by another account type. Please log in or use another email.',
                'errors' => [
                    'email' => [$existingUser->isCustomer()
                        ? 'An account already exists with this email. Please log in instead.'
                        : 'This email is already used by another account type.'],
                ],
            ], 422);
        }

        $user = DB::transaction(function () use ($validated, $existingUser, $detectedCurrency): User {
            $selectedPlan = $validated['plan'];
            unset($validated['plan']);

            if ($existingUser) {
                $existingUser->update([
                    'name' => $validated['name'],
                    'password' => $validated['password'],
                    'is_guest' => false,
                    'is_active' => true,
                    'email_verified_at' => null,
                    'preferred_currency' => $existingUser->preferred_currency ?: $detectedCurrency,
                ]);

                return $existingUser;
            }

            $user = User::create($validated + [
                'preferred_currency' => $detectedCurrency,
                'is_active' => true,
                'is_guest' => false,
            ]);

            if ($user->isProvider()) {
                ProviderProfile::create([
                    'user_id' => $user->id,
                    'slug' => $this->uniqueSlug($user->name),
                    'profession' => 'Beauty Professional',
                    'default_currency' => $detectedCurrency,
                ]);

                $plan = SubscriptionPlan::where('key', $selectedPlan)->first()
                    ?? SubscriptionPlan::where('key', 'free')->first();

                if ($plan) {
                    Subscription::create([
                        'user_id' => $user->id,
                        'subscription_plan_id' => $plan->id,
                        'plan' => $plan->key,
                        'status' => $plan->key === 'paid' ? 'expired' : 'active',
                        'amount' => $plan->key === 'paid' ? CurrencyResolver::convert((float) $plan->price, $plan->currency, $detectedCurrency) : 0,
                        'currency' => $plan->key === 'paid' ? $detectedCurrency : $plan->currency,
                        'starts_at' => $plan->key === 'paid' ? null : now(),
                        'metadata' => $plan->key === 'paid' ? ['selected_at_registration' => true] : null,
                    ]);
                }
            }

            return $user;
        });

        $this->sendEmailVerificationAfterResponse($user);
        $this->sendAdminRegistrationNoticeAfterResponse($user);

        Log::channel('security')->notice('Account registered.', [
            'user_id' => $user->id,
            'role' => $user->role,
            'ip' => $request->ip(),
        ]);
        if ($request->hasSession()) {
            Auth::login($user);
            $request->session()->regenerate();
        }

        return $this->success([
            'user' => $this->authUserPayload($user),
        ], 'Account created. Please verify your email address.', 201);
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'two_factor_code' => ['nullable', 'string'],
        ]);

        $user = User::where('email', Str::lower(trim($credentials['email'])))->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            Log::channel('security')->warning('Authentication failed.', [
                'email_hash' => hash('sha256', Str::lower(trim($credentials['email']))),
                'ip' => $request->ip(),
            ]);

            return response()->json(['message' => 'The provided credentials are incorrect.'], 422);
        }

        if (! $user->is_active) {
            Log::channel('security')->warning('Disabled account attempted authentication.', [
                'user_id' => $user->id,
                'ip' => $request->ip(),
            ]);

            return response()->json(['message' => 'This account has been disabled.'], 403);
        }

        if ($user->two_factor_enabled) {
            $method = $user->two_factor_method ?: 'email';

            if (! filled($credentials['two_factor_code'] ?? null)) {
                if ($method === 'email') {
                    $this->sendTwoFactorCode($user, 'login');
                }

                return $this->success([
                    'two_factor_required' => true,
                    'email' => $user->email,
                    'two_factor_method' => $method,
                ], $method === 'totp' ? 'Enter the code from your authenticator app.' : 'Enter the verification code sent to your email.');
            }

            $usedRecoveryCode = false;
            $validCode = $method === 'totp'
                ? $this->validTotpCode($user, $credentials['two_factor_code'])
                : $this->validTwoFactorCode($user, $credentials['two_factor_code']);

            if (! $validCode) {
                $validCode = $this->useRecoveryCode($user, $credentials['two_factor_code']);
                $usedRecoveryCode = $validCode;
            }

            if (! $validCode) {
                Log::channel('security')->warning('Two-factor authentication failed.', [
                    'user_id' => $user->id,
                    'method' => $method,
                    'ip' => $request->ip(),
                ]);

                return response()->json(['message' => 'The verification code is invalid or expired.'], 422);
            }

            if ($method === 'email' && ! $usedRecoveryCode) {
                $user->forceFill([
                    'two_factor_code_hash' => null,
                    'two_factor_code_expires_at' => null,
                ])->save();
            }
        }

        if ($request->hasSession()) {
            Auth::login($user, $request->boolean('remember'));
            $request->session()->regenerate();
        }

        $user->forceFill(['last_login_at' => now()])->save();
        Log::channel('security')->notice('Authentication succeeded.', [
            'user_id' => $user->id,
            'role' => $user->role,
            'two_factor' => (bool) $user->two_factor_enabled,
            'ip' => $request->ip(),
        ]);

        return $this->success([
            'user' => $this->authUserPayload($user),
        ], 'Welcome back.');
    }

    public function me(Request $request): JsonResponse
    {
        return $this->success($this->authUserPayload($request->user()));
    }

    private function authUserPayload(User $user): User
    {
        $user->expireElapsedPaidAccess();
        $user->restorePrematurelyCancelledPaidAccess();
        $user->load(['providerProfile', 'activeSubscription.planDefinition']);
        $user->setAttribute('pending_paid_plan_selection', $this->hasPendingPaidPlanSelection($user));

        return $user;
    }

    private function hasPendingPaidPlanSelection(User $user): bool
    {
        if (! $user->isProvider() || $user->hasPaidPlan()) {
            return false;
        }

        return $user->subscriptions()
            ->whereIn('plan', ['paid', 'pro'])
            ->whereIn('status', ['expired', 'pending'])
            ->latest()
            ->get()
            ->contains(fn (Subscription $subscription): bool => (bool) ($subscription->metadata['selected_at_registration'] ?? false));
    }

    public function twoFactorStatus(Request $request): JsonResponse
    {
        $user = $request->user();

        return $this->success([
            'enabled' => (bool) $user->two_factor_enabled,
            'method' => $user->two_factor_method ?: 'email',
            'confirmed_at' => $user->two_factor_confirmed_at,
            'recovery_codes_count' => collect($user->two_factor_recovery_codes ?? [])->count(),
        ]);
    }

    public function requestAdminStepUpCode(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user?->isAdmin(), 403);

        if (! $user->two_factor_enabled) {
            return $this->success([
                'two_factor_enabled' => false,
                'two_factor_method' => null,
            ], 'Enter your current password to confirm this action.');
        }

        $method = $user->two_factor_method ?: 'email';
        if ($method === 'email') {
            $this->sendTwoFactorCode($user, 'admin-step-up');
        }

        return $this->success([
            'two_factor_enabled' => true,
            'two_factor_method' => $method,
        ], $method === 'email'
            ? 'A security code has been sent to your email.'
            : 'Enter the current code from your authenticator app.');
    }

    public function confirmAdminStepUp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'password' => ['required', 'string'],
            'code' => ['nullable', 'string', 'max:100'],
        ]);
        $user = $request->user();
        abort_unless($user?->isAdmin(), 403);
        abort_unless($request->hasSession(), 419, 'A browser session is required for this action.');

        if ((bool) config('security.admin_step_up.require_two_factor', false) && ! $user->two_factor_enabled) {
            return response()->json([
                'message' => 'Enable two-factor authentication before performing production-critical admin actions.',
                'code' => 'ADMIN_TWO_FACTOR_REQUIRED',
            ], 422);
        }

        abort_unless(Hash::check($validated['password'], $user->password), 422, 'The password is incorrect.');

        if ($user->two_factor_enabled) {
            $code = trim((string) ($validated['code'] ?? ''));
            abort_if($code === '', 422, 'Enter your two-factor authentication code.');
            $method = $user->two_factor_method ?: 'email';
            $usedRecoveryCode = false;
            $validCode = $method === 'totp'
                ? $this->validTotpCode($user, $code)
                : $this->validTwoFactorCode($user, $code);

            if (! $validCode) {
                $validCode = $this->useRecoveryCode($user, $code);
                $usedRecoveryCode = $validCode;
            }

            abort_unless($validCode, 422, 'The verification code is invalid or expired.');

            if ($method === 'email' && ! $usedRecoveryCode) {
                $user->forceFill([
                    'two_factor_code_hash' => null,
                    'two_factor_code_expires_at' => null,
                ])->save();
            }
        }

        $confirmedAt = now()->timestamp;
        $request->session()->put([
            'security.admin_step_up.user_id' => $user->id,
            'security.admin_step_up.confirmed_at' => $confirmedAt,
        ]);

        Log::channel('security')->notice('Admin identity re-confirmed for a sensitive action.', [
            'user_id' => $user->id,
            'two_factor' => (bool) $user->two_factor_enabled,
            'ip' => $request->ip(),
        ]);

        return $this->success([
            'expires_at' => now()->addSeconds(max(60, (int) config('security.admin_step_up.lifetime_seconds', 600))),
        ], 'Identity confirmed. You may continue.');
    }

    public function enableTwoFactor(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'method' => ['nullable', Rule::in(['email', 'totp'])],
        ]);
        $method = $validated['method'] ?? 'email';
        $user = $request->user();

        if ($method === 'totp') {
            $secret = $this->generateTotpSecret();
            $user->forceFill([
                'two_factor_method' => 'totp',
                'two_factor_totp_secret' => $secret,
                'two_factor_code_hash' => null,
                'two_factor_code_expires_at' => null,
            ])->save();

            return $this->success([
                'method' => 'totp',
                'secret' => $secret,
                'setup_uri' => $this->totpSetupUri($user, $secret),
            ], 'Add this setup key to your authenticator app, then enter the 6-digit code.');
        }

        $user->forceFill([
            'two_factor_method' => 'email',
            'two_factor_totp_secret' => null,
        ])->save();
        $this->sendTwoFactorCode($user, 'enable');

        return $this->success(['method' => 'email'], 'A confirmation code has been sent to your email.');
    }

    public function confirmTwoFactor(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string'],
            'method' => ['nullable', Rule::in(['email', 'totp'])],
        ]);
        $user = $request->user();
        $method = $validated['method'] ?? ($user->two_factor_method ?: 'email');

        $validCode = $method === 'totp'
            ? $this->validTotpCode($user, $validated['code'])
            : $this->validTwoFactorCode($user, $validated['code']);

        abort_unless($validCode, 422, 'The confirmation code is invalid or expired.');

        $recoveryCodes = $this->generateRecoveryCodes();

        $user->forceFill([
            'two_factor_enabled' => true,
            'two_factor_method' => $method,
            'two_factor_confirmed_at' => now(),
            'two_factor_code_hash' => null,
            'two_factor_code_expires_at' => null,
            'two_factor_recovery_codes' => $this->hashRecoveryCodes($recoveryCodes),
        ])->save();

        return $this->success([
            'enabled' => true,
            'method' => $method,
            'confirmed_at' => $user->two_factor_confirmed_at,
            'recovery_codes' => $recoveryCodes,
            'recovery_codes_count' => count($recoveryCodes),
        ], 'Two-factor authentication enabled.');
    }

    public function regenerateRecoveryCodes(Request $request): JsonResponse
    {
        $validated = $request->validate(['password' => ['required', 'string']]);
        $user = $request->user();

        abort_unless($user->two_factor_enabled, 422, 'Enable two-factor authentication before generating backup codes.');
        abort_unless(Hash::check($validated['password'], $user->password), 422, 'The password is incorrect.');

        $recoveryCodes = $this->generateRecoveryCodes();
        $user->forceFill([
            'two_factor_recovery_codes' => $this->hashRecoveryCodes($recoveryCodes),
        ])->save();

        return $this->success([
            'enabled' => true,
            'method' => $user->two_factor_method ?: 'email',
            'confirmed_at' => $user->two_factor_confirmed_at,
            'recovery_codes' => $recoveryCodes,
            'recovery_codes_count' => count($recoveryCodes),
        ], 'New backup codes generated.');
    }

    public function disableTwoFactor(Request $request): JsonResponse
    {
        $validated = $request->validate(['password' => ['required', 'string']]);
        abort_unless(Hash::check($validated['password'], $request->user()->password), 422, 'The password is incorrect.');

        $request->user()->forceFill([
            'two_factor_enabled' => false,
            'two_factor_method' => 'email',
            'two_factor_confirmed_at' => null,
            'two_factor_code_hash' => null,
            'two_factor_code_expires_at' => null,
            'two_factor_totp_secret' => null,
            'two_factor_recovery_codes' => null,
        ])->save();

        return $this->success(['enabled' => false, 'method' => 'email'], 'Two-factor authentication disabled.');
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();

        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        if (Auth::guard('web')->check()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return $this->success(null, 'You have been logged out.');
    }

    public function destroyAccount(Request $request, AccountDeletionService $accounts): JsonResponse
    {
        $validated = $request->validate([
            'password' => ['required', 'string'],
            'confirmation' => ['required', 'string', Rule::in(['DELETE'])],
        ]);
        $user = $request->user();

        abort_if($user->isAdmin(), 403, 'Administrator accounts cannot be deleted here.');
        abort_unless(Hash::check($validated['password'], $user->password), 422, 'The password is incorrect.');

        Log::channel('security')->notice('Account deletion requested.', [
            'user_id' => $user->id,
            'role' => $user->role,
            'ip' => $request->ip(),
        ]);

        $accounts->delete($user);

        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return $this->success(null, 'Your account has been permanently deleted.');
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);
        $user = $request->user();

        abort_unless(Hash::check($validated['current_password'], $user->password), 422, 'The current password is incorrect.');
        abort_if(Hash::check($validated['password'], $user->password), 422, 'Your new password must be different from your current password.');

        DB::transaction(function () use ($request, $user, $validated): void {
            $user->forceFill([
                'password' => $validated['password'],
                'remember_token' => Str::random(60),
                'pending_email' => null,
                'pending_email_token_hash' => null,
                'pending_email_expires_at' => null,
                'pending_email_change_context' => null,
            ])->save();
            $user->tokens()->delete();
            $this->deleteOtherDatabaseSessions($user, $request->hasSession() ? $request->session()->getId() : null);
        });

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        Log::channel('security')->notice('Login password changed.', [
            'user_id' => $user->id,
            'role' => $user->role,
            'ip' => $request->ip(),
        ]);
        $this->sendSecurityNotice($user, 'Your BeautyPro HQ password was changed', 'Your login password was changed. If this was not you, reset your password immediately and contact support.');

        return $this->success(null, 'Your password has been updated securely.');
    }

    public function requestEmailChange(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->isAdmin(), 403, 'Only an administrator can change a login email.');
        abort_if($user->login_email_changed_at, 422, 'The one-time administrator email change has already been used.');

        $request->merge([
            'email' => Str::lower(trim($request->string('email')->toString())),
        ]);
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'email' => ['required', 'email:rfc', 'max:255', Rule::unique('users', 'email'), Rule::unique('users', 'pending_email')->ignore($request->user()->id)],
        ]);
        $email = $validated['email'];

        abort_unless(Hash::check($validated['current_password'], $user->password), 422, 'The current password is incorrect.');
        abort_if(hash_equals(Str::lower($user->email), $email), 422, 'That is already your login email.');

        $token = Str::random(64);
        $user->forceFill([
            'pending_email' => $email,
            'pending_email_token_hash' => hash('sha256', $token),
            'pending_email_expires_at' => now()->addMinutes(60),
            'pending_email_change_context' => 'admin_self',
        ])->save();

        try {
            Notification::route('mail', $email)->notify(new EmailChangeVerificationNotification($user->id, $user->name, $token));
        } catch (\Throwable $exception) {
            $user->forceFill([
                'pending_email' => null,
                'pending_email_token_hash' => null,
                'pending_email_expires_at' => null,
                'pending_email_change_context' => null,
            ])->save();
            report($exception);

            return response()->json(['message' => 'The verification email could not be sent. Your login email was not changed.'], 422);
        }

        Log::channel('security')->notice('Login email change requested.', [
            'user_id' => $user->id,
            'role' => $user->role,
            'pending_email_hash' => hash('sha256', $email),
            'ip' => $request->ip(),
        ]);
        $this->sendSecurityNotice($user, 'Login email change requested', 'A request was made to change your BeautyPro HQ login email. The current email remains active until the new address is verified. If this was not you, change your password immediately.');

        return $this->success([
            'email' => $user->email,
            'pending_email' => $email,
            'pending_email_expires_at' => $user->pending_email_expires_at,
        ], 'Check the new inbox and confirm the verification link within 60 minutes.');
    }

    public function requestManagedEmailChange(Request $request, User $user): JsonResponse
    {
        $admin = $request->user();
        abort_unless($admin?->isAdmin(), 403);
        abort_if($admin->is($user), 422, 'Use Settings → Security for your own one-time administrator email change.');
        abort_if($user->isAdmin() && $user->login_email_changed_at, 422, 'This administrator’s one-time email change has already been used.');

        $request->merge([
            'email' => Str::lower(trim($request->string('email')->toString())),
        ]);
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'email' => ['required', 'email:rfc', 'max:255', Rule::unique('users', 'email'), Rule::unique('users', 'pending_email')->ignore($user->id)],
        ]);
        abort_unless(Hash::check($validated['current_password'], $admin->password), 422, 'Your administrator password is incorrect.');
        abort_if(hash_equals(Str::lower($user->email), $validated['email']), 422, 'That is already this user’s login email.');

        $token = Str::random(64);
        $user->forceFill([
            'pending_email' => $validated['email'],
            'pending_email_token_hash' => hash('sha256', $token),
            'pending_email_expires_at' => now()->addMinutes(60),
            'pending_email_change_context' => 'admin_managed',
        ])->save();

        try {
            Notification::route('mail', $validated['email'])->notify(new EmailChangeVerificationNotification($user->id, $user->name, $token));
        } catch (\Throwable $exception) {
            $user->forceFill([
                'pending_email' => null,
                'pending_email_token_hash' => null,
                'pending_email_expires_at' => null,
                'pending_email_change_context' => null,
            ])->save();
            report($exception);

            return response()->json(['message' => 'The verification email could not be sent. The user’s login email was not changed.'], 422);
        }

        Log::channel('security')->notice('Administrator requested a user login email change.', [
            'administrator_id' => $admin->id,
            'user_id' => $user->id,
            'pending_email_hash' => hash('sha256', $validated['email']),
            'ip' => $request->ip(),
        ]);
        $this->sendSecurityNotice($user, 'Administrator requested a login email change', 'An administrator requested a change to your BeautyPro HQ login email. Your current email remains active until the new address is verified. Contact support if you did not expect this request.');

        return $this->success([
            'email' => $user->email,
            'pending_email' => $user->pending_email,
            'pending_email_expires_at' => $user->pending_email_expires_at,
        ], 'Verification sent. The current login email remains active until the new address is confirmed.');
    }

    public function verifyEmailChange(Request $request, User $user, string $token): RedirectResponse
    {
        $result = DB::transaction(function () use ($user, $token): string {
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $context = $user->pending_email_change_context;
            $validContext = $context === 'admin_managed'
                || ($context === 'admin_self' && $user->isAdmin() && ! $user->login_email_changed_at);

            if (
                ! $validContext
                || blank($user->pending_email)
                || blank($user->pending_email_token_hash)
                || ! $user->pending_email_expires_at?->isFuture()
                || ! hash_equals($user->pending_email_token_hash, hash('sha256', $token))
            ) {
                return 'invalid';
            }

            if (User::where('email', $user->pending_email)->whereKeyNot($user->id)->exists()) {
                return 'taken';
            }

            $oldEmail = $user->email;
            $user->forceFill([
                'email' => $user->pending_email,
                'email_verified_at' => now(),
                'pending_email' => null,
                'pending_email_token_hash' => null,
                'pending_email_expires_at' => null,
                'pending_email_change_context' => null,
                'login_email_changed_at' => $user->isAdmin() ? now() : $user->login_email_changed_at,
                'remember_token' => Str::random(60),
            ])->save();
            $user->tokens()->delete();
            $this->deleteOtherDatabaseSessions($user);

            Log::channel('security')->notice('Login email changed.', [
                'user_id' => $user->id,
                'old_email_hash' => hash('sha256', Str::lower($oldEmail)),
                'new_email_hash' => hash('sha256', Str::lower($user->email)),
            ]);

            return 'changed';
        });

        $frontend = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return redirect()->away($frontend.'/login?'.http_build_query([
            $result === 'changed' ? 'email_changed' : 'email_change_error' => $result === 'changed' ? '1' : $result,
        ]));
    }

    private function deleteOtherDatabaseSessions(User $user, ?string $exceptSessionId = null): void
    {
        if (config('session.driver') !== 'database' || ! Schema::hasTable((string) config('session.table', 'sessions'))) {
            return;
        }

        DB::table((string) config('session.table', 'sessions'))
            ->where('user_id', $user->id)
            ->when($exceptSessionId, fn ($query) => $query->where('id', '!=', $exceptSessionId))
            ->delete();
    }

    private function sendSecurityNotice(User $user, string $title, string $message): void
    {
        try {
            $user->notify(new PlatformUpdateNotification($title, $message));
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);
        Password::sendResetLink(['email' => Str::lower(trim($request->string('email')->toString()))]);

        return $this->success(null, 'If that email is registered, a password reset link has been sent.');
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);
        $validated['email'] = Str::lower(trim($validated['email']));

        $status = Password::reset($validated, function (User $user, string $password): void {
            $user->forceFill([
                'password' => Hash::make($password),
                'remember_token' => Str::random(60),
                'pending_email' => null,
                'pending_email_token_hash' => null,
                'pending_email_expires_at' => null,
                'pending_email_change_context' => null,
            ])->save();
            $user->tokens()->delete();
            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['message' => __($status)], 422);
        }

        return $this->success(null, __($status));
    }

    public function sendVerification(Request $request): JsonResponse
    {
        if ($request->user()->hasVerifiedEmail()) {
            return $this->success(null, 'Email address is already verified.');
        }

        try {
            $request->user()->sendEmailVerificationNotification();
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Verification email could not be sent. Check the email connection settings and try again.',
            ], 422);
        }

        return $this->success(null, 'Verification link sent.');
    }

    public function verifyEmail(Request $request, int $id, string $hash): JsonResponse
    {
        if (! $this->hasValidEmailVerificationSignature($request, $id, $hash)) {
            return response()->json(['message' => 'This verification link is invalid or has expired. Please request a new verification email.'], 403);
        }

        $user = User::find($id) ?? $this->userForVerificationHash($hash);

        if (! $user || ! hash_equals($hash, sha1($user->getEmailForVerification()))) {
            return response()->json(['message' => 'Invalid verification link.'], 403);
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
            event(new Verified($user));
        }

        return $this->success($user, 'Email address verified.');
    }

    private function hasValidEmailVerificationSignature(Request $request, int $id, string $hash): bool
    {
        if (URL::hasValidRelativeSignature($request)) {
            return true;
        }

        $queryString = (string) $request->server->get('QUERY_STRING');
        $paths = [
            "/api/email/verify/{$id}/{$hash}",
            "/email/verify/{$id}/{$hash}",
            "/verify-email/{$id}/{$hash}",
        ];

        foreach ($paths as $path) {
            $candidate = Request::create($path.($queryString !== '' ? "?{$queryString}" : ''), 'GET');
            if (URL::hasValidRelativeSignature($candidate)) {
                return true;
            }
        }

        return false;
    }

    private function userForVerificationHash(string $hash): ?User
    {
        return User::query()
            ->select(['id', 'email', 'email_verified_at'])
            ->cursor()
            ->first(fn (User $user): bool => hash_equals($hash, sha1($user->getEmailForVerification())));
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'beauty-pro';
        $slug = $base;
        $counter = 1;

        while (ProviderProfile::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$counter++;
        }

        return $slug;
    }

    private function sendEmailVerificationAfterResponse(User $user): void
    {
        if ($user->hasVerifiedEmail()) {
            return;
        }

        dispatch(function () use ($user): void {
            try {
                $user->sendEmailVerificationNotification();
            } catch (\Throwable $exception) {
                report($exception);
            }
        })->afterResponse();
    }

    private function sendAdminRegistrationNoticeAfterResponse(User $user): void
    {
        dispatch(function () use ($user): void {
            try {
                User::where('role', 'admin')->where('is_active', true)->get()->each->notify(new PlatformUpdateNotification(
                    'New user registration',
                    "{$user->name} registered as a {$user->role}.",
                    'View users',
                    rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/users',
                    ['user_id' => $user->id, 'role' => $user->role],
                ));
            } catch (\Throwable $exception) {
                report($exception);
            }
        })->afterResponse();
    }

    private function sendTwoFactorCode(User $user, string $purpose): void
    {
        $code = (string) random_int(100000, 999999);
        $user->forceFill([
            'two_factor_code_hash' => Hash::make($code),
            'two_factor_code_expires_at' => now()->addMinutes(10),
        ])->save();
        $user->notify(new TwoFactorCodeNotification($code, $purpose));
    }

    private function validTwoFactorCode(User $user, string $code): bool
    {
        return filled($user->two_factor_code_hash)
            && $user->two_factor_code_expires_at
            && now()->lessThanOrEqualTo($user->two_factor_code_expires_at)
            && Hash::check(trim($code), $user->two_factor_code_hash);
    }

    private function generateRecoveryCodes(): array
    {
        return collect(range(1, 8))
            ->map(fn () => strtoupper(Str::random(5).'-'.Str::random(5)))
            ->all();
    }

    private function hashRecoveryCodes(array $codes): array
    {
        return collect($codes)
            ->map(fn (string $code) => Hash::make($this->normaliseRecoveryCode($code)))
            ->all();
    }

    private function useRecoveryCode(User $user, string $code): bool
    {
        $codes = collect($user->two_factor_recovery_codes ?? []);
        $normalised = $this->normaliseRecoveryCode($code);
        $matchedIndex = $codes->search(fn (string $hash) => Hash::check($normalised, $hash));

        if ($matchedIndex === false) {
            return false;
        }

        $remaining = $codes->reject(fn ($_hash, int $index) => $index === $matchedIndex)->values()->all();
        $user->forceFill(['two_factor_recovery_codes' => $remaining])->save();

        return true;
    }

    private function normaliseRecoveryCode(string $code): string
    {
        return strtoupper(preg_replace('/[^A-Z0-9]/', '', $code));
    }

    private function generateTotpSecret(): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $bytes = random_bytes(20);
        $bits = '';

        foreach (str_split($bytes) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }

        return collect(str_split($bits, 5))
            ->map(fn (string $chunk) => $alphabet[bindec(str_pad($chunk, 5, '0'))])
            ->implode('');
    }

    private function totpSetupUri(User $user, string $secret): string
    {
        $issuer = 'BeautyPro HQ';
        $label = $issuer.':'.$user->email;

        return 'otpauth://totp/'.rawurlencode($label).'?'.http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => 6,
            'period' => 30,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    private function validTotpCode(User $user, string $code): bool
    {
        $secret = $user->two_factor_totp_secret;
        $code = preg_replace('/\s+/', '', $code);

        if (! $secret || ! preg_match('/^\d{6}$/', $code)) {
            return false;
        }

        $counter = intdiv(time(), 30);

        for ($window = -1; $window <= 1; $window++) {
            if (hash_equals($this->totpCode($secret, $counter + $window), $code)) {
                return true;
            }
        }

        return false;
    }

    private function totpCode(string $secret, int $counter): string
    {
        $key = $this->base32Decode($secret);
        $binaryCounter = pack('N2', intdiv($counter, 0x100000000), $counter % 0x100000000);
        $hash = hash_hmac('sha1', $binaryCounter, $key, true);
        $offset = ord(substr($hash, -1)) & 0x0F;
        $value = unpack('N', substr($hash, $offset, 4))[1] & 0x7FFFFFFF;

        return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
    }

    private function base32Decode(string $secret): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = strtoupper(preg_replace('/[^A-Z2-7]/', '', $secret));
        $bits = '';

        foreach (str_split($secret) as $char) {
            $position = strpos($alphabet, $char);
            if ($position === false) {
                continue;
            }
            $bits .= str_pad(decbin($position), 5, '0', STR_PAD_LEFT);
        }

        $decoded = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $decoded .= chr(bindec($byte));
            }
        }

        return $decoded;
    }
}
