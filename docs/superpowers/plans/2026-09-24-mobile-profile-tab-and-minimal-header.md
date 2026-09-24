# Mobile profile tab, profile screen with photo, and minimal top bar — task plan

Spec: [2026-09-24-mobile-profile-tab-and-minimal-header-design.md](../specs/2026-09-24-mobile-profile-tab-and-minimal-header-design.md)
(approved; D1 = Profile replaces More, D2 = name and email read-only, D3 = build the photo backend now)

## Pre-flight facts

- Only the spec file is untracked, and every target file is clean in git. Snapshot `git status --short` and
  `git diff` again before writers start.
- **Backend:**
  - Permissions: `backend/src/domain/authorization.ts`. There is a permission list at line 48, and role grants are
    at lines 189 onward. `identity.self.read` is granted to every role.
  - Route operations: `backend/src/domain/route-operations.ts`.
  - OpenAPI: `backend/src/openapi.ts`. `avatar` appears at lines 1622 and 1827.
  - Auth routes: `backend/src/routes/auth.ts`, where `GET /auth/me` is at line 109.
  - Upload middleware to follow: `middleware/upload.ts` and `middleware/project-chat-upload.ts`.
  - Storage: `storage/managed-storage.ts`, `local-managed-storage.ts`, and `stream-file.ts`.
  - Signature policy example: `domain/project-chat-attachment-policy.ts`.
  - User shape:
    - `models/User.ts`
    - `repositories/types.ts` (lines 91, 724, 732, 926)
    - `repositories/memory.ts` and `repositories/mongo.ts`
    - `auth.service.ts` (`PublicUser`)
- **Mirrors that must stay in sync:**
  - `mobile/src/contracts/authorization.ts` (line 104) and `mobile/src/contracts/operations.ts`, which holds the
    provenance list and the drift check
  - `frontend/src/api/authorization-contract.ts` (line 104), which is checked by
    `backend/tests/frontend-authorization-contract.test.ts`
- **Relevant backend tests:**
  - `auth.test.ts` and `auth-authorization.test.ts`
  - `authorization-policy.test.ts` and `route-operation-registry.test.ts`
  - `api-docs.test.ts` and `frontend-authorization-contract.test.ts`
  - `super-admin-authorization.test.ts` and `development-demo-authorization.test.ts`
  - `managed-storage.test.ts`
  - the `project-chat-attachments*` tests, used as a pattern
- **Mobile:**
  - Tabs: `navigation/registry.ts:145` (`RootTabId`) and `:209–218` (`more`).
  - Scaffold: `navigation/AdaptiveAppScaffold.tsx`. The top bar is at lines 115–136.
  - Routes live in `mobile/src/app/`, including `more.tsx` and `_layout.tsx`.
  - Screens: `features/settings/MoreScreen.tsx`, `core/session/*`, and `platform/files/selection.ts`
    (expo-image-picker).
  - Tests:
    - `registry.test.ts`
    - `AdaptiveAppScaffold.test.ts` and `AdaptiveAppScaffold.ui.test.tsx`
    - `sessionManager.test.ts`
- **Baselines to record at the start of T6:**
  - backend: 4 known failures (design-workflow-initialization and 3 in full-journey)
  - mobile: typecheck 0, and `npm test` with 1 failure (`contract-drift`, 224 vs 227)
  - frontend: typecheck 0, and 17 known test failures
- **No new dependencies:**
  - backend: `sharp` and the existing multipart middleware
  - mobile: `expo-image-picker`, `react-native-svg`, and the Expo `Image` or RN `Image` components

## Shared contract (settled by T1; every slice follows it)

- **Permission:** `identity.self.profile_photo.manage`.
  - Granted to every role that has `identity.self.read`.
  - Super Admin gets it self-scoped.
- **Operations:**

  | Operation | Permission | Request | Response |
  | --- | --- | --- | --- |
  | `PUT /auth/me/profile-photo` | `identity.self.profile_photo.manage` | multipart, field `photo`, one file | `200 { user: PublicUser }` |
  | `DELETE /auth/me/profile-photo` | `identity.self.profile_photo.manage` | none | `200 { user: PublicUser }` |
  | `GET /users/:userId/profile-photo` | `identity.self.read` | optional `?v=` | JPEG bytes, or 404 |

  - `DELETE` is idempotent: it succeeds when there is no photo.
  - `GET` returns 404 for an unknown user, for a user with no photo, and for a user the actor cannot see.
- **`PublicUser`** gains an optional `profilePhotoVersion: number` (a positive integer), present only when a photo exists. It is omitted otherwise, because the mobile user parser is `.strict()` and older builds would reject an unknown field.
  - It is additive and optional on the web.
  - No storage key, path, or URL is ever returned.
- **Errors:**
  - `400 PROFILE_PHOTO_INVALID`: bad signature, bad image, or dimensions over 4096.
  - `413 PROFILE_PHOTO_TOO_LARGE`: more than 5 MB.
  - `409 PROFILE_PHOTO_CONFLICT`: the compare-and-set lost.
  - The messages are safe to show.

## Tasks (dependency order)

### T1 — Contract and authorization (AC6)
- Owner: **primary**. This is the shared contract.
- Files:
  - `backend/src/domain/authorization.ts`: the permission, plus grants to all roles that have `identity.self.read`
    and to the Super Admin self scope.
  - `backend/src/domain/route-operations.ts`: the 3 operations.
  - `mobile/src/contracts/authorization.ts` and `mobile/src/contracts/operations.ts`: the permission, the 3
    operations, and provenance.
  - `frontend/src/api/authorization-contract.ts`: mirror the permission only. There is no web UI.
- Tests: extend `route-operation-registry.test.ts`, `authorization-policy.test.ts`, and
  `super-admin-authorization.test.ts` with the grants and self-scope checks. The frontend and mobile contract mirror
  tests must pass.

### T2 — Backend photo service, storage, and routes (AC5, AC6)
- Owner: **backend slice**.
- Depends on: T1.
- Files:
  - `domain/profile-photo-policy.ts` (new):
    - detects JPEG, PNG, and WebP from the file signature
    - enforces the 5 MB and 4096 px limits
  - `services/profile-photo.service.ts` (new):
    - processes the image with `sharp`: `.rotate()`, a 512 cover crop, JPEG at quality 82, and no `withMetadata`
    - writes to managed storage under an opaque key
    - updates the user with a compare-and-set on the version, deletes the new object if that fails, and deletes the
      old object as best effort with a warning log that contains no key
    - writes the audit events `identity.profile_photo.updated` and `identity.profile_photo.removed`
  - `models/User.ts` and `repositories/types.ts`: add
    `profilePhoto?: { storageKey; version; updatedAt }`, plus the repository methods `setProfilePhoto` (CAS on the
    expected version) and `clearProfilePhoto`.
  - `repositories/memory.ts` and `repositories/mongo.ts`: aligned implementations, and `profilePhotoVersion` in the
    public mapping.
  - `services/auth.service.ts`, in `PublicUser`: add `profilePhotoVersion`.
  - Routes:
    - `routes/auth.ts`: `PUT` and `DELETE`, using the existing multipart middleware with a single file and the size
      limit.
    - the users route area: the `GET` serving route, with the visibility check reused from the existing identity-read
      rules and ETag, `Cache-Control: private`, and `image/jpeg` headers.
  - `openapi.ts`: the 3 operations and `profilePhotoVersion`.
- Tests:
  - `tests/profile-photo.test.ts` (new):
    - JPEG, PNG, and WebP are accepted, and the output is 512×512 with no EXIF. This uses a fixture with GPS EXIF
      that is generated in the test.
    - A bad signature, a renamed text file, more than 5 MB, and more than 4096 px are all rejected with nothing
      stored.
    - `DELETE` is idempotent.
    - A failed database update deletes the new object.
    - Replacing a photo cleans up the old object.
    - Audit events are written.
    - The response contains no storage key.
  - Asymmetric authorization:
    - User A cannot `PUT` for B, because the route is self-only.
    - A gets 404 on B's photo when A cannot see B, and 200 when A can.
    - An unauthenticated request gets 401.
    - Super Admin is self-only.
  - `tests/profile-photo-mongo.replica-set.test.ts` (new): a concurrent `PUT` race leaves one winner, a 409 for the
    loser, and no orphan.
  - `api-docs.test.ts` stays in sync.

### T3 — Mobile: top bar and Profile tab with menu (AC1–AC3)
- Owner: **mobile navigation slice**.
- Depends on: T1 (types only).
- Can run in parallel with T2 and T4.
- Files:
  - `navigation/registry.ts`: change `RootTabId` `more` to `profile`, with label "Profile" and
    `destination: null`. The extra destinations are still computed and exposed for Workspaces.
  - `navigation/AdaptiveAppScaffold.tsx`:
    - The top bar keeps only `LisnoWordmark` (accessibility label "Lisno") and the notifications button. Remove the
      tagline, name, role, and initials avatar, and tighten the height to about 52pt.
    - The Profile tab renders `ProfileAvatar` at 24pt inside the existing 44pt tab, with the glass selection.
    - Tapping it opens `ProfileMenu`.
    - The tablet rail gets the same item.
  - `navigation/ProfileMenu.tsx` (new):
    - an anchored sheet above the bar, with Profile, Workspaces (only when there are extras), and Sign out
    - Sign out has red text and a red outline, using the existing negative tokens
    - closes on backdrop tap and on hardware back
    - traps focus and respects `reduceMotion`
  - `navigation/ProfileAvatar.tsx` (new):
    - shared with T4
    - shows the photo when `profilePhotoVersion` is set, loading the authenticated
      `GET /users/{id}/profile-photo?v=` with the session auth header
    - otherwise shows initials in a sage circle
    - falls back to initials on an image error
- Tests:
  - `registry.test.ts`: the order is landing, domain, messages, profile, with no `more`.
  - `AdaptiveAppScaffold.ui.test.tsx`:
    - The top bar has no "PLAN · TRACK · DELIVER", name, or role, and does have "Lisno" and notifications.
    - The Profile tab opens the menu.
    - Workspaces is shown only when there are extras.
    - Sign out calls `logout` and routes to `/sign-in`.
  - `ProfileAvatar.test.tsx`: initials, photo, and the fallback on error.

### T4 — Mobile: profile screen and photo upload (AC4, AC5)
- Owner: **mobile profile slice**.
- Depends on: T1 (types only).
- Can run in parallel with T2 and T3. `ProfileAvatar` is owned by T3; T4 imports it after T3 lands, or uses the
  agreed props `{ user, size }`.
- Files:
  - `mobile/src/app/profile.tsx` (new route).
  - `features/profile/ProfileScreen.tsx` (new):
    - a 96pt avatar
    - name, email, and role, all read-only
    - Add or Change photo, with a choice of library or camera and a square crop
    - Remove photo, as a red-outlined negative action behind a confirmation dialog
    - progress, success, and error states with a retry
  - `features/profile/profilePhotoApi.ts` (new):
    - a multipart `PUT` and a `DELETE` through the existing authenticated transport
    - parses `{ user }`
    - on success, updates the session user so the tab and header refresh
  - `core/session/session.ts`: add `profilePhotoVersion: number | null` (optional-tolerant parse).
  - `platform/files/selection.ts`: add an image-only picker helper if needed, reusing the existing permission flow.
  - `mobile/src/app/more.tsx` and `MoreScreen.tsx`: kept for deep links and Workspaces. Remove the duplicate Sign out
    and Account card only if the tests show they are unreachable; otherwise leave them unchanged.
- Tests:
  - `ProfileScreen.test.tsx`:
    - renders the name, email, and role
    - Add opens the picker and uploads, and the session updates
    - Remove asks for confirmation before calling `DELETE`
    - shows an error and a retry
    - a cancelled pick makes no request
  - `profilePhotoApi.test.ts`: multipart form field `photo`, and error-code mapping.
  - `session` parse: parses with and without `profilePhotoVersion`.

### T5 — Integration review (AC1–AC6)
- Owner: **primary**.
- Depends on: T2, T3, T4.
- Checks:
  - Mobile request shapes and error codes match the backend.
  - The permission appears in every mirror.
  - Only the 3 new operations are in provenance, and the old drift is unchanged.
  - Nothing exposes a storage key, path, token, or personal data in logs or fixtures.
  - Dirty-path preservation holds.
  - Review the final diff.
  - Run `integrity_reviewer` in Mode A, or the equivalent sequential review in Mode B.

### T6 — Verification (AC7)
- Owner: **primary**, or `verification_runner` in Mode A.
- Depends on: T5.
- **Backend:**
  - `npm test -- tests/profile-photo.test.ts tests/route-operation-registry.test.ts tests/authorization-policy.test.ts tests/api-docs.test.ts tests/frontend-authorization-contract.test.ts tests/super-admin-authorization.test.ts tests/auth.test.ts`
  - `npm run typecheck`, then `npm test` compared to the baseline, then `npm run build`
  - the replica-set test. It needs a local replica set; report if it is unavailable.
- **Mobile:**
  - `npm run typecheck`
  - `npx jest src/navigation src/features/profile src/core/session src/contracts`
  - `npm test` compared to the baseline
- **Frontend:** `npm run typecheck`, plus the authorization-contract tests.
- `git diff --check` and `git status --short`.
- **Visual:** the user checks the top bar, tab, menu, profile, and upload in Expo. The backend must be restarted for
  the new routes. The native modules already exist, so no rebuild is needed.

## Parallelism

- T1 goes first, inline, because it writes the shared contract files.
- After T1, three slices have disjoint file ownership and can run in parallel:
  - T2: `backend/**`
  - T3: `mobile/src/navigation/**`
  - T4: `mobile/src/app/profile.tsx`, `mobile/src/features/profile/**`, `core/session/session.ts`, and
    `platform/files/selection.ts`
- The only coupling between T3 and T4 is the `ProfileAvatar` props `{ user, size }`, which are fixed above.
- T5 and T6 run sequentially on the integrated result.

## Out of scope and not performed

- No commits, pushes, deploys, seeds, or migrations. Existing users simply have no `profilePhoto`, so no backfill is
  needed.
- No web UI changes.

## Revision 1 — keep More ("…") and add Profile after Messages (spec D1 revised and approved)

T1, T2, T4 and the top-bar part of T3 are done and unaffected. The backend, the profile screen, photo upload and the
top bar do not change. Only the bottom-bar and menu part of T3 changes.

### R1 — Restore More as the fifth tab, and remove Workspaces from the menu (spec A1, A6–A8; AC2, AC3)
- Owner: a **single mobile navigation slice**. All the files are in `mobile/src/navigation/`, so this is not split.
- Files:
  - `registry.ts`:
    - `RootTabId` is `"landing" | "domain" | "messages" | "profile" | "more"`.
    - The tabs are in that order, and the `more` entry is restored exactly as it was (`{ id: "more", label: "More",
      destination: null }`).
    - Remove `additionalDestinationsForAuthorization`, which only the menu uses. MoreScreen keeps its own calculation.
  - `NavigationIcon.tsx`: restore the original `more` → "more" (…) mapping. The Profile tab keeps rendering
    `ProfileAvatar`, not an icon.
  - `AdaptiveAppScaffold.tsx`:
    - Render the five tabs, and the same five on the tablet rail.
    - The `more` prop and selection work exactly as before, and the `profile` prop still selects Profile.
    - Tapping More navigates to `/more` as before, and tapping Profile opens the menu.
    - Drop the `showWorkspaces` wiring.
    - Dock styling is unchanged: the capsule, 44pt tabs, 20pt icons, gaps and GlassSelection.
  - `ProfileMenu.tsx`: remove the Workspaces item and the `showWorkspaces` prop. The only items are Profile and
    Sign out.
- Tests:
  - `registry.test.ts`: the order is landing, domain, messages, profile, more; roles without Messages get landing,
    domain, profile, more.
  - `AdaptiveAppScaffold.ui.test.tsx`:
    - Five tabs, with Profile directly after Messages and More last.
    - More still navigates to `/more`, and the `more` prop selects it.
    - Profile opens the menu.
    - With a 320pt window width, all tabs render and none overlap: the dock's content width, 5 × 44 + 4 × gap +
      padding, fits inside the screen gutter.
  - `ProfileMenu.test.tsx`: only Profile and Sign out; no Workspaces.
  - `NavigationIcon.test.tsx`: the `more` fixture is restored.

### R2 — Review and verification (AC2, AC3, AC7)
- Owner: primary.
- Depends on: R1.
- Review: the diff from `master` for `registry.ts` and `NavigationIcon.tsx` should only add Profile. More must be
  byte-for-byte as it was.
- Checks:
  - `cd mobile && npm run typecheck`
  - `npx jest src/navigation src/features/profile`
  - `npx jest` compared to the baseline (only `contract-drift` fails)
  - `git diff --check`
- Visual: the user checks the five-tab dock in Expo.

### Parallelism
None. R1 is one small slice with a single owner, and R2 follows it.
