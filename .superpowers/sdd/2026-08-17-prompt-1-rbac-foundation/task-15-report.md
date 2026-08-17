# Task 15 report — User administration interface

## Scope

- Plan task: Task 15 only.
- Base HEAD: `3614c410804ddd0f00cd90781ecbaa169a6ea1ea`.
- Commit: this commit, subject `feat: add user administration interface`.
- Added the typed Admin users API, redacted paginated directory, canonical server-side filters, and one-field role/status mutation dialog.
- Replaced only the `/admin/users` staged element. `/admin/access-requests` and `/access-requests/mine` remain staged for Task 16. No staff creation, invitation, impersonation, password, Client, Prompt 2, or later-phase behavior was added.

## Directory and API behavior

- `GET /admin/users` query parameters are emitted in the canonical `search`, `role`, `active`, `limit`, `offset` order. Empty filters are omitted, search is trimmed, and every filter change resets the offset to zero.
- The directory uses React Query pagination and the existing loading, error, empty, surface, field, badge, and button primitives. It renders only the redacted DTO fields: name, email, optional title, role, active state, timestamps, and the Manage action.
- The server-provided `manageableRoles` array is the sole role filter/dialog option source. The UI has no broader client-maintained destination allowlist.
- `PATCH /admin/users/:userId` accepts a discriminated input that can carry exactly `version + role` or `version + active`; tests assert the other mutable field is absent.

## Mutation and concurrency behavior

- Role changes and activation/deactivation require an explicit user action. Deactivation adds a separate confirmation that states grants are revoked immediately while assignments remain unchanged.
- Successful deactivation reports the returned revoked-grant count and every nonzero retained-responsibility count without claiming reassignment.
- `RESPONSIBILITY_REASSIGNMENT_REQUIRED` and `LAST_SUPER_ADMIN` display the server message and keep the dialog open without replay.
- `VERSION_CONFLICT` invalidates/refetches the directory but never replays the mutation. A refreshed row resets the choice and requires a new explicit action. If the row leaves the active filter, the original dialog identity stays visible, mutation controls fail closed, and the user is instructed to close and locate the account again; no stale version is resubmitted and no false “latest loaded” state appears.
- During a pending PATCH, role/status controls, Cancel, close, backdrop/Escape, and confirmation transitions are blocked. The deactivation confirmation remounts with focus inside it; Escape/Cancel returns to the main dialog, and final close restores the Manage trigger.

## TDD evidence

Initial RED:

- The two literal MSW suites failed before production implementation: 2/2 files failed and all 9 planned cases failed because `/admin/users` still mounted the staged page and made zero GET/PATCH requests.

Review-regression RED:

- Three focused regressions failed before their fixes: a filtered-out version conflict closed the dialog, the deactivation confirmation left focus on `body`, and a pending PATCH left alternate Cancel/status transitions enabled.

Focused GREEN:

- Admin page and mutation dialog: 2/2 files, 12/12 tests passed.
- Router and accessibility: 2/2 files, 78/78 tests passed.
- Frontend `npm run typecheck`: passed.
- `git diff --check`: passed during self-review.

## Final verification

Exactly one fresh full frontend suite after self-review:

- Frontend `npm test -- --reporter=dot`: 70/70 files, 738/738 tests passed in 11.03 seconds.
- Frontend `npm run typecheck`: passed before the fresh full suite.
- Scope search confirms both Task 16 access-request routes remain staged and the production Task 15 UI contains no create/invite/impersonation/password functionality.

## Concerns and boundaries

- If a concurrent change removes the selected user from the current filtered page, no dedicated by-id endpoint exists in the approved Task 15 API. The UI therefore deliberately fails closed and asks the operator to relocate the account rather than trusting or replaying stale data.
- Backend authorization, target visibility, destination eligibility, optimistic version checks, last-Super-Admin protection, grant cleanup, and responsibility enforcement remain authoritative; the frontend only presents their returned DTOs and errors.
- The router test fixture was updated solely because `/admin/users` now performs its real GET during existing route tests; it grants no new production behavior.
