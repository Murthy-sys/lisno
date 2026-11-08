# Estimation: actionable Submit with clear validation

Date: 2026-11-08
Status: Implemented and verified; results recorded in the task plan

## Goal

Keep every existing visible estimate Submit action clickable for every role that
sees it. Clicking either continues the established submission flow or explains
exactly what needs attention. A user must not be left with a disabled button.

This supersedes the disabled-Submit behavior in the Designer Submit-only spec,
including the unchanged initially approved estimate state.

## Current behavior and evidence

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx:723` combines validation,
  query readiness, saved-version consistency, permissions and workflow capability
  into `submitAllowed`. The footer at line 1344 uses it as `disabled`.
- The adjacent ready-for-client action also uses `disabled={!sendAllowed}`;
  for Designers this action is labelled Submit.
- `requestPublication` and `executePublication` return silently when their
  eligibility checks fail. Removing the HTML disabled attribute alone therefore
  would leave a button that appears active but does nothing.
- The blocker at line 744 interprets any false Designer `canStartSubmission` as
  an assignment problem. Missing capabilities, an ineligible saved state and
  actual assignment denial are not distinguished there. Item errors are checked
  later, so this message can obscure another correction the user needs to make.
- `EstimateSubmissionChecklist.tsx` also disables Confirm and submit/send until
  all declarations and eligibility checks pass.
- The screenshot establishes this disabled-button behavior, but does not expose
  the actor, project assignment or API response. An incorrect assignment cannot
  be diagnosed from the screenshot alone. Its missing configured-price label
  also does not establish that a valid manual selling price is prohibited.
- Client quotation screens currently offer Save changes and Review quotation,
  then approval/change-request actions. They do not use this staff Submit flow.

## Required behavior

1. Existing visible Submit and equivalent publication buttons remain keyboard-
   and pointer-operable. Do not use disabled styling, `disabled`, or
   `aria-disabled` to suppress these actions because inputs, checklist entries,
   assignment capability, loading state or unchanged content prevent publication.
2. On click, evaluate the current state. If eligible, preserve the established
   Sales checklist and Designer save-then-submit flow. Designer still has no
   separate Save draft; Sales retains both Save draft and Submit.
3. If validation prevents submission, announce a concise explanation and move
   focus to a visible validation summary or the relevant existing control.
   Identify affected items and corrections where available. Offer an existing
   safe recovery action for stale data, failed loading or uncertain saves.
   Avoid adding permanent competing action buttons to the footer.
4. Explain workflow/access restrictions accurately. Do not claim an assignment
   problem merely because a capability is missing or the estimate is unchanged.
   Preserve local edits during refresh, and distinguish pending verification
   from a confirmed restriction. Do not infer permission from the role alone.
5. Clicking Submit on an unchanged initially approved quotation explains that
   the approval is current and no changed quotation needs submission. It must
   not create a duplicate review or save just to manufacture a revision.
6. The Sales checklist retains all three required declarations. Its confirmation
   action remains clickable; an attempted incomplete confirmation identifies the
   missing declarations, focuses the first unchecked entry and performs no write.
   Recheck submission eligibility and the reviewed context before publication.
7. During a pending action, retain an operable button with a clear busy label and
   accessible progress feedback. Repeated clicks must not initiate another save,
   publication, confirmation dialog or delivery attempt. Keep synchronous guards.
8. Preserve existing success, save-failure, publication-failure, uncertain-save,
   version-conflict and retry behavior. Do not report success until publication
   succeeds. Keep configuration, quantity, rate and dimension validation aligned
   with the existing backend contract; descriptive price labels are not new gates.

## Scope, assumptions and non-goals

- Scope: shared staff estimate workspace, its publication checklist, focused
  regression tests and proportionate rendered interaction verification.
- “Any user” means consistent actionable behavior wherever the existing workflow
  displays Submit. It does not grant every role permission to publish or add
  publication controls to Client, historical or closed/read-only views.
- Preserve visibility rules, existing roles, assignments, Client approval/reject
  workflow, immutable approvals and financial source-of-truth rules.
- No pricing-policy changes, assignment changes, migration, schema change,
  production data access, deployment, external delivery or new dependency.

## Data, API and failure impacts

Use current capability and workflow responses. No new endpoint or persistence
field is proposed. Valid submission retains save -> verify returned version ->
publish, with existing CAS, authorization and delivery idempotency. An invalid
click performs no mutation. Recovery reads must not discard unsaved input.

## Risks and constraints

- Removing only button attributes would create silent no-op interactions; the
  event handlers and accessible feedback must change together.
- Repeated clicks and stale confirmation state must not duplicate or misdirect
  publication. Preserve actor/project/estimate/version identity checks.
- Several prior tasks already modify these files. Record and preserve their
  current diffs before implementation; do not overwrite unrelated work.
- The screenshot's exact capability failure remains unverified without its API
  state. Do not conceal a real server restriction or invent an assignment fix.

## Acceptance criteria and verification

- Sales, Designer and any other role already offered publication can focus and
  activate its visible action, including when validation currently fails.
- Valid Sales and Designer submissions still reach the existing Client-review
  flow with the expected saved version; Sales declarations remain mandatory.
- Invalid/empty inputs, unavailable configuration, permission/capability denial,
  unavailable capability data, unchanged approval, loading and stale-version
  states produce accurate actionable feedback and no publication writes.
- Incomplete checklist confirmation focuses an unchecked declaration and writes
  nothing. Changed context cannot publish a previously confirmed version.
- Rapid repeated clicks produce at most one save/publication sequence. Existing
  failed/uncertain-save and publication-retry tests continue to pass.
- Rendered keyboard and desktop/mobile checks verify reachable controls, focus,
  announcements and readable feedback without overflow. Run focused workspace
  and checklist regressions, frontend typecheck/build, and `git diff --check`.

## Open decisions

None required for this scope. Backend permission expansion or pricing-policy
changes would require a separate explicit requirement.
