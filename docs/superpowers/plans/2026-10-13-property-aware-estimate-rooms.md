# Property-aware estimate rooms task plan

## Authority and source of truth

The user approved the [property-aware estimate rooms specification](../specs/2026-10-13-property-aware-estimate-rooms-design.md) on 2026-10-13. Its requirements and acceptance criteria (AC1–AC10) are the source of truth. The specification's original awaiting-approval status is superseded by that approval, recorded here without changing the approved requirements.

Status: specification and task plan approved on 2026-10-13; the user selected Mode A (parallel sub-agents). T1–T6 are complete. Independent integrity review found no confirmed defects; final integrated tests, typechecks, builds, and rendered QA passed.

T1 reconfirmed the initial dirty paths below and empty per-target diffs for both writers. `/root/room_count_backend` owns T2 and `/root/room_picker_frontend` owns T3. The primary agent retains shared styles, documents, integration, and browser verification. No commits, deployment, data migration, seed, production mutation, or external communication are authorized.

Implementation-stage evidence: backend persistence/API tests passed 102 tests; mapping compatibility suites passed 141 tests; frontend affected suites passed 133 tests. Both writers passed their typechecks. These are writer-stage checks; final integrated checks/results will be recorded below. Browser preparation uses task-owned Vite port 4185, Playwright session `room-qa`, and synthetic API fixtures. The primary agent added only the reserved count/retained-room responsive styles and preserved the preceding CSS diff.

## Baseline and ownership constraints

At plan creation the worktree contains the preceding task's six modified frontend files and its two untracked documents, plus the current approved specification:

- `frontend/src/features/leads/ContactAndEstimateCard.tsx`
- `frontend/src/features/leads/LeadDashboard.test.tsx`
- `frontend/src/features/leads/LeadDetail.test.tsx`
- `frontend/src/features/leads/LeadDetail.tsx`
- `frontend/src/styles/estimator-dashboard.css`
- `frontend/src/test/accessibility.test.tsx`
- `docs/superpowers/{specs,plans}/2026-10-13-project-initiation-estimate-landing*`
- `docs/superpowers/specs/2026-10-13-property-aware-estimate-rooms-design.md`

The relevant existing shared stylesheet diff removes seven obsolete lead-card/follow-up rules; it must remain intact. The existing shared accessibility diff covers the unified lead landing and repairs stale initiation/focus expectations; preserve it. Prefer task-specific rendered accessibility checks in the owned room tests instead of modifying the shared accessibility file.

Recheck status and per-target diffs before writers start. New changes are not assumed to belong to this task. The primary agent owns documents, shared-style integration, and final reconciliation. Backend and frontend writers must stay within their assigned paths and must be told they are not alone in the codebase and must preserve others' edits.

## Fixed implementation contract

- Effective property type comes from the saved estimate or, for a new draft, its lead. Editing it does not update the lead.
- BHK counts: 1BHK = 1; 2BHK/2.5BHK = 2; 3BHK/3.5BHK = 3; 4BHK = 4. Studio has no separate bedroom slots and labels a newly selected living room Living / Sleeping Area.
- Villa/Duplex/Penthouse use an explicitly entered whole-number count from 1 to 50. Changes between these variable types preserve the entered count; switching to a fixed type clears it. Common Areas, Common Bathroom, and Other remain available.
- Generate independent Bedroom N, Bedroom N Balcony, and Bedroom N Bathroom options. Preserve `master`, `bedroom2`, `bedroom3`, and `bath_m` type identities. Use `bedroomN` for higher bedrooms, `balcony_bedroomN` for bedroom balconies, and `bath_bedroomN` for bathrooms from bedroom 2 onward. Never regenerate saved instance IDs or rename existing saved labels.
- Merge selected records with generated options. Selected types outside the current profile appear in Previously selected. Type/count changes do not remove any room or linked item. Only explicit deselection/removal invokes existing removal behavior.
- The API field is `bedroomCount?: number | null`, relevant to variable property types. Non-null values must be integer numbers from 1 to 50; no input coercion. The new frontend sends the number for variable types and null for fixed types. Backend input validation, persistence, and OpenAPI agree.
- Omission is backward compatible: preserve a saved count for an unchanged variable type; clear it when the property type changes without a supplied count. Supported fixed types persist null. Explicit null clears metadata. Opening an old draft performs no write and does not infer its count.
- New frontend setup validation blocks continuing to new items or saving/submitting an editable variable-type estimate without a valid count. Old builder contents remain viewable, with a clear Configure action when a count is needed; locked records remain viewable without a blocking setup step.
- Existing ownership, locked-state, transaction, version-conflict, cache, financial, and immutable-publication rules remain in force. No new endpoint, permission, snapshot field, or migration is needed.

## Dependency-ordered tasks

Keep one parent task in progress. In Mode A, T2 and T3 are child work within the same implementation phase; T4 begins after both are finished.

### T1. Reconfirm baseline and contracts

Owner: primary agent. Depends on: plan approval and execution-mode selection.

1. Capture current dirty paths and relevant target diffs, including the shared stylesheet. Preserve the preceding landing changes.
2. Reconfirm the estimate input/save/response path, model, and existing save-response hydration behavior. Check all callers of the room dropdown, property dropdown, dimensions accordion, and room sidebar before changing props.
3. Reconcile shared type names and the generator's deterministic keys against the contract above. Do not add a shared package or dependency for this bounded feature.
4. Confirm test/runtime tooling and use synthetic records for browser QA. Prepare any temporary output outside tracked product paths.

Acceptance: explicit non-overlapping ownership, no unexplained dirty target, and one contract for both writers. Prerequisite for AC1–AC10.

### T2. Persist and validate the optional bedroom count

Owner: backend slice. Depends on: T1. May run alongside T3 in Mode A.

Owned files:

- `backend/src/models/Estimate.ts`
- `backend/src/routes/estimates.ts`
- `backend/src/openapi.ts`
- `backend/tests/estimator-catalogue-estimate.replica-set.test.ts`
- `backend/tests/api-docs.test.ts`, only for focused schema assertions

Work:

1. Add the optional nullable model field with integer/range validation. Avoid retroactively requiring the field on old records.
2. Extend strict request validation and document number/null/omission semantics. Preserve acceptance of historical free-string property types.
3. Resolve the next count from the submitted type, supplied count, previous type, and saved count inside the existing transaction. Compute omission behavior before replacing the previous property type. Normalize supported property names consistently for classification, without rewriting their stored labels.
4. Ensure save and read responses carry the field through the existing serializer. Keep fixed-type counts null and missing legacy counts unspecified/null without inferring data from rooms.
5. Preserve all existing guards and financial calculations. Do not touch client-review snapshots, approval records, publication, PDF generation, route permissions, or repository interfaces.
6. Extend the existing replica-set harness for valid boundary counts, invalid types/fractions/ranges, explicit null, old requests without a count, same-type preservation, type-change clearing, fixed-type clearing, and count round trips on two different leads.
7. Verify locked saves and stale configured versions cannot write the count; assertions must inspect persisted metadata after rejected requests. Verify count-only setup changes do not rewrite room IDs/labels or change item totals.

Acceptance: AC6–AC8 and backend AC10 are covered, with real transactional persistence evidence. Backend support can accept the new frontend field without changing older callers.

#### T2 compatibility follow-up discovered during implementation

The independent room-consumer audit confirmed no downstream fixed `typeId` restrictions. It reproduced one direct compatibility defect: `autoMapDrawingTitle("Bedroom 1 Balcony Ceiling", context)` maps to Bedroom 1 when the balcony exists but only the bedroom has that included item. New nested room labels exercise the existing substring matcher; old Master Bedroom/Master Bathroom labels do not overlap.

To satisfy the approved room-lineage invariant and AC5, extend the same backend owner's paths to `backend/src/domain/estimate-design-mapping.ts` and `backend/tests/estimate-design-mapping.test.ts`. Suppress a shorter room-name occurrence contained in a longer matched room-name occurrence, retaining separate room mentions and equal-name ambiguity. Add regressions for balcony/bathroom titles, missing accessory items, shared items, separate mentions, and duplicate labels. This changes future title matching only; no stored mapping, approval/workflow state, immutable artifact, migration, or service contract is changed. This is a bounded compatibility correction, not a change to the approved product requirements.

### T3. Implement the property-aware picker and workspace state

Owner: frontend slice. Depends on: T1 and the fixed contract. May run alongside T2 in Mode A.

Owned files:

- New `frontend/src/features/leads/estimateRoomOptions.ts` and `estimateRoomOptions.test.ts`
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/leadsApi.ts`
- `frontend/src/features/leads/RoomsMultiSelectDropdown.tsx`
- `frontend/src/features/leads/PropertyTypeDropdown.tsx`
- `frontend/src/features/leads/RoomDimensionsAccordion.tsx`
- `frontend/src/features/leads/RoomSidebar.tsx` and `EstimateBuilder.tsx`, only if their existing presentation interface needs adaptation
- `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`
- `frontend/src/features/leads/RoomControls.test.tsx`
- `frontend/src/features/leads/LeadEstimateRecommendations.test.tsx` and `ConfiguredEstimateBuilder.test.tsx`, only for expectations or regressions directly affected by the new room identities/presentation

Do not edit the shared stylesheet or shared accessibility test; send precise required selectors/markup needs to the primary agent. Do not modify the preceding lead-landing files.

Work:

1. Extract the static catalogue into a small deterministic generator with pure profile/count validation and stable type identities. Keep common choices, Other, default-area compatibility, and independent accessories. Do not invent measured dimensions. Generate kind-aware presentation for new rooms using established assets rather than an unrelated fallback icon.
2. Add the API field and local count input state. Hydrate only from the saved estimate, reset correctly across lead IDs, and include the appropriate number/null in draft input. Fixed/variable type transitions follow the contract.
3. Add the accessible count field, helper text, invalid-input message, and validation gates for Continue, Save, and Submit. Preserve reading old builder items. Provide a clearly labelled Configure action when saved variable-type items need a count before further saving.
4. Merge generated options with saved/selected rooms while preserving every record and saved label. Render a conditional Previously selected group and explanation. Use instance IDs for configured items and keep existing legacy-label associations intact. Eliminate static-catalogue non-null assumptions for unknown selected types.
5. Preserve optional selection independence. Make Select all, search, clear/removal, selection counts/chips, and focus/highlight behavior work with a changing options list. Keep existing grouped ordering and accessible option names.
6. Add disabled/read-only props as needed to the current controls. Disable mutation controls during locked states and pending save/submission; keep disclosures and read-only navigation usable. Add matching handler guards so disabled presentation is not the sole protection against local mutation.
7. Preserve draft error/retry behavior and the existing handling of save responses without overwriting newer local data. A type/count change by itself must not filter rooms, reset lines, or change totals.
8. Extend unit tests for every profile and boundaries. Extend `RoomControls.test.tsx` for dynamic grouped options, search, Select all, no-results, retained selections, disabled controls, keyboard focus, and accessible labels/errors. Reuse existing test helpers and add axe checks where relevant.
9. Extend workspace tests for: selecting an accessory without its bedroom; count reduction with legacy/configured items retained; alias and unknown-room compatibility; Studio; five bedrooms with only common/accessory rooms selected; save/reload; missing old metadata; fixed/variable transitions; two-lead navigation; failed/retried saves; locked and in-flight controls. Update old tests only where newly added rooms intentionally use numbered labels, leaving historical-label fixtures meaningful.

Acceptance: AC1–AC6, AC8–AC9 automated behavior, and frontend AC10 hold without data loss or duplicate room aliases.

### T4. Integrate styles and review the combined implementation

Owner: primary agent, followed by `integrity_reviewer` in Mode A; equivalent inline review in Mode B. Depends on: T2 and T3 finished.

Primary-owned integration files:

- `frontend/src/styles/estimator-dashboard.css`, limited to count-field layout, validation/retained-selection presentation, and necessary responsive corrections
- This plan and task evidence documents

Work:

1. Add only necessary scoped styles for the optional third field. Retain the existing two-field layout for fixed types and readable wrapping for variable types. Preserve prior stylesheet deletions and established typography, surfaces, borders, and focus states.
2. Inspect all diffs and reconcile the number/null/omission contract, deterministic keys, hydration, selected-option merging, disabled states, and caller compatibility.
3. Review field persistence under rejected saves and stale versions; check that metadata stays local to the correct lead/estimate. Inspect both legacy label associations and configured room IDs for accidental deletion, renaming, duplication, or repricing.
4. Confirm no changes to published artifacts, permission rules, dependencies, lockfiles, or unrelated work. Review unknown historical rooms/types and older callers explicitly.
5. In Mode A, run an independent integrity review after all writers finish. Resolve confirmed findings before final verification, assigning fixes to one owner at a time. Findings requiring a material spec change return to the required gate rather than silently changing the product contract.

Acceptance: AC1–AC8 have no unresolved material integrity finding, and the UI is ready for final rendered checks.

### T5. Verify the integrated worktree and rendered behavior

Owner: `verification_runner` in Mode A after review/fixes; primary agent in Mode B. Depends on: T4.

Run focused checks first. From `backend/`:

```sh
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/api-docs.test.ts tests/estimate-client-presentation.test.ts
npm test -- tests/estimate-design-mapping.test.ts tests/estimate-design-extraction.test.ts
npm run typecheck
npm run build
```

From `frontend/`:

```sh
npm test -- src/features/leads/estimateRoomOptions.test.ts src/features/leads/RoomControls.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
npm test -- src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadDetail.test.tsx src/features/leads/LeadDashboard.test.tsx src/test/accessibility.test.tsx
npm run typecheck
npm run build
```

Record the exact executed commands in final evidence. Broaden to additional tests or full suites only when shared-contract impact, failures, or unresolved concerns justify it. There is no lint script. OCR checks are outside scope.

From the repository root:

```sh
git diff --check
git status --short
```

Use a task-owned local browser session and synthetic API fixtures, plus the backend replica-set checks above for persistence. Browser coverage:

- Desktop 1440px, tablet 768px, mobile 390px and narrow 320px. Inspect actual screenshots for the two-field and three-field layouts, validation, selected chips, and long room labels.
- Exercise 1BHK to 4BHK changes; representative fractional BHK; Villa, Duplex, and Penthouse with missing/invalid/valid counts; and Studio. Verify common rooms and Other remain available.
- Set count to five, select only common/accessory rooms, save, reload, and confirm count five. Reduce a count after rooms have dimensions/items; verify retained rooms and totals. Include an old Master Bedroom and an unknown custom room.
- Inspect a maximum-count list for usable scrolling/search, bounded menu height, and no horizontal overflow. Exercise keyboard opening, search, selection, Escape/focus return, and selection changes while filtering.
- Exercise locked/pending controls, failed save/retry, and switching between two distinct leads. Check accessible control names, associated validation messages, and axe results for representative states.
- Check console errors and unexpected network failures; distinguish intentionally simulated errors from unexpected ones. Do not capture real client data.

Store ignored temporary logs/screenshots/reports under `/tmp/lisno-property-aware-estimate-rooms-qa/`. Record actual checks and conditions, including whether browser API responses were synthetic. Close task-created browser/server sessions without stopping user-owned services.

Acceptance: all AC1–AC10 have evidence on the integrated worktree. Diagnose and fix failures, then rerun the affected checks; do not count transient concurrent-writer results as final verification.

### T6. Record completion and hand off

Owner: primary agent. Depends on: T5.

1. Reconcile the final diff with the initial dirty baseline and confirm all assigned work is finished.
2. Update this plan with actual ownership, checks/results, acceptance coverage, temporary artifact paths, unrun checks, and limitations.
3. Report the resulting room behavior, metadata compatibility, key files, dependencies, and verification concisely. State any unresolved issue without claiming the task complete.
4. Record that no migration, seed, commit, push, deployment, production mutation, or external communication occurred. Backend support must precede the new frontend in any future authorized release because the old input validator rejects unknown fields.

## Execution modes and safe parallelism

The required execution-choice gate was completed before implementation; the user selected Mode A.

- **Mode A:** primary performs T1, then assigns T2 to `backend_implementer` and T3 to `frontend_implementer`. They may write in parallel because their paths do not overlap and the contract is settled. Primary integrates the reserved shared stylesheet in T4 after writers finish. `integrity_reviewer` follows integration; `verification_runner` follows review and fixes. Primary owns final reconciliation and T6.
- **Mode B:** primary performs T1–T6 sequentially inline, including equivalent integrity review and verification, without implementation subagents.

No writer may widen ownership without informing the primary agent. Reuse existing test harnesses and components; no dependency additions or remote library writes are planned.

## Final implementation and verification evidence

Completed on 2026-10-13 in approved Mode A. `/root/room_count_backend` delivered persistence and the bounded drawing-title compatibility correction. `/root/room_picker_frontend` delivered the picker, workspace state, and regressions. `/root/room_identity_audit` traced downstream consumers; `/root/room_integrity_review` reported no confirmed defects. `/root/room_final_verification` ran the final integrated automated checks after all source changes. The primary agent owned scoped stylesheet integration, the Clear all contrast correction, browser QA, and final reconciliation.

### Resulting behavior and affected areas

- `estimateRoomOptions.ts` derives BHK bedrooms, supplies independent balcony/bathroom slots, handles Studio and explicit Villa/Duplex/Penthouse counts, and merges retained selections without renaming saved rooms.
- `LeadEstimateWorkspace.tsx` hydrates/saves count metadata, validates configuration, preserves room/item identities through profile changes, provides access to old saved items, and disables setup mutations during locked/pending states. `leadsApi.ts` carries the optional API field.
- `RoomsMultiSelectDropdown.tsx`, `PropertyTypeDropdown.tsx`, and `RoomDimensionsAccordion.tsx` support disabled states and accessible dynamic options. Search/keyboard highlighting tracks stable option identity; no-results remains accessible. Clear all uses sufficient text contrast.
- `estimator-dashboard.css` adds only scoped count-field, helper/error, retained-selection, and responsive rules. The preceding lead-landing stylesheet deletions remain intact.
- Backend `Estimate.ts`, `routes/estimates.ts`, and `openapi.ts` persist and validate the additive optional count while preserving transactional guards, legacy omission behavior, and fixed-type clearing.
- `estimate-design-mapping.ts` resolves longer explicit room-name occurrences before contained prefixes, preventing a balcony/bathroom title from mapping to its parent bedroom. This affects future automatic matching only; no saved mappings or immutable records were rewritten.
- Tests cover new option rules, input validation, API/model persistence, existing room/item preservation, rendering, count round trips, locks/races, and title specificity. Recommendation tests were updated only for newly selected Bedroom 1 labels; historical Master Bedroom fixtures remain.

### Automated checks on the integrated worktree

| Directory | Exact command | Result |
| --- | --- | --- |
| `backend/` | `npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/api-docs.test.ts tests/estimate-client-presentation.test.ts` | Passed: 125 tests in 3 files, including 42 replica-set tests |
| `backend/` | `npm test -- tests/estimate-design-mapping.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-upload.test.ts tests/estimate-design-mapping-migration.test.ts` | Passed: 141 tests in 4 files |
| `frontend/` | `npm test -- src/features/leads/estimateRoomOptions.test.ts src/features/leads/RoomControls.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx` | Passed: 78 tests in 3 files |
| `frontend/` | `npm test -- src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadDetail.test.tsx src/features/leads/LeadDashboard.test.tsx src/test/accessibility.test.tsx` | Passed: 120 tests in 5 files |
| `backend/` | `npm run typecheck` | Passed |
| `frontend/` | `npm run typecheck` | Passed |
| `backend/` | `npm run build` | Passed |
| `frontend/` | `npm run build` | Passed; existing Vite warning for chunks exceeding 500 kB |
| Repository root | `git diff --check` | Passed |
| Repository root | `git status --short` | Only intended task changes and preserved preceding landing work |

Total: **464 final regression tests passed**. The initial sandboxed backend focused run could not bind HTTP/Mongo ports (`EPERM listen`); the appropriately escalated rerun passed all 125 tests. Logs retain both attempts so the environment failure is distinguishable from the successful final result.

Logs: `/tmp/lisno-property-aware-estimate-rooms-qa/final-*.log`. Builds generated ignored `backend/dist/` and `frontend/dist/` outputs; neither is a deliverable or staged artifact.

### Browser and acceptance-criterion evidence

Conditions: Chromium 155 desktop engine, local Vite server, synthetic browser API fixtures, no CPU/network throttling. Persistence correctness was separately verified through real Mongo replica-set tests; the browser checks were not a live-backend end-to-end run.

- **AC1–AC3:** All ten property types exercised. Option totals were 10 for 1BHK, 13 for 2/2.5BHK, 16 for 3/3.5BHK, 19 for 4BHK, 7 for Studio, and 22 for each variable type at five bedrooms. Every bedroom has independent balcony/bathroom entries; common choices and Other remain. Variable-type invalid inputs covered blank, zero, negative, fractional, and 51.
- **AC4:** At the valid maximum of 50 bedrooms, the picker had 157 options in a 256px scrollable list. Search narrowed Bedroom 50 to three choices; filtered Select all selected only those choices; no-results, Escape/focus restoration, and reduction to one bedroom retained the three selected entries.
- **AC5–AC6:** Saved a five-bedroom Villa with only Living & Dining, Bedroom 5 Balcony, and Bedroom 5 Bathroom selected; reload retained count five and all three rooms without selecting Bedroom 5 itself. Reducing a populated saved estimate preserved Master Bedroom, Bedroom 3, an unknown custom room, their instance IDs/dimensions/line IDs, and its ₹708 synthetic total.
- **AC7:** API/model boundaries and transactional round trips were covered by the final backend checks, including separate leads, explicit null, omission, type changes, stale versions, and locked saves. The mapping compatibility tests reproduce and prevent accessory-to-parent misassignment.
- **AC8:** A delayed save disabled property, count, room selection, and dimensions. A simulated failed save retained the local count; retry saved it. A locked Penthouse missing count remained viewable without a blocking setup requirement. Moving between separate leads did not carry setup state across records.
- **AC9:** Rendered desktop 1440px, tablet 768px, mobile 390px, and narrow 320px layouts had no horizontal document overflow or clipped horizontal controls. Inspected fixed/variable layouts, invalid input, a maximum-count menu, and retained custom-room search. Real-browser axe checks returned zero violations for invalid, open-menu, and retained-room states after correcting the Clear all text contrast. Screenshots were visually inspected. Final console had zero errors/warnings; fixtures reported no unexpected requests.
- **AC10:** Final automated commands above and repository hygiene passed after integration. No production sources changed after the final verification runner started.

Browser reports: `/tmp/lisno-property-aware-estimate-rooms-qa/{profiles-report,flows-report,matrix-report,console-report}.txt`. Screenshots include `desktop.png`, `tablet.png`, `mobile.png`, `narrow.png`, `fixed-desktop.png`, `fixed-narrow.png`, `invalid-narrow.png`, `max-count-mobile.png`, `max-count-desktop.png`, and `retained-narrow.png` in the same directory. Only this task's seven `.playwright-cli` artifacts were moved into its `cli/` subdirectory; pre-existing artifacts were preserved. Browser session `room-qa` was closed and task-owned Vite port 4185 was stopped; user-owned services were untouched.

### Verification limits and external actions

Full repository suites and OCR tests were not run because focused and affected-flow coverage passed without unresolved concerns. No lint script exists. Browser checks used synthetic API responses and emulated viewport widths, not a live backend, physical device, or performance benchmark. The frontend build's existing large-chunk warning remains; bundle splitting is outside this change.

No dependencies or lockfiles changed. No migration, backfill, seed, commit, push, deployment, production mutation, or external communication occurred. No stored room or drawing data was rewritten. Future deployment must coordinate backend support with the frontend's new field because the old input schema is strict. No unresolved defect was found in the implemented requirements.
