<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Services\GoogleOAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GoogleAuthSettingsController extends Controller
{
    public function show(GoogleOAuthService $google): JsonResponse
    {
        return $this->success($this->payload($google));
    }

    public function update(Request $request, GoogleOAuthService $google): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
            'client_id' => ['nullable', 'string', 'max:500'],
            'client_secret' => ['nullable', 'string', 'max:1000'],
        ]);

        $clientId = trim((string) ($validated['client_id'] ?? '')) ?: config('services.google.client_id');
        $clientSecret = filled($validated['client_secret'] ?? null)
            ? trim($validated['client_secret'])
            : $google->clientSecret();
        if ($validated['enabled'] && (blank($clientId) || blank($clientSecret))) {
            return response()->json([
                'message' => 'Add both the Google client ID and client secret before enabling Google authentication.',
                'errors' => ['client_secret' => ['Google authentication credentials are incomplete.']],
            ], 422);
        }

        AppSetting::setValue('google.client_id', trim((string) ($validated['client_id'] ?? '')) ?: null);
        if (filled($validated['client_secret'] ?? null)) {
            AppSetting::setValue('google.client_secret', trim($validated['client_secret']), true);
        }
        AppSetting::setValue('google.enabled', $validated['enabled'] ? '1' : '0');

        return $this->success($this->payload($google), 'Google authentication settings saved.');
    }

    private function payload(GoogleOAuthService $google): array
    {
        return [
            'enabled' => $google->enabled(),
            'configured' => $google->configured(),
            'client_id' => $google->clientId(),
            'client_secret_configured' => filled($google->clientSecret()),
            'javascript_origin' => $google->javascriptOrigin(),
            'redirect_uri' => $google->redirectUri(),
            'client_id_source' => filled(AppSetting::getValue('google.client_id')) ? 'admin_settings' : (filled(config('services.google.client_id')) ? 'env' : null),
            'client_secret_source' => filled(AppSetting::getValue('google.client_secret')) ? 'admin_settings' : (filled(config('services.google.client_secret')) ? 'env' : null),
        ];
    }
}
