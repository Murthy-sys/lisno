# Project chat attachments, audio and emojis — implementation plan

Date: 2026-09-16
Status: Complete locally; implementation, integrity review, verification and cleanup finished
Source of truth: [Approved specification](../specs/2026-09-16-project-chat-attachments-emoji-design.md)
Specification approval: The user approved the specification in this conversation on 2026-09-16, including its stated voice-note recording default and attachment limits.
Execution mode: A — parallel sub-agents, selected after this task plan was approved.

Preservation baseline: `/tmp/lisno-chat-attachments-baseline-20260916-143711` records dirty paths, diffs, hashes and copies before implementation. M0 audits complete. Backend repository contract ownership is delegated to the backend implementer; the primary retains public DTO ownership.

## Outcome and fixed boundaries

Extend the existing project conversation with images, video, documents, ZIP archives, audio uploads, voice-note recording and an emoji picker. Files remain private to their uploader until one message commits its complete attachment selection. Recipients receive the message through the existing live stream and can preview/play supported media or download the original bytes.

Approved defaults: 10 attachments per message; 50 MiB per file; 100 MiB combined; two concurrent client transfers; 20 staged attachments/200 MiB per sender/project; 24-hour ready-upload expiry; five-minute voice-note maximum. The exact allowlist and exclusions are in the specification. Do not replace these with different hardcoded frontend limits.

Preserve current project membership, operation-specific Super Admin behavior, stable mention IDs, issue permissions, same-key message retry, read-state rules and the WhatsApp-style layout. The cancelled Critical/Normal and typing-indicator request stays outside this extension. Do not add reactions, transcoding, archive extraction, OCR, public media links or external storage services.

This plan authorizes no application edits before its approval and the subsequent execution-mode choice. No staging/commits, deployment, real-project uploads, seed scripts, write migration, live index changes or external communication are included. Only this plan file is created in the current gate; the approved specification is not rewritten to record its approval.

## Evidence that determines the implementation

- The current send schema, message model and composer require nonempty text. Message/reply DTOs have no attachment fields. Additive contracts and conditional body validation are required; faking a caption would break the intended attachment-only behavior.
- `ProjectChatRepository` already supplies coordinated memory/Mongo transactions, and `ProjectChatService.send` creates the message, audit and durable event together. Association of staged files belongs in that transaction. Binary transfer and decoding must happen outside the database transaction.
- Shared upload middleware buffers files in memory and accepts PDF/images only. Introduce chat-specific parsing/validation; do not widen the design/finance middleware's accepted types.
- `FileStorage` supports opaque-reference buffer saves and stream reads. Add a managed streaming-storage capability with explicit reservations while preserving the old methods and their consumers. Avoid forcing every existing test adapter to invent unimplemented media methods.
- API progress uploads currently lack caller cancellation, and blob downloads lack local-progress/quiet options. Extend those helpers compatibly in the primary-owned API client; all shared callers retain their existing defaults.
- CORS currently permits only Authorization and Content-Type. Put upload identity and declared byte size in validated query parameters so authorization/quota reservation can occur before multipart parsing without adding custom authentication headers or relying on multipart field order. Declared sizes are untrusted and must equal measured bytes.
- Local storage is used by each API instance. The two-process verification fixture must share one disposable storage root as well as its disposable replica set. Do not claim this provisions shared storage for a production deployment.
- Existing chat code, contracts, app/server/registry changes and chat tests are already dirty or untracked from the completed feature. They are preservation inputs, not files to recreate. Historical results in [the original chat plan](2026-09-16-project-group-chat.md) are baseline context, not verification of this extension.

## Ownership and execution rules

In Mode B, the primary performs all slices and reviews sequentially. In Mode A, use native subagents only after selection, with at most three active children alongside the primary. Assign these non-overlapping boundaries after M1 settles the shared contracts:

| Owner | Exclusive write boundary |
| --- | --- |
| Primary integrator | This plan; shared backend `contracts/project-chat.ts`, `repositories/project-chat.ts`, frontend `projectChatTypes.ts`; managed-storage interfaces; `app.ts`, `server.ts`, environment configuration, application indexes, route-operation/audit/OpenAPI inventory and affected shared tests; frontend `api/client.ts` and its tests; package manifests/lockfiles only if needed. |
| Storage implementer | `backend/src/storage/local-storage.ts`, a focused new managed streaming-storage implementation if extracted, and `tests/local-storage.test.ts` plus new managed-storage tests. The primary defines the interface first; further contract changes return to the primary. No chat service/model or shared upload-middleware edits. |
| Backend attachment implementer | New chat attachment domain/validator, multipart middleware, model, routes, service and cleanup service; existing `domain/project-chat.ts`, `models/ProjectChat.ts`, memory/Mongo chat repository implementations and `services/project-chat.service.ts`; chat-specific tests/helpers. No app/server/config/registry/contract/storage-interface/package edits. |
| Frontend implementer | Messages feature except the primary-owned types contract: API wrappers, draft/send state, provider lifecycle, composer, timeline, media/emoji/recording helpers, feature-local CSS and tests. No global API client, auth, app shell, router or shared UI primitive edits. |
| Integrity reviewer | Read-only review of the integrated storage, authorization, lifecycle and frontend changes after writers finish. |
| Verification runner | Tests/builds and isolated temporary browser fixtures after review fixes; no product-source edits. |

Every writer receives: “You are not alone in the codebase. Preserve other edits; do not revert or overwrite another owner's work.” Capture relevant diffs and copies of untracked targets before assigning them. Any change to another owner's boundary returns to the primary for a sequential handoff. Test results observed during concurrent edits are preliminary, not final integrated evidence.

## Dependency-ordered tasks

### M0 — Capture the preservation baseline and settle the implementation brief

Owner: primary. Dependencies: task-plan approval and execution-mode choice. Acceptance: A1–A10.

- Record `git status --short`, tracked target diffs and copies/hashes of existing untracked chat/storage target files in an ignored temporary directory. Preserve the current documents and all unrelated changes.
- Reconcile the approved spec against the then-current tree; confirm configured storage, transaction boundary, file/parser capabilities, supported runtime and current test baseline.
- Publish the bounded implementation brief. In Mode A, independent read-only audits may inspect upload/storage failure paths and frontend transfer/recorder lifecycle before assigning writers; no duplicate or overlapping implementation ownership.
- Completion: actors, limits, lifecycle, routes and ownership are fixed; no unresolved product decision blocks implementation.

### M1 — Define contracts and shared transfer primitives

Owner: primary. Dependencies: M0. Acceptance: A1–A5, A7, A10.

- Define attachment policy, kinds, public descriptors, staged upload response, send attachment IDs, reply attachment summary and explicit error codes. Historical messages normalize to an empty attachment array. Keep original message body and immutable identity separate from presentation summaries.
- Define repository records/operations for quota reservations, staged uploads, generation/lease ownership, ready/finalized files, message association and cleanup claims. A unique project/uploader/client-upload key and conditional state/version writes prevent duplicate ownership. Bind attachment association to the existing message transaction.
- Define a managed storage capability for generating opaque targets, streaming an exact bounded upload, opening an artifact for bounded validation, publishing a completed artifact and removing it. Reserve all original/preview targets in the durable lifecycle before writing. Preserve existing `save`, `saveGenerated`, `read`, `open`, `delete` behavior and safe-reference validation.
- Fix upload preflight parameters: opaque stable `uploadId` and declared `sizeBytes` are available before the file body. Validate them strictly; reserve count/bytes/concurrency before parsing and reject streams that disagree. A ready-key replay must verify identity/content compatibility; do not blindly return a different upload merely because its size matches.
- Extend `postMultipartWithProgress` with AbortSignal/timeout support and reliable listener cleanup while preserving existing callers. Extend authenticated blob fetch with cancellation, quiet mode and bounded progress where available. Never report artificial progress when length is unknown or expose tokens in URLs.
- Confirm a maintained signature/container parser compatible with the actual Node runtime if existing libraries are insufficient. A focused backend dependency is permitted by the approved spec when justified; primary owns its manifest/lockfile change and documents why. Reuse existing Sharp for bounded image previews. No new frontend emoji library, transcoder or external service is planned.
- Completion: backend/storage/frontend owners have exact compatible TypeScript contracts and transfer semantics. No worker invents fallback types or imports another slice's unfinished private implementation.

### M2 — Implement managed streaming storage

Owner: storage implementer. Dependencies: M1. May run alongside M3/M4. Acceptance: A3–A5, A10.

- Implement private, exclusive-created artifacts under server-generated opaque references; keep path traversal, absolute paths, separator injection and overwrite protection intact. Never trust the original filename as a storage path.
- Stream bytes through bounded size accounting and checksum computation with abort/timeout handling. Clean partial writes on ordinary errors, while durable reservation records allow cleanup after process interruption. Expose no filesystem path to routes or clients.
- Support bounded inspection through the adapter without requiring entire videos/archives in memory. Keep the old PDF/image storage path fully compatible.
- Use generation-specific targets so a delayed failed attempt cannot overwrite a later retry. Cleanup and late writers must remain recoverable even if deletion encounters an open file.
- Test exact bytes, opaque names, file permissions, traversal, collisions, abort, size mismatch, missing files, failed writes/deletes and interrupted streams. Measure memory during a large synthetic stream; do not accept whole-buffer media implementations.
- Completion: the new storage capability passes focused tests and the old local-storage contract still passes.

### M3 — Implement attachment persistence, uploads, send association and cleanup

Owner: backend attachment implementer. Dependencies: M1; real-storage integration depends on M2. Acceptance: A1–A6, A10.

Affected areas: new `project-chat-attachments` domain/service/routes/model/multipart helpers; existing chat memory/Mongo repositories, domain validation, message model and service. Name focused tests `tests/project-chat-attachments*.test.ts`, with replica-set variants for transactional behavior, so the chat test selection includes them.

- Implement policy and strict validation for every approved format. Detect bytes/containers rather than trusting MIME/extension; handle Office ZIP containers distinctly from ordinary ZIP, and distinguish supported audio/video containers. Inspect archives in bounded fashion without extracting entries to disk or executing content. Validate text separately. Preserve shared upload validators.
- Preflight authentication, current project membership and `chat.send` before consuming file bytes. Reserve uploader/project quotas atomically across processes; cap active transfer leases and bound stalled requests. Binary transfer, parsing and preview generation remain outside authorization/database transactions.
- Stream and validate each original, generate a bounded preview for decodable images and finalize under fresh session/membership and lease checks. Enforce measured file size/checksum; keep valid undecodable media downloadable with a truthful preview-unavailable state.
- Preserve the approved lifecycle: uploading → ready → attached, or cleanup-pending → deleted. Track original, partial and preview artifact references before writing. Ready uploads expire after 24 hours; stalled upload leases become cleanup candidates. Do not drop quota reservations before ownership and cleanup state are reconciled.
- Add attachment-only body validation to both the runtime schema and persistence model. During send, verify every unique attachment ID is ready, unexpired, same-project and owned by this actor. Enforce aggregate count/bytes and associate all IDs atomically with message/audit/durable event. No visible message, unread count or Critical count changes on staging alone.
- Preserve message retry semantics, including legacy text-only idempotency fingerprints. Canonicalize omitted/empty attachment fields consistently and test retries of operations created before the extension; an additive default must not turn a valid old retry into a conflict.
- Preserve immutable attachment order/metadata and quote summaries. Batch metadata resolution for message pages; avoid one extra lookup per history row. Rejected or partial uploads never create partial messages.
- Implement current-membership-gated content/preview streaming. Staged originals are uploader-only; committed attachments follow message-history access. Disallow cross-project substitution and deletion of committed files. Set safe Content-Disposition, private/no-store and nosniff; handle disconnect/missing storage without leaking private references.
- Implement a leased cleanup runner with bounded batches and retry/backoff. A conditional claim competes with message attachment on the same lifecycle record; only the winning valid transition proceeds. Delete artifacts outside transactions and retain a durable failure record if deletion fails. Never use metadata TTL as a substitute for file cleanup.
- Test sender/outsider/revoked/expired/Super Admin cases, MIME spoofing, invalid containers, quotas, duplicate uploads, changed-content keys, partial failure, ambiguous response, lost authorization and old-document defaults. Use a replica set for quota/send/cleanup and source-revocation races, including two unequal projects.
- Completion: staged and committed file semantics work in memory and Mongo, with no route bypass and no unresolved ownership race.

### M4 — Build transfers, media messages, emojis and voice notes

Owner: frontend implementer. Dependencies: M1; may progress with typed mocks alongside M2/M3. Real integration follows M3. Acceptance: A1, A2, A6–A10.

- Extend feature API wrappers and policy query. If the server does not support attachments, keep text chat working and hide unusable upload/recording controls; distinguish that compatibility state from temporary failures and permission loss.
- Extend session-memory drafts and attempts with ordered local selections, File/Blob handles, stable upload/message identities, staged descriptors and transfer states. Use one bounded two-transfer scheduler per active project/session, not two new parallel uploads for every attempt. Never put bytes/tokens into query keys or persistent browser storage.
- Snapshot a draft when Send is pressed. Upload all selections, then submit one existing JSON message mutation. Keep transfer and message failures distinct, preserve completed stages for retry, and keep the outgoing bubble truthful. Cancel aborts transfers and discards safely removable stages; an ambiguous message commit must first be resolved by same-key replay before its attachments can be discarded.
- Preserve a newer draft while an earlier attempt completes. Project switch cancels active transfer work but keeps recoverable local attempts for that session. Logout/revocation aborts requests, drops file handles and preview URLs and ignores late callbacks. Rejected uploads must not silently send text or only the successful files.
- Add Attach/Emoji controls, native file selectors, drag/drop and clipboard-image insertion with the same validation/queue. Show a compact selected-file tray, local previews, per-file progress and Remove/Cancel/Retry. Keep the importance/reply controls and shared-client notice usable at 320px; do not crowd essential controls off-screen.
- Build lazy image thumbnails/viewer, on-demand audio/video playback and file/ZIP tiles with authenticated download. Reuse existing dialogs/overlay focus behavior. Use one bounded active original-media viewer/player and a bounded visible-thumbnail cache; release object URLs on eviction/exit. Unsupported codecs and preview failures retain Download.
- Reserve media layout dimensions; preserve bottom-follow and older-history anchors as previews resolve. Attachment-only messages and replies have useful accessible text without inventing a user caption. Incoming media must not autoplay or trigger eager original-file downloads.
- Add a feature-local emoji dataset/picker with categories/search, labelled buttons, keyboard navigation, Escape and focus restoration. Insert at the saved caret/selection and run mention reconciliation; preserve Unicode, IME and current text limits. Do not add reactions or an external emoji service.
- Implement explicit microphone-start, supported MIME negotiation, elapsed time, Stop/Cancel and preview/Send/Discard. Release all tracks/listeners/timers for normal completion, errors, late permission resolution, hidden/page/project exit and session loss. Enforce five minutes/size locally; server validates the uploaded result. No autoplay or automatic send after recording.
- Add meaningful interaction tests for attachment-only sends, mixed selections, retry/cancel, new drafts during transfer, session/project races, blank quotes, emoji/mention offsets, recorder lifecycle and responsive controls. Preserve existing chat tests and extend fixtures additively.
- Completion: all feature flows work against the agreed API shape, with no late transfer/recording resource leaks and no dependency on private backend fields.

### M5 — Integrate routes, policy, maintenance and shared consumers

Owner: primary. Dependencies: M2–M4. Acceptance: A1–A10.

- Wire managed storage, attachment service/routes and policy through `AppDependencies`, `createApp` and server initialization. Keep an injectable path for existing memory tests and old storage adapters; unavailable attachment capability must not break unrelated workflows.
- Add validated chat-only environment settings, with approved defaults converted explicitly to integer bytes. Do not alter the existing design/finance `MAX_UPLOAD_MB` semantics. Publish exactly the effective policy used by backend validation.
- Register policy/content/preview reads under `chat.read`; upload/discard under `chat.send` with uploader/current-membership enforcement in the service. Preserve operation-specific Super Admin behavior: global permitted chat reads do not grant deletion or use of another person's staged files. Update OpenAPI and protected inventory fixtures together.
- Register additive models/indexes through `initializeApplicationIndexes`; no live migration/index synchronization is run. Wire bounded cleanup maintenance and await it during normal/error shutdown. Keep the receipt scheduler and existing chat stream shutdown intact; do not start unmanaged timers in every test app.
- Integrate the server's existing audit vocabulary with attachment lifecycle events using opaque IDs/byte counts and error categories, without raw file data, private paths or token-bearing output.
- Update shared API/environment/authorization/inventory/server/storage tests only where contracts actually change. Verify representative legacy uploads and old text messages continue working. Preserve the current AppShell/router and overview Messages entries.
- Run preliminary focused checks and an actual-app smoke flow with temporary synthetic media. Correct integration defects before freezing writers for independent review.
- Completion: backend/frontend use the same policy and DTOs; one selected-project stream distributes only committed messages; cleanup is wired and stoppable.

### M6 — Review integrity and resolve findings

Owner: independent integrity reviewer in Mode A; primary in Mode B. Dependencies: M5, all writers paused. Acceptance: A2–A5, A7, A10.

- Review pre-body authorization, current sender/read membership, non-disclosing resource lookup, same-project/upload-owner binding and session expiry during transfer.
- Review durable reservations, byte/concurrency quotas, lease generation, replay fingerprints, upload/send/cleanup atomicity, preview cleanup and crash windows. Confirm no raw filesystem access escaped the storage abstraction.
- Review async cancellation, old-session responses, object-URL lifetime, recorder tracks, prompt cancellation, abort listeners, ambiguous commit handling and draft preservation.
- Review supported type enforcement, container-parser limits, hostile filenames, decoder bounds, passive downloads and metadata leakage. Reconcile every new route with operation/OpenAPI inventories.
- Report concrete findings with paths and reproductions. The owning writer fixes confirmed findings; rerun affected checks, then freeze the integrated tree before M7. No unresolved security/data-loss concern is accepted as a normal limitation.

### M7 — Verify the integrated result

Owner: verification runner in Mode A; primary in Mode B. Dependencies: M6 resolved. Acceptance: A1–A10.

Run focused checks first, then full checks because shared storage, API helpers, message contracts and server lifecycle change. Independent backend/frontend commands may run concurrently only after writers finish.

Backend, from `backend/`:

```sh
npm test -- tests/project-chat tests/local-storage.test.ts tests/uploads.test.ts tests/estimate-client-review-storage.test.ts
npm test -- tests/config.test.ts tests/server.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts
npm run typecheck
npm test
npm run build
```

Include every new managed-storage test explicitly if its filename is outside these selections. Transactional attachment tests must use a replica set; do not replace them with a standalone database or weaken semantics to pass.

Frontend, from `frontend/`:

```sh
npm test -- src/features/messages src/api/client.test.ts src/api/requestActivity.test.ts src/components/ui/Dialog.test.tsx src/components/ui/Drawer.test.tsx
npm run typecheck
npm test -- --maxWorkers=3
npm run build
```

Repository hygiene: `git diff --check`, `git status --short`, plus diff/hash comparison against M0 including previously untracked files. There is no lint script. OCR worker tests are not required unless its source/contract is unexpectedly affected; such expansion must return to the primary.

Historical baseline: the original chat work documented three unchanged-HEAD backend `full-journey.test.ts` failures and four frontend failures (signup Address label, password-reset input clearing, access-request drawer focus, legacy estimator margin pending state). Reconfirm their identity against the current run; never classify a new failure as baseline without evidence. Report actual counts and logs, not historical passing totals.

#### Required rendered and fault matrix

| Acceptance | Scenario/evidence |
| --- | --- |
| A1 / A6 | Two independent users on two actual API processes share image/video/document/ZIP/audio fixtures, including mixed attachment-only and captioned messages. Recipient receives without reload; original download checksums match. Confirm staging alone creates no visible message/count/event. |
| A2 | Throttled transfer shows real progress; cancel, network failure, one-file failure, retry after lost response and message commit ambiguity produce no duplicates or partial sends. New draft survives prior completion. |
| A3 | Outsider/project-B user cannot guess/read/delete/attach project-A or another user's staged ID. Revoke/expire sender during transfer and recipient before download; clear local blobs and reject subsequent access. |
| A4 / A5 | Malformed/spoofed fixture matrix, exact and over-limit sizes/counts, actual-vs-declared mismatch, concurrent quota exhaustion, metadata/storage errors, crash recovery and cleanup-vs-send race. Validate originals and generated-preview cleanup together. |
| A6 | Images reserve layout, lazy preview fetches stay bounded, video/audio require explicit Play and have no autoplay, unsupported codec/missing file has fallback. Large synthetic streams do not buffer all files per request. |
| A7 | Record synthetic microphone audio where automation allows; verify permission-denied/unsupported/late-resolution states with controlled tests. Stop/Cancel/Send and navigation/logout release tracks. Do not activate a real user's microphone for automated QA. |
| A8 | Emoji picker caret replacement, multiline text, family/skin-tone/multi-code-point sequences, IME and emoji adjacent to an existing mention. Keyboard escape returns focus. |
| A9 | Actual AppShell at 320, 390, 768, 1024 and 1440px plus 390×420 keyboard-height simulation and landscape. Long filenames, ten-file tray, media viewer, emoji popup and recorder remain usable. Inspect screenshots and run rendered accessibility assertions. |
| A10 | Existing text-only, reply/importance/read/retry flows, client/designer/chat-only worker access, app navigation, one active stream and unaffected design/finance uploads. |

Keep fixtures/database/storage under a unique temporary QA root, use only synthetic `.test` identities, and never print session tokens. Adapt the existing two-process helper to share temporary file storage; the old chat-only helper does not exercise attachment routes by itself. Mount the real AppShell/router for visual QA. Record physical-device/Safari/Firefox/codec coverage separately; viewport and mocked-microphone tests are not physical-device evidence.

### M8 — Reconcile, clean up and hand off

Owner: primary. Dependencies: M7 and all resulting fixes/rechecks. Acceptance: A1–A10.

- Inspect the final integrated diff against M0, including dependency rationale and every changed shared contract. Confirm the approved allowlist/limits and exclusions still match the product.
- Record exact commands/results, acceptance evidence, screenshots/log paths, known baseline failures and any unrun physical-device/proxy/load checks in this plan. No partially verified flow is reported as complete.
- Stop only owned browsers, Vite/API processes, recorder tracks and disposable replica sets; remove temporary credentials and test uploads. Keep useful non-secret reports outside the repository. Do not retain generated media/build/cache/runtime artifacts as source changes.
- Report the result, principal files/decisions, any dependency added, no live migration/deployment/external actions, and remaining rollout/device limitations. The change is local until deployment is separately authorized.

## Dependency graph and current ledger

Only one parent phase is active at a time: M0 baseline → M1 contracts → construction (M2 + M3 + M4) → M5 integration → M6 review → M7 verification → M8 handoff. During construction, M3 tests against a storage double until M2 lands; M4 tests against agreed API fixtures until M3 lands. These temporary mocks do not replace the integrated real-API checks. Primary shared-file work is sequential and never overlaps a worker's assigned path.

| Item | Current status |
| --- | --- |
| Attachment/audio/emoji specification | Approved by user on 2026-09-16; voice-note default included. |
| This task plan | Approved by user. |
| Execution choice | A — parallel sub-agents. |
| M0–M5 implementation | Complete; preliminary backend chat74, frontend feature84, API27 and storage14 tests passed. Shared fixture updates are being reconciled. |
| M6 integrity review | Complete: exact MIME/extension pairs, actual chunked-body bounds and structural PDF validation fixed and independently re-reviewed. No remaining concrete findings. |
| M7–M8 | Complete. Owned browsers, Vite/API processes and replica set stopped; temporary credentials, storage, media fixtures and downloaded ZIP removed. Reports/screenshots retained outside the repository. |
| Dependencies | Backend file-type, music-metadata, strtok3, yauzl and busboy plus parser type definitions; bounded signature/container parsing. No frontend dependencies. |
| Production, migration, external or source-control actions | None authorized or performed. |

### Implementation decisions and review evidence

- Managed artifacts use retained zero-byte tombstones at the original opaque generation target. This prevents delayed exclusive writers from recreating a deleted upload across processes. Tombstones retain filesystem metadata; purging them requires proof that old writers are quiescent.
- Media inspection uses bounded adapter reads. PDF validation explicitly reuses the established structural validator with a measured maximum 50 MiB buffer and one active PDF validation per API process; saturation returns a retriable 503. Abort is checked before and after parsing; no hard-kill decoder guarantee is claimed. Other original media is streamed, and Sharp previews decode from the private adapter path with pixel/output/time/concurrency limits.
- Local storage implements the managed capability without changing existing FileStorage consumers. Chat policy can disable uploads while keeping existing downloads available. The shutdown-managed maintenance timer waits for both receipt and chat cleanup work.
- Backend dependencies: file-type, music-metadata, strtok3, yauzl and busboy plus types. Sharp was updated to 0.35.4 after its existing HEIF dependency advisory was identified ([upstream advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c)). No frontend dependencies were added.
- Preliminary real two-process test passed: upload through API A, commit through B, receive via A's stream, and hash-match original/preview downloads through both APIs using one disposable storage root. Staged privacy and cross-project access were checked. No production storage was provisioned.
- Native-agent thread limits prevented additional custom-role threads; existing independent read-only auditor performed integrity review, and the frozen implementation agents were reused for final read-only verification. Product ownership remained disjoint.

### Final verification — 2026-09-16

All logs, synthetic screenshots and the baseline comparison report are under `/tmp/lisno-chat-attachments-browser-qa/`. No production database, user files or real microphone was used.

| Check | Result |
| --- | --- |
| Backend `npm run typecheck` and `npm run build` | Passed. |
| Backend focused `npm test -- tests/project-chat tests/managed-storage.test.ts tests/local-storage.test.ts tests/uploads.test.ts tests/estimate-client-review-storage.test.ts tests/config.test.ts tests/server.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts --maxWorkers=3` | 322/322 tests passed, 23 files. Includes 79 chat tests, replica-set and two-process tests. |
| Backend `npm test -- --maxWorkers=3` | 2,930 passed; 3 unchanged baseline failures in `full-journey.test.ts`, matching the original HEAD baseline. 144 files passed, 1 failed. Initial warning output was truncated; final failures/summary retained in the log. |
| Frontend `npm run typecheck` | Passed. |
| Frontend `npm test -- src/features/messages src/api/client.test.ts src/api/requestActivity.test.ts src/components/ui/Dialog.test.tsx src/components/ui/Drawer.test.tsx` | 179/179 passed, 13 files. |
| Frontend `npm test -- --maxWorkers=3` | 2,765 passed; the same 4 baseline failures in signup Address, password-reset clearing, access-request focus and legacy margin projection. Exact title/error/assertion comparisons are in `frontend-verification-report.json`. |
| Frontend `npm run build` | Passed; existing large-chunk warning remains. Rerun after final two-color accessibility correction. |
| Frontend `npm test -- src/features/messages` after contrast correction | 84/84 passed. |
| `git diff --check`; M0 file-hash comparison | Passed; no baseline source paths removed, unrelated initial work preserved. |
| Production dependency audit | New parser dependencies have no reported advisory in this audit. Sharp advisory resolved by 0.35.4. Existing unrelated Multer/Nodemailer/qs advisories remain (2 high, 1 moderate); no unrelated dependency upgrade performed. |

Acceptance evidence:

- **A1/A6:** Two independent browser sessions on separate APIs received image, MP4, audio WebM, PDF and ZIP attachments live. Images displayed; native video/audio played the synthetic two-second clips without error. Browser ZIP download hash exactly matched its 175-byte fixture. TXT and synthetic voice notes also committed and appeared live. Originals loaded only after explicit View/Load/Download actions.
- **A2:** A deliberately failed upload preserved successful stages and a newer draft; Retry sent all three selected attachments once. Dropping the JSON response after a successful commit reconciled through the live stream to one message, with no duplicate or lingering Retry control. Automated tests cover cancellation, identity rollover, expired stages and session/project changes.
- **A3/A4/A5:** Memory, replica-set, HTTP, storage and two-process regressions cover uploader-only stages, current-membership reads, mismatched projects/identities, quota/CAS races, invalid formats, chunked-body overhead, exact bytes, malformed PDF structure, interrupted transfers, cleanup failure/retry and delayed writers. A 50 MiB synthetic streaming write remained below the test's 16 MiB additional ArrayBuffer threshold.
- **A7:** A browser-injected synthetic recorder required Record, then Stop, produced a playable preview without auto-sending, stopped its track and sent a valid voice attachment on explicit Send. Unit tests cover denied/unsupported APIs, late grants, cancellation, duration/size limits and teardown. No real microphone was activated.
- **A8:** Browser emoji search inserted `👍` at the saved caret (`Before 👍after`) and returned focus to the text input. Keyboard/mention/Unicode regressions passed.
- **A9:** Visual screenshots inspected at 320×740, 390×844, 768×1024, 1024×800, 1440×1000, 390×420 and 844×390. No horizontal document overflow; Send remained visible. Chat, emoji dialog and media viewer accessibility checks passed. Final desktop audit identified two selected-sidebar text contrasts, corrected locally to darker colors; final WCAG A/AA/2.1 AA audits returned no violations at 320/390/1024/1440 widths. An initial emoji audit during its opening transition was repeated after settling and passed.
- **A10:** Shared upload/storage, route-operation/OpenAPI inventory, original chat tests and both typechecks/builds passed. Only the seven pre-existing full-suite failures remain. Console errors observed in browser QA were the deliberately injected 503 upload and dropped message response; routine React development output is not a product error.

Verification limits: real iOS/Safari/Android microphones/codecs, device-specific keyboard/safe-area behavior, production reverse-proxy limits, production shared-volume topology and sustained multi-instance load were not exercised. No OCR source changed, so OCR tests were not run. No lint script exists. No migration, backfill, production index creation, commit, push, deployment or customer communication was performed. Deployment must use the new frontend/backend together and the existing shared-storage topology; this task did not provision infrastructure.

Cleanup proof: `cleanup-report.json` confirms no listeners remain on the four owned Vite/API ports and no private runtime credentials or uploaded fixtures remain. Playwright output was moved out of the repository. Final preservation comparison reports 42 intentionally changed baseline paths and zero missing paths; new files are confined to chat/storage contracts, implementations, tests and the approved documents.
