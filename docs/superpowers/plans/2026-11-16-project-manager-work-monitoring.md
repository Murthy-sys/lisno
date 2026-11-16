# Implementation plan

1. Inspect existing PM project query/filters/summary and shared execution detail guards. Preserve all previous dirty work.
2. Page owner: combine monitoring views, simplify rows/counts/filters/team disclosure, implement shared siteWorkStatus and adapt page tests.
3. Root: dedicated manager monitoring drawer content, integrate through an explicit managerMonitoring prop while retaining other role views, verify photos and authorized review commands, preserve dirty/stale guards.
4. Independent integrity review after integration, then focused regression tests and production build. Synthetic desktop/mobile browser checks only, no live project decisions.

## Implementation and verification

- Completed the monitoring list, dedicated manager review content, current-round photo preview, and default Site tab integration. Explicit full-detail links retain existing project metadata.
- Preserved allowed actions, expected versions, exact completion submission IDs, retry keys, denied-access handling, and guarded tab/detail/entity navigation. Conflict tests found and fixed untouched-form drafts silently adopting a new version after a failed save.
- Independent integrity review completed with no remaining material issues.
- Focused manager/shared execution/vendor regression run: 72 tests passed. The overlapping default PM workspace, operational access, estimate navigation, and site-manager routing suite passed 101/101 tests; the final workspace re-run passed 54/54. TypeScript and diff checks passed.
- Synthetic browser checks passed on desktop and 390px mobile: normal in-progress work has no approval form or percentage field; photos load; prior-round photos/reports disappear on rework; completion verification sends the reviewed submission/version; empty change reasons do not submit; no horizontal overflow. No live work decisions were made.
- Automated accessibility scan reported no violations. One mobile select contrast check remained manual because its existing background arrow image prevents automated assessment; the rendered selector was visually checked.
- No dependencies added or API/schema changes in this manager monitoring update.
- Final production build passed. Vite retains its existing large-chunk advisory.

## Photo viewing follow-up

Change the existing evidence viewer to start with no selected photo and avoid automatically selecting a replacement on refresh. Keep photo buttons and authenticated loading on click. Verify initial zero image requests, click-to-view, close/refresh behavior, and current-round replacement, plus the focused shared execution tests and frontend build.

Photo viewing follow-up verified: 29 focused tests passed, frontend typecheck/build and diff checks passed. Synthetic browser checks confirmed no initial photo request, loading on click, remaining hidden after close plus refresh, no automatic replacement when a photo leaves the current round, and no mobile overflow. Independent read-only review found no additional auto-preview paths.

## Required-sections follow-up

Remove redundant accordions and optional hold initiation from the simplified manager panel; promote authorized setup/resume to contextual forms so existing work can proceed. Preserve history and existing review/version/permission safeguards. Update affected manager action tests; verify rendered normal-work and held-work states, then run focused tests and the frontend build.

Required-sections verification: 16 manager tests and 27 shared execution/manager routing tests passed. Browser checks confirmed Activity history is the only remaining secondary section, history loads on expansion, photos remain hidden until clicked, and an existing authorized manager hold exposes Resume work with a required reason. Desktop/mobile views were checked with no overflow. Diff checks passed. The first browser verification attempt timed out during automatic approval review before execution; one retry succeeded.
Final frontend typecheck and production build passed for the required-sections follow-up.
