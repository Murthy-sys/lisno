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
