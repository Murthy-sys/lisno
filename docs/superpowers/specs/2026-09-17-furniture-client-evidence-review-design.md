# Client furniture evidence review

## Goal and authority
Clients can inspect saved room requirements and uploaded documents/photos/videos before accepting Collection of existing furniture dimensions. Continue under the user's standing instruction to finish autonomously and prior Mode A selection. Local implementation and verification only; no deployment or production writes.

## Evidence and scope
The Client presentation of WorkflowStageActions hides action history, where measurement uploads currently appear. ProjectWorkflowProgress also omits the operational room list for Clients. Before furniture acceptance, files normally belong to the completed site measurement: photos/videos and an optional sketch. The latest furniture declaration may also contain a proof through the API. Furniture dimension uploads occur after acceptance.

Show saved room choices and relevant evidence above the Client acceptance controls. Keep acceptance inline beside this review. Do not change approval requirements, room completion rules, CAS/idempotency, upload limits, history privacy, or other stage screens. No mandatory download or new acknowledgement is required. No new dependencies or data migration.

## Contract and invariants
Add optional `operational.furniture.evidence`: entries contain `eventId`, optional `mediaId`, `filename`, `mimeType`, `byteSize`, and `source` (`site_measurement` or `furniture_requirements`). Source metadata is curated by the backend using current project/configured stage IDs and committed measurement completion. Include only the latest furniture declaration's proof; an earlier declaration cannot supply evidence for its replacement. Omit private storage references, hashes, actor notes and unrelated history. Existing read capability and authenticated proof/media endpoints remain authoritative.

The frontend renders metadata without fetching bytes. A single selected file loads on demand through authenticated helpers with cancellation. Allow only PDF, supported raster images and video MIME types in preview; other formats or failed rendering offer download. Close, source/project/version change and unmount cancel pending preview work and revoke object URLs. Display pagination bounds rendered rows, not total files. A selected large file still consumes its blob size in browser memory; do not eagerly load collections.

## Acceptance criteria
1. Saved room names and required/not-required choices are visible before Client acceptance; no-furniture has an explicit state.
2. Current measurement sketch/media and latest declaration proof are listed with names and source labels. Unrelated, mismatched and superseded evidence is absent.
3. View/download use exact protected project/event/media identities. Other Clients and unauthorized roles cannot read the bytes or projected metadata.
4. No collection-wide fetching; all files remain reachable with display pagination. PDF/image/video preview, download fallback, loading, retry and empty states work.
5. Closing/changing review aborts pending requests, ignores late results and releases object URLs. Existing stale acceptance protection remains effective.
6. Acceptance and subsequent room-dimension workflow retain existing behavior, including optional sketches and missing legacy evidence.
7. Focused backend/frontend tests, builds, typechecks, independent integrity review and responsive rendered interaction/accessibility checks pass.

## Compatibility, risks and rollback
Additive read projection only; legacy responses can omit evidence, with an informative empty state. Existing files are never rewritten. A missing optional sketch does not block acceptance. Rollback removes this projection and UI without migration. Backend lineage is covered with asymmetric identities/stage IDs and superseded histories. Network errors remain visible with retry/download. No external effects beyond user-initiated existing downloads.
