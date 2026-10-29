# MACTORY FATCH — Multi-page Industrial Heritage prototype

This is a multi-page static-first website with an optional Node.js AI API. The manufacturer directory is intentionally **empty**: no business is registered in this build, and it does not show fictional names, fake ratings, fabricated MOQs, invented lead times, or made-up match scores.

## Pages

- `index.html` — homepage and clear routes for buyers and factory owners.
- `buyers.html` — empty registered directory, sourcing-brief builder, and optional source-linked public supplier research.
- `factory.html` — honest empty-profile state plus generic educational imagery about what buyers should inspect.
- `manufacturers.html` — factory-owner onboarding form that submits applications into a private pending-review queue. No automatic registration or approval.
- `admin.html` — private, token-protected review console (not linked from public navigation). Approved applications appear in the public directory only if publication consent was recorded.
- `workspace.html` — local RFQ drafts, notes/status, and CSV export. Drafts are not sent to suppliers.
- `privacy.html` — prototype-specific data-handling notice.
- `terms.html` — prototype terms and sourcing limitations.
- `about.html` — product purpose and current limitations.
- `contact.html` — local feedback note form, not connected to a support inbox.

Shared styling and interactions are in `assets/site.css` and `assets/app.js`. Industrial photographs are embedded as local files under `assets/`; they are AI-generated illustrations and must not be used as evidence of a supplier's actual premises, products, certifications, or capabilities.

## Run locally on Windows

1. Extract the ZIP fully (do not open files inside the ZIP preview).
2. Install Node.js 20 or newer if needed.
3. Double-click `START-MACTORY-FATCH.bat`. It checks for Node.js, starts the local server if one is not already listening, and opens `http://127.0.0.1:8000`.
4. Keep the server terminal running while using the website.

See `START-HERE.txt` for troubleshooting. You can also run `node server.js` in a terminal opened at this folder and then navigate to `http://127.0.0.1:8000`.

Opening `index.html` directly shows the static pages, but the AI API requires the local server.

## Optional AI

The default model is `gpt-6-luna`, intended for cost-sensitive high-volume tasks. API billing is separate from a ChatGPT subscription.

1. Copy `.env.example` to `.env`. Set both `ADMIN_TOKEN` and `DATA_RETENTION_HMAC_KEY` to separate long random secrets before accepting factory submissions. Generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Add `OPENAI_API_KEY=...` and keep `OPENAI_MODEL=gpt-6-luna` unless you intentionally choose another supported model.
3. Restart `node server.js`.
4. On `buyers.html`, tick the AI consent box before using either AI action.

Brief extraction is a narrowly scoped structured-output task. Supplier research is a separate, explicit action with web search and a cap of three preliminary leads. It costs more than local parsing because web-search tool calls are billed separately. Cache repeated briefs/results, do not auto-run research on every keystroke, and configure provider usage limits and alerts.

No AI response may create a registered manufacturer record, claim that a company is verified, or invent unsupported company details. Research results are candidate leads only, and their sources must be inspected manually.

## Deploying to Vercel

The multi-page HTML/CSS/JS and local photos are static assets. The `api/` directory contains Vercel Node.js Functions for optional buyer AI tools, registration intake, the public approved-factory directory, and the private admin review queue. Vercel can host these routes without running the local long-lived `server.js` process.

1. Push this project to a private/public Git repository and import it into Vercel.
2. Create a Supabase project, run `sql/supabase-schema.sql` in its SQL editor, and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN`, `DATA_RETENTION_HMAC_KEY`, `CRON_SECRET`, and `SITE_URL` in Vercel environment variables.
3. Redeploy after setting environment variables. The registration queue will not work until the database, admin token and retention HMAC secret are configured. Re-run the updated SQL script to add the fingerprint column/index safely to an existing table.
4. `OPENAI_API_KEY` is optional and only enables the separate buyer brief/research features. The registration screening and admin approval workflow do not call an AI model.

**Plan limitation:** Vercel Hobby is free but its official terms limit it to personal, non-commercial use. It can suit a personal/college prototype preview, but do not assume it is permitted for operating a commercial MACTORY FATCH business; use a commercial plan or a host whose terms fit that use. See https://vercel.com/docs/plans/hobby and https://vercel.com/pricing.

**API safety limitation:** the bundled API adds input limits and best-effort per-instance request throttling, but it is not a complete abuse-prevention system. Before allowing public users to spend from your API key, add durable rate limiting (per account/IP), authentication or abuse controls, monitoring, and provider spend limits. Do not treat this demo as production-ready.

## Data and limitations

- The directory contains zero registered manufacturers. This is intentional and truthful.
- Local RFQs, profile drafts, and feedback notes use browser `localStorage`; they are not sent to MACTORY FATCH or suppliers.
- Registration-number checks catch some malformed identifiers but do not query MCA, GST, Udyam, or other government records.
- There are no production user accounts, secure document upload, email delivery, live RFQ dispatch, or automated government verification. A basic private admin review queue exists, but its shared-token authentication must be replaced with proper admin accounts before public production use.
- Optional AI brief/research requests are sent to OpenAI only when the user checks consent and triggers the action. Avoid confidential drawings, personal data, or trade secrets in this prototype.
- `privacy.html` documents the prototype, not a production legal policy. Before public launch, identify the legal operator/contact, map actual vendor data flows, retention and deletion, access controls, and obtain legal review.

## Preview files

- `preview/homepage.png` — rendered homepage preview.
- `preview/buyers-empty.png` — rendered empty directory and sourcing UI.

The previews are screenshots of this local build. They are not a simulated view of registered factories.


## Manufacturer onboarding status (important)

The factory-owner form collects a product category and product name. Applications are submitted to `/api/registrations`, stored in a private review queue, and remain **pending — not registered or verified**. A deterministic rules-based screen flags missing fields, suspicious placeholder wording, duplicates, and identifier-format issues. It does not use AI/ML and does not query government registries. Only an authorized administrator can change status. Approval requires a manual-check confirmation plus detailed evidence notes; do not approve until you have checked official identity records and factory/certification evidence. Applicants must separately consent to the limited public profile fields; contact details, registration identifiers, and full street addresses are never returned by the public directory API.

### Private review queue and persistence

- Local development: copy `.env.example` to `.env` and set `ADMIN_TOKEN` to a long random secret before accepting submissions; otherwise registration intake returns a clear configuration error. Submissions persist to `data/registrations.json` on the server. Open `/admin.html` and enter the token. Keep the data folder private and backed up.
- Vercel/shared deployment: configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_TOKEN` as server environment variables. Run `sql/supabase-schema.sql` in the Supabase SQL editor first. The schema includes `public_listing_consent`; if you created an earlier version of the table, add that boolean column before using this build. The service-role key is server-only and must never be put in HTML or client JavaScript. If Supabase is not configured on Vercel, submission endpoints return a configuration error rather than silently losing submissions in ephemeral storage.
- Screening is rules-based, not AI or ML. This is intentional: without a labelled dataset of real fraud/legitimate cases, a trained ML model would be guesswork. Rules are cheap, explainable, and only triage applications. A human must inspect evidence. The admin console is a prototype and should be hardened with real admin authentication, audit logging, durable rate limits, backups, and secure evidence storage before public launch. The public `/api/factories` endpoint returns only approved records with publication consent, and excludes personal contact details, registration numbers and full street addresses.


## Typed validation and lightweight motion (latest update)

- Manufacturer submissions are checked server-side against an explicit field schema: strings and length limits, enumerated entity/product categories, email, phone, optional HTTPS website, and positive whole-number MOQ. Registration type must be compatible with the selected legal entity. The browser's own validation is not trusted as the security boundary.
- Valid schema means only that the submitted data has the expected shape. It does **not** prove that the business or registration is genuine; all applications remain pending until manual evidence checks and authorized approval.
- Added subtle CSS/IntersectionObserver reveal transitions and small hover lifts without third-party animation libraries. Animations are disabled for `prefers-reduced-motion` and content remains visible if JavaScript or IntersectionObserver is unavailable.


## SEO and readable public URLs (added)

### Readable routes
- `/customer` — buyer portal.
- `/factoryowner` — factory-owner portal.
- `/categories` — manufacturing category index.
- `/category/<category-slug>` — server-rendered category landing page.
- `/factory/<factory-slug>` — server-rendered public factory profile.
- `/sitemap.xml` — generated XML sitemap.
- `/robots.txt` — crawler rules and sitemap location.

Category pages are generated from the approved public directory. Empty categories intentionally return `noindex,follow` until there are public factory listings, so the site does not ask search engines to index thin, empty category pages. Individual profiles are only rendered from approved submissions with public-listing consent. Pending applications never appear publicly. The profile page says "Approved public listing"; it does not falsely imply every certificate or capability is independently verified.

### Configure before production
1. Set `SITE_URL` in Vercel Environment Variables to the exact canonical production origin, for example `https://your-real-domain.example` (replace this example with your actual domain). Do not include a path or trailing slash.
2. Ensure the domain is attached to the Vercel project and HTTPS works.
3. The current static-page canonical/Open Graph tags use the intended `https://mactoryfatch.com` origin. If you deploy to a different canonical domain, update those tags in the static HTML files and set `SITE_URL` to that same origin. Dynamic category/factory pages, sitemap and robots use `SITE_URL` or the incoming host.
4. Deploy and test these URLs directly: `/categories`, `/category/metal-products-components`, `/factory/<real-approved-slug>`, `/sitemap.xml`, `/robots.txt`. A factory URL should return 404/noindex until an approved, public factory exists.
5. In Google Search Console, verify the domain/property, submit `/sitemap.xml`, inspect the homepage and category index, then monitor Page Indexing and Search Performance. Indexing and ranking are not guaranteed.
6. Use only original, accurate factory data. Do not fabricate supplier profiles, certification claims, reviews, stock levels or production capacity. The directory is allowed to remain empty until real approved listings exist.

### Local test
Run `node server.js`, then test `/categories`, `/category/metal-products-components`, `/sitemap.xml` and `/robots.txt`. The category page should honestly show the empty-state when no factories are approved. The factory detail route should return a not-found page for an unknown slug.

### Important current limitation
The public directory still depends on the existing private registration-review store and the `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` configuration for persistent Vercel data. These SEO routes do not replace production database setup, access-control review, email delivery, real RFQ dispatch, or end-to-end testing. Before indexing factory pages, approve actual factory submissions with publication consent and verify their public information.


## Security and factory-data minimization (added)

### Admin credential
- `ADMIN_TOKEN` is a server-side secret: local development uses `.env`; Vercel uses Project → Settings → Environment Variables.
- Never place the token in HTML, JavaScript, `localStorage`, `sessionStorage`, source control, screenshots or support messages.
- The admin page sends the token once to `/api/admin/session`. The server exchanges it for a 30-minute `HttpOnly`, `SameSite=Strict` cookie (`Secure` on HTTPS). The token is not persisted in browser storage. Sign out to clear the cookie; token rotation invalidates current sessions.
- Configure `DATA_RETENTION_HMAC_KEY` as a separate long random secret. It fingerprints registration identifiers for duplicate detection after the raw identifier is deleted. Keep it stable; rotating it requires a migration if duplicate matching must continue.

Generate secrets locally in a terminal; do not send them to ChatGPT:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run this separately for `ADMIN_TOKEN`, `DATA_RETENTION_HMAC_KEY`, and `CRON_SECRET`. Store local values in `.env` (ignored by Git) and production values in Vercel Environment Variables. Redeploy after updating Vercel variables.

### What data is collected
- The current factory form collects text fields only. It does **not** upload ID documents, certificates, bank documents, or factory drawings.
- Before review, the pending record contains the information submitted for verification in the private store. Do not expose the local JSON store or use real sensitive submissions in local development.
- Public-listing consent is optional and separate from application review. A factory can request private verification without agreeing to public display.
- On approval, raw registration numbers, GSTIN/Udyam identifiers, contact name, role, email, phone, full business/factory addresses, and free-text notes are scrubbed. If publication consent was given, only the public-profile fields remain; if not, the profile payload is cleared.
- On rejection, the submitted payload, raw registration number, legal name and free-text reviewer notes are scrubbed immediately. A minimal decision/status record remains temporarily.
- Pending and needs-more-information applications are eligible for deletion 90 days after original submission. Rejected status records are eligible for deletion after 30 days. Cleanup runs on registration/admin-queue use and through a daily Vercel cron at 03:00 UTC when scheduled functions are available and `CRON_SECRET` is configured.
- Approved public listings remain until corrected/removed. A keyed HMAC fingerprint (not the raw registration number) is retained on approved records for duplicate prevention.
- Reviewers should record only public source URLs, check dates and whether information matched. Do not paste registration numbers, phone numbers, emails, or private document contents into reviewer notes. The retained note is sanitized, but sanitization is not perfect.
- No retention system can promise instant deletion from backups, logs or provider-managed infrastructure. Configure provider retention and backup policies separately.

### Required production steps
1. Run `sql/supabase-schema.sql` in the production Supabase project.
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN`, `DATA_RETENTION_HMAC_KEY`, `CRON_SECRET`, and `SITE_URL` in Vercel Environment Variables. Keep all secrets server-side.
3. Redeploy. Confirm `/api/health` reports the expected storage mode and registration intake works.
4. Test admin sign-in, refresh, sign-out, and expiration. The admin token should not appear in browser storage or subsequent request headers.
5. Test one controlled submission using non-sensitive test data, approve it, and verify the stored row no longer contains raw registration/contact/address fields. Then delete the test row.
6. Verify the daily cron in Vercel logs. If scheduled functions are not available on your plan, set up an external scheduler that calls `/api/maintenance/retention` with `Authorization: Bearer <CRON_SECRET>`.
7. Before public launch, replace the prototype privacy notice with a reviewed policy naming the legal operator and a monitored privacy contact. Add proper administrator accounts/MFA and an incident-response process before handling sensitive evidence.

### Limits
This hardening reduces the amount of sensitive data retained and prevents browser storage of the admin token. It does not make the app “unhackable,” encrypt the local JSON file, secure a compromised administrator's device, or guarantee deletion from provider backups. Do not collect copies of identity documents until a dedicated, access-controlled evidence workflow has been designed and reviewed.

Additional minimization: the initial registration form no longer asks for full street addresses. Reviewers should compare the legal entity and official registry information through authorized/public sources and request an address only if a later, justified verification step requires it and a secure process exists.


## RFQ delivery workflow (new)

The buyer workspace now submits RFQs to a selected approved factory only when that factory has explicitly opted in to receive enquiries. The request is stored in `public.factory_rfqs`, the factory receives an email with a one-time response link, and the buyer gets a private tracking link to view status and any response. The admin console includes RFQ operations, notification-failure visibility, and a retry action. Existing browser-only drafts remain local and are not retroactively sent.

### Required production configuration for RFQs

Set these Vercel environment variables for Production (and Preview only if you intentionally test there):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never expose it in browser code)
- `SITE_URL` (canonical HTTPS production origin)
- `RFQ_TOKEN_SECRET` (a separate random secret used to sign buyer tracking and factory response links)
- `RATE_LIMIT_HMAC_KEY` (separate random secret used to hash rate-limit identifiers)
- `RFQ_RETENTION_DAYS` (optional; defaults to 365 days)
- `RESEND_API_KEY`
- `EMAIL_FROM` (a sender address on a domain verified with Resend)

Generate each random secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (run separately for `RFQ_TOKEN_SECRET` and `RATE_LIMIT_HMAC_KEY`). Keep `RFQ_TOKEN_SECRET` stable while links are active. Run the complete `sql/supabase-schema.sql` in the correct Supabase project before deploying. The SQL adds the private factory notification consent/contact fields and the `factory_rfqs` table.

Factories must tick the separate optional RFQ-notification consent box before their email is retained for routing. For already-approved legacy factories, the previous privacy scrubbing removed contact email; those factories must update/re-submit their details and opt in before they can receive enquiries. Do not rehydrate old contact details from backups without a valid legal basis and consent.

### RFQ endpoints

- `POST /api/rfqs` — validates and stores an enquiry, then attempts factory and buyer emails.
- `POST /api/rfqs/status` — returns limited status/response for a signed private buyer link. Tokens are kept in URL fragments and sent in request bodies rather than query strings.
- `POST /api/rfqs/respond` — accepts a single factory response from the emailed link.
- `GET /api/admin/rfqs` — admin-only RFQ operations list.
- `POST /api/admin/rfqs` with `{ "id": "..." }` — retries a failed factory notification with a fresh response link.

The API reports notification failures rather than claiming delivery. RFQ records are automatically deleted after `RFQ_RETENTION_DAYS` (default 365, bounded to 90–730 days) by the retention job. Admin retry requires a valid admin session. Public tracking pages are `rfq-status.html` and `respond.html`; both are noindex.

### Known items intentionally deferred

- Durable shared rate limiting / bot protection: the current RFQ and registration limits are process-local and do not coordinate across serverless instances. Add a shared rate-limit provider before a high-traffic launch.
- Individual admin accounts and MFA: the current admin login remains a shared-secret session; use individual Supabase Auth users and MFA before adding more staff.
- Factory-owned image/document uploads: not enabled yet. Do not accept anonymous file uploads until factory ownership/authentication, private storage buckets, file validation/scanning, access policies, retention, and delete workflows are implemented.
- Automated GST/Udyam/MCA checks: the app still requires a documented manual check; format validation is not registry verification.
- Production launch requires configuring a commercial Vercel plan where required, real email sender/domain, live Supabase SQL, and end-to-end tests on the deployed domain.


### Admin MFA

The production admin sign-in now requires a TOTP authenticator code as a second factor. Set `ADMIN_TOTP_SECRET` to a unique Base32 secret before deploying the production admin console; Vercel production sign-in is intentionally blocked when it is missing. Generate a Base32 secret with:

```sh
node -e "const c=require('crypto');const b=c.randomBytes(20);const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=[...b].map(x=>x.toString(2).padStart(8,'0')).join(''),o='';for(let i=0;i<bits.length;i+=5)o+=a[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)];console.log(o)"
```

Add the secret to an authenticator app using a manually configured TOTP entry for MACTORY FATCH. The admin still uses a shared credential; individual named accounts and per-admin permissions remain future work. Keep the Base32 secret private and plan a recovery process before relying on MFA.


## Universal manufacturing taxonomy

The current taxonomy is maintained in `assets/manufacturing-taxonomy.json` and is shared by the browser and server validation. It includes 52 top-level manufacturing families and 406 example subcategories. Factory owners can select multiple families and describe products, materials, processes, industries served and capabilities. Add new category families or subcategories to this JSON file; do not create fake factory listings to fill empty categories. Individual category pages remain noindex until they contain approved public supplier listings.
