# MACTORY FATCH — Marketplace Workflow Implementation Report

Date: 29 October 2026

## Implemented in this release

### 1. End-to-end RFQ delivery
- Buyer RFQs submit to a server API rather than being treated as only local drafts.
- The API validates required fields, quantity/date, selected factory and same-origin requests.
- RFQs are stored in the private `public.factory_rfqs` Supabase table.
- Only approved, publicly listed factories that separately opt in to RFQ notifications can be selected.
- Factory business email is retained in a separate private column only after the factory has consented to public listing and RFQ notification.
- The factory receives a Resend email containing the RFQ and a single-use response link.
- The buyer receives a private tracking link and email receipt when delivery is configured.
- Notification failures are recorded; the UI does not claim delivery when it failed.

### 2. Factory response and buyer tracking
- `respond.html` lets a factory submit one response using the emailed signed link.
- `rfq-status.html` shows status and any saved supplier response using the buyer's signed private link.
- Bearer tokens are kept in URL fragments and sent in request bodies rather than query strings, reducing exposure in web server access logs.
- Buyer tracking links expire after 180 days; factory response links expire after 14 days and are single-use.
- RFQ records are scheduled for deletion after `RFQ_RETENTION_DAYS` (default 365 days; bounded to 90–730 days).

### 3. Admin operations
- Admin console now includes an RFQ operations panel showing request status, notification status/errors and supplier responses.
- Admins can retry a failed factory notification; retry creates a fresh response link.
- Production admin sign-in requires a TOTP authenticator code as a second factor; Vercel production sign-in is blocked if `ADMIN_TOTP_SECRET` is missing.
- The admin still uses a shared secret; individual staff accounts and per-admin roles are not implemented yet.

### 4. Consent, privacy and configuration
- Added a separate optional factory consent checkbox for private RFQ email routing.
- Public factory responses expose only whether enquiries are accepted, not the private email.
- RFQ submission uses a shared Supabase-backed rate limiter with hashed client identifiers; the cleanup job removes old rate-limit buckets.
- Health endpoint reports whether RFQ/email/admin-MFA/shared-rate-limit configuration is present without revealing secret values.
- Added updated Supabase schema, Vercel function settings, environment template and deployment instructions.

## Files and endpoints added/updated

- `api/rfqs.js`
- `api/rfqs/status.js`
- `api/rfqs/respond.js`
- `api/admin/rfqs.js`
- `lib/rfq-service.cjs`
- `lib/totp.cjs`
- `respond.html`
- `rfq-status.html`
- `sql/supabase-schema.sql`
- `manufacturers.html`, `workspace.html`, `admin.html`, `assets/app.js`
- `api/admin/session.js`, `api/health.js`, `api/maintenance/retention.js`, `server.js`
- `README.md`, `START-HERE.txt`, `.env.example`

## Verification performed

- Node syntax checks passed for the updated server, storage module, RFQ APIs, admin APIs, service helpers and frontend JavaScript.
- Inline JavaScript in `admin.html`, `respond.html` and `rfq-status.html` passed `node --check`.
- TOTP helper passed the RFC test vector; signed RFQ link purpose checks passed.
- Local HTTP smoke checks returned 200 for home, workspace, response and tracking pages.
- Invalid tracking token was rejected.
- RFQ submission for a nonexistent/non-accepting factory was rejected.
- A mocked end-to-end integration test exercised RFQ creation, factory email, buyer receipt, the exact factory response link, single-use response submission, and buyer status/response retrieval. This used mocked Supabase and email responses, not live services.
- No live Supabase database, Resend account, Vercel deployment or real factory email was connected during these tests. End-to-end delivery is therefore **implemented but not production-verified**.

## Required before live use

1. Run the complete updated `sql/supabase-schema.sql` in the correct Supabase project.
2. Configure Vercel environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_TOKEN`
   - `DATA_RETENTION_HMAC_KEY`
   - `CRON_SECRET`
   - `SITE_URL`
   - `RFQ_TOKEN_SECRET`
   - `RATE_LIMIT_HMAC_KEY`
   - `RFQ_RETENTION_DAYS` (optional; defaults to 365)
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `ADMIN_TOTP_SECRET`
3. Verify the sender domain in Resend. Generate separate random secrets for `ADMIN_TOKEN`, `DATA_RETENTION_HMAC_KEY`, `CRON_SECRET`, `RFQ_TOKEN_SECRET`, and `ADMIN_TOTP_SECRET`; do not reuse one secret for every purpose.
4. Redeploy and check `/api/health`. Confirm `rfqConfigured`, `emailConfigured` and `adminMfaConfigured` are true.
5. Re-onboard previously approved factories that had their email scrubbed. They must explicitly opt in to RFQ notifications; do not restore their email from backups without appropriate consent.
6. Submit a test RFQ to a consenting test factory, confirm factory email delivery, respond from the one-time link, and confirm the buyer can see the response. Test notification retry and retention cleanup.
7. Configure a commercial Vercel plan if required by the current plan terms before commercial operation.

## Intentionally deferred

- Individual named admin accounts, roles and per-admin MFA enrollment.
- Shared/durable rate limiting for registration and admin login, plus bot protection (RFQ submission has a Supabase-backed limiter; other limits remain process-local).
- Buyer accounts and buyer email verification; first version uses guest RFQs and private bearer links.
- Factory-owned image uploads and certificate/document uploads. These are intentionally not enabled until factory ownership/authentication, private storage, validation/scanning, access control, and deletion workflows are implemented.
- Automated GST, Udyam or MCA record checks. Human reviewers must still inspect official sources; format checks are not verification.
- Verified supplier data seeding: the directory remains empty until real factories consent and pass review.

## Operational caveat

Do not use the local JSON store for production or submit sensitive drawings, identity documents, or confidential trade secrets. Keep the Supabase service-role key server-side. The project is not deployed to the user's live Vercel/Supabase accounts by this artifact.


## Universal manufacturing taxonomy release addendum — 29 October 2026

The platform scope is cross-industry and nationwide, not limited to a pilot vertical. The shared taxonomy in `assets/manufacturing-taxonomy.json` now contains **52 manufacturing families and 406 example subcategories**, including perfumes/fragrances, pens/writing instruments, books/paper, bottles and packaging, plastics, fibres/yarn, wood/timber, hardware, technical/precision parts, metals, chemicals, machinery, electronics, construction products, mining/minerals, energy and contract manufacturing. It includes an extensible `Other / not listed` route.

- Factory onboarding now supports multi-category selection using a searchable checkbox picker, plus fields for product/subcategory examples, products/components, materials, industries served and capability keywords.
- Server-side validation uses the same taxonomy as the frontend. Up to 30 categories may be selected per factory.
- Buyer category filtering is populated from the taxonomy; text search includes product, category, subcategory, materials, process, capacity and capability fields.
- Public factory profiles expose the additional consented public capability fields.
- SEO category routing and sitemap generation use the same taxonomy. Empty category pages stay `noindex`; the sitemap only includes category pages with approved, public factories.
- The directory still contains no seeded or fabricated factory profiles. Nationwide and all-industry scope is supported, but actual supplier coverage depends on real factories joining and being approved.

Verification of this addendum: Node syntax checks passed for the updated app, store and SEO modules; test payload validation accepted multiple known categories and rejected unknown categories; local smoke tests returned HTTP 200 for home, categories, taxonomy JSON and factory-owner pages. Live Vercel/Supabase behavior has not been tested.
