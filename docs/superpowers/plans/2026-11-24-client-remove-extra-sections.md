# Client project: remove two secondary sections

Date: 2026-11-24
Status: Specification and task plan approved; Mode A selected. Implementation and verification complete.

Specification: [Approved scope](../specs/2026-11-24-client-remove-extra-sections-design.md).

## Outcome and boundaries

Remove **Additional requirements** and **Project coordination** from Client project details for current and older estimation paths. Keep **Selections requiring your approval**, including its existing publication guard, and all quotation, message, workflow and document controls.

Only the Client page composition and its existing regression tests need changes. Preserve shared components, stored records, backend contracts, pricing, permissions, dependencies and unrelated quotation-summary work.

## Dependency-ordered tasks

### T0. Capture baseline

Owner: primary. Before any implementation writers start, capture `git status --short` and per-target diffs. Both intended code targets are currently clean; unrelated quotation-summary files are dirty. Preserve those changes. Confirm the approved scope and ownership below.

### T1. Remove the page mounts

Owner: primary. Depends on T0. Own only `frontend/src/features/client/ClientProject.tsx`.

- Remove the `ClientEstimateRequirements` and `PMCounterpartPanel` imports and every mount on this page, covering v2, v3 and older paths.
- Keep the non-shared-estimation message navigation while simplifying its now-unnecessary fragment.
- Preserve `showSubmittedSections`, review fetching and the `ProjectWorkflowPanel` design-selection guard.
- Leave shared component implementations and CSS untouched; removal should naturally close their layout space and stop their component-owned requests.

Covers specification acceptance criteria 1–3.

### T2. Update the existing page regression tests

Owner: dedicated test agent in Mode A; primary in Mode B. Depends on T0 and the settled scope; may run in parallel with T1. Own only `frontend/src/features/client/ClientProject.estimateReview.test.tsx`.

- Replace assertions expecting the removed sections after publication with absence assertions. Cover current and older estimation paths, including `?pm=client`.
- Check the removed sections' requirements/coordination endpoints are not requested by the page.
- Retain design-selection visibility, background-refresh continuity, denied/invalid publication handling, project identity, unsaved quotation edits and approval tests. Use the retained design-selection panel for existing mounted-element continuity assertions.
- Adjust test names/helpers to distinguish permanently removed sections from the conditionally visible selection panel. Reuse existing fixtures and avoid duplicating standalone component tests.

Covers acceptance criteria 1–4. Writers share the worktree and must not revert or edit each other's files.

### T3. Integrate and verify

Owner: primary. Depends on completed T1 and T2; keep only this parent task in progress during final verification.

Inspect the integrated diff for retained navigation, publication guards and unrelated changes. Run:

```sh
cd frontend
npm test -- src/features/client/ClientProject.estimateReview.test.tsx --maxWorkers=1
npm run typecheck
npm run build
```

Render the affected Client project page with synthetic data at desktop and phone widths. Confirm both sections and their reserved space are absent, the selection panel remains available when permitted, and quotation/navigation controls keep accessible names and keyboard access. Do not submit a real approval or use real customer data.

Run repository `git diff --check` and `git status --short`. Record exact results and any limitations. No lint script exists. Broaden checks only if failures or changed scope justify it. Close temporary browser/server sessions and remove temporary QA artifacts; ignored build output may remain in `frontend/dist/`.

Covers acceptance criteria 1–5. No migrations, commits, pushes, deployment, email or production mutations are included.

## Execution choice and handoff

After task-plan approval, obtain the required A/B execution choice. Mode A permits the independent T1/T2 ownership above; Mode B keeps all work inline. The primary owns final integration and proportionate review. Report the two removed sections, preserved approval panel, affected files, verification results and any unverified behavior.


## Execution and verification record

- T0: captured dirty-path status, full tracked diff and target copies before writers in `/private/tmp/lisno-client-sections-7wf98_jo`. Both targets were clean. Final comparison confirmed all unrelated tracked changes exactly match that baseline.
- T1: primary removed the two component imports/mounts from `ClientProject.tsx` across current/older estimation paths. Message navigation, `showSubmittedSections`, remaining design-selection approval visibility and every other page section were preserved. No CSS or shared-component changes were needed.
- T2: the test agent updated only `ClientProject.estimateReview.test.tsx` and stopped writing before final checks. Existing cases now assert permanent panel absence and zero requirements/coordination requests for v3, v2 and legacy, including `?pm=client`. Publication/error recovery, project identity, background DOM continuity, quotation edits, approval and accessibility coverage remain.
- Focused command: `cd frontend && npm test -- src/features/client/ClientProject.estimateReview.test.tsx --maxWorkers=1`: **35 tests passed** (7.27 seconds). The suite includes rendered interactions and axe checks. Primary reviewed the integrated product/test diff.
- `cd frontend && npm run typecheck`, `npm run build`, and repository `git diff --check` passed. Vite retains the existing large-chunk warning; largest application JS chunk is 3,469.00 kB before gzip. Ignored build output is `frontend/dist/`.
- Synthetic browser checks at **1440×900** and **390×844** verified both requested sections absent, selections visible, no page-wide overflow, no runtime errors, no unexpected requests, and no removed-panel requests. Both final screenshots were visually inspected. Keyboard Enter opened quotation review, Back to estimate restored editing, and keyboard Back to projects reached the project list. No real approval or API write was made.
- All five acceptance criteria are covered by the focused regression and browser checks. No backend/API, schema, saved data, permissions, financial calculation, dependency or lockfile changes. Full unrelated frontend/backend/OCR suites were not run for this bounded page-composition change. No lint script exists.
- Closed the temporary browser/server and removed the temporary baseline, fixture, screenshots and cache directory above. No migration, commit, push, deployment, email or production mutation was performed.
