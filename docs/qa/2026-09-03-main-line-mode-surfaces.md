# Main Line Mode Surfaces rendered QA — 2026-09-03

## Gate status

**Complete.** Every required surface - the Mode Surfaces panel, the reusable-values Surface
management list, and the Add/Edit Surface dialog - was measured in a real browser at its true
CSS width, with axe, page-overflow, touch-target, keyboard, coarse-pointer, and reduced-motion
evidence. Three rendered-only defects were found and fixed. Remaining gaps are listed under
[Not covered](#not-covered).

## Runtime under test

- Branch: `feature/phase1_module1`, dirty working tree (this change is uncommitted).
- Harness: `frontend/qa/main-line-surfaces.html` → `src/test/fixtures/surfaceQaEntry.tsx`,
  following the existing `qa/ui-foundation.html` and `qa/super-admin-dashboard.html` convention.
  It stubs `window.fetch`, so no backend, database, seed, or login is involved.
- Server: `vite` dev server on `http://localhost:5199/` (frontend only), stopped after the run.
- Browser: installed Google Chrome, headless, driven over the DevTools Protocol from a Node
  script using the built-in `WebSocket` client. No dependency was installed, and neither
  workspace's `package.json` or lockfile was touched.
- Viewport control: `Emulation.setDeviceMetricsOverride`. Chrome's `--window-size` clamps at
  500 px, so the 390 px and 320 px rows in an earlier run were not real; every row below is
  confirmed by the viewport width the page itself reported.
- Screenshots and JSON reports: kept in the session scratchpad only, not in the repository.

## Matrix

12 states × 6 viewports = 72 renders (48 panel and dialog, 24 management). Each render reports its own viewport width,
`documentElement.scrollWidth`, every interactive element smaller than 44 px, and axe violations
(`color-contrast` disabled, as in the repository's other axe checks).

| State | What it shows |
| --- | --- |
| `panel` | Saved selection, multiple units, long Surface name |
| `panel-loading` | Initial catalog load, controls disabled |
| `panel-error` | Catalog failure with Retry |
| `panel-empty` | No Surfaces added |
| `panel-stale` | Cached values with a refresh failure and Retry |
| `panel-retained` | Retained inactive value, unresolved value, save error, dirty |
| `panel-readonly` | Read-only revision, no mutation actions |
| `dialog-add` | Add Surface dialog (quick-add copy) |
| `dialog-edit` | Edit Surface dialog on a saved record |
| `management` | Configuration → Surfaces list, reached by clicking the Surfaces tab |
| `management-empty` | Surfaces list with no records |

Viewports: 1440×900, 1024×768, 768×1024, 720×450 (the 1440 px at 200 % zoom equivalent),
390×844, 320×640.

**Result: 72 of 72 clean** — no page-level horizontal overflow at any width, no axe violations
in any state, and no Surface control below 44 px after the fixes below.

The management list confirms its responsive contract in the browser: the Surface table computes
`display: table` at 1440, 1024, 768, and 720 px, and `display: block` (stacked cards) at 390 and
320 px, with no horizontal overflow in either form.

### Findings fixed during this run

Both are layout defects that jsdom tests cannot catch, because jsdom does not compute layout.
`src/features/ai-estimator-knowledge/knowledgeSurfaceTouchTargets.test.ts` now guards the CSS
floors that fix them.

1. **Panel Retry actions were 36 px tall** in `panel-error` and `panel-stale`, at every viewport.
   Fixed with `min-block-size: 44px` on buttons inside `.knowledge-mode-surfaces__state`.
2. **Surface management row actions were 36 px tall** — Edit, Activate/Deactivate, and Archive on
   every row, at every viewport. Fixed with the same floor on `.knowledge-surface-table .ui-button`.
   Re-measured: 0 of 12 row actions under 44 px at all six viewports.

A third defect was in the harness, not the product: the previous run's report element stayed in
the DOM during the next axe scan, outside the page landmarks, and raised axe's `region` rule
against my own scaffolding. The report is now removed before scanning, and axe is clean.

## Dialog behaviour (real browser)

| Check | Observed |
| --- | --- |
| Add Surface initial focus | `surface-name` |
| Submit with no name | Focus moves to `surface-name`; "Enter a Surface name." and "Select at least one Typical unit." both shown |
| Duplicate name from the server | "A Surface with this name already exists." attached to the name field |

## Coarse pointer and reduced motion (390×844, touch emulation on)

| State | `pointer: coarse` | `prefers-reduced-motion: reduce` | Result |
| --- | --- | --- | --- |
| Mode Surfaces panel | matches | matches | Every transition and animation duration collapses to ~0s; no target under 44 px; axe clean |
| Surfaces management list | matches | matches | Same |

## Keyboard trace (real browser, 390×844)

| Step | Observed |
| --- | --- |
| Tab into the panel | Focus lands on the Applicable surfaces trigger |
| Enter | Listbox opens; focus moves to the Search surfaces field |
| ArrowDown | Focus moves into the option list with roving focus |
| End | Focus jumps to the last option |
| Escape | Listbox closes and focus returns to the trigger |
| Add Surface dialog | Initial focus is the Surface name input |

## Out of scope, reported not fixed

The shared reusable-values page chrome sits below 44 px for **every** master type, not just
Surfaces: the page-header "Back to knowledge base" and "Add …" buttons render 38 px tall, and the
master-type tabs (UOMs, Vendors, Taxes, Priorities, Surfaces) render 40 px. These come from the
shared `Button` and tab styles used across the application, so raising them is a design-system
change affecting every page and was not made under this task. The Surface-specific controls -
selector trigger, listbox options, row actions, dialog fields, quick-add, and state Retry - all
meet 44 px.

The visually hidden "Return to AI estimator knowledge base" skip link measures 1×1 px by design
and is not a pointer target.

## Not covered

- **Assistive-technology behaviour.** Roles, names, and axe rules are verified, but no screen
  reader was driven; announcement order and verbosity remain unverified.
- **Real touch hardware.** Coarse pointer was emulated through the DevTools Protocol, which
  exercises the media queries but not physical hit-testing.
- **The authenticated application shell.** The harness stubs `/auth/me` and `/auth/authorization`
  and renders the pages directly, so navigation, route guards, and shell chrome around these
  screens are covered by their own tests rather than by this matrix.
