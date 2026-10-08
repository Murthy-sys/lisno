# Hide Initial payment on Estimate in progress: task plan

Approved specification: [design](../specs/2026-10-08-estimation-hide-initial-payment-design.md).

## Scope and ownership
Presentation-only removal for leads at `estimate_in_progress`. Preserve payment behavior in other lead stages and project workspaces. No backend, CSS redesign, dependencies, persistence, permission, or financial changes are planned.

The primary agent owns integration and scope. Capture dirty paths and relevant diffs before editing; the only dirty path observed during planning was the specification above. Preserve unrelated changes. Keep one parent task in progress at a time.

## Dependency-ordered tasks

### 1. Implement the scoped visibility option
- Owner: primary agent in Mode B; a single bounded frontend implementation agent in Mode A.
- Files: `frontend/src/features/workflow/ProjectWorkflowPanel.tsx` and `frontend/src/features/leads/LeadDetail.tsx`.
- Add a default-enabled Initial payment visibility prop to the shared panel. Apply it only to the payment section's render condition.
- Pass the stage-based value from LeadDetail: disabled for `estimate_in_progress`, enabled otherwise.
- Retain the existing full presentation, workflow content, query behavior, and payment component. Do not render a payment placeholder.
- Acceptance: AC1, AC2, AC3, AC4.

### 2. Verify screen behavior and compatibility
- Depends on task 1 for execution; test preparation can occur in parallel after the visibility contract is fixed.
- Owner: primary agent; in Mode A, a separate agent may own only `frontend/src/features/leads/LeadDetail.test.tsx` while the implementation agent owns only the two product files. No overlapping writes.
- Extend the rendered lead test with a linked project and actual Initial payment workflow data. Verify absence at Estimate in progress, retained estimate/follow-up and applicable workflow content, and restoration/removal as the lead stage changes.
- Reuse existing shared-panel and payment tests to verify default visibility and payment rules elsewhere. Add further coverage only if an acceptance criterion remains unverified.
- Review the resulting markup/layout for any empty payment placeholder and keep accessible names and stage controls intact.
- Acceptance: AC1–AC4.

### 3. Final integrated verification and handoff
- Depends on all writers finishing.
- Owner: primary agent; a proportionate read-only review may be delegated in Mode A.
- Run from `frontend/`:
  - `npm test -- src/features/leads/LeadDetail.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/finance/DesignPaymentConfirmations.test.tsx`
  - `npm run typecheck`
  - `npm run build`
- Run `git diff --check` and inspect `git status --short` and the final scoped diff.
- Report actual rendered interaction checks, command results, any verification limitations, and changed files. There is no repository lint script.
- No commits, pushes, deployment, production writes, or migrations are authorized by this plan.

## Execution status
Specification and task plan approved; Mode A selected. Implementation and verification completed. The initial dirty set contained only this plan and its specification; product targets were clean.

## Verification results
- `ProjectWorkflowPanel.tsx`: optional `showInitialPayment` defaults to true and gates only the payment section.
- `LeadDetail.tsx`: disables the section only for `estimate_in_progress`.
- `LeadDetail.test.tsx`: rendered regression uses the real shared workflow and payment components; verifies hidden → visible → hidden across stage changes, unchanged notices/design reviews/estimate controls, and preservation of an unsaved follow-up note (AC1–AC4).
- Focused command above passed **26/26 tests** across 3 files: LeadDetail 2, ProjectWorkflowPanel 13, DesignPaymentConfirmations 11.
- `npm run typecheck` and `npm run build` passed. Build reports the existing warning for chunks over 500 kB.
- Final product diff review and `git diff --check` passed.
- Playwright rendered checks at 1440×900 and 390×844 confirmed no payment region, retained estimate/follow-up controls, no horizontal overflow, and no runtime or failed fixture-request errors. Both approved and awaiting-approval synthetic workflow data were checked. With no other workflow content, its wrapper measured 0px tall; no payment placeholder remains.
- Mobile axe check reported 0 violations and 37 passing rules; color-contrast was incomplete, so a complete automated contrast audit is not claimed. Browser layout checks used local synthetic data; live backend behavior was not exercised. An initial fixture-navigation wait timed out because immediate navigation did not remount the query; navigating away and waiting for unmount before returning refreshed the fixture successfully.
- Browser screenshots/logs were moved out of the worktree to `/tmp/lisno-estimation-hide-payment-qa/`. Vite and the task browser session were stopped. Build output is ignored under `frontend/dist/`.

Full frontend suite, backend, OCR, and replica-set checks were not run for this scoped presentation change. No dependencies, payment rules, migrations, commits, pushes, deployments, or production data were changed.
