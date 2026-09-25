# Add Vendor panel fields: implementation task plan

Date: 2026-09-25
Status: Approved; Mode A selected. T0 through T5 completed. All six requested vendor changes have passing focused and rendered checks. Broader suites have unrelated failures documented below. Baseline and browser QA artifacts: /tmp/lisno-add-vendor-panel-qa.

Source of truth: [Approved specification](../specs/2026-09-25-add-vendor-panel-fields-design.md). The user approved the specification and this task plan, then selected Mode A. The execution record below documents the resulting implementation and verification.

## Outcome and traceability

| Criterion | Deliverable | Tasks |
| --- | --- | --- |
| AC1 | Email, Phone Number, and Address moved into Vendor Information; separate Contact Information section removed | T3, T5 |
| AC2 | Directory description removed from panel and omitted from its writes; existing description retained | T2, T3, T5 |
| AC3 | Selecting Vendor Type Supplier is enough; no secondary Supplier Yes/No group | T1, T2, T3, T5 |
| AC4 | GST Yes requires a validated, persisted GST Number; No saves null | T1, T2, T3, T5 |
| AC5 | MSME Yes requires an uploaded or existing certificate; secure persistence, retrieval, replacement, and retry | T1, T2, T3, T4, T5 |
| AC6 | Reference removed from panel and required validation; old data retained | T1, T2, T3, T5 |

Keep one parent task in progress: implement and verify the approved Add Vendor changes. The tasks below are dependency-ordered slices of that parent, not independently approved product changes.

## Contract fixed for implementation

### Profile data and normalization

- Add `gstNumber: string | null` to canonical profile data. Write validation requires a number when `gstRegistered` is true; normalize whitespace at the ends and uppercase before validation. Use the same format rule in frontend/backend: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`. Do not add checksum, state-code, or government lookup requirements.
- When GST is No, normalize the stored number to null. Missing GST Number on old persisted Yes profiles reads as null without discarding the rest of the profile.
- Make Reference optional in profile input and nullable in canonical reads. Omission during update preserves the prior stored value. Do not default omitted update input to null before this merge. New profiles may store null. Accept existing values without requiring the panel to resubmit them.
- Derive Supplier true on Supplier profile writes and null on Execution writes, retaining the execution selection checks. Do not require a new Supplier answer. Legacy Supplier false records remain readable until saved. Reject contradictory execution selections rather than silently changing vendor type.
- Split compatible persisted reads from current write requirements. Add an explicit completeness check incorporating GST evidence and the separate certificate association. Keep basket/classification/verification output available for legacy records that only lack the new fields.
- Preserve metadata-only master edits, the existing physical-verification-based directory Under Review count, allocation guards, and integer-paise turnover values.

### Certificate and save command shapes

- Store `msmeCertificate` separately from `procurementProfile` and `geoTaggedPicture`. Its private metadata follows managed-storage conventions: stable certificate ID, opaque storage reference, sanitized filename, detected MIME type, size, hash, upload time, and uploader ID.
- Return `msmeCertificate: { id, originalFilename, mimeType, byteSize, uploadedAt, url } | null` only in authorized vendor detail. Shared master/list/overview DTOs contain no certificate metadata, GST number, upload identity, or private profile data.
- Extend vendor create/update JSON commands with `msmeCertificateUploadId?: string` and `idempotencyKey?: string`. The revised panel supplies a stable idempotency key for every save; a command consuming a staged certificate requires it. Existing callers without a certificate command remain compatible.
- For MSME Yes, an upload identity attaches/replaces the certificate; omission retains the vendor's existing certificate and fails if none exists. For MSME No, detach any certificate in the same successful profile write; reject a simultaneously supplied upload identity as contradictory input.
- Reject certificate-upload fields without a vendor profile or on other master types. Never accept client-authored stored certificate metadata or a storage reference.
- Persist a small vendor-save receipt scoped by actor, operation, vendor target (for updates), and idempotency key. Fingerprint the normalized command. Exact retries return the original public save result without another vendor/version/audit write; reuse with different input produces `IDEMPOTENCY_CONFLICT`. Check an existing receipt before stale-version or consumed-upload checks, after current actor authorization. Keep sensitive input out of receipts and logs.
- The existing JSON create/update routes retain their response envelopes. After a successful save/replay, the panel fetches authoritative detail before handling the separate optional photo flow.

### Endpoints

All routes below are under `/api/v1/admin/ai-estimator-knowledge`. Use existing envelopes, runtime validation, and route-operation policies.

| Method and route | Input/output | Authority |
| --- | --- | --- |
| GET `/vendors/msme-certificate-upload-policy` | `{ maxUploadBytes, allowedMimeTypes, uploadLifetimeSeconds }` | Existing configuration read permission and vendor actor guard |
| POST `/vendors/msme-certificate-uploads` | Multipart `certificate` and `idempotencyKey`; returns safe staged-upload metadata including `uploadId` and `expiresAt` | Existing vendor create authority |
| POST `/vendors/:id/msme-certificate-uploads` | Same multipart fields plus `expectedVersion`; stage bound to the named vendor/version | Existing vendor update authority |
| GET `/vendors/:id/msme-certificate` | Authenticated file stream; optional `v` must identify the currently attached certificate when provided | Existing vendor-detail read authority |
| POST `/vendors`, PATCH `/vendors/:id` | Existing JSON commands extended as above | Existing create/update policies |

Mount the static policy/upload routes before generic vendor `:id` handlers. Certificate downloads use `private, no-store`, `nosniff`, and sanitized attachment filenames. A stale descriptor must not silently download a different replacement certificate. No public storage URL or staged-file download route is added.

The allowed MIME types are PDF, JPEG, PNG, and WebP. The server policy reports the configured upload limit, so the frontend does not hardcode 25 MB. Stage on Save after local validation, not immediately when a file is selected. A failed policy request has a retry state and cannot authorize a guessed file-size limit.

### Storage lifecycle and recovery

- Record an upload intent and allocated target before writing bytes. Use actor/operation/target-scoped upload idempotency, content fingerprinting, a bounded upload lease (matching the existing two-minute photo lease), and a one-hour ready-upload lifetime reported by the policy endpoint.
- Model `uploading -> ready -> consumed`, with failed/expired branches and durable cleanup records. The returned opaque upload ID identifies a ready file, not a public bearer download link.
- On update staging and consumption, enforce vendor identity, expected version, non-archived status, current actor authority, and expiry. New-vendor uploads have no existing target and can attach only once in a new-vendor save by their owner.
- Consume the intent, attach/detach certificate metadata, update the profile/version, record the save receipt, append audit metadata, and queue retired-file cleanup in the same Mongo transaction.
- Invalid profile data, failed storage, conflicts, or transaction rollback cannot publish the new certificate or detach the old one. A staged file remains safely retryable until expiry or is scheduled for cleanup.
- Cleanup atomically expires eligible intents before deletion, coordinates with consumption, checks for active attachments, and retries failed storage deletion. Use unique targets and managed-storage tombstones so late writers cannot republish a retired target. Do not TTL-delete the only cleanup evidence before the file is removed.
- Wire cleanup into the existing server cleanup scheduler alongside vendor photos. Cancelling the panel leaves no vendor mutation; unused staging expires and is cleaned up. Replacing the selected local file uses a new upload identity.
- Save retries reuse the exact command/key after an uncertain result. After confirmed rejection and changed user input, generate a new save key. An existing-vendor reload after a conflict invalidates its version-bound staged upload and restages the retained local file on the next attempt.
- Audit certificate attach/replace/detach through bounded metadata in existing vendor save audit events; record field names and safe certificate identity, not GST values, certificate content, tokens, or filenames containing personal information.

## T0. Capture implementation baseline

Owner: primary agent. Dependencies: task-plan approval and execution-mode selection. Writes: none to product files.

1. Re-read current applicable instructions and capture `git status --short`, the dirty-path set, and relevant per-target diffs immediately before editing. Preserve the existing directory-density/pagination changes and unrelated mobile files listed in the specification.
2. Confirm available local test and replica-set environments and reusable browser tooling. Use synthetic fixtures only; do not seed a development or production database.
3. Reconcile the contract above with any intervening code changes. If product behavior or architecture must materially depart from the approved specification, update the affected document and stop at its approval boundary; routine internal choices do not reopen the gate.

Acceptance: clean ownership boundaries and a recorded pre-edit baseline. No staging, commits, pushes, deployment, or migration.

## T1. Establish shared contracts

Owner: primary agent. Dependency: T0. Acceptance: AC3, AC4, AC5, AC6.

Owned targets:

- `backend/src/contracts/procurement-vendor.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts`
- `frontend/src/features/procurement/vendorProfileApi.ts`

Steps:

1. Define canonical profile/read shapes, input compatibility, certificate descriptor/policy/upload result, and vendor-save command fields consistently across frontend/backend.
2. Add typed certificate policy/staging/download helpers using existing `apiClient` multipart/blob methods. Keep existing vendor-photo APIs unchanged.
3. Settle exported service/router interfaces for T2/T4 before concurrent writers begin. Primary-owned type/API files are frozen during parallel implementation; workers report required changes to the primary agent.

Verification: inspect field/nullable semantics and private/public boundaries; compile the completed integrated slices later. Temporary type failures while implementation is pending are not final test evidence.

## T2. Implement backend profile rules, certificate persistence, and APIs

Owner in Mode A: one `backend_implementer`. Owner in Mode B: primary agent. Dependency: T1. Acceptance: AC2 through AC6 plus compatibility, transaction, authorization, and storage invariants.

Owned existing targets:

- `backend/src/services/procurement-vendor-profile.ts`
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`
- `backend/src/models/AiEstimatorKnowledgeVendor.ts`
- `backend/src/routes/ai-estimator-knowledge-admin.ts`
- `backend/src/openapi/procurement-vendor.ts`
- `backend/tests/procurement-vendor-profile.fixture.ts`
- `backend/tests/procurement-vendor-profile.test.ts`
- `backend/tests/procurement-vendor-profile.replica-set.test.ts`

Owned new modules/tests, using these names unless a clearly equivalent existing module fits:

- `backend/src/models/ProcurementVendorCertificateUpload.ts` (upload intents and cleanup records)
- `backend/src/models/ProcurementVendorSaveCommand.ts` (committed command receipts)
- `backend/src/services/procurement-vendor-certificate.service.ts`
- `backend/src/routes/procurement-vendor-certificate.ts`
- `backend/tests/procurement-vendor-certificate.test.ts`
- `backend/tests/procurement-vendor-certificate.replica-set.test.ts`

Steps:

1. Separate read parsing from write validation, merge omitted Reference with the old value, canonicalize Supplier/GST, and compute completeness without discarding valid legacy fields.
2. Extend vendor storage and safe detail serialization. Audit every DTO/summary path to prevent certificate or GST leakage.
3. Implement validated staging, private retrieval, idempotency, lifecycle/cleanup, and reusable session-aware certificate consumption helpers. Keep file I/O outside the vendor database transaction; the ready-upload metadata is consumed inside it.
4. Integrate certificate requirements and durable save receipts in the existing direct-Mongoose vendor create/update path. Preserve version/CAS, actor guards, basket locking, audit rollback, and non-vendor master behavior. Preserve existing description when omitted.
5. Extend create/update Zod schemas and OpenAPI definitions; declare every new endpoint and conditional input rule.
6. Add focused route/schema tests and replica-set tests, including direct service calls, both create/update, two distinct vendors, legacy data, duplicate requests, failed storage, expired uploads, cleanup versus consume races, and transaction rollback.

Boundary: no edits to primary-owned shared contracts, `app.ts`, `server.ts`, route-operation registry, authorization mapping, general OpenAPI assembly, or shared authorization tests. Report the integration exports and any unavoidable supporting-test fixture changes to the primary agent. Do not refactor the existing photo system just to reuse it.

## T3. Implement all six panel changes and interaction coverage

Owner in Mode A: one `frontend_implementer`. Owner in Mode B: primary agent. Dependency: T1; may run beside T2 against the fixed API contract. Acceptance: AC1 through AC6 and all panel states.

Owned existing targets:

- `frontend/src/features/procurement/VendorProfileFields.tsx`
- `frontend/src/features/procurement/vendorProfileDraft.ts`
- `frontend/src/features/procurement/ProcurementVendorEditor.tsx`
- `frontend/src/features/procurement/vendorProcurement.css` (only minimal field layout if needed)
- `frontend/src/features/procurement/ProcurementVendorProfile.test.tsx`
- `frontend/src/features/procurement/vendorProfile.fixtures.ts`

Optional focused new targets:

- `frontend/src/features/procurement/VendorMsmeCertificateField.tsx`
- `frontend/src/features/procurement/useVendorMsmeCertificate.ts` (only if needed to keep editor complexity bounded)

Steps:

1. Move Email/Phone/Address inside Vendor Information; remove Contact Information, Directory description, Reference, and the secondary Supplier group. Remove hidden validation requirements and omit deleted fields from writes.
2. Add conditional GST Number with normalization, inline errors, and correct Yes/No transitions. Derive Supplier state from Vendor Type; retain Execution Type behavior.
3. Add the conditional certificate field with server-reported policy, local file validation, selected/saved filename, authenticated download, replacement, read-only behavior, and existing-certificate reuse. Use established components and styles without new decorative effects/icons.
4. Orchestrate local validation, certificate staging, idempotent JSON save, detail refresh, and the existing optional photo step. Preserve entries and file across upload/save failures. Do not let the photo-partial state describe a failed required certificate as a successful vendor save.
5. Keep upload/save identities stable during retry and reset them only on the appropriate edit/reload/selection transitions. Adjust create recovery so new optional canonical fields and preserved Reference values cannot cause false mismatches; use the authoritative idempotent save result for revised panel commands instead of relying on names to prove identity.
6. Preserve private-detail cache boundaries, query invalidation, dirty-close confirmation, first-error focus, disabled/busy handling, archived views, and nested basket controls. Keep the authenticated download usable in read-only mode.
7. Update MSW fixtures and meaningful tests for each requested item, simultaneous GST/MSME Yes, toggling, legacy profiles, existing attachments, staging failure, uncertain save replay, conflicts, replacement, photo-after-certificate behavior, and accessibility.

Boundary: no directory layout/table files, unrelated dirty tests, API/types owned by T1, or backend changes. Report any supporting fixture changes outside the assigned files to the primary agent.

## T4. Integrate routes, authorization inventory, and cleanup scheduling

Owner: primary agent. Dependencies: T2 and T3 completed. Acceptance: AC5 and cross-layer consistency.

Owned integration targets:

- `backend/src/app.ts`
- `backend/src/server.ts`
- `backend/src/domain/route-operations.ts`
- `backend/src/openapi.ts`, only if the current procurement schema/path exports do not automatically include the new definitions
- Shared route-operation/authorization/API-doc test fixtures and tests, including `backend/tests/fixtures/ai-estimator-knowledge-route-operations.ts`, `backend/tests/route-operation-registry.test.ts`, `backend/tests/authorization-policy.test.ts`, `backend/tests/frontend-authorization-contract.test.ts`, `backend/tests/api-docs.test.ts`, and `backend/tests/server.test.ts` as needed
- Any necessary consumer fixture adjustments beyond T2/T3 boundaries, after reviewing their existing diffs

Steps:

1. Instantiate/register the certificate service/router and its cleanup hook using the configured storage, clock, and upload size. Confirm specific routes cannot be swallowed by generic vendor routes.
2. Register operations with existing configuration read/create/update permissions and existing Super Admin behavior; do not broaden role grants. Check both route middleware and service actor guards before file work.
3. Wire certificate cleanup into the existing server scheduler and its test contract. Ensure photo and chat cleanup remain present.
4. Reconcile safe DTOs, frontend/backed field errors, idempotent retry behavior, stale certificate URLs, private blob download, and query synchronization across the actual integrated files.
5. Inspect all changed consumer fixtures. Any edits to the initially dirty `VendorProcurement.test.tsx` must retain its 5-to-10 pagination change; do not rewrite unrelated tests merely to accommodate new fixture fields.

## T5. Review and verify the integrated result

Owner in Mode A: primary agent coordinates `integrity_reviewer`, fixes findings, then runs `verification_runner` after all writers have stopped. In Mode B: primary agent performs the same sequence inline. Dependencies: T2, T3, T4 complete. Acceptance: all six criteria and invariants.

Review focus:

- Legacy profiles remain readable; missing registration evidence cannot change physical-address verification or allocation decisions.
- Omitted Description and Reference are preserved, with no hidden required errors.
- New profile writes cannot bypass required GST/certificate validation through direct API/service paths.
- Save idempotency is checked before version/token-consumption rejection on exact retries; changed commands cannot reuse an identity.
- No cross-vendor attachment, public certificate retrieval, unowned upload consumption, premature old-file deletion, or cleanup/consume race.
- No receipt, summary, cache synchronization, error message, log, or screenshot leaks private profile/certificate data.
- Existing supplier/execution, photo, basket, read-only, and directory behavior is preserved outside the approved changes.

Run focused checks first:

```sh
cd backend
npm test -- tests/procurement-vendor-profile.test.ts tests/procurement-vendor-certificate.test.ts tests/procurement-vendor-photo.test.ts tests/procurement-vendor-allocation.test.ts
npm test -- tests/procurement-vendor-profile.replica-set.test.ts tests/procurement-vendor-certificate.replica-set.test.ts tests/procurement-vendor-photo.replica-set.test.ts tests/procurement-vendor-allocation.replica-set.test.ts
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
```

```sh
cd frontend
npm test -- src/features/procurement/ProcurementVendorProfile.test.tsx src/features/procurement/VendorProcurement.test.tsx src/features/procurement/VendorDirectory.test.tsx src/features/procurement/VendorAllocationBaseline.test.tsx
```

After the focused checks pass, run final typechecks/builds and the broader suites because the shared master service, profile contract, route registry, and server cleanup wiring change:

```sh
cd backend
npm run typecheck
npm test
npm run build
```

```sh
cd frontend
npm run typecheck
npm test
npm run build
```

Run replica-set integration checks against the repository's disposable test environment, never a real database. Verify tests actually executed rather than accepting a skipped lane. If a full suite includes an unavailable environment, report exact passing/skipped/blocked checks and retain the verification limitation; do not weaken transactional semantics. There is no lint script to run or claim.

Rendered interaction/visual checks use synthetic vendors in a local test environment or isolated API-mocked harness:

| View/state | Expected result |
| --- | --- |
| Desktop 1440 x 900, Add Vendor | Correct merged section; all three removals absent; Supplier has only the Vendor Type selection |
| Mobile 390 x 844 and narrow 320px width | Conditional inputs, long filename, validation messages, and footer fit without horizontal overflow |
| GST Yes/No and invalid submit | Correct reveal/required state, linked error, and first-invalid-field focus |
| MSME Yes with new file | Upload state, required enforcement, correct save/reopen, authenticated download |
| Saved certificate, replace, No, cancel | Existing file reusable; replacement commits safely; No detaches only on save; cancel preserves data |
| Failed upload/save and stale version | Entries retained, understandable retry/reload controls, no duplicate save |
| Keyboard, accessible names, read-only/archived | Controls and errors reachable; fieldset structure valid; download remains usable; mutation blocked |

Inspect browser console/network errors. Place temporary QA assets/logs in an ignored task-specific path or `/tmp/lisno-add-vendor-panel-qa`, and report generated paths. No runtime artifacts are committed.

Finish with repository-root `git diff --check`, `git status --short`, and final diff reconciliation against T0. Report each AC as verified or outstanding, the principal file/contract changes, exact commands/results, unrun checks, and any remaining risk.

## Parallel execution and ownership rules

- No agents are spawned before the user selects Mode A at the next gate.
- In Mode A, T0/T1 remain primary-owned. T2 and T3 can run in parallel after their contracts are fixed because their file ownership does not overlap. T4 follows the writers; integrity review precedes final verification. Additional delegation is only for a concrete independent question with explicit read-only boundaries.
- In Mode B, perform all tasks, review, integration, and verification inline without subagents.
- Every writer is told: you are not alone in the codebase; preserve others' edits, do not revert unrelated work, and report contract changes to the primary agent before crossing ownership boundaries.
- No implementation begins from task-plan approval alone. The separate execution-choice gate follows approval of this plan.

## Definition of done and exclusions

All six requested changes must be present in the rendered panel and covered by passing meaningful checks. Saved GST/certificates must survive reopening; removed fields must not block saving or erase existing data. The upload transaction, retry, authorization, legacy-read, and cleanup invariants must be verified on the integrated worktree.

No deployment, migration/backfill, seeding, production writes, customer communication, commits, pushes, dependency installation, or lockfile changes are planned. If a dependency becomes necessary, explain the concrete reason and verify its affected build within the authorized implementation scope. Preserve unrelated directory/mobile work throughout.

## Execution and verification record, 2026-09-25

All six acceptance criteria are implemented and verified:

| Criterion | Integrated result and evidence |
| --- | --- |
| AC1 | Email, Phone Number, and Address belong to Vendor Information. Separate Contact Information heading removed. Focused component checks and actual rendered form confirm placement and save/reopen. |
| AC2 | Directory description control and panel writes removed. Existing stored description survives edits. Covered by frontend save payload and backend compatibility checks. |
| AC3 | Supplier uses the Vendor Type selection only; Supplier writes derive true. Keyboard selection and persisted payload verified. Execution validation retained. |
| AC4 | GST Yes reveals and requires GST Number. Frontend/backend normalize and validate; No stores null. Invalid focus and save/reopen checked in the browser. |
| AC5 | MSME Yes requires a selected valid certificate or existing attachment. Authenticated staging, atomic attachment, downloads, replacement, No/detach, replay, stale versions, rollback, and cleanup covered by focused and real replica-set tests. Browser confirms required state, saved filename, reopen, and read-only download. |
| AC6 | Reference control and hidden requirement removed. Omitted writes preserve legacy reference; new vendors save without it. Focused and rendered checks pass. |

Principal files are `VendorProfileFields.tsx`, `vendorProfileDraft.ts`, `ProcurementVendorEditor.tsx`, the new `VendorMsmeCertificateField.tsx` and `useVendorMsmeCertificate.ts`, shared profile/API contracts, and backend profile/reference services. New certificate route/service, upload/cleanup models, and save-command receipt model implement the approved storage and retry contract. App registration, startup model indexes, cleanup scheduling, authorization operation inventory, and OpenAPI are integrated. No dependency or lockfile changes were necessary.

The independent integrity review found a create-only permission regression in editor disablement. It was corrected so update authority only controls an existing vendor; a new create-only regression test passes. The final review reports no unresolved vendor defects. Legacy reads retain missing GST/certificate data without changing physical verification or allocation behavior. Existing description and reference remain stored.

### Automated checks

Commands are the exact commands in T5 above unless shown explicitly below. Logs are under `/tmp/lisno-add-vendor-panel-qa/`.

| Check | Result | Log |
| --- | --- | --- |
| Backend focused profile/certificate/photo/allocation | 49 passed, exit 0 | `final-backend-focused.log` |
| Backend profile/certificate/photo/allocation replica-set integration | 57 passed, including 17 certificate tests; real disposable replica sets, no skips; exit 0 | `final-backend-replica.log` |
| Backend authorization, frontend authorization contract, registry, OpenAPI, server | 139 passed, exit 0 | `final-backend-shared.log` |
| Backend `npm test -- tests/ai-estimator-knowledge-routes.test.ts tests/ai-estimator-knowledge-models.test.ts` | 110 passed, exit 0 | `master-regressions.log` |
| Backend `npm run typecheck` and `npm run build` | Both exit 0 | `final-backend-typecheck.log`, `final-backend-build.log` |
| Frontend focused four procurement files | 69 passed, including 36 profile tests; exit 0 | `final-frontend-focused-rerun.log` |
| Frontend `npm run typecheck` and `npm run build` | Both exit 0; existing large-chunk warning | `final-frontend-typecheck.log`, `final-frontend-build-rerun.log` |
| Backend `npm test` | 3,871 passed, 5 failed; exit 1 | `final-backend-full.log` |
| Frontend `npm test` | 3,543 passed, 17 failed; exit 1 | `final-frontend-full.log` |
| Repository `git diff --check` and `git status --short` | Both exit 0; unrelated changes preserved | Final root and verification-agent checks |

Initial frontend focused/build attempts encountered an absent stylesheet belonging to concurrent Knowledge Base work. They were rerun after that stylesheet appeared, producing the passing integrated results above. No vendor tests failed in the full suites. The isolated frontend snapshot checks also passed but are supplementary; shared-worktree results take precedence.

### Broader-suite failures and limits

The complete repository test suites are not all green. Failure isolation used focused reruns and untouched HEAD snapshots at `91f6f9bf80614703911b11b4b22b421fdf295e2e`; no unrelated product changes were made to force these checks to pass.

- Four backend failures reproduced at HEAD: design-workflow blocking reasons, journey project-stage DTO shape, mixed-case client project upload conflict, and OCR drawing expectation. `npm test -- tests/design-workflow-initialization.test.ts tests/full-journey.test.ts tests/workflow-measurement-media.test.ts` produced 52 passed/4 failed on rerun. The HEAD snapshot command omitted the media file and reproduced the same four failures with 20 passing tests. Logs: `final-backend-failures-rerun.log`, `final-backend-head-baseline.log`.
- The fifth backend failure was a 5-second timeout in large measurement-media streaming. All 32 tests in that file passed on rerun.
- Three frontend failures reproduced at HEAD: signup Address label, password-reset input clearing, and own-access-request dialog focus. HEAD command: `npm test -- src/auth/PasswordResetPage.test.tsx src/app/router.test.tsx src/test/accessibility.test.tsx`; 160 passed/3 failed. Log: `final-frontend-head-baseline.log`.
- The My Projects initiation focus failure passed on the focused rerun and HEAD.
- Thirteen `KnowledgeScreens.test.tsx` failures persisted in the shared worktree, principally missing Item name fields in Specifications/Mode workflows. Those paths were being edited by unrelated concurrent work; these failures are not classified as pre-existing. Rerun command: `npm test -- src/auth/PasswordResetPage.test.tsx src/app/router.test.tsx src/test/accessibility.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`; 234 passed/16 failed. Log: `final-frontend-failures-rerun.log`.

All executed test lanes ran without skips. There is no lint script. OCR-worker tests and migration checks were not applicable to these changes. Warnings included existing Mongoose `new` option deprecation, frontend bundle chunks over 500 kB, an unmatched MSW request, and JSDOM canvas limitations in broader frontend logs. Broader frontend evidence is contemporaneous because unrelated writers continued editing that workspace.

### Rendered verification

Actual editor components were served in an isolated local harness with mocked APIs and synthetic vendors. HeadlessChrome 153 was checked at 1440 x 900, 390 x 844, and 320 x 720 without throttling. All six changes, keyboard Supplier selection, required GST/certificate errors and first-error focus, uppercase GST save/reopen, preserved legacy fields, successful new Supplier creation with GST/MSME No, and usable read-only certificate download passed. Mobile and narrow layouts had no horizontal overflow; the 390px axe check found zero violations. The final creation journey had no unexpected page errors. Long filenames wrapped correctly.

Browser APIs were mocked; real persistence, authorization, and transaction integrity were verified separately through backend tests. This was not production end-to-end testing or physical-device performance measurement. Artifacts: `browser-results.json`, `desktop-validation.png`, `mobile-registration.png`, `narrow-registration.png`, `readonly-certificate.png`, and `add-vendor.png`, all in `/tmp/lisno-add-vendor-panel-qa/`. Local QA server and browser sessions were stopped.

### Worktree and external actions

Pre-edit status and diffs are in `initial-status.txt` and `initial-procurement.diff` in the QA directory. Original directory layout/pagination and mobile work were preserved. Necessary changes to the initially dirty `VendorDirectory.test.tsx` remove private detail fields from list fixtures; `VendorProcurement.test.tsx` now returns the updated detail after its mocked status mutation while retaining the prior pagination offset of 10. Concurrent Knowledge Base files were not altered by this task.

No stage, commit, push, deploy, seed, migration/backfill, production mutation, dependency installation, lockfile change, or customer communication occurred. Additive models use the existing startup index initialization; no live data migration was run. Generated outputs are temporary QA files and baseline snapshots under `/tmp/lisno-add-vendor-panel-qa/`, plus ignored build outputs/caches. No task screenshots, logs, uploaded files, or databases were added as repository deliverables.

## Registration layout follow-up

The user's screenshot identified vertical conditional fields stretching the adjacent Phone Number and Turnover inputs. This is a bounded correction to the approved panel UI and its AC4/AC5 layout, continuing the selected Mode A. Primary ownership: `VendorProfileFields.tsx` and `vendorProcurement.css`; independent read-only agent traced shared field stretching, and verification agent reran the profile suite/build. Existing dirty targets were captured in `/tmp/lisno-vendor-registration-layout-qa/before.diff` before this correction.

Implementation groups registration separately from contacts and Turnover, expands a Yes selection into a full-width two-column row with its required field beside it, and aligns grid children to the start to prevent inflated input heights. Existing mobile single-column rules also apply to the expanded pair. No backend, storage, validation, shared Field, or dependency changes are required.

Checks: `cd frontend && npm test -- src/features/procurement/ProcurementVendorProfile.test.tsx` passed 36/36; `cd frontend && npm run build` passed including TypeScript compilation, with the existing large-chunk warning. `git diff --check` passed. Logs: `/tmp/lisno-vendor-registration-layout-qa/frontend-profile.log`, `frontend-build.log`, and `diff-check.log`. Full suites were not repeated for this JSX/CSS-only adjustment; the previously documented broader-suite limits remain.

Rendered checks passed in the actual component harness with synthetic mocked APIs: all four GST/MSME Yes/No combinations at 1440px; both Yes at 768, 641, 640, 390, and 320px. Geometry confirms same-row selection/detail above 640px, immediate vertical stacking at 640px and below, and no horizontal overflow. Phone and both Turnover input heights match other single-line controls in every state (44px desktop; existing 48px at 641px). Edit mode additionally confirms Phone/Status and both Turnover fields align, with normal 44px heights and both registration pairs adjacent. Axe reported zero violations; the edit check had no page errors. Visual screenshots were inspected. Evidence: `browser-results.txt`, `edit-results.txt`, `desktop-registration-pairs.png`, `mobile-registration-pairs.png`, and `edit-vendor-information.png` under `/tmp/lisno-vendor-registration-layout-qa/`. Browser and local server were closed after verification.
