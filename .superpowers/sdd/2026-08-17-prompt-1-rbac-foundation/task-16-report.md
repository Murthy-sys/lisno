# Task 16 report — Project access request interface

## Scope

- Plan task: Task 16 only.
- Base HEAD: `c5623360d83f1c7e0b1163cf938429da064cd855`.
- Commit: this commit, subject `feat: add project access request interface`.
- Added the six typed access-request/grant client methods, request history and creation UI, reviewer inbox, decision dialog, and grant revocation dialog.
- Replaced only the `/admin/access-requests` and `/access-requests/mine` staged elements. No Worker assignment/reassignment UI or API, Task 17 behavior, Prompt 2 behavior, or Client behavior was added.

## API and page behavior

- Own/review list URLs serialize optional `status`, optional `module`, `limit`, and `offset` in that fixed order. All six client functions use the approved server DTOs and encoded row identifiers.
- Designer, Procurement, Finance Head, and Site Manager can request only the one module allowed by the authorization contract. Super Admin receives read-only self history without Create, module, Cancel, or navigation affordances. All other roles are denied before the mine API runs.
- Request validation uses the backend-compatible opaque ID grammar and exact 1–1000-character trimmed reason boundary. Prefill additionally requires current-role module eligibility and the authorization snapshot's create permission.
- Accepted known, hidden, unknown, and duplicate opaque IDs produce the same receipt without title, existence, or resolution language. Opening a new request dialog clears the prior live-region receipt so an identical duplicate 202 produces a fresh blank-to-generic-receipt announcement.
- Own rows render only supplied opaque fields, status/reasons, version, and distinct Created, Updated, and optional Reviewed timestamps. Pending cancellation sends the displayed version and never replays a 409.
- The review inbox relies on server scope. Admin empty copy refers only to projects the Admin can review; Super Admin can distinguish server-resolved names from supplied unresolved IDs. Approval/rejection uses immutable request ID/version, and revocation uses immutable grant ID/version.

## Concurrency and non-disclosure

- No mutation is optimistic. Every 409 leaves its dialog/row server-derived, invalidates the relevant list, and never automatically replays.
- An open decision stays bound to the selected request snapshot. A refetch must retain the same pending request version or the action fails closed and requires the reviewer to close the dialog and choose the fresh row.
- An open revocation stays bound to the selected grant snapshot. A same-request refetch with a different grant ID or version cannot retarget the dialog or submit against the replacement.
- Unknown-project approval remains pending with the generic server error. Unknown-project rejection renders only the generic server-stored decision reason, never the reviewer's internal reason.
- Reviewer pages expose no Worker assignment/reassignment controls for Admin or Super Admin.

## TDD evidence

Initial RED:

- The three literal access-request suites failed before production implementation: 3/3 files failed with 21 planned failures while 14 existing presentation-denial cases passed because the two routes still rendered staged content.

Review-regression RED:

- Both identity races failed against the vulnerable same-ID row substitution: a non-pending refetch left the stale decision enabled, and a replacement active grant retargeted the open revocation.
- The own timestamp regression failed because Updated and Reviewed were absent.
- The duplicate receipt regression failed because the prior identical live-region text remained committed and FeedbackProvider suppressed a new announcement.

Focused GREEN:

- Access-request page/dialog suites, router compatibility, navigation, and accessibility: 6/6 files, 187/187 tests passed.
- Frontend `npm run typecheck`: passed on the final tree.
- `git diff --check`: passed on the final tree.

## Full verification

- The single fresh full frontend suite after the main self-review passed: 73/73 files and 781/781 tests in 12.47 seconds.
- A final review then required the isolated live-region reset described above. After that change, the affected duplicate regression and the full 187-test focused/router/navigation/accessibility group passed again, along with frontend typecheck and diff check. No second full suite was run, preserving the task's exactly-one-full-suite constraint.

## File-map exception and boundaries

- `frontend/src/app/router.test.tsx` is the pre-authorized narrow compatibility addition: its session fixture now returns successful empty mine/review pages, and its old staged-copy assertion now proves the real pages reach their successful empty states. It changes no production authorization fixture, registry metadata, or permissions.
- Backend authorization, opaque-ID non-disclosure, Admin project scope, reviewer eligibility, optimistic version checks, grant issuance/revocation, and persisted reasons remain authoritative. The frontend displays server DTOs and server errors without independently resolving projects.
