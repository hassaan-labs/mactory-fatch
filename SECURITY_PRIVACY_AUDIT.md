# MACTORY FATCH — Security and privacy hardening report

## Changes made in this build

1. **Admin credential**
   - Removed the `x-admin-token` header flow and browser `sessionStorage` persistence.
   - The admin page sends the secret once to `/api/admin/session`; the backend exchanges it for a signed 30-minute `HttpOnly`, `SameSite=Strict` cookie, marked `Secure` on HTTPS.
   - Added same-origin checks, sign-out, login rate limiting and a Vercel health endpoint.
   - The raw token is not returned by the API or stored in browser storage.

2. **Collect less**
   - Removed full registered-business and factory street-address fields from the initial factory registration form. City/state remain.
   - Public-listing consent is optional and independent from the accuracy/privacy declarations. Private verification can be requested without public listing consent.
   - The current form accepts text fields only; it has no document-upload feature.

3. **Scrub data after review**
   - On approval, raw registration identifiers, GSTIN/Udyam, contact name, role, email, phone, notes and other private fields are removed.
   - If the factory gave public-listing consent, only the approved public-profile fields remain. Without consent, the profile payload is cleared.
   - On rejection, the submitted payload, raw registration number, legal name and free-text reviewer note are scrubbed immediately.
   - A keyed HMAC fingerprint is retained for approved records to reduce duplicate submissions without retaining the raw registration identifier. It is hidden from admin API responses.
   - Reviewer evidence notes are reduced to a sanitized summary; the UI instructs reviewers not to paste private identifiers or contact data.

4. **Retention and deletion**
   - Pending/needs-more-information records are eligible for deletion 90 days after initial submission.
   - Rejected minimal status records are eligible for deletion after 30 days.
   - Added a daily Vercel cron endpoint protected by `CRON_SECRET`; cleanup also runs on registration intake and admin queue access.
   - Added a permanent-delete action in the admin queue.

5. **Security and operational fixes**
   - Added a baseline Content Security Policy and HSTS at the Vercel edge.
   - Added `/api/health` to expose configuration readiness without revealing secret values.
   - Added a unique partial index for the HMAC registration fingerprint to reduce duplicate-submission races in Supabase.
   - Replaced overconfident “Verified by MACTORY FATCH” and “Certifications reviewed” labels with “Approved public listing” and “Certifications declared by supplier”.
   - Updated the privacy notice and deployment instructions.

## Verification performed

- Node syntax checks passed for the server, store, registration/admin/maintenance/SEO handlers and client JavaScript.
- Inline JavaScript in `admin.html` passed syntax validation.
- Local HTTP smoke tests passed for `/`, `/categories`, category pages, `/sitemap.xml`, `/robots.txt`, admin login, cookie-authenticated admin access, rejection of the old token-header flow, and sign-out.
- A controlled test submission without public-listing consent was approved privately; the stored record no longer contained the raw registration number, contact details or private payload. A deletion test also passed.
- Temporary test records and local data files were removed before packaging.

## Remaining production blockers — not silently assumed complete

- The package has **not** been deployed to the actual Vercel project or connected to the user's live Supabase project.
- Run the updated `sql/supabase-schema.sql` against the production database before deploying. This adds the `registration_fingerprint` column and unique index.
- Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN`, `DATA_RETENTION_HMAC_KEY`, `CRON_SECRET`, and `SITE_URL` in Vercel Environment Variables, then redeploy.
- Verify the cron actually runs in Vercel logs. If scheduled functions are unavailable on the chosen plan, use a trusted external scheduler to call `/api/maintenance/retention` with `Authorization: Bearer <CRON_SECRET>`.
- Local `data/registrations.json` is not encrypted at rest. Use only fictional test records locally; use private database storage for production.
- The admin workflow still uses one shared operator secret rather than individual accounts/MFA. Restrict access and rotate `ADMIN_TOKEN` if it has ever been exposed.
- Sanitization of free-text review notes is best-effort, not perfect. Reviewers must enter only public source references and match outcomes.
- Deletion from the live database does not guarantee immediate deletion from provider backups, infrastructure logs or third-party systems; configure those retention controls separately.
- The legal operator, monitored privacy contact, final policy review, backup/restore test, durable abuse controls, and production security review are still required before inviting factories to submit real sensitive information.


## Release addendum — RFQ workflow and MFA (29 October 2026)

See `IMPLEMENTATION_REPORT.md` for the new RFQ delivery workflow, signed buyer tracking and factory response links, private RFQ contact-consent field, admin RFQ queue/retry, TOTP admin second factor, test results, production configuration, and intentionally deferred work. This release has not been connected to the live Supabase or Resend accounts and is not production-verified.
