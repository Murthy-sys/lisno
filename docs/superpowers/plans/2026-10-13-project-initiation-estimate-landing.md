# Unified lead estimate landing task plan

## Authority and source of truth

The user approved the [unified lead estimate landing specification](../specs/2026-10-13-project-initiation-estimate-landing-design.md) on 2026-10-13, after clarifying that the second image replaces the first for both starting and continuing estimates.

The specification and task plan were approved on 2026-10-13. The user selected Mode A (parallel sub-agents).

Implementation and proportionate verification are authorized. No commit, push, deployment, migration, production write, or external communication is included.

## Current evidence and boundaries

- The initial worktree was clean. At plan creation the only dirty path is the new specification; relevant product-source/test diffs remain empty. Recheck status and target diffs immediately before implementation.
- `LeadDashboard.tsx` already opens the returned lead detail after successful initiation and keeps the list at `/estimator-sales`; route changes are unnecessary.
- `LeadDetail.tsx` selects the newer layout only at `estimate_in_progress`, fetches activities even when their UI is hidden, and currently sends a stage PATCH for both Start and Continue.
- `ContactAndEstimateCard.tsx` has one production caller, `LeadDetail`, and contains both the latest guide and the obsolete contact-card branch.
- `ProjectWorkflowPanel` already supports `showInitialPayment={false}`. Use this caller option without changing its shared default or payment rules.
- `estimationProgress.css` already contains the requested responsive layout. Prefer reusing it, with only bounded corrections exposed by verification.

## Implementation contract

Use one latest layout for all lead stages, including leads without a project. Show the actual saved stage. Start stages are `new_lead`, `contacted`, `site_visit`, and `design_meeting`; Continue stages retain the existing classification of `estimate_in_progress`, `estimate_sent`, `negotiation`, `won`, and `lost`.

Start updates only the current lead to `estimate_in_progress`, refreshes affected lead queries, and navigates only after success. Continue navigates directly to that lead's builder without mutating its stage. Mount, reload, and returning from the list perform no writes. Manual stage selection remains supported; stage selection and estimate entry must not race while a mutation is pending.

The latest view contains project identity/contact metadata, stage/Critical controls, authorized project navigation/status, one full-width estimate guide, and applicable workflow content below. It contains no old header/contact-card branch, Initial payment panel, or Follow-ups form/history at any stage. Quick-review history and shared workflow/payment behavior elsewhere remain intact.

## Dependency-ordered tasks

Execution status: T1–T6 complete. Independent integrity review found no confirmed defects. Baseline reconfirmed: only this task's specification and plan were untracked; product target diffs were empty. Browser verification used a disposable Playwright session and synthetic data on a task-owned Vite server at port 4184.

### T1. Establish the implementation baseline

Owner: primary agent. Dependencies: approved plan and selected mode.

- Record `git status --short` and the relevant per-target diff; reconcile any new user changes before assigning ownership.
- Reconfirm the approved contract and callers, including no-project navigation and the existing query invalidation behavior.
- Keep the existing CSS class/variant names where useful; this task does not require a broad rename or new page abstraction.
- Record browser QA approach and synthetic fixtures without exposing user data.

Acceptance: baseline and ownership are explicit; no unexplained dirty target is assigned. Covers the integration prerequisites for AC1–AC7.

### T2. Replace the old lead screen and implement correct estimate entry

Owner: frontend implementation slice. Dependencies: T1.

Owned files:

- `frontend/src/features/leads/LeadDetail.tsx`
- `frontend/src/features/leads/ContactAndEstimateCard.tsx`
- `frontend/src/features/leads/LeadDetail.test.tsx`
- `frontend/src/features/leads/estimationProgress.css`, only if necessary
- `frontend/src/styles/estimator-dashboard.css`, only for proven-unused old lead-card/follow-up rules or required scoped corrections

Work:

1. Render the latest header, contact row, navigation variant, guide, and content order unconditionally. Keep the live stage value and existing project-specific permission/data controls.
2. Pass `showInitialPayment={false}` from this view. Remove its Follow-ups rendering, local form state/mutation, unused imports, and unused activity query/loading/error dependency. Keep activity APIs and list quick review unchanged.
3. Reduce the existing estimate-card component to its latest guide and used props; remove its obsolete variant and contact rendering. Preserve the ordered-list semantics, static symbols, next-action text, and one accessible CTA.
4. Implement separate Start and Continue behavior using the existing stage classification. Disable conflicting actions during a pending stage/start mutation, preserve Start failure/retry, and use the stable current lead ID for navigation. Preserve cache freshness after successful stage changes.
5. Remove only selectors proven unused after the component cleanup. Preserve shared `lead-timeline` styles used by quick review and avoid editing global `index.css` for cosmetic cleanup.
6. Replace superseded detail tests with behavioral coverage for all nine stages, a no-project lead, truthful stage text, no mount writes, direct entry/remount, stable layout on stage changes, retained workflow notices, and absent old content.
7. Cover delayed/failed/retried Start, successful current-lead navigation, disabled conflicting actions, and Continue navigation with no PATCH for in-progress, sent, and closed stages. Include lead-load and stage-mutation failure/retry checks.

Acceptance: AC3–AC5 and the detail portion of AC1/AC6 hold. No backend changes or additional requests are needed merely to render the guide.

### T3. Cover initiation, list return, and accessibility integration

Owner: independent frontend regression slice. Dependencies: T1 and the fixed implementation contract. May run alongside T2 in Mode A; final results must be checked after T2 is integrated.

Owned files:

- `frontend/src/features/leads/LeadDashboard.test.tsx`
- `frontend/src/test/accessibility.test.tsx`, if shared accessibility coverage is extended

Work:

1. Extend the successful Sales initiation test to assert the returned lead detail shows the project-first header, saved New lead stage, Start estimate, and three steps, with no old content.
2. Assert the existing success invalidation and one creation request; use two distinct lead/project identities to prove the created record is the one opened.
3. Follow All leads back to the list, verify the created record appears in matching results, and reopen it. Verify Leads navigation remains the list rather than a last-created-lead redirect.
4. Preserve quick-review history coverage and creation failure behavior; update only expectations invalidated by the approved screen replacement.
5. Add or extend rendered accessibility assertions for the latest new-lead and continue states using existing test helpers and synthetic data. Assert labeled actions, contacts, native stage control, ordered steps, and the absence of fake interactive steps.

Acceptance: AC1–AC3, quick-review preservation in AC5, and automated AC6 checks pass. This slice must not edit production files or T2's detail tests.

### T4. Integrate and review the complete change

Owner: primary agent; `integrity_reviewer` in Mode A, equivalent inline review in Mode B. Dependencies: T2 and T3 finished.

- Inspect the integrated diff, resolve disagreements, and verify every stage uses one presentation.
- Confirm no implicit stage mutation on page entry or Continue, correct current-lead identity, and no Start/stage race.
- Confirm query invalidation, permissions, no-project behavior, and shared chat/status/payment defaults remain intact.
- Confirm no duplicated route, unused old presentation, deleted activity records, financial-rule changes, dependency changes, or unrelated edits.
- Resolve confirmed issues before final verification. Any necessary change outside owned paths returns to the primary agent for assignment; do not permit overlapping writers.

Acceptance: AC1–AC5 have an evidence-backed integrity review with no unresolved material findings.

### T5. Verify the integrated result and rendered experience

Owner: primary agent; `verification_runner` in Mode A after review/fixes, equivalent inline verification in Mode B. Dependencies: T4.

Run focused checks from `frontend/`:

```sh
npm test -- src/features/leads/LeadDetail.test.tsx src/features/leads/LeadDashboard.test.tsx
npm test -- src/features/messages/ProjectChatHeader.test.tsx src/features/project-status/ProjectStatusButton.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/finance/DesignPaymentConfirmations.test.tsx src/test/accessibility.test.tsx
npm run typecheck
npm run build
```

Run repository hygiene from the repository root:

```sh
git diff --check
git status --short
```

Broaden tests if shared implementation changes or failures establish additional risk. No backend suite or replica-set run is planned because backend contracts and transactional paths remain untouched. Do not claim lint passed; no lint script exists.

Rendered browser QA with synthetic records:

- Desktop 1440px, tablet 768px, mobile 390px and 320px, and an effective 200% zoom layout.
- Inspect newly created/new-lead and existing-estimate states, plus long project/contact values and a no-project lead.
- Exercise successful initiation, All leads and Leads navigation, reopening, Start pending/error/retry, Continue, and stage changes.
- Check keyboard focus/order, labels, step semantics, horizontal overflow, clipped controls, console errors, and unexpected network errors. Confirm project status/messages remain functional when authorized.
- Save temporary screenshots and reports under an ignored output directory or `/tmp/lisno-unified-estimate-landing-qa/`; compare the actual result with the second-image hierarchy and record paths.

Acceptance: AC1–AC7 have recorded checks/results. Any failure is diagnosed and fixed, followed by a focused rerun; do not present an incomplete or unverified result as complete.

### T6. Final handoff

Owner: primary agent. Dependencies: T5.

- Update execution status/evidence in this plan and record the approved specification's final status without changing its requirements.
- Report the single-screen outcome, key affected files, Start/Continue semantics, exact checks/results, unrun checks, and any limitations.
- Report no added dependencies and no backend migration or external action if that remains true. Link temporary visual QA evidence when useful.

## Execution modes and ownership rules

After plan approval, ask the required execution-choice question. Do not select a mode on the user's behalf.

- **Mode A:** after T1, assign T2 to `frontend_implementer` and T3 to a separate bounded worker. Supply the approved specification, this contract, explicit owned files, and the instruction that they are not alone in the codebase and must preserve others' edits. T2 and T3 are the only parallel writing slices. T4 integrity review follows both writers; T5 verification follows review and fixes. The primary agent owns integration, shared-file decisions, documents, and final reporting.
- **Mode B:** the primary agent performs T1–T6 inline, including review and verification, without implementation subagents.

Both workflow gates are complete. Writers have non-overlapping ownership as recorded above.

## Final implementation and verification evidence

Completed on 2026-10-13 in approved Mode A. Product changes are limited to:

- `LeadDetail.tsx`: one latest layout for all stages; no activity query/form or initial payment panel; Start updates and refreshes before navigation; Continue navigates without resetting stage; keyed detail state isolates late responses across lead IDs; pending stage/start operations disable conflicting controls.
- `ContactAndEstimateCard.tsx`: only the latest three-step guide remains, without the obsolete contact-card variant or unused props.
- `estimator-dashboard.css`: seven unused old contact/follow-up rules removed. The existing responsive estimate stylesheet is unchanged.
- `LeadDetail.test.tsx`, `LeadDashboard.test.tsx`, and `accessibility.test.tsx`: regression coverage for all stages, stable identities, creation/list return/reopen, Start pending/failure/retry, Continue without PATCH, stage changes, no-project/remount behavior, accessible controls, and quick-review history.

Two pre-existing stale accessibility test expectations were reconciled with the current initiation fields/date picker and focusable drawer body. Their underlying production components were not changed; keyboard-wrap, Escape/focus restoration, and validation checks remain meaningful.

### Automated checks on the integrated worktree

| Command (from `frontend/` unless stated) | Result |
| --- | --- |
| `npm test -- src/features/leads/LeadDetail.test.tsx src/features/leads/LeadDashboard.test.tsx` | Passed, 34 tests in 2 files |
| `npm test -- src/features/messages/ProjectChatHeader.test.tsx src/features/project-status/ProjectStatusButton.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/finance/DesignPaymentConfirmations.test.tsx src/test/accessibility.test.tsx` | Passed, 83 tests in 5 files |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, 3,140 modules transformed |
| Root `git diff --check` | Passed |
| Root `git status --short` | Only 6 intended frontend files and 2 task documents remain changed/untracked |

Total: 117 tests passed with no test warnings. Build emits the Vite >500 kB chunk warning (main bundle 2,665.25 kB, ExcelJS 940.19 kB, ECharts 591.07 kB). Bundle splitting is outside this bounded screen change.

Logs: `/tmp/lisno-unified-estimate-landing-qa/{focused-regression,shared-regression,typecheck,build}.log`. Build outputs are ignored under `frontend/dist/`.

### Browser checks and acceptance mapping

Conditions: Headless Chromium 155, device pixel ratio 1, Vite development server, browser-local synthetic API responses, no CPU/network throttling. This was not a physical-device or live-backend test.

- **AC1–AC2:** Successful initiation submitted once and opened the returned lead with the latest design. All leads, list reopening, and primary Leads navigation returned the correct records/routes across three distinct synthetic leads.
- **AC3:** New lead labels remained truthful; initial view, reopening, and reload generated no stage writes. New, sent, won, and standalone lead states retained the same composition.
- **AC4:** Delayed Start disabled both controls; simulated 503 retained the same lead and allowed retry; successful retry opened its builder. Continue opened the existing sent lead's builder without a PATCH or stage reset.
- **AC5:** Old payment/follow-up content was absent. Manual stage changes retained the guide. Authorized Project status opened and restored focus on Escape; Messages opened the same project and browser Back returned to its lead. Standalone leads showed no project-only controls. Automated shared tests verified unchanged payment/workflow/chat behavior and quick-review history.
- **AC6:** Inspected desktop 1440x1000, tablet 768x1024, mobile 390x844, narrow 320x800, and 720x500 effective 200% zoom layout. No horizontal document overflow, clipped controls, or clipped long headings. Long project/contact values were also checked at 1440/768/390/320 widths. Browser axe checks of new and Continue main regions returned zero violations. Final console inspection returned zero errors and warnings; there were no unexpected synthetic API requests. Screenshots were visually inspected, including creation, Continue, long-text, and standalone states.
- **AC7:** All listed automated and hygiene checks passed. The independent integrity reviewer reported no confirmed defects.

Browser report and screenshots: `/tmp/lisno-unified-estimate-landing-qa/browser-report.json`, `created-desktop.png`, `continue-mobile.png`, `desktop.png`, `tablet.png`, `mobile.png`, `narrow.png`, `zoom-200-equivalent.png`, `long-320.png`, and `standalone-mobile.png`. Task-created `.playwright-cli` artifacts were moved out of the worktree into that directory's `cli/` subdirectory. The disposable browser was closed after verification.

### Verification limits and external actions

The full frontend suite was not run after the focused/shared checks passed. Backend, replica-set, OCR, and migration checks were not run because those implementations/contracts are unchanged. No lint command exists. Browser QA used synthetic local data and viewport-equivalent zoom, not a live backend, native browser zoom, physical mobile device, or performance benchmark.

No dependencies or lockfiles changed. No backend writes, data migration, seed, deployment, commit, push, or external communication was performed. Remaining known limitation is the build's large-chunk warning; no unresolved defect was found in the requested change.
