<?php

namespace App\Services;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class GoogleIdTokenVerifier
{
    private const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

    private const CACHE_KEY = 'google_signin_jwks';

    private function signingKeys(bool $refresh = false): array
    {
        $cached = Cache::get(self::CACHE_KEY);
        if (! $refresh && is_array($cached)) {
            return JWK::parseKeySet($cached, 'RS256');
        }

        $response = Http::acceptJson()->connectTimeout(5)->timeout(10)->get(self::CERTS_URL)->throw();
        $jwks = $response->json();
        $keys = JWK::parseKeySet($jwks, 'RS256');
        preg_match('/max-age=(\d+)/i', (string) $response->header('Cache-Control'), $matches);
        $ttl = max(1, min(86400, (int) ($matches[1] ?? 300) - (int) $response->header('Age')));
        Cache::put(self::CACHE_KEY, $jwks, $ttl);

        return $keys;
    }

    public function verify(#[\SensitiveParameter] string $token, string $clientId, string $nonce): array
    {
        $stage = 'token_header';
        try {
            $segments = explode('.', $token);
            if (count($segments) !== 3) {
                throw new \UnexpectedValueException('Malformed token.');
            }
            $header = json_decode(JWT::urlsafeB64Decode($segments[0]), true, 16, JSON_THROW_ON_ERROR);
            if (($header['alg'] ?? null) !== 'RS256' || ! is_string($header['kid'] ?? null)) {
                throw new \UnexpectedValueException('Invalid signing algorithm or key.');
            }
            $stage = 'signing_keys';
            $keys = $this->signingKeys();
            if (! isset($keys[$header['kid']])) {
                // Refresh once on rotation, but limit arbitrary key IDs from flooding Google.
                if (! Cache::add(self::CACHE_KEY.':refresh', true, 60)) {
                    throw new \UnexpectedValueException('Signing key unavailable.');
                }
                $keys = $this->signingKeys(true);
            }
            $stage = 'signature';
            $profile = (array) JWT::decode($token, $keys);
            $stage = 'claims';
            if (! in_array($profile['iss'] ?? null, ['accounts.google.com', 'https://accounts.google.com'], true)
                || ($profile['aud'] ?? null) !== $clientId
                || (isset($profile['azp']) && $profile['azp'] !== $clientId)
                || ! is_numeric($profile['exp'] ?? null) || $profile['exp'] <= time()
                || ! is_string($profile['nonce'] ?? null) || ! hash_equals($nonce, $profile['nonce'])
                || ! is_string($profile['sub'] ?? null) || $profile['sub'] === ''
                || ! is_string($profile['email'] ?? null) || ! filter_var($profile['email'], FILTER_VALIDATE_EMAIL)
                || ($profile['email_verified'] ?? null) !== true) {
                throw new \UnexpectedValueException('Invalid Google identity claims.');
            }

            return $profile;
        } catch (\Throwable $exception) {
            // Do not include tokens or remote response bodies in logs or validation errors.
            Log::channel('security')->warning('Google popup token verification failed.', [
                'reason' => match (true) {
                    $exception instanceof \Illuminate\Http\Client\ConnectionException => 'key_connection',
                    $exception instanceof \Illuminate\Http\Client\RequestException => 'key_response',
                    $exception instanceof \Firebase\JWT\SignatureInvalidException => 'signature',
                    $exception instanceof \Firebase\JWT\ExpiredException => 'expired',
                    $exception instanceof \UnexpectedValueException => 'claims_or_key',
                    default => 'verification',
                },
                'exception_type' => get_class($exception),
                'stage' => $stage,
                'error_detail' => $exception instanceof \Error ? match (true) {
                    str_contains($exception->getMessage(), 'Class') => 'missing_class',
                    str_contains($exception->getMessage(), 'undefined function') => 'missing_function',
                    str_contains($exception->getMessage(), 'undefined method') => 'missing_method',
                    default => 'runtime_error',
                } : null,
            ]);
            throw ValidationException::withMessages([
                'credential' => 'Google sign-in could not be verified. Reload this page and try again, or use email and password.',
            ]);
        }
    }
}
