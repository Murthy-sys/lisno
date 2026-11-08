# Mandatory Client Kickoff and relevant stage content

Date: 2026-11-08
Status: Implemented; verification results and limitations recorded in the task plan

## Goal and scope

Client Kickoff is mandatory. Remove “Mark meeting not necessary” and the ability
to bypass completion. Keep the stage focused on the next relevant action and the
information needed to complete it.

Scope includes Client Kickoff, its backend action validation and prerequisite
checks, related Key Collection/design-submission guidance, and role-specific
workflow consumers. Preserve the preceding quotation/recommendation changes.

This is not a general cleanup of unrelated project stages. Existing-furniture
applicability, optional measurement evidence and vendor “not requested” statuses
have separate meanings and remain outside this change.

## Current behavior and evidence

- `backend/src/services/design-workflow-state.service.ts:38` defines the Designer
  skip action. Its eligibility at line 216 allows it until kickoff is complete.
  The mutation at line 613 requires a reason, sets `notRequired = true` and writes
  `completedAt`. Hiding the button alone would leave a backend bypass.
- `backend/src/domain/design-workflow-state.ts:145` derives downstream activation
  from predecessor completion timestamps. Its prerequisite/submission checks at
  lines 165–183 currently accept the skip timestamp and explicitly suggest it.
- `backend/src/domain/design-workflow-instructions.ts:61–84` also advertises
  skipping in completion, timing, dependency and Key Collection guidance.
- `frontend/src/features/workflow/WorkflowStageActions.tsx:95` renders returned
  actions, includes skip-specific reason handling and names the action in history.
- Normal completion already verifies the exact submitted Internal Kickoff
  document event. Client/authorized-on-behalf permissions, evidence, workflow
  versions, idempotency and audit records are established behavior.
- The scoped search found no literal “Not requested” message in Client Kickoff.
  Such statuses exist elsewhere for vendor access/payments. The cleanup therefore
  targets irrelevant kickoff content, rather than globally deleting that phrase.
- Historical state supports `notRequired` and historical skip events. No live
  project data has been read, and no claim is made about how many such records exist.

## Required behavior

### Mandatory completion

1. Never offer or execute a new `client_kickoff_not_required` action for any role.
   Reject direct API requests and stale UI attempts without state, version,
   history, audit or downstream side effects. Keep service-level enforcement as
   well as input validation; a hidden control is not enforcement.
2. Use one consistent definition of effective Client Kickoff completion across
   available actions, stage projection, prerequisites and design upload/submission
   gates. A record marked `notRequired: true` is not a completed mandatory kickoff.
3. Preserve the existing legitimate flow: Designer requests coordination, Client
   schedules when applicable, and Client completes after reviewing the submitted
   document. Existing authorized on-behalf completion keeps its evidence and
   identity checks. No new calendar, upload or sign-off step is introduced.
4. Key Collection and later dependent operations cannot begin or newly advance
   based solely on the retired skip. Normal successful completion opens the same
   existing downstream gates, once, with current version/idempotency protection.

### Historical skipped stages

5. Preserve historical skip events, actor identity, notes, evidence and timestamps
   as history. Keep legacy action identifiers readable even if they are excluded
   from the active write contract. Reads must not rewrite stored records.
6. For a skip-only record, show that Client Kickoff still needs completion and
   provide the existing valid request/completion path. Successful normal
   completion clears the active exemption and records a new completion event;
   the earlier exemption remains in history.
7. Do not undo downstream completed work, change issued artifacts or approvals,
   erase audit evidence, or run a backfill. Future dependent writes must satisfy
   mandatory kickoff. Preserve previously recorded deadlines and timing evidence;
   any required recovery must not fabricate a new past completion or reset SLA
   history. Actual legacy completions without an exemption remain valid under
   the existing compatibility rules.

### Relevant actions and copy

8. The Designer's initial main action is **Request Client kickoff**. Once
   requested, show the relevant scheduling/waiting information instead of the
   skip control. Client and representative views show only their authorized next
   actions; completed stages show their recorded completion.
9. Remove all current-flow instructions, blocker text and timing descriptions
   that say kickoff can be skipped or marked unnecessary. Use direct wording,
   such as “Complete Client Kickoff before starting this stage.”
10. Remove skip-specific reason forms and success messages from active UI paths.
    Defensively suppress the retired action from stale payloads and close any
    now-invalid selected action form. Retain a clearly historical label for old
    events in the collapsed action history.
11. Keep Stage information concise and relevant: prerequisites, next owner,
    submitted document, recorded meeting facts, meaningful blockers and history.
    Omit empty or repeated skip-related content. Preserve errors, refresh,
    evidence access, required confirmations and accessibility instructions.
12. Use existing controls/styles. Maintain keyboard focus when actions change,
    useful loading/blocked/completed states, and mobile wrapping. No new visual
    redesign, dependency, icon package or decorative behavior is required.

## Contracts and invariants

- Backend permissions remain authoritative. No role gains completion authority.
- Keep project/stage IDs, reviewed document-event binding, actor/on-behalf proof,
  CAS versions, transactions, audit and deduplication intact.
- The retired action can remain in historical read types, but active action
  registries and validation must consistently exclude/reject it. Keep canonical
  route-operation/OpenAPI inventory consistent with the actual existing route.
- Keep memory and Mongo repository behavior aligned. No persistence rewrite,
  migration, seed, production mutation, deployment or customer communication.
- Preserve valid existing furniture and other stage exceptions; only Client
  Kickoff loses its exemption.

## Assumptions and decisions for approval

- “Not relevant to flow” means the shown kickoff stage and directly related
  guidance, not removal of unrelated business functionality throughout the app.
- Mandatory completion also applies before **new dependent work** on historically
  skipped projects. Existing history and completed downstream work are preserved.
  This prevents old exemptions from silently remaining a bypass.
- Existing request/scheduling options and document-based completion remain the
  valid flow; this change does not make a new meeting-date field mandatory.
- No additional product decision is needed within these boundaries. Historical
  compatibility is the main implementation risk and must be explicitly tested.

## Acceptance criteria and verification

1. **AC1: No bypass.** No active role view offers the retired action, including a
   stale response; direct route/service attempts cannot mutate state or audit.
2. **AC2: Valid flow.** Request/schedule/document-review/completion still work for
   their existing actors. Wrong actor/project/document, missing proof, stale
   version and repeated submissions retain their established protections.
3. **AC3: Mandatory gates.** Missing or skip-only kickoff blocks new dependent
   actions, uploads and submissions; legitimate completion unblocks them once.
   Test at least two independent projects with different kickoff states.
4. **AC4: History.** Legacy actual completion remains valid. Legacy exemption is
   readable but cannot authorize new dependent work; it can be followed by proper
   completion without losing historical events or altering completed artifacts.
   Reads do not write or silently rebase recorded deadlines.
5. **AC5: Relevant UI.** Main action row, Stage information, timing descriptions
   and blockers no longer advertise skipping. Required documents, history,
   errors and recovery remain accessible. Verify Designer, Client and on-behalf
   views, keyboard behavior, and 1440×900 / 390×844 rendered layouts.
6. **AC6: Regression.** Focused domain/service/route/initialization/submission-gate
   tests, transactional replica-set tests where the mutation path changes,
   workflow UI tests, backend/frontend typecheck and builds, appropriate broader
   regressions, and `git diff --check`. Record actual results and limitations;
   do not use the prior frontend suite's known failures as a green baseline.

## Worktree and likely affected areas

The captured initial status contains the previous Sales/client-action and
single-item recommendation edits (31 modified files plus their new helpers,
tests and workflow documents). This task's principal domain, service,
instructions and workflow UI targets are currently clean; their target diff
was checked before specification. Preserve all prior work.

Likely areas are `backend/src/domain/design-workflow-state.ts`,
`backend/src/domain/design-workflow-instructions.ts`,
`backend/src/services/design-workflow-state.service.ts`, their route/contracts
and focused tests, `frontend/src/features/workflow/WorkflowStageActions.tsx`,
`projectWorkflowApi.ts`, and workflow presentation tests. Create the separate
task plan only after this specification is approved.
