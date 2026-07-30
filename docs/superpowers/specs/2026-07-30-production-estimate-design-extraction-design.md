# Production Estimate Design Extraction

## Purpose

Harden estimate design extraction for production while preserving the existing
full-page drawing, annotation, revision, and client-review workflows.

The supplied six-page PDF is a regression fixture, not a page-count contract.
Production extraction supports any PDF from one page through the configured
safe maximum.

## Mapping contract

Each PDF page produces one full-page drawing using the canonical title from
that page. The title is matched against the estimate's included catalogue
items and rooms.

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
run while reading embedded text and rendering every page. The supplied
six-page document follows the same variable-page path as every other PDF.

Full-page sections reuse the page artifact instead of duplicating the image in
memory, transport, and storage.

## Persistence and storage

MongoDB writes are prevalidated and use bounded bulk operations inside a
replica-set transaction. Completion stores `workerResultId` as its idempotency
key.

Generated artifacts are staged under `resultId`. After an ambiguous transaction
outcome, the backend checks the persisted job and result before deleting or
promoting files. A reconciliation process handles orphaned staged artifacts
and failed cleanup; files must not be blindly deleted after an indeterminate
commit.

Production deployments use durable shared object storage through the storage
interface. The local filesystem adapter is development-only.

## Error handling and observability

Unexpected backend errors are logged with:

- job, upload, and result identifiers;
- processing phase and attempt;
- duration;
- HTTP status and safe backend error code;
- an internal diagnostic identifier; and
- the original stack trace.

Estimator-facing errors contain allowlisted messages only. Internal paths,
library exception text, credentials, claim tokens, and stack traces are never
returned to the UI.

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

## Verification

Automated verification includes:

- one-page extraction;
- the supplied six-page regression PDF;
- multiple variable page counts;
- the configured maximum page count;
- rejection above the configured maximum;
- embedded-text title extraction and OCR fallback;
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
type checks and production builds, the migration dry run, and an end-to-end
upload through estimator review.

## Rollout

Rollout order is:

1. back up the production database;
2. deploy compatible backend schema and completion behavior;
3. run and review the migration dry run;
4. execute the migration;
5. deploy the worker;
6. deploy the frontend; and
7. verify health, metrics, and a production-like extraction.

The backend remains compatible with the prior worker during the staged rollout.
No step depends on the supplied PDF having exactly six pages.
