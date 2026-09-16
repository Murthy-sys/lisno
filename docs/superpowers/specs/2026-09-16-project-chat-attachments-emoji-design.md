# Project chat attachments, audio and emojis

Date: 2026-09-16
Status: Approved by user; implementation authorized in Mode A
Classification: Substantial cross-stack change involving authenticated uploads, storage lifecycle, message contracts and responsive chat controls

## Goal and request boundary

Allow current project-chat participants to send images, videos, documents, ZIP archives and audio, and insert emojis into their messages. Keep the existing WhatsApp-style layout, shared client/team audience, project membership checks, mentions, quoted replies, importance, unread handling and live delivery.

This is a new request after the user stopped the previous Critical/Normal and typing-indicator investigation. That stopped work is not resumed by this specification. This extension supersedes only the attachment/audio exclusions in the earlier group-chat specification. Existing approved membership and discussion permissions remain authoritative.

Only this specification is created at this gate. Application code, dependencies and the separate task plan remain unchanged. Existing uncommitted chat implementation is the preservation baseline; the initial dirty paths were inspected before writing this file.

## Current behavior and evidence

- `frontend/src/features/messages/ChatComposer.tsx` renders a text composer, mentions and importance controls. Its send guard requires nonempty text. There are no attachment, recording or emoji-picker controls.
- `projectChatState.ts` stores text, mention spans, priority, owner and reply in session memory. `ProjectChatProvider.tsx` maintains idempotent send attempts and clears session/project state on access loss. File objects and pending uploads are not represented.
- Backend/frontend `project-chat` contracts, `domain/project-chat.ts`, and `models/ProjectChat.ts` describe text messages with a required body and no attachments. Quotes snapshot only the original author/body. Attachment-only messages require an explicit contract and validation change.
- Existing authenticated chat REST mutations and durable SSE delivery already distribute committed messages across API processes. Attachments should use that message lifecycle; binary data must not enter SSE frames.
- `backend/src/middleware/upload.ts` uses single-file memory-buffered Multer parsing, validates PDF/image contents and accepts only PDF, PNG, JPEG, WebP, TIFF and HEIC. It is shared by existing design/finance workflows and must not be globally loosened for chat.
- `backend/src/storage/storage.ts` exposes buffer saves and stream reads. `local-storage.ts` creates private files using opaque UUID references and allows only the current PDF/image extensions. Its path validation and existing consumers must remain intact when chat storage support is added.
- `frontend/src/api/client.ts` already supplies authenticated multipart upload progress and blob downloads. Its progress helper currently has no caller AbortSignal support, and blob downloads always activate the global loader. Chat needs cancellable, session-safe transfers with local progress.
- `DesignPlanAttachmentPreview.tsx` demonstrates authenticated fetch-to-blob previews with object-URL cleanup. The server already has managed maintenance scheduling and compensating storage cleanup patterns. There is no existing chat attachment cleanup lifecycle or malware-scanning integration.

## Product behavior

### Composer and send flow

1. Add accessible **Attach** and **Emoji** controls beside the existing message input. An Attach menu exposes Photos/videos, Documents/ZIP and Audio. Native selection works on phone, tablet and desktop; desktop drag-and-drop and pasted clipboard images use the same queue.
2. Selected files appear in a compact preview tray with name, size, type and Remove. Images get local thumbnails; other files get truthful type labels. Users can add an optional shared caption, mentions, a reply and existing importance settings.
3. Selecting a file does not publish it or send a message. Pressing Send snapshots the draft, uploads the selected files with per-file progress, then commits one message containing its ordered attachments and optional caption.
4. Allow attachment-only messages. Reject a message with neither non-whitespace text nor attachments. Existing text limits and mention validation remain unchanged.
5. Offer Cancel during transfer and Retry after failure. Reuse completed staged uploads and the same message retry identity when their contents have not changed. Never silently send a partial subset of a selection.
6. Keep the conversation usable while transfers run. A failed attempt retains its caption, selected files, mentions, quote and importance for retry. New typing must not be overwritten by a late result from the previous send.
7. Local files and upload state survive an in-app project switch within the current session. Active transfers are cancelled on leaving their project and are retriable; logout/access loss clears sensitive state. Reload persistence for selected local files is not promised. Do not store file bytes in localStorage or query keys.

### Supported formats and initial limits

The following are proposed product defaults, not current repository capabilities. Publish the server's actual accepted types/limits to the composer so browser validation never invents a different policy.

| Category | Initial supported formats | Conversation presentation |
| --- | --- | --- |
| Images | JPEG, PNG, WebP, GIF, HEIC/HEIF, TIFF | Bounded image thumbnail and viewer; preserve original download. If the image cannot be decoded for preview, show a file tile with Download. |
| Video | MP4, MOV, WebM | Video tile; explicit load/play with native controls and download fallback. |
| Audio | MP3, M4A/MP4 audio, WAV, Ogg/Opus, WebM audio | Explicit load/play with native audio controls, filename and download. |
| Documents | PDF, DOCX, XLSX, PPTX, TXT, CSV | File tile with name, size and Download. No execution or embedded Office/document rendering. |
| Archives | ZIP | File tile with Download. Never extract or execute archive contents on the server. |

- Up to **10 attachments per message**, **50 MiB per file**, and **100 MiB combined per message**; maximum two concurrent transfers in one client. Enforce count/bytes on the server as well as in the UI.
- Chat limits are separate from the existing `MAX_UPLOAD_MB` setting so design/finance upload limits are unchanged. Their effective values must be configurable, validated and exposed through the chat policy response.
- Apply bounded concurrent-upload and staged-byte quotas per authenticated sender/project before accepting file bodies. Initial staging allowance: at most 20 uncommitted attachments and 200 MiB per sender/project, with an explicit wait/remove/retry error rather than unlimited staging. Enforce reservations atomically across API processes.
- Unknown formats, legacy Office binaries, executables, scripts, HTML and SVG are outside this initial allowlist. Error messages name the supported formats and the applicable size limit. ZIP is an opaque downloadable archive, not a promise that its contents have been inspected.
- No automatic video/audio transcoding, document conversion, content extraction or OCR. Supported containers may contain codecs the recipient's browser cannot play; retain a clear download fallback.

### Audio recording assumption

The user was asked whether audio should include in-chat recording. Unless corrected before approval, the proposed default includes both audio-file selection and voice-note recording, consistent with the requested WhatsApp-like chat.

- A labelled microphone control starts recording only after an explicit click and browser permission. Show elapsed time and Stop/Cancel, then a playback preview with Send/Discard. Never send a recording automatically.
- Limit a recording to five minutes and the same per-file byte limit. Stop and release every microphone track on cancel, completion, page/project exit, access loss or logout. Release a late-resolving microphone request if its recording session has already been cancelled.
- Choose a supported recording type at runtime; preserve the actual type returned by the recorder. Unsupported or denied recording leaves audio-file selection available with a concise explanation.
- Browser microphone access requires a secure context, and recording support must be checked rather than assumed. References: [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [MDN MediaRecorder.isTypeSupported](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).

### Emoji behavior

- Add a lightweight, accessible picker with common categories, labelled emoji buttons and search over the included emoji names. Native keyboard emoji and pasted Unicode remain supported, including emoji outside the picker's curated set.
- Insert at the caret or replace the selected text and restore input focus. Preserve multiline text, IME behavior, Unicode sequences and structured mention offsets using the existing edit reconciliation.
- Emojis are message/caption text. Reactions on previously sent messages, stickers, GIF search and third-party content services are not included.

### Received messages and responsive presentation

- Render attachment metadata inside the existing incoming/outgoing bubble, with the optional caption below the media. Preserve sender grouping, timestamp, sent state, issue actions and live updates.
- Multiple images use a bounded responsive grid. Media reserves its display area before loading so arriving thumbnails do not move a reader away from their history position. File names wrap or truncate with an accessible full name.
- Images use bounded server-generated previews when decodable. Load previews only near the visible transcript; fetch original media only on explicit View/Play/Download. Do not fetch every original file on a history page.
- Video/audio do not autoplay. Use authenticated fetch followed by an object URL for bounded, on-demand playback; show loading/progress until the file is available. Allow only a bounded set of active media blobs, release them on close/unmount/session changes and provide Download for unsupported playback. This first version does not promise playback before the complete bounded file has loaded.
- Attachment-only quotes show an attachment summary such as “Photo”, “Audio” or the document name; they must not become blank quotes or manufacture a user-authored caption.
- At 320px and larger, essential composer controls remain reachable, selected-file trays and emoji panels fit the visible viewport, and previews/dialogs remain scrollable at short heights. Preserve the visible client/team audience notice and existing application navigation.

## Architecture recommendation and alternatives

**Recommended: stage authenticated uploads, then reference their IDs in the existing JSON message mutation.** This preserves the current message idempotency, transaction and live-event model while supporting individual transfer progress, cancellation and reuse after a partial upload failure. It introduces a bounded staging/cleanup lifecycle that must be implemented explicitly.

**Alternative: one multipart message request containing text and all files.** This has fewer public endpoints but couples message retries to retransmitting large files, complicates partial failure and request timeouts, and makes per-file recovery less useful. It is not the proposed approach.

Continue using the configured storage abstraction; do not add an external bucket, CDN, WhatsApp integration or separate realtime transport. Extend storage with managed streaming writes as needed so a 50 MiB upload is not buffered wholesale per request. Existing buffer-save methods and validators retain their behavior. A focused file-signature/parser dependency may be added during implementation if existing libraries cannot reliably identify the agreed formats; justify and test it rather than hand-writing an unsafe permissive detector.

## Data, API and lifecycle contract

### Message shapes

- Add ordered `attachmentIds` to send input, defaulting to an empty array. Body may be empty only when one or more valid attachments are being attached. Existing text-only input remains valid.
- Add `attachments` to message output, defaulting missing historical data to `[]`. Each descriptor contains an opaque attachment ID, kind, sanitized original filename, canonical MIME type, byte size and available preview information. No storage reference, absolute path, access token or public permanent URL is exposed.
- Preserve immutable attachment identity/order once the message is committed. Extend reply snapshots with a compact attachment summary when needed. Importance history, original message IDs, mention identity and read/event sequence semantics stay unchanged.
- All committed attachment changes belong to the existing message-created transaction and event. An upload completion by itself does not increment message/unread/Critical counts or wake clients with a new visible message.

### Proposed authenticated endpoints

| Endpoint | Purpose and boundary |
| --- | --- |
| `GET /projects/:projectId/chat/attachment-policy` | Current participant reads effective allowlist, count/size limits and recording/upload capabilities. |
| `POST /projects/:projectId/chat/attachments` | One multipart file plus stable client upload identity; current sender stages an upload and receives its opaque ID/metadata. |
| `DELETE /projects/:projectId/chat/attachments/:attachmentId` | Uploader cancels/discards their uncommitted attachment. Cannot delete an attachment from a committed message. |
| `GET /projects/:projectId/chat/attachments/:attachmentId/content` | Authorized original-file download. |
| `GET /projects/:projectId/chat/attachments/:attachmentId/preview` | Authorized generated image preview when available. |
| Existing `POST /projects/:projectId/chat/messages` | Atomically associates ready owned uploads with the new message and preserves same-key retries. |

All paths remain under the existing API prefix and require registry/OpenAPI synchronization. No raw-file route bypasses authentication or project membership. Upload preflight runs before multipart parsing; membership/session/capability is rechecked when finalizing storage metadata and committing the message.

### Permissions

| Actor/state | Allowed behavior |
| --- | --- |
| Current participant with `chat.send` | Upload and commit their own files in this project; no ability to attach another user's staged upload. |
| Current participant with `chat.read` | Read committed attachments under the same conversation-history access as their messages. |
| Staged uploader | Read/discard their own uncommitted uploads while still authorized. Other participants cannot read or enumerate them. |
| Removed participant, expired session, unrelated project user | No new content/preview/download access; non-disclosing denied-resource responses. |
| Authorized Super Admin | Uses the existing operation-specific chat boundary; no general storage bypass. |

### Storage state and compensation

Lifecycle: local selection → reserved/uploading → validated/ready → attached to one committed message. Failure/cancellation/expiry transitions to cleanup-pending → deleted. The implementation must use explicit state and CAS/leases so cleanup cannot delete a file concurrently attached to a message.

- Reserve an opaque storage target and durable upload/cleanup identity before writing bytes, so a process crash cannot create an untraceable orphan. All filesystem/object access stays behind storage adapters. Temporary files are private and never publicly served.
- Stream to managed temporary storage with enforced byte/time/concurrency bounds, detect and validate contents, compute a checksum and finalize the ready record. Never trust extension or browser MIME alone. Compound formats must be distinguished by bounded container inspection, not arbitrary archive extraction; text is validated as text and served as a download.
- Store uploader/project identity, status/version, upload retry identity, sanitized metadata, checksum, private storage references and expiry. Align memory and Mongo repository behavior. Images may have a separately tracked preview artifact with the same cleanup ownership.
- Commit only ready, unexpired, same-project uploads owned by the sender. Associate all selected IDs once in the same transaction as message/event/audit creation. Reusing one attachment in a different message or changing a retry key's payload must not silently succeed.
- Compensate on signature failure, cancellation, storage/metadata failure, lost authorization or rejected message attachment. Retain retryable ready uploads while the attempt is recoverable; discard explicitly or expire after 24 hours. A leased, idempotent maintenance worker cleans abandoned uploads/partials and retries storage deletion failures.
- Do not rely on Mongo TTL deleting metadata to delete filesystem bytes. Cleanup must remove tracked artifacts successfully before removing their ownership record; keep failed cleanup observable and retriable. Never delete committed artifacts through staging cleanup.
- Stream authorized downloads, sanitize Content-Disposition, set private/no-store and nosniff, and handle missing storage with a clear retriable/unavailable state. Browser downloads already delivered cannot be recalled; revocation prevents subsequent server requests and clears this app's cached previews.

## Invariants, failure handling and compatibility

- No unsent attachment is visible to other project members. No cross-project ID substitution, raw URL sharing, guessed upload ID or stale browser result bypasses the backend.
- Preserve message text, mentions, quotes and original attachment bytes; no automatic severity classification or formal task/approval/finance mutation follows from a file upload.
- Cancellation and old-session responses cannot update a new session/project's draft or render an old blob. Abort transfers and release preview URLs/recording streams on lifecycle cleanup.
- Server validation failures identify the affected file and retain the unsent draft. One failing upload cannot publish the remaining files without the user's explicit correction. Retry does not duplicate files/messages/history events.
- Quotas and size/type checks remain authoritative under concurrent requests and multiple API processes. Avoid per-history-row metadata queries and unlimited decoded image size; image preview generation has pixel/time/resource limits.
- Existing message documents require no rewrite or backfill: absent attachments mean none. Additive attachment metadata/indexes and safe conditional body validation must preserve old text-only messages and shared upload/storage tests.
- Coordinate frontend/backend rollout for attachment-only rendering. A new frontend facing a server without attachment-policy support leaves text chat working and does not expose nonfunctional upload controls. Do not claim an old frontend can render the new media shape. Deployment and any live index preparation are separate, unperformed actions.
- Rollback can disable new uploads while retaining existing attachment metadata/files and authorized downloads. Do not erase sent files or downgrade a database containing attachments to code that cannot present them without an explicit rollout plan.
- Logs/metrics capture bounded error categories, transfer counts/bytes, cleanup backlog and opaque IDs. Do not log file contents, tokens, private paths or raw multipart data. There is no claim that type validation provides antivirus scanning.

## Scope exclusions and risks

Excluded: message deletion/editing, reactions/stickers, external file links, public URLs, image/video editing, transcription, OCR, archive extraction, full media search/gallery, resumable/chunked uploads, video transcoding, general online presence, typing indicators and the cancelled Critical/Normal changes. Browser recording is included under the stated assumption; it does not include calls or background recording.

Principal risks are unauthorized download/staging disclosure, orphaned files and cleanup/send races, memory/bandwidth pressure, stale-session object URLs, mobile codec/microphone differences, and breaking shared storage consumers. Verification must target these directly. Backend API replicas must use the deployment's same configured storage; this extension does not create shared infrastructure automatically.

## Acceptance criteria and verification

| ID | Required result | Evidence |
| --- | --- | --- |
| A1 | Every listed category can be selected, sent with or without a caption, received without refresh, and downloaded byte-for-byte. | Two independent sessions, actual API processes, representative valid fixtures, checksums and message/count assertions. |
| A2 | Upload progress, remove/cancel, partial failure and retry preserve the complete intended message without duplicates. | Frontend interaction tests plus backend same-key, concurrent-send and ambiguous-response tests. |
| A3 | Current participants can access committed files; staged files remain uploader-only and unrelated/revoked users cannot read, attach or discard them. | Asymmetric users/projects, expired sessions, cross-project IDs and revocation races including direct content/preview routes. |
| A4 | Limits and content/type validation hold across forged MIME/extensions, malformed containers, oversize/count/aggregate/quota violations and concurrent uploads. | Focused validator/route/storage tests and bounded-memory large-transfer checks. |
| A5 | File lifecycle survives persistence/storage failures, cancellation and process interruption; cleanup never removes a committed attachment. | Memory/Mongo parity and replica-set tests covering cleanup claim vs commit, duplicate retries and failed-deletion recovery. |
| A6 | Image/media/file bubbles, image viewing and native media controls are usable without autoplay or eager original downloads. | Rendered browser network/interaction checks; unsupported codec and missing-file fallback. Scroll anchoring remains correct as media loads. |
| A7 | Voice recording, if accepted, requires explicit interaction, supports preview/send/discard and always releases microphone resources. | Supported/unsupported/denied APIs, late permission resolution, duration/size limits, navigation/logout cleanup; real-device evidence identified separately. |
| A8 | Emoji insertion preserves caret/selection, Unicode, IME and mention targets. | Keyboard/caret and structured-mention regressions with multi-code-point emojis and text-length validation. |
| A9 | Phone/tablet/desktop layout and accessibility remain intact. | At least 320/390/768/1024/1440 widths, short keyboard viewport, long filenames, multiple-file tray, picker/dialog focus, reduced motion and rendered accessibility audit. |
| A10 | Existing text chat, importance, quotes, read state, membership/live stream and non-chat uploads continue working. | Focused regression suites, route/authorization/OpenAPI inventory, shared storage/upload tests, both workspaces' typechecks/builds and proportional broader tests. |

Use disposable synthetic files and databases only. No real project uploads, production migration, seed, deployment, commit or external communication is authorized by this specification. Historical passing totals are background; final checks must run on the integrated implementation and disclose any known baseline failures or unrun device checks.

## Assumptions and open decisions

- Proposed defaults are the allowlist, 10-file/50 MiB/100 MiB limits, 24-hour staging expiry and audio recording behavior above. They can be revised through spec feedback.
- The optional audio clarification was asked while investigation continued. With no response yet, voice recording is included as the clearly stated proposal; the spec gate is the approval boundary for that scope.
- No credentials or external storage service are needed to prepare this local change. Exact managed-storage method names and library choice are implementation details to settle in the separate task plan after specification approval.
