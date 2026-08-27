# Estimate Email and Proof-Based Client Response Design

**Date:** 2026-08-24

**Status:** Approved design; implementation not started

**Scope:** Add compact estimate PDF email delivery and an Admin proof-based
client-response task alongside the existing estimate and Client portal flow

## Goal

When an estimate reaches the existing `sent_to_client` state, send the Client
an email containing the exact estimate PDF. Preserve the current Lisno PDF
layout, colors, logo, and watermark while reducing text sizes by approximately
15 percent.

At the same transition, create a response task for the Admin who initiated the
linked project. If no initiating Admin exists, assign the task to the sole
active Super Admin. The assignee can record the Client's approval or rejection
only by uploading proof of the external response. Admin approval must produce
the same business result as the Client's current portal approval. Admin
rejection maps to the current `client_changes_requested` flow.

The existing Client portal estimate list, PDF access, drawing and plan review,
Approve action, Request changes action, and project-kickoff flow remain
available and unchanged at their public interfaces.

## Approved product decisions

| Decision | Approved outcome |
|---|---|
| Change shape | The feature is additive. Existing estimator, internal approval, Client portal, and project-kickoff flows remain. |
| Email trigger | Publish only when an estimate enters `sent_to_client`: immediately on ordinary submission or after the existing high-value approval flow when Estimator/Sales selects **Send to client**. |
| High-value estimates | Initial submission above the current threshold does not email the Client or create a response task. Publication waits for the existing internal approval and send action. |
| Recipient | Use the normalized Lead client email already used by the Client portal ownership boundary. |
| PDF | Attach one immutable PDF snapshot of the published estimate. Keep the current Lisno layout, colors, logo, centered rotated watermark, and filename pattern. |
| Typography | Apply a `0.85` typography scale, rounded to the nearest half point with a 7-point minimum. The watermark is an image and does not change size. |
| Admin assignment | Assign the active project-initiating Admin. If no eligible initiator exists, assign the sole active Super Admin. |
| Task model | Use a dedicated estimate client-review round/task. Do not reuse generic design Tasks or AccessRequest records. |
| Direct Client response | Keep the existing authenticated Client decision route and UI. A direct Client response resolves the corresponding Admin task without uploaded proof. |
| Admin response | Use a separate Admin-authorized endpoint backed by the same internal decision transition. Never impersonate the Client or call the Client route as Admin. |
| Proof | Admin decisions require exactly one PDF, JPEG, PNG, or WebP proof file, subject to the configured upload limit, currently 25 MB by default. |
| Rejection semantics | Admin **Reject** means the existing Client **Request changes** result. It is not a terminal lost-lead state. A written reason is mandatory. |
| Approval semantics | Admin approval performs the same drawing-readiness, project reuse or creation, design freeze, Lead-won, audit, and kickoff behavior as direct Client approval. |
| Client account absence | An Admin-recorded approval never writes the Admin as `Project.clientId`. If no matching Client account exists, the project remains unclaimed and the existing email-based Client signup linking flow can claim it later. |
| Delivery failure | SMTP disabled or failed delivery never rolls back the existing estimate and Lead transition. Record safe delivery telemetry and permit retry. |
| Retry | Retry the same review round and exact stored PDF. A retry does not create another Admin task or regenerate the attachment. |
| Revised estimate | A later estimate version creates a new review round and PDF. Earlier rounds remain immutable history. |
| Client presentation | Keep estimates embedded in the existing Client Dashboard. Do not add a new Client route in this slice. |

## Current-state findings

The current system already has the complete Client estimate review workflow.
Client-visible estimates are limited to `sent_to_client`,
`client_changes_requested`, and `client_approved`. Clients can inspect line
items and design material, download the estimate PDF, approve, or request
changes. Final approval validates drawing readiness, reuses or creates the
project, freezes design state, marks the Lead won, and queues project kickoff
notifications.

Estimate publication currently has two branches:

1. An estimate at or below the existing ₹15,00,000 threshold moves directly
   from submission to `sent_to_client`.
2. A higher estimate moves through manager assignment, designer approval, and
   `ready_for_client`; Estimator/Sales then selects **Send to client**.

Both publication branches append an embedded `estimate_ready_for_review`
notification with `queued` status, but no worker consumes that record. No PDF
is generated for email, no SMTP delivery occurs, and no delivery result is
persisted.

The existing `EstimatePdfService` generates the correct A4 Lisno document on
demand. It returns bytes plus a stable filename but stores no snapshot. Its
watermark is the Lisno logo image at the center of every page, not text.

The generic Project Task model is not suitable for this feature. It requires a
floor, stage, Designer owner, schedule, progress, and design dependencies, and
it contributes to Designer work and KPI behavior. The AccessRequest subsystem
provides useful queue, scoping, optimistic-version, and decision patterns, but
an estimate response is not an access request and must not share that domain
record.

Admin project authorization already has the required source of truth. Project
initiation creates an active `admin_initiator` grant for the `projects` module.
Regular Admin project reads are restricted to that grant. A sole-Super-Admin
database invariant already exists and supplies the fallback assignee.

## Approaches considered

### 1. Dedicated immutable client-review round — selected

Create one `EstimateClientReviewRound` for each published estimate version. It
owns the exact PDF snapshot, delivery telemetry, Admin assignment, response
task state, decision source, and optimistic version. Store Admin proof metadata
in a separate one-to-one proof record.

This approach provides a stable audit boundary, exact attachment history,
clean retry semantics, safe concurrency between Client and Admin decisions,
and a natural Admin inbox without expanding the already broad Estimate
document.

### 2. Embed delivery, task, and proof history in Estimate

Add nested send rounds, delivery attempts, Admin tasks, and proof metadata to
the existing Estimate document.

This requires fewer collections initially but mixes mutable estimate design
state with append-preserving communications and evidence. Arrays would grow
across revisions, optimistic updates would become harder to isolate, and a
single large document would become the contention point for delivery and
decisions.

### 3. Reuse generic Task or AccessRequest

Represent the response as an existing Project Task or AccessRequest.

This is rejected. Generic Tasks would contaminate Designer scheduling and KPI
semantics, while AccessRequest permissions, fields, and terminal effects are
unrelated to Client estimate decisions. Reuse their implementation patterns,
not their persisted records.

## Invariants

The implementation must preserve these invariants:

1. Existing Estimate statuses and public Client APIs do not change.
2. A Client sees exactly the same three estimate statuses as before; internal
   review states are never exposed.
3. A high-value estimate is not published before the existing internal
   approval and explicit send action.
4. One published estimate version and recipient produce at most one review
   round and one pending Admin task.
5. One review round contains one immutable PDF snapshot. Every initial email,
   retry, Admin PDF download, and compatible Client PDF download uses those
   exact bytes.
6. SMTP failure cannot revert `sent_to_client` or the Lead's existing
   `estimate_sent` transition.
7. A review round accepts at most one terminal decision. Client and Admin
   decisions race through the same compare-and-set boundary.
8. A direct Client decision never requires proof. Every Admin decision requires
   one valid proof file.
9. Admin rejection has exactly the same Estimate and design-lifecycle effects
   as the existing Client request-changes action.
10. Admin approval has exactly the same readiness, project, Lead, design-freeze,
    and kickoff effects as the existing Client approval action.
11. Admin identity is always the audit actor for an on-behalf decision and is
    never written as the Client identity.
12. Storage references, SMTP provider messages, PDF bytes, and proof contents
    never appear in API DTOs or audit values.
13. Regular Admin access remains restricted to an active initiator scope and
    the assigned round. Super Admin may resolve a pending round if the normal
    assignee is no longer eligible.
14. A revised and republished estimate creates a new round; it cannot overwrite
    an earlier PDF, proof, delivery result, or decision.

## Domain model

### EstimateClientReviewRound

Introduce a dedicated collection with the following logical shape:

```ts
type EstimateDeliveryStatus = "queued" | "sent" | "failed" | "disabled";
type EstimateClientReviewStatus =
  | "pending"
  | "approved"
  | "changes_requested";
type EstimateClientDecisionSource = "client_portal" | "admin_proof";

interface EstimateClientReviewRoundRecord {
  id: string;
  estimateId: string;
  leadId: string;
  projectId: string | null;
  estimateVersion: number;
  sendGeneration: number;
  dedupeKey: string;

  recipientEmail: string;
  recipientEmailNormalized: string;

  estimateSnapshot: {
    clientName: string;
    projectName: string;
    location: string;
    propertyType: string;
    lineItems: Array<{
      catalogueId: string;
      roomName: string;
      specification: string;
      unit: string;
      rate: number;
      quantity: number;
      included: boolean;
      amount: number;
    }>;
    subtotal: number;
    gst: number;
    total: number;
  };

  pdfFilename: string;
  pdfMimeType: "application/pdf";
  pdfByteSize: number;
  pdfSha256: string;
  pdfStorageReference: string;

  deliveryStatus: EstimateDeliveryStatus;
  deliveryAttemptGeneration: number;
  deliveryAttemptCount: number;
  deliveryAttemptedAt: Date | null;
  deliveryLeaseExpiresAt: Date | null;
  deliveredAt: Date | null;
  deliveryFailureCode: string | null;

  assignedAdminId: string;
  status: EstimateClientReviewStatus;
  decision: "approve" | "request_changes" | null;
  decisionSource: EstimateClientDecisionSource | null;
  decisionNote: string | null;
  decidedById: string | null;
  decidedAt: Date | null;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

`pdfStorageReference` is persistence-only and excluded from ordinary queries
and every public DTO. The recipient address is needed for exact delivery and
history, but list DTOs expose it only to the estimate owner, assigned Admin,
and Super Admin.

`sendGeneration` is monotonically increasing per Estimate. The dedupe key is a
server-generated digest over the Estimate ID, estimate version, and normalized
recipient. A unique index on `dedupeKey` prevents repeated submission requests
from sending twice. A second unique index on `(estimateId, sendGeneration)`
protects ordering. Queue indexes cover `(assignedAdminId, status, createdAt,
id)` and `(estimateId, createdAt, id)`.

`estimateSnapshot` is the immutable safe presentation snapshot for Admin task
detail after the mutable Estimate is revised. `deliveryAttemptGeneration` and
`deliveryLeaseExpiresAt` provide the exact attempt lease required to serialize
retry and reject stale SMTP completions.

The review-round `version` is the optimistic decision and delivery-control
version. Delivery telemetry updates must not change the Estimate's semantic
version. A decision increments the review-round version exactly once.

### EstimateClientResponseProof

Store Admin proof metadata in a one-to-one collection:

```ts
interface EstimateClientResponseProofRecord {
  id: string;
  reviewRoundId: string;
  estimateId: string;
  storageReference: string;
  originalFilename: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  sha256: string;
  uploadedById: string;
  uploadedAt: Date;
}
```

`reviewRoundId` is unique. `storageReference` is excluded from list/detail DTOs
and audit payloads. The proof record is created in the same Mongo transaction
as the Admin decision. A proof cannot be replaced or deleted through the
product after the decision.

### Existing Estimate and Lead

Do not add a new Estimate status. Add only a nullable reference or safe summary
needed to identify the current review round if that materially simplifies
queries; the review-round collection remains authoritative.

The existing `sentToClientAt`, `clientDecisionAt`, `reviews`, status, version,
design lifecycle, and Lead transitions retain their meaning. Existing embedded
notification rows may remain for compatibility, but the new review-round
delivery telemetry is authoritative for actual email delivery.

## PDF snapshot design

Extend `EstimatePdfService.generate` with an optional rendering profile rather
than creating a second PDF generator:

```ts
type EstimatePdfProfile = "standard" | "compact_client_delivery";
```

The compact profile applies a `0.85` multiplier to every text size, rounds to
the nearest `0.5` point, and enforces a `7` point minimum. It does not change:

- paper size or margins;
- Lisno logo asset;
- watermark dimensions, position, rotation, or opacity;
- colors, borders, line-item selection, totals, terms, or filename pattern;
- page numbering or content order.

The publication service builds a post-transition PDF input whose status is
`sent_to_client`, generates the compact PDF once, computes SHA-256, and saves
the bytes through `FileStorage.saveGenerated` before the Mongo transaction.
The transaction persists only the opaque storage reference and safe metadata.
If the transaction fails or loses a uniqueness race, the newly saved object is
deleted.

The current estimator PDF endpoint may continue generating the requested live
Estimate. Admin review-round PDF download always serves the stored snapshot.
The existing Client PDF route keeps its URL, authorization, response headers,
and not-found behavior; for a current review round it serves the immutable
snapshot, while legacy estimates without a review round retain on-demand PDF
generation.

## Publication and delivery flow

Create a shared `publishEstimateToClient` application service and call it from
both current publication branches.

### Ordinary submission

For a valid estimate at or below the current threshold:

1. Resolve the Lead and current Estimate exactly as today.
2. Build the post-transition `sent_to_client` snapshot.
3. Generate and store the compact PDF.
4. Resolve the review-round assignee.
5. In one Mongo transaction, compare the current Estimate state/version,
   transition Estimate and Lead as today, append existing review/notification
   compatibility data, create the unique review round, and append audit events.
6. Delete the stored PDF if the transaction fails.
7. After commit, attempt SMTP delivery from the stored bytes.
8. Update delivery telemetry through an exact round/version/status
   compare-and-set and append the delivery audit atomically.

### High-value publication

Initial high-value submission, manager assignment, and designer decision remain
unchanged. When Estimator/Sales invokes the existing send-to-client action from
`ready_for_client`, call the same publication service with the current
Estimate, Lead, and owner. The service performs steps 2 through 8 above and
preserves the existing state transition.

### Disabled or failed delivery

If SMTP is completely absent, create the review round with `disabled` delivery
status and complete the existing Estimate/Lead transition. Partial SMTP
configuration continues failing at environment load.

If SMTP rejects or times out, retain the committed workflow and snapshot. Store
only a bounded internal failure code, never the provider response. The API
returns the current review-round delivery state so the Estimator UI can explain
that the estimate is in the Client portal but email needs retry.

### Retry

Add an authenticated retry operation for the Estimate owner and Super Admin.
It reloads the current round and exact stored PDF, rejects terminal or stale
Estimate generations as appropriate, serializes delivery attempts, and sends
only when status is `failed`, `disabled` after configuration becomes available,
or a stale `queued` attempt has exceeded the delivery deadline.

Retry increments attempt telemetry but does not create a round, task, Estimate
review, or semantic Estimate version. Parallel retries produce at most one SMTP
attempt. Success changes delivery to `sent`; a stale completion after the round
has been resolved may update delivery telemetry only when it still matches the
exact round attempt generation.

## SMTP mailer

Introduce an `EstimateMailer` interface whose input contains only safe,
pre-rendered values:

```ts
interface EstimateMailer {
  send(input: {
    to: string;
    clientName: string;
    projectName: string;
    estimateVersion: number;
    total: number;
    portalUrl: string;
    attachment: {
      filename: string;
      mimeType: "application/pdf";
      bytes: Buffer;
    };
  }): Promise<{ kind: "sent" } | { kind: "failed"; failureCode: string }>;
}
```

Extract or share the existing hardened SMTP transport without weakening staff
invitation delivery. Preserve isolated connections, implicit TLS or STARTTLS,
certificate verification, bounded timeouts, settle-once cleanup, address
objects, escaped HTML, and disabled URL/file access.

Use the existing complete SMTP configuration group. Rename internal
invitation-only config types where necessary, but keep environment variable
compatibility. `SMTP_FROM` becomes the general Lisno sender identity in
documentation. The message contains:

- subject: `Lisno estimate for <project> · v<version>`;
- plain-text and escaped HTML summaries;
- the configured credential-free frontend origin plus `/client`;
- the exact stored PDF attachment.

The portal link contains no Estimate ID, email, credential, or token. Clients
without an account can still read the attachment; signing up later retains the
current normalized-email linking behavior.

## Admin assignment and authorization

Assignee resolution occurs during review-round creation:

1. If `projectId` is non-null, find an active `admin_initiator` grant for that
   project and `projects` module whose user is an active regular Admin.
2. Assign that Admin.
3. Otherwise, assign the sole active Super Admin.
4. Fail closed before publication if the sole-Super-Admin invariant is missing
   unexpectedly. SMTP is not attempted and the saved snapshot is cleaned up.

Persist `assignedAdminId`; do not derive ownership dynamically for ordinary
Admin queue reads. A regular Admin may list/read/decide only when both the
persisted assignment and current active project initiator scope match. If the
Admin becomes inactive or loses scope, Super Admin retains oversight access
and may resolve the pending task. Automatic reassignment UI is outside this
slice.

Add narrow permission codes rather than granting Admin Client permissions:

- `estimation.client_response_tasks.read`;
- `estimation.client_response_tasks.decide`;
- `estimation.client_response_proof.read`;
- `estimation.estimate_email.retry`.

Regular Admin receives the first three and remains repository-scoped. Super
Admin receives all four. Estimator/Sales receives retry and proof-read access
only for estimates it owns. Client receives no new permission. Register every
protected route with the matching operation metadata and keep frontend/backend
authorization catalogs in parity.

## Shared decision service

Extract the current final Client decision transition from the route into a
service that accepts an explicit decision context:

```ts
type EstimateDecisionContext =
  | {
      source: "client_portal";
      actor: AuthenticatedClient;
      proof: null;
    }
  | {
      source: "admin_proof";
      actor: AuthenticatedAdminOrSuperAdmin;
      proof: ValidatedProofMetadata;
    };
```

The existing Client endpoint retains its request and response contract. It
resolves the current pending review round when one exists, validates normalized
Lead email and Client identity exactly as today, and invokes the shared service
with `client_portal`. A legacy Client-visible Estimate without a review round
uses the same service's legacy-compatible Estimate compare-and-set path; it
does not synthesize a historical round or proof record.

The Admin endpoint independently validates assignment, current initiator
scope, round version, proof, and decision input before invoking the service
with `admin_proof`. It never calls the Client route and never fabricates a
Client actor.

### Request changes

For either source, require the round and Estimate to be pending and
`sent_to_client`. Execute the existing transaction:

- set Estimate status to `client_changes_requested`;
- set `clientDecisionAt`;
- increment Estimate and design-lifecycle versions;
- append the existing semantic Estimate review;
- append the existing sanitized audit;
- resolve the round as `changes_requested` with source and actor metadata.

Admin source additionally requires a non-empty bounded reason and creates the
proof metadata record in the same transaction.

### Approval

For either source, require the same drawing and plan readiness as today.
Resolve the assigned Designer and Design Manager, reuse a valid linked
Admin-created project or create the legacy project, set Estimate
`client_approved`, freeze design, mark the Lead won, and queue kickoff
notifications in the same transaction.

For a direct Client decision, use the authenticated Client ID exactly as today.
For an Admin decision, look up an active standard Client account by normalized
Lead email. Use that ID when present; otherwise keep `Project.clientId` null.
Never use the Admin ID as Client ownership. Existing signup linkage may claim
the project later.

Resolve the round as `approved` with the true source and actor. Admin source
creates proof metadata in the same transaction.

### Decision race

Client and Admin decisions match the same pending round version and the same
Estimate status/version/design-lifecycle snapshot. Exactly one transaction can
commit. A loser receives the existing conflict-class response, writes no audit
or terminal state, and—if it uploaded a proof—deletes the saved orphan file.

A direct Client decision automatically removes the round from the Admin pending
queue. Historical detail identifies `client_portal` and has no proof. An Admin
decision identifies `admin_proof` and has exactly one proof.

## API design

Existing routes retain their paths and contracts:

- `POST /api/v1/leads/:leadId/estimate/submit`;
- `POST /api/v1/estimates/:estimateId/send-client`;
- `GET /api/v1/client/estimates`;
- `GET /api/v1/client/estimates/:estimateId/pdf`;
- `POST /api/v1/client/estimates/:estimateId/decision`.

Extend successful estimator publication responses with a safe optional
`clientReview` summary:

```ts
interface EstimateClientReviewSummary {
  id: string;
  sendGeneration: number;
  estimateVersion: number;
  version: number;
  deliveryStatus: EstimateDeliveryStatus;
  deliveryAttemptCount: number;
  deliveredAt: string | null;
  status: EstimateClientReviewStatus;
}
```

Return the same optional summary from estimator Estimate reads so the existing
post-mutation refetch does not discard delivery state or the exact retry
version.

Add these routes:

### Admin task list

`GET /api/v1/admin/estimate-client-response-tasks`

Query parameters:

- `status`: `pending | approved | changes_requested`, omitted for all;
- `limit` and `offset` using existing pagination limits.

Return newest pending work first, then stable ID ordering. Regular Admin scope
is applied before count and pagination. Each item contains safe project,
Estimate, recipient, delivery, task, and proof-availability summaries but no
storage references or proof bytes.

### Admin task detail

`GET /api/v1/admin/estimate-client-response-tasks/:roundId`

Return the immutable Estimate summary, exact line-item/totals snapshot needed
for review, delivery history, task state, decision metadata, and
proof-availability flag. Apply the same scope as list.

### Exact sent PDF

`GET /api/v1/admin/estimate-client-response-tasks/:roundId/pdf`

Authorize before opening storage. Return `application/pdf` with the stored
filename and no storage reference.

### Proof download

`GET /api/v1/admin/estimate-client-response-tasks/:roundId/proof`

Allow assigned/currently scoped Admin, Super Admin, and the owning
Estimator/Sales. Return indistinguishable not-found responses for absent,
foreign, or unauthorized proofs.

### Admin decision

`POST /api/v1/admin/estimate-client-response-tasks/:roundId/decision`

Use `multipart/form-data` with exactly:

- `decision`: `approve | request_changes`;
- `note`: optional for approval, required and non-empty for request changes,
  maximum 1000 characters;
- `version`: positive integer round version;
- `proof`: exactly one required file.

Reject unknown fields, multiple files, unsupported content, MIME/magic-byte
mismatch, invalid PDF structure, oversized input, stale versions, non-pending
rounds, and foreign scope.

### Delivery retry

`POST /api/v1/estimates/:estimateId/client-email/retry`

Require Estimate-owner Estimator/Sales or Super Admin, exact current round ID
and round version in the JSON body, and a retryable delivery state. Return the
safe review summary. Do not expose SMTP provider details.

### Admin project summary

Extend `AdminProjectSummary.estimate` only with the safe current review-round
summary and pending-task indicator. This projection does not grant access to
other Estimate routes. The Admin project detail page links to the assigned task
when present.

## Frontend design

### Estimator/Sales

Keep the current Save draft, Submit estimate, and Send to client controls and
state eligibility. After publication, show:

- `Email sent` with timestamp;
- `Email delivery failed` with a Retry action;
- `Email unavailable` when SMTP is disabled;
- `Email queued` only while an immediate attempt is unresolved.

Retry uses the current round/version and never resubmits the Estimate. Success
and error announcements use the existing accessible notice patterns. The
ordinary low-value success copy distinguishes Client portal availability from
email delivery without treating email failure as estimate-submission failure.

### Admin

Add **Client responses** to regular Admin navigation and to Super Admin only
when Super Admin has access to fallback/oversight work. The page follows the
existing access-request inbox patterns:

- stable pagination and pending/history filter;
- delivery and decision status;
- client/project/estimate/version summary;
- exact sent-PDF download;
- task detail and decision action;
- stale-row refresh behavior.

Also show a compact response-task section in the existing Admin My Project
detail. It links to the full task and does not expose unrelated Estimate edit
controls.

The decision dialog presents immutable task context, Approve and Reject,
required proof input, and the conditional rejection reason. It validates
locally, focuses the first invalid control, reports upload progress, handles
version conflicts by refreshing, and moves focus to the page heading after
success. Terminal tasks are read-only.

### Client

Keep the Client Dashboard and `EstimateReviewPanel` structure, statuses,
actions, drawing review, plan feedback, and routes. The same three statuses
remain visible. The current PDF control transparently receives the immutable
snapshot for new rounds and legacy generation for old records.

When the Client decides directly, the existing success behavior remains. The
Admin task closes through server state; the Client UI does not mention the
internal task or proof workflow.

## File storage and proof lifecycle

Reuse the existing `FileStorage` abstraction and `uploadSingleFile` security
checks. Proof uploads accept only:

- `application/pdf`;
- `image/jpeg`;
- `image/png`;
- `image/webp`.

The configured `MAX_UPLOAD_MB` limit applies, with the existing 25 MB default.
Require magic-byte/MIME agreement, valid PDF structure, sanitized original
filenames, opaque generated storage names, exclusive writes, and restrictive
file permissions where supported.

The decision flow saves the proof first, computes SHA-256, and then performs
the transactional metadata and decision write. Delete the object if validation
after saving, transaction, audit, or compare-and-set fails. Once committed,
proof is immutable and retained with the review-round history. Product deletion
and replacement are outside this slice.

Email PDF snapshots use generated-file storage and the same orphan cleanup
discipline. Stored PDFs and proofs are not publicly addressable. Every download
authorizes before reading or opening storage.

## Transactions, concurrency, and idempotency

The publication and decision paths must not remain as route-local sequences of
independent Mongoose saves. Move the affected state changes into focused
services with Mongo transaction boundaries and deterministic compare-and-set
filters.

Required concurrency cases include:

- repeated ordinary submit for the same Estimate version;
- simultaneous publish requests;
- send-client racing with stale designer or estimator state;
- two email retries;
- retry completion racing with Client/Admin decision;
- direct Client approval racing with Admin proof approval;
- direct Client request changes racing with Admin rejection;
- two Admin decision submissions;
- revised Estimate publication while an old UI holds a task version;
- assignee grant revocation or deactivation before decision;
- transaction/audit failure after PDF or proof storage.

Unique indexes, transaction snapshots, semantic Estimate versions, design
lifecycle versions, and review-round optimistic versions must make loser
outcomes exact. Duplicate-key errors are mapped to idempotent current-state
responses only when the existing round matches the same dedupe key; otherwise
they are conflicts.

Delivery telemetry uses an exact attempt generation so a stale SMTP completion
cannot overwrite a newer attempt. As with staff invitation delivery, a stale
completion is a complete no-op for both telemetry and audit.

## Auditing

Extend the closed audit-action catalog with explicit actions for:

- estimate client review published;
- estimate email delivery sent;
- estimate email delivery failed;
- estimate email retry requested;
- estimate client response task assigned;
- estimate client approval recorded by Admin;
- estimate client changes recorded by Admin;
- estimate client response recorded through portal;
- estimate client proof stored.

Semantic state changes and their audits commit in the same Mongo transaction.
Delivery telemetry and its audit commit together after SMTP. Audit values may
include IDs, send generation, Estimate version, delivery state, decision source,
decision, note length, proof MIME, proof byte size, and SHA-256. They must not
include recipient email unless already allowed by the existing audit policy,
original proof content, storage references, provider messages, or attachment
bytes.

Admin decisions record the real Admin/Super Admin as `actorId` and the explicit
semantic marker `recordedOnBehalfOf: "client"`. Portal decisions retain the
real Client actor.

## Error handling

Use the existing generic error envelope and authorization-before-disclosure
patterns.

- Missing/foreign task, snapshot, and proof reads return the same not-found
  response.
- Unsupported or malformed proof returns field-specific validation without
  exposing parser internals.
- Stale round or Estimate versions return a conflict that instructs the UI to
  refresh.
- A non-pending task returns a conflict and its safe current state where the
  current API convention permits it.
- Drawing or plan readiness failure uses the current approval error and leaves
  proof storage cleaned up.
- SMTP disabled/failed delivery is domain telemetry, not an HTTP failure for the
  already committed Estimate publication.
- Retry authorization, state, and attempt conflicts do not expose provider
  configuration or failure details.

## Configuration and startup

Keep the existing all-or-nothing SMTP environment group and TLS validation.
Generalize internal config naming so both invitation and Estimate mailers use
the same secure transport settings. Preserve current environment variables and
startup behavior.

Initialize the new review-round and proof indexes before the server begins
listening. Startup fails closed if their required unique indexes cannot be
created. Do not run runtime `syncIndexes()`.

Update `.env.example`, backend README, and root README to describe:

- the general Lisno SMTP sender;
- estimate attachment delivery;
- disabled and failed delivery behavior;
- exact Admin assignment and proof requirements;
- Client portal continuity;
- HTTPS requirement for real remote deployments.

## Compatibility and migration

No existing Estimate status or route is removed. The new collections require
no data rewrite. Existing estimates have no review-round history and continue
using the current on-demand Client PDF fallback. Do not synthesize historical
delivery or proof records.

Their existing direct Client decision remains available without creating a
review round; only the pre-existing Estimate, Lead, design, and project effects
are committed.

Existing queued embedded Estimate notifications remain readable for
compatibility but are not evidence of actual SMTP delivery. New publication
uses the review-round delivery fields as the source of truth.

Frontend/backend authorization policy versions advance together. Existing
historical route-operation fixtures remain byte-stable; compose a new fixture
layer for the new protected operations.

## Testing strategy

Implementation follows strict test-driven development with focused tests before
broad gates.

### PDF tests

- Exact existing Lisno logo and watermark asset, geometry, opacity, and rotation
  remain unchanged.
- Compact typography applies the `0.85` scale, half-point rounding, and 7-point
  minimum across headers, metadata, tables, totals, terms, and footer.
- Content, line-item filtering, totals, page numbering, long-value truncation,
  pagination, and filename remain correct.
- Stored bytes hash to the persisted SHA-256 and every retry returns the same
  bytes.
- Render representative PDFs to images and inspect page layout for clipping,
  overlap, unreadably small text, and watermark regressions.

### Mailer and configuration tests

- Text and escaped HTML bodies contain the intended summary and `/client` link.
- One PDF attachment uses in-memory bytes and the safe filename.
- No attachment path or remote URL is accepted by the mailer.
- TLS, STARTTLS, certificate verification, timeouts, provider-code mapping,
  settle-once behavior, and cleanup match the hardened invitation mailer.
- Absent SMTP yields disabled delivery; every partial group fails environment
  loading; secrets stay out of loaded public config and errors.

### Publication tests

- Ordinary submission publishes once, creates one round/task, stores one PDF,
  attempts one email, and retains all existing Estimate/Lead effects.
- High-value initial submission creates no Client round/email/task.
- High-value send-client publishes once after approval.
- Repeated and concurrent requests do not duplicate email, snapshot, task,
  review, or audit.
- Disabled/failed SMTP preserves `sent_to_client`; sent/failed telemetry and
  audits are exact.
- Retry uses the same bytes and round and serializes attempts.
- A revised Estimate creates the next generation with a different immutable
  snapshot while preserving prior history.

### Assignment and authorization tests

- Linked Admin-created project assigns its active initiator.
- Missing, inactive, or invalid initiator falls back to the sole active Super
  Admin.
- Missing fallback invariant fails before workflow commit and cleans the PDF.
- Regular Admin list/count/detail/decision scope is exact before pagination.
- Foreign Admin, Client, Designer, Finance, and unrelated Estimator are denied
  before storage or task disclosure.
- Super Admin oversight and owning-Estimator proof read/retry are exact.
- Backend/frontend permission and operation catalogs remain in parity.

### Proof and decision tests

- Proof is mandatory for both Admin outcomes; rejection reason is mandatory.
- PDF/JPEG/PNG/WebP valid files pass; extension spoofing, MIME mismatch,
  malformed PDF, unknown fields, multiple files, and oversize files fail.
- Storage cleanup occurs for validation, authorization, transaction, audit, and
  race failures.
- Admin approval and direct Client approval produce equivalent business state
  with distinct actor/source metadata.
- Admin rejection and direct Client request changes produce equivalent business
  state.
- No Client account leaves `Project.clientId` null; a matching Client links
  correctly; Admin ID is never used.
- Client-vs-Admin and Admin-vs-Admin races commit exactly one result, proof, and
  semantic audit.
- Direct Client decision closes the Admin pending task without proof.

### Frontend and accessibility tests

- Existing Client Dashboard estimates, PDF, drawing/plan review, approval, and
  request-changes tests stay unchanged and green.
- Estimator delivery status and retry do not duplicate submit/send actions.
- Admin Client responses navigation, queue, project-detail summary, filters,
  empty/error/loading states, and stale refresh work.
- Decision dialog has accessible labeling, keyboard containment/return focus,
  error focus, upload progress, and announcements.
- Proof and PDF download errors are scoped to the correct task.
- Regular Admin never sees foreign tasks; other roles never see Admin controls.

### Final gates

- Focused backend and frontend feature suites;
- real Mongo replica-set race tests;
- backend and frontend typechecks and production builds;
- static scans for storage references, SMTP provider messages, and attachment or
  proof bytes in DTO/audit/log paths;
- full backend and frontend suites run sequentially;
- independent backend, frontend, and whole-branch reviews.

## Acceptance criteria

The feature is complete when all of the following hold:

1. Every new transition to `sent_to_client` creates exactly one immutable
   review round and response task.
2. The Client receives an SMTP email containing the exact compact watermarked
   PDF when delivery is configured and succeeds.
3. PDF typography is approximately 15 percent smaller, with no layout or
   watermark regression.
4. Email failure or disabled SMTP never changes the existing successful
   Estimate/Lead workflow result and is visible to Estimator/Sales.
5. Retry sends the exact stored attachment without duplicating the task.
6. The initiating Admin receives the task; otherwise the sole Super Admin does.
7. Admin cannot decide without one valid proof file; rejection also requires a
   reason.
8. Admin approval produces the current Client-approval business result without
   impersonating or assigning Admin as Client.
9. Admin rejection produces the current Client request-changes result.
10. Direct Client decisions continue to work and automatically resolve the
    Admin task.
11. Concurrent Client/Admin decisions produce exactly one terminal result.
12. Existing Client estimate visibility, PDF access, design review, and actions
    remain available through the same routes and screens.
13. Previous rounds and proofs are immutable, scoped, and auditable.
14. All focused, race, accessibility, security, build, typecheck, and full-suite
    gates pass with independent review approval.

## Explicit exclusions

- No terminal Client-rejected or Lead-lost state.
- No change to the ₹15,00,000 internal-approval threshold or approval roles.
- No new Client route or replacement of the existing Client estimate panel.
- No inbound email parsing, mailbox polling, SMS, or WhatsApp integration.
- No multiple proof files, proof replacement, or product deletion flow.
- No OCR or design-extraction jobs for response proofs.
- No generic notification-center or generic business-task redesign.
- No automatic reassignment UI when an Admin loses scope; Super Admin oversight
  prevents the task from becoming inaccessible.
- No historical backfill of review rounds, delivery status, tasks, or proofs.
- No scheduled Client reminders or automatic retry campaign beyond the immediate
  attempt and explicit retry operation.
