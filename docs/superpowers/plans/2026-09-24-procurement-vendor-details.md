# Procurement vendor details task plan

Date: 2026-09-24
Status: Original scope implemented in approved Mode A. Execution checkbox amendment specification and task plan approved; user selected Mode A. E0–E5 complete; the amendment passed scoped final verification.
Approved specification: [Super Admin procurement vendor details](../specs/2026-09-24-procurement-vendor-details-design.md).
Approval record: The user approved the original specification and its explicit `allocatedWorkPaise` option. The user subsequently approved the Execution checkbox amendment specification and plan, then selected Mode A again.
Confirmed constraint: Reuse the existing Main Basket and Sub Basket records, APIs, relationships, and inline creation controls.

## Execution checkbox amendment task plan

This is the current approved amendment. Original implementation tasks and verification below remain historical evidence; the amendment has its own approval and Mode A selection. The approved specification's amendment acceptance items 1–6 are referenced here as C1–C6; original AC1, AC2, AC6, AC8, and AC9 also apply.

### Outcome and fixed contract

When Vendor Type is Execution, replace its two Execution Type radios with independent checkboxes. Labor alone, Material + Labour alone, and both together are valid. Require at least one. Preserve single-choice Vendor Type and Supplier Yes/No controls.

Keep `procurementProfile.executionType` as the only stored selection field. Canonical Execution values are one- or two-element arrays, ordered `labor`, then `material_labour`; Supplier remains null. Accept legacy scalar Execution values on input and stored reads, then normalize them to a one-element array. Reject duplicates, unknown values, empty Execution selections, and contradictory Supplier profiles. Return canonical arrays/null in detail responses; document broader compatible input separately from canonical output.

No migration/backfill, new endpoint, dependency, permission, basket hierarchy, or allocation rule is needed. Existing verification metadata, vendor IDs, scalar records, profile-less records, omitted-profile updates, private caches, and unrelated working-tree edits must remain intact. Deployment is outside this task; future frontend/backend rollout must be coordinated, and rollback cannot truncate both selections to one.

### Dependency order and ownership

Amendment approval and Mode A are confirmed. E0–E5 are complete; final scoped verification passed. Keep one parent task in progress at a time.

| Task | Deliverable | Dependency | Owner in Mode A | Acceptance |
| --- | --- | --- | --- | --- |
| E0 | Capture the amendment baseline and confirm the already-approved contract against current files. | Approval and execution selection | Primary | C3, C6 |
| E1 | Implement the two independently owned slices below. | E0 | Backend and frontend writers | C1–C5 |
| E2 | Integrate the contract, inspect combined diff and resolve mismatches. | Both E1 writers finished | Primary | C1–C6 |
| E3 | Read-only integrity review, then bounded owner fixes. | E2 | `integrity_reviewer`; fixes by owner | C3–C5 |
| E4 | Verify the final integrated result, including rendered interaction. | E3 findings resolved | `verification_runner`; primary for browser | C1–C6 |
| E5 | Record evidence, preserved limits and final handoff. | E4 | Primary | C6 |

In Mode B, the primary performs every slice, review and verification inline. In Mode A, only the backend and frontend E1 slices run in parallel. Review and final verification run after all source writers finish. Every agent receives explicit ownership and the instruction that others share the worktree and their changes must not be reverted.

**E0 baseline.** Capture `git status --short`, per-target diffs and contents of untracked target files under `/tmp/lisno-procurement-execution-checkbox-qa/`. These targets contain the earlier authorized implementation; treat that as the preservation baseline. Confirm current scalar validation, the shared Checkbox primitive, existing field-error focus, and `recoverCreate`'s current value comparison. Do not treat the original full-suite failures as regressions introduced by this amendment.

**E1 backend slice.** Own only:

- `backend/src/contracts/procurement-vendor.ts`.
- `backend/src/services/procurement-vendor-profile.ts`.
- `backend/src/models/AiEstimatorKnowledgeVendor.ts`.
- `backend/src/openapi/procurement-vendor.ts`.
- The `changedProfileFields` audit comparison in `backend/src/services/ai-estimator-knowledge-reference.service.ts` only, because scalar reference equality must become value equality for Execution arrays. Its pre-amendment content is captured alongside other targets.
- `backend/tests/procurement-vendor-profile.test.ts`, `procurement-vendor-profile.replica-set.test.ts`, `procurement-vendor-profile.fixture.ts`, and bounded profile-schema assertions in `api-docs.test.ts` or `ai-estimator-knowledge-models.test.ts` when needed.

Update the canonical type, runtime validation, stored-profile normalization, Mongoose array/null validation and request/response documentation consistently. Ensure lean legacy reads and lifecycle-only operations do not discard scalar-backed profiles or verification fields. Keep legacy scalar fixtures explicitly available rather than converting every fixture and losing compatibility coverage. Test both-selected persistence, reducing to one selection, Supplier transitions, and schema failures. Existing transaction, version, audit and private projection behavior must remain unchanged. Do not edit allocation, photo lifecycle, shared app wiring, authorization registries or frontend files.

**E1 frontend slice.** Own only:

- `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts`.
- `frontend/src/features/procurement/{VendorProfileFields,ProcurementVendorEditor}.tsx`.
- `frontend/src/features/procurement/vendorProfileDraft.ts` and `vendorProfile.fixtures.ts`.
- `frontend/src/features/procurement/{ProcurementVendorProfile,VendorProcurement}.test.tsx`.
- `frontend/src/features/procurement/vendorProcurement.css` only if the existing group styles cannot accommodate the shared Checkbox primitive.

Represent the local selection as an array and serialize canonical array/null values. Render two labeled, keyboard-accessible checkboxes with group-level at-least-one validation; never require both individually. Preserve first-invalid-control focus, error association, dirty-close behavior and drafts through failed saves. Clear conditional state on Vendor Type changes as approved. Replace array reference comparison in uncertain-create reconciliation with normalized value comparison, retaining strict comparisons for other profile fields. Cover equivalent arrays, genuinely different selections, save/reopen, unchecking one/both, and both-selection retention after errors. Do not modify the shared Field primitive, basket creation controls, directory filters, allocation UX or backend files.

**E2 integration.** The primary checks that backend detail output and frontend types agree; input OpenAPI accepts legacy scalars while output documents only canonical arrays/null. Inspect all `executionType` references and run the focused checks below. Preserve the earlier procurement features, especially stored-profile completeness, lost-response recovery, and private-cache separation. An unexpected cross-boundary change returns to the primary before any additional file owner writes.

**E3 review.** Inspect scalar compatibility, model casting, duplicate rejection, deterministic order, Supplier nulls, lifecycle-only writes, array comparisons in retry recovery, field-group accessibility, and absence of unrelated financial/permission changes. Resolve confirmed findings in their owner slice before E4.

### Verification and completion criteria

| Area | Command or check | Required evidence |
| --- | --- | --- |
| Backend profile/contract | From `backend/`: `npm test -- tests/procurement-vendor-profile.test.ts tests/procurement-vendor-profile.replica-set.test.ts tests/ai-estimator-knowledge-models.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts` | C1/C3/C4: singleton/both arrays, scalar legacy input and stored reads, invalid values/duplicates/empty arrays, Supplier transitions, CAS persistence and canonical response. |
| Dependent procurement regressions | From `backend/`: `npm test -- tests/procurement-vendor-allocation.replica-set.test.ts tests/procurement-vendor-photo.replica-set.test.ts tests/ai-estimator-knowledge-reference.service.test.ts` | Scalar fixtures remain usable; profile normalization does not change cap, verification, photo or lifecycle behavior. Disposable Mongo replica sets only. |
| Frontend workflow | From `frontend/`: `npm test -- src/features/procurement` | C1/C2/C3/C5: select either/both, independent uncheck, accessible empty error, save/reopen, type switches, failure draft retention and value-based create recovery. Existing procurement workflows pass. |
| Compile and production bundles | In each of `backend/` and `frontend/`: `npm run typecheck` and `npm run build` | C6: integrated contracts compile and both bundles build. |
| Rendered desktop/mobile | Synthetic vendor form at approximately 1440px and 390px; browser pointer/keyboard and accessibility scan. | Both checked simultaneously, individual uncheck, zero-selection error/focus, save/reopen, Supplier switch, visible focus, no overflow or new console errors. |
| Hygiene | `git diff --check` and `git status --short`; inspect amendment diff against E0 capture. | Only owned changes; prior implementation/unrelated work preserved; no artifacts staged. |

Use focused tests first and broaden only for newly discovered affected paths or failures. Full backend/frontend suites already have documented unrelated failures; rerunning all unrelated suites is not required for this bounded amendment. Mobile/OCR verification is unnecessary unless investigation finds a changed consumer. No lint script exists.

Final handoff must distinguish the amendment results from historical test counts below, list exact commands and any unrun checks, and link synthetic QA artifacts from the task-owned temporary directory. The user-facing result is that both Execution checkboxes can be selected and retained together.

All amendment gates are complete. Implementation proceeded in the selected Mode A with independent backend/frontend ownership.

## Outcome and boundaries

Deliver the expanded Super Admin vendor form, private vendor photo management, shared basket classification, compatible vendor list/detail APIs, and the backend ₹50,000 cumulative allocation rule. Preserve existing vendor IDs, unit-price meaning, role boundaries, legacy records, and unrelated work.

All requirements and AC1–AC9 refer to the approved specification. This plan makes implementation and verification concrete; it does not authorize deployment, staging, commits, seeds, production mutations, or a historical data backfill. No new dependency is planned.

The next gate after task-plan approval is execution-mode selection. Mode A uses native subagents with the boundaries below. Mode B performs the same work, review, and verification sequentially in the primary thread. Do not start either until the user selects a mode.

## Settled implementation contracts

### Vendor profile and shared references

- Keep `AiEstimatorKnowledgeVendor` as the only vendor model. Store the validated optional profile under `procurementProfile`; keep Entity Name in existing `name` and preserve/generate vendor codes using existing conventions.
- Use a dedicated vendor contract/validation module. A supplied profile must be complete and valid; absent profile on legacy operations preserves the stored profile. Only an explicit authorized profile edit can change verification. A missing profile is not verified.
- Use separate list-summary and full-detail DTOs. General picker and shared master caches must never contain private identity/contact/image data.
- Profile fields and limits are those in the specification. Preserve integer-paise turnover values, nullable verified turnover, explicit false answers, mutually exclusive classification values, and server-stamped verification metadata.
- Main Basket and Sub Basket persist stable IDs from the current Configuration Tool. Reuse its APIs and normalized duplicate behavior. Add vendor reference counts to existing deletion-impact responses and prevent referenced basket/sub-basket hard deletion.
- Keep existing `/admin/ai-estimator-knowledge/vendors` create/list and `PATCH .../vendors/:id` operations. Add a full-detail read and photo operations on that same resource. Preserve minimal `/procurement/vendors` read/quick-add behavior and existing lifecycle semantics.

### Photo routes and persistence

Use these resource paths, all below the existing `/api/v1` prefix:

| Operation | Input/result | Permission behavior |
| --- | --- | --- |
| `GET /admin/ai-estimator-knowledge/vendors/:id` | Vendor detail with current version and authorized profile. | Existing configuration read and sole-active-Super-Admin guard. |
| `GET /admin/ai-estimator-knowledge/vendors/:id/photo` | Private authenticated image response; no storage-key exposure. | Same authorized read boundary. |
| `PUT /admin/ai-estimator-knowledge/vendors/:id/photo` | Multipart image, `expectedVersion`, and stable request identity for retry; returns updated version and photo descriptor. | Existing configuration update and sole-active-Super-Admin mutation guard. |
| `DELETE /admin/ai-estimator-knowledge/vendors/:id/photo` | Version precondition; returns updated version and no photo. | Same update boundary. |

Photo mutation must use the existing upload-size configuration, signature checking, image decoder, `FileStorage`, private response patterns, and recoverable cleanup conventions. Save original bytes to preserve embedded geotags. A small resource-specific cleanup/intent record may be necessary for durable compensation; it must reuse storage adapters and the existing maintenance pattern, not create a second upload platform or reuse unrelated profile-photo business rules.

The photo descriptor can expose an opaque photo ID, authenticated endpoint, MIME type, size, and upload time to authorized detail consumers. Storage reference/hash and private original metadata remain internal. A picture does not certify physical verification. New-vendor creation and photo attachment are separate writes with explicit partial-success recovery and stable vendor identity.

### Allocation and historical baseline

- Add nullable `allocatedWorkPaise` to project procurement items and DTOs, separate from `pricePaise`. New vendor-linked assignments require a positive safe integer amount. The amount includes applicable tax; no inferred multiplication or tax conversion.
- Omission on an existing-item update preserves the previous amount. Ordinary requests cannot reset a recorded amount to unknown. Removing a vendor clears that item's current commitment atomically; reassignment checks the new vendor and audits the old/new commitment.
- Aggregate all recorded commitments by stable vendor ID across all projects. Do not reset on completion or new estimate versions. Apply `5_000_000` paise inclusively unless the current profile explicitly verifies the address.
- Coordinate allocation updates, vendor reassignment, and profile verification writes through the same vendor-document transaction write. Acquire multiple vendor locks in deterministic ID order and recompute on retry. Protect unchanged-vendor amount updates too.
- Use one domain policy and one transaction-aware aggregate helper. Avoid a second independently maintained cumulative counter. Add a vendor aggregation index if needed; never run index maintenance against an external database during development.
- Return stable errors for cap exceeded, unknown historical baseline, stale version, and invalid allocation. Do not reveal other projects in Procurement-role errors.

Historical baseline completion is a restricted correction, not a way to label new work as historical:

- Every item created by the new service receives a server-owned immutable allocation-tracking marker, even when created without a vendor. Clients cannot supply or remove it.
- An existing vendor-linked item is eligible for historical completion only while it has neither a tracking marker nor a recorded amount. Metadata-only legacy edits preserve that state. A normal reassignment or vendor removal consumes eligibility; it cannot later be restored by a client.
- Only the sole active Super Admin may inspect and record missing historical values through the configuration-authorized operations below. Procurement staff get an actionable baseline-incomplete message and cannot invoke this correction.
- Baseline completion is one-time, requires a reason, and verifies item ID, current vendor relationship, eligibility, and expected item version in a transaction. It sets the recorded amount and tracking marker, writes an audit, and leaves item/unit-price/source identity intact.
- Explicitly recorded historical values may reveal an already over-cap total. Preserve the factual amount and block subsequent increases. Do not roll back truthful verification downgrades or historical records merely to hide an over-cap state.

| Operation | Contract |
| --- | --- |
| `GET /admin/ai-estimator-knowledge/vendors/:id/allocation-baseline` | Paginated minimal rows of that vendor's eligible historical items, identified by stable project/item IDs and labels, with item version. Configuration read; no full project/estimate document exposure. |
| `POST /admin/ai-estimator-knowledge/vendors/:id/allocation-baseline/:itemId` | `{ expectedVersion, allocatedWorkPaise, reason, idempotencyKey }`; configuration update with sole-Super-Admin guard. Same retry returns the recorded result; changed input for that identity conflicts. |

Expose this narrowly scoped correction from the Super Admin vendor detail when unknown history blocks allocation. Do not grant Super Admin ordinary Procurement-role item editing. Do not run a migration/backfill or create data on the user's behalf while implementing the feature.

## Ownership and dependency graph

One parent task is in progress at a time. In Mode A, independently owned child slices may run inside T2; review and final verification start only after every writer has finished.

| Task | Outcome | Depends on | Owner in Mode A | State |
| --- | --- | --- | --- | --- |
| T0 | Capture current baselines and confirm exact write boundaries. | Approved plan and execution choice. | Primary. | Complete |
| T1 | Freeze shared API/domain contracts and prepare shared integration points. | T0. | Primary. | Complete |
| T2 | Implement vendor/configuration, allocation, and frontend slices. | T1. | Three independent writers below. | Complete |
| T3 | Integrate routes, contracts, maintenance, and cross-slice behavior. | All T2 writers complete. | Primary. | Complete |
| T4 | Independent integrity review and bounded fixes. | T3. | `integrity_reviewer`, then owning writer/primary for fixes. | Complete |
| T5 | Verify the final integrated result and rendered workflows. | T4 findings resolved. | `verification_runner` and primary for browser inspection. | Complete with broad-suite limitations below |
| T6 | Reconcile final diff, update task evidence, and hand off. | T5 passes or limitations precisely recorded. | Primary. | Complete |

### T0: Baseline and preservation

Acceptance: AC6, AC7, AC9.

1. Re-read applicable instructions and the approved specification/plan. Capture `git status --short` and per-target diffs before assigning any writer.
2. Record current changes to shared app wiring, audit/authorization/route registries, OpenAPI, API tests, and frontend/mobile authorization contracts. These already contain unrelated chat/profile/mobile work; never revert or replace it.
3. Inspect current relevant tests and development fixtures to confirm legacy shapes. Do not access a production connection or print personal records. Any local dataset check must first establish a disposable/authorized development target and report aggregate counts only.
4. Run a focused baseline for the existing vendor directory and procurement item paths, plus affected contract checks. Record any pre-existing failures separately from new regressions.
5. In Mode A, give each writer its exact paths, read-only dependencies, immutable rules, expected deliverable, and explicit instruction that others share the worktree. No writer may edit another slice or undo its work.

Stop condition: an overlapping dirty target is not understood, or a contract decision would materially change the approved specification. Continue independent read-only work while resolving the specific issue.

### T1: Shared contracts and integration preparation

Acceptance: AC1–AC7, AC9.

Primary-owned shared files/modules:

- New `backend/src/contracts/procurement-vendor.ts` for profile/detail/summary/photo/baseline public types, keeping persistence internals private.
- `backend/src/app.ts`, `backend/src/domain/audit-actions.ts`, `backend/src/domain/route-operations.ts`, and `backend/src/openapi.ts`.
- Any necessary authorization-registry/contract changes, exact operation test fixtures, and shared API/authorization inventory tests.
- Plan/spec ownership and final contract reconciliation. Do not modify the approved specification unless a material change requires renewed approval.

Publish the fixed profile shape, response projections, validation/error conventions, expected versions, route paths, allocation null/omission rules, tracking-marker behavior, lock ordering, and photo retry lifecycle before writers start. Establish import/service signatures so the three slices can compile against the same contract without inventing fallbacks.

Reuse existing permission codes wherever accurate. New operation inventory entries must identify configuration scope and appropriate Super Admin read/admin behavior. Synchronize only unavoidable mobile contract inventory changes in primary-owned files; preserve the unrelated mobile work. Do not turn optional new response fields into a requirement for old read clients.

### T2A: Vendor profile, Configuration references, and private photo backend

Owner: one `backend_implementer` in Mode A; primary in Mode B.
Acceptance: AC1–AC4, AC6, AC7.

Owned existing paths:

- `backend/src/models/AiEstimatorKnowledgeVendor.ts`.
- `backend/src/routes/ai-estimator-knowledge-admin.ts`.
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`.
- Existing knowledge model/reference/route/sub-basket tests when directly relevant.

Owned new paths: vendor-specific validation/profile/photo service and route modules, photo cleanup/intent metadata only if needed, and `backend/tests/procurement-vendor-profile*.test.ts` / `procurement-vendor-photo*.test.ts`. Choose bounded names before assignment; do not edit app/registry/OpenAPI files owned by primary.

Work:

1. Add optional profile and private photo persistence without making old documents invalid. Extend create/update validation and keep code/name/version normalization and uniqueness.
2. Add safe list filters/summary projection and full-detail retrieval. Prevent unrelated master APIs and procurement pickers from leaking private fields.
3. Validate Main Basket/Sub Basket existence, parent match, lifecycle, and incoming reference races. Extend existing deletion impacts/guards to count all retained vendor references, including inactive/archived vendors.
4. Make physical verification changes use the shared vendor write coordination. Reset/reconfirm verification when the current address changes; stamp actor/time on the server.
5. Implement private photo read/upload/replace/remove with validation before publication, expected versions, retry identity, post-commit old-object cleanup, and recoverable failure handling. Reuse existing storage and image dependencies.
6. Preserve simple quick-add and configuration legacy writes. Add safe audit events without copying private profile values.
7. Test classification, required fields, separate turnovers, duplicate identities, old records, private projections, deletion races, and photo failure/concurrency behavior. Report exact route/service wiring required by primary.

Boundary: Do not edit project procurement item/domain/service files or the frontend. Read the allocation helper contract and share any proposed change with primary immediately.

### T2B: Cumulative allocation backend and restricted historical correction

Owner: a second `backend_implementer` in Mode A; primary in Mode B.
Acceptance: AC5–AC7, AC9.

Owned existing paths:

- `backend/src/models/ProjectProcurementItem.ts`.
- `backend/src/domain/project-procurement.ts`.
- `backend/src/services/project-procurement.service.ts`.
- `backend/src/routes/project-procurement.ts` and `backend/src/openapi/project-procurement.ts`.
- `backend/tests/project-procurement-routes.test.ts` and `backend/tests/project-procurement-mongo.replica-set.test.ts`.

Owned new paths: allocation domain/aggregate/baseline service and dedicated baseline router modules; `backend/tests/procurement-vendor-allocation.test.ts` and `backend/tests/procurement-vendor-allocation.replica-set.test.ts`.

Work:

1. Add amount and server-owned tracking provenance with explicit missing/null semantics. Set the marker for all newly created items and prevent legacy request omission from clearing recorded values.
2. Implement the single cap policy and transaction aggregate. Lock both vendors in a deterministic order for reassignment. Coordinate with the vendor-document writes used by T2A rather than maintaining an unrelated lock or counter.
3. Apply policy to every allocation increase/create/reassignment, including updates that keep the vendor unchanged. Preserve approved estimate lineage, ordinary project authorization, versions, and unit-price values.
4. Handle verified, unverified, unknown-baseline, and already-over-cap states; allow valid reductions and unrelated corrections without granting an increase exception.
5. Implement the Super Admin-only baseline read/completion routes and one-time eligibility/idempotency rules specified above. New/unassigned/reassigned items must not enter this exception path.
6. Add an aggregation index if justified by the actual query. Do not execute production index maintenance or a data migration.
7. Use replica-set tests for concurrent allocations, verification interleavings, assignment/removal, transaction retries, rollback on audit failure, stale versions, one-time baseline correction, and absent private-data leakage. Report the needed app/audit/route registry wiring to primary.

Boundary: Do not edit the shared vendor model, knowledge reference/admin service/router, global OpenAPI/registries, frontend, or general finance accounting. T2A owns vendor verification writes; settle the common coordination semantics before either slice mutates behavior.

### T2C: Vendor editor, directory, shared baskets, and allocation UX

Owner: `frontend_implementer` in Mode A; primary in Mode B.
Acceptance: AC1–AC8.

Owned paths:

- `frontend/src/features/procurement/` relevant components, API wrappers, styles, and tests, including new focused vendor profile/photo/baseline components.
- `frontend/src/features/ai-estimator-knowledge/{knowledgeApi,knowledgeTypes,knowledgeQueryKeys,knowledgeMutationSync}.ts` and related configuration deletion UI/tests only where needed.
- `frontend/src/api/types.ts` for additive project-item types.

Work:

1. Build the focused profile editor from existing ContextPanel/Field/Radio/Select/Textarea/FileInput primitives and current CSS tokens. Retain directory navigation, archive actions, lifecycle, and KPI placeholder.
2. Implement every requested field and conditional branch, validation summary/field errors, exact warning, distinct `NA` verified turnover, current-address verification reset, dirty-close protection, and draft recovery.
3. Reuse `CreateKnowledgeBasketFields` and `CreateKnowledgeSubBasketFields` directly, along with current knowledge APIs and pagination helpers. Clear stale sub-basket selection on parent change. Handle empty/error/loading/retry, normalized duplicate recovery, and permission-gated additions without losing the vendor draft.
4. Extend existing list search/filter/pagination with safe vendor classification and basket columns. Show incomplete and unavailable-reference states without inventing values.
5. Add local image preview, authenticated saved preview, replace/remove actions, loading/error states, and create-then-photo partial-success recovery. Preserve returned vendor ID/version across retry. Keep private detail cache separate from shared pickers.
6. Add `Allocated work (INR)` to vendor-linked project procurement editing, clearly separate from unit price and including applicable tax. Render legacy unknown as `Not recorded`; preserve omission for unrelated legacy edits. Surface backend cap/baseline errors without exposing other projects.
7. Add the narrow Super Admin baseline correction view from vendor detail, with stable item identity, amount, required reason, busy/version/idempotency handling, and explicit historical-correction wording. Do not expose ordinary project item editing to Super Admin.
8. Invalidate/update all affected detail/list/picker/suggestion/basket queries. Show new vendor-reference deletion blockers in existing Configuration deletion UI; reuse its current interaction pattern.
9. Add meaningful rendered interaction tests for all branches, stale selections, pagination, keyboard focus, failed saves/uploads, responsive content, and cache privacy.

Boundary: No backend or mobile source edits. No redesign, package installation, replacement of shared UI primitives, new icon imports, or hardcoded basket choices. Report contract discrepancies to primary rather than inventing client-only financial values.

### Parallel safety for T2

After T1, T2A, T2B, and T2C can run concurrently with exclusive path ownership. T2A and T2B read each other's settled contract but never share write ownership. Primary alone changes global app wiring, route/audit inventories, shared authorization tests, and contract definitions.

If a shared contract must change, pause the dependent edits, publish the correction, and update all consumers coherently. A writer completing early may review its own bounded tests; do not launch final integrated verification while another writer is still changing sources.

### T3: Integration

Acceptance: AC1–AC9.

1. Wait for all T2 deliverables and inspect their diffs against the initial baseline. Resolve overlapping changes before wiring services.
2. Mount detail/photo/baseline routes with canonical authorization markers and existing API envelopes. Confirm authentication precedes multipart processing.
3. Wire storage maintenance/reconciliation through existing lifecycle mechanisms if introduced. Make sure retries after uncertain commits do not delete an attached image or duplicate baseline writes.
4. Reconcile OpenAPI, operation inventories, contract drift, audit actions, expected route counts, frontend types, and mock handlers while preserving unrelated profile/chat changes.
5. Exercise full create/update/photo/basket/allocate sequences. Confirm UI versions are refreshed after each separate mutation and private detail objects never enter global vendor picker caches.
6. Confirm legacy/mobile payloads retain existing recorded allocations on edits and receive an actionable validation response for new vendor assignments without an amount. No silent cap bypass to preserve an old create payload.

### T4: Integrity review

Acceptance: AC3–AC7, AC9.

In Mode A, run a read-only `integrity_reviewer` after all writers/integration finish. In Mode B, primary performs the same review inline.

Review must cover authorization at routes and services, sole Super Admin checks, privacy projections/audits, stable IDs, profile/basket referential integrity, expected versions, allocation unit correctness, cross-project aggregation, all amount mutation paths, shared transaction coordination, historical exception eligibility, and photo persistence/cleanup races.

Each finding needs a concrete path/scenario and severity. Assign fixes only to their owner, review the resulting diff, and rerun affected checks. Do not mark the task complete with unresolved high-impact correctness or data exposure findings.

### T5: Final integrated verification

Acceptance: AC1–AC9.

Run focused checks first, then broader suites appropriate to changed contracts. New test filenames below are planned deliverables, not claims that they already exist. Use the repository's disposable Mongo replica-set helper; never substitute a production database. If a sandbox blocks a required tool/network/binary action, use the standard escalation path rather than weakening the tests.

| Coverage | Exact command or action | Expected evidence |
| --- | --- | --- |
| Profile validation and routes | In `backend/`: `npm test -- tests/procurement-vendor-profile.test.ts tests/ai-estimator-knowledge-models.test.ts tests/ai-estimator-knowledge-routes.test.ts` | All fields/conditional rules, legacy behavior, safe projections, unauthorized requests. |
| Shared vendor/configuration persistence | In `backend/`: `npm test -- tests/procurement-vendor-profile.replica-set.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-sub-basket-management.replica-set.test.ts` | Profile CAS, actual shared hierarchy, duplicate prevention, deletion/assignment races. |
| Photo lifecycle | In `backend/`: `npm test -- tests/procurement-vendor-photo.test.ts tests/procurement-vendor-photo.replica-set.test.ts` | Signature/decode/size validation, privacy, retries, rollback, replacement, removal, recoverable cleanup. |
| Cap and historical correction | In `backend/`: `npm test -- tests/procurement-vendor-allocation.test.ts tests/procurement-vendor-allocation.replica-set.test.ts tests/project-procurement-routes.test.ts tests/project-procurement-mongo.replica-set.test.ts` | Boundaries, concurrency, correction eligibility, idempotency, old-client semantics, financial-source preservation. |
| Authorization/API integration | In `backend/`: `npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts` | Exact mounted operations, non-disclosure, role boundaries, documented contracts. |
| Vendor editor and procurement UI | In `frontend/`: `npm test -- src/features/procurement` | Required fields, every classification branch, baskets, partial photo success, cap errors, baseline correction, list/filter/pagination and existing workflows. |
| Configuration consumers | In `frontend/`: `npm test -- src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/KnowledgeBasketDeletion.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx` | Same hierarchy/API, reference blockers, compatible generic controls. |
| Backend compile and broad regression | In `backend/`: `npm run typecheck`, `npm test`, `npm run build` | Integrated compile, test, and production build results, distinguishing unrelated baseline failures. |
| Frontend compile and broad regression | In `frontend/`: `npm run typecheck`, `npm test`, `npm run build` | Integrated compile, test, and production bundle results. |
| Mobile contract compatibility | In `mobile/`: `npm run test:contracts` and `npm run typecheck` if shared operation/types require changes | Additive response compatibility and maintained operation registry; no mobile UI redesign. |
| Rendered QA | Run a loopback app with synthetic fixtures; inspect 390px, 768px, and 1440px widths with browser automation. | Actual layout, keyboard/focus, API errors, private preview, no overflow or new console errors. |
| Hygiene | Repository root: `git diff --check` and `git status --short`; inspect final target diffs. | No whitespace errors, unrelated work preserved, no runtime artifacts staged. |

Financial/concurrency fixtures must include two unequal projects and at least two vendors. Cover ₹30,000 plus ₹20,000 accepted, then ₹0.01 rejected; two simultaneous increases whose combined total breaches the cap; a verified vendor above the cap; unknown verification; vendor reassignment; price-only edits; reductions; verification downgrade during allocation; missing historical amounts; one-time historical completion revealing an over-cap total; and rejection of a fabricated historical correction on a new item.

Rendered QA must include Execution/Labor, Execution/Material + Labour, Supplier/Yes, Supplier/No, required-field errors, NA/zero verified turnover, all-pages basket loading, parent switching during a request, inline add/duplicate/retry, saved photo reload/replacement/removal, upload failure after vendor save, stale version recovery, baseline correction permissions, legacy display, narrow-screen action access, and keyboard/accessible names. Use synthetic private-data fixtures only.

Load the relevant browser QA skill when executing that stage. Place any temporary logs/screenshots under `/tmp/lisno-procurement-vendor-details-qa/` or an ignored workspace output directory and report paths. Do not commit generated files. Neither workspace defines a lint script; record lint as unavailable, never as passed.

### T6: Evidence and handoff

Update this plan with task status, exact commands/results, browser scenarios, artifact locations, and remaining limits. Link the affected sources in the final handoff, explain the shared model/basket decision and backend allocation enforcement, and identify any unrun check.

No production migration, automatic baseline completion, deployment, commit, push, or real vendor upload is part of implementation verification. A rollback after enforcement begins must preserve the cap or disable allocation writes; an older server must not silently re-enable unchecked assignments.

## Current-stage verification

At task-plan creation: read-only code/test/contract investigation and documentation checks only. No application source edits, test executions, database writes, or subagent work were performed for this stage. The approved specification remains unchanged; approval is recorded here because this stage writes only the separate task plan.

## Execution evidence

- 2026-09-24: user approved plan and selected Mode A. Shared contract released at `backend/src/contracts/procurement-vendor.ts`; three independent writers active.
- Initial status and shared diffs captured under `/tmp/lisno-procurement-vendor-details-qa/`. Existing unrelated profile/chat/mobile edits preserved.
- Focused baseline: backend procurement routes/operation registry/API docs 124 passed; frontend vendor directory/project item tests 34 passed. Initial sandbox listener denial resolved by approved unsandboxed test run.

- Integrated profile/basket/photo backend: 193 focused tests passed; allocation backend: 136 passed; frontend: 118 focused tests passed. Both workspace typechecks passed during implementation.
- Integrity review found and resolved two P2 issues: OpenAPI mutation DTO/name-only create accuracy, and vendor cache invalidation after basket changes. Follow-up review reported no residual confirmed findings. OpenAPI regression: 29 passed. Basket cache regressions and related tests: 47 passed.
- Browser QA at 1440px: complete editor had zero axe violations, no document overflow/unexpected API requests/render errors. Supplier/No, parent/child reset, save/reopen, and photo preview passed. Native browser multipart sent original PNG bytes, expectedVersion, and idempotencyKey to a disposable loopback server; evidence `multipart-wire.json`.

- Rendered QA completed in headed Chromium 153, DPR1, Vite development mode with synthetic fixtures at 1440×1000, 768×1024, and 390×844. All three axe scans reported zero violations and no document overflow. Screenshots were visually inspected after the drawer transition settled.
- Browser workflows passed: four classification branches, create/save/reopen, null/zero verified turnover separation, address change resets verification, shared inline Main/Sub Basket creation, child reset, historical amount correction, native multipart upload, authenticated preview, injected upload failure/retry and removal, required-field focus, drawer keyboard containment, and unsaved-change confirmation. The one final console error was the deliberately aborted upload. Synthetic HTTP fixtures were used for UI persistence; real backend/replica behavior is covered by automated tests. Physical devices were not tested.
- QA evidence and screenshots: `/tmp/lisno-procurement-vendor-details-qa/browser-qa.json`, `multipart-wire.json`, and `vendor-*.png`. The task-owned browser and both loopback servers were stopped; temporary browser snapshots and harness were moved out of the worktree into that directory.

## Final verification and limitations

No confirmed procurement integrity findings remain after independent review and fixes. Verification was run on the integrated working tree, with the unrelated starting edits retained. No dependencies/lockfiles, commits, deployments, seeds, migrations, historical backfills, or production records were changed.

| Check | Result |
| --- | --- |
| `backend`: `npm run typecheck`; `npm run build` | Both exit 0. |
| `frontend`: `npm run typecheck`; `npm run build` | Both exit 0. Existing Vite chunk-size warning remains. |
| `mobile`: `npm run typecheck`; `npm run test:contracts` | Typecheck exit 0; 3 contract tests passed. |
| `frontend`: `npm test -- src/features/procurement src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/KnowledgeBasketDeletion.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts` | 11 files, 136 tests passed. |
| Backend procurement/vendor/reference suites within full run | 11 files, 231 tests passed, including actual Mongo replica-set allocation, verification, CAS, reference deletion, baseline and photo lifecycle cases. |
| Backend shared authorization/registry/OpenAPI/server rerun | 136 tests passed across five files. |
| `backend`: `npm test` | 175 files passed, 8 failed; 3,808 tests passed, 12 failed. One task-related audit-inventory assertion was updated for the three added actions and then passed. |
| `frontend`: `npm test` | 227 files passed, 6 failed; 3,448 tests passed, 18 failed. Failures outside the procurement slice detailed below. |
| `git diff --check`; `git status --short` | Exit 0; reviewed working tree retains unrelated changes, no task runtime artifacts staged. |
| Rendered interaction/accessibility | Passed at 390, 768, and 1440px with synthetic records; zero axe violations. Original file bytes verified over native browser multipart HTTP. |

Backend failed-file plus shared-contract rerun command, executed from `backend/`:

```sh
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts tests/ai-estimator-knowledge-bootstrap.replica-set.test.ts tests/design-workflow-initialization.test.ts tests/estimate-design-extraction.test.ts tests/full-journey.test.ts tests/managed-storage.test.ts tests/production-super-admin-bootstrap.test.ts tests/super-admin-authorization.test.ts
```

Result: 10 files passed, 2 failed; 414 tests passed, 4 failed. Earlier bootstrap/storage/OCR timing and HTTP parse failures did not reproduce. The remaining four assertions are one existing design-workflow blocked-reason expectation and three cross-role design/OCR journey assertions. Their test files and relevant workflow implementations are unchanged by this task; no procurement profile, allocation, or photo path is involved. They remain unresolved and the overall backend suite is not green.

Frontend rerun of the six failed files produced 251 passed and 19 failed, with one additional My Projects focus/timing failure. The original failures cover the initial unrelated profile-photo permission count (136 versus old expectation135), the existing Procurement navigation link missing from AppShell expectations, password-reset/signup/accessibility behavior, and 13 older KnowledgeScreens tests looking for former inline pricing controls instead of the existing Add Specification dialog. Independent verification inspected the affected untouched implementations and initial worktree snapshot. These remain outside this task; the overall frontend suite is not green.

There is no lint script. OCR-worker suites were not run because no worker source or extraction contract changed. Browser testing used development-mode synthetic persistence and emulated widths, not a production deployment or physical devices. Replica-set and route tests exercised the real backend contracts. Photo cleanup tests cover crashes, retries, failed deletion, CAS, and uncertain commits; the specific combined expired-writer plus retry plus simultaneous cleanup-worker schedule remains an untested interleaving, with no confirmed defect found in review.

Evidence: `/tmp/lisno-procurement-vendor-details-qa/final-backend-tests.log`, `final-backend-rerun.log`, `final-backend-build.log`, `final-frontend-focused.log`, `final-frontend-test.log`, `final-frontend-failures-rerun.log`, `final-frontend-build.log`, `final-mobile-contracts.log`, `browser-qa.json`, `multipart-wire.json`, and inspected `vendor-*.png` screenshots. The initial status/diff and task harness are retained there for traceability.

Acceptance tracing: AC1/AC2 profile validation/API tests and four browser classification branches; AC3 shared catalog/cache, inline-add, parent-switch and deletion-race tests; AC4 private photo HTTP/replica tests and real multipart/retry browser flow; AC5 cross-project cap and verification/baseline replica tests; AC6 legacy fixtures and procurement regressions; AC7 role/route/authorization contracts and private cache tests; AC8 rendered widths/axe/focus/failure recovery; AC9 typechecks/builds/review/hygiene passed, with broad-suite limitations above.

Frontend failed-file rerun command, executed from `frontend/`:

```sh
npm test -- src/api/authorization-contract.test.ts src/app/router.test.tsx src/auth/PasswordResetPage.test.tsx src/test/accessibility.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/components/layout/AppShell.test.tsx
```

Independent final verification reported no procurement regression and confirmed that both full suites remain non-green for the documented out-of-scope failures. Ignored production-build outputs are `backend/dist` and `frontend/dist`; no artifacts were staged.

## Execution checkbox amendment evidence

- User approved the amended specification and plan, then selected Mode A. Captured current dirty-path list, per-target diff and full contents (including untracked sources) in `/tmp/lisno-procurement-execution-checkbox-qa/`. Existing prior procurement and unrelated edits form the preservation baseline.

- Frontend source and scoped visual adjustment complete: 82 procurement tests and frontend typecheck passed. Browser keyboard/select-both/save/reopen, one/zero-selection validation, failed-save preservation and Supplier reset passed at 1440px and 390px; axe found zero violations. Native checkboxes remain 20px within 44px labels.
- Backend initial profile/API suite: 156 passed; dependent allocation/photo/reference suite: 58 passed. Backend typecheck passed. Integration found the prior strict field-value comparison would overreport an unchanged Execution array in audit history; backend ownership expanded narrowly to that comparison, with its baseline captured, to preserve the approved audit behavior.

- Both source writers finished. Amendment-only diff against the preservation baseline spans the 18 owned paths. Backend/frontend detail types agree, all current Execution consumers are updated, and no mobile consumer was found. Audit comparison now uses normalized selection values; the added replica/reference rerun passed 45 tests. Independent integrity review is in progress before final integrated verification.

- Independent amendment integrity review found no confirmed defect. It checked canonical/legacy contracts, lifecycle preservation, audit value comparisons, checkbox group behavior, retry reconciliation, CAS and private-data boundaries. E4 final integrated tests/typechecks/builds are running; source writers remain finished.

### Final amendment verification

The approved amendment is implemented and verified. Independent integrity review found no confirmed defect. Final checks ran after both source writers finished, including the audit comparison fix.

| Check | Result |
| --- | --- |
| Backend: `npm test -- tests/procurement-vendor-profile.test.ts tests/procurement-vendor-profile.replica-set.test.ts tests/ai-estimator-knowledge-models.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts tests/procurement-vendor-allocation.replica-set.test.ts tests/procurement-vendor-photo.replica-set.test.ts tests/ai-estimator-knowledge-reference.service.test.ts` | 8 files, 215 tests passed. Includes disposable Mongo replica-set persistence, legacy scalar compatibility, CAS, audit comparisons, allocation and photo regressions. |
| Frontend: `npm test -- src/features/procurement` | 7 files, 82 tests passed. Includes each selection combination, independent unchecking, required-group error/focus, save/reopen, Supplier resets, failed/stale draft retention and lost-response recovery. |
| Backend and frontend: `npm run typecheck`; `npm run build` | All four commands exited 0. Existing frontend Vite chunk-size warning remains. |
| Repository: `git diff --check`; `git status --short` | Exit 0. Amendment diff reviewed against all 18 owned baseline files. Zero staged changes; existing unrelated work retained. |
| Rendered browser checks | Desktop 1440×1000 and mobile 390×844 passed pointer/keyboard, both-selection persistence, validation, failed-save retry and Supplier reset. Zero axe violations, overflow, render errors or unexpected API requests. |

Acceptance coverage: C1/C2 frontend tests plus rendered save/reopen and independent checkbox interaction; C3 scalar validation/replica/lifecycle tests and legacy UI display; C4 runtime/model/API validation and actual Mongo round-trips; C5 equivalent/different array lost-response tests and failure retention; C6 review, 297 final focused tests, both typechecks/builds, rendered QA and hygiene.

Evidence is retained under `/tmp/lisno-procurement-execution-checkbox-qa/`: `amendment.diff`, `initial-status.txt`, `final-status.txt`, baseline copies, verification logs/report, `browser-qa.json`, `both-desktop.png`, and `both-mobile.png`. Both screenshots were visually inspected. The task browser and Vite server were stopped; the harness and browser snapshots were moved out of the worktree. Ignored build outputs are `backend/dist` and `frontend/dist`.

Full unrelated suites were not rerun for this amendment; their earlier unresolved failures remain documented above. Mobile and OCR checks were not repeated because no consumer or contract in those workspaces changed. No lint script exists. Browser persistence used synthetic responses and emulated viewport widths, not physical devices; real persistence is covered by replica-set tests. No dependencies, lockfiles, commits, deployments, migrations, seeds, backfills or production data were changed. Frontend/backend deployment must be coordinated to preserve the array contract.
