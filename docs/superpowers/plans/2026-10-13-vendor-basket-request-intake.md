# Vendor basket request intake task plan

Source: [specification](../specs/2026-10-13-vendor-basket-request-intake-design.md). User confirmed name-only Main Lines. Standing autonomous execution and parallel mode apply; no routine approval question is pending.

## Ownership and sequence

Only one parent phase is in progress. Initial dirty paths and patch are `/tmp/lisno-vendor-basket-request-redesign/initial-status.txt` and `initial-tracked.diff`; all prior estimation work is preserved.

1. **Contract and evidence, complete.** Primary plus two read-only audits traced requester entry, My Requests, Super Admin review, publication and description loss. Agreed explicit intake mode, concise metadata request and draft-only Main Line publication. AC1–AC5.
2. **Implementation, complete.** Two non-overlapping writers worked in parallel after fixing API shapes below.
   - Backend owns proposal/request contracts, proposal/request models and services, proposal publication/routes/OpenAPI, nullable Sub Basket description and narrow Configuration helper/projection changes, plus related focused tests. No central route registry or prior estimation files.
   - Frontend owns vendor proposal components/API/types/styles, `VendorBasketFields`, My Requests and Super Admin basket review components/tests. Preserve existing full-proposal workspace by mode routing. No global authorization/router files or prior estimation changes.
   - Primary owns specification/plan, central route registry and corresponding inventory/authorization tests, integration, final diff and browser QA. Any ownership change is announced before edits.
3. **Integrity review, complete.** The independent review checked actor/ownership/CAS, immutable history, strict intake boundaries, no accidental activation, transaction rollback, parent preservation, source labels and retries. One confirmed retry finding was fixed; re-review of the fix and ten new recovery/divergence cases found no remaining confirmed P1/P2 findings. Reviewer made no source changes or test runs.
4. **Final verification, complete.** After all writers and reviewer released, the verification runner passed 597 focused tests, both typechecks and both production builds on the integrated worktree. Primary completed responsive/keyboard browser QA and reconciled the new diff against the initial snapshot. Final documentation-only hygiene follows below.

## Fixed API outline

- Proposal/request DTO: optional `requestMode: "hierarchy_intake" | "full_configuration"`; absent means legacy full behavior.
- `ProposalIntakeContent`: optional `basket: { name, description }` (new Main Basket only), `subBasket: { name, description }`, `mainLines: Array<{ resourceId?: string, name: string }>`.
- Create extends existing `ProposalCreateInput` with `requestMode: "hierarchy_intake"` and `intake: ProposalIntakeContent`; existing top-level `name` matches the target entity. Backend validates consistency.
- Detail returns derived `intake` for intake mode. Parent display still comes from existing immutable `basket` context; existing-parent write bodies omit `intake.basket`.
- `PUT <procurement-or-admin-proposal-base>/:proposalId/intake` accepts versions plus `intake`, returns `ProposalDetail`. Procurement uses existing update permission; Super Admin uses existing Configuration update permission.
- Submit/decision/revise endpoints and stable stored statuses remain. Intake approved lines remain draft; full proposals retain active publication.
- Writers immediately report necessary contract corrections; no incompatible client fallback.

## Verification mapping

| Criteria | Evidence |
| --- | --- |
| AC1–AC2 | Intake create/edit rendered tests and outgoing payloads, `VendorBasketFields`/vendor profile preservation, HTTP strict input validation. |
| AC3–AC4 | Proposal replica tests: own/other requester, active SA, stale/concurrent decisions, rollback, descriptions, draft line state, parent/sibling/quality preservation, legacy activation. |
| AC5 | My Requests and admin review rendered tests, send-back/revise/resubmit flow, status labels, refresh/invalidation and no automatic vendor selection. |
| AC6 | Shared registry/OpenAPI tests, both workspace typechecks/builds, integrated focused suites, 390/768/1440 browser checks, `git diff --check` and untracked file whitespace. |

Focused tests precede broader shared-boundary tests. Do not repeat the entire pre-existing failing repository suite without a new risk justifying it. Prior task documented 12 backend/22 frontend baseline failures; do not modify unrelated failures or claim full green. Replica tests use disposable databases; no live migration/index changes. No lint script exists.

## Progress

- 2026-10-13: read-only audits complete; initial dirty snapshot saved; user confirmed Main Line name only.
- No dependencies or live/external actions planned. Reuse established components/styles and proposal persistence.
- Shared integration: primary added two intake-save operations under existing permissions (435 protected operations; 456 OpenAPI operations). Added nullable optional Sub Basket description to shared frontend types. No permission codes changed.
- `cd backend && npm test -- tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts --maxWorkers=2` passed 165/165 after sandbox local-server `EPERM` required the approved escalation. Evidence: `/tmp/lisno-vendor-basket-request-redesign/shared-contracts-retry.log`. This is an implementation-stage check; final verification follows writer release.
- Backend writer released all source changes after 140/140 preservation tests, 58/58 proposal/structure tests and backend typecheck passed. Logs: `/tmp/lisno-basket-intake-backend-regressions.log`, `/tmp/lisno-basket-intake-backend-final-focused.log`, `/tmp/lisno-basket-intake-backend-typecheck.log`.
- Frontend writer released the initial slice after 215/215 focused rendered tests and typecheck passed. Integrity review then found that a committed save with a lost response could prevent retrying the original Send/Submit. The fix reconciles only the unchanged saved basis or its exact immediate saved version/content/IDs before continuing the same command; divergent state preserves inputs and blocks continuation. Focused workspace tests passed 22/22, including ten new recovery/divergence cases; typecheck passed. Logs: `/tmp/lisno-basket-intake-reconciliation-tests.log`, `/tmp/lisno-basket-intake-reconciliation-typecheck.log`.
- Browser QA uses synthetic API fixtures with actual current React components at `127.0.0.1:4181`, not a live database. New Main Basket, new Sub Basket, returned-request revision/resubmit, Super Admin Submit and Send back passed at 390, 768 and 1440 px. Each had zero unexpected API requests, page errors or console errors; dialog bounds stayed inside the viewport without document overflow. Parent read-only state, outgoing payload/CAS and completion callbacks passed. Screenshots and command logs: `/tmp/lisno-vendor-basket-request-redesign/browser/`.
- Root reconciled the task delta against the original tracked patch: 37 tracked paths changed, all within the agreed feature/shared integration scope. Six new source/document paths belong to this task; two task-owned temporary CLI artifacts were moved into the external browser artifact directory before final hygiene.

- Keyboard browser check passed at 390 px: empty submission focuses the first invalid named input, Tab moves to its description, and Enter on Send completes the request. Footer controls remain reachable and visible after scrolling. Temporary QA browser and Vite server were stopped.

## Final verification and handoff

All acceptance criteria have evidence in the focused suites, integrity review and browser checks. Logs are in `/tmp/lisno-vendor-basket-request-redesign/final/`; browser summaries, screenshots and synthetic scripts are in the sibling `browser/` directory. Browser checks use synthetic responses; transactional Mongo behavior is covered separately by disposable replica-set integration tests.

| Check | Result | Evidence |
| --- | --- | --- |
| Backend focused command below | 372/372 tests, 14 files, exit 0 | `backend-focused-escalated.log` |
| Frontend focused command below | 225/225 tests, 12 files, exit 0 | `frontend-focused.log` |
| `cd backend && npm run typecheck` | Passed, exit 0 | `backend-typecheck.log` |
| `cd backend && npm run build` | Passed, exit 0 | `backend-build.log` |
| `cd frontend && npm run typecheck` | Passed, exit 0 | `frontend-typecheck.log` |
| `cd frontend && npm run build` | Passed, exit 0 | `frontend-build.log` |
| Responsive and keyboard browser checks | Five flows at three widths plus mobile keyboard flow passed | `../browser/summary.json` |
| Independent integrity review | No remaining confirmed P1/P2 findings after retry fix | Review and correction recorded above |
| Task-delta reconciliation | 37 tracked files plus six new source/document files, no unrelated path changes | `../task-delta-paths.txt` |
| Final repository hygiene | `git diff --check` exit 0; all 43 task paths have no trailing whitespace; no task runtime artifacts in status | `root-final-status.txt` and runner hygiene logs |

Exact backend focused command, from `backend/`:

```sh
npm test -- tests/vendor-basket-proposal.replica-set.test.ts tests/vendor-basket-proposal-bounds.test.ts tests/vendor-basket-proposal-publication.replica-set.test.ts tests/vendor-basket-proposal-masters.replica-set.test.ts tests/vendor-basket-proposal-master-routes.test.ts tests/ai-estimator-knowledge-sub-basket-management.replica-set.test.ts tests/ai-estimator-knowledge-sub-baskets.test.ts tests/vendor-basket-request.replica-set.test.ts tests/vendor-basket-request-notifications-routes.test.ts tests/vendor-basket-request-notifications.replica-set.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts --maxWorkers=2
```

Exact frontend focused command, from `frontend/`:

```sh
npm test -- src/features/vendor-basket-proposals src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx src/features/procurement/ProcurementRequestsPage.test.tsx src/features/procurement/VendorDirectory.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx --maxWorkers=2
```

Limitations and unrun checks: full repository suites were not repeated; the prior task documented unrelated failures (12 backend, 22 frontend). No lint script exists. Initial backend verification could not bind a local port inside the sandbox (`EPERM`); the identical suite passed after escalation. Existing Mongoose deprecated `new` option warnings and frontend chunks larger than 500 kB remain; no new build failure occurred.

No dependency or lockfile changes, live migration/index change, seed, production mutation, external message, commit, push or deployment was performed. No data backfill is needed: older records retain legacy mode and nullable Sub Basket descriptions. Approved Main Lines intentionally remain drafts until Super Admin supplies and activates the normal Configuration. All unrelated estimation work remains in the worktree.
