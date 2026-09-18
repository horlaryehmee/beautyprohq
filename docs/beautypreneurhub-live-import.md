# Beautypreneurhub live import

The admin importer transfers the prepared Beautypreneurhub listings, their photos,
categories, contact details and working hours into the database configured on the
live Laravel installation. It does not run the demo seeder or replace the live database.

## Prepare and deploy

1. Run `php artisan beautypreneurhub:export` on the local installation containing
   the imported data. The private package is written to
   `storage/app/private/migrations/beautypreneurhub.zip`. It contains contact
   information and images, but no passwords, sessions, payment data or claim tokens.
   Keep this file out of Git and public web directories.
2. Deploy the code and built frontend assets to live, then run
   `php artisan migrate --force`. Ensure `php artisan storage:link` has been run.
3. Enable PHP's ZIP extension and allow at least 25 MB uploads (`upload_max_filesize`
   and `post_max_size`, plus any web-server request limit). The prepared package is
   approximately 9 MB. Configure live email delivery for listing claims.

## Apply once

Open **Admin → Settings → General → Beautypreneurhub migration**, select the ZIP,
and click **Import Beautypreneurhub data**. The existing admin identity confirmation
applies to this operation. The result shows created and preserved listing counts.
The import button disappears after the transaction completes and stays hidden
after refreshing or signing in again. A second request is rejected by the server.

Source listing IDs identify duplicates across environments. Existing listings,
including claimed profiles, are preserved rather than overwritten. Existing users
are never reassigned or given a replacement password. If a source email already
belongs to an account, the new listing receives a temporary internal login address;
its claim link is still delivered to the original source email. Its owner supplies
a different login email and verifies it, as in the existing claim flow.

New accounts are active, non-demo providers with the normal free plan. Owners use
**Claim a listing** to prove email ownership, accept the terms and set their own
password. They can then manage their profile and use standard provider features,
subject to the same verification and subscription requirements as other providers.
Importing does not send emails automatically or grant a paid subscription.

The database import and completion marker are transactional. On failure, the
button remains available for retry. Image writes use validated, content-addressed
filenames; a failed database transaction may leave unused images, which a retry
can safely reuse. Never reset the completion marker to overwrite owner edits.
