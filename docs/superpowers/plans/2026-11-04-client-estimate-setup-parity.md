# Client estimate setup parity implementation plan

Date: 2026-11-04
Status: Implemented and verified in Mode A; existing full-suite failures documented below.
Approved specification: [Client estimate setup parity with Sales](../specs/2026-11-04-client-estimate-setup-parity-design.md)
Approval evidence: The user replied “Approved” to the specification. Their subsequent clarification, “i mean similar screen like sales estimation,” reinforces the approved requirement to reuse the Sales screen structure, controls and navigation. It does not change the visibility or approval rules.

## Outcome and boundaries

Give Clients the Sales-style Configure estimate → room/basket/Main Line selection → saved estimate experience. Property type (including 1BHK), conditional bedroom count, rooms/dimensions and eligible Main Baskets are selectable. The shared builder exposes permitted Main Lines for selection in the active room. Continue uses the same saved estimate; no separate Client estimate is created.

Keep the single submitted-review view, full-width compact layout, existing item edits/removals, Client-safe Configuration rules and Sales-confirmed pre-design approval. Post-design confirmation stays with the authorized Designer. Existing Sales/Designer/legacy behavior and all earlier worktree changes are preserved.

No first-estimate creation, CRM property updates, unrestricted staff API access, price-policy overrides, dependencies, migrations, seeds, commits, pushes, deployment or external communication are included.

## Contracts and decisions before writers start

1. **Shared screen:** factor reusable setup presentation from the Sales Configure view where needed. Use the existing property dropdown, room selection, room dimensions, Main Basket presentation and shared builder structure. Keep role-specific queries/mutations in adapters. Do not mount the staff workspace with staff permissions for Clients or create a visually independent Client configuration form.
2. **Saved setup:** extend quotation detail additively with a safe setup projection: property type, bedroom count, stable room identity/type/label/dimensions, Client-visible selected basket IDs, editable/removal capabilities and opaque current-source preconditions. Existing line and grouping shapes remain readable.
3. **Setup catalogue:** add `GET /projects/:projectId/quotation/setup`, governed by the canonical quotation-read operation and project scope, with `private, no-store` behavior. Return only eligible Client-visible basket hierarchy and safe presentation metadata. Counts, if displayed, count visible eligible items only. Hidden-only baskets and internal pricing fields never enter the response.
4. **Setup save:** use one strict `configure` operation in the existing version-checked quotation PATCH, containing allow-listed setup changes and explicit removals. Treat it as a standalone command, rejecting mixtures with line/group commands to avoid ambiguous ordering. Save pending line changes before entering setup; save setup atomically before entering item selection. Existing line-only commands remain unchanged.
5. **Complete-server merge:** apply commands to the complete server-owned Estimate, preserving unrepresented rooms/basket memberships and internal fields. A Client-safe projection is never accepted as a full replacement of the estimate. New baskets receive the established standard classification; server code controls pricing mode/defaults.
6. **Stable identity and rules:** preserve existing room IDs and labels. New rooms get stable unique IDs that remain identical through submission and lost-response verification. Property/bedroom changes retain out-of-type saved rooms. Separate pure room/property rules from icon/UI code before sharing them with backend validation; keep current Sales import/API compatibility.
7. **Removal contract:** trace the existing room/line/dependency retention conventions in T1 before finalizing the command reducer. Structural removals must not orphan protected working lines, requirements or design references. Block incompatible removals with generic team-review copy; preserve permitted line exclusion/restoration and immutable history. Do not add archived-room flags or alter downstream room consumers casually. If satisfying the approved invariant requires a new retention model or migration, stop that dependent slice and update the specification rather than silently expanding scope.
8. **Version and approval:** meaningful setup-only changes go through the existing transaction, scope-change comparison, pending-review supersession, staff-confirmation reset, version increments and audit. No-op saves leave versions/approval intact. Source visibility/hierarchy and scoped removal membership are fenced during the transaction. The Client cannot approve until a fresh matching staff-confirmed submission exists.
9. **Direct item selection:** show eligible unselected Main Lines inside the shared room/basket builder, with Client-safe item controls and server-provided choices. The Add item dialog may remain a supporting shortcut, but must not be the only way to select lines. Basket selection alone does not include lines. Scope candidates to saved selected baskets; paginate/load more without losing selected rows or treating a partial page as the full removal scope.
10. **Compatibility:** missing setup metadata or a setup endpoint unavailable on an older backend disables the new setup view with a retry/availability state; existing quotation editing remains usable where authorized. Do not manufacture property defaults or fall back to the unrestricted staff catalogue. Keep locked/no-estimate/legacy flows intact.

These are implementation choices within the approved specification. Final DTO/schema limits, endpoint responses and error codes must be written into the execution record and agreed between writers at T1/T2 before parallel integration.

## Ownership and parallel boundaries

The primary owns product interpretation, the integrated contract, shared cross-layer types/rules, shared Sales consumer changes, Client workspace integration, preservation of prior work, and final reconciliation. Capture the initial dirty-path set, targeted diffs and recoverable copies before assigning any dirty file.

| Slice | Owner in Mode A | File responsibility and exclusions |
| --- | --- | --- |
| Shared contract and rules | Primary | `shared/estimation/` property/room rules if needed; `frontend/src/features/client/quotationApi.ts`; existing `propertyTypes.ts` and `estimateRoomOptions.ts` compatibility exports; contract handoff and fixtures. No concurrent writers to these paths. |
| Backend safe setup | Backend implementer | `backend/src/services/quotation.service.ts`, narrowly extracted quotation setup helpers, `backend/src/routes/quotation.ts`, `backend/src/openapi/quotation.ts`, `backend/src/domain/route-operations.ts`, and quotation/route/auth contract tests. Request primary review before touching other shared domain services or models. |
| Shared setup presentation | Frontend implementer | New shared setup presentation and new Client setup adapter/tests/styles; bounded presentation generalization of `MainBasketSelectionCard.tsx` or setup controls only when assigned explicitly at T1. No edits to `ClientQuotation.tsx`, `LeadEstimateWorkspace.tsx`, `quotationApi.ts`, shared rules, root styles or routes. |
| Screen integration and direct Main Line selection | Primary | `ClientQuotation.tsx`, `clientQuotationDraft.ts`, `clientQuotation.css`, `ClientEstimationWorkspace` and integration tests; `LeadEstimateWorkspace.tsx` to consume shared setup presentation; bounded shared builder/candidate changes, query invalidation and enterprise fixtures. |
| Integrity review | `integrity_reviewer` after integration | Read-only audit of identity, visibility, retention, transactions, pricing, approval, stale queries, staff compatibility and final diff. |
| Final verification | `verification_runner` after fixes | Run agreed checks on the stable integrated result; no product source changes. Primary owns browser screenshots, interactive checks and cleanup. |

No agents start until the execution-choice gate is completed for this task. In Mode A, the backend and setup-presentation slices can run in parallel after T2 freezes the contract. Primary integration can start with approved fixtures, but final mutation integration waits for both slices. In Mode B, the primary completes the same work sequentially without implementation subagents. Only one parent task is marked in progress.

## Dependency-ordered work

### T1. Capture baseline and audit setup/retention boundaries

Owner: Primary. Dependencies: task-plan approval and execution-mode selection. Acceptance: AC2, AC4–AC7, AC9, AC10.

- Snapshot current status, binary diff and pre-existing untracked target files under `/private/tmp/lisno-client-estimate-setup-*`. Reconcile current code with the approved specification; do not restore earlier tasks from HEAD.
- Run focused current Client/Sales setup and quotation tests to establish the baseline. Prior task test counts are background only.
- Trace room IDs and removal references through Estimate, EstimateRequirement, EstimateDesignDrawing, EstimateDesignUpload, EstimateDesignRevision and existing scope/approval services. Distinguish active dependencies from immutable historical snapshots; do not mutate history to permit removal.
- Verify Client-safe basket availability, current overview visibility, saved exclusions, unavailable current lines and source fencing. Check two asymmetric projects and authorized primary/secondary Designers.
- Settle the exact removal retention representation and compatibility behavior within the approved specification. Record what is retained, what can be removed, what blocks removal, and how re-addition behaves. No behavior edits until this is coherent.
- Confirm the concrete file allowlists and synthetic fixture shapes for each writer.

Done when: baseline is recoverable, scope/retention decisions are evidence-backed, and no writer can bypass hidden data or conflict with another writer.

### T2. Establish shared rules and the additive contract

Owner: Primary, with backend contract review in Mode A. Dependencies: T1. Acceptance: AC1, AC2, AC6, AC7, AC9.

- Define quotation setup/detail DTOs, safe basket presentation data, command shape, stable-room identity rules, opaque scope/source preconditions, capabilities and error states.
- Define explicit maximum collection/string sizes and duplicate/unknown-ID validation. Ensure a bulk removal is one atomic command rather than over 100 line operations split into partial saves.
- Extract pure property/bedroom/room option rules if needed, leaving existing Sales exports and icon logic compatible. Preserve historical labels, unknown saved values and previous selections without allowing newly forged unsupported room/property values.
- Add shared-rule/contract fixtures for 1BHK, 2BHK, Studio, variable bedrooms, old room records missing modern metadata, two unequal rooms, hidden-only baskets and mixed visible/internal scope.
- Set the loss-of-response verification contract. Confirm only exact intended setup on the correct estimate/version; never infer success from equal totals. Do not automatically resend uncertain setup mutations.

Done when: backend and frontend can implement independently against the same safe contract. Share any discovered contract change immediately.

### T3. Implement Client-safe setup reads and atomic persistence

Owner: Backend implementer in Mode A; primary in Mode B. Dependencies: T2. May run with T4. Acceptance: AC2–AC7, AC9.

- Add the authorized setup read route, canonical route-operation registration and OpenAPI inventory. Derive eligible safe basket hierarchy from current Configuration using the existing visibility and availability rules, including not-yet-selected baskets.
- Extend quotation detail with saved setup and server-derived capabilities. Preserve internal memberships and filter any new identifiers/counts as rigorously as item rows.
- Add the strict standalone configure command. Re-read actor/project membership, editable lifecycle, estimate version, Configuration eligibility/source identity and removal preconditions inside the transaction.
- Validate new rooms/property/bedroom count and dimensions. Preserve unchanged room identity/metadata and existing selections, and handle retained legacy data explicitly.
- Apply setup and permitted related exclusions together. Reject protected or dependent removals without private names/counts. Keep Client rate/tax/margin/classification injection impossible.
- Reuse current pricing/rounding, scope-change detection, pending-review supersession, staff-confirmation invalidation, CAS/version fencing and audit. Meaningful setup-only saves must trigger the same review reset; exact no-ops must not.
- Update safe response, revision token and audit evidence so existing cross-role refresh sees the saved state. Keep original approval/customer amounts and downstream issued data immutable.
- Add focused API and replica-set tests for safe catalogue expansion, new basket/room saves, protected removal, no-op, source races, rollback, unauthorized identity and immutable approval history.

Done when: a Client can safely configure the shared working estimate through the scoped API, and no line, hidden membership or approval can be partially changed.

### T4. Build shared Sales-style Configure presentation

Owner: Frontend implementer in Mode A; primary in Mode B. Dependencies: T2. May run with T3. Acceptance: AC1, AC2, AC8, AC9.

- Extract/reuse the existing Configure composition: Project details, Property type, conditional Number of bedrooms, Rooms, dimensions, Main Baskets and Continue footer. Preserve Sales appearance and shared compact tokens.
- Use small presentation interfaces instead of fabricating a full staff catalogue object from Client data. If basket cards show counts, label/derive Client-visible counts from the safe response; do not send staff-only data just to satisfy a component prop type.
- Build the Client setup adapter with actual saved state, dirty tracking, capability checks, retained-room behavior and confirmation requirements. Do not reset a draft on background refetch.
- Expose save/continue/return events to the primary-owned parent; keep commercial persistence and navigation ownership explicit.
- Handle loading, empty options, errors, removed/incompatible current Configuration, protected removal and read-only states. Disabled controls remain understandable and keyboard-accessible.
- Add rendered tests for property/bedroom/room/basket interactions, retained IDs, validation, partial legacy metadata, dialog focus and responsive wrapping.

Done when: both roles can consume the same setup presentation without changing Sales authorization or relying on Client-specific duplicate styling.

### T5. Integrate screens, direct Main Line selection and save navigation

Owner: Primary. Dependencies: T3 and T4 for final integration; fixture-based preparation may run while those slices proceed. Acceptance: AC1–AC6, AC8, AC9.

- Wire Sales to the shared Configure presentation and Client to its safe adapter. The Client sees comparable Configure, builder, Summary and back/continue navigation; retain Client approval/export actions and omit staff-only publication/admin actions.
- Add Configure estimate / Save and configure behavior to the existing Client workspace state machine. Separate setup edits from pending line operations and preserve existing save/discard/stay and unknown-save guards.
- Save setup before opening item selection. Use newly persisted rooms and selected baskets from the server response, never optimistic fabricated financial values or inferred save success.
- Adapt the shared room/basket builder to display eligible unselected Main Lines beside saved rows with the same selection structure as Sales. Keep saved/excluded choices, stable room IDs and active-room isolation. Avoid an Add item modal as the sole selection route.
- Ensure pagination/search/collapse cannot hide pending selections or restrict removal semantics. Room/basket changes do not automatically include all lines or restore removed siblings.
- Extend query keys and existing collaboration invalidations for setup/catalogue, working quotation, staff estimate, requirements and reviews. Session/project changes reset scoped state; stale or denied responses retire actionable options without leaking cached data.
- Preserve the unified submitted-review mode, version/PDF binding and exact Sales/Designer confirmation gates after setup-only or setup-plus-item edits.
- Add integrated rendered tests for existing saved data, new basket/room selection, inline Main Line inclusion, save-return, failed/stale/unknown saves, cross-role refetch and approval readiness.

Done when: the complete Client experience matches the Sales screen structure and persists to the same estimate without weakening Client permissions.

### T6. Verify the complete workflow in a rendered browser

Owner: Primary. Dependencies: T3–T5 finished. Acceptance: AC1–AC9.

- Use synthetic transport/data and disposable test storage. Never seed or mutate the local demo/customer database for visual testing.
- Compare Client and Sales Configure/item-selection screens using the same project layout: property 1BHK/2BHK, Kitchen and Bedroom with unequal dimensions/quantities, a new eligible Main Basket, and direct/temporary Main Lines.
- Exercise select setup → continue/save → include Main Line → save → back to Configure → reopen. Check new room IDs, saved values, unrelated rooms and excluded siblings.
- Exercise property changes retaining earlier rooms, invalid variable-bedroom input, no selections, protected removal, wrong/stale source, denied refresh, save rejection, lost response and recovery.
- Exercise pre-design Client save → waiting for Sales → Sales-confirmed refetch → exact frozen Client approval. Confirm setup-only changes cannot reuse the earlier approval. Cover post-design/locked states and no-op behavior.
- Check 390/768/1440/1920px, 200% text, keyboard selection, focus return, readable dialogs, one primary item area, viewport/document scrolling, axe, runtime errors and unexpected network requests.
- Save evidence and repair confirmed defects before final review. Actual devices, soft keyboards and live delivery remain untested unless specifically exercised.

Done when: every visible selection/save path has rendered evidence and no introduced layout or interaction issue remains.

### T7. Independent integrity review and fixes

Owner: `integrity_reviewer` in Mode A; primary sequentially in Mode B. Dependencies: T6. Acceptance: AC2–AC10.

Review complete-server merge, hidden metadata/counts, protected dependencies, source/visibility races, transaction rollback, room identity, unknown-save reconciliation, no-op versions, pre/post confirmation, snapshot immutability, total/visible-subtotal boundaries, cache retirement and Sales/Designer/legacy compatibility. Inspect task-only changes against the captured dirty baseline. Resolve confirmed findings and recheck affected cases before final verification.

### T8. Final verification, cleanup and handoff

Owner: `verification_runner` in Mode A after all writers/fixes; primary in Mode B. Dependencies: T7. Acceptance: AC9, AC10.

Run focused suites, then backend/frontend typecheck, full tests and production builds. Verify changed Mongo paths with a disposable replica set. Compare any failures to the captured current-task baseline by exact test/error; do not reuse old task counts as proof. Run hygiene checks, remove temporary repository harness entries, stop only task-started servers, and report exact results, remaining baseline failures, unrun checks and ignored artifact paths. No deployment or repository publishing is authorized.

## Verification commands and evidence

Initial/final focused backend lane, from `backend/` (append new setup/contract files created during implementation):

```sh
npm test -- tests/quotation-edits.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts tests/client-quotation-projection.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts
```

Initial/final focused frontend lane, from `frontend/` (append new setup presentation/command tests):

```sh
npm test -- src/features/leads/estimateRoomOptions.test.ts src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/client/ClientQuotation.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/estimates/ProjectQuotationWorkspace.test.tsx src/features/estimates/EstimateBuilderShell.test.tsx src/features/estimates/EstimateNavigationGuard.test.tsx src/features/estimates/ClientEstimateDesignReview.test.tsx src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/estimateDrawingJourney.test.tsx src/api/authorization-contract.test.ts
```

Final backend and frontend lane, in each respective workspace:

```sh
npm run typecheck
npm test
npm run build
```

Repository hygiene:

```sh
git diff --check
git status --short
```

`backend/tests/helpers/mongo-replica-set.ts` uses `MongoMemoryReplSet` and returns an isolated URI. Read the helper/test target again before execution; never replace its URI with a local/customer database or weaken transaction semantics. If restricted-runtime execution blocks the test helper, report and resolve the exact execution limit without falling back to real data.

No repository lint script exists. OCR and native mobile checks are not needed unless an explicitly approved scope change touches those workspaces. Tests/builds and visual QA can create ignored temporary outputs; retain only useful external verification evidence and report those paths.

## Acceptance traceability

| Acceptance | Principal tasks and evidence |
| --- | --- |
| AC1: Sales-style setup controls | T2/T4/T5/T6; shared rules, rendered property/room controls and Client/Sales browser comparison. |
| AC2: Saved state and cross-role identity | T1/T3/T5/T6; stable-ID persistence, refetch, reload and room dimension/quantity comparisons. |
| AC3: New basket and Main Line selection | T3/T5/T6; safe catalogue expansion, direct builder selection and hidden-only negatives. |
| AC4: Protected removal and retained rooms | T1/T3/T5/T6/T7; dependency audit, replica-set before/after assertions and browser confirmations. |
| AC5: Staff confirmation and immutable approval | T3/T5/T6/T7; setup-only/no-op transitions, exact round binding and pre/post gate coverage. |
| AC6: Atomic version/source checks | T2/T3/T5/T7; transaction races, forged/duplicate commands and uncertain-response reconciliation. |
| AC7: Financial and hidden-data integrity | T1/T3/T7; asymmetric projects, internal memberships, paise/GST, tampering and immutable history. |
| AC8: Compact accessible parity | T4/T5/T6; four widths, 200% text, focus, dialogs, axe and no duplicate item area. |
| AC9: Existing role/workflow behavior | T1/T5/T7/T8; staff setup and legacy/design regression lanes, full checks with baseline comparison. |
| AC10: Hygiene and honest verification | T1/T7/T8; preserved initial diff, independent review, exact results and cleanup record. |

## Execution record

- Specification approval: received.
- Latest clarification: similar screen to Sales estimation, including screen structure and interaction sequence; incorporated without changing approved permissions or approval gates.
- Task-plan approval: received.
- Execution mode: A, parallel sub-agents.
- Current parent task: none. T1–T8 implementation, review, integrated verification and cleanup are complete. Baseline captured at `/private/tmp/lisno-client-estimate-setup-baseline/` including frontend/backend/shared source, test, configuration copies, initial diff and hashes.
- Current-task baseline: 210 focused frontend tests and 115 focused backend tests passed. Backend tests use an isolated MongoMemoryReplSet; restricted socket binding required approved sandbox escalation. Full frontend baseline was captured separately and compared by test name and diagnostic.
- Final contract: additive `QuotationDetail.setup`, scoped `GET quotation/setup` with no-store, one standalone `configure` PATCH operation under expectedVersion. Setup contains property/bedroom count, stable rooms, safe selected basket IDs, opaque sourceToken and capabilities. Catalogue contains safe basket/subbasket summaries, selectable/removable capabilities. Limit 200 rooms/baskets, labels 200 characters and positive nullable dimensions at most 1,000,000. Existing room type/label/ID preserved; new rooms validated against shared pure Sales rules. Configure is Client-only; staff keep their existing setup mutation.
- Retention decision: removing a room atomically deletes only eligible working line rows, matching staff room invariants. Basket deselection excludes eligible rows while retaining stable line IDs. All rows, including excluded rows, participate in protected-source checks. Open/included project requirements, recorded Design obligations, active/pinned drawings/revisions and unresolved uploads block structural removal with generic copy. Historical snapshots remain untouched. No migration or archived-room model is required.
- Shared pure room rules now live under backend domain (within its TypeScript root), exported through `shared/estimation/estimateRoomOptions.ts`; frontend compatibility imports preserve existing Sales consumers. Shared stateless setup controls are consumed by both Sales and the Client adapter; queries and mutations remain role-specific.
- Integrated focused verification: 247 frontend tests across 17 files and 143 backend tests across five files passed. Both final typechecks passed. Frontend production build passed. Full frontend: 6,193 passed / 94 failed across 406 files. Exact comparison found 91 matching baseline failures; one additional Vendor Basket failure reproduced identically in baseline/current focused reruns; two Admin initiation failures passed in both isolated reruns. The snapshot-only missing evaluation fixture suite passed 13 tests after restoring its unchanged fixture. Backend production build passed. Full backend: 7,103 passed / 38 failed / 24 skipped across 348 files (324 passed, 21 failed, three skipped). The new setup endpoint required updating the OpenAPI inventory test from 519 to 520 routes; this test expectation is fixed. Final targeted current/baseline runs of the 21 failing files each produced 729 passed / 19 failed, with identical failing test names. Seventeen first diagnostics match; the other two are duplicate cascades following the same five-second assigned-project timeout. All 18 other full-run failures passed on rerun, and the corrected OpenAPI test file passed all 71 tests. No new task-related failure remains. The full repository suites remain non-green due to these existing/intermittent failures; they were not silently ignored or repaired outside scope.
- Browser evidence: `/private/tmp/lisno-client-estimate-setup-browser/evidence.json` and screenshots. Synthetic transport, Headless Chromium 156, Vite development mode; checked 390/768/1440/1920px, 200% text and reduced motion. Setup screens and removal dialog produced zero axe violations and no horizontal overflow. Shared Sales Configure screen inspected. No unexpected errors in fresh final browser session. Live devices, soft keyboards, delivery and production performance were not tested.
- Browser workflow: selected a new Main Basket and Bedroom 2 with dimensions, continued through standalone setup save, selected a Main Line directly in that room with quantity five, saved and returned with stable room ID. Property changed 2BHK → 1BHK without losing rooms/dimensions. A lost committed setup response reconciled without another PATCH. Sales confirmation exposed the exact submitted version; the Client approval dialog and synthetic decision call used that version. Protected removal, full-scope confirmation count, Escape focus return, invalid bedroom input and denied refresh preserving changes were checked.
- Visual correction: compacted the setup support-chat launcher and reserved footer clearance so it cannot cover Continue; verified no overlap at all four widths. Adapter spacing uses the existing compact Client styles.
- Independent integrity review initially found two P2 frontend defects: synthetic inline candidates were mistaken for persisted rows by the Add item dialog, and candidate-read failure protection could be bypassed from Summary. Both fixed and regression-tested. Reviewer re-read fixes and reported no further confirmed defects. Backend authorization, complete-server merge, source fences, retention, approvals and no-op rules cleared.
- Temporary `frontend/qa/client-setup-parity.{html,tsx}` harness entries were copied to the external evidence directory and removed from the repository. Task-owned Vite server on 127.0.0.1:5186 was stopped. No dependencies, lockfiles, migrations, seeds, live database writes, commits, pushes, deployment or external messages.

## Final handoff evidence

- Exact commands: the focused lanes above plus `ClientQuotation.setup.test.tsx`, `ClientQuotationSetup.test.tsx`, `clientQuotationCandidates.test.ts`, `EstimateSetup.test.tsx`; `npm run typecheck`, full `npm test` (JSON/default reporters), and `npm run build` in both workspaces. Backend failing-file comparisons used `--maxWorkers=2` against both current code and immutable baseline. `git diff --check` passed. No lint command exists.
- Exact command/working-directory/exit-code ledger: `/private/tmp/lisno-client-estimate-setup-verification-commands.json`.
- Full results/comparisons: `/private/tmp/lisno-client-estimate-setup-final-{frontend,backend}-tests.json` and `-comparison.json`; companion focused, typecheck, full-suite, build and rerun logs share that prefix. Final status: `/private/tmp/lisno-client-estimate-setup-final-status.txt`.
- Source preservation: `/private/tmp/lisno-client-estimate-setup-preservation.json` and task-only diff `/private/tmp/lisno-client-estimate-setup-task.diff`. Earlier dirty work was retained; no pre-existing source path was removed. The additional OpenAPI inventory assertion change is in `backend/tests/api-docs.test.ts`.
- Ignored build outputs: `frontend/dist/`, `backend/dist/`, compiler caches and test-run caches. Browser evidence was copied to `/private/tmp/lisno-client-estimate-setup-browser/`; task screenshots were removed from the repository after copying. Eight task-owned tool snapshots/logs were archived to its `tool-snapshots/` directory during the follow-up, removing those untracked artifacts from the repository.
- Remaining limits: no actual-device/soft-keyboard QA, live customer database run, delivery/deployment test or production performance measurement. OCR was unchanged and not run. These checks used synthetic browser data and isolated Mongo replica sets.
- No new dependencies, lockfile changes, migrations, seeds, live data mutations, commits, pushes, deployment or external communication were performed.


## Follow-up: controls missing from the running Client screen

The user reported that the implemented choices were still not visible. This is a correction within the already approved parity scope and Mode A, not a new approval gate.

- Actual runtime evidence: the open Client project was already v3 and showed the current builder with unsaved edits. The local backend's public `/openapi.json` returned 519 operations with no `/projects/{projectId}/quotation/setup` route. The running process predated the implementation. The new frontend therefore silently fell back to the older basket-only view.
- Inspected the local launcher and verified its process ancestry. Gracefully stopped only the stale Lisno supervisor, then restarted the existing loopback backend/OCR/rules stack using `npm run dev`, whose local source entrypoint skips demo provisioning. No environment file, project estimate, workflow version, seed or migration was changed.
- Rechecked the actual running backend: public inventory now returns 520 operations and the setup route. The replacement local service is intentionally left running for the user.
- Actual browser verification used a separate saved-estimate tab, preserving the original tab's unsaved edits. Confirmed the Property type dropdown contains 1BHK/2BHK and other property choices; Rooms includes Kitchen and Bedroom; saved room dimensions and visible selectable Main Baskets load. The builder displays Main Line include checkboxes and sub-basket removal controls. No live Save, Remove or Approve mutation was performed.
- A bounded UI correction clarifies the setup entry as Configure estimate (or Save and configure estimate), with Property type, rooms and Main Baskets guidance. An older response without setup metadata now receives an explicit retry notice while existing item editing stays available.
- Follow-up baseline and runtime-only logs: `/private/tmp/lisno-client-setup-visibility-followup/`. The three assigned frontend files were copied before edits; all earlier changes remain the baseline.
- Follow-up verification: `npm test -- src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.setup.test.tsx src/features/client/ClientQuotationSetup.test.tsx` passed all 52 tests across three files, including rendered accessibility, save-before-configure, missing-metadata recovery, pending-edit preservation and locked-state coverage. `npm run typecheck`, `npm run build` and `git diff --check` passed. The build retains its existing large-chunk warning. Full suites were not repeated for this bounded follow-up; their earlier baseline comparison and limitations remain documented above.
- Final visible state: the separate saved-estimate tab is left open on Configure, showing property type, rooms, dimensions and Main Baskets. The original tab retains its unsaved item edits and shows Save and configure estimate. No changes were saved or discarded in either tab.

## Follow-up: item-row presentation parity

The next user screenshot demonstrates an unmet part of the already approved shared-estimation specification: Client and Sales share navigation, but Client still renders a separate fieldset form. Its flexible quantity/tier fields fill the row width; Sales uses a compact thumbnail/checkbox, item name, quantity stepper, price, amount, action menu and tier radio controls. Client also lacks the Sales compact-builder class. This correction fulfills the existing approved item-selection layout requirement; API scope and permissions do not change.

- Current parent task: none. Item-row parity implementation, independent integrity review, integrated verification and cleanup are complete.
- T9a (primary, completed): trace both renderers and capture dirty paths/target copies in `/private/tmp/lisno-client-item-parity-followup/`.
- T9b (frontend implementer): extract shared line layout, choice/thumbnail, tier options and action presentation from `ConfiguredEstimateBuilder.tsx` into `features/estimates/EstimateLineRow.tsx`, preserving Sales behavior. Ownership is limited to those files and the focused shared component test.
- T9c (primary, parallel with T9b using the agreed component contract): adapt Client rows to the shared presentation in `ClientQuotation.tsx`, `clientQuotation.css` and focused Client tests. Keep the scoped quotation transport, persisted/draft identities, source/version fences, allowed fields, saved financial labels and approval flow. Prices and amounts remain server-owned; no manual rate, classification or pricing-mode controls. Keep mandatory dimensions and permitted component choices. Existing add-dialog transport remains unchanged.
- T9d (integrity reviewer, after writers): inspect the integrated diff for permission, stale/draft state, financial presentation and shared-Sales regressions.
- T9e (verification runner, after review/fixes): focused Client/shared/Sales tests, typecheck/build, then browser comparison of Sales and Client rows using synthetic fixtures at 390/768/1440/1920px, 200% text, keyboard/tier/removal/dimension/component states and axe. Preserve the user's live unsaved work; no actual customer record writes. Record checks, limitations and artifact cleanup here.
- Acceptance: same compact Sales row hierarchy and controls for permitted Client fields; no stretched standalone Include item/Configured option form in the builder; safe quantity/tier/dimension/component/inclusion/removal payloads unchanged; locked/unavailable rows fail closed; saved totals are not recalculated by the Client UI; existing setup/Sales behavior remains intact.
- Implementation: Sales and Client now consume shared `EstimateLineLayout`, `EstimateLineChoice`, `EstimateLineTierOptions` and `EstimateLineActions`. `ClientQuotationLine.tsx` adapts safe quotation data without a staff draft or transport. Current response availability and saved amount remain separate from unsaved draft values/source snapshots. Client prices are read-only, saved amounts are explicit, and new item amounts wait for Save. The add dialog retains its existing separate compact form. Client compact styles use the existing Sales presentation with responsive control-group wrapping for enlarged text.
- Integrity review found and resolved two P2 issues before handoff: decimal stepper arithmetic could introduce invalid floating precision; dirty rows could display stale source availability and saved amounts. New regressions cover exact fractional save payloads, same-version Configuration source loss, changed-version current saved amounts, mandatory dimensions, allowed component choices and clearing components when the tier changes. Reviewer re-read the fixes and found no remaining confirmed issue.
- Final focused verification: 138 tests passed across 11 files, including Client quotation/setup/candidates, shared line/shell/area, design review, Sales builder/component pricing and collaboration. Frontend typecheck and build passed. The initial refresh regression needed `waitFor` for the query-driven DOM notification; the corrected entire lane passed. Exact commands/results are in `/private/tmp/lisno-client-item-parity-followup/final-*`. Full suites were not repeated for this presentation-only correction; their prior baseline failures remain documented above. Backend and OCR were unchanged.
- Rendered verification: synthetic real-app transport; inspected Sales and Client at 1440px, and Client at 390/768/1440/1920px. Final Client matrix reports no horizontal overflow, no runtime errors and zero axe violations at all four widths. Also checked 200% text with no overflow/axe violations, unavailable rows/tiers, mandatory dimensions, components, keyboard tier selection, menu Escape/focus return, keyboard removal and one explicit synthetic save returning version 2 and Waiting for Sales confirmation. No actual customer quotation writes occurred. Browser QA fixed inherited Save-button text contrast and enlarged-text amount wrapping. Initial harness favicon 404 and transient CSS syntax error were corrected; the final page load has no new console errors. Chrome screenshot connector attempts failed, so local Playwright CLI provided final screenshots.
- Remaining limits: synthetic browser transport, desktop Chromium and emulated viewport widths; no live-device/soft-keyboard, production delivery or performance test. No new dependencies, lockfile edits, schema changes, seeds, migrations, commits, pushes or deployment.
- Final build after visual CSS corrections: `cd frontend && npm run build` passed, including TypeScript compilation; `git diff --check` passed. Existing Vite large-chunk warning remains. Evidence: `final-build-after-visual.log` and `final-diff-check-after-visual.log` under the follow-up evidence directory.
- Cleanup: the temporary Vite server on 127.0.0.1:5186 and both task-owned Playwright browsers were stopped. Only this task's temporary harness, screenshots and 15 CLI snapshot/log artifacts were moved out of the repository to `/private/tmp/lisno-client-item-parity-followup/` (`browser/`, `tool-snapshots/`, harness files and `browser-matrix.json`). The user's browser tabs, unsaved work and normal application services were not manipulated during this correction.
