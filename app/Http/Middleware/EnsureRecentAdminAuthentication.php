<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRecentAdminAuthentication
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user?->isAdmin(), 403);

        $targetUser = $request->route('user');
        if ($targetUser instanceof User && (int) $targetUser->id === (int) $user->id) {
            return $next($request);
        }

        $requiresTwoFactor = (bool) config('security.admin_step_up.require_two_factor', false);
        if ($requiresTwoFactor && ! $user->two_factor_enabled) {
            return response()->json([
                'message' => 'Enable two-factor authentication before performing production-critical admin actions.',
                'code' => 'ADMIN_TWO_FACTOR_REQUIRED',
            ], 428);
        }

        $confirmedAt = $request->hasSession()
            ? (int) $request->session()->get('security.admin_step_up.confirmed_at', 0)
            : 0;
        $confirmedUser = $request->hasSession()
            ? (int) $request->session()->get('security.admin_step_up.user_id', 0)
            : 0;
        $lifetime = max(60, (int) config('security.admin_step_up.lifetime_seconds', 600));

        if ($confirmedUser !== (int) $user->id || $confirmedAt < now()->timestamp - $lifetime) {
            return response()->json([
                'message' => 'Confirm your identity to continue with this sensitive admin action.',
                'code' => 'ADMIN_STEP_UP_REQUIRED',
                'data' => [
                    'two_factor_enabled' => (bool) $user->two_factor_enabled,
                    'two_factor_method' => $user->two_factor_enabled ? ($user->two_factor_method ?: 'email') : null,
                ],
            ], 428);
        }

        return $next($request);
    }
}
