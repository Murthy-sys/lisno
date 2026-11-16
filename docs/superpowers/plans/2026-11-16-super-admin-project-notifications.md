# Super Admin project notifications plan

1. Root: preserve initial dirty work; trace the route/service/UI mismatch and publish the notification-only contract.
2. Backend owner: update the two notification operation definitions, service-specific Super Admin scope, self read receipt, matching registry fixture/OpenAPI, and asymmetric authorization/pagination/read-state regressions. Preserve all other PM routes and shared project role defaults.
3. Frontend owner in parallel: PMNotifications and its tests only; explicit Super Admin admin-project destination and oversight wording, keep permission gate and read receipt.
4. Root: review integrated authorization and UI diff; independent review after writers complete; run appropriate backend/frontend tests and builds; restart only the owned local backend and verify GET read-only. Exercise synthetic browser list/dialog/navigation without changing real data. Record results.

## Completed

- Updated only the list and mark-read notification operations for Super Admin oversight; all other PM personal routes retain their existing restrictions.
- Added notification-specific Super Admin validation and delivered-event filtering. Existing projects are checked in one batch to avoid per-project authorization queries on every global notification poll. Normal recipient/project/vendor access checks remain unchanged.
- Kept actor-specific read state and transactional authorization/project fences. No schema or permission-code migration was needed.
- Added explicit Super Admin admin-project links and All projects dialog/empty-state wording.
- Backend: 74 tests passed (49 registry/OpenAPI, 17 workspace replica-set, 8 notification HTTP router); typecheck and production build passed.
- Frontend: 10 notification tests passed; TypeScript and production build passed. Existing bundle-size warnings remain.
- Independent backend integrity review found no actionable issues. Final git diff --check passed.
- Synthetic browser checks passed on desktop and mobile: cross-project list, unread badge, clicked-notice-only receipt, correct admin-project navigation, no PM workspace request, no document overflow or render errors. Screenshots inspected.
- Reproduced the original running API 403 before the change. Gracefully restarted the previously owned local backend supervisor after validation. The exact Super Admin GET /api/v1/project-manager/notifications?limit=25&offset=0 now returns 200 with private, no-store caching. Local notification scope is currently empty (total 0); the PM personal performance endpoint still returns 403 as intended.
- No real notifications were marked read, and no project decision, migration, deployment, or external message was performed. The read-only verification kept token material in process memory and emitted only response metadata.
