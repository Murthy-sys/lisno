# Super Admin Users: location

Date: 2026-11-25
Status: Implemented in approved Mode A. Integrated tests, builds, rendered checks and live local API verification passed. See the task plan for evidence and unrelated baseline test limitations.

## Goal

Allow Super Admin to enter a user's Location when inviting a new user, see it in the Users tab, and add, update, or clear it for an existing manageable user. Persist the value through the backend and reloads.

## Current behavior and evidence

- `frontend/src/features/admin/UserDirectoryPage.tsx` renders the Users directory and Details panel. Neither includes location. Existing non-Super-Admin accounts open `UserMutationDialog.tsx`, which currently updates one role or active-status setting at a time.
- New users from this screen are created through `InviteUserDialog.tsx` and `POST /admin/user-invitations`. The UI and API serializer currently send name, email, role and mobile. User creation occurs when the invitation is accepted.
- `backend/src/routes/admin-users.ts` validates PATCH requests as a strict union of `{ version, role }` or `{ version, active }`. `user-administration.service.ts` enforces Super Admin authority, target visibility, version checks, transactions, audits and immutable Super Admin protection.
- `backend/src/models/User.ts` and `repositories/types.ts` have mobile and address but no location. Address is a different field and is not a reliable source for location.
- `UserInvitation.ts`, invitation route validation, service input parsing, repository records and explicit serialization also lack location. Invitation acceptance explicitly constructs the new user, so it must copy location.
- Memory and Mongo repositories both explicitly create/map/update user records and invitation records. Updating only a model or form would lose the value on one or more paths.
- The initial `git status --short` for this request was clean. Recheck before implementation; do not overwrite changes introduced meanwhile.

## Scope and assumptions

- Location means a human-entered city or area, for example `Bengaluru` or `Whitefield, Bengaluru`. Use a single-line text field labelled **Location**, with the hint **City or area**.
- The field is optional for both new and existing users. This avoids blocking old accounts and existing invitation clients. A missing value displays **Not set**.
- This is user profile metadata, separate from project location, procurement city, user address, assignments and permissions. Do not infer or synchronize it from those fields.
- Existing new-user eligibility remains unchanged. The Users screen continues using invitations; this change does not introduce direct user creation, Client signup, a new role, or a new assignment flow.
- Existing Super Admin account immutability remains in effect. Its location may be displayed if present, but this feature does not enable editing that protected account.

## Requirements

### UI

1. Add Location to the Invite user form using the current field and panel components. Include it in dirty tracking, submission serialization, field errors and keyboard focus order. Keep input intact when submission fails.
2. Show Location in the Users table and user Details panel. Use **Not set** when absent, including older backend records. Preserve usable table scrolling and readable long values at narrow widths.
3. Add a prefilled Location field and explicit **Save location** action to the existing Manage user panel. Permit filling, changing and clearing the value without changing role or status.
4. Save only the selected operation. Prevent another operation from silently discarding an unsaved role or location change, and include location edits in the panel's unsaved-change protection and deletion guards.
5. Disable duplicate submission while saving and show clear success/error feedback. On success, refresh the affected directory/detail caches so the saved value is visible immediately and after a reload. Preserve existing dashboard invalidation where shared mutation handling requires it.
6. Handle validation failures inline. Retain input on ordinary failures; handle version conflicts using the existing refresh-and-review behavior without silently overwriting a concurrent edit. Disable editing if the account is stale, deleted, unavailable or protected by current rules.
7. Include location in authenticated invitation administration responses so the value remains available alongside the invitation. Show it in the existing invitation details surface when one is present; do not add a separate management screen or an edit-pending-invitation workflow.

### Backend and data contract

1. Add `location?: string | null` to persisted user and invitation records for compatibility with historical data. Canonical writes use a trimmed string or `null`; read mappers normalize missing values to `null` in administrative DTOs.
2. Validate the same rules in request/service boundaries and persistence: trim surrounding whitespace, allow ordinary Unicode city/area names, reject control characters and non-string values other than `null`, and limit the normalized string to 120 characters. Empty/whitespace-only input normalizes to `null`.
3. Extend `POST /admin/user-invitations` with optional `location`. Persist it in the invitation and copy it into the User during acceptance. Existing requests, pending invitations, automated vendor invitations and resend flows that omit the field must remain valid. Resend preserves the stored value.
4. Extend the existing `PATCH /admin/users/:userId` contract with a third strict branch: `{ version: positiveInteger, location: string | null }`. Keep role, active status and location as separate requests; reject combined operations or unknown fields. The UI sends `null` to clear the field. Existing role/status requests preserve saved location.
5. Update user and invitation repository types, memory and Mongo creation/read/write paths, administrative DTO mappings and frontend API types/serializers together. Use stable user IDs throughout.
6. Keep the current user-version comparison and transaction behavior. A successful changed-location write increments the normal user version and updates `updatedAt`. An unchanged normalized value is a no-op, with no redundant audit or version increase. A stale version still fails.
7. Record changed locations through the existing audit mechanism with a dedicated `user.location_updated` action, actor ID, target ID, timestamp, versions and old/new location. Preserve transactional rollback if audit persistence fails.
8. A location-only change must not alter `sessionVersion`, log users out, revoke project grants, change role/status/vendor membership, reassign responsibilities or touch project records.
9. Add accurate OpenAPI request/response documentation. Keep route-operation authorization aligned with the existing operations; no new permission or endpoint is required.

## Authorization and privacy

| Actor/target | Behavior |
| --- | --- |
| Authenticated active Super Admin, existing manageable non-deleted user | Read and update location, including an inactive target |
| Sole Super Admin target | Existing immutable-account rejection and hidden Manage action remain |
| Other roles or unauthenticated requests | Existing administrative authorization rejects the operation |
| Missing/deleted target or stale version | Existing not-found/conflict behavior remains |

Keep location within administrative user/invitation projections for this scope. Do not add it to public invitation inspection, invitation email content, authentication tokens, generic public user projections or logs. Existing email preflight, token handling, invitation verification and acceptance atomicity remain unchanged. Disabled/unavailable mail must continue producing no invitation/token/audit/email writes.

## Compatibility and rollout

- No migration, seed or backfill is required. Older users and invitations remain valid without location.
- Omitted location in an invitation means unset; omission from unrelated user mutations preserves the current value. Never manufacture a location from address or project data.
- Backend acceptance must be available before an updated frontend sends location. Verify the running local backend contract during implementation so a stale process does not reproduce the earlier unknown-field problem.
- Local verification may use isolated test databases and mocked mail. Do not create real invitations or submit changes to real user accounts as a test.
- Deployment, commits, pushes, production mutations and live migrations are outside this request. A later rollback must preserve stored location and pair compatible frontend/backend versions.

## Risks and controls

- **Dropped metadata:** explicit serializers and repository mappers need end-to-end coverage from invitation to accepted User and from PATCH to directory reload.
- **Accidental access change:** extend the strict mutation union without combining access and profile edits; verify session/grant/assignment state is unchanged.
- **Concurrent edits:** preserve version checks and require review of refreshed values after a conflict.
- **Broken older invitations:** make the additive field optional and cover acceptance/resend without it.
- **Wider data exposure:** retain administrative projections; do not expand public identity data.
- **Runtime mismatch:** check the live local schema after implementation, as well as source tests.

## Acceptance criteria and verification

1. **New user persistence:** inviting with Location stores the normalized value; acceptance creates the user with that value; Users table and Details show it after refetch/reload. Test two distinct invitation/user identities and locations to catch incorrect mapping.
2. **Existing user editing:** a user without location can receive one; an existing value can be changed and cleared. Saving one user does not change another. Unrelated role/status writes retain location.
3. **Validation and compatibility:** omitted historical data and old requests remain valid. Empty input clears; values over 120 characters, control characters and invalid types are rejected consistently. Combined mutation fields remain rejected.
4. **Access and integrity:** unauthorized callers, immutable Super Admin, deleted targets and stale versions retain their existing protections. Successful location changes are audited, preserve sessions/grants/responsibilities, and roll back with failed audits. Unchanged values are no-ops.
5. **Invitation safety:** resend preserves location, old invitations still accept, and disabled/unavailable mail retains the existing no-write guarantee. No real email is sent during tests.
6. **UI behavior:** accessible labels, keyboard submission, prefilled values, dirty-state protection, loading/disabled states, errors and conflict recovery work at desktop and mobile widths. Successful saves refresh displayed data without losing another operation's unsaved edits.
7. **Integrated validation:** run focused user administration/invitation/repository/model and frontend dialog/directory/API tests, including replica-set tests for changed transactional Mongo paths; run frontend/backend typechecks and builds, rendered interaction/accessibility checks and repository hygiene checks. Record exact results and any unrelated baseline failures. There is no lint script.

## Open decisions

No blocking decisions. Optional single-line city/area text is the proposed default; no controlled location catalogue, geocoding, GPS, location filter, self-service profile editor or unrelated screen redesign is included.

## Workflow state

Specification and task plan approved; Mode A selected. Implementation and verification complete. [Execution record](../plans/2026-11-25-super-admin-user-location.md).
