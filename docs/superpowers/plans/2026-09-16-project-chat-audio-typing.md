# Project chat audio fixes and named typing indicators — task plan

Date: 2026-09-16  
Status: Implemented and locally verified in Mode A; pre-existing full-suite failures documented below  
Approved source: [Specification](../specs/2026-09-16-project-chat-audio-bubble-design.md)  
Approval record: The user approved the combined specification and task plan, then selected Mode A on 2026-09-16. The user subsequently instructed autonomous completion without further approval pauses. No production actions or commits are included.

## Outcome and scope

Deliver the approved A1–A12 criteria: valid browser-recorded audio sends successfully; audio appears as a compact inline WhatsApp-style player throughout its lifecycle; project participants see other users' names while they type, without refreshing. Preserve authorization, upload limits, private storage, durable message replay and send idempotency.

Do not change critical/normal controls, add online/last-seen or audio-recording presence, introduce transcription/transcoding infrastructure, or modify unrelated chat features. No deployment, production mutation, live index operation, seed, backfill, commit or push is authorized. Additive typing model/index definitions and disposable local database tests are in scope. No dependency or lockfile change is currently expected.

## Baseline and confirmed integration points

- Starting commit: `1a0fdca` (`added chat screen`). At planning time the sole dirty path is the previously created specification, an untracked file owned by this task. No application-source changes exist. Recheck this at execution time.
- Real Chromium-produced WebM reproduces the exact upload error at `ManagedTokenizer.ignore()`: valid unknown-size Segment/Cluster lengths are passed through the installed EBML parser as unsafe numeric skips. The same bytes decode successfully in Chromium. Synthetic reproduction artifacts are in `/tmp/lisno-chat-audio-diagnosis-20260916/`.
- Audio UI currently lives in `ChatMessageAttachments.tsx` and `ChatFileTray.tsx`; both present file cards. `ChatTimeline.tsx` currently owns `ChatMediaProvider`, while `ProjectMessagesPage.tsx` renders the separate composer. Shared playback must therefore be integrated above both draft and timeline audio, without duplicating media controllers.
- Typing will extend `project-chat-stream.service.ts`, `projectChatStream.ts`, `ProjectChatProvider.tsx` and `ChatComposer.tsx`. The current stream carries durable `chat` frames and `state` frames but no typing.
- Backend chat operations use `projectChatContext`, current session/membership checks, and the shared authorization coordinator. Memory/Mongo repositories must remain aligned. The Mongo stream already has a polling fallback and real multi-process integration fixtures.
- `backend/tests/helpers/project-chat-process.ts` currently uses a fixed clock. Typing expiry/process tests need an explicitly controlled advancing clock without changing existing fixtures' time assumptions accidentally.

## Ownership and parallelism

Mode A is approved. The following non-overlapping assignments were used after T1 froze the contracts; all implementation ownership has now returned to the primary.

| Owner | Owned files/responsibility | Boundary |
| --- | --- | --- |
| Primary | Specification/plan; cross-layer contracts; `backend/src/contracts/project-chat.ts`, `backend/src/app.ts`, route-operation/OpenAPI inventories and their shared tests; frontend typing API/types/stream/provider/composer/page integration; shared `projectChat.css`; final review reconciliation and verification | Sole owner of shared contracts and integration files. Do not edit another writer's files until ownership is returned. |
| Backend audio implementer | `backend/src/domain/project-chat-attachment-validation.ts`; any new bounded WebM inspection helper; audio validation/upload tests; dedicated synthetic media fixtures | No typing, repository, authorization, application wiring or lockfile changes. Avoid shared process fixtures. |
| Backend typing implementer | Typing domain/service/model; chat repository interface plus memory/Mongo implementations; chat router and SSE/hub changes; typing tests and assigned chat process/Mongo helpers | Use frozen public contracts. No attachment-validation/media-fixture changes. Request changes to root-owned wiring/inventories rather than editing them. |
| Frontend audio implementer | `ChatMessageAttachments.tsx`, `ChatFileTray.tsx`, `ChatTimeline.tsx`, recorder/audio utilities as needed; new audio player/controller and scoped audio stylesheet; corresponding focused tests | No `ChatComposer.tsx`, `ProjectChatProvider.tsx`, `ProjectMessagesPage.tsx`, shared API/types or `projectChat.css` edits. Request integration from the primary. |

Every writer receives the explicit instruction that others share the worktree: preserve unrelated changes, never revert another owner's edits, and report required boundary changes immediately. Capture the dirty-path set and per-target diffs before delegation. A new shared fixture belongs to one named owner only.

Safe parallel phase: T2 backend audio, T3 backend typing and T4 frontend audio can run concurrently, while the primary performs T5 frontend typing and shared wiring. This uses at most four active agents including the primary. Subtasks may run in parallel within the single implementation parent; keep only one parent stage in progress. T6 integration follows all writers; T7 integrity review follows integration; T8 final verification follows review fixes.

## Dependency-ordered tasks

### T0 — Execution preflight and reproducible baseline

Owner: Primary. Depends on task-plan approval and execution-mode choice. Criteria: A1–A12 verification baseline.

- Recheck HEAD, dirty paths and relevant diffs. Preserve the approved specification and this plan. Record any new unrelated work before assigning files.
- Read the current recorder, validator, media provider, composer/page, SSE service/parser and authorization fences. Use bounded read-only audits in Mode A if an unresolved cross-layer question justifies them; do not duplicate already established findings.
- Run existing focused chat/audio/stream tests and both typechecks to establish current failures. Historical test counts are background, not proof of this baseline.
- Verify the synthetic browser reproduction still fails for the same reason. If temporary artifacts are gone, regenerate a real `MediaRecorder` sample from a synthetic Web Audio stream. Do not record a person's microphone or connect to customer storage.
- Record exact commands/results in this plan during execution. Keep baseline failures separate from new regressions.

### T1 — Freeze shared contracts and integration interfaces

Owner: Primary, with bounded backend/frontend feedback after Mode A selection. Depends on T0. Criteria: A4–A12.

- Define shared typing request, response and SSE snapshot types before consumers are implemented: request `{ composerId, sequence, typing }`; response includes the accepted sequence and effective status/expiry; snapshot `{ projectId, serverTime, participants: [{ userId, name, expiresAt }] }`. Align runtime validation and frontend types. No draft text or client-asserted identity enters the contract.
- Fix the approved timing constants: immediate first activity, activity refresh no more often than every 3 seconds, stop after 3 idle seconds, 8-second lease, inactive sequencing retention of at least 60 seconds. Define bounded request lifetime, composer-ID/sequence validation, active-lease limits, frame/read limits and rate-limit behavior as named constants with tests. Stop requests must not be starved by active-update throttling.
- Define server-derived session scope without storing raw bearer tokens, and identify the authorization-fenced read/write methods for leases and delivery. Name/session validity must be checked at delivery, not just when a lease was created.
- Define how the audio controller owns one active original and one analysis job, and its local-file versus authenticated-attachment entry points. Agree on minimal audio props for sender/time/download/status and on which layer renders the single message timestamp.
- Choose explicit waveform budgets from finite media duration, input size, sample rate/channels and expected decoded memory. Unknown/unbounded cases use the approved neutral seek/progress fallback. Confirm a duration-discovery path for browser WebM that does not require unbounded decoding or autoplay.
- Place the media-provider boundary in `ProjectMessagesPage.tsx` around both timeline and composer; agree on cleanup for project changes, read-only/denied states and filter remounts. The frontend audio writer supplies the controller interface; the primary owns parent wiring.
- Freeze ownership before writers start. Additive typing contracts are approved; a materially different API, permission expansion or persisted audio metadata requires a specification update rather than an improvised fallback.

### T2 — Repair bounded browser-audio validation

Owner: Backend audio implementer. Depends on T1. May run alongside T3–T5. Criteria: A1, A2, A3, A6, A7.

- Add small deterministic synthetic browser-generated fixtures, including a complete timesliced WebM and a recording stopped before the first timeslice. Document how each fixture was produced. Do not depend on `/tmp` files at test runtime or substitute a mocked recorder for encoded-media coverage.
- Implement container-aware unknown-size WebM handling at the inspection boundary. Preserve all tokenizer numeric/read limits and cancellation. Do not globally clamp unsafe skip lengths or blindly trust MIME claims.
- Verify EBML/container structure, supported track identity, required audio content structure, finite element bounds and eligible unknown-size contexts. Preserve audio/video classification, MIME aliases and filename-extension checks.
- Test malformed headers/sizes, illegal unknown-size elements, truncated required structure, missing tracks, spoofed extension/MIME, multiple clusters and bounded parser work. Keep valid finite WebM and non-WebM media paths intact.
- Exercise the real upload/stage/send path with accepted browser audio and verify failures still clean up reservations/storage safely. Add no new storage/public-URL path.
- Handoff: file list, root-cause fix, exact focused test results and any unresolved compatibility limits. Return ownership before integrated edits.

### T3 — Implement transient typing storage, endpoint and SSE delivery

Owner: Backend typing implementer. Depends on T1. May run alongside T2, T4 and T5. Criteria: A9–A12.

- Add the short-lived typing model with compound uniqueness and TTL cleanup indexes. Implement equivalent memory/Mongo lease updates, stale-sequence handling, inactive tombstones, bounded scans, aggregation by user, rate/lease limits and expiry filtering. Preserve original session identity and current validity.
- Keep updates under the established session/membership coordinator. Enforce `chat.send` and actual project membership. Reject identity spoofing and malformed bodies using runtime validation; stale updates return the effective stored result without extending activity.
- Add `PUT /projects/:projectId/chat/typing` to the chat router using the frozen contract. The primary updates app dependencies, operation inventory, API documentation and shared contract tests.
- Extend the current SSE pump with fresh initial typing snapshots and coalesced changes. Do not allocate message sequence numbers or durable event IDs. Do not write messages, audits, notifications, read state or activity timestamps for typing.
- Preserve authenticated delivery fencing, including current recipient membership and current typist membership/session. Remove expired/revoked identities before enqueueing. Typing failures must not leak names or grow queues; keep message replay and protected message delivery authoritative.
- Reuse bounded active-project wake/polling behavior for cross-process delivery. Send empty snapshots when typing clears. Avoid repeated full snapshots when nothing changed; apply per-project/tick coalescing only where it remains compatible with authorization fencing.
- Add unit, repository, route and stream tests for idle expiry, multiple composers, late/out-of-order updates, stop/refresh races, limits, session expiry and revocation. Test expired records still physically present before TTL cleanup.
- Add disposable replica-set/process coverage: writer and reader on different API processes, watch-disabled fallback, concurrent lease writes and authorization changes. Use a new dedicated process helper where needed to keep existing fixed-clock/crash tests stable. Any shared helper changes remain this owner's responsibility.
- Handoff: schemas/index definitions, exact behavior and test results, required root integration changes, and deployment prerequisites. Do not execute a live index command.

### T4 — Build the compact inline audio experience

Owner: Frontend audio implementer. Depends on T1. May run alongside T2, T3 and T5. Criteria: A4–A8.

- Build the reusable audio controller/player with authenticated fetches and local-file previews, an inline play/pause button, seek track, truthful duration and sender initials/microphone badge. Retain accessible download and unsupported-playback fallback.
- Reuse the existing bounded transfer pool and identity checks. Serialize optional waveform analysis, use measured amplitudes only, and release object URLs, native media, decoded buffers and analysis resources when ownership changes. Late fetch/decode/play callbacks must not attach to a different project/session.
- Support pause/resume/end/replay, keyboard and pointer seeking, and single-active-player behavior across draft and sent messages. Handle rejected `play()` promises and missing/infinite duration without a false duration label. Do not autoplay received/history messages.
- Replace audio cards in selected, pending/failed and delivered attachment branches. Preserve other attachment kinds, captions, replies, sender labels and one message timestamp. Remove duplicated audio-upload errors while retaining distinct actionable file failures and send retry/edit/discard behavior.
- At transfer completion, show checking/sending until server validation/commit finishes. Do not infer successful delivery from 100% upload progress.
- Keep CSS scoped in the audio module; request any shared selector adjustments from the primary. Test 44-pixel play targets, flexible waveform width and reduced-motion behavior.
- Add meaningful component/controller tests for actual state transitions, cleanup, denied fetches, stale completions, local/sent switching, missing duration and bounded-analysis fallback. Browser playback verification remains a required integration task.
- Handoff: parent-provider/props integration instructions, precise test results and responsive states ready for rendered review.

### T5 — Connect named typing to real composer activity

Owner: Primary. Depends on T1; integrate against the frozen contract while T2–T4 progress. Criteria: A9–A12, plus A7 shared lifecycle.

- Add the typing API method and strict SSE snapshot validation. Keep typing frames separate from durable batches/cursors and query invalidation. Validate project identity and clear state on disconnect, unavailable, denied, account/project change or expired entries.
- Keep server-relative expiry deadlines in transient state, deduplicate people by ID and exclude the current user. Do not persist typing to drafts or browser storage. A reconnected stream starts from a fresh snapshot.
- Add a focused activity publisher/hook with per-mounted-composer ID, ordered sequences, immediate leading activity, bounded refresh, idle stop and best-effort cleanup. Only actual user text edits trigger it. Cover paste, emoji, mentions and IME without breaking composition or send behavior.
- Stop on send, clear, blur, tab hidden, disablement, leaving Messages and session/project changes. Avoid accidental activity when restoring/editing an existing draft programmatically. Transient presence failures must not block sending or generate repeated toasts.
- Render a stable-height, accessible status line above the composer with one/two/many name formatting, stable ordering, full accessible names and reduced-motion dots. Do not add unread counts, notifications or audio cues.
- Complete root-owned route-operation/OpenAPI/app wiring in consultation with T3, and root-owned audio-provider/shared-CSS wiring in consultation with T4. Do not edit writer-owned files concurrently.
- Test timers, names, composition/input sources, lifecycle cleanup, multi-tab identity and unchanged message queries/cursors. Update existing composer/provider/layout test fixtures without weakening assertions unrelated to typing.

### T6 — Integrate the complete workflow

Owner: Primary after all writers finish. Depends on T2–T5. Criteria: A1–A12.

- Inspect all returned diffs and reconcile actual contracts, imports, props, provider placement, cleanup and authorization wiring. Resolve overlap by explicit ownership transfer, never by reverting another writer's work wholesale.
- Verify audio draft preview and sent playback share one controller and that timeline filtering/pagination does not orphan active resources. Check audio-only, captioned, replied-to and mixed-attachment messages.
- Verify the new typing frame cannot move a message cursor, alter unread/task counts, duplicate a message or trigger whole-history refetches. Test expired or revoked typists while legitimate messages continue flowing.
- Run the focused integrated tests and fix confirmed failures. Tests run during active writer edits do not count as final evidence.

### T7 — Integrity review and corrective work

Owner: `integrity_reviewer` in Mode A, primary inline in Mode B. Depends on T6. Criteria: A1–A12 with emphasis on A2, A7, A10–A12.

- Review the complete diff for parser bounds, unsupported unknown-size acceptance, track classification, MIME/extension spoofing and compensating cleanup.
- Review typing identity/session scope, sequence races, expiry/TTL separation, authorization fencing, across-process behavior, quota/rate limits, snapshot bounds and message-stream starvation.
- Review audio memory/fetch ownership, stale callbacks, autoplay, duration fallback, DOM accessibility, timestamp duplication, failure handling and responsive integration.
- Primary resolves confirmed findings, adds focused regressions where justified and reruns affected checks. Record disagreements and the evidence used to resolve them. Only then begin final verification.

### T8 — Final automated and rendered verification

Owner: `verification_runner` in Mode A after review fixes, primary inline in Mode B. Depends on T7. Criteria: A1–A12.

- Run the verification matrix below against the integrated worktree. Report exact commands, exit status, counts and limitations rather than inheriting earlier results.
- Use only synthetic fixtures, temporary local storage and disposable loopback databases/browser accounts. Do not run repository seed scripts or inspect customer files.
- Inspect actual screenshots at 320, 390, 768 and 1440 CSS pixels, plus 200% text zoom; exercise focus, keyboard seeking, long/multiple typist names, upload/failure and incoming/outgoing states. Compare the audio hierarchy and proportions with the user's second attachment.
- Exercise native browser recording and playback against the real upload/send API, and two signed-in browser sessions for named typing. Cover independent API processes in integration tests. Record available browser engines; identify any unavailable engine/device validation explicitly.
- If verification discovers a defect, return it to its owner or the primary, fix it, then rerun affected checks. Do not declare acceptance complete with an unresolved failure.

## Verification matrix and commands

Run commands from the specified workspace. New test filenames below are intended deliverables; keep this matrix synchronized if naming changes. There is no lint command.

| Lane | Commands/checks | Acceptance criteria |
| --- | --- | --- |
| Backend audio | `npm test -- tests/project-chat-audio-validation.test.ts tests/project-chat-audio-upload.test.ts tests/project-chat-attachments-validation.test.ts tests/project-chat-attachments.test.ts tests/project-chat-attachments-routes.test.ts` | A1–A3, A6–A7 |
| Backend typing | `npm test -- tests/project-chat-typing.test.ts tests/project-chat-typing-routes.test.ts tests/project-chat-typing-stream.test.ts tests/project-chat-repository.test.ts tests/project-chat-stream.test.ts` | A9–A12 |
| Mongo/process | `npm test -- tests/project-chat-typing-mongo.replica-set.test.ts tests/project-chat-stream-process.replica-set.test.ts tests/project-chat-membership-mutations.replica-set.test.ts tests/project-chat-attachments-mongo.replica-set.test.ts` | A1–A3, A7, A10–A12; preserve transaction and attachment behavior |
| Authorization/API inventory | `npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts tests/project-chat-routes.test.ts` | A9–A12; new operation documented and enforced |
| Frontend messages | `npm test -- src/features/messages` (including new player/controller and typing tests) | A4–A12 |
| Backend final | `npm run typecheck`, `npm test`, `npm run build` | Shared-contract and regression confidence |
| Frontend final | `npm run typecheck`, `npm test`, `npm run build` | Shared-provider and rendering regression confidence |
| Native audio browser flow | Record synthetic audio using the real `MediaRecorder`; upload/send; receive without refresh; play/pause/seek/end/replay; retry a failed transfer; reload history | A1, A4–A8 |
| Named typing browser flow | Two users; immediate first activity; idle/send stop; several typists and same-user tabs; project switch, disconnect/reconnect and permission loss | A9–A12 |
| Rendered/accessibility | Width/zoom matrix, focus and labels, no horizontal overflow, stable composer position, reduced motion, truthful duration and error states | A4–A8, A12 |
| Hygiene | `git diff --check`, `git status --short`, final per-target diff review | Scope and artifact preservation |

Run focused checks first, then the full frontend/backend lanes once after integrated review because the change touches shared authorization inventories, repositories, SSE and provider state. If a broader suite fails, reproduce and distinguish pre-existing failures from introduced regressions; do not quote historical counts as current evidence. Do not repeat broad passing suites unless subsequent changes or unresolved findings justify it. OCR checks are not required because this plan does not change the worker.

## Handoff and rollout boundaries

- Report implemented behavior, principal files/decisions, exact verification results, unrun checks and any remaining limitations. Link this plan and the approved specification with completed acceptance evidence.
- Describe the additive typing indexes and the requirement to establish them before enabling typing in production. No live index creation, production deployment, data migration or message rewrite occurs during implementation.
- Stop temporary browser sessions, servers and disposable databases. Remove temporary credentials/uploads; keep only useful local diagnostic evidence in ignored temporary locations and report those paths. Never commit runtime artifacts.
- Preserve all unrelated work. Do not stage, commit or push unless the user explicitly authorizes those actions later.

## Execution tracker

Current parent stage: complete (T8); production rollout remains outside scope. Initial application diff was empty; only this task's spec/plan were untracked. Baseline: backend focused 18/18 tests; frontend messages 84/84; both typechecks pass. Backend HTTP tests initially hit sandbox `listen EPERM`, then passed with authorized local-server execution. Logs: `/tmp/lisno-audio-typing-{backend,frontend}-baseline.log` and corresponding `*-types-baseline.log`.

Implementation decisions and evidence so far:

- WebM inspection validates original structure then supplies a bounded finite metadata envelope to the existing parser; stored media and general tokenizer bounds remain unchanged. MIME normalization also handles valid Ogg/Opus parameters. Backend audio validation/lifecycle: 47/47 focused tests.
- Typing uses an 8-second server lease, 3-second activity refresh/idle timing, 60-second ordering retention, 5 active/20 retained composers per user/project, 100 project leases and 120 active updates/minute/user/project. Higher stop sequences always persist; active-update limits do not suppress required stops. Typing read/delivery is batched inside the current authorization fence. Replica/process+existing stream/repository lane: 37 passed; latest stop-race unit/route/stream lane: 17 passed.
- Audio waveform is measured from a fixed-size live analyser during explicit playback; unplayed regions are neutral. No full-file PCM decode is used. Analysis gates are 8 MiB/5 minutes, 48 bins, FFT 1024, 5 samples/second; context must resume before routing media so blocked analysis cannot silence native playback.
- Integrated frontend messages: 117/117 tests; frontend typecheck passes. Nine existing HTTP/attachment-route tests now use wall-clock-valid JWTs while preserving fixture business clocks and explicit expired-token/session checks; all 9 pass.
- Native Chromium browser test recorded a 2.46-second WebM through the real recorder, previewed it, sent it through actual upload/message APIs and received it in a second participant's existing chat without refresh. No native control card/dialog; one timestamp. Recipient pause/replay and Home/End seeking passed; 14 real measured waveform bins rendered.
- Named typing between different API processes appeared in 267 ms and cleared on explicit stop. Frontend timer/lifecycle tests cover idle, hidden tab, reconnect, project/account changes, server-relative expiry and draft restoration without activity.
- Browser evidence: `/tmp/lisno-audio-typing-browser-qa/`. Rendered checks at 320/390/768/1440 pixels showed zero horizontal overflow, 44-pixel play controls and one timestamp. At 320/390 pixels with simulated 200% text-only zoom audio remained usable. A zoom-height defect was corrected: typing now reserves 40 pixels at 200% text zoom before/during/after activity, preserving transcript/composer geometry. Reduced-motion dots are static and keyboard seeking/focus passed.
- Native short-recording acceptance: real Chromium MediaRecorder stopped at 545.5 ms before the first 1000 ms timeslice, produced one 7,889-byte chunk, and successfully uploaded/sent to the other participant without refresh. A separately injected one-time HTTP 503 preserved the audio, displayed one error, and retried successfully. Reloaded history retained three inline audio rows without native audio cards.
- Integrity review found no confirmed backend, authorization, storage or playback blocker. An initial possible cached-project typing display gap was not reproduced by a negative control and was retracted as unconfirmed. A defensive page/project identity check remains; the non-regressing experimental test was removed. Existing project-change and stale-stream tests remain.
- Accessibility review corrected the sender badge to an image role and the attachment wrapper to a named group. Final rendered axe WCAG 2 A/AA and 2.1 AA: zero automated violations; two existing text-message timestamps in the scrolled timeline remain manual color-contrast review items. Audio accessibility checks passed.
- Chromium was available and exercised. WebKit launch reported its executable absent; Safari/iOS and Firefox device/engine checks remain unrun, and no browser dependency was added.
- Disposable browser sessions, both Vite servers, both API processes and the Mongo replica set were stopped. Temporary session credentials and synthetic uploaded storage were removed; only useful scripts/logs/screenshots remain in the temporary evidence directory. No production data was accessed.

- [x] T0 Preflight/baseline
- [x] T1 Shared contracts and interfaces
- [x] T2 Backend audio
- [x] T3 Backend typing
- [x] T4 Frontend audio
- [x] T5 Frontend typing/shared wiring
- [x] T6 Integration
- [x] T7 Integrity review/fixes
- [x] T8 Final verification/handoff

### Final verification evidence

- Frontend `npm run typecheck`: passed. `npm run build`: passed (Vite reports application chunks above 500 kB; no dependency changes).
- Frontend `npm test`: 198 test files passed, 4 failed; 2,798 tests passed and 4 failed. All 117 messages tests passed. Logs: `/tmp/lisno-audio-typing-final/frontend-{typecheck,tests,build}.log`.
- The four frontend failures were independently reproduced from unmodified committed HEAD `1a0fdca` in an isolated temporary checkout: signup test expects a removed Address field; password-reset test retains the prior input element value; legacy margin pending-change projection expects `incomplete: true`; own access-request dialog focus assertion. Baseline command: `npm test -- src/app/router.test.tsx src/auth/PasswordResetPage.test.tsx src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/test/accessibility.test.tsx`; 188 passed/4 failed across 5 matching files. Log: `/tmp/lisno-audio-typing-final/frontend-baseline-failures.log`. These unrelated sources were not changed.
- Backend `npm run typecheck` and `npm run build`: passed. Full `npm test`: 148 test files passed, 3 failed; 2,978 tests passed and 4 failed. All scoped audio, typing, attachment, authorization/API inventory, repository and replica/process tests passed. Logs are under `/tmp/lisno-audio-typing-final/`; full-suite tail is `backend-tests-captured.log`.
- Three backend journey failures reproduced identically against unmodified committed HEAD: estimate approval DTO expectation, mixed-case client journey's design upload returning 409, and OCR drawing metadata expectation (baseline 10 passed/3 failed). The remaining estimator rollback test timeout and a Super Admin bootstrap teardown timeout both passed on isolated rerun, 19/19 tests with successful teardown. Baseline command: `npm test -- tests/full-journey.test.ts`; isolated rerun: `npm test -- tests/production-super-admin-bootstrap.test.ts tests/ai-estimator-knowledge-bootstrap.replica-set.test.ts`. Logs: `backend-baseline-failures.log` and `backend-timeout-rerun.log` in the final evidence directory. Those unrelated product files were not changed.
- An initial sandbox-only backend attempt could not bind local ports. A redirected escalation waited without executing; retrying the established approved exact `npm test` command allowed the full suite to execute and finish. This was an execution-environment delay, not an application defect.
- Final `git diff --check`: passed. No repository lint command exists. OCR tests were not run because no worker sources changed. No dependencies or lockfiles changed. No commit, push, deployment, live index creation, seed or production migration was performed.
- Rollout prerequisite: create the additive compound unique/query and TTL indexes declared in `backend/src/models/ProjectChatTyping.ts` for both typing lease and rate collections before production enablement. The implementation tests create them only on disposable replica sets. No historical messages or audio require rewriting.

Temporary committed-HEAD baseline copies were removed after the comparison runs. Final verification processes have exited; evidence logs and responsive screenshots remain at the paths above.
