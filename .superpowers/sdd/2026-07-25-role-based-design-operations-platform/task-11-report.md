# Task 11 report — final quality sweep

## Delivered

- Added an end-to-end backend journey covering designer, manager, design head, and client actions.
- Added frontend accessibility smoke coverage for login, keyboard operation, landmarks, sign-out, and all four role workspaces.
- Documented setup, environment variables, demo accounts, role visibility, risk/KPI behavior, verification commands, and the absence of lint scripts in `README.md`.
- Documented the visual-QA matrix and evidence in `design-qa.md`.
- Hardened uploads: JPEG and WebP are accepted from valid bytes, claimed MIME/signature mismatches are rejected, and Unicode bidi/control characters are removed from stored/displayed original filenames.
- Corrected the JSON Web Token error-class import so the backend starts correctly with the current Node runtime.

## TDD notes

The upload hardening test was added before the filename sanitizer. It initially exposed that a bidi override could survive the multipart filename decoding path. The sanitizer now decodes valid UTF-8 multipart names and removes bidi/control characters before persistence. The role journey and accessibility suites provide regression coverage for the completed flows.

## Verification

| Area | Commands | Result |
| --- | --- | --- |
| Backend | `npm run typecheck`, `npm test`, `npm run build` | passed; 12 test files, 124 tests |
| Frontend | `npm run typecheck`, `npm test`, `npm run build` | passed; 13 test files, 62 tests |
| Diff hygiene | `git diff --check` | passed |
| Lint | no `lint` script exists in either package | documented in README |

## Visual QA evidence

The API was started with a local development JWT secret and returned `200` from `/api/v1/health`; the Vite frontend also returned `200` from `http://127.0.0.1:5173/`. The required 1440×900 and 390×844 matrix for login, designer, manager, design head, and client routes is recorded in `design-qa.md`.

The available browser-control runtime reported that no browser binding was available in this environment. Consequently, screenshot capture and manual viewport inspection could not be performed here, and no screenshot result is claimed. This remains the only visual-QA follow-up: run the recorded matrix in an environment with a browser binding.

## Review fix round 1

- Replaced the shipped server's implicit memory-repository path with a
  testable production bootstrap. It loads `backend/.env`, connects using
  `MONGODB_URI` before listening, injects `createMongoRepository`, fails fast
  when Mongo is unavailable, and closes HTTP before disconnecting Mongo on
  shutdown.
- Parsed `CORS_ORIGIN` into an allow-list and applied it to standard and
  preflight API responses. Added `dotenv`, `start`, and `seed` runtime support
  and corrected frontend configuration/documentation to `VITE_API_URL`.
- Extended the cross-role journey to create draft, approved-internal, and
  other-client versions; it proves that the Aurora client cannot enumerate or
  download those resources.
- Added `axe-core` accessibility smoke coverage for a workspace disclosure,
  upload dialog focus/Escape restoration, mobile navigation, textual risk
  status, and all role homes. Axe identified and the review corrected a skipped
  heading level (`h4` to `h3`) on task titles.
- Extended filename directional-control stripping to U+061C, U+200E, and
  U+200F. JPEG/WebP test fixtures now meet the boundary's documented
  signature-level checks (including a size-consistent RIFF/WebP container).

### Review verification

| Area | Commands | Result |
| --- | --- | --- |
| Backend | `npm run typecheck`, `npm test`, `npm run build` | passed; 14 test files, 129 tests |
| Frontend | `npm run typecheck`, `npm test`, `npm run build` | passed; 13 test files, 63 tests |
| Targeted runtime | `npm test -- --run tests/server.test.ts` and typecheck | passed; 3 tests |
| Lint | no `lint` script exists in either package | documented in README |

The browser-binding limitation remains unchanged; no desktop/mobile screenshot
claim is made for this review round.

## Review fix round 2

- Split the full-journey client isolation checks into independent draft-ID,
  internal-ID, and cross-client-ID exclusions so a combined matcher cannot
  conceal a regression.
- Ran `axe-core` with zero violations for login and all four role homes, and
  while the workspace disclosure, upload dialog, and mobile navigation are
  open. The disclosure is activated with keyboard Enter in the smoke test.
- Axe exposed and this round corrected two additional semantics issues: the
  KPI component grouping is now a labeled section, and the mobile drawer uses
  a distinct `Mobile navigation` landmark label from the desktop sidebar.

### Review round 2 verification

| Area | Commands | Result |
| --- | --- | --- |
| Backend | `npm run typecheck`, `npm test`, `npm run build` | passed; 14 test files, 129 tests |
| Frontend | `npm run typecheck`, `npm test`, `npm run build` | passed; 13 test files, 63 tests |
| Lint | no `lint` script exists in either package | documented in README |

## Release-blocker foundation slice

- Demo seeding now clears all Lisno domain collections and the design-version
  sequence before re-inserting deterministic records; README warns that the
  command is destructive and must never target production.
- KPI input now derives approval outcome, approved version, revision count, and
  review presence from persisted design versions. KPI update events are fetched
  in one batched repository call rather than one call per task. The cross-role
  lifecycle test proves an upload and approval produces eligible quality and
  revision KPI components.
- The designer workspace uses a visible current-month/previous-month reporting
  period selector instead of the former 2000–2100 hardcoded query.

## Final role-workflow blocker slice

Implementation commit: `3f48533` (`feat: complete role workflow blockers`).

- Added accessible, labeled designer workspace dialogs for creating floors,
  stages, and tasks. Their mutations refresh the project hierarchy and announce
  successful creation.
- Made project status plus project/floor progress server-derived from task state
  and effort. A project becomes active when task work begins, and completed only
  when all tasks complete.
- Added a client-authorized, paginated project-summary endpoint with redacted
  project fields, derived progress, and floor count; the client dashboard now
  displays both.
- Paginated manager-team and head-organization APIs. Frontend organization,
  evaluation, and audit readers explicitly fetch every page so records beyond
  the page boundary are not silently omitted.
- Replaced hierarchy task, evaluation, and KPI-event fan-out with bounded batch
  repository reads. Regression coverage includes collections larger than the
  page size and rejects fallback to single-subject evaluation reads.
- Nested each designer's assigned projects, including derived progress and
  head project links, beneath that designer in the head hierarchy.

### TDD and verification

The backend progress/client-summary/pagination tests and frontend
structure-dialog/all-page/nested-project tests were added first and observed
failing before implementation. Self-review then added a failing bounded-batch
hierarchy regression before removing the remaining evaluation/KPI N+1 reads.

| Area | Commands | Result |
| --- | --- | --- |
| Backend | `npm run typecheck`, `npm test`, `npm run build` | passed; 14 test files, 133 tests |
| Frontend | `npm run typecheck`, `npm test`, `npm run build` | passed; 13 test files, 64 tests |
| Focused backend | `npm test -- workflows.test.ts` | passed; 34 tests |
| Focused frontend | five role-workflow test paths | passed; 4 discovered test files, 15 tests |
| Diff hygiene | `git diff --check`, `git diff --cached --check` | passed |

No lint script exists in either package. `reference_docs/` remained untouched
and untracked.

## Final review fix round 2

Implementation commit: `1aacdc1` (`fix: close final review data bounds`).

- Unified personal, manager, and head KPI calculations behind one bounded
  enrichment path. Revision count is now `max(version count - 1, 0)`,
  `in_review` is review evidence, and task updates preserve a previously
  observed yellow-risk state before recovery.
- Added structured 366-day, 1,000-task, 5,000-evidence, hierarchy-summary, and
  project-history limits. Mongo task/owner event predicates are processed in
  fixed-size batches, hierarchy project/task/evaluation reads are scoped to
  the current nested page, and organization nodes expose a 20-designer nested
  page with exact totals plus an explicit continuation endpoint.
- Added an authorized, newest-first project activity feed spanning project,
  related task, and design-version audit entities. The management workspace
  now traverses every design-version and activity page instead of stopping at
  100 records.
- Added regressions for personal/hierarchy KPI parity, review and revision
  evidence, recovered yellow risk, hard report limits, nested designer
  continuation, avoidance of head-wide project enumeration, cross-project
  activity isolation, newest-first pagination, and frontend second-page
  rendering.

### Final review round 2 verification

| Area | Commands | Result |
| --- | --- | --- |
| Backend | `npm run typecheck`, `npm test`, `npm run build` | passed; 14 test files, 137 tests |
| Frontend | `npm run typecheck`, `npm test`, `npm run build` | passed; 14 test files, 65 tests |
| Focused backend | `npm test -- --run tests/workflows.test.ts` | passed; 1 file, 38 tests |
| Focused frontend | `npm test -- --run src/features/head/HeadDashboard.test.tsx src/features/manager/ManagementProjectWorkspace.test.tsx` | passed; 2 files, 2 tests |
| Diff hygiene | `git diff --check`, `git diff --cached --check` | passed |

No lint script exists in either package. `reference_docs/` remained untouched
and untracked.

## Final review fix round 3

Implementation commit: `75eb4fc` (`fix: complete management review context`).

- Manager nodes retain a separately paginated 20-designer nested payload, but
  their KPI, workload, red/yellow risk, and evaluation-coverage aggregates now
  include the complete team up to an explicit 100-designer limit. A hierarchy
  page is also capped at 1,000 aggregate designers, with structured 422 errors
  for either cardinality violation.
- The project inspection task view now distinguishes original and current
  deadlines. Design-version history includes uploader, upload time, reviewer,
  approval status/time, and client visibility.
- Project activity now identifies the entity (mapping task IDs to task titles),
  actor, timestamp, old/new field values, and reason in compact labeled rows.
- Regression coverage proves designer 21 changes team risk, workload,
  evaluation coverage, and KPI eligibility while staying outside the first
  nested page; it also proves the hard team limit and all requested history
  metadata.

### Final review round 3 verification

| Area | Commands | Result |
| --- | --- | --- |
| Backend | `npm test`, `npm run typecheck`, `npm run build` | passed; 14 test files, 139 tests |
| Frontend | `npm test`, `npm run typecheck`, `npm run build` | passed; 14 test files, 65 tests |
| Focused backend | `npm test -- --run tests/workflows.test.ts` | passed; 1 file, 40 tests |
| Focused frontend | `npm test -- --run src/features/manager/ManagementProjectWorkspace.test.tsx` | passed; 1 file, 1 test |
| Diff hygiene | `git diff --check`, `git diff --cached --check` | passed |

No lint script exists in either package. `reference_docs/` remained untouched
and untracked.
