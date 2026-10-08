# Estimate in progress content redesign: task plan

Approved specification: [content redesign](../specs/2026-10-08-estimation-progress-content-redesign-design.md).

## Active amendment: remove Follow-ups from Estimate in progress
The removal amendment is specification-approved. This section is the only pending work and supersedes the completed redesign's instructions to retain Follow-ups below the Estimate section. The earlier tasks and verification evidence below remain historical records, not checks already performed for this amendment.

### F1. Hide the target-stage card and remove obsolete styling
- Owner: primary agent in Mode B; a bounded frontend implementation agent in Mode A.
- Exclusive files: `frontend/src/features/leads/LeadDetail.tsx` and `frontend/src/features/leads/estimationProgress.css`.
- Capture their existing diffs and the current dirty-path set before writing. These files contain the completed redesign; preserve that baseline and every unrelated edit.
- Render the Follow-ups section only when `isEstimateProgress` is false. Remove the entire target-stage form/history/error/empty section without a replacement container. Simplify now-unreachable target-only follow-up markup and CSS.
- Keep the current note/type state and activity data/mutation behavior so other stages retain their form, history, save/retry behavior, and unsaved note when returning from the target stage.
- Preserve the project/contact header, stage/Critical controls, navigation, three-step Estimate section, Continue estimate, workflow content, and Initial payment suppression. Do not delete activity records or modify backend/query contracts.
- Acceptance: amended AC3, AC4, AC7; layout aspects of AC1 and AC5.

### F2. Reconcile the rendered lead regressions
- Depends on the visibility contract in F1; test preparation may run in parallel with F1 in Mode A, with no overlapping files.
- Owner: primary agent or a separate test agent in Mode A; primary agent in Mode B.
- Exclusive file: `frontend/src/features/leads/LeadDetail.test.tsx`.
- Replace target-stage assertions that require Follow-ups with absence checks for the heading, fields, save button, and recorded activity text. Keep Estimate guide and Continue estimate checks.
- Verify another stage still shows saved history and supports the existing failure/retry test. Enter a note on that stage, switch to Estimate in progress, and return to confirm the note survives hiding the card.
- Adapt the Continue estimate retry regression to the newly hidden form while retaining its pending, failure, retry, and successful navigation coverage. Keep payment visibility and other-stage layout assertions.
- Acceptance: AC3, AC4, AC7.

### F3. Verify the integrated amendment
- Depends on all F1/F2 writers finishing. Owner: primary agent, with a proportionate read-only review or verification delegation in Mode A.
- Run from `frontend/`: `npm test -- src/features/leads/LeadDetail.test.tsx`, then `npm run typecheck` and `npm run build` sequentially.
- Check rendered desktop and mobile layouts with synthetic data: no Follow-ups section or reserved card space at Estimate in progress, preserved full-width Estimate content and accessible Continue estimate, and restored Follow-ups on another stage. Recheck stage switching and browser console/network failures relevant to this change.
- Inspect the final incremental diff against the captured baseline; run `git diff --check` and `git status --short`. Keep one parent amendment task in progress. Record actual results separately from the earlier 99-test redesign results below.
- No new dependencies, backend changes, migrations, commits, pushes, deployment, or production writes. Move temporary browser artifacts outside the worktree before handoff.
- Acceptance: AC1, AC3–AC7. Broader tests are needed only if the bounded change exposes a shared-component regression.

Amendment status: specification and task plan approved; Mode A selected. F1, F2, and F3 are complete. The existing dirty-path set and incremental baselines were captured before writers started.

### Follow-ups removal: implementation and fresh verification
- Product changes are limited to `LeadDetail.tsx` and `estimationProgress.css`: render the entire Follow-ups section only outside `estimate_in_progress` and delete its unused target-stage styling. Activity state, queries, mutations, and records are unchanged. The incremental diff was reviewed against `/tmp/lisno-followups-removal-initial.diff` and `/tmp/lisno-followups-removal-initial.css`.
- Updated `LeadDetail.test.tsx` verifies absent target-stage form/history, saved history and unsaved note/type restoration on another stage, existing save failure/retry, payment scoping, and Continue estimate pending/failure/retry/navigation behavior.
- After both writers finished, `npm test -- src/features/leads/LeadDetail.test.tsx` passed **3/3 tests**. `npm run typecheck` and `npm run build` passed sequentially. Build retains the existing chunks-over-500-kB warning. `git diff --check` passed.
- Synthetic browser checks passed at desktop 1440×1000 and mobile widths 390px and 320px. There is one Estimate child in the content grid, no Follow-ups card or placeholder, and no horizontal overflow. Estimate height is 201px on desktop and 364px on mobile. The retained screenshots use tall mobile viewports to avoid full-page screenshot stitching of the fixed app header.
- Browser stage switching restored the saved history, unsaved note, and WhatsApp activity type. Continue estimate received keyboard focus and Enter opened the same lead's estimate. No render or console errors were observed. These are local synthetic checks, not production validation.
- Temporary screenshots and browser logs are stored outside the worktree at `/tmp/lisno-followups-removal-qa/`. The task browser and local preview server were stopped after verification.
- No dependencies, backend/schema changes, migrations, commits, pushes, deployment, or production writes. The full frontend/backend suites and full accessibility audit were not rerun for this bounded removal; the fresh checks above are separate from the historical redesign results below. No lint script exists.

## Scope and preserved work
Redesign the lead-specific content only at `estimate_in_progress`. Keep other lead stages, application chrome, the estimate builder, payment rules, and backend contracts unchanged. Preserve the completed Initial payment removal.

Initial dirty paths are `frontend/src/features/leads/LeadDetail.tsx`, `frontend/src/features/leads/LeadDetail.test.tsx`, and `frontend/src/features/workflow/ProjectWorkflowPanel.tsx`, plus the payment-task specification/plan and the new redesign specification. These contain understood prior work. Recheck status and capture relevant target diffs before assigning writers. Do not revert, stage, or reformat unrelated work. `ProjectWorkflowPanel.tsx` does not require further modification for this redesign.

## Implementation contract
- LeadDetail owns the stage condition, lead data, mutations, unsaved follow-up state, and page composition.
- Add a default-preserving presentation option to `ContactAndEstimateCard` for the compact three-step Estimate section. The redesigned branch contains a semantic ordered list, Next action metadata, and the existing Continue estimate callback. Other stages retain the existing card.
- Extend `ProjectChatNavigation` with an optional summary destination, `summaryContainer?: HTMLElement | null`, so the existing Critical summary can appear beside the stage selector without duplicating its query or chat registration. `undefined` preserves current inline rendering; a provided element receives the summary through a React portal; `null` means the target is not mounted yet and must not create a duplicate inline summary. The same existing loading/error/stale summary content follows that destination.
- Add an opt-in navigation presentation only if required for the reference's tabs, symbols, and authorized fallback row. Its default must preserve all other consumers. Keep summary access checks and ProjectStatusButton intact.
- The target header mounts the summary destination with a stable callback ref. Missing project or denied chat does not manufacture a badge. Accessible reading/focus order follows the rendered header and navigation.
- Use a dedicated, stage-scoped stylesheet such as `frontend/src/features/leads/estimationProgress.css`. Do not broadly override shared estimator or chat styles. Use the existing typography/surface/control tokens and small inline SVG symbols without adding dependencies.
- The three steps are informational. Do not add a completion calculation, new wizard state, direct step routes, or a publication action.

## Dependency-ordered tasks

### 1. Confirm the baseline and freeze ownership
Owner: primary agent. Acceptance: AC2, AC4.

Recheck approved scope and per-target diffs. Capture the existing target and one other lead-stage view using synthetic data where feasible. Share the component contracts above with writers. Keep one parent task in progress and record completion before moving to final integration.

### 2. Add the optional shared-navigation composition
Depends on task 1. Owner in Mode A: navigation implementation agent. In Mode B: primary agent.

Exclusive write ownership:
- `frontend/src/features/messages/ProjectChatHeader.tsx`
- A focused `ProjectChatHeader.test.tsx` alongside it, only if needed to test the new destination contract without expanding an unrelated test suite.

Implement the optional Critical summary destination and any narrowly scoped presentation flag. Retain exactly one navigation registration/summary source, current links, unread counts, status fallback, and stale/error text. Cover default inline rendering and opted-in rendering, no duplication, denied/disabled/loading/error conditions, and project changes with unequal counts. Ensure other screens retain the existing markup by default. Do not edit lead files, shared chat query/provider/API behavior, or CSS owned by task 3.

Acceptance: AC2, AC3, AC4.

### 3. Implement the lead content layout
Depends on task 1 and the frozen contract; can run in parallel with task 2 in Mode A. Owner: lead UI implementation agent, or primary agent in Mode B.

Exclusive write ownership:
- `frontend/src/features/leads/LeadDetail.tsx`
- `frontend/src/features/leads/ContactAndEstimateCard.tsx`
- `frontend/src/features/leads/estimationProgress.css` (new, scoped to this presentation)

Build the reference hierarchy: project heading/property badge/contact metadata, stage and Critical header controls, compact navigation with Project status, and a full-width Estimate section. Keep the guide and button compact; stack steps naturally when they no longer fit. Move Follow-ups and applicable workflow content below the Estimate entry section without losing form state. Preserve all existing mutations, pending/error behavior, and Initial payment suppression. Keep other-stage markup and presentation unchanged.

Acceptance: AC1–AC5.

### 4. Extend rendered lead regressions
Preparation can run in parallel with tasks 2–3 once contracts are fixed; execute against the integrated product changes. Owner in Mode A: separate regression agent. In Mode B: primary agent.

Exclusive write ownership: `frontend/src/features/leads/LeadDetail.test.tsx`.

Preserve the earlier follow-up retry and payment-stage regressions. Adapt heading assertions to the scoped project-title presentation. Add meaningful coverage for the three-step guide, header contact data, absence of duplicate contact/payment/budget UI, Continue estimate success/failure, and retained unsaved follow-up text while leaving and returning to the target stage. Verify a non-target stage still uses its existing layout. Use actual components and synthetic API fixtures; do not replace behavior with implementation-mirroring mocks.

Acceptance: AC1–AC4 and functional parts of AC5.

### 5. Integrate and review
Depends on all writers finishing. Owner: primary agent, followed by `integrity_reviewer` in Mode A; equivalent inline review in Mode B.

Inspect the combined diff for styling leakage, duplicate stream registration or Critical summaries, lost permissions, incorrect project identity, fabricated progress, and reset follow-up state. Reconcile responsive composition with the supplied screenshot. Fix confirmed issues within the relevant ownership boundary before verification. Do not expand into shared business logic.

Acceptance: AC1–AC5.

### 6. Verify the final worktree and hand off
Depends on task 5 and any fixes. Owner: `verification_runner` in Mode A for command checks; primary agent for browser checks and final reconciliation. Mode B keeps all verification inline.

Run from `frontend/`:
- `npm test -- src/features/leads/LeadDetail.test.tsx src/features/messages/ProjectMessagesPage.test.tsx src/features/project-status/ProjectStatusButton.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/finance/DesignPaymentConfirmations.test.tsx`
- Run the focused `ProjectChatHeader.test.tsx` if added.
- `npm run typecheck`
- `npm run build` (after typecheck to avoid overlapping generated TypeScript output).

Perform rendered browser checks with synthetic data at 1440px, 768px, 390px, and 320px widths, plus an effective 200% viewport/text-zoom check. Inspect long project/contact values, real zero and nonzero counts, missing project/chat access, loading/error/stale count states, and the default shared-navigation view. Exercise Continue estimate, stage selection, Messages/Critical links, Project status drawer and focus return, and follow-up validation/retry. Check screenshots, overflow, console/network errors, keyboard focus, and automated accessibility results; report any incomplete checks accurately.

Run `git diff --check` and `git status --short`, inspect the final scoped diff, and update this plan with exact results. Expand testing only when a shared-component change or discovered failure justifies it. No lint script exists; do not claim lint passed. Browser outputs may be captured in the existing `frontend/output/playwright/` location and moved to a task-specific `/tmp/` directory before handoff. Do not commit runtime artifacts.

Acceptance: AC1–AC6.

## Parallelism and boundaries
After Mode A is selected, tasks 2 and 3 can run concurrently because their contracts and files are distinct. Task 4 may prepare tests concurrently on its exclusive file; final test results must come after product writers finish. All agents must be told they share the worktree and must preserve others' edits. Shared contract changes return to the primary agent before adoption. Review and final verification are sequential after integration. No agents are authorized before the execution-choice gate.

## External actions and status
No dependencies, backend changes, migrations, production writes, customer communication, commits, pushes, or deployment are included.

Specification and task plan approved; Mode A selected. Baseline dirty paths were rechecked and the existing payment-task diff captured at `/tmp/lisno-estimation-redesign-initial.diff`. Implementation, integrated review, verification, and task-artifact cleanup are complete.

## Implementation and verification evidence
- Added the target-stage project/contact header, stage/Critical controls, navigation presentation, compact three-step Estimate section, and follow-ups below. Default card/navigation presentation remains unchanged elsewhere. No new dependencies or business rules.
- The existing Critical summary is portaled into the header, preserving one query/registration source. No fabricated count or step completion state is introduced.
- Integrated read-only review found no blocking correctness, permission, state-preservation, or scoping issues. Because the native agent thread limit was reached, existing agent threads were reused for the regression, integrated review, and final verification assignments with explicit ownership and read-only verification boundaries.
- Final focused suite command above, including `ProjectChatHeader.test.tsx`, passed **99/99 tests across 6 files**: LeadDetail 3, ProjectChatHeader 9, ProjectMessagesPage 44, ProjectStatusButton 19, ProjectWorkflowPanel 13, DesignPaymentConfirmations 11.
- Typecheck initially caught an unsupported Testing Library role-query `exact` option in a new assertion. It was removed; the LeadDetail rerun passed 3/3, followed by successful `npm run typecheck` and `npm run build`. Build retains the existing chunks-over-500-kB warning.
- Desktop stage and Critical controls initially wrapped; explicit scoped control width fixed it. At 1440px their bottom positions both measure 199.19px and the badge sits beside the select.
- Final responsive checks: 1440×1000, 768×1024, 390×844, 320×720, and 720×450 effective viewport zoom. All have no document/content horizontal overflow, exactly one Critical badge, no Initial payment panel, and no unexpected fixture request or render errors. Desktop Estimate section height is 201px with 52px step rows; mobile steps remain 52px with content-driven stacking.
- Rendered stage changes preserve an unsaved note and restore the default non-target layout/payment behavior. Follow-up failure retains the note; retry saves and clears it. Project status opens and Escape returns focus to its trigger.
- Critical 7 opens `/projects/project-1/messages?filter=critical`; Messages opens `/projects/project-1/messages`. Continue estimate failure/retry opens the saved estimate at `/estimator-sales/leads/lead-1/estimate`. The saved fixture resumes at “Select estimate items”; the separate new-estimate regression verifies “Configure estimate.”
- Browser stale-count failure retains Critical 7 plus its warning; recovery removes the warning. Missing project removes chat/status controls without disabling Continue estimate. Denied chat removes Critical and Messages. Loading and initial-error states are also covered by rendered navigation regressions.
- Browser tooling initially encountered transient missing-CSS HMR while writers were active, and two waits used the wrong saved-fixture destination heading. Final checks were rerun after writers finished with the correct saved-estimate destination. These were verification setup issues, not retained product failures.
- Desktop and narrow-mobile axe scans reported 0 violations and 35 passing rules each. Color-contrast was incomplete; full automated contrast conformance is not claimed. A long-email wrapping stress check at 320px had no horizontal overflow. Keyboard Tab from Lead stage reaches Critical with a visible solid focus outline.
- Final browser session showed 0 console errors; axe produced asset/contrast preload warnings. An npm registry sandbox failure interrupted the first accessibility command; the approved escalated retry succeeded.
- Preview screenshots and browser logs are in `/tmp/lisno-estimation-content-redesign-qa/`, including `estimation-redesign-desktop.png` and `estimation-redesign-mobile.png`. Task Vite and browser sessions were stopped. Build outputs remain ignored in `frontend/dist/`.

Full frontend suite, backend/OCR/replica-set tests, production backend behavior, and native browser zoom were not exercised. The 720×450 check represents a reduced effective viewport; it does not claim native browser zoom verification. No lint script exists. No migration, commit, push, deployment, or production mutation was performed.
