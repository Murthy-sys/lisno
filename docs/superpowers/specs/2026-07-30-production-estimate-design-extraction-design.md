# Production Estimate Design Extraction

## Purpose

Harden estimate design extraction for production while preserving the existing
full-page drawing, annotation, revision, and client-review workflows.

The supplied source PDF contains 34 pages. Its pages 1-6 are the earlier
six-page regression fixture, not a page-count contract. Production extraction
supports any PDF from one page through the configured safe maximum.

## Mapping contract

Each estimate-design source page produces exactly one full-page drawing using
the unique canonical title detected from that page. The stored/reviewed image
is the complete page—not a title crop—so its legend, materials, annotations,
dimensions, and title block remain visible. If bounded title-block extraction
cannot resolve one title, the page still produces one clearly labeled
unidentified full-page drawing and remains Misc. The detected title is matched
against the estimate's included catalogue items and rooms.

A unique reliable match records:

- `roomId`;
- `scopeSectionId`;
- `catalogueId`; and
- `mappingStatus: "auto_mapped"`.

An absent or ambiguous match records actual `null` values for those identifiers
and uses `mappingStatus: "misc"`. The system must not store empty strings,
`"null"`, `"undefined"`, or fabricated Misc identifiers.

The estimator UI groups unresolved drawings under **Misc**, shows a clear
warning, and provides room and exact estimate-item selectors. Assigning an
estimate item derives its scope section and changes the status to
`mappingStatus: "estimator_assigned"`. Mapping status and the existing
drawing-verification state remain separate.

Misc drawings do not block client submission. The estimator is encouraged to
assign them, but may submit while they remain unresolved. A submitted
unresolved drawing is shown to the client in a **Misc** group.

Extraction completion is independent of mapping confidence. A missing or
ambiguous mapping must never fail the PDF extraction job.

## Worker and completion lifecycle

The worker creates one stable `resultId` for an extracted result and reuses it
for every completion attempt.

Completion is idempotent:

- the same job and `resultId` may be replayed and returns the stored success;
- a different result for an already completed job is rejected; and
- a timeout or lost response is reconciled before the worker reports failure.

Backend transport failures are not classified as OCR failures. The worker
retries transient claim, heartbeat, and completion failures with bounded,
jittered exponential backoff. Poison jobs use capped attempts, delayed retry,
and a terminal failure state so they cannot monopolize the queue.

## Bounds and resource safety

The pipeline enforces configurable limits before expensive work:

- PDF page count;
- source download bytes;
- rendered pixels per page;
- extracted text words per page;
- drawings and sections per job;
- decoded image bytes;
- completion body size; and
- total processing time.

Page-count validation occurs immediately after opening a PDF. Deadline checks
run while reading embedded text and rendering every page. The approved
first-six-page subset follows the same variable-page path as every other PDF.

Full-page sections reuse the page artifact instead of duplicating the image in
memory, transport, and storage.

## Persistence and storage

MongoDB writes are prevalidated and use bounded bulk operations inside a
replica-set transaction. Completion stores `workerResultId` as its idempotency
key.

Generated artifacts are staged under a backend-generated SHA-256 batch key
derived from job kind, job ID, and `resultId`; raw worker values never become
object paths. After an ambiguous transaction outcome, the backend checks the
persisted job and result before deleting or promoting files. A reconciliation
process handles orphaned staged artifacts and failed cleanup; files must not be
blindly deleted after an indeterminate commit.

Production deployments use durable shared object storage through the storage
interface. Local-only storage is development-only. A temporary S3-primary,
local-secondary mirror keeps references readable and rollback copies current
while existing local objects are copied and byte-verified; steady state is S3.

## Error handling and observability

Unexpected backend errors are logged with:

- job, upload, and result identifiers;
- processing phase and attempt;
- duration;
- HTTP status and safe backend error code;
- an internal diagnostic identifier; and
- sanitized stack frames that retain useful diagnostic context.

Estimator-facing errors contain allowlisted messages only. Internal paths,
library exception text, credentials, claim tokens, and stack traces are never
returned to the UI or left unredacted in internal logs.

Backend and worker health/readiness checks distinguish process liveness from
database, storage, and model readiness.

## Migration

A dry-run-capable migration:

1. converts missing mappings and `""`, `"null"`, and `"undefined"` sentinels
   to actual `null`;
2. adds `catalogueId` and `mappingStatus`;
3. backfills a unique title-to-included-item match when one is available; and
4. marks every remaining unresolved or ambiguous drawing as `misc`.

The migration reports counts and conflicts, is safe to rerun, and documents a
database backup requirement before production execution.

A separate byte-verifying storage migration copies the six persisted source,
page, and revision reference fields to shared object storage without rewriting
their opaque MongoDB values. Its final dry run must report no missing or
mismatched object before storage cutover.

## Verification

Automated verification includes:

- one-page extraction;
- the supplied PDF's first-six-page regression subset;
- the supplied 34-page variable-count regression;
- multiple variable page counts;
- the configured maximum page count;
- rejection above the configured maximum;
- exactly one full-page drawing and revision per estimate source page;
- embedded-text title extraction and OCR fallback;
- unidentified/Misc fallback when no unique page title is available;
- real replica-set multi-page transactions;
- nullable Misc persistence and workspace serialization;
- estimator assignment of an exact estimate item;
- non-blocking submission with unresolved Misc drawings;
- duplicate and replayed completion;
- concurrent completion;
- transaction rollback and ambiguous completion reconciliation;
- storage cleanup reconciliation;
- worker retry, backoff, and poison-job limits; and
- safe operational logging.

Release verification runs the complete backend, frontend, and worker suites,
type checks and production builds, mapping/artifact/storage dry runs, the
private 34-page regression, a non-skippable real-model smoke in the deployment
image, and an end-to-end upload through estimator review.

## Rollout

Rollout order is:

1. back up MongoDB and snapshot/inventory every legacy upload volume;
2. deploy all compatible backend replicas in S3-primary mirror mode and drain
   every old local-only replica;
3. run, review, execute, and re-verify the mapping migration;
4. dry-run, copy, and byte-verify every persisted storage reference;
5. deploy the worker and frontend, then verify health, diagnostics, the private
   regression, the real model, and a production-like extraction;
6. retain mirror mode through the rollback window; and
7. switch all replicas to S3-only only after a fresh storage verification,
   retaining legacy copies for a separately approved deletion window.

The backend remains compatible with the prior worker during the staged rollout.
Once S3-only writes begin, rollback is limited to the mirror-capable binary;
the old local-only binary is unsafe. No step depends on the supplied PDF having
exactly six pages.
