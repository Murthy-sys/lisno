# Task 7 Report: Frontend Authentication, API Client, and Responsive Shell

## Status

Complete. The frontend now provides typed API access, token-only session
restoration, role-aware protected routing, an accessible Lisno login screen,
and a responsive authenticated shell for all four role landing routes.

## Implemented

- Added a typed `/api/v1` fetch client with:
  - bearer-token attachment;
  - `{ data }` envelope unwrapping;
  - stable structured `ApiError` details and field errors;
  - pagination typing;
  - JSON `get`, `post`, and `patch`;
  - multipart upload support without forcing `Content-Type`;
  - authenticated blob downloads with response filename parsing;
  - token/session clearing on `401`;
  - no session destruction on `403`.
- Added `AuthProvider` and `useAuth()`:
  - persists only `lisno.auth.token`;
  - restores the user from `GET /auth/me`;
  - clears expired sessions;
  - exposes login, logout, restore, status, and current user.
- Added exact role-home mapping through one `roleHomePath(role)` function:
  - Designer: `/designer`
  - Design Manager: `/manager`
  - Design Head: `/head`
  - Client: `/client`
- Added protected authentication and role guards. Cross-role navigation returns
  a valid user to their own home and retains the valid session.
- Added a responsive navy/violet Lisno shell:
  - persistent desktop sidebar;
  - compact mobile header and modal drawer;
  - initial drawer focus, tab containment, Escape close, and trigger focus
    restoration;
  - semantic navigation, labels, ARIA state, and visible focus treatment;
  - explicit role landing content for later feature tasks.
- Added an accessible login screen with labeled fields, generic credential
  errors, field validation, password visibility control, loading state, and a
  one-click seeded designer demo-account helper.
- Added `AsyncState` and `StatusBadge`; statuses always include readable text,
  with optional reasons available to assistive technology.
- Added TanStack Query application providers and an MSW-backed test harness
  that resets server handlers and local storage between tests.

## TDD Evidence

The first focused run failed before production modules existed:

```text
Test Files  3 failed (3)
Error: Failed to resolve import "./client"
Error: Failed to resolve import "../api/client"
```

After implementation and root-cause fixes, the focused Task 7 run passed:

```text
Test Files  3 passed (3)
Tests       19 passed (19)
```

The final full frontend suite includes the updated application-entry
integration test:

```text
Test Files  4 passed (4)
Tests       20 passed (20)
```

Coverage includes invalid credentials, password visibility, demo credentials,
all four role redirects, session restore, expired-session cleanup, cross-role
denial, logout, mobile drawer focus/keyboard behavior, bearer headers,
structured errors, `401` versus `403`, pagination, multipart, and blob
downloads.

## Verification

Final commands executed from `frontend/`:

```text
npm run typecheck  -> PASS (exit 0)
npm test           -> PASS (20/20, exit 0)
npm run build      -> PASS (exit 0)
```

Production build output:

```text
dist/index.html                   0.44 kB │ gzip:   0.28 kB
dist/assets/index-D13HztyN.css   16.23 kB │ gzip:   4.70 kB
dist/assets/index-B3AY5f_h.js   373.71 kB │ gzip: 115.81 kB
```

`git diff --check` also completed without whitespace errors.

## Concerns and Follow-up

- No browser backend was connected in this workspace, so a rendered
  desktop/mobile visual pass could not be captured. Responsive breakpoints,
  drawer behavior, and keyboard/focus behavior are covered by CSS inspection,
  component tests, and the production build; live visual QA remains a
  follow-up when a browser is available.
- `npm audit --omit=dev` reports the current React Router 7.18.1 RSC-mode CSRF
  advisory (`GHSA-qwww-vcr4-c8h2`). This application is a browser SPA and does
  not use React Server Components or server actions. The registry currently
  has no published React Router version outside all advisory ranges; pinning
  7.11 would reintroduce multiple client-relevant redirect/XSS advisories, so
  7.18.1 is retained pending an upstream patched release.
- The untracked `reference_docs/` directory predated this task and is
  intentionally excluded from the Task 7 commit.

## Fix Round 1

Review follow-up hardened the session boundary and completed the requested
keyboard and validation coverage:

- Every API request now captures one token snapshot for both its bearer header
  and `401` handling. A delayed `401` only clears the session and emits
  `lisno:unauthorized` when that request token still matches storage, so an old
  user A response cannot log out a replacement user B session.
- Session restoration now uses an `AbortController`, generation guard, token
  snapshot, and mounted-state guard. Logout, login, a newer restore, and
  unmount supersede and abort older restores; stale successes and failures
  cannot commit state.
- `AuthProvider` now owns the TanStack Query session boundary. Logout, an
  accepted `401`, and token replacement cancel authenticated requests and
  clear cached user data. Login does not render the replacement user until
  that cleanup has completed.
- The mobile drawer test now proves both forward and reverse focus wrapping in
  addition to initial focus, Escape close, and trigger focus restoration.
- Invalid login submission now renders a named `role="status"` summary with
  `aria-live="polite"` and moves focus to the first invalid field in form
  order: email, then password.

### Fix-round TDD evidence

- Token/session concurrency: 3 intended regressions failed before the fixes
  (one stale-token `401`, two overlapping restore cases), then the combined
  API client, provider, and router slice passed 15/15.
- Cache isolation: all 3 new lifecycle tests failed before query cancellation
  and removal were implemented, then the provider slice passed 5/5.
- Login accessibility: both new summary/focus tests failed before the UI
  change, then the login and drawer slices passed 14/14.
- Production-StrictMode restoration and unmount-abort cases were added during
  diff review.
- The jsdom/MSW runtime combines a jsdom `AbortSignal` with Node's `Request`
  constructor, which rejects that cross-realm signal. The abort-sensitive
  tests therefore use a controlled `fetch` boundary while retaining the real
  API client and provider. They explicitly assert that superseded restore
  signals are aborted.

### Fix-round verification

Fresh final commands executed from `frontend/`:

```text
npm run typecheck  -> PASS (exit 0)
npm test           -> PASS (30/30, 5 files, exit 0)
npm run build      -> PASS (1946 modules, exit 0)
git diff --check   -> PASS
```

Production build output:

```text
dist/index.html                   0.44 kB │ gzip:   0.28 kB
dist/assets/index-0raCK5ms.css   16.34 kB │ gzip:   4.73 kB
dist/assets/index-DVdBmzWy.js   375.34 kB │ gzip: 116.35 kB
```

Live browser visual QA remains deferred for the same environment limitation
recorded above. The pre-existing untracked `reference_docs/` directory remains
untouched and excluded.
