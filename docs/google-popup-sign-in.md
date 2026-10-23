# Google popup sign-in rollout

Popup sign-in uses Google's hosted Identity Services button and sends a signed ID token as JSON to `POST /api/auth/google/popup`. It does not navigate to `/auth/google/callback`. Laravel verifies the RS256 signature against Google's cached public keys, issuer, audience, expiry, authorized party when present, verified email, and a ten-minute browser-session nonce. Both popup endpoints retain session, CSRF and rate-limit middleware. A nonce can be consumed only once.

The existing account linking, registration, provider onboarding and two-factor code is shared with redirect sign-in. Calendar and Workspace authorization continue using their existing OAuth flows. Popup sign-in defaults to off, including on existing installations.

## Deploy and enable

1. Back up the current release and use the existing cPanel deployment process. Include `composer.json`, `composer.lock`, application changes and the rebuilt `public/build` assets. The release requires `composer install --no-dev --prefer-dist --optimize-autoloader` to install `firebase/php-jwt`. No database migrations or reseeding are needed for this change.
2. In Google Cloud Console, open the **existing Web application OAuth client**. Add `https://beautyprohq.com` to **Authorized JavaScript origins** (no path or trailing slash). If users actually access `https://www.beautyprohq.com`, add that origin too. Keep existing redirect URIs for rollback, Calendar and Workspace.
3. For local testing, use `http://localhost:8000` and add both `http://localhost` and `http://localhost:8000` as authorized origins. Google Console changes can take time to propagate.
4. In **Admin → Settings → Authentication**, enable **Use Google popup sign-in** and save. Keep **Enable Google authentication** enabled. Existing client ID and secret are reused.
5. In a fresh browser tab, log in with an existing Google-linked account. Confirm the role dashboard opens. Check a two-factor account still stops at its verification screen. Check registration and booking return navigation with test accounts.
6. Confirm the browser makes a JSON POST to `/api/auth/google/popup` and does not navigate to the old callback. Do not copy ID tokens into tickets or logs. If the host still returns 406, record the path, timestamp and request/rule ID, and have the host tune the specific false positive. API requests are still inspected by ModSecurity.

The server must reach `https://www.googleapis.com/oauth2/v3/certs` over validated HTTPS and have PHP OpenSSL available. The application CSP permits Google's documented GIS script, style, connection and frame sources; the existing popup-compatible opener policy is retained. If hosting adds a second CSP header, it must allow these sources too.

## Rollback and user fallback

Uncheck **Use Google popup sign-in** and save, then reload the sign-in page. This restores the previous redirect button without changing accounts, passwords, client credentials or linked Google IDs. Email/password login remains available in either mode. If the previous callback is still blocked, users can use email/password while hosting investigates.

Expired sessions, blocked scripts and verification failures show an error with a reload action. Signing in in a second tab can replace the first tab's pending nonce; reload the first tab before retrying. A completed popup flow reloads the destination to refresh the application's authenticated state.

## Validation

Run `php artisan test --compact --filter=Google` and `npm run build`. Automated signed-token tests use ephemeral RSA test keys and mocked Google public keys; they do not establish compatibility with the live firewall or replace a real Google account sign-in after deployment.

References: [Google token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS setup and CSP](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference).
