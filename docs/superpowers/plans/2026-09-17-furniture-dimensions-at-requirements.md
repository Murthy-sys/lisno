# Furniture dimension entry at requirements — plan

Spec: [design](../specs/2026-09-17-furniture-dimensions-at-requirements-design.md). Standing autonomous Mode A. Baseline captured in `/tmp/lisno-furniture-entry-qa/initial-status.txt`, `initial-tracked.diff`, `initial-untracked.tar.gz`; prior dirty work preserved.

1. Trace workflow and settle additive contract — complete.
2. Implement — complete. Backend writer owns backend domain/service/projection/OpenAPI/tests; frontend writer owns WorkflowStageActions.tsx and action/designer integration tests. Root owns API types, selectors/progress/review copy and their tests, durable docs and integration QA. No overlapping source ownership.
3. Independent integrity review — complete. Frontend and backend reviewed read-only: exact combined approval lineage, malformed-bundle/downgrade rejection, UOM authority, legacy compatibility and UI stale/draft handling. Combined Client labels clarified after review; final review clear.
4. Final integrated verification — complete: focused/shared tests, replica tests, typechecks/builds, rendered entry and Client review at 360/768/1440, submit/send-back/correction/approve interactions, hygiene and preservation audit.
5. Handoff — complete; local implementation verified, deployment not performed. No commit, push, deployment, migration, production mutation or customer messages.

## Integrated verification evidence

All product writers finished before final checks. Current change: **646 unique passing tests across 21 suites**, deduplicated across reruns.

- Frontend: `npm test --` 13 workflow/designer suites listed in `frontend-final-tests.log`: **267 passed**. Covers immediate first/returned scope entry, selected estimate items, configured UOMs and creation, positive measurements, proof requirement, room/no-furniture draft and native FileList preservation, exact-token decisions, stale replacement, review rendering/accessibility, related project/designer and measurement/kickoff workflows.
- Backend: `tests/design-workflow-state.test.ts` **197 passed** (latest label-projection rerun in `backend-label-tests.log`); replica tests **34 passed**; submission gates **22 passed**; API documentation **23 passed**. Latest memory/API rerun totals 220; earlier four-suite run totals 274 before two added cases. Deduplicated workflow/API total **276**. See `backend-focused.log`, `backend-memory-api-final.log`, `backend-label-tests.log`.
- Final independent verifier ran `npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/server.test.ts`: **103 passed**, exit 0. Backend total **379**.
- Frontend and backend `npm run typecheck` and `npm run build`: exit 0. Existing warnings: Vite bundles above 500 kB; Mongoose deprecated `new` option in tests. No lint script exists.
- Independent verifier: `git diff --check` and `git status --short` exit 0. All 67 baseline dirty paths retained: 52 byte-identical, 15 intended modifications; four expected new files. No staged changes or unrelated modifications.
- Evidence directory: `/tmp/lisno-furniture-entry-qa`. Browser checks use the real React components with synthetic identities/project and mocked API; they are separate from actual HTTP/Mongo tests and are not production verification. Final browser results are recorded below.

Full repository suites were not repeated because focused, transactional and shared-contract checks cover the change. OCR is unaffected; no schema migration or dependency change. No commit, push, deploy, production mutation, or customer communication. Frontend and backend must be released together through a separately authorized deployment.

## Browser verification — complete

- Real React form immediately rendered the three canonical estimate items across two required rooms before acceptance. L/W/H and configured UOM inputs were filled, supporting PDF selected, and no-furniture toggle preserved all measurements and the native file selection. Inline reusable UOM creation also succeeded without submitting the parent form.
- `browser-correction.log`: submitted combined scope/dimensions; Client send-back sent exact `requirements-8` token and feedback; next stage stayed blocked; Designer reopened with previous width `600`, corrected it to `650`, and resubmitted; Client saw revision 2, corrected dimensions, a single supporting document, and pending approval.
- `browser-final.log`: entry and review each checked at **360, 768 and 1440px** (six states), **zero axe violations**, **no document overflow**, **zero page errors**. Explicit Client approval sent the current exact submission token, completed furniture stage and opened Space planning. Screenshots `scope-{360,768,1440}.png` and `review-{360,768,1440}.png` inspected.
- Browser APIs are mocked and the fixture retained its earlier approval label “Approve furniture dimensions”; final production combined action labels are separately verified through real backend projection tests. This is not a live full-stack or deployed-environment check.
- Earlier harness attempts encountered a Vite dependency prebundle refresh, stale fixture labels, a mismatched region locator and a closed browser tab. These were isolated test-harness problems; the final browser workflow passed and the actual backend behavior is independently covered by HTTP/replica tests.

Primary affected areas: `WorkflowStageActions.tsx`, `FurnitureDimensionsEditor.tsx`, workflow API types/selectors/progress/requirements review, backend workflow domain/service/instructions/OpenAPI, and focused regression tests. No dependency or lockfile changes.

QA cleanup: both named browser sessions closed, local port 4217 test server stopped, and temporary node_modules symlink removed. Evidence remains under `/tmp/lisno-furniture-entry-qa`; no runtime artifacts were added to the repository. Final diff check passed.
