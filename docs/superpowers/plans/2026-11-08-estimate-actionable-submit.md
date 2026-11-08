# Estimation: actionable Submit implementation plan

Date: 2026-11-08
Status: Implemented and verified
Specification: [Approved specification](../specs/2026-11-08-estimate-actionable-submit-design.md)
Specification approved in conversation on 2026-11-08.

## Contract and boundaries

Every existing visible staff estimate publication action stays clickable.
Eligibility still controls whether a mutation can run. Invalid clicks produce
accurate, accessible feedback; valid clicks follow the existing Sales checklist
or Designer save-then-submit sequence. Preserve backend authorization, versions,
approval history, recovery behavior and all current financial validation.

No backend/API, schema, assignment, pricing-policy, Client-screen, dependency or
shared Button changes are planned. In particular, the shared Button intentionally
disables itself when passed `busy`; the checklist will use a local busy label and
`aria-busy` without changing that shared contract.

Only one parent task is in progress at a time. Implementation begins after plan
approval and execution-mode selection. In Mode A, the two implementation slices
below can run concurrently within the implementation parent task. In Mode B,
the primary agent performs all work sequentially.

## 1. Capture the baseline and settle local feedback integration

Owner: primary agent. Depends on execution authorization.

- Capture the initial dirty-path list and relevant file diffs before writers
  start. Inspect prior changes in every assigned dirty file and preserve them.
- Reproduce existing disabled-submit cases with focused current tests. Record
  failures already present and distinguish them from this change.
- Trace all visible staff Submit/send variants and their eligibility checks.
  Separate missing capability data from explicit denial and unchanged approval.
- Settle the narrow workspace/checklist interface before parallel work: keep
  `canConfirm`, busy, action and callback semantics; add an optional descriptive
  confirmation-blocker prop only if needed. Never pass authority through copy.
- Reuse existing focus, dialog, notice and recovery conventions. A blocked click
  focuses a concise validation summary or the relevant existing control. Avoid
  automatic refresh that could discard local edits or repeat mutations.

Acceptance: approved specification requirements 1–4 and 8 are mapped to existing
code; ownership and any optional checklist prop are communicated to both slices.

## 2. Implement actionable publication controls

### Slice A: workspace controls, validation and integration tests

Owner in Mode A: frontend implementer A. Primary agent owns this slice in Mode B.

Exclusive file ownership:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.checklist.test.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx`
- Other `LeadEstimateWorkspace.*.test.tsx` files only when their affected Submit
  expectations need updating; coordinate additions to the ownership list first.
- Narrow workspace feedback styling, if necessary, in
  `frontend/src/styles/estimator-dashboard.css` after reviewing its existing diff.

Tasks:

- Remove disabling behavior from visible publication controls, including the
  Designer ready-for-client Submit variant. Keep visibility and Save draft rules.
- Change click handlers so blocked attempts explain the current condition and
  focus feedback instead of silently returning. Identify invalid items where
  available; do not create a new missing-configured-price gate from UI labels.
- Explain unchanged current approval without saving/publishing. Distinguish
  unavailable access data from confirmed restrictions; avoid unsupported claims
  about the current assignment. Use existing safe recovery controls.
- Retain synchronous in-flight protection and current reviewed-context checks.
  Busy buttons remain operable and report progress while duplicate clicks do not
  create further work. Preserve invalidated-confirmation focus/feedback.
- Keep save failure, saved-but-unpublished recovery, unknown-save verification,
  version conflicts and publication retries intact.
- Replace disabled-button expectations with meaningful click-and-no-write,
  feedback and focus assertions. Add cases for missing capabilities, confirmed
  denial, unchanged approval, invalid data, pending actions and ready-for-client.

Acceptance: specification requirements 1–5, 7–8, valid Sales/Designer publication
and existing role/visibility boundaries.

### Slice B: checklist confirmation and component tests

Owner in Mode A: frontend implementer B. Primary agent owns this slice in Mode B.

Exclusive file ownership:

- `frontend/src/features/leads/EstimateSubmissionChecklist.tsx`
- `frontend/src/features/leads/EstimateSubmissionChecklist.test.tsx`
- `frontend/src/features/leads/estimateSubmissionChecklist.css`, only if needed.

Tasks:

- Keep Confirm and submit/send clickable for unchecked declarations, blocked
  eligibility and busy states. Keep all three mandatory declarations unchanged.
- On incomplete confirmation, announce what remains and focus the first
  unchecked declaration. Confirm only when all declarations, current eligibility
  and non-busy state permit it. Use the agreed parent feedback contract.
- Render local progress text and accessible busy state without the shared
  Button's disabling `busy` prop. Preserve dialog dismissal protection while a
  mutation is running and normal return-focus behavior.
- Test keyboard activation, incomplete confirmation, focus, `canConfirm=false`,
  busy activation, checked success and reset on reopening for both actions.

Acceptance: specification requirements 1, 6–7; no callback on blocked confirmation.

Parallel safety: A and B may run concurrently only after step 1 settles their
interface. Neither writer edits the other's files, backend files or shared UI
components. Writers must preserve existing edits by other contributors.

## 3. Integrate and review

Owner: primary agent; Mode A uses `integrity_reviewer` after both writers finish.

- Inspect the combined diff against the captured baseline and approved spec.
- Check every visible publication action remains operable and every ineligible
  attempt has feedback. Confirm no permission, pricing or approval bypass.
- Review stale actor/project/estimate/version changes, repeated clicks, checklist
  invalidation, focus restoration and uncertain-save/publication recovery.
- Resolve findings before final verification. Record any scope change rather
  than silently adding backend behavior or altering pricing rules.

## 4. Verify the integrated result and hand off

Owner: primary agent; Mode A uses `verification_runner` for final checks after
writers and review fixes finish. Browser fixture work, if needed, has exclusive
temporary paths and does not change product sources.

Run from `frontend/`:

```sh
npm test -- src/features/leads/EstimateSubmissionChecklist.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx
npm run typecheck
npm run build
```

Run `git diff --check` and `git status --short` at the repository root. Broaden
testing only for changed dependencies, failures or unresolved risks. There is no
lint script. No backend full suite is required for this frontend-only contract.

Rendered verification at desktop and mobile widths must cover:

| Acceptance area | Required evidence |
| --- | --- |
| Clickable actions | Sales and Designer invalid/valid/busy Submit and Designer send variant are reachable by keyboard and pointer. |
| Blocked attempts | Invalid input, empty selection, unavailable configuration, missing/denied capability, loading, unchanged approval and stale versions produce feedback without publication. |
| Checklist | Missing declarations receive focus; checked valid confirmation proceeds; changed context cannot publish. |
| Successful submission | Save returns the version used for publication; Sales declarations and Designer direct submission retain their established flows. |
| Recovery and repetition | Rapid clicks produce one sequence; save failures, uncertain saves and publication retries preserve edits and versions. |
| Layout/accessibility | Feedback is announced and focused, controls have accessible names, and desktop/mobile layouts do not overflow. |

Use synthetic data and mocked APIs for browser scenarios; no real Client
publication or email delivery. Keep temporary fixtures/artifacts isolated and
remove owned artifacts after recording results. Report exact checks/results,
unrun checks, affected files, remaining limitations and any ignored build output.
Do not commit, push, deploy, migrate, seed or modify production.

## Execution record

Task plan approved and Mode A selected in conversation on 2026-11-08.

- Baseline captured in `/private/tmp/lisno-actionable-submit/initial-status.txt`
  and `initial-diff.patch`; existing workspace/checklist changes reviewed.
- Step 1 complete. Optional `blockingReason?: string` is the agreed checklist
  integration prop; shared Button behavior remains unchanged.
- Step 2 complete: `actionable_workspace` owned slice A and
  `actionable_checklist` owned slice B. Both have handed back source ownership.
  `actionable_browser` is checking an isolated synthetic-data harness.
- Baseline workspace regressions passed 59/59 before workspace edits.
- Checklist slice complete: 10/10 component tests, frontend typecheck and
  `git diff --check` passed. Its confirm control uses a local native button with
  existing UI classes because the shared Button overrides `aria-busy` as well
  as disabling itself for `busy`; no shared component contract was changed.
- Step 3 found one invalidation-feedback defect: an external transition to
  read-only could hide the explanation when closing the Sales checklist. The
  primary agent retained explicit invalidation feedback independently of Submit
  visibility. Two regressions pass for Items and Configure, including focus,
  hidden Submit and zero writes from stale confirmation.
- Step 4 complete. No backend or shared UI code was changed by this task.

## Final verification and outcome

Visible staff Submit/publication buttons now remain operable. Blocked clicks
focus a concise correction; item errors include affected names, missing access
data is distinguished from a restriction, and unchanged approval explains that
no new review is needed. Sales confirmations remain mandatory, Designer keeps
one Submit action, and repeated busy clicks do not duplicate mutations.

Changed files for this task:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/EstimateSubmissionChecklist.tsx`
- Their checklist, collaboration and main workspace tests, plus the checklist
  component test (four test files total).
- `frontend/src/features/leads/estimateSubmissionChecklist.css`
- Six scoped feedback-style lines in `frontend/src/styles/estimator-dashboard.css`
- This plan and its specification.

The final commands listed in step 4 passed:

- Six focused frontend suites: **151/151 tests passed**, exit 0.
- Frontend typecheck: exit 0.
- Frontend production build: exit 0; 3,335 modules transformed. Existing chunk
  size warning remains; main JS is 3,288.54 kB. Bundle splitting was not in scope.
- `git diff --check`: exit 0. Working tree remains intentionally dirty with
  preserved earlier work; no staging or commits.
- A combined hash of 1,311 frontend/shared source and configuration files stayed
  unchanged through final automated verification.
- Independent integrity review: no unresolved confirmed defects after the
  read-only transition feedback correction.

Browser verification passed **14 scenarios** at 1440px and 390px: Sales/Designer
invalid clicks, unchanged approval, missing capability, Sales declaration focus
and valid submission, Designer repeated busy clicks, and Designer send-ready
submission. Invalid cases wrote nothing; save/publication used expected versions
7 then 8; send-ready used version 7 exactly once. No document overflow, unmatched
mock requests, console errors or page errors. Representative desktop/mobile
feedback and mobile checklist screenshots were inspected by both agents.

Browser scope: real components with a synthetic legacy-line fixture and mocked
APIs. Configured-item validation and final read-only transition were covered by
rendered regression tests; that transition was not separately browser-simulated.
Playwright CLI sessions closed unexpectedly, so the installed Playwright/Chrome
runtime ran the scenarios in one owned process. No dependency or test runner was
added. Fixture-only navigation-prompt suppression avoided tooling hangs;
beforeunload behavior was not part of these browser scenarios.

Temporary fixtures, screenshots, exact owned CLI artifacts, baseline snapshots
and diffs were removed after recording results. Owned browser/server processes
were stopped. Ignored build outputs refreshed: `frontend/dist/` and
`frontend/node_modules/.tmp/`.

Not run: full frontend suite, backend/OCR suites, migrations, lint (no script).
No backend/API, dependency or permission-policy changes; no real publication,
email, seed, migration, deployment, commit or push was performed. The screenshot's
exact live capability state was not available; the UI now explains the current
validation/access result without inventing an assignment diagnosis.
