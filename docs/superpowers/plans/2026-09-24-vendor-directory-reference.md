# Vendor directory reference implementation plan

Date: 2026-09-24
Status: Specification and task plan approved; user selected Mode A. D0–D5 complete; implementation and scoped verification passed.
Approved specification: [Vendor directory screenshot reference](../specs/2026-09-24-vendor-directory-reference-design.md).

The approved specification and task plan governed Mode A execution below.

## Outcome and boundaries

Match the supplied screenshot in the existing Super Admin directory: warm image header, four overview tiles, aligned filters, vendor identity/type/status rows, working actions and numbered pagination. Average KPI and every vendor KPI remain **Not available**. Preserve the existing editor, both Execution checkboxes, shared Main/Sub Baskets, archive/CAS, role permissions and private-data boundaries.

The approved adaptations remain explicit: counts use real non-archived records; Under Review means pending physical-address verification and is separate from lifecycle; search is name/code; pages contain five rows; selection does not perform bulk mutations. No KPI engine, new workflow/status, schema migration, dependency, deployment, staging or commit is included.

## Fixed integration contract

- Add `executionType` to the safe `ProcurementVendorSummary`: canonical `("labor" | "material_labour")[] | null`, with the existing scalar-read normalization. Complete Supplier and incomplete profiles return null. Frontend rendering tolerates older responses omitting this additive field without inventing a subtype. Do not fetch private vendor details for table decoration.
- Add the optional boolean query `includeDirectoryOverview` to the existing `GET /admin/ai-estimator-knowledge/vendors` operation. Reject this vendor-specific query for other master kinds and reject invalid boolean strings. Omission/false keeps existing list behavior.
- When requested, add `directoryOverview: { totalVendors: number; activeVendors: number; underReviewVendors: number }` to the existing page response. Preserve `items` and `pagination` exactly. All counts are nonnegative integers; total excludes archived; active uses lifecycle `active`; under-review excludes archived and uses stored physical-address verification false/absent. No private values enter the overview.
- Compute overview counts in a backend aggregation independent of search, status, type, basket and pagination filters. A single aggregation supplies the three counts; do not count the visible page or transfer all profiles to the browser. Do not introduce stored counters or persistence changes.
- Fetch the overview separately through that same operation with `includeDirectoryOverview: true`, `limit: 1`, `offset: 0`, and no table filters. Use a stable query under the existing vendor master-list key prefix so existing vendor mutation invalidation refreshes it. Fetch table pages normally with `limit: 5`. This permits independent overview/list loading, failure and retry states without a new endpoint.
- Missing/failed overview data is unavailable, not zero. Display active/review percentages only from successful counts, with a zero-total guard. Header counts remain global even when viewing archived rows or filtered results.
- Preserve current operation authorization, actor guard, name/code search, expected versions, audit, basket relationships and minimal procurement picker DTOs. Update runtime validation, service signatures, envelope handling, frontend types and OpenAPI together.

## Dependency order

Keep one parent task in progress. Backend/frontend implementation may run concurrently only after the shared contract is released; review and final verification follow completed writers.

| Task | Deliverable | Depends on | Owner in Mode A | Acceptance |
| --- | --- | --- | --- | --- |
| D0 | Preserve current target baselines and release shared types/API/query shape. | Plan approval and execution choice | Primary | R2, R4, R6 |
| D1 | Implement directory data and visual/interaction slices; prepare header asset. | D0 | Backend writer, frontend writer, primary on independent files | R1–R5 |
| D2 | Integrate responses, mutation refresh, image and role-scoped rendering. | All D1 writers finished | Primary | R1–R5 |
| D3 | Independent integrity review and bounded fixes. | D2 | `integrity_reviewer`; primary/owning writer fixes | R2–R4 |
| D4 | Final scoped checks and rendered reference comparison. | D3 findings resolved | `verification_runner`; primary for browser | R1–R6 |
| D5 | Record results, inspect preservation diff and hand off. | D4 | Primary | R6 |

Mode B performs the same work inline without implementation subagents. No agents start before execution-mode selection.

## Ownership and deliverables

### D0: primary integration boundary

Capture `git status --short`, per-target diffs and full contents of untracked targets under `/tmp/lisno-vendor-directory-reference-qa/`. Earlier procurement and checkbox changes are the preservation baseline, not disposable work. Confirm the actual permission/route and safe summary paths; avoid repeating the previous task's broad test runs.

Primary owns the spec/plan, `backend/src/contracts/procurement-vendor.ts`, and frontend shared contracts/API/query integration in `features/ai-estimator-knowledge/{knowledgeTypes,knowledgeApi,knowledgeQueryKeys,knowledgeMutationSync}.ts`. Make only necessary additive changes. Keep the overview key inside existing invalidation boundaries; change mutation synchronization only if evidence shows a gap. Update narrowly affected shared API/cache tests if necessary. Freeze and send the contract above before writers begin.

### D1 backend slice

Owned paths:

- `backend/src/services/procurement-vendor-profile.ts`: safe summary execution selections only.
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`: vendor overview aggregation and list result typing only.
- `backend/src/routes/ai-estimator-knowledge-admin.ts`: vendor-only query validation and optional page-response field only.
- `backend/src/openapi/procurement-vendor.ts` and vendor-specific portions of `backend/src/openapi/ai-estimator-knowledge.ts` when needed.
- Bounded assertions in `backend/tests/{procurement-vendor-profile,procurement-vendor-profile.replica-set,ai-estimator-knowledge-reference.service,ai-estimator-knowledge-routes,api-docs}.test.ts`, respecting the actual replica filename `procurement-vendor-profile.replica-set.test.ts`.

Implement the fixed contract without altering unrelated master routes, writes or generic response shapes. Keep scalar compatibility, missing-profile vendors and inactive/archived basket presentation intact. Test an unequal fixture with more than five vendors: active/inactive/archived; verified/unverified/missing profile; both classifications and both Execution selections. Assert that filtered totals differ from global overview counts, that verification/lifecycle changes affect the next overview, and that no private fields leak.

No frontend, model, allocation, photo, shared authorization-registry or primary-owned contract edits. Return any required contract change to the primary before writing it.

### D1 frontend slice

Owned paths:

- `frontend/src/features/procurement/ProcurementManagementPage.tsx` and `ProcurementVendorDirectory.tsx`.
- New directory-only child components/styles under `frontend/src/features/procurement/` where they reduce component size; for example header/overview, row actions and pagination.
- Directory-scoped CSS in a dedicated stylesheet or scoped additions to `vendorProcurement.css`. Do not restyle the existing vendor-entry drawer or Sales Manager workspace.
- `frontend/src/features/procurement/VendorProcurement.test.tsx` and focused new directory interaction tests/fixtures as needed.

Build the screenshot composition using the frozen API contract and the primary-supplied decorative asset. Keep the current Sales Manager header/flow unchanged. Render the directory performance notice locally, or add an opt-in variant to `VendorKpiPlaceholder.tsx` only with primary coordination so its other consumers preserve their current behavior.

Deliver working 300ms search debounce plus Enter, cancellation on Reset/unmount, filter/page resets, five-row numbered pagination, out-of-range recovery, visible-row selection/indeterminate/select-count clearing, keyboard-operable overflow and Edit/View/Archive. Reuse existing drawer/dialog behavior, including archive reason/CAS and conditional permissions. Preserve both Execution labels and incomplete legacy state.

Use small local SVG pictograms, initials avatars, semantic table structure, truthful lifecycle/verification labels and **Not available** for every KPI surface. Support real loading/empty/error/retry states, stale refresh, long labels and permission loss. All new styles remain scoped. No new UI library, Lucide usage, global theme change or hover animation.

Every writer receives: “You are not alone in the codebase; preserve other edits, do not revert unrelated work, and stay within your assigned paths.”

### D1 primary asset slice

Use the image-generation skill/tool to produce a warm cabinet/vase/plant decorative header matching the reference composition. Generate only artwork, no UI text or fake vendor data. Inspect it, save an optimized local asset under a directory-specific `frontend/src/assets/` path and pass its import path to the frontend writer. Keep text and the olive message panel in semantic HTML. Use existing image tooling for format/size optimization without adding a dependency. Reserve image dimensions; provide a neutral fallback if it cannot load.

This asset task can run alongside backend/frontend source work because it owns distinct paths. Do not publish remote library content or send customer data to generation tools.

### D2–D3: integration and review

After writers finish, verify types/envelopes/keys agree, overview requests remain independent of table filters, and create/edit/verification/archive refresh both views. Check archive of the final row on a page, racing debounce/reset, stale basket requests, read-only View and access loss. Inspect the combined diff against D0 snapshots.

Independent review is bounded to changed summary/overview contracts, private-data exclusion, count definitions, compatibility, pagination/reset races, cache invalidation, permission visibility and role-scoped CSS. Fix confirmed findings before final verification. Do not broaden into historical allocation/photo changes without a newly demonstrated regression.

## D4: proportionate verification

| Area | Exact check | Coverage |
| --- | --- | --- |
| Backend focused | From `backend/`: `npm test -- tests/procurement-vendor-profile.test.ts tests/procurement-vendor-profile.replica-set.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts` | R2/R4: real Mongo count reconciliation, safe summaries, scalar compatibility, optional response/query behavior, authorization and other master compatibility. |
| Frontend focused | From `frontend/`: `npm test -- src/features/procurement src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts` | R2/R3/R4: exact request shape, global counts, missing/error handling, table interactions and cache refresh; existing editor and Sales Manager regression. |
| Compile/build | In each of `backend/` and `frontend/`: `npm run typecheck`; `npm run build` | R6: final shared contracts and production outputs. Run independent workspaces in parallel. |
| Rendered QA | Actual route/components with synthetic records at desktop 1440–1704px, tablet 768px, phone 390px | R1/R5: inspect screenshot side by side with user reference; header crop, proportions, typography, row density, all KPI placeholders, overflow, long content, empty/loading/error states. |
| Browser interaction | Keyboard/pointer search/reset, filters, selection, page changes, menu, add/edit/archive, save both Execution selections, recovery and accessibility scan | R3/R5: functional controls, focus restoration, no unexpected requests/console errors. Test isolated backend persistence separately above. |
| Hygiene | Root: `git diff --check`; `git status --short`; amendment diff against D0 snapshots | R6: scope preserved, no staged artifacts, no unrelated reversions. |

Run each relevant final lane once after integration; repeat only when a change/failure affects it. Full unrelated backend/frontend suites have already documented baseline failures and are outside this redesign's verification scope. No mobile/OCR or migration tests are required without a changed consumer. No lint script exists.

Use disposable local fixtures only. Keep screenshots, generated drafts, browser harness and logs under the task QA directory; only the final production decorative image belongs in source assets. Stop task-owned servers/browsers after QA. Never seed or mutate production to populate the reference layout.

## D5: handoff

Record D0–D5 status, exact checks/results, visual comparison evidence, unresolved limitations, generated asset path and changed-file boundaries here. Final response should briefly state what matches the reference, confirm KPI remains unavailable, identify verification and link this evidence. No commit, push, deployment or migration is authorized.

Plan-stage evidence: approved specification and current source/contracts were reviewed before implementation.

## Execution evidence

D0–D5 are complete. The primary integrated separate backend and frontend writers, independent integrity review, final verification and rendered QA.

- Captured 23 target-file baselines, target diffs and initial dirty status under `/tmp/lisno-vendor-directory-reference-qa/`. Preserved earlier procurement, checkbox and unrelated changes.
- Added safe Execution selections and an opt-in global directory overview to the existing vendor operation. Existing vendor-list cache invalidation refreshes the new overview, so the mutation-sync implementation required no change. No schema, authorization, lifecycle or allocation changes.
- Recreated the screenshot composition with local header artwork, four real-data overview tiles, filters, selection, detailed vendor rows, working actions and five-row numbered pagination. Average and row KPI remain **Not available**. Main/Sub Basket reuse and both Execution checkboxes remain supported.
- Independent review identified one legacy partial-profile mismatch between the row verification label and overview count. Safe summaries now read the stored boolean independently of full-profile validation. Partial-profile verification/privacy regression tests pass; the reviewer confirmed resolution and no remaining material finding in scope.
- Production artwork: [vendor-directory-header.webp](../../../frontend/src/assets/vendor-directory-header.webp), 1600×538, 68,194 bytes. Generated with the built-in image tool, then encoded with existing `cwebp`; no dependency added. [Prompt and tool/source details](/tmp/lisno-vendor-directory-reference-qa/header-artwork.md).

### Final automated checks

| Working directory | Command | Result |
| --- | --- | --- |
| `backend/` | `npm test -- tests/procurement-vendor-profile.test.ts tests/procurement-vendor-profile.replica-set.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts` | Passed: 181 tests across 5 files; includes Mongo replica-set coverage. |
| `frontend/` | `npm test -- src/features/procurement src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts` | Passed: 123 tests across 10 files. |
| `backend/` and `frontend/` | `npm run typecheck` | Both passed. |
| `backend/` and `frontend/` | `npm run build` | Both passed. Frontend emitted the application chunk-size warning above 500 kB. |
| Repository root | `git diff --check` | Passed. |
| Repository root | `git status --short`; `git diff --name-only --cached` | Existing shared work preserved; nothing staged. |

Total: **304 focused tests passed**. Exact command logs and machine-readable results are in the [verification report](/tmp/lisno-vendor-directory-reference-qa/final-verification.md).

### Rendered QA

Actual application routes/components ran in headed Chromium with synthetic transport at 1704×1180, 1440×1000, 768×1024 and 390×844. All four widths had zero axe violations and no document overflow. Final page checks found no render errors or unexpected API requests. Desktop rows measure 70–77px at 1704px; pagination targets are 44px with centered labels.

Passed interaction checks include search/Enter, debounce cancellation on Reset, stable global overview while filtering, Main/Sub Basket clearing, selection/indeterminate state and page clearing, numbered pagination, keyboard menu/focus restoration, read-only View, Add, both Execution choices saved together, archive reason/version handling, final-page correction and overview refresh. Loading, empty, no-results, independent overview/list errors and retries, long names, mobile keyboard selection and last-row menu visibility were checked.

Visual inspection covered the [final desktop directory](/tmp/lisno-vendor-directory-reference-qa/directory-content-desktop.png), [tablet](/tmp/lisno-vendor-directory-reference-qa/directory-tablet.png), [phone](/tmp/lisno-vendor-directory-reference-qa/directory-mobile.png) and mobile row. Detailed scenarios, console/tool-recovery context and limits are in [browser-qa.json](/tmp/lisno-vendor-directory-reference-qa/browser-qa.json). The task browser and Vite server were stopped; the harness and only this task's CLI artifacts were moved into the temporary QA directory.

### Scope, preservation and remaining limits

Affected source boundaries: vendor backend contract/summary/list service/route/OpenAPI; shared frontend API/types/query key; directory page/components/styles; focused tests; final header asset. [Exact changed text paths](/tmp/lisno-vendor-directory-reference-qa/changed-sources.txt) and [task diff against preserved baselines](/tmp/lisno-vendor-directory-reference-qa/redesign.diff) are available. No dependencies or lockfiles changed.

Concurrent side-panel work appeared in global styles, new `PanelSection` files, vendor profile fields and its own specification/plan. These paths were outside this redesign and were preserved without edits. Earlier mobile/chat/profile/procurement work was also preserved.

Verification used synthetic UI records and viewport emulation, with real Mongo persistence covered separately by replica-set tests. Physical devices and other browsers were not tested. Unrelated full suites, mobile/OCR and migration checks were not run because no affected consumer or migration is included. No lint script exists. The matching decorative artwork is generated, not the exact original photograph. The frontend bundle-size warning remains. No commit, push, deployment, seed, migration or production mutation was performed.

## Follow-up: icon-only row actions

User requested pencil/edit and delete/bin icons for Edit and Archive. Completed in the existing table/icon/styles files, preserving archive confirmation, permissions and callbacks. Read-only View uses an eye. All controls retain accessible names, tooltips and 44px targets. No data/API change.

Verification: 24 directory/procurement tests passed, frontend typecheck and diff check passed; rendered desktop/mobile checks passed for appearance, editor/archive-dialog opening, target size, overflow and accessibility. [Evidence and screenshots](/tmp/lisno-vendor-action-icons-qa/verification.md).

## Follow-up: action chips and table alignment

Completed user-requested grey Edit chip and red bin icon with red outline. The table now reserves compact widths for selection/status/KPI/actions and distributes the remaining space across vendor identity, type and baskets using its existing inline-size container. Headers and rows share column boundaries. Long vendor codes stay on one line with ellipsis when needed; full code remains in accessible text and title. Desktop sample row height is about 77px. Only `VendorDirectoryTable.tsx` and `vendorDirectory.css` changed. Existing archive behavior is preserved.

Verification: 24 focused directory/procurement tests, frontend typecheck and diff check passed. Rendered Chromium checks at 1920/1440/768/390px passed: styles, 44px action targets, editor/archive confirmation, no overflow, zero axe violations. Used full-length synthetic vendor codes, visually inspected desktop/mobile screenshots. Browser caught and resolved an initial percentage-calc table sizing issue; final container-relative widths were measured. [Automated report](/tmp/lisno-vendor-table-polish-qa/verification-report.md), [browser results](/tmp/lisno-vendor-table-polish-qa/browser-results.json), [desktop preview](/tmp/lisno-vendor-table-polish-qa/table-1920.png).

Task server/browser stopped and temporary harness/artifacts moved to QA directory. No dependency, backend, data, deployment or commit changes. Broad suites/builds were not repeated for this local presentation-only refinement; physical devices and other browsers were not tested.
