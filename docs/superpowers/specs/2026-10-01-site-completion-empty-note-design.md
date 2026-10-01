# Site completion with an empty note

## Goal

Allow a Site Manager to save project execution progress, including 100%, when the optional completion note is blank. Allow the same saved progress to be submitted for Client review when all existing completion prerequisites are met.

## Current behavior and evidence

- The Site Manager screen sends `PATCH /projects/:projectId/site-completion/progress` with `progress: 100` and `note: ""` when the note is blank. The form does not mark the note required.
- The request schema accepts an empty note and defaults an omitted note to `""`. The submission schema also accepts an empty note.
- `SiteCompletionState` and `SiteCompletionReview` define `note` as a Mongoose required string. Mongoose considers `""` missing for that validator. A read-only local validation of new records returned `note` errors for both models.
- The first save creates a `SiteCompletionState` record. Its model validation fails, and the generic error handler returns the unexpected-error message shown in the screenshot. Existing integration coverage supplies nonempty notes, so it missed this path.

## Scope

- Align the two completion persistence models with the existing optional-note API and UI contract.
- Add focused regression coverage for the first 100% save with an empty note and subsequent empty-note submission, using the transactional Mongo test lane where available.
- Preserve the current progress, submission, Client decision, and final closure workflow.

## Non-goals

- No changes to purchase orders, vendor assignments, estimate scope, completion eligibility, project status, or screen layout.
- No migration, production data write, or alteration of existing completion records.

## Requirements and constraints

- Persist an explicit empty string for a blank note; keep the 2,000-character limit and trim behavior at the API boundary.
- A valid first draft save at any percentage from 0 to 100 must not fail solely because the note is blank.
- A 100% save must retain the current assignment verification snapshot, version check, idempotency behavior, project authority increment, and audit entry.
- Submission must still require saved 100% progress and all current backend prerequisites. A blank note alone must not block an otherwise eligible submission.
- Keep Site Manager and Client authorization, immutable review history, and transaction semantics unchanged.

## Data, API, and UX impact

- Data: `note` remains a string in saved completion state and review documents; `""` is a valid value. Existing records remain readable.
- API: request and response shapes stay the same. Successful first saves return updated progress and version rather than a generic 500.
- UX: the existing optional note and buttons remain; the saved percentage updates after success.

## Risks and verification

- Changing model validation could affect both draft creation and review creation. Test both paths with a blank note, plus a nonblank control case.
- Recheck that a save remains transactional and that normal blockers still govern the send action.
- Run focused backend tests, backend typecheck, the relevant frontend panel test, and `git diff --check`. Use the integrated replica-set test if its local Mongo prerequisites are available; report any unavailable check precisely.

## Acceptance criteria

1. On an eligible active project with an assigned Site Manager, saving 100% progress with no note returns success and reloads as 100% with `note: ""`.
2. An otherwise eligible saved 100% state can be submitted to the Client with no note, creating one review round with `note: ""`.
3. Existing blockers, authorization, version conflicts, idempotency, audit records, and project closure rules behave as before.
4. Notes over the API length limit remain rejected, and nonempty notes continue to persist.

## Open decisions

None. The current screen and API already establish that the note is optional.
