# Measurement media without fixed quantity or combined-size limits

## User correction and authority

The user rejects the ten-file restriction and wants any number of images. Remove fixed application media-count, per-media-size and aggregate-size caps, including the UI's combined25MiB cap. This supersedes those limits in the prior measurement-media specification. Direct uploads, optional sketch, protected history, validation and workflow rules remain. Standing autonomous Mode A authorization applies; no commit/deploy/production migration.

## Evidence and initial state

Prior-turn changes remain uncommitted and all 28 dirty paths are understood owned work. Snapshot tracked diff/untracked files/status under `/tmp/lisno-measurement-unrestricted-qa/initial-*` before writers. Current middleware buffers all binary files, enforces 10 files / 18 parts / 25 MiB aggregate and an absolute 120-second timeout. Service/OpenAPI and frontend duplicate count/size rules. Removing these checks while retaining all-file Buffers would cause memory growth with upload volume.

## Recommended approach

Keep the existing action multipart API. Stream media one at a time into private temporary storage using backpressure, validate through the existing random-access media inspector, then persist through a streaming storage capability. Keep only descriptors in application memory; do not buffer an entire image/video or whole batch. Remove the absolute batch deadline in favor of inactivity handling. This avoids introducing upload sessions/expiry/finalization endpoints solely for removing selection restrictions.

Keep the optional sketch's existing document-validation/size bound; the correction concerns photos/videos. Other workflow proof actions retain their existing constraints. Media format/content validation, one-sketch validation and bounded metadata fields remain. No new dependency.

## Contract and lifecycle

- Existing repeated `mediaFiles`, optional `file` and six action fields unchanged; one or more valid media files are still required for measurement completion. No URL input.
- Remove media-count, total-file/part-count, media-size, total-binary/body-byte ceilings and OpenAPI maxItems: 10. Keep six bounded text fields, filename/header validation and one sketch. Account for media sizes as safe integers; physical storage/network capacity remains finite.
- Put temporary-file operations behind a `src/storage` abstraction with private directories/opaque filenames, abort-aware streaming writes, bounded range reads and idempotent cleanup. Stream into permanent storage without loading file bytes into RAM. Local FileStorage gains an optional streaming import capability; unsupported adapters fail clearly rather than silently buffering unbounded media. Existing image/PDF upload consumers keep their current APIs and validation.
- Validate every staged file before durable workflow state is changed. Clean temporary files on parse/validation/auth errors, disconnects, schema rejection before the route handler, success and retry. Wait for active writes before cleanup; once permanent copies exist, retain the existing exact-replay/definite-failure/uncertain-commit semantics for permanent evidence.
- Download media with bounded-memory integrity checking and streaming, so allowing larger files on upload does not move the RAM problem to retrieval. Preserve no-store/nosniff/attachment semantics and project/event/media authorization. Legacy evidence reads remain supported.
- Preserve stable ordered content hashes, IDs, transaction/CAS/audit behavior and optional sketch. No state migration or production data rewrite.

## UI

Remove all “1–10”, “of 10”, maximum-count and combined 25 MB copy/checks for media. Keep clear supported-format guidance and selected file count/total size. Users can append/remove files and submit selections above the old limits. Keep large selected/history lists manageable through local pagination (display pages are not upload limits); all selected files are sent. Preserve progress, retry, dirty dismissal and stale guards. Sketch remains explicitly optional.

## Acceptance criteria

1. More than 10 photos/videos and combined media above 25 MiB submit successfully; no fixed quantity, per-media or combined-size cap is imposed by this feature.
2. Upload and download binary memory use is bounded by stream chunks/inspection reads rather than selection size; temporary and permanent cleanup/retention behavior remains correct on every exit path.
3. Count/aggregate restrictions are removed consistently across UI, parser, service and OpenAPI; required media, supported types and optional sketch remain correct.
4. Large selections remain usable at 360, 768 and 1440 px with file counts, removal, paged rows, progress/error recovery and no horizontal overflow/accessibility regressions.
5. Focused tests prove above-old-limit success, streaming/abort/schema/storage-failure cleanup, auth, replay and uncertain outcomes; both typechecks/builds and integrated review/final verification pass or disclose failures.

## Constraints and non-goals

No system can promise infinite storage or bypass hosting/proxy limits. Workflow history currently embeds media metadata in a Mongo document; extremely large metadata sets remain subject to database document capacity. This change removes fixed product quantity/byte restrictions and binary buffering, not all physical platform constraints. No upload-session API, external object-storage migration, gallery/transcoding work or unrelated workflow refactor. If implementation evidence requires a material contract change, reconcile it before writing dependent layers.
