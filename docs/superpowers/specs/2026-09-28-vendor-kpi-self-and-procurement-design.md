# Vendor KPI: self assessment and Procurement rating

Date: 2026-09-28  
Status: Approved; correction implemented in Mode A
Classification: High risk cross-stack workflow (external email link, token access, permissions, and new persistent scores).

## Decision summary

Add a vendor-specific KPI workflow to the shared vendor registry. An execution vendor or supplier submits a self assessment through a single-use emailed link without an account. Procurement and the sole active Super Admin see that submission and can save a separate Procurement assessment. Each side scores every category from 0 to 100; the backend calculates an equally weighted average for each side. The **Procurement average is the official Vendor KPI** shown in internal directories and the average-KPI overview; the self average remains visibly separate. The user confirmed this scoring rule and requested staff functionality on both web and mobile. The external vendor form is a responsive web page.

This extends the current vendor record by stable vendor ID and leaves the existing staff task KPI separate. The request email goes only to the saved vendor-profile email. The link grants access to one minimal vendor summary and one self assessment, expires after 24 hours, and is consumed when saved.

## Current behavior and evidence

The bullets below record the original pre-implementation baseline. The current behavior for the requested correction is documented in the next section.

- `frontend/src/features/procurement/vendorDirectoryColumns.tsx` renders every Vendor KPI cell as `Not available`. `VendorDirectoryOverview.tsx` renders the Average KPI tile as `Not available`. The vendor name is plain text; view/edit currently opens `ProcurementVendorEditor` from `ProcurementVendorDirectory.tsx`, not a dedicated page.
- `backend/src/domain/project-vendor-suggestions.ts` and `backend/src/services/project-vendor-suggestions.service.ts` hardcode `kpi: { status: "not_rated", score: null }`. There is no stored vendor performance score. The existing `backend/src/domain/kpi.ts` rates employee tasks and must not be reused as a vendor rubric.
- The canonical vendor ID, type, profile email, basket selections, and sensitive fields live in `backend/src/models/AiEstimatorKnowledgeVendor.ts` and `shared/knowledge/knowledgeTypes.ts`. Directory list projections already omit private identity, banking, contact, and file details. Some existing/quick-added vendors may lack a complete profile or email.
- The web route registry has Procurement and Super Admin vendor lists at `/procurement/vendors` and `/admin/procurement/vendors`. The mobile app has the corresponding Procurement vendor workspace and Super Admin Configuration vendor editor. Current relevant web/backend/shared target files are clean. The worktree already contains uncommitted mobile Procurement code and `mobile/.expo/dev/logs/start.log`; those changes are prior work to preserve, not a license to overwrite.
- The backend already has SMTP/SendGrid mail transports and single-use hashed-token patterns in user invitations and password reset. Public web token pages such as `/reset-password` live outside the protected route registry and remove the token from the visible URL after capture. Vendor KPI needs its own restricted token and mail contract, not a user account or a password-reset token.

## Requested correction: vendor identity, review display, and self-assessment profile

**Current implemented behavior and evidence.** `frontend/src/features/procurement/vendorDirectoryColumns.tsx` places the generated vendor code beneath the vendor name. It renders the lifecycle badge `Active` and a second `Under Review` label whenever physical-address verification is not true. The native Procurement list in `mobile/src/features/procurement/ProcurementVendorsWorkspace.tsx` and the Super Admin Configuration vendor list in `mobile/src/features/knowledge/KnowledgeReusableValues.tsx` also print the code beneath the name. `frontend/src/features/procurement/VendorKpiPublicPage.tsx` renders the code, work profile, Main Basket, and Sub Basket from the token-scoped inspection response. The public fields are defined in `shared/knowledge/vendorKpi.ts`, `backend/src/contracts/vendor-kpi.ts`, and `backend/src/services/vendor-kpi.service.ts` and documented in `backend/src/openapi/vendor-kpi.ts`.

**Proposed behavior for this correction.** The vendor-name row/card displays the name without the generated code or immutable ID beneath it, on web and the native Procurement/Configuration vendor lists. Stable IDs and codes remain available for internal routing, search, audit, and API joins. This is a display change, not a vendor identity migration.

In staff vendor lists, show **one primary status**. An archived vendor shows `Archived`; an inactive vendor shows `Inactive`; an active vendor whose `currentAddressVerifiedPhysically` is not true shows `Under Review`; an active verified vendor shows `Active`. The `Active` badge must never appear alongside `Under Review`. The backend lifecycle, eligibility rules, status filters, and directory-count definitions stay unchanged; the UI derives the label from the saved lifecycle and verification flag.

The external vendor's one-time KPI form shows **vendor name, vendor type, work profile, representative name, and representative position** as read-only basic vendor details. The user selected these exact fields. It does not show the Lisno-generated vendor code, Main Basket, or Sub Basket. It does not expose email, phone, address, Aadhaar, PAN, bank details, GST details, private files, or staff ratings. The token-scoped backend response is an explicit minimal projection from the matched vendor profile, never a full profile object. Missing legacy representative or position values show `Not recorded` without blocking a valid assessment. Internal staff detail may retain basket context because it is relevant to Procurement.

**Compatibility and risk.** Removing public response fields changes the inspection DTO shared by backend and web; update the shared/backend contracts, OpenAPI, projection, and public form together. Keep the hashed single-use token, no-store/no-referrer policy, authentication boundaries, scores, email flow, and saved assessments intact. No migration or historical KPI rewrite is needed. Tests must assert the public response contains exactly the approved basic fields and excludes Lisno classification and sensitive fields. Rendered web and native checks must verify the row/card name and one-status display for unverified active, verified active, inactive, and archived vendors.

## Actors and scope

| Actor | Allowed result |
| --- | --- |
| External vendor/supplier with emailed token | Inspect a limited vendor summary, enter their own rubric scores, submit once before expiry, and see a receipt. No login, staff score, private vendor profile, or other vendor access. |
| Procurement role | Open a vendor detail page, view both completed assessments, save/revise the Procurement assessment, and request the vendor self assessment when it is missing. |
| Sole active Super Admin | The same KPI read/rate/request actions through the Super Admin vendor route. Existing operation-specific Super Admin checks continue to apply. |
| Other staff roles | No new vendor KPI detail, score, request, or public-link issuance capability. Existing vendor suggestion access does not imply KPI access. |

Scope includes backend domain, persistence, APIs, route-operation authorization, audit, mail delivery, shared/client contracts, web staff detail and public form, native staff detail/actions, directory/overview score display, and focused tests. A vendor account, automated task KPI reuse, recommendations/ranking, purchase-order/finance calculations, public file access, and production email or data operations are outside this change. Existing vendor create/edit/archive and mobile Procurement changes remain intact.

## Rubric and score contract

The vendor's saved `procurementProfile.vendorType` selects the rubric. Labels follow the example supplied by the user; spelling is normalized for the interface.

| Execution vendor (4 categories) | Supplier (5 categories) |
| --- | --- |
| Timeline | Rates offered |
| Quality | Service communication |
| Budget | Delivery coordination |
| Site discipline (reports and people on time) | Defect liability addressal |
|  | Commitment to timelines |

- Both sides answer the **same rubric for that vendor type** independently. Every category is required before Save and is an integer from 0 to 100 inclusive. Blank is different from zero. Optional assessment comments are bounded and kept separate by source.
- Backend derives the side's average as `sum(category scores) / category count`, represented in hundredths of a point (0–10000 integer) and displayed with up to two decimals. Four and five category rubrics both have exact hundredth-point means for integer answers. The official `Vendor KPI` is the current Procurement assessment average only. Never blend self and Procurement values or manufacture an official score from a self submission.
- The rubric has an explicit version on each assessment and request. Changing vendor type after any assessment requires a deliberate new assessment under the new rubric; the prior result remains audited history and is not silently reinterpreted. The current score is unavailable until the applicable new rubric has a completed Procurement assessment.
- An assessment has vendor ID, source (`vendor_self` or `procurement`), rubric type/version, category values, derived average, server timestamp, revision, and attribution (staff actor ID or request ID). Keep immutable historical revisions and a current pointer/version or equivalent CAS. Staff saves create a new revision; concurrent edits conflict rather than overwrite.
- Existing vendors start with `Not rated` and need no bulk backfill. A vendor lacking valid type or saved email cannot receive a request; staff sees a specific prompt to complete the existing vendor profile. Archived vendors retain history but cannot receive new requests or new scores.

## End-to-end workflow and availability

1. From either staff vendor list, activating the **vendor name** opens a dedicated vendor page under that role's existing Procurement route. The page presents basic vendor identity/classification, the current self and Procurement category tables and averages, saved timestamps, and the official score. The existing Edit vendor action remains available separately. In the mobile vendor list, tapping the vendor opens the corresponding native detail view; no new root tab is added.
2. A staff user with the rate permission enters or revises all Procurement category values and selects **Save Procurement KPI**. The server validates rubric, vendor identity/type/status, complete 0–100 values, version/CAS, and actor; persists a revision and audit in one transaction; derives and returns the score. The page, directory cell, overview average, and mobile views refresh from the stored result. Failed/uncertain writes do not show a fabricated success.
3. **Request KPI from vendor** appears beside the vendor name on internal views only while the current-rubric self assessment is absent and the vendor has a valid saved email/type. A pending unexpired request shows its delivery/expiry state and a controlled resend action instead of generating repeated mail. This interprets the user's “after next client name” as “next to the vendor name”; approval of this specification confirms that placement. Staff can still rate even if the self assessment is absent.
4. Request uses the saved profile email, preflights an enabled mailer, applies a per-vendor/recipient cooldown, creates a 256-bit random token whose **hash alone** is stored, and sends one link to a responsive public form. A resend supersedes the previous generation. A disabled mailer creates no request, token, audit, or email. A send failure leaves no actionable token and reports a retryable delivery state. Email delivery is not triggered by creating a vendor; only the authorized Request KPI action sends it.
5. The link has a 24-hour lifetime and is single use. The browser captures the fragment token in memory, removes it from the address bar/history immediately, and sends it only in POST bodies to inspect/submit endpoints. The public page displays only vendor name, type, work profile, representative name, and representative position. It never returns the generated vendor code, Lisno baskets, address, phone, email, Aadhaar, PAN, bank data, GST details, private files, staff score, or another vendor's data. It uses a no-index/no-referrer policy and contains no authenticated app navigation.
6. The vendor enters all self scores and selects **Save Vendor KPI**. An atomic submission checks token hash, delivery status, expiry, generation, vendor ID/type/email snapshot/status, and single-use state; creates the self revision/audit and consumes the token together. A concurrent or repeated submission cannot create a second score. A retry after an uncertain response may return the same receipt for the same submission key, but cannot edit the score. Expired/revoked/used links show a neutral unavailable state and no private summary.
7. After self save, Procurement and Super Admin detail/mobile views show the self values and average on refresh; the directory row indicates **Self submitted** while official KPI remains `Not rated` until staff has scored. The Request button disappears for the completed current rubric. When the staff assessment exists, the directory and overview use its official average. Existing suggestion placeholders must not claim a vendor is unrated when an authorized current score exists; update authorized consumers from this source without granting other roles new score access or enabling automatic recommendations.

## APIs, permissions, persistence, and failure handling

- Add protected KPI read, staff-save, and request/resend operations under a vendor-ID resource (proposed `GET /procurement/vendor-kpis/:vendorId`, `PUT /procurement/vendor-kpis/:vendorId/procurement`, `POST /procurement/vendor-kpis/:vendorId/requests`). Add independent `procurement.vendor_kpi.read`, `.rate`, and `.request` permissions for Procurement and Super Admin only. Synchronize the route-operation registry, frontend/mobile authorization mirrors, and OpenAPI. Backend checks are authoritative; both clients hide actions when permission is absent and remove private content on 401/403.
- Add token-scoped unauthenticated inspect/submit POST operations under a public vendor KPI resource. Strip ambient Authorization headers, reject missing/invalid tokens uniformly, rate limit, and return only the minimal public projection. The token never appears in server logs, URL query strings, analytics, audit metadata, or response bodies after submission.
- Store assessments and request/delivery state in dedicated indexed records tied to the immutable vendor ID; do not place scores in the mutable vendor profile or expose token hashes in vendor DTOs. Keep one current assessment per vendor/source/rubric, immutable revisions, unique active request generation, and CAS/idempotency. The score projection may extend the safe internal list/overview DTO, but sensitive profile details remain detail-only. Audit request, delivery, submission, and staff revision with safe IDs, actor/source, version, and outcome.
- Handle profile email/type changes and archive by revoking outstanding links. Concurrent request/resend/save must resolve to one actionable generation or one submitted self assessment. Delivery status distinguishes pending, sent, failed, expired, superseded, and consumed. A mailer exception or response loss must never silently mark a self score as saved.
- Keep query keys scoped by user/environment and invalidate vendor detail, directory, overview, and any authorized KPI consumer after staff or self save. The public form does not cache another vendor's response. No migration of existing vendor records is required; add indexes/model initialization and default unrated projection. Backend/contract rollout precedes web/mobile clients. Rollback may hide the new UI/endpoints while retaining append-only assessment history; never coerce saved scores into the unrelated employee KPI.

## UX and verification

Reuse the current Procurement vendor directory's typography, surfaces, form fields, button styles, status/empty messages, and responsive spacing. The web detail page uses the same hierarchy as the existing vendor screen; the mobile detail uses the established native controls. Each rating table clearly labels **Your self rating** or **Procurement rating**, category names, the 0–100 input scale, average, source, and saved date. The vendor form shows only self fields and basic vendor details. Provide loading, empty, delivery pending/failed, expired link, validation, conflict, permission-loss, and saved states. Keyboard focus moves to the first invalid category; ratings have explicit accessible labels and errors. Verify narrow phone, tablet, and desktop layouts without exposing real vendor data in screenshots.

Acceptance criteria:

1. Vendor-name navigation opens the correct staff detail route on web and native detail on mobile; Procurement/Super Admin see only their authorized actions. Other roles and direct unauthorized links fail closed.
2. Execution and Supplier rubrics show exactly the supplied categories. Complete 0–100 self and staff answers persist separately, and the backend calculates equal averages; only the Procurement average becomes the official score.
3. Staff can save/revise with CAS and audit. The web/mobile detail, vendor table, and Average KPI tile reconcile to the same current persisted score, including two unequal vendors and stale-version tests.
4. Request is available only when current-rubric self KPI is missing and a deliverable vendor email/type exists. Clicking sends one token link using the configured mailer; disabled/failed mail and duplicate/resend cases are safe and visible. No real customer email is sent during local verification.
5. The public link requires no account, exposes only the minimal vendor summary, expires, is single-use, and atomically stores exactly one self submission. Invalid, changed-email/type, archived, expired, revoked, and concurrent-use cases disclose nothing and cannot write a score.
6. Self submission appears to staff after refresh without being confused with the official score. Existing vendor CRUD, multi-basket selection, procurement item/finance flows, and current mobile work remain functional.
7. Focused backend service/route/Mongo replica-set tests, authorization/OpenAPI/contract tests, frontend and mobile rendered interaction/accessibility tests, typechecks/builds, responsive visual QA with synthetic data, and `git diff --check` pass on the integrated worktree.
8. Web and native vendor lists do not print code/ID beneath vendor names. An active unverified vendor displays `Under Review` without `Active`; verified active, inactive, and archived vendors each display their single applicable label.
9. The external KPI form and token inspection response contain only vendor name, type, work profile, representative, and position. Missing optional legacy details have a neutral fallback; no Lisno basket or generated code appears.

## Confirmed decisions, assumptions, and open decisions

- **Confirmed by user:** the supplied execution/supplier categories; independent 0–100 scores with equal averages; Procurement average as official Vendor KPI; mobile staff functionality in this release; vendor uses an emailed one-time web link without login. For this correction, remove ID/code beneath vendor names, do not show Active alongside Under Review, and show name, type, work profile, representative, and position on the vendor's form instead of Lisno baskets.
- **Assumptions for approval:** staff roles share one current Procurement assessment per vendor with audited revisions; all rubric categories are required; Request KPI placement is next to the vendor name and is based on missing **self** KPI; 24-hour link lifetime; the public summary is limited as described. These avoid invented weights, an editable external account, and accidental exposure of private profile fields.
- **Open decision:** none blocks this correction. The user selected the exact vendor-facing detail fields; the status change is presentation-only and preserves the existing backend lifecycle.

No deployment, migration/backfill, production email, commit, or customer communication is authorized by this specification.
