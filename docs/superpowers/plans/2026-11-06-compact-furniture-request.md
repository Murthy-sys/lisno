# Compact furniture-request implementation plan

Date: 2026-11-06
Status: Complete. Approved and implemented in Mode A; AC1–AC4 verified.

Source of truth: [Approved specification](../specs/2026-11-06-compact-furniture-request-design.md). AC1–AC4 below refer to that specification.

## Scope and ownership

Product edits are limited to:

- `frontend/src/features/workflow/ExistingFurnitureWorkflow.tsx`: an action-specific class for the furniture-request panel and existing compact button props if useful.
- `frontend/src/features/workflow/existingFurnitureWorkflow.css`: locally scoped typography, checkbox, label-row, spacing and footer sizing.

Both files are currently clean. Preserve all existing uncommitted Client, Sales, recommendations and measurement changes. Shared `Checkbox`, `ContextPanel`, `Drawer`, global styles, API types and backend sources are outside the write scope. No dependency, lockfile, persistence, email configuration or server restart is required.

The primary agent owns baseline capture, the documents, final integration and results. After Mode A is selected, one frontend writer owns both product files; an independent read-only reviewer may inspect the existing CSS cascade and prepare visual comparison criteria in parallel. Product implementation is not split between competing writers. Review/verification of the integrated result follows completed edits. In Mode B, perform all work inline.

## T1. Capture the baseline

Owner: primary. Dependency: approved plan and execution-mode choice.

- Capture dirty paths, relevant diffs, target contents and hashes of unrelated pending work in a temporary directory.
- Inspect the request panel at desktop and approximately 390px widths using controlled synthetic data. Record computed heading/label/button fonts, checkbox dimensions, row hit areas and footer layout.
- Record a representative non-request furniture panel and unrelated drawer/checkbox for comparison.
- Check CSS layer/specificity interactions so compact overrides take effect without changing shared primitives.

Keep only one parent task in progress. In Mode A, independent read-only cascade/comparison preparation can accompany baseline capture; no product writer starts before its ownership and baseline are clear.

## T2. Apply the scoped compact presentation

Owner: frontend writer in Mode A; primary in Mode B. Dependency: T1. Covers AC1–AC4.

- Add a presentation class to `ContextPanel` only when `action.id === "furniture_request"`; use the existing class forwarding to the portalled drawer.
- Set approximately 18px heading, 11px eyebrow, 13–14px body/room labels and 13px button text while preserving theme colors and font family.
- Set checkbox visual and minimum inline/block dimensions to approximately 18px; prevent flex stretching/shrinking and align the box with the label. Do not use transform scaling.
- Preserve the whole label as the hit area: compact desktop rows around 28–32px and at least 44px rows for narrow/touch layouts, including coarse-pointer devices at larger widths.
- Tighten scoped header/body/footer padding to 12–16px and room gaps to 6–8px. Keep safe-area padding, long-name/title/action wrapping and accessible footer controls. Target 36px desktop buttons and at least 44px touch buttons.
- Preserve form state, IDs, handlers, validation, payloads, focus behavior, disabled/busy states and discard confirmation. Keep the existing full-height side-panel placement/width/scrolling.

Do not edit the shared checkbox sizing or global drawer rules. If a necessary change extends beyond the two owned files, report the concrete dependency before expanding write ownership. A test-file change is justified only by a meaningful interaction risk, not to assert CSS strings.

## T3. Review and verify

Owner: primary, with independent read-only review/verification in Mode A. Dependency: T2 complete. Covers AC1–AC4.

From `frontend/`:

```sh
npm test -- src/features/workflow/ExistingFurnitureWorkflow.test.tsx
npm run typecheck
npm run build
```

Rendered verification on the actual components with synthetic API responses:

| Criteria | Check |
| --- | --- |
| AC1 | Computed styles confirm compact fonts and approximately 18px checkbox width/height, including minimum dimensions. Existing palette/family remain intact. |
| AC2 | Click the room label and use Tab/Space; verify checked/unchecked, disabled/busy and visible focus states. Measure desktop and touch label/button targets. |
| AC3 | Inspect desktop and approximately 390px mobile with the screenshot's two rooms, long names and enough rooms to require scrolling. Verify title/button wrapping, reachable Close/Cancel/submit, and no horizontal overflow. |
| AC4 | With synthetic requests, verify selected room IDs, required-selection validation, Cancel/Close, dirty discard and focus return. Compare non-request furniture forms and an unrelated shared drawer/checkbox against baseline. |

Run an accessibility check on the rendered request panel. Inspect screenshots as well as computed dimensions. The real open user panel may be inspected read-only after HMR, but do not submit its request or discard an existing user draft. Backend, OCR and full-workspace test suites are unnecessary for this scoped visual change. No lint script exists.

Fix confirmed scope-related issues and repeat only affected checks. Any browser fixture, temporary route or test server must remain isolated from the user's active backend and SMTP services.

## T4. Reconcile and hand off

Owner: primary. Dependency: T3.

- Run `git diff --check` and review final status/diffs; compare protected files with baseline hashes.
- Record exact checks/results, computed dimensions, responsive/accessibility evidence and remaining limitations here.
- Stop only task-owned test servers/browser sessions and remove task-created fixtures/screenshots. Preserve the user's running local services and existing drafts.
- Report changed files and outcome. No commits, pushes, deployment, migrations, dependencies or external actions are included.

## Progress

- Specification: approved by the user.
- Task plan: approved by the user.
- Execution mode: A, parallel sub-agents.
- T1 complete: clean target copies/diffs and all 51 pre-existing dirty paths recorded in `/private/tmp/lisno-compact-furniture-baseline`; protected hashes captured. QA uses isolated original source/CSS copies for baseline rendering, independent of the writer. Cascade inspection confirms feature styles can override the shared layered defaults locally.
- T2 complete: request-only class and scoped compact CSS added in the two owned product files; all form logic unchanged.
- T3 complete: focused tests, typecheck, build and isolated rendered checks passed; details below.
- T4 complete: temporary fixtures, screenshots, browser session and isolated server removed; final hash comparison found no unrelated edits. Only the two intended product files became newly dirty.


## Integrated verification results

Product changes are restricted to the two owned files: a request-only `ContextPanel` class and scoped density rules. Form state, handlers, API payloads and shared primitives remain unchanged. No dependencies were added.

| Acceptance criterion | Verified result |
| --- | --- |
| AC1 | Actual rendered component with the app cascade declaration and loaded Poppins fonts: heading 18px, eyebrow 11px, body/room labels 14px, buttons 13px; checkbox visual and minimum dimensions 18×18px. Olive theme retained. |
| AC2 | Label click, Tab/Space selection, checked/unchecked, disabled/busy behavior and visible settled keyboard focus passed. Desktop row/button targets 32/36px; narrow viewport and 1440px coarse-pointer targets 44/44px. |
| AC3 | Desktop 1440px and mobile 390px screenshots reviewed after drawer animation settled. Drawer width remains 480/390px; Close/submit/Cancel stay inside the viewport. Long heading/action and 40 long room names wrap and scroll without horizontal overflow. |
| AC4 | Synthetic request validation, exact selected room IDs, submit payload, dirty confirmation, Keep editing/discard and focus return passed. Non-request furniture review and unrelated shared drawer match their baseline: 24px heading, 44px checkbox/button. No real request was submitted. |

Commands executed from `frontend/`:

- `npm test -- src/features/workflow/ExistingFurnitureWorkflow.test.tsx`: **6 tests passed**, 1 file.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**; existing Vite large-chunk advisory remains.
- Rendered Chromium accessibility scan: **0 axe violations**. Isolated harness used actual components and synthetic API data; no live workflow data was changed.
- `git diff --check`: **passed**. Hash comparison confirms all unrelated existing dirty files and protected shared files unchanged.

Full frontend/backend/OCR suites were intentionally not run for this scoped visual change. The repository has no lint script. No deployment, commits, migrations, email actions, dependency changes or user-service restarts occurred. User drafts were not opened or submitted. The user's existing local email-enabled services remain running.

Temporary baseline/QA reports were stored in `/private/tmp/lisno-compact-furniture-baseline` and removed after final reconciliation; task-only browser screenshots were reviewed under `frontend/output/playwright/compact-furniture/` and removed. Temporary harness files and the isolated test server/browser were cleaned up. Build output is ignored under `frontend/dist/`.
