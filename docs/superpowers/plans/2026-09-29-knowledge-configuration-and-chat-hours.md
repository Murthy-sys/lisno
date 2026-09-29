# Knowledge configuration and internal chat hours: task plan

Status: Approved, Mode A execution  
Approved specification: [knowledge-configuration-and-chat-hours-design.md](../specs/2026-09-29-knowledge-configuration-and-chat-hours-design.md)

## Starting state and ownership

- At planning time the only dirty path is the new, untracked specification above. Recheck `git status --short` and inspect diffs before implementation writers start; preserve any new unrelated work.
- The specification's six numbered verification criteria are referenced here as AC1–AC6. No production mutation, migration, email, push, commit or deployment is in scope.
- In Mode A, the primary agent owns `shared/`, the approved documents, cross-layer API decisions and integration. Assign one writer each to `backend/`, `frontend/` and `mobile/`, with no cross-directory edits. Tell each writer the worktree is shared, they are not alone, and they must preserve others' edits. In Mode B, the primary agent performs these slices inline in dependency order.
- Review and final verification run only after all writers finish; concurrent test results are provisional.

## Contract fixed before parallel implementation

**Owner:** primary agent. **Depends on:** task-plan approval and execution-mode choice.

1. Record baseline behavior and the existing test expectations for UOM Code, empty Whole Sub-Basket rules, Mode description, basket hierarchy and chat. Freeze shared client shapes in `shared/knowledge/knowledgeApi.ts` and, where needed, a small shared chat/digest type module; keep backend and UI contracts aligned.
2. UOM create may omit `code`; response still includes a server-generated code. Explicit code remains accepted for older callers. Existing UOM updates omit Code from the new UI and preserve the stored code.
3. A whole-basket rule uses `targetKind: "sub_basket"`, `targetSubBasketId`, `targetType: null`, `targetMainLineId: null`. An empty real Sub-Basket is valid for saving but resolves to zero recommendations until eligible children exist. Preserve existing ID-based targeting and no-source-cycle rule. Update shared validation and labels accordingly.
4. Freeze authenticated backend shapes for chat availability and the daily digest so web and mobile can work in parallel. Preferred endpoints: `GET /chat/availability` for `{ timezone, writable, nextOpenAt }`; `GET /daily-critical-tasks` for the oldest unacknowledged due per-user/date list (or today's list after 17:00) and acknowledgment state; idempotent `PUT /daily-critical-tasks/:localDate/acknowledgment`. After acknowledging an older date, the next pending date becomes available. Digest items carry a stable source kind/ID, authorized project context, title, status and canonical due date. Stable after-hours denial code includes next opening. The backend's clock is authoritative.
5. Confirm all internal roles except Client are scheduled. The 17:00 list combines personally responsible open critical tracked chat actions and overdue personally assigned unfinished workflow tasks. It is in-app on both platforms, available after hours, and acknowledged once per recipient/local date.

**Acceptance:** Common types compile; old API callers remain compatible; no client-generated deadline or UOM code is relied on as truth. **Coverage:** AC1, AC2, AC5, AC6.

## Task 1 — UOM and whole-basket backend

**Owner:** backend writer in Mode A; primary agent in Mode B. **Depends on:** frozen contract. **Paths:** `backend/src/routes/ai-estimator-knowledge-admin.ts`, `backend/src/services/ai-estimator-knowledge-reference.service.ts`, `backend/src/services/ai-estimator-knowledge-item.service.ts`, related backend contracts/validation/context and focused tests.

1. Make UOM `code` optional only on create; generate a collision-safe bounded code from the stable new UOM ID inside the create transaction. Keep name uniqueness, explicit-code compatibility and update version semantics.
2. Remove the empty-child save rejection for a valid Whole Sub-Basket reference while preserving parent identity, source containment, duplicate-rule and transaction coordination. Keep empty target resolution unavailable and ensure adding multiple later eligible items expands the same rule without changing its stored target.
3. Add focused route/service and replica-set tests: generated-code uniqueness, legacy explicit code, edit preservation, empty Sub-Basket rule, later children, source-cycle rejection and a simultaneous child/status change.

**Acceptance:** AC1–AC2. **Parallel:** Can run alongside Tasks 3–4 after the shared contract freezes; same backend writer owns Tasks 1–2 to avoid backend overlap.

## Task 2 — Server chat schedule and daily critical digest

**Owner:** same backend writer. **Depends on:** frozen contract; independent of Task 1 within backend writer's sequence. **Paths:** chat services/routes, attachment and typing services, workflow/task and notification integration, new digest service/model/routes as needed, `backend/src/domain/authorization.ts`, `backend/src/domain/route-operations.ts`, OpenAPI, server wiring and focused tests.

1. Add a pure Asia/Kolkata schedule predicate with injected clock; server-gate every internal chat write at its commit boundary, including send, issue actions, participant/metadata edits, typing and new uploads. Preserve read, download, read receipts, digest acknowledgment and attachment cleanup. Client role retains existing permission behavior. Return stable schedule/error data and update chat capability responses.
2. Query only current authorized project memberships for personally responsible open critical tracked chat actions. Query incomplete workflow tasks by exact assignee user ID; derive missing legacy due dates with the existing backend schedule function. No name-based joins or role-wide task leakage.
3. Persist one delivery/ack receipt per active internal user and India-local date with a unique key, idempotent upsert and a catch-up path. Emit content-free realtime refresh at 17:00; online and offline clients use the same authorized read API. Keep task contents current at read time and do not mark a failed query as viewed.
4. Add protected endpoints and synchronized route-operation/OpenAPI documentation; audit receipt and acknowledgment timing. Cover multiple processes/restarts, timezone and boundary races, disabled mail independence, no-task state, reassignment and revoked membership.
5. Run focused backend unit, route, authorization matrix and replica-set integration tests. Use asymmetric users/projects and exact boundary times 19:59, 20:00, 07:29, 07:30 and 17:00.

**Acceptance:** AC5–AC6. **Risk:** High; transaction and authorization invariants require post-writer integrity review.

## Task 3 — Web configuration and chat presentation

**Owner:** frontend writer in Mode A; primary agent in Mode B. **Depends on:** frozen contract; backend availability is needed for final integration, not initial UI work. **Paths:** `frontend/src/features/ai-estimator-knowledge/`, `frontend/src/features/messages/`, `frontend/src/features/notifications/`, related API/types/styles/tests only.

1. Remove UOM Code from add/edit side panels and omit it in UOM requests; keep other reusable-value code controls. Update create/edit, accessibility and API mocks.
2. Replace the Whole Sub-Basket shortcut's combined item creation with standalone Sub-Basket creation and selection. Show the empty-target “Needs items” state and keep refresh/retry, unsaved rule and item-only flows intact.
3. Move the existing description editor inside PMC, label it Description, update saved summary label and validation-focus behavior without changing stored text.
4. Build nested Main Basket → Sub-Basket → item disclosures, including empty groups, direct items, filter/search ancestors, page-scoped counts, loading/error/retry and keyboard/accessible names. Match current configuration styling.
5. Render chat availability from the server, preserve drafts and disable timed writes; provide schedule text and an in-app 17:00 digest prompt with explicit acknowledgment and a later reopen path. Refresh on schedule boundary, reconnect and realtime signal. Acknowledge only after the list was rendered successfully.
6. Add focused rendered interaction tests and check desktop/narrow-width states for all changed flows.

**Acceptance:** AC1–AC6. **Parallel:** Safe alongside backend and mobile under separate directory ownership.

## Task 4 — Mobile configuration and chat presentation

**Owner:** mobile writer in Mode A; primary agent in Mode B. **Depends on:** frozen contract; backend availability is needed for final integration. **Paths:** `mobile/src/features/knowledge/`, `mobile/src/features/messages/`, `mobile/src/features/notifications/`, app shell/API wiring and focused tests only.

1. Remove UOM Code from both item quick-add and reusable-value create/edit controls; omit Code in requests and retain decimal-scale validation.
2. Let Whole Sub-Basket creation select an empty Sub-Basket without any item; align empty-target presentation and validation with the shared contract.
3. Place Description inside the PMC section with existing text/edit protection intact. Update saved-summary presentation if used on mobile.
4. Add nested Main Basket/Sub-Basket/item disclosures with empty groups, direct items and accessible touch controls; retain item actions, filters and pagination.
5. Reflect server chat hours in thread/composer/action/upload controls, retain unsent drafts, and show/acknowledge the daily digest on foreground/next open. Preserve authenticated access rules and retry states.
6. Add focused React Native interaction tests for both normal and read-only hours, digest and configuration controls.

**Acceptance:** AC1–AC6. **Parallel:** Safe alongside backend and web under separate directory ownership.

## Task 5 — Integration, integrity review and final verification

**Owner:** primary agent; in Mode A run `integrity_reviewer` after writers finish, resolve findings, then `verification_runner`. In Mode B perform the same checks sequentially inline. **Depends on:** Tasks 1–4 complete.

1. Inspect the integrated diff against the approved specification and reconcile any frontend/mobile/backend contract mismatch. Verify no placeholder item, chat bypass endpoint, permission widening, task leakage or duplicate digest delivery.
2. Run focused backend and both UI test files first, then backend/frontend/mobile typechecks and production builds; broaden to relevant chat, authorization, route-operation, OpenAPI and knowledge suites. Use replica-set integration tests for changed Mongo transactions.
3. Render and exercise web desktop/narrow states and mobile screens for the UOM, empty whole-basket, PMC description, hierarchy, 17:00 prompt and overnight chat states. Check accessibility names/focus, console and network errors.
4. Run `git diff --check` and `git status --short`; report exact checks, unrun gates and risks. No commit, push, seed, migration, mail send or deployment.

**Acceptance:** AC1–AC6 and repository hygiene. Final verification must observe the fully integrated worktree, not transient concurrent edits.
