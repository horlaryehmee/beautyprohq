<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProviderProfile;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
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
            'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
            'role' => ['required', Rule::in(['provider'])],
            'plan' => ['nullable', Rule::in(['free', 'paid'])],
        ]);
        $validated['email'] = Str::lower(trim($validated['email']));
        $validated['plan'] = $validated['plan'] ?? 'free';

        $user = DB::transaction(function () use ($validated): User {
            $selectedPlan = $validated['plan'];
            unset($validated['plan']);
            $user = User::create($validated + [
                'preferred_currency' => config('currencies.default', 'NGN'),
                'email_verified_at' => now(),
            ]);

            if ($user->isProvider()) {
                ProviderProfile::create([
                    'user_id' => $user->id,
                    'slug' => $this->uniqueSlug($user->name),
                    'profession' => 'Beauty Professional',
                    'default_currency' => config('currencies.default', 'NGN'),
                ]);

                $plan = SubscriptionPlan::where('key', $selectedPlan)->first()
                    ?? SubscriptionPlan::where('key', 'free')->first();

                if ($plan) {
                    Subscription::create([
                        'user_id' => $user->id,
                        'subscription_plan_id' => $plan->id,
                        'plan' => $plan->key,
                        'status' => $plan->key === 'paid' ? 'expired' : 'active',
                        'amount' => $plan->key === 'paid' ? $plan->price : 0,
                        'currency' => $plan->currency,
                        'starts_at' => $plan->key === 'paid' ? null : now(),
                        'metadata' => $plan->key === 'paid' ? ['selected_at_registration' => true] : null,
                    ]);
                }
            }

            return $user;
        });

        event(new Registered($user));
        if ($request->hasSession()) {
            Auth::login($user);
            $request->session()->regenerate();
        }

        return $this->success([
            'user' => $user->load(['providerProfile', 'activeSubscription.planDefinition']),
            'token' => $user->createToken('beautypro-web')->plainTextToken,
        ], 'Account created. Please verify your email address.', 201);
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', Str::lower(trim($credentials['email'])))->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            return response()->json(['message' => 'The provided credentials are incorrect.'], 422);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'This account has been disabled.'], 403);
        }

        if ($request->hasSession()) {
            Auth::login($user, $request->boolean('remember'));
            $request->session()->regenerate();
        }

        $user->forceFill(['last_login_at' => now()])->save();

        return $this->success([
            'user' => $user->load(['providerProfile', 'activeSubscription.planDefinition']),
            'token' => $user->createToken('beautypro-web')->plainTextToken,
        ], 'Welcome back.');
    }

    public function me(Request $request): JsonResponse
    {
        return $this->success($request->user()->load(['providerProfile', 'activeSubscription.planDefinition']));
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

        $request->user()->sendEmailVerificationNotification();

        return $this->success(null, 'Verification link sent.');
    }

    public function verifyEmail(Request $request, int $id, string $hash): JsonResponse
    {
        $user = User::findOrFail($id);

        if (! hash_equals($hash, sha1($user->getEmailForVerification()))) {
            return response()->json(['message' => 'Invalid verification link.'], 403);
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
            event(new Verified($user));
        }

        return $this->success($user, 'Email address verified.');
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
}
