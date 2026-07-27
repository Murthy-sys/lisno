# Design QA

## Deterministic review matrix

The prior API and Vite readiness checks returned HTTP 200. The current backend
bootstrap additionally requires a successful Mongo replica-set connection
before it listens. The browser-control runtime reported that no browser binding
was available in this execution environment, so viewport screenshots could
not be captured here. The matrix below is the prepared review plan; automated
accessibility coverage was run in its place.

| Viewport | Routes reviewed | Interactions covered | Result |
| --- | --- | --- | --- |
| 1440 × 900 | `/login`, `/designer`, `/manager`, `/head`, `/client` | Sign-in fields, named navigation, project cards, manager/head expansion, client approved-plan actions | Prepared; screenshot review blocked by unavailable browser binding. |
| 390 × 844 | `/login`, `/designer`, `/manager`, `/head`, `/client` | Mobile navigation, keyboard focus, disclosure controls, project cards, client plan actions | Prepared; screenshot review blocked by unavailable browser binding. |

## Accessibility checks

- Login fields have visible labels and the password visibility control has a
  pressed state and keyboard activation.
- Every role home exposes a named primary navigation landmark and a main
  content landmark.
- Progress controls carry text labels; risk/status labels pair text with their
  color.
- The workspace smoke test opens disclosure controls, verifies an upload
  dialog's focus and Escape restoration, exercises the mobile navigation, and
  runs `axe-core` (with color-contrast disabled because JSDOM cannot calculate
  rendered contrast).
- Client content excludes draft/internal versions, KPI, and evaluation data.

## Evidence

Automated role-home and interaction accessibility smoke test:
`frontend/src/test/accessibility.test.tsx`.
Automated cross-role journey (including draft/internal and cross-client denial):
`backend/tests/full-journey.test.ts`.
Final commands and test totals are recorded in the Task 11 report.
