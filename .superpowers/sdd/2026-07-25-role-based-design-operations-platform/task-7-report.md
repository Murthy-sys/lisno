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
