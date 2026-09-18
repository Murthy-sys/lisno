# Measurement photos/videos and optional sketch

> Follow-up correction: media count and size limits in this document are superseded by [unrestricted measurement media](../specs/2026-09-17-measurement-unrestricted-media-design.md).

## Goal and authority

Replace the On Site Actual Measurement folder URL field with direct photo/video uploads. Make the as-built sketch optional. Standing autonomous implementation authority and Mode A apply; no additional local implementation gate is needed. No production, commit, push or migration authority is inferred.

## Current evidence

`WorkflowStageActions.tsx` requires a URL and a single sketch; `projectWorkflowApi.ts` only uses multipart when that sketch exists. `design-workflow-state.service.ts` marks measurement file-required and validates HTTPS `mediaFolderUrl`. The route accepts one image/PDF proof. History exposes only one protected proof download. Existing memory/Mongo workflow history can hold additive media metadata without a migration. Initial worktree is clean, recorded in `/tmp/lisno-measurement-media-qa/initial-status.txt`.

## Scope and decisions

Require at least one photo or video (either kind suffices); allow up to ten. Optional sketch remains PDF/JPG/PNG/WebP in the existing `file` field. Keep existing maximum upload bound for the whole evidence batch, including sketch: 25 MiB by default; stricter server configuration remains authoritative. Reuse existing attachment content validation with bounded input rather than introducing a second media parser or large staging subsystem. Existing action authorization, assigned-designer rules, version/CAS, idempotency and downstream stage generation remain intact.

Other workflow action proof requirements are unchanged. No external URLs for new measurement completions; legacy folder facts/proofs stay readable and historical completion records remain valid. No transcoding, public files, image editor, chat attachment linkage, data rewrite or deployment.

## API, data and storage

- Existing POST `/projects/:projectId/design-workflow/actions` retains text fields and optional `file` proof; repeated multipart `mediaFiles` parts hold photos/videos. Measurement action data is `{}`; reject new URL input and media submitted to unrelated actions.
- Media-only requests must use multipart and report upload progress. Validate all files before saving any. Bound total binary bytes, multipart fields/parts, overhead and aborted requests. Reject unsupported/empty/mismatched/truncated/audio-only-as-video files.
- Photo formats: JPG/JPEG, PNG, WebP, GIF, HEIC/HEIF and TIFF. Video formats: MP4, MOV and WebM. Reuse the existing robust signature/container/track validation with a read-only buffer adapter; bounded batch prevents file-count multiplication of memory usage. No new dependencies.
- Stored history adds optional `mediaFiles: [{id, storageReference, originalFilename, mimeType, byteSize, sha256, kind}]`, with stable server IDs and opaque references. Keep existing nullable `proof` for sketch. Public history `mediaFiles` exposes only `{id, filename, mimeType, byteSize, kind}`. Absence means legacy/no media. Do not expose internal references or hashes.
- Add authenticated GET `/projects/:projectId/design-workflow/history/:eventId/media/:mediaId`, using the same project/stage scope as proof, no-store/nosniff, attachment filename and recorded size/hash integrity verification. Register operation/OpenAPI consistently; do not expand permissions.
- Use a workflow-specific media storage wrapper over FileStorage. Extend allowed local opaque reference extensions for the selected media formats; estimate proof MIME contracts remain narrow.
- Include ordered media content/metadata in idempotency hash, excluding random IDs/references. Omit media hash member for empty arrays to retain historical request hashes. On known rollback/replay, clean newly saved files. On unknown commit or failed reconciliation, retain every attempted attachment; successful reconciliation compares the full evidence set. Audit/history/state remain atomic in memory and Mongo paths.

## UX

Rename action to “Complete measurement.” Use existing ContextPanel/Field/FileInput/Button styles: full-width multi-file chooser, supported formats/count/combined-size hint, compact filename/type/size rows with remove actions, optional sketch label, note and one submit action. No URL field. Allow adding more files and reselecting removed files. File selection participates in dirty-close protection. Disable duplicate submits and controls while pending, distinguish uploading from saving, keep selected files after failure and preserve stale-workflow safeguards. History lists individual protected downloads; legacy proof remains available. Provide accessible names, keyboard access and responsive wrapping without horizontal overflow.

## Acceptance criteria

1. Measurement completes with photo/video evidence and no sketch; optional sketch is retained when provided. No URL entry is shown or accepted for new completions.
2. Multiple mixed photo/video attachments persist with stable history IDs and authenticated per-file retrieval; project/role isolation and integrity checks hold.
3. Count/aggregate size, content/extension/MIME checks, empty files and unsupported multipart fields fail clearly without retained orphan writes; other workflow proof requirements remain unchanged.
4. Exact retries, conflicting idempotency keys, stale versions, authorization loss, audit/storage failure and uncertain transaction outcomes preserve correct file retention/cleanup and immutable history, including media-only requests.
5. UI supports selection/removal/reselection, optional sketch, progress, retry, dirty cancellation and history downloads; 360/768/1440px rendered interaction/accessibility checks pass.
6. Focused workflow/upload/storage/authorization/OpenAPI tests, transaction replica tests, both typechecks/builds, integrated review and final verification are completed with any baseline failures disclosed.

## Compatibility and risks

No migration; additive optional history field. Coordinate frontend/backend release for multipart contract. Legacy completed URL/sketch records are displayed without rewriting. A new completion from an old client sending only URL/sketch receives a validation error and must reload the updated client. Files are bounded to the existing upload budget; larger site videos need compression before upload. No unresolved product decision blocks implementation.
