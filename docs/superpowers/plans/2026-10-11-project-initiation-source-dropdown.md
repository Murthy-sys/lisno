# Project initiation Source dropdown: task plan

Date: 2026-10-11
Status: Specification and task plan approved by the user; Mode A selected. T1–T5 completed and locally verified on 2026-10-11.

Source of truth: [approved specification](../specs/2026-10-11-project-initiation-source-dropdown-design.md).

## Scope and baseline

Replace the optional Source text input in the shared Initiate project side panel with the approved 13-option dropdown and conditional Other source input. Keep the existing optional string API contract and both Sales/Sales Manager flows.

Initial dirty-path set: only the untracked specification above. Product sources are clean. Recheck status and target diffs before implementation and preserve unrelated changes. No backend, database, dependency, global-style, lead-editing, deployment, commit, or push work is included.

## Tasks and ownership

Keep one parent task in progress: Source dropdown. After plan approval and execution-mode selection, complete these tasks in order. In Mode B the primary performs all tasks inline. In Mode A the primary and one bounded implementation agent may split T2 and T3 after T1 establishes their shared contract; do not create overlapping writers.

| Task | Ownership and affected areas | Depends on | Acceptance |
| --- | --- | --- | --- |
| T1: Confirm baseline and control contract | Primary: this plan, current dialog and tests inspection | Approved plan and A/B choice | AC1–6 |
| T2: Implement dropdown and custom-source handling | Primary: `frontend/src/features/admin/AdminProjectInitiationDialog.tsx` only | T1 | AC1–4 |
| T3: Update focused regression coverage | Mode A frontend implementer: `frontend/src/features/admin/AdminProjectInitiationDialog.test.tsx` only; Mode B primary | T1; final passing run after T2 | AC1–5 |
| T4: Integrated review, automated checks, browser checks | Primary; optional read-only verification agent after writers finish | T2–T3 | AC1–6 |
| T5: Record results and hand off | Primary: this plan and specification status metadata | T4 | AC5–6 |

Tell any agent explicitly that the worktree is shared and unrelated edits must be preserved. Do not modify page-level tests unless integration exposes an in-scope expectation affected by this dropdown; reassign ownership first if needed. No implementation or delegation begins during this planning gate.

## T1–T2. Control and submission contract

- Use the existing `Field`, `Select`, and `Input`. Define the exact approved channel list locally, in its approved order. Keep Source optional with a selectable blank **Select source** option.
- Keep the API field `source`. Treat the dropdown selection and custom draft as distinct frontend values so **Other** never becomes a sentinel in the payload.
- For a preset, send its exact label. For blank, omit `source`. For Other, require trimmed nonblank custom text of at most 200 characters and send only that text as `source`.
- Render **Other source** immediately below Source with a unique field ID and associated validation description. Preserve custom draft in form memory across selection changes, while excluding it from preset/blank payloads.
- Keep `source` as the validation/server-error key. Attach its error and focus ref to the active input: Other source while Other is selected, otherwise Source. Clear source feedback when either active value is corrected or selection changes. Local custom validation should use the same active-control focus path.
- Ensure normal required-field validation does not accidentally make custom source required when hidden. Use resolved source for length validation and payload construction.
- Disable source controls during submission. Include source selection/custom draft in the existing dirty check. Preserve all other values, submission guards, assignment logic, navigation, notifications, and invalidations.

## T3. Focused regression coverage

Update existing source textbox tests to the new accessible controls, retaining unrelated test coverage. Verify behavior through user selection and captured request bodies:

- Approved options and blank default, optional Source, conditional required Other source, and descriptions.
- Preset submission in both Sales and Sales Manager assignment modes.
- Trimmed custom submission in both modes; blank and overlong custom input rejected before requests with correct focus and error association.
- Switching Other to a preset sends the preset; switching to blank omits Source; switching back retains the custom draft without leaking it into another selection's payload.
- Server source errors retain values, focus the active preset/custom control, and clear on correction.
- Source-only/custom-draft changes preserve discard confirmation; pending mutation disables visible source controls and preserves duplicate-submit protection.

## T4. Verification

Review the integrated diff for conditional validation, stale hidden drafts, accessible label/error IDs, active-control refs, and unchanged API payload/assignment paths. Run the focused dialog tests first, then the page integrations after writers finish.

From `frontend/`:

```sh
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx
npm test -- src/features/admin/AdminProjectsPage.test.tsx src/features/leads/LeadDashboard.test.tsx
npm run typecheck
npm run build
```

From the repository root:

```sh
git diff --check
git status --short
```

Browser-check the real side panel with synthetic fixtures at desktop and mobile widths (approximately 1440 and 390 px). Exercise keyboard dropdown selection, Other show/hide, validation focus and accessible descriptions, clear/reset selection, pending state, and side-panel scrolling without horizontal overflow. Do not create a real project or use private client data for QA. Store temporary evidence outside the repository or in an ignored task-specific directory.

These checks map AC1–4 to the dialog tests and interactions, AC5 to automated checks, and AC6 to rendered desktop/mobile inspection. Broaden only if an actual regression or shared-impact concern warrants it. No backend/OCR tests are required for this frontend-only change; no lint script exists.

## T5. Handoff

Record actual test counts, command results, browser observations, affected paths, temporary evidence paths, and any unrun checks or remaining limitations. Mark approval/execution status accurately after each completed gate. Report the result as local implementation; do not imply deployment or historical data normalization.

## Approval status

- Specification: approved.
- Task plan: approved.
- Execution mode: A, parallel native sub-agents.
- Implementation, review, automated checks, and synthetic browser verification: completed locally.

## Result and verification record

Implemented the approved list in the existing native Source dropdown. Other reveals a required custom field; only its trimmed text reaches the existing `source` payload. Blank omits Source, hidden custom drafts are excluded, and field error/focus, pending controls, and discard protection are preserved. No API, dependency, global style, or database changes were needed.

Ownership/result: primary implemented `AdminProjectInitiationDialog.tsx`; the frontend implementer updated its colocated tests. The independent integrity reviewer found no confirmed defects. During page verification, `LeadDashboard.test.tsx` still expected old Location/budget text controls and an old date input. Inspection of HEAD confirmed the stale expectations predated this change. Primary took ownership of that otherwise-clean test and repaired only the initiation scenario to use current city, property dropdown and date-picker controls, adding Source selection/payload coverage. Page navigation, refresh, and assignment assertions remain. This was a bounded verification repair with no additional product behavior change.

Final automated evidence:

| Check | Result |
| --- | --- |
| `npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx` | 25 tests passed |
| `npm test -- src/features/admin/AdminProjectsPage.test.tsx src/features/leads/LeadDashboard.test.tsx` | 29 tests passed: 18 project-page and 11 lead-dashboard tests |
| `npm run typecheck` | Passed on the final integrated worktree |
| `npm run build` | Passed; product source unchanged after build |
| `git diff --check` | Passed |

The build emitted Vite warnings for chunks over 500 kB (main bundle, ExcelJS, ECharts); bundle changes are outside this task. The first page-test run exposed the stale test above; its final rerun passed. The 25 focused tests were not repeated because product behavior did not change afterward.

Browser QA used the real side panel and app styles with synthetic API responses and submissions, at 1440 × 1000 and 390 × 844. Both layouts fit without horizontal overflow. Inspected screenshots of Source and Other validation, and checked native keyboard typeahead selection with Tab navigation, custom trimming, blank omission, switching to a preset, retained custom draft, local/server-error focus, and disabled pending controls. Axe returned zero violations within the tested dialog using WCAG 2 A/AA and 2.1 AA tags. This is targeted coverage, not a whole-app accessibility audit or a physical mobile-device test.

Evidence directory: `/tmp/lisno-source-dropdown-2026-10-11/`, including synthetic screenshots, `browser-summary.json`, `keyboard-check.log`, `verification-integrations-final.log`, `verification-typecheck-final.log`, and `verification-build.log`. Temporary harness/CLI files are outside the repository; ignored build output is in `frontend/dist/`.

Final changed paths are the dialog, its test, the lead-dashboard initiation test, and these two approved documents. Full frontend/backend/OCR/replica-set suites were not run for this localized frontend change; no lint script exists. No migration, seed, database sync, production write, deployment, commit, or push was performed.
