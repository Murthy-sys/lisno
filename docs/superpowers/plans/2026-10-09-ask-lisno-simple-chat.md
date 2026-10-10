# Simple Ask Lisno implementation plan

Date: 2026-10-09
Status: Complete and verified. Specification and task plan approved; Mode A selected.
Approved specification: [Simple Ask Lisno chat and Project messages adjustments](../specs/2026-10-09-ask-lisno-simple-chat-design.md)

## Delivery boundary

Reuse the configured OpenAI adapter, authorized project readers, existing UI primitives, and provider limits. Deliver the two-minute Project messages wait, cleaner Participants entry, and separate temporary Ask Lisno chat. No saved private history, new worker queue, dependencies, deployment, or business-data migration.

Target: 15 minutes of minimal implementation after the execution choice. This is a target, not grounds to omit access checks or claim unfinished verification has passed. Report a concrete blocker or overrun promptly.

Execution used Mode A: the primary agent fixed the shared contract, backend and frontend owners implemented independent slices, and an independent test writer covered the private route. All implementation tasks below are complete. Integrity review finished without a confirmed blocking defect; final verification results are recorded below.

## 1. Preserve the worktree and fix the shared contract

Owner: primary agent. Dependencies: approved plan and execution choice. Acceptance: specification criteria 3–6 and 8.

- Capture initial dirty paths and scoped target diffs before writers start. Exclude secret-bearing environment files from snapshots and tool output; inspect any needed environment state through redacted checks only. Existing vendor, execution, and Project AI work must remain intact.
- Establish `POST /client/ask-lisno` with a dedicated Client-only operation. Request: `{ projectId: string | null, message: string, history: Array<{ body: string }> }`. History contains previous Client turns only and is untrusted. Bound the new message and each history body to 2,000 characters, history to 15 entries, and serialized provider context to the existing byte ceiling. Do not silently discard the current question.
- Response: `{ projectId: string | null, checkedAt: string, answer: Omit<AssistantGeneratedResult, "freshness"> }`. Source fingerprints remain server-side; verified facts, safe catalogue candidates, missing inputs, and authorized customer prices use existing result shapes. Never fabricate a shared-chat message/result ID.
- Use existing authenticated Client project discovery rather than adding another list endpoint. Normal missing-project clarification is an answer state; denied access and disabled provider use the existing safe error conventions.
- Primary owns new request/response contracts, authorization registry and permission entries, OpenAPI registration, frontend authorization contract/fixtures, `backend/src/app.ts` wiring, and their focused contract tests. Publish the exact service construction and UI API shape to both implementers before parallel work.

## 2. Reuse the backend provider and shorten the wait

Owner in Mode A: backend implementer. Dependencies: task 1 contract. Acceptance: criteria 1 and 3–6.

Owned areas: new `backend/src/services/ask-lisno.service.ts`, new `backend/src/routes/ask-lisno.ts`, any small shared usage helper, `project-assistant-openai.ts`, `project-assistant-context.ts`, `project-assistant-runtime.ts`, `domain/project-chat-assistant.ts`, assistant usage repository/model changes strictly required for shared accounting, and focused backend tests. Do not edit primary-owned wiring, public contract files, or frontend files without handing back the dependency.

- Expose an immediate request/response service using the existing provider instance and project source readers. Never invoke Project chat enqueue, publication, tagged routing, notification, or email paths.
- Derive identity/session from authentication and authorize every selected project. Add only the narrow current-Client profile reader needed by this surface; do not make profile data available to shared Project message responses. Without a project, project-specific tools must request project selection rather than read a default project.
- Revalidate identity, selected project, and source freshness before returning. Keep profile-only replies grounded in current authorized profile data and approved application navigation, not general invented support policies.
- Reuse aggregate Client/project/deployment admission counters, token reservation/settlement, provider deadlines, and concurrency limits across both entry points. Factor the existing accounting only where necessary; do not duplicate independent budgets. Profile-only usage must have an explicit nullable/absent project scope, never a fake project ID. Keep project-run and stored-result identity requirements unchanged.
- Set the wait to `120_000`. During ordinary claiming, shorten only never-started waiting runs to the earlier of their saved deadline and original/coalesced wait anchor plus two minutes, preserving staff closing-time behavior. Reuse current cancellation checks; leave retries, leased/completed runs, unrelated grouping intervals, and human alerts unchanged.
- Add focused tests for 119,999/120,000 milliseconds, human-reply cancellation, immediate exceptions, legacy pending waits, coalescing, two unequal Client/project identities, access revoked during generation, malicious history/project IDs, no shared-message/notification writes, profile-only calls, provider failure, and shared quotas. Add replica-set coverage if usage persistence or transactional behavior changes.

## 3. Open a compact, separate Ask Lisno panel

Owner in Mode A: frontend implementer. Dependencies: task 1 contract. Acceptance: criteria 2–5 and 7.

Owned areas: `frontend/src/features/estimates/AskLisnoLauncher.tsx` and its tests; new feature-local Ask Lisno panel/API/styles/tests; `frontend/src/features/messages/ChatParticipants.tsx`; `ChatAssistantResult.tsx` and its tests; and the existing launcher integration test in `EstimateReviewPanel.collapsible.test.tsx`. Primary retains shared layout/authorization files; request a small root integration edit if needed. Avoid global styles except the existing launcher's strictly relevant rules.

- Replace the redirect with the existing accessible contextual `Drawer`, titled `Ask Lisno`, description `Private AI chat`. Keep a compact project selector, conversation, composer, pending state, and send/retry actions.
- Reuse the existing validated result presentation through a small presentational extraction; preserve the shared-chat query wrapper and its commercial authorization. Do not make the private panel fetch protected shared-chat result IDs.
- Preselect an authorized route project. Otherwise show a project choice and allow account-only support; never select the first project arbitrarily. Keep temporary history keyed by authenticated account/session and selected project, without localStorage or server history writes.
- Abort or ignore stale in-flight responses after identity/project changes and access loss. Clear inaccessible context. Permit closing the panel while answering; prevent duplicate submit. Account switch/sign-out cannot reveal the previous user's messages.
- Remove both explanatory paragraphs under Lisno AI in Participants, retaining its name and identity semantics. Update the waiting label to two minutes.
- Provide a normal Project messages link for human help, without automatically posting private text. Cover empty/no-project, loading, denied, failed, retry, and successful response states.
- Test rendered launcher behavior, project/account isolation, pending and error states, removed participant copy, keyboard close/focus return, and compact desktop/mobile layout. Reuse established assets and styles; add no new icon package or visual effects.

## 4. Integrate and check the complete change

Owner: primary agent. Dependencies: tasks 2 and 3. Acceptance: all criteria.

- Connect the route/service to the already configured provider and enablement logic in `app.ts`; keep the existing local key/model and server startup behavior. Do not restart seed-capable development startup merely to test this feature.
- Ensure the new operation is synchronized with route registry, OpenAPI, authorization contracts, and fixtures. Other roles do not gain private-chat authority.
- Remove only the credential value from tracked `backend/.env.example` using a targeted, non-logging edit. Leave ignored local `.env` intact. Verify absence by boolean/field-name output only. Credential rotation remains the owner's action.
- Update `docs/operations/project-messages-ai.md` for the two-minute wait and separate temporary Ask Lisno behavior. Record verification in this plan after implementation, without changing the approved scope.
- In Mode A, an `integrity_reviewer` performs a bounded read-only review after writers finish; resolve findings before a `verification_runner` checks the integrated tree. In Mode B, perform the equivalent steps inline. No agent may revert other owners' changes.

## Verification and completion

- Backend focused: `npm test -- tests/ask-lisno.test.ts tests/project-assistant-runtime.test.ts tests/project-chat-assistant.test.ts tests/project-assistant-openai.test.ts` plus new/affected replica-set tests for transactional accounting.
- Backend contract checks: `npm test -- tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts tests/project-assistant-app.test.ts`.
- Frontend focused: `npm test -- src/features/estimates/AskLisnoLauncher.test.tsx src/features/messages/ChatAssistantResult.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx` plus new private-panel/participant tests.
- Run `npm run typecheck` and `npm run build` in backend and frontend. No lint script exists; do not claim lint verification.
- Render the panel at desktop and narrow mobile widths, check no overflow, labelled controls, keyboard focus/close, project switching, and failure presentation. Use isolated fixtures; no real customer message or email is needed.
- Run `git diff --check` and inspect final scoped changes. If a check reveals a known unrelated baseline failure, report it separately and do not change unrelated functionality.
- Handoff states exactly what works, checks run and results, unrun checks or blockers, and the environment-template cleanup. Do not commit, push, deploy, seed, rotate keys, or mutate production.

## Execution record

- Implemented a separate immediate, Client-only Ask Lisno drawer and request endpoint using the configured provider. Temporary conversation history stays in memory and is isolated by account/session/project. Profile-only help uses a conditional private read tool; shared Project messages cannot call that tool.
- Preserved current read-source, price calculation, authorization, and human-alert behavior. Shared admission counters, token reservations, and process slots cover both AI entry points. Only usage receipts allow a null project scope; project message runs/results and non-usage receipts still require their project identity.
- Reduced human-response eligibility to two minutes, including never-started legacy/coalesced waits. Removed both participant paragraphs and retained the Lisno AI name.
- Removed the credential value from tracked `backend/.env.example`; verified the field is blank without printing the value. The ignored local key was preserved. The owner should rotate the potentially exposed credential through their OpenAI account.
- No dependencies or lockfile changes. No server restart, seed, production deployment, external customer communication, key rotation, or data migration was performed.

### Verification evidence

- Final backend focused run: 8 files, 128 tests passed, including 8 replica-set cases. This covers private service/route behavior, runtime timing, provider boundaries, pricing, current sources, and shared database accounting.
- Final backend contract run: 5 files, 158 tests passed (authorization policy, route registry, frontend contract parity, OpenAPI, and application wiring).
- Final frontend run: 4 files, 39 tests passed (private launcher/panel interactions, shared answer renderer/participant copy, existing estimate integration, and authorization vocabulary).
- Backend and frontend `npm run typecheck` and `npm run build` passed. Existing non-blocking warnings remain: Mongoose `validateSync()` deprecation and Vite chunks over 500 kB.
- `git diff --check` passed. The first sandboxed HTTP/Mongo test attempt could not bind sockets (`EPERM`); its permitted rerun passed. This was an environment restriction, not a product failure.
- Browser QA used synthetic data at 1440, 768, 390, and 320 pixels. At 1440/390/320, document/panel overflow was absent, the composer remained visible, and Escape restored launcher focus. Desktop and mobile screenshots were visually inspected. Only the isolated fixture's missing favicon generated a 404; its preview server was stopped afterward.
- Artifacts: `/tmp/lisno-ask-lisno/final-*.log`, initial baseline under `/tmp/lisno-ask-lisno/baseline`, and screenshots moved out of the repository to `/tmp/lisno-ask-lisno/screenshots/ask-lisno-{1440,768,390,320}.png`.
- Unrun: full repository suites, a new live OpenAI call through the private endpoint, and production checks. Existing integration was reused; provider and database behavior were tested with synthetic fixtures. No lint script exists.
