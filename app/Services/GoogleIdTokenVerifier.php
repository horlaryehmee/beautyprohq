<?php

namespace App\Services;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class GoogleIdTokenVerifier
{
    private const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

    private const CACHE_KEY = 'google_signin_jwks';

    public function verify(#[\SensitiveParameter] string $token, string $clientId, string $nonce): array
    {
        try {
            $segments = explode('.', $token);
            if (count($segments) !== 3) {
                throw new \UnexpectedValueException('Malformed token.');
            }
            $header = json_decode(JWT::urlsafeB64Decode($segments[0]), true, 16, JSON_THROW_ON_ERROR);
            if (($header['alg'] ?? null) !== 'RS256' || ! is_string($header['kid'] ?? null)) {
                throw new \UnexpectedValueException('Invalid signing algorithm or key.');
            }
            $jwks = Cache::get(self::CACHE_KEY);
            $keys = is_array($jwks) ? JWK::parseKeySet($jwks, 'RS256') : [];
            if (! isset($keys[$header['kid']])) {
                // Refresh on rotation, but prevent arbitrary key IDs from flooding Google.
                if (! Cache::add(self::CACHE_KEY.':refresh', true, 60)) {
                    throw new \UnexpectedValueException('Signing key unavailable.');
                }
                $response = Http::acceptJson()->connectTimeout(5)->timeout(10)->get(self::CERTS_URL)->throw();
                $jwks = $response->json();
                $keys = JWK::parseKeySet($jwks, 'RS256');
                preg_match('/max-age=(\d+)/i', $response->header('Cache-Control'), $matches);
                $ttl = max(1, min(86400, (int) ($matches[1] ?? 300) - (int) $response->header('Age')));
                Cache::put(self::CACHE_KEY, $jwks, $ttl);
            }
            $profile = (array) JWT::decode($token, $keys);
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
        } catch (\Throwable) {
            // Do not include tokens or remote response bodies in logs or validation errors.
            throw ValidationException::withMessages([
                'credential' => 'Google sign-in could not be verified. Reload this page and try again, or use email and password.',
            ]);
        }
    }
}
