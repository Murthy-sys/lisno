# Procurement basket proposal refinements: task plan

Date: 2026-10-12
Status: Implementation, integrity review and feature verification complete. Full-suite baseline failures and unperformed database rollout are documented below.

Source of truth: [approved specification](../specs/2026-10-12-procurement-basket-proposal-refinements-design.md).

## Delivery and preservation contract

Deliver the simplified proposal forms, Quality Parameter tab, Configuration styling, 70% desktop panels, existing-parent Sub-Basket proposals and durable Super Admin submission notifications described by AC1–AC9 in the approved specification.

Ordinary Configuration screens, defaults, business values, existing children and shared quality remain unchanged. Procurement receives no direct Configuration write permission. Approvals only create the explicitly reviewed new records. Existing internal dependency counters may advance through the established transaction-coordination mechanism; they must not be confused with editing the parent's business configuration.

Preserve all previous uncommitted work. No dependencies or lockfile changes are expected. Do not seed, synchronize databases, deploy, stage, commit, push, apply a live migration, send external notifications or mutate the configured local/production database. Tests use disposable databases and synthetic identities. Preparing and testing an index migration on disposable fixtures does not authorize applying it elsewhere.

Only one parent task is in progress at a time. Parallel tasks below are bounded slices of that parent, after the user selects execution mode A. In mode B, execute all slices inline in dependency order.

## Evidence and settled engineering decisions

### Proposal target and compatibility

Use the existing proposal/request collections and lifecycle. Extend the create contract with an optional target discriminator:

```ts
type ProposalTarget =
  | { kind: "new_main_basket" }
  | { kind: "new_sub_basket"; basketId: string };
```

- Omitted target continues to mean new Main Basket. Old schema-version-1 proposals and legacy requests remain readable; do not require a document rewrite.
- `name` identifies the proposed entity: new Main Basket or new Sub-Basket. Public summaries explicitly return the target type and parent context rather than asking consumers to infer the meaning of `name`.
- Persist the target type and nullable `targetParentBasketId` immutably. Keep request `basketId` as its existing fulfilled result field; do not repurpose that field as the pending parent.
- A Sub-Basket proposal contains exactly one proposed Sub-Basket and zero or more new Main Lines. New Main Basket proposals retain their current minimum hierarchy requirements. Reject parent metadata/quality writes and extra Sub-Basket insertion/removal that would invalidate the one-Sub-Basket target on the backend, not only in the UI.
- Existing parent identity is stable context. If the existing adapter needs a basket-shaped context object, mark it read-only and never materialize it as a new or updated live basket. Any captured context in the submitted snapshot stays immutable. Separately derived current parent names/status/quality must be labeled current inherited context and excluded from the submitted-content digest.
- Use the existing section, pricing, mode, recommendation and activation validation for included Main Lines. Preserve remapping of proposal-owned IDs on revision, while never remapping the live parent ID.
- Add a proposal-scoped inherited-quality read route for both existing scopes, guarded by the existing proposal ownership/read rules. Return the established quality DTO and current quality revision identity. Reject quality mutations for an existing-parent target. This avoids widening Procurement's general Configuration permissions.

### Pending uniqueness and index transition

The current request collection has two unique pending indexes: `(vendorKey, proposedNameNormalized)` and `(vendorNameNormalized, proposedNameNormalized)`. They would incorrectly reject the same Sub-Basket name under different parents.

Replace their definitions with named pending unique indexes on:

1. `(vendorKey, targetParentBasketId, proposedNameNormalized)`.
2. `(vendorNameNormalized, targetParentBasketId, proposedNameNormalized)`.

Main Basket requests use null for the target parent; legacy documents missing the field retain the same root scope. Sub-Basket requests use the immutable existing parent ID. Apply this same scope to duplicate preflight queries, error reconciliation and all writers. Never store IDs inside display-name fields.

Prepare `backend/src/migrations/vendor-basket-request-target-index.ts`, following the native-driver, explicit-database, dry-run-by-default pattern in `project-purchase-order-vendor-index.ts`. It must:

- Inspect exact key/options/index-name metadata and pending duplicates without document writes, model initialization, `syncIndexes` or inferred database selection.
- Report unknown/conflicting definitions and refuse writes when they exist. Prove missing and explicit-null parent fields share the legacy root uniqueness in replica-set tests.
- Require verified backup, captured index metadata and a final dry run before an explicitly requested apply. Build and verify both replacement unique indexes before dropping only the two recognized old indexes. Be retry-safe after any partial index transition.
- Require a coordinated writer pause during an authorized transition; old application writers must not continue using the old unscoped duplicate queries after Sub-Basket submissions become available.
- Refuse rollback if pending requests no longer satisfy the old broader uniqueness. Never delete, rename or rewrite requests to force rollback. Otherwise restore both old indexes before removing the replacements.
- Keep this transition out of application startup. `initializeApplicationIndexes` may initialize additive model indexes but must never automatically drop the legacy indexes.
- Check index readiness for the new existing-parent request path, returning a recoverable setup-unavailable error if old conflicting indexes or missing required protections remain. Keep the original Main Basket flow operational. Document the transition as a prerequisite for enabling Sub-Basket requests on an existing database.

No live transition is part of this implementation authorization. Final handoff must distinguish verified code from any unperformed local/production rollout prerequisite.

### Publication and parent protection

- Branch publication by explicit target, retaining the old new-Main-Basket branch unchanged in behavior.
- For an existing-parent target, coordinate against the parent in the same transaction using the established basket dependency-write mechanism, require active status, and enforce same-parent child-name uniqueness. Do not silently reuse an existing child with a matching name.
- Reuse `createKnowledgeHierarchyInSession` or a minimal shared helper with unchanged defaults. It already supports a Sub-Basket without a Main Line and serializes child creation with parent changes. Preserve proposal resource-to-published-ID mappings; do not assume its generated child ID equals a saved proposal ID.
- Use automatic order allocation for newly published children. Existing hidden draft order/description values survive metadata edits; ordinary Configuration ordering behavior is unchanged.
- New child insertion, sections/prices, activation, final decision and audit must commit together. Parent business fields, prior child records, quality revision references and prior prices remain unchanged. Test both concurrent parent lifecycle changes and competing child creation.

### Notification and navigation contract

Add a basket-specific notification collection and service, integrated into the existing bell alongside chat and Execution. Do not change chat membership, fabricate a project ID, or extend email delivery.

- Persist one notification per `(recipientId, requestId)` with immutable request/proposal/parent identity, target kind, safe display context, requester identity, submission time and nullable `readAt`.
- Shared helper contract: `appendSubmittedBasketNotification(input, session)`. It resolves and coordinates the sole active Super Admin and inserts the record in the caller's request-submission transaction. Both proposal submit and legacy create call it only on first successful submission. No optional no-op fallback in production service wiring.
- Read/list endpoints require current sole-Super-Admin identity, the existing Configuration review-read permission and recipient ownership. Mark-read is idempotent and changes only that notification. Return private/no-store responses.
- Planned routes: `GET /admin/ai-estimator-knowledge/basket-request-notifications`, `PUT /admin/ai-estimator-knowledge/basket-request-notifications/:notificationId/read`, and `GET /admin/ai-estimator-knowledge/basket-requests/:requestId` for exact review resolution. Add the proposal inherited-quality routes under the existing Procurement/admin proposal bases. Register each route and its schemas/operation mappings in the canonical inventory and OpenAPI.
- List DTO follows existing bounded pagination with authoritative `unreadCount`. Include request status for safe decided-history navigation, without leaking unrelated request content.
- Deep link: `/admin/configuration/estimation?basketRequests=pending&basketRequestId=<encoded-id>`. Fetch the specified request directly rather than searching the first queue page. The existing default Configuration screen and request-list entry point remain unchanged when that parameter is absent.
- Basket notification state is independently enabled by review permission and must work even if chat/Execution notification permissions are absent. Reuse the bell's source-selection presentation, add its unread total, and preserve each source's pagination/error states.
- Poll every 30 seconds while online and foregrounded; refresh on inbox open, focus and reconnect. Scope caches and pending requests to the authenticated identity/session; clear on revocation, account switch and logout.
- Opening an alert marks it read, then opens the matching review or decided history. A mark-read/navigation failure retains a safe retry path. No approval action occurs implicitly.

### Styling approach

Load required editor styles directly from the proposal entry path, including quality styles. Use existing `knowledge-context-panel` control styling and proposal-scoped layout rules to bridge portal ancestry. Add an explicit proposal wrapper/metadata-dialog scope where needed; never fabricate `data-role="super_admin"` on Procurement.

Do not globally widen drawers, change existing Configuration selectors or remove Configuration's own summary. Preserve shared component defaults. If a small shared style extraction is necessary, keep its resulting selectors/declarations equivalent for the existing screen and give that file to one writer before editing.

## Task graph and ownership

| Task | Deliverable and owned paths | Depends on | Acceptance criteria |
| --- | --- | --- | --- |
| T0 | Primary: capture dirty-path set and full tracked/untracked target baselines in an ignored temporary location; record current focused-test failures and cold-entry screenshots. No reset/staging or live DB startup. | Approved plan and execution mode | AC3, AC9 |
| T1 | Primary: freeze shared contracts and route/API shapes in backend `contracts/vendor-basket-{proposal,request}.ts`, new notification contract, frontend `proposalTypes.ts`, `proposalApi.ts`, `vendorBasketRequestApi.ts`, new notification API types, route-operation inventory, app/OpenAPI composition and index initialization ownership. Record target and notification fixtures. | T0 | AC4, AC6–AC9 |
| T2 | Backend workflow owner: `VendorBasketProposal.ts`, `VendorBasketRequest.ts`, proposal/request routes and services, publication, their OpenAPI modules and focused tests; new index migration and replica-set tests. Minimal assigned hierarchy helper changes only if required. Wire the agreed notification helper at submission sites. | T1 | AC4–AC7, AC9 |
| T3 | Backend notification owner: new `VendorBasketRequestNotification.ts`, notification service/router/OpenAPI module and notification replica-set/route tests. Export the agreed submission helper; no edits in T2's services or root-owned composition files. | T1 | AC6–AC9 |
| T4 | Frontend proposal owner: `ProposalMetadataDialog.tsx`, `CreateProposalPanel.tsx`, `ProposalWorkspace.tsx`, `OwnProposalList.tsx`, `proposalDataSource.ts`, proposal CSS/tests; `VendorBasketFields.tsx` and relevant Procurement tests; request review and optional deep-link plumbing in `KnowledgeBasketRequestReview.tsx`/`KnowledgeBaseIndexPage.tsx`. No writes to notification UI or root-owned contract files. | T1 | AC1–AC6, AC8–AC9 |
| T5 | Primary: new basket notification provider/inbox and tests; `NotificationBell.tsx`, `NotificationProvider.tsx`, notifications CSS and auth-scoped cache integration. Finish application/router/OpenAPI composition with T2/T3 exports. | T1; final integration after T2–T4 | AC7–AC9 |
| T6 | Primary plus read-only integrity reviewer in mode A: review integrated authorization, lineage, concurrency, publication, index transition, notification atomicity and styling isolation; owners fix confirmed findings. | T2–T5 finished | AC1–AC9 |
| T7 | Verification runner in mode A, primary in mode B: run final integrated checks and browser flows, inspect diff/hygiene, record evidence and rollout limitations in this plan. No product-source edits by verification owner. | T6 findings resolved and all writers finished | AC1–AC9 |

Mode A can run T2, T3 and T4 concurrently while the primary completes T5, using the four available slots. They share only frozen contracts; unexpected contract changes return to the primary before adoption. T6 and T7 are sequential after writers finish. In mode B perform equivalent implementation/review/verification inline without implementation agents.

All delegated writers must be told they are not alone in the worktree, must preserve previous changes, must not revert another writer's edits, and must stay within the assigned paths. The primary owns task/spec documents, public contracts and final reconciliation. No agents are started during this task-plan stage.

## Detailed execution checklist

### T0–T1: baseline and contract preparation

- [x] Capture the initial dirty-path inventory and complete content of relevant untracked proposal files, not only `git diff` against HEAD. The prior full-basket implementation is a baseline to retain, not a new change to erase.
- [x] Reproduce the supplied metadata/quality presentation using a fresh Procurement browser session and the actual app shell. A fixture harness must not eagerly import the Configuration workspace just to make proposal CSS work.
- [x] Capture normal Configuration reference screenshots and the original proposal lifecycle checks; track pre-existing failures separately.
- [x] Establish target defaults, one-Sub-Basket cardinality, inherited-quality behavior, immutable parent context, ID-remapping boundaries, API errors, cache keys and notification contracts above.
- [x] Synchronize route registry/OpenAPI and authorization contract fixtures without granting direct Configuration writes to Procurement. Reserve root ownership of all shared integration files.

### T2–T3: transactional backend behavior

- [x] Implement the target-aware lifecycle from create through revise/decision, with current parent validation, immutable submitted/review separation and explicit capability flags.
- [x] Support no-Main-Line Sub-Basket proposals without manufactured placeholder lines; validate all included lines normally. Preserve the old Main Basket readiness requirements.
- [x] Prevent API tampering with parent metadata/quality, target ID, another proposal's resources and other users' drafts.
- [x] Publish to the selected parent atomically and preserve all prior business configuration. Allocate child ordering without renumbering existing children.
- [x] Make duplicate checks target-aware and prepare the index transition with read-only inventory, retry-safe apply/rollback and disposable-db evidence. Never invoke it against an implicitly selected real database.
- [x] Persist notifications atomically at both existing submission paths. Test missing/multiple/inactive Super Admin recipients, injected persistence failure, commit/replay and concurrent retries.
- [x] Add exact-request lookup, inherited-quality retrieval and recipient-scoped notification list/read routes with bounded validation and nondisclosing errors.

### T4–T5: frontend flow and presentation

- [x] Hide only the requested metadata inputs. Preserve existing hidden values in edits, including nonzero order and nonempty descriptions. Keep Main Basket metadata behavior unchanged.
- [x] Rename the proposal quality tab and remove its saved summary rendering/import. Retain ordinary Configuration's summary and shared quality features.
- [x] Fix the missing quality styles and portal-specific presentation using existing tokens/styles, with consistent form padding and readable tables/stage counts.
- [x] Apply 70vw at viewport widths of at least 1200px to both proposal entry and full workspace. Use the available width below that breakpoint; adapt hierarchy and controls rather than shrinking desktop content.
- [x] Add Procurement Sub-Basket proposal entry for a selected eligible parent; handle multiple parent choices, stale/error catalog states, request progress and preserved vendor draft fields. Keep Super Admin direct creation behavior unchanged.
- [x] Display explicit target context and inherited read-only Quality Parameters in the proposal workspace; support the Sub-Basket-only state without requiring a selected Main Line to submit or inspect parent quality.
- [x] Update own/review request lists with target context and exact-request links. Refresh approved parent/child catalogs without auto-saving or auto-selecting the vendor.
- [x] Integrate the basket source into the bell, source selection, unread count, mark-read and deep-link navigation. Preserve chat/Execution behavior, keyboard/focus access and separate failure states.

### T6–T7: review and final verification

- [x] Review integrated changes against each acceptance criterion and resolve confirmed findings before final verification.
- [x] Ensure configured local/prod database credentials are never used by the QA harness; use explicit synthetic environment configuration and disposable replica sets.
- [x] Record commands, result counts, browser evidence, baseline failures, unrun checks and the unperformed index transition. Do not reuse previous-task test counts as current results.
- [x] Inspect all new-task diffs against T0's dirty-worktree baseline and run repository hygiene checks. Preserve unrelated files and runtime artifacts outside deliverables.

## Verification lanes

Run focused checks first. Expand to the integrated suites once the writers have finished. These are planned checks, not claims of passing results.

**Backend focused** (from `backend/`):

```sh
npm test -- tests/vendor-basket-proposal-bounds.test.ts tests/vendor-basket-proposal.replica-set.test.ts tests/vendor-basket-proposal-publication.replica-set.test.ts tests/vendor-basket-request.replica-set.test.ts tests/vendor-basket-request-target-index.replica-set.test.ts tests/vendor-basket-request-notifications.replica-set.test.ts tests/vendor-basket-request-notifications-routes.test.ts
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts tests/ai-estimator-knowledge-sub-basket-management.replica-set.test.ts tests/ai-estimator-knowledge-basket-quality.replica-set.test.ts tests/ai-estimator-knowledge-display-order.service.test.ts
npm test -- tests/notifications.test.ts tests/notifications-routes.test.ts tests/notifications-stream.test.ts tests/notifications-mongo.replica-set.test.ts
```

The new test filenames above are reserved deliverables. Extend existing replica-set files for target publication cases rather than duplicating their entire harness. Use at least two Procurement identities, two differently configured parent baskets, a pre-existing child and quality checklist, and the sole Super Admin. Include parallel submissions, approvals, child creation and parent deactivation/deletion conflicts. Assert persisted resources, audit and notification counts after both successful commit and injected rollback.

**Frontend focused** (from `frontend/`):

```sh
npm test -- src/features/vendor-basket-proposals src/features/procurement/ProcurementVendorProfile.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx src/features/notifications
npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeQualityImportDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeAutomaticDisplayOrder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/useKnowledgeSavedSummary.test.tsx src/api/authorization-contract.test.ts
```

Include payload-preservation assertions, one/multiple-parent selection, immutable target/read-only quality, no-lines submission, own/other identity caches, all notification sources, deep linking beyond the first page, already-decided requests and preserved unsaved vendor form entries.

**Integrated checks**, run separately in both `backend/` and `frontend/`:

```sh
npm run typecheck
npm test
npm run build
```

There is no repository lint script. Do not claim lint passed. If a broad-suite failure occurs, isolate it and compare against the captured baseline when necessary; do not hide failures or repeatedly rerun already passing checks without new evidence.

**Rendered QA:** use 1440px, 1920px, 1024px, 768px and 390px viewports in the real role shell. Measure desktop panel width, check first-entry styles, nested metadata/quality dialogs, empty/loaded/error/read-only states, long names/table overflow, keyboard focus, focus return and accessibility violations. Verify ordinary Configuration screenshots and behavior remain equivalent.

Exercise both complete paths: new Main Basket -> submit -> notification -> Super Admin edit/approve -> explicit vendor selection; existing Main Basket -> Sub-Basket-only and configured-line drafts -> submit -> notification -> reject/revise/resubmit -> edit/approve -> exact-parent catalog entry. Include notification mark-read without decision, reconnect and already-decided navigation. Inspect browser console and network errors. Store synthetic screenshots/logs in ignored `frontend/output/` or `/tmp`, report their paths and do not commit them.

**Hygiene** (repository root):

```sh
git diff --check
git status --short
```

## Handoff and gate state

- Specification: approved by the user on 2026-10-12.
- Task plan: approved.
- Execution mode: A, parallel native sub-agents.
- Implementation: T1–T7 complete. Feature checks and rendered flows passed; broader-suite failures and rollout prerequisites are explicitly recorded below.
- Live database/index transition, deployment and synchronization: not authorized or performed.

After task-plan approval, ask the repository's exact execution-mode question once. After the user chooses A or B, execute this plan through integration and verification. Final handoff must summarize the outcome, principal files, exact checks/results, unresolved issues and any real-database enablement prerequisite without calling unverified or undeployed behavior live.

## Execution evidence

- Initial worktree snapshot: `/tmp/lisno-basket-refinements-baseline-jmrkzo8s` (2,422 tracked/untracked source files plus initial status/diff and content hashes). Existing full-basket work preserved.
- Frozen target/notification DTOs and routes communicated to all writers before implementation. Publication uses a helper opt-in to preserve proposed Sub-Basket IDs explicitly, avoiding incidental assumptions about generated IDs.

### Implementation and review evidence

- Existing-parent Sub-Basket drafts now retain immutable parent identity, allow zero or more new Main Lines, inherit parent quality read-only, and publish only the reviewed child/resources in the decision transaction. Ordinary Configuration uses unchanged shared-helper defaults.
- Proposal forms preserve hidden order/description values. Proposal panels load their styles directly, use 70vw at desktop widths and full available width below 1200px. Quality Parameter replaces Basket quality; Saved summary is removed only from proposal workspaces.
- Both submission paths atomically create the durable sole-Super-Admin notification. The existing bell has an independently authorized basket source with pagination, foreground polling, read/retry and exact-request navigation.
- Independent integrity review closed two findings: existing-parent recommendation catalogs now merge live siblings with proposal children by stable ID, and all proposal audit events record canonical target kind and parent ID. The four adapter regressions and 33 lifecycle tests pass after these fixes.
- Review found no further confirmed authorization, transaction, recipient-isolation or index-transition defects. Reviewer did not execute tests; final integrated execution is recorded separately below.
- No dependencies or lockfiles changed. Shared Configuration style/component files are unchanged from this task's baseline. The only ordinary Configuration page change is forwarding an optional exact request ID to the existing review surface.
- Final source inventory is stored at `/tmp/lisno-refinements-final-diff-inventory.json`; it confirms no baseline source files are missing.

### Integrated verification evidence

| Check | Command | Result | Evidence |
| --- | --- | --- | --- |
| Backend focused feature suite | `cd backend && npm test -- tests/vendor-basket-proposal-bounds.test.ts tests/vendor-basket-proposal.replica-set.test.ts tests/vendor-basket-proposal-publication.replica-set.test.ts tests/vendor-basket-request.replica-set.test.ts tests/vendor-basket-request-target-index.replica-set.test.ts tests/vendor-basket-request-notifications.replica-set.test.ts tests/vendor-basket-request-notifications-routes.test.ts --maxWorkers=2` | 126/126 passed across 7 files; disposable replica sets | `/tmp/lisno-refinements-final-backend-focused-escalated.log` |
| Frontend focused feature suite | `cd frontend && npm test -- src/features/vendor-basket-proposals src/features/procurement/ProcurementVendorProfile.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx src/features/notifications` | 153/153 passed across 12 files | `/tmp/lisno-refinements-final-frontend-focused.log` |
| Frontend full suite before fixture correction | `cd frontend && npm test` | 4,646 passed, 32 failed across 305 files | `/tmp/lisno-refinements-final-frontend-full.log` |
| Exact failing frontend files against the captured baseline | `npm test --` the same seven failing files from the snapshot | 24 identical failing test names; 211 passed. No baseline-only failures. | `/tmp/lisno-refinements-final-frontend-baseline-failures.log` |
| Corrected synthetic enterprise transport | `cd frontend && npm test -- src/test/fixtures/enterpriseTransport.test.tsx` | 63/63 passed, resolving all eight newly introduced fixture failures | `/tmp/lisno-refinements-final-frontend-enterprise-postfix.log` |

The new globally available Super Admin basket notification read required an empty notification response in the synthetic enterprise test transport. Added only the exact GET fixture with Super Admin role scoping, retaining normal scenario error/loading behavior. Independent review found no issue in that fixture patch. Frontend typecheck was rerun successfully afterward. The full frontend suite was not repeated after this test-only correction; its remaining 24 failures are independently confirmed against the starting snapshot.

Both workspace typechecks and production builds passed. Backend full-suite results are recorded below; browser flow evidence is recorded below. No lint command exists or was claimed.

### Final browser-discovered entry correction

The actual Procurement role has both existing classification-create permission and new proposal-create permission. The Add Sub Basket handler initially chose its older direct-create branch in this combination. Corrected the handler to prefer the proposal flow, and to enforce catalog readiness on that path even when direct-create permission is also present. Direct-create-only callers, including the normal Super Admin path, retain their original form. No backend permissions were changed.

`npm test -- src/features/procurement/ProcurementVendorProfile.test.tsx` passed **59/59** after this correction, including both permission combinations, the direct-create-only form, and preserved vendor draft values. Log: `/tmp/lisno-refinements-entry-permission-fix.log`. Independent review rechecked the two-file patch with no findings. Final frontend typecheck/build passed for this product change (`frontend-typecheck-final.log`, `frontend-build-final.log` under `/tmp/lisno-refinements-final-`); the earlier full-suite result remains labeled as preceding it.

### Backend integrated result

`cd backend && npm test -- --maxWorkers=2` completed all **272 files**: **5,617 passed, 17 failed** (264 passing files, 8 failing files). Log: `/tmp/lisno-refinements-final-backend-full.log`.

- Sixteen failed test names match the captured baseline exactly across seven files: `leads.test.ts`, `project-purchase-order-request.replica-set.test.ts`, `ai-estimator-knowledge-basket-quality.replica-set.test.ts`, `ai-estimator-knowledge-item.service.test.ts`, `ai-estimator-knowledge-reference.service.test.ts`, `full-journey.test.ts`, and `ai-estimator-knowledge-routes.test.ts`. Baseline comparison: 337 passed / 16 failed; log `/tmp/lisno-refinements-final-backend-baseline-failures.log`.
- The seventeenth was `project-workflow-routes.test.ts > forwards scoped project filters and proof downloads for superAdmin`, reporting `socket hang up`. That complete file passed **20/20** when isolated on current code and **20/20** on the baseline. This is reported as a transient, non-reproducing socket failure, not asserted to be a proven baseline defect.
- All basket proposal, notification, index, route registry, OpenAPI, server initialization and authorization checks passed within the full run. No backend product changes followed that run.
- The broad suites are therefore not green. Existing failures and the transient failure are disclosed; unrelated code was not rewritten to change these results.

### Verification runner signoff

The independent verifier completed its integrated checks with no unresolved change-specific failure. Full suites remain non-green for the baseline failures and transient socket issue documented above. `npm run typecheck` and `npm run build` passed in both workspaces; frontend checks were repeated after the final product fix. `git diff --check` passed.

Exact baseline commands:

```sh
# /tmp/lisno-basket-refinements-baseline-jmrkzo8s/frontend
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/auth/PasswordResetPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/test/accessibility.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/test/fixtures/enterpriseTransport.test.tsx

# /tmp/lisno-basket-refinements-baseline-jmrkzo8s/backend
npm test -- tests/leads.test.ts tests/project-purchase-order-request.replica-set.test.ts tests/ai-estimator-knowledge-basket-quality.replica-set.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/full-journey.test.ts tests/ai-estimator-knowledge-routes.test.ts --maxWorkers=2

# Current and baseline backend, each 20/20 passed
npm test -- tests/project-workflow-routes.test.ts --maxWorkers=2
```

Warnings were existing Mongoose `new` option deprecations, Vite chunks above 500 kB, and MSW unhandled-request output from baseline frontend tests. No lint script exists. OCR is unrelated and was not run. Build outputs/caches are ignored; verification logs remain under `/tmp/lisno-refinements-final-`. No dependencies, lockfiles, commits, deployment, sync, seeds, or configured-database writes were performed.

### Rendered verification and acceptance reconciliation

The browser harness used real application components in the role shell, actual proposal services/routes, synthetic identities and a disposable Mongo replica set. It never used configured database credentials. Procurement imports were lazy so cold-entry checks did not depend on visiting the Configuration workspace. The harness was corrected to load Procurement's normal route stylesheet before final vendor-selector captures; this was a fixture-only correction.

| Acceptance | Evidence |
| --- | --- |
| AC1 | Rendered metadata forms omit the requested fields; payload tests preserve pre-existing nonzero order/nonempty description. |
| AC2 | Proposal Quality Parameter renders the shared editor and omits Saved summary. Inherited quality is read-only for both no-line and configured-line requests. Ordinary Configuration keeps its original tabs and quality behavior. |
| AC3 | Both proposal stages measured 1,008px at 1,440px and 1,344px at 1,920px (70%); full available width at 1,024/768/390px. No unintended page overflow or axe violations in checked layouts. Nested quality dialog at390px remains usable with Escape/focus return. Ordinary Configuration overview screenshots are byte-identical; quality styling is unchanged, with pixel differences limited to the top-tab focus/pointer state. |
| AC4 | Actual Procurement Add vendor entry creates the target-parent proposal even with both permissions. Browser flows covered empty-child and configured-Main-Line drafts, saved reload, rejection, revision, resubmission and explicit multi-parent selection. |
| AC5 | New Main Basket was edited/approved and became selectable. Sub-Basket-only and configured-line proposals were approved under the selected existing parent. Normal Configuration showed the published configured line Active, 100% complete, Square foot, under the expected parent/child. Replica tests prove parent/sibling/quality preservation and transaction rollback. |
| AC6 | Focused replica-set/authorization checks cover ownership, parent state, stable IDs, same-name scopes, races, retries, stale versions and rollback. No direct Configuration permissions added. |
| AC7 | Submit/resubmit notifications verified in browser and transactional tests, including legacy submission, idempotent retry and atomic failure rollback. |
| AC8 | Real bell unread count decreased on opening exact review while pending request count stayed unchanged. Rejected history remained and resubmission created a distinct alert. Mobile inbox had no overflow/axe issues. Rendered unit checks cover pagination/beyond-first-page links, retries, reconnect, session changes and chat/Execution coexistence. |
| AC9 | Both final builds/typechecks pass; feature checks pass. Full suites and exact baseline comparisons are disclosed above. No live migration, database sync, seeding, deployment, staging or commit performed. |

Additional browser evidence: a probable recommendation targeting an existing sibling Sub-Basket/Main Line saved and survived cold reload. Quality remained inherited checklist version1 and read-only. Approved Main Baskets/Sub-Baskets were initially unselected in the vendor form and could be selected explicitly, with the original sibling left unselected.

Screenshots, snapshots and the synthetic harness are in ignored `frontend/output/playwright/basket-refinements/`; notable files include `current-quality-1440.png`, `current-quality-390.png`, `current-quality-editor-390.png`, `notifications-390.png`, `vendor-main-and-sub-explicit-selection.png`, `existing-sibling-recommendation.png`, and the ordinary Configuration before/after pairs. Primary visually inspected desktop/mobile quality, inbox and final vendor selection as well as the Configuration reference pair.

### Rollout boundary

**No configured database index transition was applied.** Existing databases retaining the old unscoped pending-request indexes must run the prepared, separately authorized index-only transition before existing-parent Sub-Basket requests are enabled. Until then that new path returns the explicit recoverable setup-unavailable response; the original Main Basket flow remains available. The procedure is dry-run by default, requires an explicit database, verified backup, paused writers and captured index metadata before apply, and refuses conflicting definitions or unsafe rollback. Disposable replica tests cover these safeguards. No request documents are rewritten by the procedure.

Code, review and proportionate local verification are complete within this approved scope. Live enablement/deployment is not included or claimed. Full-suite baseline failures remain outside this bounded change.

### Final artifact hygiene and QA limits

Browser QA report: `frontend/output/playwright/basket-refinements/qa-report.json`. The configured-line publication check used a fresh equivalent synthetic fixture after the earlier disposable server had stopped; actual-entry draft creation, saved sibling recommendation and reload were verified in the preceding run. Primary inspected `configured-sub-approved-configuration.png` as well.

Not run: a full vendor onboarding save with unrelated mandatory fields, production/configured-local-DB validation, populated browser pagination/failure fixtures, additional browser engines or a dedicated screen-reader session. Focused tests cover pagination/error/stale/identity cases. Explicit vendor catalog selection was verified without saving unrelated onboarding data. Final cold browser flows reported no product console/API errors after fixture setup corrections.

The QA owner relocated 92 task-generated CLI artifacts into the ignored QA directory and stopped its browser and disposable servers (ports4199/4200 closed). Final root `git status --short` contains no stray root `.playwright-cli` outputs. No baseline source files are missing. Final `git diff --check` passes; the dirty worktree and all unrelated prior changes remain preserved.
