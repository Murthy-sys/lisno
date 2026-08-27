# UI foundation Phase 1 QA — 2026-08-04

## Gate status

**In progress / not yet eligible for Phase 1 completion.** Automated verification is green with the repository's canonical relative API test configuration. Authenticated Client evidence and the required in-app-browser matrix remain blocked by environment state recorded below.

## Build and runtime under test

- Commit: `0604a2742c2dc160ee736ae1db2e49a452404926`
- Branch: `feature/ocr_improvements`
- Frontend: Vite development server at `http://127.0.0.1:5173/` (HTTP 200)
- Backend: local development API at `http://127.0.0.1:3000/`; `GET /api/v1/health` returned `{ "data": { "status": "ok" } }`
- Browser runtime: the required in-app Browser returned no available `iab` instance, so no screenshots or real-browser axe results have been recorded yet.
- Database safety: no seed/reset was run. `migrate:client-linking -- --dry-run` inspected 17 users and 8 projects with 0 duplicate normalized emails and made no writes.

## Authenticated-account readiness

| Role | Account | Observable result | Status |
| --- | --- | --- | --- |
| Estimator/Sales | `sales@lisno.example` | `POST /api/v1/auth/login` returned HTTP 200 | Ready for browser QA |
| Client | `client@aurora.example` | `POST /api/v1/auth/login` returned HTTP 401 because the existing demo row lacks the normalized-email field used by current login lookup | Blocked pending explicit approval for the clean client-linking migration |
| Designer | `ananya@lisno.example` | Existing active demo row and password hash confirmed during read-only preflight | Browser evidence pending |
| Design Manager | `aarav@lisno.example` | Existing active demo row confirmed; normalized-email schema drift found during read-only preflight | Blocked with the same migration dependency |
| Design Head | `head@lisno.example` | Existing active demo row confirmed; normalized-email schema drift found during read-only preflight | Blocked with the same migration dependency |

## Required responsive visual matrix

The rows below are deliberately marked blocked rather than inferred from component tests. `—` means no screenshot exists because the in-app Browser is not attached.

| Route / fixture | Role or state | Required viewports (px) | Result | Screenshot |
| --- | --- | --- | --- | --- |
| `/qa/ui-foundation.html?state=default` | default | 320, 768, 1440 | BLOCKED — browser unavailable | — |
| `/qa/ui-foundation.html?state=loading` | loading | 320, 768, 1440 | BLOCKED — browser unavailable | — |
| `/qa/ui-foundation.html?state=empty` | empty | 320, 768, 1440 | BLOCKED — browser unavailable | — |
| `/qa/ui-foundation.html?state=error` | error | 320, 768, 1440 | BLOCKED — browser unavailable | — |
| `/qa/ui-foundation.html?state=conflict` | conflict | 320, 768, 1440 | BLOCKED — browser unavailable | — |
| `/qa/ui-foundation.html?state=session-expired` | session-expired | 320, 768, 1440 | BLOCKED — browser unavailable | — |
| `/qa/ui-foundation.html?state=toast` | toast | 320, 768, 1440 | BLOCKED — browser unavailable | — |
| `/qa/ui-foundation.html?state=drawer` | drawer | 320, 768, 1440 | BLOCKED — browser unavailable | — |
| `/login` | unauthenticated | 320, 390, 768, 1024, 1440 | BLOCKED — browser unavailable | — |
| `/signup` | unauthenticated | 320, 390, 768, 1024, 1440 | BLOCKED — browser unavailable | — |
| role home | Designer | 320, 390, 768, 1024, 1440 | BLOCKED — browser unavailable | — |
| role home | Design Manager | 320, 390, 768, 1024, 1440 | BLOCKED — browser and migration | — |
| role home | Design Head | 320, 390, 768, 1024, 1440 | BLOCKED — browser and migration | — |
| role home | Estimator/Sales | 320, 390, 768, 1024, 1440 | BLOCKED — browser unavailable; credentials otherwise ready | — |
| role home | Client | 320, 390, 768, 1024, 1440 | BLOCKED — browser and migration | — |

## Keyboard, motion, zoom, and real-browser accessibility

| Check | Result | Evidence |
| --- | --- | --- |
| Skip-link and route focus | Browser run pending | Component and accessibility regression tests are green; this does not substitute for browser evidence. |
| Drawer Escape, focus trap, and restoration | Browser run pending | Overlay and shell focused tests are green; browser evidence pending. |
| Sign-out pending behavior | Browser run pending | Auth/shell focused tests are green; browser evidence pending. |
| Reduced motion | Browser run pending | Token/style contract tests cover the media query; representative browser checks pending. |
| 200% and 400% zoom/reflow | Browser run pending | No browser observation yet. |
| Real-browser axe | Browser run pending | The deterministic hook now rejects unloaded, stale, redirected, or navigated target iframes and scans only the exact loaded target document. JSDOM axe results are not recorded as a substitute. |

## Automated regression evidence

| Gate | Result |
| --- | --- |
| Task 13 accessibility/fixture suite | PASS — 4 files, 64/64 tests |
| Frontend canonical full suite (`VITE_API_URL=/api/v1 npm test`) | PASS — 62 files, 559/559 tests |
| Frontend typecheck | PASS |
| Frontend production build | PASS — 2,026 modules; existing chunk-size advisory only |
| Backend tests | PASS — 36 files, 487/487 tests |
| Backend typecheck/build | PASS / PASS |
| Repository whitespace check | PASS |

The developer-local `frontend/.env` points `VITE_API_URL` at the absolute local backend. Plain `npm test` therefore remains baseline-red because legacy request mocks expect relative `/api/v1` URLs: Task 0 recorded 15 failing files / 73 failing tests, while the current plain run reports 13 failing files / 44 failing tests. The canonical relative-API run above is fully green.

The green frontend suite still prints a pre-existing MSW warning in `EstimatePlanChangeRequests.test.tsx` for unhandled `GET /api/v1/estimate-plan-pages/page-1/current-image`; it does not fail the suite and is outside the Phase 1 diff.

## Defects found and corrected during QA

| Commit | Defect | Regression evidence |
| --- | --- | --- |
| `b52d1d9` | The QA axe hook could scan the initial `about:blank` iframe or parent gallery instead of the requested app document; recursive QA paths with duplicate/encoded separators were also accepted. | RED lifecycle/path cases; GREEN Task 13 suite 64/64; independent review approved with no findings. |
| `88bd6f7` | Four legacy estimate tests used an unscoped `findByRole("status")`, which became ambiguous after the required named application-announcement region was integrated globally. | RED 4 failures; assertions scoped to the named `Upload design plans` feature region; focused 16/16. Production code unchanged. |
| `0604a27` | The toast dismiss `IconButton` was visually overridden to 36×36px, below the 44×44px shared touch-target contract. | Computed-style RED at 36px; toast-specific size override removed; focused 15/15 and current canonical full suite 559/559. |

## Remaining completion actions

1. Obtain explicit authorization and apply the non-destructive client-linking migration; recheck all five demo logins.
2. Attach the in-app Browser and execute the viewport, keyboard/focus, reduced-motion, 200%/400% reflow, console/network, screenshot, and real-browser axe matrix above.
3. Replace every blocked matrix cell with observable evidence, then run the final repository gate and commit this record separately.
