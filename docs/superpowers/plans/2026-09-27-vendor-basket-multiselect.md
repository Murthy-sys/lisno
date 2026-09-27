# Vendor basket multi-selection: task plan

Date: 2026-09-27  
Status: Approved; Mode A selected. T0–T7 completed, including the dropdown refinement and keyboard focus fix.  
Source of truth: [Vendor basket multi-selection specification](../specs/2026-09-27-vendor-basket-multiselect-design.md)

## Outcome and ownership

Implement the approved multi-selection behavior in the shared vendor draft and API shapes, transactional backend, web vendor editor/directory, and mobile vendor editor. Keep one parent task in progress. In Mode A, the primary agent first settles shared files, then gives the backend, web, and mobile slices to separate agents with no overlapping write paths. In Mode B, the primary agent performs the same tasks in order.

| Acceptance criteria | Delivery tasks |
| --- | --- |
| AC1, AC2: multi-selection, parent membership, save/reload | T1, T2, T3, T4 |
| AC3: inactive/unavailable references and catalog failure | T2, T3, T4 |
| AC4: inline creation, permissions, accessibility | T3, T4 |
| AC5: summaries, directory display/filter, legacy records | T1, T2, T3 |
| AC6: deletion counts and concurrent assignments | T2 |
| AC7: older clients, idempotency, versions, audit, unrelated profile data | T1, T2, T5 |
| Integrated checks and worktree hygiene | T0, T5, T6, T7 |

## Fixed cross-layer contract

- Canonical selection fields are `mainBasketIds: string[]` and `subBasketIds: string[]`, unique and sorted by stable ID on persistence/output. New clients send arrays. The shared draft hydrates arrays from legacy scalar-only details, validates at least one of each, and sends arrays without synthesizing scalar choices client-side.
- Backend detail and stored profile expose both arrays and deprecated scalar `mainBasketId`/`subBasketId`. Backend list/detail summary exposes `mainBaskets[]` and `subBaskets[]`, with each Sub Basket summary carrying `basketId` (nullable only when a legacy child is missing and its parent cannot be resolved); retain legacy `mainBasket`/`subBasket` for older clients. The backend chooses a valid primary scalar pair from a selected child and its parent. The list response still excludes private profile, bank, identity, and certificate data.
- Backend accepts legacy scalar-only input. If the submitted scalar pair equals the currently stored primary pair, preserve all existing array selections; if it changes, treat it as an intentional replacement with one pair. Array input is authoritative and must reject contradictory supplied scalars. Legacy stored scalar-only records read as singleton arrays without a backfill.
- At least one main and one sub are required. Every selected sub belongs to a selected main; a selected main need not have a sub. Adding a parent or child requires that its parent is active, while unchanged inactive/unavailable references may be retained. Removing a main removes only its children from the draft. All selected existing parents participate in deterministic transactional dependency coordination.
- Array ordering must not change idempotent-save meaning. Directory filters match membership in either arrays or legacy scalar fields. Both filters together require the selected sub to have the filtered main as its actual parent. Deletion impact counts each referencing vendor once for any selected member.
- No new route, permission, dependency, lockfile, live migration, seed, commit, push, or deployment is part of this plan.

## T0. Capture the implementation baseline

Owner: primary agent. Dependency: task-plan approval and execution-mode selection. Product writes: none.

1. Capture `git status --short` and per-target diffs again before editing. Current dirty paths belong to the prior temporary-item work and generated Expo files; vendor targets and `shared/knowledge` targets had no diff during planning. Preserve all pre-existing edits and do not reformat unrelated files.
2. Confirm the current web/mobile vendor forms, backend profile model/service, directory filter, basket deletion path, and focused test fixtures have not changed since the approved specification. Reconcile only routine implementation details; a material deviation returns to the affected approval gate.

Acceptance: written ownership boundaries, no overwritten dirty work, and no product edit before mode selection.

## T1. Establish shared client shape and draft behavior

Owner: primary agent in either mode. Dependency: T0. Owned paths: `shared/knowledge/knowledgeTypes.ts`, `shared/knowledge/vendorProfileDraft.ts` only.

1. Add canonical profile/summary array types and compatibility scalar fields. Keep the public summary separate from authorized private detail.
2. Make `VendorDraft` hold selected ID arrays. Hydrate from new arrays or legacy scalar fields, normalize selection order without mutating source data, validate minimums/duplicates, and serialize only canonical arrays for new clients. The draft helper may expose a small pure function for pruning child IDs by parent if both clients need it; it must not fetch catalog data.
3. Communicate exact exported types, field error keys (`mainBasketIds`, `subBasketIds`), and draft helper signatures to backend, web, and mobile owners before parallel edits. Freeze these paths during their work; later contract changes return to the primary agent.

Acceptance: AC1, AC2, AC5, AC7 type/draft foundation. Temporary type errors in dependent workspaces during concurrent edits are not final evidence.

## T2. Backend persistence, API, filters, and deletion safety

Owner in Mode A: one `backend_implementer`; owner in Mode B: primary agent. Dependency: T1. Owned paths: `backend/src/contracts/procurement-vendor.ts`, `backend/src/services/procurement-vendor-profile.ts`, `backend/src/services/procurement-vendor-save-command.ts`, `backend/src/services/ai-estimator-knowledge-reference.service.ts`, `backend/src/models/AiEstimatorKnowledgeVendor.ts`, `backend/src/openapi/procurement-vendor.ts`, and focused backend vendor/model/route/OpenAPI test fixtures and files. No shared, frontend, mobile, or unrelated backend files without primary-agent coordination.

1. Add bounded, unique array validation, deterministic normalization, legacy scalar-only input/read support, and strict parent membership/status checks. Preserve other profile fields, physical-verification metadata, staged certificate behavior, version/CAS checks, and old-client unrelated edits.
2. Persist arrays plus a valid scalar primary pair, summarize every selected parent/child with safe resolved names, and retain old summary properties. Handle incomplete legacy profiles without inventing a complete classification. Update relevant indexes.
3. Apply parent dependency writes in stable order, validate all newly assigned children in the transaction, and preserve retention of unchanged unavailable references. Extend directory membership filtering, deletion impact/guards, and audit field-change comparison to arrays and legacy records. Preserve one-vendor-one-count and concurrent save/delete serialization.
4. Canonicalize selection arrays before save-command fingerprinting so equal sets replay identically. Update OpenAPI and affected route/model fixtures. Do not add a new endpoint or change authorization operations.
5. Add focused validation and replica-set tests: two parents and multiple children, a selected parent with no child, malformed/duplicate/orphan arrays, inactive/retained references, scalar-only old client save, array/scalar contradiction, directory combined filter, deletion counts for active/inactive/archived vendors, concurrent assignment/deletion, idempotent equal-set retry, version conflict, and preservation of certificate/photo/verification fields.

Acceptance: AC1, AC2, AC3, AC5, AC6, AC7. Tests must exercise direct service writes and Mongo transactions, not only route mocks.

## T3. Web vendor form and directory

Owner in Mode A: one `frontend_implementer`; owner in Mode B: primary agent. Dependency: T1; can run beside T2 and T4. Owned paths: `frontend/src/features/procurement/VendorBasketFields.tsx`, `ProcurementVendorEditor.tsx`, `ProcurementVendorDirectory.tsx`, `vendorDirectoryColumns.tsx`, `vendorProcurement.css`, `vendorDirectory.css`, and focused `frontend/src/features/procurement/` tests/fixtures. No shared, backend, mobile, or unrelated frontend workspace files without primary-agent coordination.

1. Replace the single selects with collapsed, labeled, keyboard-operable dropdown-style multiple-choice controls. Open each to checkbox choices, group child choices by selected parent, show counts/all selected values when closed, preserve saved unavailable values, and keep loading/error/retry/disabled/dirty states. Support Escape/outside close and predictable focus. Removing a parent prunes only its selected children and announces the draft change.
2. Keep inline Main Basket creation; make Sub Basket creation target a specific selected parent. Newly created entities join existing selections. Retain the editor's frozen save command, uncertain retry, version conflict, photo/certificate steps, read-only behavior, and detail/list query synchronization.
3. Show every classification in the directory without leaking detail data. Keep its filter controls singular but match any selected member through the backend. Keep compact/narrow table behavior and visible full names.
4. Add meaningful rendered tests for two parents and multiple children across save/reopen/edit, validation, pruning, inline create, legacy/unavailable selections, catalog error/retry, filter behavior, keyboard/a11y, and archived/unauthorized states. Reconcile existing vendor fixtures to the additive API.

Acceptance: AC1 through AC5 and web parts of AC7.

## T4. Mobile vendor form

Owner in Mode A: one `frontend_implementer` assigned **only mobile paths**; owner in Mode B: primary agent. Dependency: T1; can run beside T2 and T3. Owned paths: `mobile/src/features/knowledge/KnowledgeVendorEditor.tsx`, its focused test `KnowledgeCatalogVendor.test.tsx`, and a narrowly scoped vendor-only helper/component under the same feature directory if needed. Do not alter generated `.expo` files, shared client files, web files, backend files, or general `knowledgeUi.tsx` without primary-agent coordination.

1. Use select-shaped dropdown field triggers that open the existing searchable multiple-choice sheet for Main Baskets and grouped Sub Baskets. Load all relevant parent catalogs with stable query keys and full pagination; show selected counts and every saved value, including unavailable ones. Avoid saving while required catalogs are unresolved; preserve selections across retry.
2. Prune only child choices of a removed parent, allow a Main Basket with no chosen child when another selected parent has a child, and target a specific selected parent for Sub Basket creation. Preserve touch and screen-reader states, phone scrolling, permission/read-only behavior, and the existing file/save recovery flow.
3. Extend native rendered tests for multi-selection save/reopen/edit, validation/pruning, inline create target, legacy/unavailable refs, catalog failure/retry, version conflict, and read-only state. Use synthetic catalog data only.

Acceptance: AC1 through AC4 and mobile parts of AC7.

## T5. Integrate and reconcile

Owner: primary agent. Dependencies: T2, T3, T4 finished. Owned paths: shared types/draft, plan record, and any explicitly reassigned integration paths after contacting their owner.

1. Inspect every changed path against the T0 baseline and resolve cross-layer mismatches in error keys, summary fields, legacy input, array ordering, filter semantics, and query refresh. Verify a new-client save response, old-client edit, and legacy stored read all roundtrip through the same backend interpretation.
2. Review privacy boundaries, parent-lock order, race outcomes, selection pruning, and multi-parent display. Resolve confirmed issues through the responsible owner or a clearly transferred file before final checks.
3. Record exact completed tasks and deviations in this plan after implementation. No production data action is permitted by plan approval.

Acceptance: AC1 through AC7 integrated, without accidental changes to prior temporary-item work.

## T6. Independent integrity review

Owner in Mode A: `integrity_reviewer` after T5 writers finish. Owner in Mode B: primary agent sequentially. Dependencies: T5.

Read-only review of all changed contracts, compatibility reads/writes, old mobile behavior, idempotency, version/audit semantics, directory leakage, and multi-parent assignment versus both deletion paths. Report concrete findings with file/line evidence; fix confirmed findings before verification.

## T7. Final verification and handoff

Owner in Mode A: `verification_runner` after T6 fixes. Owner in Mode B: primary agent sequentially. Dependencies: T6.

1. Run focused backend profile/model/route/OpenAPI tests, especially `backend/tests/procurement-vendor-profile.replica-set.test.ts`, then backend typecheck and build. Run relevant shared-contract regressions if backend API inventory changes.
2. Run focused web vendor draft/profile/directory tests, then frontend typecheck and build. Perform a rendered interaction/accessibility pass at desktop and narrow panel widths, including multi-select keyboard navigation, full-label display, inline creation, loading/error, and read-only states.
3. Run focused mobile vendor tests, mobile typecheck, and Android export. Check representative narrow-phone and standard-phone rendered/touch/accessibility states without modifying generated `.expo` files intentionally.
4. Run `git diff --check`, inspect `git status --short`, compare dirty paths to T0, and report exact commands/results, unrun checks, generated ignored outputs, and remaining risks. Broaden to full workspace suites only for a concrete remaining regression risk or required gate; distinguish pre-existing failures from new failures with evidence.

No live migration, production write, deployment, staging, commit, push, or customer communication is authorized by this task plan.

## Implementation record

- T0 confirmed the vendor and shared target paths were clean before writers started; the earlier temporary-item edits and generated Expo files remain outside this task.
- T1 established sorted ID arrays in the shared draft and summary types. T2 added backend array persistence and validation, legacy scalar compatibility, membership filters, summary resolution, audit changes, and transactional deletion guards. T3 and T4 added grouped multiple-choice controls to the web and mobile editors, parent-specific creation, unavailable-value retention, and focused UI regressions. The web directory now renders every saved classification.
- T5 reconciled client error keys, array ordering, summary fields, parent/child rules, and old-client behavior against the approved contract. The backend, web, and mobile writers completed their owned paths; no contract deviation or additional dependency was needed.
- T6 independent read-only integrity review found no confirmed defect. A mobile save/reopen/edit test was added for the reviewer's identified coverage gap; it passes with the focused native suite.
- During T7, the user clarified that the two multi-select controls should appear as dropdowns. This changes presentation only, so T3 and T4 were refined in their existing owned files before final verification resumed; the approved data/API contract and acceptance behavior remain intact.
- The refined T3/T4 controls now use compact select-like triggers on web and mobile, opening to independent checkbox choices. Web focused tests pass 90/90, mobile focused tests pass 17/17, and the web browser harness at 1280px and 390px shows no horizontal overflow or clipped open panel. A follow-up read-only review precedes integrated verification.
- The follow-up integrity review found an Enter/Space focus gap in the web dropdown. The web owner fixed it, added a focused regression, and reran the three-file web suite at 91/91 plus typecheck. Pointer activation and Escape focus restoration remain covered. Final integrated checks follow.

## Final integrated verification

| Check | Result |
| --- | --- |
| Backend `npm test -- tests/procurement-vendor-profile.test.ts tests/procurement-vendor-profile.replica-set.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/api-docs.test.ts` | 112/112 passed across four files outside the sandbox; its local HTTP/Mongo listeners were blocked by sandbox `EPERM` on the first attempt. |
| Frontend `npm test -- src/features/procurement/vendorProfileDraft.test.ts src/features/procurement/ProcurementVendorProfile.test.tsx src/features/procurement/VendorDirectory.test.tsx` | 91/91 passed across three files. |
| Mobile `npm test -- --runInBand src/features/knowledge/KnowledgeCatalogVendor.test.tsx` | 17/17 passed. |
| `npm run typecheck` in backend, frontend, and mobile | All passed. |
| `npm run build` in backend and frontend | Both passed. Frontend reported its existing large-chunk warning. |
| Mobile `npm run export:android` | Passed; ignored output in `mobile/dist/android`. Its generated `.expo/dev/logs/export.log` append was removed after the check. |
| Rendered web dropdown QA | At 1280px and 390px, closed fields remained compact and the open Sub Basket panel was visible without horizontal overflow or clipping; browser console had no errors or warnings. Screenshots in `/tmp/lisno-web-vendor-qa/`. |
| Repository hygiene | `git diff --check` passed. Vendor changes, the previously completed temporary-item change, and the two pre-existing dirty Expo files remain unstaged; no commit, push, deployment, migration, or production mutation was performed. |

The available emulator was running an app at its workspace-recovery screen, so a signed-in vendor flow could not be inspected there. Native rendered interaction/accessibility tests and Android export cover the mobile change; physical-device certification and full workspace test suites were not run.
- Before T6, the writers reported passing focused backend, web, and mobile tests and typechecks. Final integrated verification and exact command results belong to T7.
