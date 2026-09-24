# Mobile profile tab, profile screen with photo, and minimal top bar — specification

Date: 2026-09-24
Status: Approved 2026-09-24 (revised D1: keep More "…" and add Profile after Messages; D2 = read-only name/email; D3 = build
photo backend now)
Classification: **High-risk in part.** It adds an authenticated file upload (profile photo), a new self-service
permission and route operations (authorization registry, OpenAPI, and mobile contract), and storage of personal
images. The mobile navigation and header changes are small.

## Goal

1. Add a **profile icon to the bottom bar, after Messages**.
2. Tapping it offers **Profile** and **Sign out**.
3. **Profile** shows the user's **name and email**, and lets them **add a profile photo**.
4. The **top bar** shows **only the Lisno logo** on the left and the **notification bell** on the right. Remove the
   "PLAN · TRACK · DELIVER" tagline, the name and role text, and the initials avatar.

## Current behavior and evidence

- **Bottom tabs** (`mobile/src/navigation/registry.ts:209–218`): Landing, then the permitted domain, then Messages if
  permitted, then **More** (`destination: null`).
  - They are rendered by `AdaptiveAppScaffold`: a floating capsule with 20pt icons, 44pt tabs, and a glass circle
    on the selected tab.
- **More screen** (`mobile/src/features/settings/MoreScreen.tsx`) holds:
  - the additional permitted workspaces (destinations not already shown as tabs)
  - an Account card with name and email
  - **Sign out** (`session.logout()`, then `/sign-in`)
- **Top bar** (`AdaptiveAppScaffold.tsx:115–136`) holds:
  - `LisnoWordmark` and the "PLAN · TRACK · DELIVER" tagline
  - the user's name and role
  - an initials avatar
  - the notifications button, which is kept
- **Avatar data:**
  - `User.avatar?: string` exists (`backend/src/models/User.ts:30`) and is passed through to `PublicUser`
    (`auth.service.ts:372`) and to the mobile `session.ts`.
  - **No endpoint writes it.** There is no upload, change, or remove path.
- **Permissions:** only `identity.self.read` exists for self-service. There is **no self-update permission**.
- **Upload patterns to reuse:**
  - `backend/src/storage/*`: managed storage and streaming with opaque references
  - `domain/project-chat-attachment-policy.ts`: checks a file's real type from its first bytes (signature) and
    limits its size
  - route-operation registry and OpenAPI sync
- **Libraries already present:**
  - `sharp` in the backend, for re-encoding, resizing, and stripping metadata
  - `expo-image-picker` in mobile, used by `platform/files/selection.ts`
  - so **no new dependencies**

## Proposed behavior

### A. Bottom bar: Profile tab (mobile)
1. **Decision D1 (revised by the user):** **add** a **Profile** tab directly **after Messages**, and **keep the More
   ("…") tab** as the last item. The order is Landing, the permitted domain, Messages (if permitted), Profile, More.
   More keeps its icon, label, destination behaviour, and screen, all unchanged from before this work.
2. Its icon is the user's **photo** in a 24pt circle if one is set, otherwise their **initials** in a sage circle.
   It follows the same 44pt tab, 20pt visual size, and glass-circle selection as the other tabs. The accessible name
   is "Profile".
3. **Tapping Profile** opens a compact **action menu**, an anchored sheet above the bar:
   - **Profile**: opens the profile screen.
   - **Sign out**: red text with a red outline, per the app-wide negative-action style. It runs the existing
     logout, then goes to `/sign-in`.
4. The menu closes on outside tap, back, or Escape.
5. The menu is focus-trapped, its items are announced, and it respects Reduce Motion.
6. The tablet rail gets the same Profile item, before More.
7. The dock keeps its existing capsule, 20pt icons, 44pt tabs, and glass selection. With five tabs it must still fit
   without clipping or overlap down to a 320pt width.
8. The Workspaces menu item from the first implementation is removed, because More is back.

### B. Profile screen (mobile)
1. The route is `/profile`, inside the scaffold.
2. It shows:
   - a large photo, 96pt, or initials
   - **name** and **email**, both read-only
   - the role label
3. The photo actions are **Add photo** or **Change photo**, and **Remove photo**, which is a red-outlined negative
   action with a confirm.
4. Add or change:
   - Uses `expo-image-picker`: library or camera, with square crop enabled on the phone.
   - Uploads to the backend.
   - Shows progress, a success toast, and an error message with a retry.
   - The session user is refreshed through `/auth/me`, so the tab icon updates.
5. Name and email editing is a **non-goal** (decision D2).

### C. Backend: profile photo (high-risk)
1. **New permission** `identity.self.profile_photo.manage`:
   - granted to **every role that has `identity.self.read`**
   - self-scoped: an actor can only change their own photo
   - Super Admin behaviour is `self`, matching the other self operations
2. **New route operations**, all authenticated and all added to the route-operation registry, OpenAPI, and the mobile
   contract provenance list:
   - `PUT /auth/me/profile-photo`: `multipart/form-data`, a single field `photo`.
   - `DELETE /auth/me/profile-photo`
   - `GET /users/:userId/profile-photo`: authenticated. It serves the image if the actor is the user or can already
     see that user through existing identity-read rules. Otherwise it returns 404, so the photo's existence is not
     revealed. For this change the phone only needs its **own** photo, via `:userId = self`. Exposing other users'
     photos is gated to what they can already see.
3. **Validation:**
   - Accepted: JPEG, PNG, or WebP, confirmed by the file signature, not the extension or MIME type.
   - Size: 5 MB or less.
   - Dimensions: 4096×4096 or less, to limit decompression bombs.
   - Anything else returns 400 or 413 with a safe message.
4. **Processing with `sharp`:**
   - Auto-rotate, crop to a centred square, and resize to **512×512**.
   - Re-encode as JPEG at about quality 82.
   - **Strip all metadata**, including EXIF and GPS.
   - The original is never stored.
5. **Storage:**
   - Uses the existing managed storage, with an **opaque key**.
   - The user record stores `profilePhoto: { storageKey, version, updatedAt }`.
   - The public user exposes only `profilePhotoVersion` (or null). It never exposes storage keys, paths, or signed
     URLs.
   - The existing loosely-typed `avatar` string is left untouched for compatibility.
6. **Consistency and cleanup:**
   - The new object is written first, then the user is updated with a compare-and-set on the version.
   - If the database update fails, the new object is deleted (compensating cleanup).
   - After the update succeeds, the previous object is deleted as best effort, and failures are logged as
     orphan-cleanup warnings.
   - DELETE clears the field, then removes the object.
7. **Audit** events: `identity.profile_photo.updated` and `identity.profile_photo.removed`. They record the actor, the
   target user (self), and the version, with no image data.
8. **Serving:** `Content-Type: image/jpeg`, `Cache-Control: private, max-age=…`, and an ETag based on the version.
   The phone requests `?v=<version>` so a change busts the cache.

### D. Top bar (mobile)
1. The left side shows **only the `LisnoWordmark`**, with the accessible name "Lisno". The tagline, the name and role
   text, and the initials avatar are removed.
2. The right side shows **only the notifications button**, which is unchanged.
3. The bar height tightens to fit: about 52pt plus the safe area.
4. The tablet rail and immersive mode are unchanged.

## Scope and non-goals

- In scope:
  - mobile: registry, scaffold (tab, top bar, menu), profile screen, image picking and upload, and tests
  - backend: permission, route operations, controller, service, storage, repository (memory and Mongo), OpenAPI,
    audit, and tests
  - the mobile contract and operations list
- Non-goals:
  - editing the name or email
  - showing photos elsewhere in the app, such as chat or the web UI. That is a follow-up.
  - web frontend changes
  - migrating old `avatar` strings

## Invariants

- Backend authorization is authoritative, and hiding things on mobile is presentation only.
- The route-operation registry, OpenAPI, and mobile provenance stay in sync.
- Uploads go only through authenticated endpoints with opaque storage references. The file type is checked by
  signature, and cleanup runs on failure.
- No image metadata is kept. No private URLs, storage keys, or tokens are exposed in responses, logs, or tests.
- Sign-out behaviour is unchanged.

## Risks

- **Permission change for every role:** misconfiguration could deny people the ability to change their photo, or
  expose other users' photos. Mitigation: asymmetric tests, where user A cannot change or read user B's photo unless
  already allowed, and Super Admin is self-only.
- **Storage orphans** if cleanup fails. Mitigation: the logged warnings and compensating-delete tests.
- **The mobile `contract-drift` test** already fails on an operation count of 224 vs 227. Adding 3 operations
  changes the count again. The work updates the provenance list for the 3 new operations and leaves the existing
  unrelated drift unchanged, reporting it separately.
- **Five tabs** on narrow phones. Mitigation: the tab gaps are already tight, and there is a 320pt layout check.

## Acceptance criteria

- AC1: The top bar shows only the Lisno logo and the notification bell. There is no tagline, name, role, or avatar.
- AC2: The bottom bar shows Profile directly after Messages, with the photo or initials, announced as "Profile".
  The More ("…") tab is still present, last, and behaves exactly as before.
- AC3: Tapping Profile opens a menu with only Profile and Sign out. Sign out
  logs out and routes to sign-in, and it is styled as a red-outlined negative action.
- AC4: The Profile screen shows the name, email, role, and photo or initials, with Add, Change, and Remove photo
  actions. Remove asks for confirmation.
- AC5: Upload:
  - A JPEG, PNG, or WebP of 5 MB or less is stored as a 512×512 JPEG with no metadata. The tab and profile update
    without restarting the app.
  - Invalid type, oversize, or over-dimension files are rejected with a safe message, and nothing is stored.
  - A failed database update leaves no orphaned object.
- AC6: Authorization:
  - Each user can manage only their own photo, and each role has the new permission.
  - Reading another user's photo returns 404 unless the actor can already see that user.
  - The registry, OpenAPI, and provenance are in sync.
  - Audit events are written.
- AC7: Tests pass:
  - backend focused tests, full typecheck, test, and build, plus a replica-set test for the CAS update
  - mobile typecheck, and the suite against the baseline
  - frontend typecheck, unchanged
  - `git diff --check`

## Open decisions

- **D1 — Profile vs More. Resolved by the user:** keep More ("…") and add Profile after Messages, for five tabs.
- **D2 — Editing.** *Recommended:* name and email are read-only; photo only. The alternative is to allow editing the
  name, which is a separate identity change.
- **D3 — Photo delivery.** *Recommended:* build the backend photo upload now, as in C. The alternative is to ship the
  tab, menu, profile, and header now with initials only, and do the photo as a separate high-risk change afterwards.
