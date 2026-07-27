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
