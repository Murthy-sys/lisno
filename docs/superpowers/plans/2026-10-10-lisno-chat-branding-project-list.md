# Lisno chat branding and project-list implementation plan

Date: 2026-10-10 (Asia/Kolkata)
Status: Complete; implemented and verified locally on 2026-10-10
Specification: [Lisno chat branding and accessible project listing](../specs/2026-10-10-lisno-chat-branding-project-list-design.md)
Specification approval: received in conversation on 2026-10-10.
Task-plan approval: received in conversation on 2026-10-10.
Execution mode: A, parallel sub-agents, selected in conversation on 2026-10-10.

## Outcome and boundaries

Implement the approved logo placements and a compact, authorized project list inside Ask Lisno. Support inline pagination and stable-ID selection into the existing project-progress conversation. Keep the prior tone, two-minute Project-message response window, staff suppression, privacy, pricing and authorization behavior.

No chat redesign, staff-role expansion, model/key change, new dependency, business-data mutation, migration, seed, deployment, commit, push or customer communication is included. Only one parent phase is in progress at a time. Product edits begin after task-plan approval and execution-mode selection.

## T1. Baseline and shared contract

Owner: primary engineer. Dependency: approvals and execution mode. Acceptance criteria: AC2–6.

- Capture the dirty-path inventory and current per-target contents/diffs under `/tmp/lisno-chat-project-list-2026-10-10/`, excluding environment files and customer data. Preserve all existing edits.
- Confirm the current private request/response, source-access checks, popup context lifecycle, project discovery ordering and existing brand assets.
- Extend only the existing Ask Lisno route contract. Proposed optional fields:
  - Request `projectListPage`: bounded nonnegative `offset` plus a required opaque `version` for continuation. Omission starts a new list.
  - Response `projectList`: `items` containing stable ID, name and optional location detail; `offset`, nullable `nextOffset`, and opaque `version`.
  - Each response page contains at most 20 items. The existing `resolution` remains account-level for a list; `projectId` remains null. Existing answer fields and old callers remain compatible.
- Derive the list version from the current actor/session and authorized, deterministically ordered name metadata. It is only a freshness marker, never authority. Recompute and validate it on continuation; changed membership/names/order produce a recoverable list-changed response requiring refresh.
- Do not accept a continuation on an unrelated prompt or use pagination values to bypass scope. Fresh list intent takes precedence over page/context hints; supplied IDs retain normal authorization checks. Row selection is a separate project question.
- Primary owns `backend/src/contracts/ask-lisno.ts`, `backend/src/openapi/ask-lisno.ts` and frontend request/response types in `frontend/src/features/ask-lisno/askLisnoApi.ts` until the contract is settled. Share exact shapes/error behavior before parallel writers start. No route-operation change is expected because the endpoint and permissions are unchanged.

Exit: compatible shared contract, current baseline and explicit writer ownership established.

## T2A. Authorized project-list responses

Owner: backend implementer in Mode A; primary in Mode B. Dependency: T1. Acceptance criteria: AC2–6. May run alongside T2B.

Owned paths:

- `backend/src/services/ask-lisno.service.ts`
- A narrowly scoped `backend/src/services/ask-lisno-project-list.ts` helper if intent/pagination logic warrants separation
- `backend/tests/ask-lisno.test.ts`, `backend/tests/ask-lisno-routes.test.ts`, and a focused helper test if introduced

Work:

- Recognize the approved direct-list phrasings and common polite variants before normal single-project resolution. Keep named-project questions, corrections, gratitude, budget comparisons and business-change requests out of that shortcut.
- Reuse `pageProjectsForUserInModule` and existing `readAssistantContext` checks. Scan the full current Client scope, including later database pages; use stable ordering and de-duplicate by ID. Apply the request deadline and never disguise a partial discovery failure as an empty or complete list.
- List only projects authorized under current ownership and chat-membership rules. Recheck session and returned rows before delivery. Compute freshness and page boundaries from authorized metadata, so inaccessible entries cannot leak through totals or continuation behavior.
- Return typed directory data and a short server-authored introduction/empty-state answer. Do not invoke the model, read project financial/progress sources, reserve model tokens or expose the complete roster to OpenAI for this direct list operation. Preserve normal request admission/limits and read-only behavior.
- Validate continuation input, reject changed versions safely, and preserve source authorization on every page. Keep ordinary provider generation and single-project selection intact.
- Cover zero/one/many projects, more than 100 rows, duplicates, page/context hints, last-page behavior, repeated pagination and invalid continuation. Use two Clients with unequal project sets and overlapping names; test foreign IDs, removed membership, inactive/revoked session and changes during discovery or continuation.
- Verify no project-chat messages, notifications or business writes occur. Existing usage bookkeeping is permitted and must not fabricate model usage.

Exit: complete, bounded project discovery through the private endpoint with meaningful regression evidence.

## T2B. Branding and inline list interaction

Owner: frontend implementer in Mode A; primary in Mode B. Dependency: T1. Acceptance criteria: AC1–5 and AC7. May run alongside T2A using the settled typed response.

Owned paths:

- `frontend/src/features/ask-lisno/AskLisnoPanel.tsx` and `askLisno.css`
- `frontend/src/features/estimates/AskLisnoLauncher.tsx` and its test
- `frontend/src/features/messages/ChatTimeline.tsx`, its test, `ChatParticipants.tsx` and a focused participant test
- `frontend/src/features/messages/projectChatAssistant.css`
- A small shared chat-logo component/style if needed; reuse current brand assets

Work:

- Replace the generic launcher symbol with the Lisno mark; add compact branding to the private header/AI reply identity and the trusted Lisno AI service sender/participant in Project messages. Use stable service identity, not a human display-name match. Preserve visible AI labels, message grouping, actions and timestamps.
- Reuse existing artwork, preserving its proportions and contrast. Scope sizing to chat rather than changing the global logo. Keep meaningful visible text if the image fails and avoid duplicated accessible names.
- Add “Show my projects” to the welcome suggestions. Render typed project-list rows in the existing answer area with project name, optional location and accessible “View progress” actions. Keep rows compact and avoid a dropdown or large cards.
- Load “Show more” into the same answer using the original list message and continuation. Maintain separate paging loading/error state so retry does not duplicate rows or overwrite another turn. Abort/ignore stale requests on close, session change, refresh and superseding actions.
- On list-version change, replace stale selectable list content with an inline refresh action; start fresh from page one. Do not leave an apparently complete stale list visible. Other paging failures provide a local retry without creating a false empty state.
- Selecting a row creates a new progress question with its stable `choiceProjectId`. Listing/paging does not select a project; only the resulting authorized project answer updates the context used by later questions.
- Include every displayed list project ID in reopened-history access verification. Hide cached content while checking and clear it on denied/session-lost results. Do not persist lists or chat in local storage.
- Add rendered interaction tests for list/selection/follow-up, duplicate/long names, pagination, errors/refresh, keyboard interaction, response races and history reauthorization. Preserve existing source-free conversational rendering.

Exit: compact branded chat and useful project selection with tested access/race behavior.

## T3. Integrate contracts and verify the user journeys

Owner: primary engineer. Dependency: T2A and T2B complete. Acceptance criteria: AC1–7.

- Integrate the independent slices and inspect all changes against the captured baseline. Reconcile API typing, runtime validation, OpenAPI, paging errors and selection semantics.
- Verify the complete journey: ask for all projects from a project page, load later pages, select a duplicate-name project by ID, ask a contextual follow-up, close/reopen, and handle lost access.
- Confirm unchanged ordinary named-project queries, natural social replies, AI identity, commercial-source rendering and Project-message timing.
- Update only relevant operational documentation for the new private list behavior. Primary owns shared tests such as OpenAPI inventory if required; do not broaden route authorization unnecessarily.
- Run actual-component browser checks with synthetic fixtures at desktop and narrow/mobile widths (including approximately 1440, 390 and 320 pixels). Inspect logo proportions, long rows, scrolling/composer visibility, pagination, loading/empty/error states and keyboard focus. Do not start a bootstrap that seeds records merely to run visual QA.

Exit: integrated sources and recorded browser evidence ready for independent review.

## T4. Integrity review and corrections

Owner: `integrity_reviewer` in Mode A; primary inline in Mode B. Dependency: T3 complete.

Review disclosure boundaries, stable IDs, list completeness, continuation freshness, quota semantics, stale request handling and cached-access rechecks. Verify that an ordinary sender named “Lisno AI” cannot acquire the brand identity. Confirm unchanged model, prices, business records and automatic Project-message behavior.

Assign only confirmed corrections to the existing ownership boundaries, then recheck. All source writers must stop before final verification.

## T5. Final verification and handoff

Owner: `verification_runner` in Mode A; primary inline in Mode B. Dependency: T4 clear.

Start with the changed tests and run this integrated lane, adding any new helper/participant test filenames introduced above:

```sh
# backend/
npm test -- tests/ask-lisno-project-list.test.ts tests/ask-lisno.test.ts tests/ask-lisno-routes.test.ts tests/ask-lisno-project-resolution.test.ts tests/project-assistant-openai.test.ts tests/project-assistant-sources.test.ts tests/project-assistant-pricing.test.ts tests/project-chat-assistant.test.ts tests/project-assistant-runtime.test.ts tests/api-docs.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/features/estimates/AskLisnoLauncher.test.tsx src/features/messages/ChatTimeline.test.tsx src/features/messages/ChatParticipants.test.tsx src/features/messages/ChatAssistantResult.test.tsx
npm run typecheck
npm run build

# repository root/
git diff --check
git status --short
```

Use replica-set tests if transactional Mongo behavior actually changes; do not weaken transaction semantics for a standalone fixture. No repository lint script exists. Broaden tests only for failures, changed shared contracts or unresolved risks.

Record exact commands, counts, exit codes, browser evidence, artifact paths, unrun checks and any limitations against AC1–7. Keep logs/screenshots in the task-specific temporary directory. Inspect final hygiene, stop only task-owned servers, and report no deployment/migration/customer communication. Mark complete only after integrated verification succeeds.

## Parallelism and execution record

Mode A: primary settles T1, then backend T2A and frontend T2B can proceed concurrently on non-overlapping paths. Tell both writers they are not alone in the worktree and must preserve others’ edits. Neither writer owns shared contracts unless the primary explicitly hands them over. Review and final verification follow integration sequentially.

Mode B: primary performs the same tasks inline without implementation sub-agents.

Specification and task plan approved; Mode A selected. T1 baseline saved under `/tmp/lisno-chat-project-list-2026-10-10/`. Shared contract is settled: optional `projectListPage: {offset, version}` request and optional `projectList: {items, offset, nextOffset, version}` response; 20-row pages, offsets 0–1,000,000 in multiples of 20, lowercase 64-character SHA-256 freshness markers. `409 ASK_LISNO_PROJECT_LIST_CHANGED` requests an inline refresh when the authorized list changes. No new route or permission.

T2 and T3 completed. Backend focused checks passed 96 tests. Frontend focused checks passed after the integration corrections. The existing Lisno artwork is reused in a square-view SVG; no new artwork, dependency or model setting was introduced. Listing reads current authorized metadata directly and does not call OpenAI. Identical name/location rows receive a distinct stable-ID reference in visible and accessible labels; question text retains the original project name and selection uses the stable ID.

Browser checks used actual components with synthetic API/auth fixtures at 1440×900, 390×844 and 320×568. Verified all logo placements, 20-row first page and all 23 fixture projects, last-page behavior, stable-ID selection and follow-up context, 23 cached-access rechecks on reopen, changed-list refresh, retry retaining known rows, revoked access clearing cached content, empty state, long names and visible composer without horizontal overflow. Runtime page errors: none; the fixture favicon returned 404. Screenshots and browser log are in the temporary task directory.

T4 identified and corrected indistinguishable duplicate labels. Browser verification also identified focus loss from disabling the selected row; the correction restores composer focus while respecting deliberate interaction outside the non-modal panel. Final keyboard check passed selection, composer focus, Escape close and return focus. Scoped axe checks for WCAG 2 A/AA and 2.1 AA returned zero violations (20 rules passed), recorded in `keyboard-final.log`. All product writers are stopped for final review and verification.

T4 final independent integrity review cleared both corrections with no remaining confirmed defect. T5 completed on the integrated sources after writers stopped. All requested work is complete locally.

### Final verification results

The exact commands are recorded in T5 above, with working directories shown there. All final commands exited 0.

| Check | Result |
| --- | --- |
| Backend focused integrated tests | 385 passed across 12 files |
| Frontend focused integrated tests | 70 passed across 4 files |
| Backend and frontend `npm run typecheck` | Both passed |
| Backend and frontend `npm run build` | Both passed |
| Repository `git diff --check` and `git status --short` | Passed; pre-existing dirty work preserved |
| Actual-component browser interactions | Passed at desktop and mobile sizes, including 320-pixel width |
| Keyboard and scoped accessibility | Selection, composer focus and Escape/launcher restoration passed; zero axe violations |

The first backend test attempt encountered sandbox `listen EPERM` in 19 HTTP tests; the identical command passed all 385 tests after proper execution escalation. Test logs contained no warnings. Frontend build reports chunks above 500 kB (main JavaScript approximately 2.57 MB); no bundle restructuring was introduced for this bounded change.

Logs: `/tmp/lisno-chat-project-list-2026-10-10/final/`. Browser evidence: `browser.log`, `keyboard-final.log`, `shared-brand.png`, `projects-1440.png`, `projects-390.png`, `projects-320.png`, `selected-project.png` and `paging-error.png` in the task temporary directory. The original dirty inventory, relevant baseline and task-specific patch are retained there for comparison. Only the task-owned visual fixture server was stopped. Build outputs in `backend/dist` and `frontend/dist` are ignored.

### Acceptance reconciliation and affected areas

- AC1: shared decorative `LisnoChatMark` and square-view existing artwork; trusted service-only identity in `ChatTimeline` and `ChatParticipants`, launcher/header/private replies, scoped styles and rendering tests.
- AC2–3: direct list intent and pagination in `ask-lisno-project-list.ts` and `ask-lisno.service.ts`; helper/service/route tests include 107 projects, empty lists, hint handling and continuation behavior. Duplicate labels remain distinct after later pages load.
- AC4: `AskLisnoPanel` uses a separate progress turn with stable `choiceProjectId`, preserving account-level context for directory responses and selected context for follow-ups. Interaction and keyboard tests pass.
- AC5: asymmetric Client scopes, foreign IDs, ownership/session changes, delivery rechecks, paging and reopened-history authorization are covered. Listing invokes no model, creates no project messages/notifications and changes no business records.
- AC6: optional backend/frontend contract fields and OpenAPI match runtime validation. OpenAPI, route-operation, frontend authorization, provider, source, pricing, resolution and Project-message regression checks pass. Operational behavior is documented in `docs/operations/project-messages-ai.md`.
- AC7: desktop/mobile rendered fixtures verify scrolling, composer visibility, long rows, all brand placements, access/error/empty states and keyboard accessibility.

No dependencies, lockfiles, keys, model configuration, stored schemas, permissions or production data changed. No migration, seed, commit, push, deployment or customer communication was performed. Full repository/OCR suites and live OpenAI calls were not run; the focused lane covers the changed contract and consumers. No Mongo transaction implementation changed, so no new replica-set lane was required. Browser QA used synthetic authorized data, not a real account. Production-scale Mongo roster-discovery latency remains unmeasured.

### Follow-up correction: conversational “get” requests

The Client reported that `hi, cn i get all my projects` still requested a project name. This is a correction within approved AC2 (equivalent direct-list wording), using the existing Mode A authorization. The direct-list matcher accepted `show/list/display` and `can I see`, but omitted `get` and the prefix typo `cn i`. No service, API, UI or permission change was needed.

Updated `backend/src/services/ask-lisno-project-list.ts` to recognize conversational get requests, including `can I get/have`, and normalize `cn` only at the request prefix before `i` or `you`. Fully anchored matching keeps budget questions, named-project questions, foreign-client suffixes and modification requests out of the list shortcut. Expanded the helper tests and parameterized the existing HTTP list test with both `get all my projects` and the exact screenshot phrase. Independent read-only review found no blocker.

Before the correction, all 10 initial new positive regression cases failed. After the correction, `cd backend && npm test -- tests/ask-lisno-project-list.test.ts tests/ask-lisno.test.ts tests/ask-lisno-routes.test.ts tests/ask-lisno-project-resolution.test.ts` passed **160 tests across 4 files**, exit 0. Backend `npm run typecheck`, `npm run build` and repository `git diff --check` also passed, exit 0. HTTP tests used properly escalated local port access. Logs and pre-fix target snapshots are under `/tmp/lisno-chat-project-phrasing-2026-10-10/`.

No frontend files, dependencies, keys, contracts, model configuration or stored data changed. Frontend/browser/full-suite/live OpenAI checks were not repeated for this backend intent correction. No deployment or existing application-process restart was performed.
