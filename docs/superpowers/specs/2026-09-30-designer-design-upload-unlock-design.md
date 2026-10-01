# Designer design upload after furniture dimensions

## Goal

An assigned Designer can upload the first design plan when the project has reached “Designer Uploading Space planning with Tentative look and Feel”. The stage must show as active after the required earlier work is complete. Client review and final stage completion remain separately gated.

## Current behavior and evidence

- The reported workspace shows the first five stages completed, the sixth stage locked, an assigned design task at version `v0`, and no file picker. Its next action says the current Design review source is unavailable or inconsistent.
- `DesignerDesignPlanTasksPage.tsx` renders the upload section when the sixth stage is current, but sets it read-only if `operational.status` is `blocked` or `operational.blockingReasons` is nonempty. It also uses the first blocker as the selected project's next action.
- `projectOperationalStage` in `design-workflow-state.service.ts` puts `workflowSubmissionBlockers(state)` and `spacePlanning.blockingReasons` into the sixth stage's general blockers. The former is the final submission gate. `workflowSpacePlanningSource` considers an assigned, version-0 plan without a review round unready for *completion* and emits the reported source message. That message therefore blocks the first upload in the UI.
- The upload service calls `assertEstimateDesignWorkflowAllowed(..., { phase: "upload" })`, which intentionally uses an earlier gate. Final submission and `space_planning_complete` use stricter checks. The existing furniture approval specification also preserves draft uploads before final submission.
- Frontend tests currently cover a writable sixth stage fixture with no completion blockers and a blocked stage with a genuine site-access reason; they do not cover a real assigned `v0` review source.

This is a source-code diagnosis. No live project record, network response, or production data was inspected.

## Scope and requirements

1. Separate **stage/upload availability** from **Client completion readiness** in the sixth-stage projection. The normal absence of a submitted review round for an assigned `v0` plan must not mark the active Designer upload stage as blocked or hide its file picker.
2. Preserve actual upload blockers: unconfirmed initial payment, earlier workflow prerequisites, paused site access, an unavailable or ambiguous canonical approved-estimate source, missing assignment/permission, and workflow fetch errors. The UI must not assume eligibility from the five green timeline marks alone.
3. Keep final submission and Client completion fail-closed. Furniture acceptance and required dimension approvals, current review-round identity, current image approvals, feedback resolution, immutable approval evidence, version checks, and Client-only acknowledgement retain their existing backend enforcement.
4. Show an actionable next step such as “Upload the design plan” for an eligible first-upload state. Show review and approval requirements as **completion requirements**, without presenting an expected `v0` review state as corrupted source data. Genuine source conflicts retain an explicit reconciliation message.
5. Once files are uploaded, preserve the current extraction, image review, change-request, retry, and read-only submitted/approved behavior. Continue to render saved images during a temporary workflow refresh failure while disabling edits.
6. Keep the sixth stage and selected-project workspace synchronized after workflow and design mutations, including project switching. Backend authorization remains authoritative; the frontend must not bypass a rejected upload.

## Recommended approach and contract

Use the existing workflow and upload endpoints. Derive sixth-stage activation and upload blockers from the established `phase: "upload"` workflow rules and stage prerequisites. Keep completion-only reasons in a distinct, optional projection for the sixth stage, with wording appropriate to an unsubmitted plan. `operational.status` and its general `blockingReasons` should describe whether work on the stage can begin, while the existing Client action and `readyForCompletion` continue to describe whether it can finish. The designer page should consume the backend's phase-aware eligibility and its own task status; missing or failed eligibility data stays read-only.

A frontend-only exception for the review-source message would be narrower to code, but it would leave the timeline incorrectly locked and make the browser interpret backend error text as authorization. The phase-aware backend projection is the recommended fix.

Any added DTO field is optional for compatibility with older responses, is aligned in frontend API types, and contains no private file references or proof data. Keep memory and Mongo source resolution consistent. No persisted schema change, migration, new dependency, route, or permission expansion is expected.

## Assumptions and constraints

- The screenshot is an assigned Designer viewing the canonical approved estimate for the selected project. The five completed markers reflect persisted workflow state, but implementation must verify that state through the backend response.
- An assigned `v0` plan with no review round is a normal pre-upload state. A malformed or conflicting source with nonempty review artifacts is not treated as normal merely because its version is zero.
- The sixth stage remains incomplete until the existing explicit Client acknowledgement; opening upload cannot complete it or create a review round.
- Preserve unrelated workflow stages, historical floor-only projection behavior, project/estimate identity checks, and all audit/history records.

## Risks and failure handling

- Splitting blockers could accidentally enable edits during a true pause, incomplete prerequisite, or source conflict. Regression tests must cover each separately and verify the API still rejects prohibited writes.
- Treating an invalid `v0` source as ordinary could conceal corrupted review history. Only the expected pre-submission state receives normal guidance; mixed or foreign artifacts remain fail-closed.
- A shared workflow response may be temporarily stale after an upload or submission. Invalidate affected workflow and design task queries and keep edits disabled after a failed refresh.

## Acceptance criteria

1. With an assigned `v0` design task, five completed prerequisite stages, active payment, unpaused workflow, and a canonical source, the sixth stage appears active, the next action directs upload, and the Designer can choose and submit a plan file on desktop and mobile.
2. The same state does not expose Client stage completion. After valid upload, submission, image approvals, and recorded Design approval, only the eligible Client receives the existing completion action.
3. A blocked earlier stage, paused site access, unconfirmed payment, ambiguous/mismatched source, unassigned Designer, or failed workflow load does not expose writable upload controls. The displayed reason identifies the actual blocker.
4. The established backend upload-phase rule for draft files is not tightened. Final Client-facing submission and stage completion remain blocked until furniture and review requirements pass; this fix does not change when the Designer page first displays the sixth stage.
5. Submitted/approved designs remain read-only; change-request editing and extracted-image review continue to work. Switching selected projects never shows another project's upload state or files.
6. Focused backend projection/source tests, frontend page tests, typechecks, builds, and rendered keyboard/responsive checks pass. Repository hygiene shows only intended changes.

## Open decisions

None required for the proposed behavior. Exact placement of the optional completion-reasons field can be settled in the task plan without changing these acceptance criteria.
