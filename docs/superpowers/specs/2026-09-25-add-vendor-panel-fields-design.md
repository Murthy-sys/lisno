# Add Vendor panel fields and registration evidence

Date: 2026-09-25
Status: Approved by the user; separate task plan approved and Mode A selected. Implementation and verification tracked in the corresponding plan.
Classification: Substantial, spanning frontend, backend contracts, persistence, and authenticated uploads.

## Goal

Apply all six requested changes to the Add Vendor side panel without leaving hidden required fields or saving registration answers without their required supporting information.

| ID | User request | Required outcome |
| --- | --- | --- |
| AC1 | Move contact information to vendor information | Email, Phone Number, and Address appear within Vendor Information. Remove the separate Contact Information section. Preserve their values and validation. |
| AC2 | Remove Directory description | Remove this field from the panel. New vendors do not require a description; editing a vendor preserves any existing description. |
| AC3 | No extra radio selection for Supplier | Selecting Supplier in Vendor Type is sufficient. Remove the subsequent Supplier Yes/No radio group and its validation requirement. |
| AC4 | GST Yes requires GST number | Show a required GST Number field immediately with the GST Registered Yes choice. Validate, persist, and reload the number. |
| AC5 | MSME Yes requires certificate upload | Show a required MSME Certificate upload immediately with the MSME Registered Yes choice. Persist the file securely and make it available on reopening the vendor. |
| AC6 | Remove Reference | Remove Reference from the side panel and from required-field validation, including backend validation. Preserve existing stored reference data. |

## Current behavior and evidence

- `frontend/src/features/procurement/VendorProfileFields.tsx` renders Vendor Classification, Vendor Information, Contact Information, and Identity & Verification. Vendor Information contains Reference and Directory description. Contact Information contains Email, Phone Number, and Address.
- The same component displays a second Supplier Yes/No group when Vendor Type is Supplier. Execution vendors have a separate one-or-both Execution Type selection.
- `frontend/src/features/procurement/vendorProfileDraft.ts` requires Reference through `VENDOR_TEXT_FIELDS`, explicitly requires the Supplier answer, and serializes GST/MSME only as booleans.
- `frontend/src/features/procurement/ProcurementVendorEditor.tsx` provides the shared add/edit form, version conflict handling, create recovery, query synchronization, and a separate optional vendor-photo workflow. Its current submit payload always includes description.
- `backend/src/contracts/procurement-vendor.ts`, `backend/src/services/procurement-vendor-profile.ts`, and `backend/src/models/AiEstimatorKnowledgeVendor.ts` have registration booleans but no GST number or MSME certificate. Reference is required. Supplier currently permits either true or false for Supplier vendors.
- `storedProcurementVendorProfile` currently reuses strict write validation when reading records. Simply adding required fields would make legacy profiles disappear from details and summaries. Read compatibility must be handled explicitly.
- Vendor create/update schemas are in `backend/src/routes/ai-estimator-knowledge-admin.ts`; persistence and detail responses are in `backend/src/services/ai-estimator-knowledge-reference.service.ts`.
- Existing vendor-photo routes/services provide authenticated managed storage, expected-version checks, idempotent upload handling, cleanup, and safe descriptors. `backend/src/middleware/upload.ts` already supports validated PDF/image uploads; `MAX_UPLOAD_MB` configures the size limit, defaulting to 25 MB.
- Existing profile tests explicitly cover Supplier Yes/No and require Reference. These expectations must change alongside meaningful coverage for every acceptance criterion.

## Scope and non-goals

Scope includes the shared vendor side-panel fields, frontend state/validation, vendor API and persistence changes needed for GST and MSME evidence, compatible legacy reads, authenticated certificate retrieval, error/retry handling, and regression/visual verification.

Because Add Vendor and Vendor details use the same editor, apply the field organization and conditional requirements consistently to both. An existing valid certificate satisfies the edit form's requirement without another upload.

Do not redesign the directory or panel appearance, change unrelated procurement workflows, alter allocation or financial calculations, replace the vendor photo, add government registration verification, bulk-rewrite existing records, or change role access. No new dependency is expected unless implementation evidence establishes a need.

## Product behavior

### Vendor Information

Use the existing panel and form components. Include entity/representative details, Email, Phone Number, Address, registration fields, turnover fields, and Work Profile in Vendor Information. Keep the separate Current Address and physical verification controls in Identity & Verification: they have different workflow semantics from the contact Address.

Remove Directory description and Reference completely from the visible side panel. Neither field may cause an invisible validation error. Omit them from panel writes; the backend retains existing values when omitted. New Reference values may be absent/null in persistence rather than fabricated placeholder text. Work Profile remains a separate field.

### Supplier selection

Keep the Vendor Type Execution/Supplier choice. The request is interpreted as removing the redundant Supplier Yes/No group, not removing the Vendor Type choice itself.

Derive `supplier: true` for new/saved Supplier profiles and `executionType: null`. For Execution, retain `supplier: null` and the existing requirement to choose at least one Execution Type. Switching types clears incompatible selections and errors while preserving unrelated entries. Existing Supplier records with false remain readable; saving through this form normalizes the value to true without a bulk migration.

### GST

- Yes reveals a required field labelled `GST Number`, adjacent to the registration choice in the responsive layout.
- Trim and uppercase input on persistence. Validate a 15-character GSTIN-shaped value consistently in frontend and backend; this is format validation, not a claim of verified registration.
- Missing or malformed input blocks save and produces a field-specific error with accessible focus.
- No hides the field, removes its validation errors, and saves a null GST number. A temporary draft value may survive toggling within the open form, but must not be sent while No is selected.
- Reopening a saved Yes profile shows its number. Legacy Yes profiles lacking a number retain their other details and require the missing number when the profile is next saved.

### MSME certificate

- Yes reveals a required upload labelled `MSME Certificate` within Vendor Information.
- Accept one PDF, JPEG, PNG, or WebP certificate, bounded by the configured server upload size limit. Show accepted formats and the applicable limit. Reuse existing content/signature validation, not just extension or browser MIME checks.
- Show the selected filename and clear pending/uploading/failed states. A saved certificate has an authenticated open/download action and a replace action. Keep it distinct from the optional geo-tagged vendor picture.
- A valid existing certificate satisfies the requirement. Replacing it does not detach the old certificate before a successful save.
- No hides the upload and removes its required error. On successful save, clear the certificate association and schedule cleanup of the detached file. Toggling or cancelling alone does not delete a persisted certificate.
- Missing, invalid, oversized, or failed uploads prevent a successful MSME Yes profile save. Preserve all form entries and support retry. Do not create a duplicate vendor or close the panel claiming success after a failed required upload.
- Legacy MSME Yes profiles without certificates remain readable and require an upload on their next profile save.

## Recommended data and API approach

Extend the existing vendor profile flow and managed storage. Add `gstNumber: string | null` to stored/read profile shapes. Keep Reference as an optional compatibility field and preserve it on updates when absent.

Use a separate stored certificate descriptor and return only safe detail metadata: certificate identity, sanitized filename, MIME type, byte size, upload time, and an authenticated application download path. Do not expose storage keys, file hashes, or certificate content in vendor list/summary responses, logs, or shared query caches.

Recommended upload flow: stage a validated certificate behind authentication before submitting the profile; use an opaque, expiring upload identity in the save command; consume it and attach certificate metadata in the same database transaction as the vendor profile write. A staged upload for an existing vendor is bound to that vendor and actor; a new-vendor upload can be consumed only once by its owner. Existing certificates can be retained without another token. Reject mismatched, expired, consumed-by-another-command, or otherwise invalid upload identities.

This keeps existing JSON profile saves while ensuring a new MSME Yes vendor is not committed without its certificate. Reuse the established managed-storage, intent, and cleanup patterns without conflating certificates with photos. Retry must preserve the command/upload identity and reconcile an already-committed save without duplicate vendors, attachments, or audit entries. Cancelled/expired/unattached uploads must be cleaned up, with failed cleanup eligible for retry.

Alternative considered: multipart profile-and-certificate saves. This avoids a staging request but introduces a parallel body format for create/update and couples vendor-save retries to resending the file. Prefer staging because the existing profile API and frontend recovery are JSON based. A post-save attachment like the optional photo is unsuitable for a required certificate because it could leave an MSME Yes profile committed without evidence.

Exact route names and upload-command fields are recorded in the approved task plan and implemented in the canonical authorization registry and OpenAPI inventory.

## Invariants and compatibility

- Enforce GST requirements in backend profile writes. Enforce MSME certificate association in the transactional save path, including direct service calls, not solely in the browser.
- Separate compatible persisted-profile reading from stricter new profile-write validation. Preserve classification, basket IDs, contact data, and physical verification metadata in legacy records. Profile completeness reflects missing new required evidence without erasing the rest of the profile.
- Do not change the directory's existing physical-verification-based Under Review calculation or allocation-limit decisions as a side effect of missing GST/MSME data.
- Ordinary metadata-only updates remain compatible and preserve profile/evidence. The richer side-panel profile write requires the new conditional values.
- Preserve expected-version conflict checks, immutable stable vendor IDs, basket constraints, actor verification, audit behavior, and money stored in integer paise.
- On update conflicts, keep the user's draft and selected file available; require reconciliation with the latest record before applying changes.
- Protected certificate reads use the existing vendor-detail read authority. Staging/consumption uses the corresponding vendor create/update authority and existing sole-active-Super-Admin guard. All other users remain denied, including file retrieval. Archived vendors remain immutable.
- Preserve private detail versus shared summary query boundaries. Refresh vendor detail and affected list/overview queries after a successful save.
- Add bounded audit metadata for certificate changes without recording file contents or GST values in logs.
- No production mutation, seed, migration, deployment, commit, or push is included. Additive schema/read compatibility avoids a live backfill. A rollback must preserve the new stored data and may require the compatible reader because older strict readers reject unfamiliar profile fields.

## UX and failure states

Reuse current styling and responsive form layout. Add no new visual system, icons, hover effects, or animations. Use semantic labels, required indicators, keyboard-operable file selection, linked field errors, and first-invalid-field focus. Busy states prevent duplicate submissions. Read-only/archived views display saved GST/certificate information without mutation controls.

Verify desktop and narrow mobile panel widths, including long filenames, conditional fields, validation messages, and scrolling to the save action. Existing focus containment, dirty-close confirmation, basket creation, physical verification warning, and vendor-photo retry behavior must remain functional.

Layout refinement requested after the initial implementation: when Yes is selected, GST Number occupies the column beside GST Registered, and MSME Certificate occupies the column beside MSME Registered. Each expanded pair gets a full row; Phone Number remains in the contact fields and both Turnover fields stay together below registration. Keep inputs at their normal height rather than stretching to match certificate content. On mobile, place the revealed field immediately below its selection. This refines the existing conditional-field layout without changing data or validation behavior.

## Acceptance and verification

| Coverage | Required evidence |
| --- | --- |
| AC1 | Rendered form confirms Email/Phone/Address belong to Vendor Information; no separate Contact Information heading; values survive save/reopen. |
| AC2 | No Directory description control; create succeeds without it; editing does not erase an existing description. |
| AC3 | Supplier selects with one Vendor Type interaction, has no second radio group or hidden error, and saves/reloads the derived classification. Execution switching still validates correctly. |
| AC4 | Yes/missing and Yes/malformed fail on frontend/backend; valid GST saves/reloads; No has no required field and stores null; legacy data remains visible. |
| AC5 | Missing certificate blocks save; valid files save/reopen/download; existing files satisfy edits; No clears on save; invalid/spoofed/oversized uploads fail safely. |
| AC6 | Reference absent from form and required validation; new profile saves without it; old reference values survive unrelated edits. |
| Upload integrity | Auth denial, two distinct vendors, cross-vendor upload rejection, stale versions, expiry, retry after uncertain response, replacement failure, storage failure, database rollback, and orphan cleanup. |
| Compatibility | Legacy registration Yes without new evidence remains readable; missing evidence does not erase verification, basket identity, or contact data; lists do not leak private certificate/GST data. |
| Regression | Existing vendor-photo behavior, baskets, physical verification/allocation, archived/read-only behavior, directory changes already in the worktree, and query synchronization remain intact. |
| Integrated checks | Focused frontend/backend tests, transactional replica-set tests for modified Mongo paths, relevant authorization/OpenAPI checks, typechecks, production builds, rendered keyboard/accessibility/responsive checks, and repository diff hygiene. Broaden suites according to shared-contract impact. |

## Worktree baseline and constraints

At investigation start, existing changes were present in:

- `frontend/src/features/procurement/ProcurementVendorDirectory.tsx`
- `frontend/src/features/procurement/VendorDirectory.test.tsx`
- `frontend/src/features/procurement/VendorDirectoryTable.tsx`
- `frontend/src/features/procurement/VendorProcurement.test.tsx`
- `frontend/src/features/procurement/vendorDirectory.css`
- Untracked `frontend/src/features/procurement/vendorDirectoryColumns.tsx`
- Mobile runtime/Android files and separate 2026-09-24 mobile/directory spec and plan files.

The frontend changes concern directory density, layout, columns, and pagination. The existing `VendorProcurement.test.tsx` diff changes the expected next-page offset from 5 to 10. Preserve all of this work. The principal editor/profile fields/draft and backend targets were clean at investigation start. Recheck diffs and ownership before implementation; do not stage or overwrite unrelated changes.

## Risks, assumptions, and open decisions

Primary risks are strict legacy parsing, hidden required Reference validation, duplicate saves after upload failures, orphaned files, certificate access leaking through public summary caches, and accidental interference with existing directory edits. The behavior and verification above address these explicitly.

Assumptions: Supplier means removing the extra Yes/No choice; the shared edit panel should match Add Vendor; certificate support includes common PDF/image files; existing saved evidence can be reused; registration format validation does not verify government registration.

No unresolved product decisions remain. All six requirements are implemented. The approved [task plan](../plans/2026-09-25-add-vendor-panel-fields.md) records the API details, completed execution, passing focused checks, rendered verification, and unrelated broader-suite failures. Full repository suites are not entirely green; see that verification record before treating the whole worktree as release-ready.
