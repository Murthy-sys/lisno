# Web Messages implementation plan

Date: 2026-09-24
Status: Specification and task plan approved; Mode A selected. All implementation, integration, integrity review and local verification tasks complete. No deployment or production action performed.
Source of truth: [Approved specification](../specs/2026-09-24-web-message-actions-design.md).

## Outcome and scope

Deliver conversation participant removal/restoration, adjacent mention name/role labels, Client-accessible tracked Action/Escalation creation, Super Admin addition of reusable action types, and authorized editing of the canonical project name from Messages.

Reuse existing chat issue history, Open/Resolved status, permissions, transactions, idempotency, realtime events and frontend controls. Preserve all unrelated dirty work. No formal project-task automation, new notifications/reminders, mobile UI redesign, dependency addition, deployment, seed, live migration or commit is included.

## Dependency-ordered work

| Task | Dependencies | Ownership and affected areas | Deliverable and acceptance |
| --- | --- | --- | --- |
| T0 Preserve baseline | Approved plan and execution choice | Primary: worktree status, target diffs, spec/plan evidence | Save initial dirty paths and relevant originals under `/tmp/lisno-web-message-actions-qa/`; identify concurrent ownership before editing dirty chat/auth/project files. |
| T1 Freeze shared contracts | T0 | Primary, with bounded read-only input if Mode A | Confirm request/response shapes, operation keys, exclusion/version semantics, due-date history, type catalogue and rename conflict token. Map every membership and project-name consumer. Share one contract with both writers before parallel edits. |
| T2 Backend behavior | T1 | Backend owner: `backend/src/contracts/project-chat.ts`, chat domain/context/service/routes/repositories/models/OpenAPI, relevant project persistence, authorization/operation/audit registration, notification eligibility and associated backend tests | Transactional exclusions/restoration, catalogue, tracked message metadata/deadlines and narrow canonical rename. Meet AC1 and AC3–AC7. Memory and Mongo behavior agree. No backend path is concurrently assigned to another writer. |
| T3 Web interaction | T1; uses frozen T2 contract | Frontend owner: `frontend/src/features/messages/` implementation, styles and tests only | Participant removal/restoration UI, adjacent mention roles, Actions dropdown/form, Super Admin Add action type, tracked message display/history/deadline editing, rename dialog and realtime/cache handling. Meet AC1–AC6 and AC8. |
| T4 Integration and compatibility | T2 and T3 | Primary: frontend authorization mirror and project queries outside Messages; mobile contract mirrors only where required; cross-stack reconciliation | Verify actual responses match frontend types; operation inventory and all affected caches agree. Existing mobile parsing and legacy clients remain compatible. No duplicate action or rename state. |
| T5 Integrity review and corrections | T4 | `integrity_reviewer` in Mode A; primary in Mode B | Review final integrated changes for revoked access, protected identities, project scoping, duplicate/concurrent writes, deadline history, name propagation and catalogue authorization. Original owner fixes each confirmed issue; reviewer rechecks only affected paths. |
| T6 Final verification and handoff | T5 findings resolved and writers finished | `verification_runner` in Mode A; primary in Mode B. Primary owns browser QA and final reconciliation | Run focused regression/replica-set checks, affected typechecks/builds, rendered interaction/accessibility matrix, compatibility checks and diff hygiene. Record exact results and any limitations; close task-owned preview processes and move temporary QA artifacts outside the repository. |

Only one parent phase is in progress at a time. In Mode A, T2 and T3 may run in parallel because their file ownership does not overlap. Backend removal, action storage and rename share transaction/context/repository files and remain with one backend writer. In Mode B the primary executes these same slices sequentially without implementation subagents. Review and final verification run after integrated implementation, not against a changing worktree.

## Contract decisions to enforce

### Participant removal and restoration

- Keep existing selection-revoke semantics for old callers. Add a distinct conversation exclusion operation, keyed by stable project/user IDs, using expected state/version, reason and idempotency key.
- Apply exclusions centrally when resolving membership, including alternate assignment/grant/selection sources. Re-add explicitly clears the exclusion after current eligibility checks. Keep underlying project assignments and old messages intact.
- Expose removal/restoration availability through backend capabilities. Protect the linked Client, sole active Super Admin and acting manager. Ordinary users cannot read administrative removal reasons or membership sources.
- Audit and publish membership changes transactionally. Verify that conversation lists, summary/messages, uploads/downloads, mentions/assignees, SSE, typing, notification reads and pending email eligibility all use current membership. Existing client denial handling must clear inaccessible cached content/drafts.

### Action catalogue and tracked messages

- Provide stable built-in Action/Escalation types without a seed. Custom types are global persisted names, available through a project-membership-checked listing. Only the sole active Super Admin can create them through a registered operation.
- Validate trimmed 1–60 character names and enforce normalized uniqueness against built-ins and concurrent custom creates. Catalogue creation is idempotent and audited. No arbitrary executable workflow configuration.
- Add optional action metadata to messages: stable type ID/name snapshot and original/current due date. Input supplies a type ID, current assignee and valid calendar date; the backend derives trusted type presentation and initial priority.
- Reuse existing message/issue IDs, versions, Open/Resolved status and issue history. Send and action metadata commit together. Failed/retried sends retain drafts and do not duplicate saved messages.
- Deadline updates require a reason, expected message version and idempotency key. Never overwrite the original due date. Dates remain calendar dates across timezones. Saved tracked items cannot be cleared into untracked messages.
- Existing plain sends and legacy issues remain valid. Optional response metadata must not break older web/mobile consumers; normalize missing fields before rendering.

### Canonical project rename

- Add a narrow operation that writes only the actual project name, authorized for Super Admin or the eligible initiating Admin, with current chat/project scope checked on the backend.
- Use validated trimmed 1–200 character input, an explicit revision/compare-and-set token and deduplicated retries. Avoid introducing a broad project-update API or chat-only name override.
- Audit actor, project ID and old/new name. Preserve stable IDs and historical snapshots. Refresh chat header/list, project summaries/details and active chat subscribers through existing invalidation/event patterns; extend event contracts compatibly if needed.

## UI acceptance details

### Frozen wire contract for parallel implementation

All paths below use the existing `/api/v1` prefix and standard `{data: ...}` envelope. Dates are `YYYY-MM-DD` strings. Additive response fields remain optional for old fixtures/clients; updated backend responses populate them.

- `ChatActionType = { id, name, priority: "important" | "critical", builtIn: boolean }`; built-in IDs `action` and `escalation`. `GET /projects/:projectId/chat/action-types` returns `{items: ChatActionType[], canCreate: boolean}`. `POST` at the same path accepts `{name, idempotencyKey}` and returns the created `ChatActionType` (201). Custom types start Important. Backend operation permissions: existing `chat.read` for GET and new Super Admin-only `chat.action_types.manage` for POST.
- Existing send accepts optional `action: {typeId, dueDate}` and requires `responsibleUserId` when action is supplied. Server validates the type and determines initial priority. A message has optional/null `action: {typeId, typeName, originalDueDate, dueDate}`. Existing message priority, responsible, raisedBy and issueStatus remain authoritative. Issue requests add `action: "reschedule"` plus `dueDate` and reason in `note`; all existing version/idempotency fields remain. History entries may include action metadata snapshots. Add optional `capabilities.canReschedule`.
- Current participant entries gain optional `removalVersion`, `canRemove`, `removalBlockedReason`. Participant page adds optional `removed: Array<ChatPerson & {removalVersion: number; canRestore: boolean}>`, visible only to managers. `POST /projects/:projectId/chat/participants/:userId/remove` and `/restore` accept `{expectedVersion, reason, idempotencyKey}` and return the participant page. Version 0 means no previous exclusion record. Existing `chat.participants.manage` permission plus current manager/target eligibility checks applies. Plain selection-add must not silently restore an excluded user.
- Summary project gains optional `nameVersion` (legacy defaults to 1) and summary capabilities gains optional `canRenameProject`. `PATCH /projects/:projectId/chat/project-name` accepts `{name, expectedVersion, idempotencyKey}` and returns the refreshed `ChatSummary`; new registered permission `chat.project_name.manage` for Super Admin/eligible initiating Admin only. The actual project record stores the canonical name and revision. Reuse an existing compatible refresh event if possible; do not introduce a new event enum unknown to existing clients without coordinating compatibility.
- Primary owns frontend/mobile authorization mirrors and integration outside `frontend/src/features/messages/`. Backend writer owns backend definitions and registration. Frontend writer owns matching message feature types/API/drafts/UI. Any required change to this contract is announced to the primary before either writer diverges.

- Mention rows use one left-aligned name/role group, retaining duplicate-name IDs and Arrow/Enter/Escape behavior.
- Actions is a labelled keyboard-accessible composer control next to existing tools. Type selection leads to assignee/due-date inputs; a draft summary can be cleared before send. Existing message text, mentions and attachments remain usable.
- Clients can select types and send tracked items but never see catalogue creation or participant/rename controls. Super Admin sees Add action type in the dropdown; success refreshes options and selects the created type.
- Participant and rename dialogs preserve input on server errors, disable duplicate submission, show conflict recovery and restore focus. Removed or unavailable assignees cannot be silently substituted.
- Tracked messages show type, assignee, due date and status with existing permitted issue operations. Original deadline and update reasons remain visible in history. No completion implies formal project approval or task completion.
- Reuse the existing visual language and local SVG patterns for any new icons. No new icon/dependency package, ornamental animation or unrelated shell changes.

## Verification matrix

| Spec criteria | Required evidence |
| --- | --- |
| AC1 removal and protected identities | Two unequal projects, selected and assignment-derived participants, protected-user attempts, denied unauthorized remover, explicit restoration, repeated/concurrent removal, revoked REST/SSE/typing/attachment/notification/email eligibility and unchanged historical messages/assignments. |
| AC2 mentions | Adjacent name/role at desktop and narrow widths; duplicate names; keyboard selection; unchanged user IDs/mention offsets. |
| AC3 tracked creation | Client and staff create Action/Escalation/custom type; invalid dates/types/assignees rejected; failed send retains input; retries/concurrency yield one saved message; reload preserves metadata. |
| AC4 lifecycle/deadlines | Existing capability matrix; resolve/reopen/reassign/escalate; changed deadline needs reason; original date immutable; stale versions conflict; no clearing of saved tracking. |
| AC5 catalogue | Sole active Super Admin success; Client/Admin/worker direct API denial; session/role revalidation; built-in and case-insensitive/concurrent duplicate rejection; newly added type appears for another member. |
| AC6 rename | Authorized rename; unrelated project and other roles denied; conflicting revisions/retries; real project name propagates to current views, ID/history unchanged. |
| AC7 compatibility | Contract/operation/OpenAPI inventory, memory/Mongo parity and replica-set transaction checks; legacy message/read behavior and mobile contract parsing. |
| AC8 rendered quality | Client/Super Admin/removed-user synthetic sessions at 1440px and 390px plus 768px composer sanity; dialogs, dropdown keyboard/focus, long names, loading/error/conflict, page overflow and scoped accessibility scan. |

Start with behavior-focused tests for changed modules. Final commands include the following existing suites plus focused tests added by each owner:

```sh
# Backend, from backend/
npm test -- tests/project-chat.test.ts tests/project-chat-membership.test.ts tests/project-chat-repository.test.ts tests/project-chat-routes.test.ts tests/project-chat-conversations.test.ts
npm test -- tests/project-chat-stream.test.ts tests/project-chat-typing.test.ts tests/project-chat-typing-routes.test.ts tests/project-chat-attachments.test.ts tests/project-chat-attachments-routes.test.ts tests/notifications.test.ts tests/notifications-routes.test.ts tests/chat-mention-mailer.test.ts
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
npm test -- tests/project-chat-mongo.replica-set.test.ts tests/project-chat-membership-mutations.replica-set.test.ts
npm run typecheck
npm run build

# Frontend, from frontend/
npm test -- src/features/messages src/features/notifications/NotificationProvider.test.tsx src/api/authorization-contract.test.ts
npm run typecheck
npm run build

# Repository root
git diff --check
git status --short
```

Add replica-set coverage for new exclusion, catalogue uniqueness, rename and tracked-message/deadline writes. Inspect the established local Mongo test setup before execution; do not weaken or skip transaction assertions to obtain a green result. If a required local replica set is unavailable, record that limitation and do not claim full verification.

Run the established mobile contract-drift and affected parser tests if backend operation/permission/response changes touch their contracts; inspect its package scripts before choosing exact commands. No mobile feature redesign or unrelated full suite is part of this task. There is no repository lint script. Avoid repeating already passing checks unless later changes affect them.

## Handoff

Update this plan with completed tasks, final ownership, exact test/build/browser results and unresolved limitations. Link the approved specification and implementation evidence. Preserve unrelated work and report task-owned temporary artifact locations. No staging, commits, production data changes, seed/backfill, migration execution, deployment or customer communication.

## Completed implementation and evidence

All tasks are complete. Backend ownership covered chat contracts/domain, centralized membership exclusions, repositories/models, service/routes, authorization and OpenAPI, with new `ProjectChatAction.ts` and action memory/replica tests. Frontend ownership covered the Messages components, API/types/state/queries, new tracked-action and project-name dialogs, and rendered regressions. Primary owned `frontend/src/api/projectNameSync.ts`, shared provider rename synchronization, authorization mirrors/tests, mobile compatibility fixtures, integration and browser QA. No dependencies or lockfiles changed.

The existing issue lifecycle remains the source of truth: tracked messages have a type snapshot, responsible participant, Open/Resolved status and immutable original due date. Custom types are global and Super Admin managed. Project renames update the canonical project record with a separate revision; they do not rewrite historical snapshots. Participant exclusions apply centrally across all derived membership sources until explicit authorized restoration.

Independent integrity review found and verified fixes for two concurrency/cache cases: issue drafts now keep their original version and require explicit review before rebasing, and shared provider observation refreshes names while either an overview or Messages is mounted. Browser scans also prompted scoped contrast corrections to dialog descriptions and conversation timestamps. No unresolved integrity findings remain.

### Executed verification

Evidence root: `/tmp/lisno-web-message-actions-qa/`. The baseline, target diff and `task-baseline-changed-paths.txt` distinguish these changes from the existing dirty workspace. Backend logs retain the earlier stale registry-count failures; the corrected registry/routes rerun passed. Final frontend evidence similarly retains its superseded permission-count failure and passing rerun.

| Area / exact command | Result |
| --- | --- |
| Backend: `npm test -- tests/project-chat.test.ts tests/project-chat-membership.test.ts tests/project-chat-repository.test.ts tests/project-chat-routes.test.ts tests/project-chat-conversations.test.ts tests/project-chat-actions.test.ts` | 46 passed; `backend-focused.log`. |
| Backend: `npm test -- tests/project-chat-actions.test.ts` | Final 8 passed; includes removed-user attachment content/preview/reservation denial; `backend-actions-final.log`. |
| Backend: `npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/project-chat-routes.test.ts` | Final 126 passed; `backend-registry-routes-final.log`. |
| Backend: stream, typing, typing-routes, attachments, attachments-routes, notifications, notifications-routes and chat-mention-mailer suites from the listed matrix | All 54 consumer tests passed in `backend-consumers.log`; its six unrelated-to-consumer inventory assertions were corrected and covered by the final registry rerun above. |
| Backend: `npm test -- tests/project-chat-actions.replica-set.test.ts tests/project-chat-mongo.replica-set.test.ts tests/project-chat-membership-mutations.replica-set.test.ts` | 15 passed, including 5 new transactional cases; `backend-replica.log`. |
| Backend: `npm run typecheck`, `npm run build` | Both exit 0; `backend-typecheck.log`, `backend-build.log`. Unique relevant backend coverage totals 236 passing tests, accounting for overlapping reruns. |
| Frontend: `npm test -- src/features/messages src/features/notifications/NotificationProvider.test.tsx src/api/authorization-contract.test.ts src/api/projectNameSync.test.ts` | Final 165 passed across 18 files; `final-frontend-tests.log`. Includes overview rename and concurrent deadline-edit regressions. |
| Frontend: `npm run typecheck`, `npm run build` | Both exit 0; `final-frontend-typecheck.log`, `final-frontend-build.log`. |
| Mobile: `npm run test:contracts` | 3 passed; canonical permission/operation parity. |
| Mobile: `npm test -- --runInBand src/features/messages/chatModel.test.ts` | 36 passed; additive action/history/rename/participant payload compatibility. |
| Mobile: `npm run typecheck` | Exit 0; `final-mobile-typecheck.log`. |
| Root: `git diff --check`, `git status --short` | Exit 0; existing unrelated dirty work preserved. |

### Rendered acceptance checks

Actual web components/router/providers ran against a local synthetic transport, using Playwright with Client and Super Admin sessions. No real accounts, messages or project records were changed.

- AC1: protected Client cannot be removed; assigned participant remove and explicit restore work; simulated access revocation removes transcript and composer. Backend tests cover enforcement across consumers.
- AC2: duplicate-name roles render 4px next to the name at 1440px, 768px and 390px. Keyboard mention selection retains the correct distinct ID.
- AC3/AC5: Client creates Action and Escalation with responsible person/date; metadata survives reload. Client has no add-type or rename control. Super Admin adds a custom type; failed save retains input and retry selects the new type.
- AC4: rescheduling retains original date and records new date/reason in history. The concurrent-edit regression requires explicit review before saving newer versions.
- AC6: canonical rename updates list/header; failed save retains input; concurrent rename requires review. The overview-only regression covers remote invalidation without changing historical caches.
- AC7: memory/Mongo, route inventories and additive mobile contract checks pass as listed above.
- AC8: desktop/narrow dialog layouts, 768px composer, keyboard menu/Escape focus and error/conflict states checked. Final axe scans report zero violations for desktop Client, action dialogs at 1440px/390px, narrow Client views, deadline history, project rename, add type, participant removal and access-removed state. No document overflow, application console errors or unexpected transport requests were observed. Evidence includes `browser-final-accessibility.log` and task screenshots in the QA root.

### Limits and cleanup

Vite retains a bundle-size warning for chunks over 500 kB; the build succeeds. Full unrelated application suites, native mobile builds and OCR tests were not run for this web feature. Browser checks use synthetic data; backend memory and replica-set integration tests provide persistence/authorization verification. No lint script exists.

The temporary browser and Vite server were stopped. The ignored browser harness and three task-owned CLI artifacts were moved into the QA root; ignored build outputs remain standard local verification outputs. No seed, migration/backfill, deployment, external delivery, staging, commit or push was performed.
