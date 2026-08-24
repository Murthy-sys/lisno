# Estimate Email Delivery and Proof-Based Client Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email every newly published Client estimate as one immutable compact Lisno PDF and give the responsible Admin a scoped proof-required Client-response task, while preserving the existing estimator, internal approval, Client portal, and project-kickoff flows.

**Architecture:** A dedicated `EstimateClientReviewRound` is the authoritative immutable publication, delivery, assignment, and decision boundary for one Estimate version; `EstimateClientResponseProof` stores one-to-one Admin evidence metadata. Both existing publication branches call one transactional publication service, initial delivery and retry reuse one stored PDF through a shared hardened SMTP transport, and the existing Client decision endpoint plus the new Admin endpoint call one compare-and-set decision service. Safe DTO projections feed the existing Estimator workspace, a new Admin inbox, the Admin project detail page, and the unchanged Client dashboard.

**Tech Stack:** TypeScript 5.8, Node.js, Express 5, Mongoose 9 transactions and indexes, Zod, Multer, `pdf-lib`, PDFKit, Nodemailer/SMTPConnection, SHA-256, React 19, React Router 7, TanStack Query 5, Vitest 3, MSW, Testing Library, axe.

**Spec:** [Estimate Email and Proof-Based Client Response Design](../specs/2026-08-24-estimate-email-client-response-proof-design.md).

## Global Constraints

- This feature is additive. Do not remove or rename any existing Estimate status, estimator action, high-value approval step, Client route, Client Dashboard estimate panel, drawing/plan review action, or project-kickoff effect.
- The existing high-value threshold remains exactly `1_500_000` rupees. High-value submission creates no Client review round and sends no Client email until the existing `ready_for_client` send action.
- One published Estimate version and normalized recipient creates at most one review round, one Admin task, and one immutable PDF snapshot. A revised Estimate creates a later generation and preserves all prior rounds.
- Compact Client-delivery typography is exactly `0.85` of every standard text size, rounded to the nearest `0.5` point with a `7`-point minimum. Paper, margins, colors, order, filename, Lisno logo, and watermark geometry/opacity/rotation remain unchanged.
- SMTP disabled or failed delivery never rolls back `sent_to_client`, the existing Lead `estimate_sent` transition, the compatibility notification, or the Admin task. Partial SMTP configuration still fails environment loading.
- Retry uses the exact stored PDF and exact current review round; it does not regenerate bytes or create another task, Estimate review, semantic Estimate version, or send generation.
- Assignment is the active regular Admin with the active `admin_initiator` grant for the linked project's `projects` module, otherwise the sole active Super Admin. Missing fallback fails publication before commit and cleans the snapshot.
- A regular Admin may list/read/decide only when persisted assignment and current active initiator scope both match. Super Admin retains oversight. Estimator/Sales may retry and read proof only for an Estimate they own. Client receives no new permission.
- Admin decisions require exactly one PDF/JPEG/PNG/WebP proof. Admin `request_changes` also requires a non-empty note of at most `1000` characters. Proof replacement, multiple proof files, product deletion, and OCR are excluded.
- Admin Reject maps exactly to existing `client_changes_requested`; it is not a terminal Lead-lost state. Admin Approve produces the existing Client-approval effects without impersonating Client or ever writing the Admin ID as `Project.clientId`.
- Client and Admin decisions share one pending-round/Estimate/design-lifecycle compare-and-set boundary. Exactly one terminal result, semantic audit set, and optional proof may commit; losing uploaded proof is deleted.
- `pdfStorageReference`, proof `storageReference`, attachment/proof bytes, SMTP credentials, provider messages, and parser internals never enter public DTOs, audits, logs, or HTTP errors. Authorize before every storage read.
- Existing estimates receive no historical backfill. Their existing Client PDF route falls back to live generation; new current rounds serve stored snapshot bytes through the same URL and authorization behavior.
- A legacy Client-visible Estimate without a review round keeps the existing direct Client decision path and creates no synthetic round/proof; its Estimate/Lead/design/project compare-and-set remains authoritative.
- Add exactly four permissions: `estimation.client_response_tasks.read`, `estimation.client_response_tasks.decide`, `estimation.client_response_proof.read`, and `estimation.estimate_email.retry`. Backend/frontend catalogs and policy versions advance atomically; historical route-operation fixtures remain byte-stable behind a new fixture layer.
- Initialize both new model index sets before listening; startup fails closed on index creation failure. Do not call runtime `syncIndexes()`.
- Keep all work local on `feature/phase1_module1`. Do not push, merge to `main`/`master`, create a worktree, or modify unrelated user changes. The primary agent alone stages and commits shared-checkout work after review.
- TDD every task: capture focused RED, implement minimum GREEN, rerun focused tests/typecheck, review the exact diff, then commit only the listed files. Run backend and frontend full suites sequentially at the final gate.

---

## Parallel Execution Map

All workers share the same checkout and branch. File ownership is exclusive inside a wave; owners do not stage, commit, install dependencies, run broad builds, or edit files outside their task. The primary agent integrates and commits after each reviewer gate.

- **Wave 1 — parallel:** Task 1 compact PDF; Task 2 domain/models; Task 3 secure multipart/storage; Task 4 shared SMTP/config. Task 3 consumes Task 2 types only after the primary integrates Task 2, so its RED can be prepared in parallel but production edits wait at that barrier.
- **Wave 2 — after Tasks 1–4:** Task 5 review/assignment/query service owns production edits. Tasks 6 and 8 may prepare their RED fixtures in parallel, and Task 9 may prepare policy/route fixture RED, but none edits a Task 5 dependency before its integration barrier.
- **Wave 3 — parallel after Task 5:** Task 6 transactional publication and Task 8 shared decision/proof run in parallel. Task 7 delivery/retry begins after Task 6's round contract is integrated; Task 9 route tests may continue in parallel without mounting services yet.
- **Wave 4:** Integrate Task 9 Admin/Client/Estimator routes, policy, project projection, and app wiring. After its contract barrier, Tasks 10 Estimator UI, 11 Admin inbox/detail/dialog/navigation, and 12 real Mongo races run in parallel with exclusive file ownership.
- **Wave 5:** Task 13 Client compatibility/accessibility regression, then Task 14 startup/docs/security scans/full sequential suites/builds/independent reviews.

The three-hour target comes from these waves and focused commands; correctness, race, authorization, storage-cleanup, and full-suite gates are not skipped if execution exceeds the target.

## Requirement Coverage

| Approved requirement | Owning tasks |
|---|---|
| Compact Lisno PDF, immutable snapshot, exact bytes/hash | 1, 2, 3, 6, 9, 13 |
| Shared secure SMTP, disabled/failure behavior, exact attachment | 4, 6, 7, 14 |
| Ordinary and high-value publication remain semantically unchanged | 6, 12, 13 |
| Initiating Admin assignment and sole-Super-Admin fallback | 5, 6, 9, 12 |
| Retry without duplicate round/task/PDF/version | 7, 9, 10, 12 |
| Shared Client/Admin decision, proof lifecycle, Client-ID safety | 3, 8, 9, 12 |
| Admin queue/detail/download/decision and project summary | 5, 9, 11 |
| Exact authorization/policy parity and scope-before-pagination | 5, 9, 11, 14 |
| Existing Client UI/routes/actions and legacy PDF fallback | 8, 9, 13 |
| Startup indexes, audit secrecy, docs, static and full gates | 2, 4, 9, 12, 14 |

---

## File Map

### Backend production — create

- `backend/src/domain/estimate-client-review.ts`: closed round/delivery/decision/proof types, immutable snapshot and safe DTO contracts, dedupe/hash helpers, constants.
- `backend/src/models/EstimateClientReviewRound.ts`: publication snapshot, delivery attempt telemetry, assignee, task decision, optimistic version, hidden PDF reference, unique/queue/history indexes.
- `backend/src/models/EstimateClientResponseProof.ts`: one-to-one immutable proof metadata and hidden storage reference.
- `backend/src/models/application-indexes.ts`: one pre-listen initializer for identity and estimate-review indexes.
- `backend/src/services/smtp-transport.ts`: isolated TLS/STARTTLS transport, bounded timeout, settle-once cleanup, mailbox/HTML/failure helpers shared by both mailers.
- `backend/src/services/estimate-mailer.ts`: safe disabled/external/local-test `EstimateMailer` boundary.
- `backend/src/services/smtp-estimate-mailer.ts`: escaped estimate email and one in-memory PDF attachment.
- `backend/src/services/estimate-client-review-storage.ts`: snapshot/proof save, SHA metadata, reads, and idempotent orphan cleanup.
- `backend/src/services/estimate-client-review.service.ts`: assignee resolution, current-round queries, safe list/detail/project projections, and actor scope checks.
- `backend/src/services/estimate-publication.service.ts`: shared publication transaction and post-commit initial delivery call.
- `backend/src/services/estimate-delivery.service.ts`: initial/retry attempt lease, exact attempt-generation completion CAS, delivery audit.
- `backend/src/services/estimate-decision.service.ts`: shared Client/Admin request-changes/approval transaction and proof cleanup contract.
- `backend/src/routes/estimate-client-responses.ts`: Admin task list/detail/PDF/proof/decision and Estimate-owner/Super-Admin retry APIs.

### Backend production — modify

- `backend/src/services/estimate-pdf.service.ts`: optional rendering profile and centralized text-size scaling only.
- `backend/src/middleware/upload.ts`: backward-compatible options for field name, scalar-field limit, and detected MIME allowlist.
- `backend/src/services/smtp-invitation-mailer.ts`: consume shared SMTP helpers without behavior drift.
- `backend/src/config/env.ts`: rename the internal invitation-only SMTP config to shared `MailDeliveryConfig`/`mailDelivery`, preserving environment keys and all validation.
- `backend/src/routes/estimates.ts`: delegate both publication branches and Client decisions; stored-current-round Client PDF with legacy fallback; attach optional safe round summary to estimator reads.
- `backend/src/services/estimate-project-handoff.ts`: allow explicit nullable Client identity for Admin-recorded approval.
- `backend/src/domain/audit-actions.ts`: nine approved closed audit actions.
- `backend/src/domain/authorization.ts`, `backend/src/domain/route-operations.ts`: four permissions, six route operations, policy/availability layer.
- `backend/src/repositories/types.ts`, `backend/src/repositories/admin-project-summary.ts`, `backend/src/repositories/mongo.ts`, `backend/src/repositories/memory.ts`: safe current-round/pending-task projection only.
- `backend/src/app.ts`, `backend/src/server.ts`: service injection, route mount, shared mail config, pre-listen index preparation.
- `backend/.env.example`, `backend/README.md`, `README.md`: general SMTP sender and workflow/deployment documentation.

### Backend tests — create

- `backend/tests/estimate-client-review-models.test.ts`
- `backend/tests/estimate-client-review-storage.test.ts`
- `backend/tests/estimate-mailer.test.ts`
- `backend/tests/estimate-client-review-service.test.ts`
- `backend/tests/estimate-publication.test.ts`
- `backend/tests/estimate-delivery.test.ts`
- `backend/tests/estimate-client-decision.test.ts`
- `backend/tests/estimate-client-response-routes.test.ts`
- `backend/tests/estimate-publication-mongo.replica-set.test.ts`
- `backend/tests/estimate-client-decision-mongo.replica-set.test.ts`
- `backend/tests/fixtures/estimate-client-response-route-operations.ts`

### Backend tests — modify

- `backend/tests/estimate-pdf.test.ts`, `backend/tests/estimate-pdf-routes.test.ts`, `backend/tests/uploads.test.ts`, `backend/tests/local-storage.test.ts`
- `backend/tests/user-invitation-mailer.test.ts`, `backend/tests/config.test.ts`, `backend/tests/server.test.ts`
- `backend/tests/leads.test.ts`, `backend/tests/full-journey.test.ts`, `backend/tests/admin-projects.test.ts`
- `backend/tests/authorization-policy.test.ts`, `backend/tests/route-operation-registry.test.ts`, `backend/tests/auth-authorization.test.ts`, `backend/tests/frontend-authorization-contract.test.ts`, `backend/tests/audit-security.test.ts`

### Frontend production

- Create `frontend/src/features/admin/estimateClientResponsesApi.ts`.
- Create `frontend/src/features/admin/ClientResponseInboxPage.tsx`.
- Create `frontend/src/features/admin/ClientResponseTaskDetailPage.tsx`.
- Create `frontend/src/features/admin/ClientResponseDecisionDialog.tsx`.
- Create `frontend/src/styles/client-responses.css`.
- Create `frontend/src/features/leads/EstimateDeliveryStatus.tsx` and `frontend/src/styles/estimate-delivery.css`.
- Modify `frontend/src/features/leads/leadsApi.ts` and `frontend/src/features/leads/LeadEstimateWorkspace.tsx` for safe delivery state/retry.
- Modify `frontend/src/features/admin/AdminProjectDetailPage.tsx` and `frontend/src/features/admin/adminProjectsApi.ts` for the compact task summary/link.
- Modify `frontend/src/api/authorization-contract.ts`, `frontend/src/api/types.ts`, `frontend/src/app/routePaths.ts`, `frontend/src/app/routeRegistry.ts`, `frontend/src/app/router.tsx`, `frontend/src/components/layout/navigation.ts`, and `frontend/src/main.tsx` for exact policy/route/navigation/style registration.
- Keep `frontend/src/features/client/ClientDashboard.tsx`, `frontend/src/features/estimates/EstimateReviewPanel.tsx`, and `frontend/src/features/estimates/estimateWorkflowApi.ts` production behavior unchanged unless a type-only safe-summary adjustment is required.

### Frontend tests

- Create `frontend/src/features/admin/estimateClientResponsesApi.test.ts`.
- Create `frontend/src/features/admin/ClientResponseInboxPage.test.tsx`.
- Create `frontend/src/features/admin/ClientResponseTaskDetailPage.test.tsx`.
- Create `frontend/src/features/admin/ClientResponseDecisionDialog.test.tsx`.
- Create `frontend/src/features/leads/EstimateDeliveryStatus.test.tsx`.
- Modify `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`, `frontend/src/features/admin/AdminProjectDetailPage.test.tsx`.
- Modify `frontend/src/api/authorization-contract.test.ts`, `frontend/src/app/routePaths.test.ts`, `frontend/src/app/router.test.tsx`, `frontend/src/components/layout/navigation.test.tsx`, `frontend/src/auth/authorization.test.ts`, and `frontend/src/test/accessibility.test.tsx`.
- Rerun unchanged `frontend/src/features/client/ClientDashboard.test.tsx`, `ClientDashboard.collapsible.test.tsx`, `EstimateReviewPanel.collapsible.test.tsx`, `ClientEstimateDrawings.test.tsx`, `ClientFullPlanNav.test.tsx`, and `ClientPlanPageReview.test.tsx` as compatibility gates.

---

## Stable Cross-Task Contracts

Task implementers must use these exact names and shapes. The nested snapshot is the concrete persistence needed by the approved immutable Admin detail contract; it contains only already-approved Estimate/Lead presentation fields.

```ts
export type EstimateDeliveryStatus = "queued" | "sent" | "failed" | "disabled";
export type EstimateClientReviewStatus = "pending" | "approved" | "changes_requested";
export type EstimateClientDecision = "approve" | "request_changes";
export type EstimateClientDecisionSource = "client_portal" | "admin_proof";
export type EstimateClientProofMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export interface EstimateClientReviewSnapshot {
  clientName: string;
  projectName: string;
  location: string;
  propertyType: string;
  lineItems: readonly {
    catalogueId: string;
    roomName: string;
    specification: string;
    unit: string;
    rate: number;
    quantity: number;
    included: boolean;
    amount: number;
  }[];
  subtotal: number;
  gst: number;
  total: number;
}

export interface EstimateClientReviewSummary {
  id: string;
  sendGeneration: number;
  estimateVersion: number;
  version: number;
  deliveryStatus: EstimateDeliveryStatus;
  deliveryAttemptCount: number;
  deliveredAt: string | null;
  status: EstimateClientReviewStatus;
}

export interface StoredEstimateClientResponseProof {
  storageReference: string;
  originalFilename: string;
  mimeType: EstimateClientProofMimeType;
  byteSize: number;
  sha256: string;
}

export interface ReviewAssignee {
  assignedAdminId: string;
  source: "admin_initiator" | "super_admin_fallback";
}

export interface StoredDownload {
  filename: string;
  mimeType: "application/pdf" | EstimateClientProofMimeType;
  bytes: Buffer;
}

export interface EstimateClientReviewListItem {
  id: string;
  version: number;
  sendGeneration: number;
  project: { id: string; name: string } | null;
  client: { name: string; email: string };
  estimate: { id: string; version: number; total: number };
  assignedAdmin: { id: string; name: string };
  deliveryStatus: EstimateDeliveryStatus;
  deliveryAttemptCount: number;
  deliveryAttemptedAt: string | null;
  deliveredAt: string | null;
  status: EstimateClientReviewStatus;
  decision: EstimateClientDecision | null;
  proofAvailable: boolean;
  createdAt: string;
}

export interface EstimateClientReviewDetail
  extends EstimateClientReviewListItem {
  estimateSnapshot: EstimateClientReviewSnapshot;
  pdf: {
    filename: string;
    mimeType: "application/pdf";
    byteSize: number;
    sha256: string;
  };
  decisionSource: EstimateClientDecisionSource | null;
  decisionNote: string | null;
  decidedAt: string | null;
}

export interface PublishEstimateToClientInput {
  estimateId: string;
  leadId: string;
  actorId: string;
  expectedEstimateVersion: number;
  expectedStatus: "draft" | "ready_for_client";
  submittedAt?: Date;
}

export interface PublishEstimateToClientResult {
  estimate: Record<string, unknown>;
  clientReview: EstimateClientReviewSummary;
}

export type EstimateDecisionContext =
  | { source: "client_portal"; actor: AuthenticatedUser; proof: null }
  | {
      source: "admin_proof";
      actor: AuthenticatedUser;
      proof: StoredEstimateClientResponseProof;
    };

export type EstimateDecisionRoundTarget =
  | { id: string; expectedVersion: number }
  | null;
```

The Admin APIs are exact:

```text
GET  /api/v1/admin/estimate-client-response-tasks?status=&limit=&offset=
GET  /api/v1/admin/estimate-client-response-tasks/:roundId
GET  /api/v1/admin/estimate-client-response-tasks/:roundId/pdf
GET  /api/v1/admin/estimate-client-response-tasks/:roundId/proof
POST /api/v1/admin/estimate-client-response-tasks/:roundId/decision
POST /api/v1/estimates/:estimateId/client-email/retry
```

The decision request is `multipart/form-data` with `decision`, `note`, positive integer `version`, and exactly one `proof`. The retry JSON body is `{ "roundId": string, "version": positive integer }`. The safe summary includes `version` because both the Estimator refetch and retry need the exact optimistic token.

---

### Task 1: Compact Client-Delivery PDF Profile

**Files:**
- Modify: `backend/src/services/estimate-pdf.service.ts`
- Modify: `backend/tests/estimate-pdf.test.ts`
- Modify: `backend/tests/estimate-pdf-routes.test.ts`

**Interfaces:**
- Consumes: existing `EstimatePdfInput`, `EstimatePdfResult`, logo asset, and standard generation behavior.
- Produces: `EstimatePdfProfile` and `EstimatePdfService.generate(input, { profile? })`; later publication calls `profile: "compact_client_delivery"`.

- [ ] **Step 1: Write the compact typography RED tests**

Add tests that inject/spy on PDF text operations and assert the exact helper rule while retaining the standard profile:

```ts
expect(scaleEstimateTextSize(12, "standard")).toBe(12);
expect(scaleEstimateTextSize(12, "compact_client_delivery")).toBe(10);
expect(scaleEstimateTextSize(11, "compact_client_delivery")).toBe(9.5);
expect(scaleEstimateTextSize(8, "compact_client_delivery")).toBe(7);
expect(scaleEstimateTextSize(6, "compact_client_delivery")).toBe(7);
```

Generate both profiles from the same fixture and assert the filename, page dimensions, selected lines, totals, logo asset, and watermark transform remain equal while every text size in the compact trace follows the helper.

- [ ] **Step 2: Run the focused tests and capture RED**

Run: `cd backend && npm test -- tests/estimate-pdf.test.ts tests/estimate-pdf-routes.test.ts`

Expected: FAIL because `EstimatePdfProfile`, the options argument, and `scaleEstimateTextSize` do not exist.

- [ ] **Step 3: Mark the PDF edit operation exactly once**

Immediately before the first production edit to the PDF generator, run:

```bash
node container_tools/mark_artifact_operation_started.mjs --operation-kind edit --expected-output-count 1 --output-format pdf
```

Expected: exit `0`. Do not run this marker again during later PDF iterations.

- [ ] **Step 4: Add one centralized profile helper and route every text size through it**

```ts
export type EstimatePdfProfile = "standard" | "compact_client_delivery";

export function scaleEstimateTextSize(
  size: number,
  profile: EstimatePdfProfile
): number {
  if (profile === "standard") return size;
  return Math.max(7, Math.round(size * 0.85 * 2) / 2);
}

export interface EstimatePdfService {
  generate(
    input: EstimatePdfInput,
    options?: { profile?: EstimatePdfProfile }
  ): Promise<EstimatePdfResult>;
}
```

Resolve `const profile = options?.profile ?? "standard"` once and apply `scaleEstimateTextSize` to header, metadata, table, total, term, footer, and page-number text calls. Do not pass watermark dimensions through this helper.

- [ ] **Step 5: Verify focused GREEN and build invariants**

Run:

```bash
cd backend && npm test -- tests/estimate-pdf.test.ts tests/estimate-pdf-routes.test.ts
cd backend && npm run verify:estimate-pdf-build
```

Expected: PASS; the standard snapshot is unchanged, compact trace uses exact scaling, and the built logo remains available.

- [ ] **Step 6: Render a representative compact PDF and inspect every page**

Use the existing PDF test fixture/generator to write one stable representative file under `tmp/pdfs/estimate-client-delivery/compact-estimate.pdf`. Run:

```bash
pdfinfo tmp/pdfs/estimate-client-delivery/compact-estimate.pdf
pdftoppm -png tmp/pdfs/estimate-client-delivery/compact-estimate.pdf tmp/pdfs/estimate-client-delivery/compact-estimate
```

Inspect every rendered PNG at original detail for clipping, overlap, broken tables/glyphs, unreadable text, pagination/section transition, header/footer/page-number drift, and watermark geometry/opacity/rotation. Use text extraction only as a secondary content check. Record the page count and zero-defect result in task notes, then remove the untracked QA PDF/PNGs after approval; never commit them.

- [ ] **Step 7: Review and commit**

```bash
git diff --check
git add backend/src/services/estimate-pdf.service.ts backend/tests/estimate-pdf.test.ts backend/tests/estimate-pdf-routes.test.ts
git diff --cached --check
git commit -m "feat: add compact estimate PDF profile"
```

### Task 2: Immutable Review-Round and Proof Models

**Files:**
- Create: `backend/src/domain/estimate-client-review.ts`
- Create: `backend/src/models/EstimateClientReviewRound.ts`
- Create: `backend/src/models/EstimateClientResponseProof.ts`
- Create: `backend/tests/estimate-client-review-models.test.ts`
- Modify: `backend/src/domain/audit-actions.ts`
- Modify: `backend/tests/audit-security.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`, Mongoose model conventions, and existing closed audit-action validation.
- Produces: stable types above, `buildEstimateClientReviewDedupeKey`, `sha256Hex`, both models, and `prepareEstimateClientReviewIndexes()` for Task 14.

- [ ] **Step 1: Write model/type/index RED tests**

Cover allowed closed values, immutable snapshot fields, normalized recipient, SHA-256 pattern, bounded safe failure code, positive generations, terminal-field consistency, optimistic version, and storage-reference exclusion:

```ts
expect(buildEstimateClientReviewDedupeKey({
  estimateId: "estimate-1",
  estimateVersion: 3,
  recipientEmailNormalized: "client@example.com"
})).toMatch(/^[a-f0-9]{64}$/);

expect(EstimateClientReviewRoundModel.schema.path("pdfStorageReference").options.select)
  .toBe(false);
expect(EstimateClientResponseProofModel.schema.path("storageReference").options.select)
  .toBe(false);
```

Assert exact indexes: unique `dedupeKey`; unique `{ estimateId: 1, sendGeneration: 1 }`; queue `{ assignedAdminId: 1, status: 1, createdAt: -1, _id: 1 }`; history `{ estimateId: 1, createdAt: -1, _id: 1 }`; unique proof `reviewRoundId`.

- [ ] **Step 2: Run model tests and capture RED**

Run: `cd backend && npm test -- tests/estimate-client-review-models.test.ts tests/audit-security.test.ts`

Expected: FAIL because the domain, models, and nine audit actions are absent.

- [ ] **Step 3: Define closed types, constants, helpers, and safe DTOs**

```ts
export const ESTIMATE_CLIENT_PROOF_MIME_TYPES = [
  "application/pdf", "image/jpeg", "image/png", "image/webp"
] as const;
export const ESTIMATE_CLIENT_DECISION_NOTE_MAX = 1_000;
export const ESTIMATE_DELIVERY_FAILURE_CODE = /^[A-Z0-9_]{1,64}$/;

export function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildEstimateClientReviewDedupeKey(input: {
  estimateId: string;
  estimateVersion: number;
  recipientEmailNormalized: string;
}): string {
  return sha256Hex(`${input.estimateId}\n${input.estimateVersion}\n${input.recipientEmailNormalized}`);
}
```

Define `EstimateClientReviewRoundRecord`, `EstimateClientResponseProofRecord`, `EstimateClientReviewSummary`, `EstimateClientReviewListItem`, and `EstimateClientReviewDetail` without storage references, bytes, or provider messages.

- [ ] **Step 4: Implement schemas, invariants, hidden references, and explicit index preparation**

Persist the stable round fields plus `estimateSnapshot`, `deliveryAttemptGeneration`, and `deliveryLeaseExpiresAt`; use Mongoose schema validation to require all terminal fields together and prohibit them while pending. Add:

```ts
export async function prepareEstimateClientReviewIndexes(): Promise<void> {
  await EstimateClientReviewRoundModel.createIndexes();
  await EstimateClientResponseProofModel.createIndexes();
}
```

Do not use `syncIndexes()` and do not add an Estimate status.

- [ ] **Step 5: Add the exact nine audit actions with leak guards**

```ts
"estimate_client_review_published",
"estimate_email_delivery_sent",
"estimate_email_delivery_failed",
"estimate_email_retry_requested",
"estimate_client_response_task_assigned",
"estimate_client_approval_recorded_by_admin",
"estimate_client_changes_recorded_by_admin",
"estimate_client_response_recorded_through_portal",
"estimate_client_proof_stored",
```

Extend security tests so `storageReference`, `pdfStorageReference`, recipient email, provider response, and byte buffers are rejected from these audit values.

- [ ] **Step 6: Verify focused GREEN and typecheck**

Run:

```bash
cd backend && npm test -- tests/estimate-client-review-models.test.ts tests/audit-security.test.ts
cd backend && npm run typecheck
```

Expected: PASS with exact indexes and no DTO/reference leak.

- [ ] **Step 7: Review and commit**

```bash
git diff --check
git add backend/src/domain/estimate-client-review.ts backend/src/models/EstimateClientReviewRound.ts backend/src/models/EstimateClientResponseProof.ts backend/src/domain/audit-actions.ts backend/tests/estimate-client-review-models.test.ts backend/tests/audit-security.test.ts
git diff --cached --check
git commit -m "feat: add estimate client review records"
```

### Task 3: Secure Snapshot and Proof Storage Boundary

**Files:**
- Create: `backend/src/services/estimate-client-review-storage.ts`
- Create: `backend/tests/estimate-client-review-storage.test.ts`
- Modify: `backend/src/middleware/upload.ts`
- Modify: `backend/tests/uploads.test.ts`
- Test: `backend/tests/local-storage.test.ts`

**Interfaces:**
- Consumes: `FileStorage.saveGenerated/save/read/delete`, `ValidatedUpload`, `sha256Hex`, and exact proof MIME union from Task 2.
- Produces: backward-compatible `uploadSingleFile(maxUploadBytes, options?)`, `EstimateClientReviewStorage`, `StoredEstimatePdfSnapshot`, and `StoredEstimateClientResponseProof`.

- [ ] **Step 1: Write backward-compatibility and strict-proof upload RED tests**

Use existing fixture bytes to prove old `uploadSingleFile(maxBytes)` still accepts `file` and existing TIFF/HEIC flows. Add strict route harness tests using:

```ts
uploadSingleFile(MAX_BYTES, {
  fieldName: "proof",
  maxFields: 3,
  allowedDetectedMimeTypes: new Set([
    "application/pdf", "image/jpeg", "image/png", "image/webp"
  ]),
  fieldErrorKey: "proof",
  allowedTypeMessage: "Choose a PDF, JPEG, PNG, or WebP proof file."
})
```

Assert missing/wrong/multiple file fields, fourth scalar field, TIFF/HEIC, spoofed extension, claimed/detected mismatch, malformed PDF, and oversize input fail with bounded field errors.

- [ ] **Step 2: Write storage/hash/cleanup RED tests**

```ts
const saved = await reviewStorage.savePdfSnapshot({
  bytes: pdfBytes,
  filename: "lisno-estimate-v2.pdf"
});
expect(saved).toMatchObject({
  filename: "lisno-estimate-v2.pdf",
  mimeType: "application/pdf",
  byteSize: pdfBytes.length,
  sha256: sha256Hex(pdfBytes)
});
expect(storage.saveGenerated).toHaveBeenCalledWith({ data: pdfBytes, extension: ".pdf" });
```

Cover proof extension preservation from validated MIME, authorized caller-controlled reads, and idempotent `deleteQuietly(reference)` on cleanup.

- [ ] **Step 3: Run focused tests and capture RED**

Run: `cd backend && npm test -- tests/uploads.test.ts tests/local-storage.test.ts tests/estimate-client-review-storage.test.ts`

Expected: FAIL because upload options and review storage service do not exist.

- [ ] **Step 4: Parameterize upload parsing without changing defaults**

```ts
export interface UploadSingleFileOptions {
  fieldName?: string;
  maxFields?: number;
  allowedDetectedMimeTypes?: ReadonlySet<ValidatedUpload["mimeType"]>;
  fieldErrorKey?: string;
  allowedTypeMessage?: string;
}

export function uploadSingleFile(
  maxUploadBytes: number,
  options: number | UploadSingleFileOptions = {}
): RequestHandler {
  const normalized = typeof options === "number" ? { maxFields: options } : options;
  const fieldName = normalized.fieldName ?? "file";
  const maxFields = normalized.maxFields ?? 0;
  // Keep the current full allowlist when allowedDetectedMimeTypes is omitted.
}
```

Keep the numeric second argument as a compatibility overload because existing callers use `uploadSingleFile(maxBytes, maxFields)`.

- [ ] **Step 5: Implement the storage service with safe metadata only**

```ts
export interface StoredEstimatePdfSnapshot {
  storageReference: string;
  filename: string;
  mimeType: "application/pdf";
  byteSize: number;
  sha256: string;
}

export interface EstimateClientReviewStorage {
  savePdfSnapshot(input: { bytes: Buffer; filename: string }): Promise<StoredEstimatePdfSnapshot>;
  saveProof(upload: ValidatedUpload): Promise<StoredEstimateClientResponseProof>;
  read(reference: string): Promise<Buffer>;
  deleteQuietly(reference: string): Promise<void>;
}
```

Only service/model code handles storage references. Routes receive bytes after authorization from a service method and never serialize reference-bearing objects.

- [ ] **Step 6: Verify focused GREEN and typecheck**

Run:

```bash
cd backend && npm test -- tests/uploads.test.ts tests/local-storage.test.ts tests/estimate-client-review-storage.test.ts
cd backend && npm run typecheck
```

Expected: PASS; legacy upload callers retain behavior and proof mode accepts only the exact four types.

- [ ] **Step 7: Review and commit**

```bash
git diff --check
git add backend/src/middleware/upload.ts backend/src/services/estimate-client-review-storage.ts backend/tests/uploads.test.ts backend/tests/local-storage.test.ts backend/tests/estimate-client-review-storage.test.ts
git diff --cached --check
git commit -m "feat: add secure estimate response storage"
```

### Task 4: Shared Hardened SMTP Transport and Estimate Mailer

**Files:**
- Create: `backend/src/services/smtp-transport.ts`
- Create: `backend/src/services/estimate-mailer.ts`
- Create: `backend/src/services/smtp-estimate-mailer.ts`
- Create: `backend/tests/estimate-mailer.test.ts`
- Modify: `backend/src/services/smtp-invitation-mailer.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/tests/user-invitation-mailer.test.ts`
- Modify: `backend/tests/config.test.ts`
- Modify: `backend/tests/server.test.ts`

**Interfaces:**
- Consumes: current SMTP environment variables and invitation mailer's proven TLS/timeout/failure behavior.
- Produces: `MailDeliveryConfig`, `mailDelivery`, `createIsolatedSmtpTransport`, `EstimateMailer`, and `createSmtpEstimateMailer` for Tasks 6–7 and 14.

- [ ] **Step 1: Freeze current invitation behavior with extraction RED tests**

Extend the invitation mailer suite to assert implicit TLS vs STARTTLS, `rejectUnauthorized: true`, all `10_000` ms bounds, settle-once close, address objects, escaped HTML, `disableFileAccess`, `disableUrlAccess`, and safe failure codes still hold after extraction. Add config expectations that the loaded property becomes `mailDelivery` while the exact environment keys and all-or-nothing behavior remain unchanged.

- [ ] **Step 2: Write EstimateMailer RED tests**

Use the existing trickling SMTP helper and a hostile presentation fixture:

```ts
await mailer.send({
  to: "client@example.com",
  clientName: "A <Client>",
  projectName: "Home & Studio",
  estimateVersion: 4,
  total: 1_234_500,
  portalUrl: "https://app.lisno.example/client",
  attachment: {
    filename: "lisno-estimate-home-v4.pdf",
    mimeType: "application/pdf",
    bytes: pdfBytes
  }
});
```

Assert subject `Lisno estimate for Home & Studio · v4`, plain text, escaped HTML, credential-free `/client` URL, exactly one in-memory attachment with matching bytes, and no path/href/content stream or remote URL attachment source.

- [ ] **Step 3: Run focused mail/config tests and capture RED**

Run: `cd backend && npm test -- tests/user-invitation-mailer.test.ts tests/estimate-mailer.test.ts tests/config.test.ts tests/server.test.ts`

Expected: FAIL because shared transport, EstimateMailer, and `mailDelivery` do not exist.

- [ ] **Step 4: Extract only the proven transport primitives**

```ts
export type MailDeliveryConfig =
  | { kind: "disabled" }
  | {
      kind: "smtp";
      publicFrontendUrl: string;
      host: string;
      port: number;
      tlsMode: "implicit" | "starttls";
      username: string;
      password: string;
      from: string;
    };

export class MailDeliveryError extends Error {
  constructor(readonly failureCode: string) {
    super("Mail delivery failed.");
  }
}
```

Move `SMTP_TIMEOUT_MS`, provider classification, mailbox parsing, HTML escaping, and isolated connection creation into `smtp-transport.ts`. Keep logger/debug false, no pooling, certificate verification, bounded timer, and settle-once cleanup. Adapt the invitation mailer without changing its public `InvitationMailer` interface or message.

Retain the existing service import contract with a true class alias so invitation delivery classification and `instanceof` checks do not drift:

```ts
export { MailDeliveryError as InvitationDeliveryError } from "./smtp-transport.js";
```

- [ ] **Step 5: Implement the safe EstimateMailer boundary**

```ts
export interface EnabledEstimateMailer {
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

export type EstimateMailer =
  | { readonly deliveryKind: "disabled" }
  | (EnabledEstimateMailer & { readonly deliveryKind: "external" | "local_test" });
```

`createSmtpEstimateMailer` catches `MailDeliveryError` and returns a bounded failed result; it never throws provider payloads. Construct `portalUrl` from `new URL("/client", config.publicFrontendUrl).toString()` and reject any non-origin configuration at environment load.

- [ ] **Step 6: Generalize environment naming and error copy**

Rename `InvitationDeliveryConfig` to `MailDeliveryConfig`, output `mailDelivery`, update the server's existing invitation-mailer construction to consume it, and change partial-group copy to `Mail delivery configuration must be supplied as one complete group.` Preserve `PUBLIC_FRONTEND_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_TLS_REJECT_UNAUTHORIZED`, and every validation rule.

- [ ] **Step 7: Verify focused GREEN and typecheck**

Run:

```bash
cd backend && npm test -- tests/user-invitation-mailer.test.ts tests/estimate-mailer.test.ts tests/config.test.ts tests/server.test.ts
cd backend && npm run typecheck
```

Expected: PASS; invitation fixtures are unchanged and estimate attachment tests prove byte-only delivery.

- [ ] **Step 8: Review and commit**

```bash
git diff --check
git add backend/src/services/smtp-transport.ts backend/src/services/estimate-mailer.ts backend/src/services/smtp-estimate-mailer.ts backend/src/services/smtp-invitation-mailer.ts backend/src/config/env.ts backend/src/server.ts backend/tests/estimate-mailer.test.ts backend/tests/user-invitation-mailer.test.ts backend/tests/config.test.ts backend/tests/server.test.ts
git diff --cached --check
git commit -m "feat: add secure estimate mail delivery"
```

### Task 5: Review Assignment, Scope, and Safe Query Service

**Files:**
- Create: `backend/src/services/estimate-client-review.service.ts`
- Create: `backend/tests/estimate-client-review-service.test.ts`

**Interfaces:**
- Consumes: review/proof models and safe DTOs from Task 2, storage reader from Task 3, `ProjectAccessGrant`, `User`, `Estimate`, and `Lead` models.
- Produces: `EstimateClientReviewService`, `resolveReviewAssignee`, scope-before-pagination list/detail, safe current summary, and authorized byte reads for Tasks 6, 8, 9, and 13.

- [ ] **Step 1: Write assignee-resolution RED tests**

Cover an active project `admin_initiator` grant plus active Admin, inactive/revoked/wrong-module/wrong-role grants, projectless Estimate, no eligible grant, absent Super Admin, and two eligible initiators. Use the exact interface:

```ts
resolveReviewAssignee(
  projectId: string | null,
  session: mongoose.ClientSession
): Promise<{
  assignedAdminId: string;
  source: "admin_initiator" | "super_admin_fallback";
}>;
```

No eligible initiator falls back to the sole active Super Admin. More than one eligible initiator and any sole-Super-Admin invariant failure return a safe conflict/internal invariant error rather than choosing arbitrarily.

- [ ] **Step 2: Write list/detail/download scope RED tests**

Assert regular Admin filtering includes all of: active stored actor, persisted `assignedAdminId`, non-null matching `projectId`, active `admin_initiator` grant, `projects` module, and matching active Admin user. Apply that predicate before `$count`, sort, skip, and limit. Cover Super Admin oversight, owning Estimator/Sales proof read, normalized-email Client current-round/PDF read, non-owner retry/proof denial, and all foreign task/snapshot/proof reads returning the same 404.

- [ ] **Step 3: Run focused tests and capture RED**

Run: `cd backend && npm test -- tests/estimate-client-review-service.test.ts`

Expected: FAIL because the query/assignment service does not exist.

- [ ] **Step 4: Implement assignee resolution and actor predicates**

```ts
export interface EstimateClientReviewService {
  resolveReviewAssignee(
    projectId: string | null,
    session: mongoose.ClientSession
  ): Promise<ReviewAssignee>;
  currentSummaryForEstimate(
    actor: PublicUser,
    estimateId: string
  ): Promise<EstimateClientReviewSummary | null>;
  currentRoundForClientEstimate(
    actor: PublicUser,
    estimateId: string
  ): Promise<{ id: string; version: number } | null>;
  list(
    actor: PublicUser,
    filters: { status?: EstimateClientReviewStatus },
    pagination: PaginationInput
  ): Promise<PageResult<EstimateClientReviewListItem>>;
  detail(actor: PublicUser, roundId: string): Promise<EstimateClientReviewDetail>;
  readPdf(actor: PublicUser, roundId: string): Promise<StoredDownload>;
  readClientPdf(actor: PublicUser, roundId: string): Promise<StoredDownload>;
  readProof(actor: PublicUser, roundId: string): Promise<StoredDownload>;
  requireDecisionScope(
    actor: PublicUser,
    roundId: string,
    session?: mongoose.ClientSession
  ): Promise<void>;
  requireRetryScope(actor: PublicUser, estimateId: string, roundId: string): Promise<void>;
}
```

Use explicit field projections; never spread a Mongoose round/proof object into a DTO. Call storage only after the actor/round/proof predicate succeeds.

- [ ] **Step 5: Implement deterministic pagination and historical detail**

Pending rows sort `{ status: 1, createdAt: -1, _id: 1 }` with a computed pending-first rank; terminal history follows newest first and stable ID. Detail reads `estimateSnapshot`, delivery attempt counters/timestamps, decision source/actor/note, and proof presence from the round/proof collections, never the mutable current Estimate.

```ts
const stableSort = {
  pendingRank: 1,
  createdAt: -1,
  _id: 1
} as const;

const pendingRankStage = {
  $set: { pendingRank: { $cond: [{ $eq: ["$status", "pending"] }, 0, 1] } }
};
```

For regular Admin, place assignment/project/grant/user `$match` stages before the `$facet` that computes `items` and `total`; never filter the returned page in JavaScript.

- [ ] **Step 6: Verify focused GREEN and typecheck**

Run:

```bash
cd backend && npm test -- tests/estimate-client-review-service.test.ts
cd backend && npm run typecheck
```

Expected: PASS with scope applied before pagination and no unauthorized storage call.

- [ ] **Step 7: Review and commit**

```bash
git diff --check
git add backend/src/services/estimate-client-review.service.ts backend/tests/estimate-client-review-service.test.ts
git diff --cached --check
git commit -m "feat: add scoped estimate response queries"
```

### Task 6: Transactional Estimate Publication

**Files:**
- Create: `backend/src/services/estimate-publication.service.ts`
- Create: `backend/tests/estimate-publication.test.ts`

**Interfaces:**
- Consumes: compact PDF from Task 1, models from Task 2, storage from Task 3, assignee service from Task 5, AuditService, and an injected `deliverInitial(roundId)` callback implemented in Task 7.
- Produces: `EstimatePublicationService.publishEstimateToClient(input): Promise<PublishEstimateToClientResult>` and optional `clientReview` on estimator publication/read DTOs.

- [ ] **Step 1: Write ordinary-publication RED tests**

Assert a valid `<= 1_500_000` draft produces exactly: post-transition compact PDF input, one `saveGenerated`, one `sent_to_client` Estimate transition, existing `submitted` review, existing compatibility notification, existing Lead `estimate_sent` fields, one round with immutable snapshot/hash/generation/assignee, publication/task audits, and one post-commit initial-delivery request. SMTP failed/disabled result and any unexpected post-commit delivery/storage/audit exception still return the committed Estimate plus a safely reloaded current review summary; they never turn the committed publication into an HTTP failure.

- [ ] **Step 2: Write high-value and cleanup RED tests**

Assert initial `> 1_500_000` submission still only reaches `pending_manager_assignment`. Existing manager/designer flow remains. Existing `send-client` from `ready_for_client` creates the round/email once. Transaction, audit, missing-fallback, and duplicate-key loss all delete only the newly stored orphan snapshot.

- [ ] **Step 3: Run focused publication tests and capture RED**

Run: `cd backend && npm test -- tests/estimate-publication.test.ts`

Expected: FAIL because the publication service and safe summary are absent.

- [ ] **Step 4: Implement the exact service boundary**

```ts
export interface EstimatePublicationService {
  publishEstimateToClient(
    input: PublishEstimateToClientInput
  ): Promise<PublishEstimateToClientResult>;
}

export function createEstimatePublicationService(input: {
  pdf: EstimatePdfService;
  storage: EstimateClientReviewStorage;
  reviews: EstimateClientReviewService;
  audit: AuditService;
  deliverInitial: (roundId: string) => Promise<EstimateClientReviewSummary>;
  now?: () => Date;
}): EstimatePublicationService;
```

Build a copied post-transition Estimate input with status `sent_to_client`, generate once using `{ profile: "compact_client_delivery" }`, save before transaction, and retain the bytes only until the immediate post-commit delivery returns.

- [ ] **Step 5: Implement the publication transaction and dedupe path**

Inside one Mongoose transaction:

1. Reload and CAS the exact Estimate ID, owner, `expectedStatus`, and `expectedEstimateVersion`.
2. Reload the matching Lead and verify owner/project identity.
3. Resolve the assignee inside the transaction.
4. Allocate `sendGeneration = latest + 1`; create the unique round using the dedupe digest and immutable snapshot.
5. Set Estimate `sentToClientAt`; for ordinary submission also set `submittedAt`, `approvalRequired: false`, and append `submitted`; append the existing queued compatibility notification.
6. Set Lead stage/next action exactly as current code.
7. Append `estimate_client_review_published` and `estimate_client_response_task_assigned` in the transaction.

The Estimate write is an update-CAS, not a document `.save()` after an unlocked read:

```ts
const transition = await EstimateModel.updateOne(
  {
    _id: input.estimateId,
    leadId: input.leadId,
    ownerId: input.actorId,
    status: input.expectedStatus,
    version: input.expectedEstimateVersion
  },
  {
    $set: { status: "sent_to_client", sentToClientAt: occurredAt },
    $push: { notifications: compatibilityNotification }
  },
  { session }
);
if (transition.matchedCount !== 1) throw publicationConflict();
```

Apply the ordinary-submission review/fields in the same update document and create the round/audits before commit.

On duplicate key, return an already-committed round only when its dedupe key matches the same Estimate/version/recipient; delete the newly stored snapshot. Any other failure is a conflict and also cleans the snapshot.

After commit, wrap `deliverInitial(round.id)` in a best-effort boundary. If it throws unexpectedly, attempt one read-only `currentSummaryForEstimate` reload and fall back to the already-mapped pre-delivery round summary if even that read fails; never attempt the Estimate transaction again.

- [ ] **Step 6: Expose exact route-adapter results without mounting them yet**

Return a mapped Estimate plus the safe `clientReview` summary from the service. Do not mount or duplicate route code in this task; Task 9 atomically replaces both route-local publication branches, adds estimator read summaries, and runs the existing journey suites.

- [ ] **Step 7: Verify focused GREEN and typecheck**

Run:

```bash
cd backend && npm test -- tests/estimate-publication.test.ts
cd backend && npm run typecheck
```

Expected: PASS; high-value pre-publication creates no round/email and all existing effects remain.

- [ ] **Step 8: Review and commit**

```bash
git diff --check
git add backend/src/services/estimate-publication.service.ts backend/tests/estimate-publication.test.ts
git diff --cached --check
git commit -m "feat: publish immutable client estimate reviews"
```

### Task 7: Delivery Attempt Telemetry and Exact-PDF Retry

**Files:**
- Create: `backend/src/services/estimate-delivery.service.ts`
- Create: `backend/tests/estimate-delivery.test.ts`

**Interfaces:**
- Consumes: `EstimateMailer`, review model, safe review summary, authorized scope service, storage reader, and AuditService.
- Produces: `EstimateDeliveryService.deliverInitial(roundId)` and `.retry(actor, input)` for publication and routes.

- [ ] **Step 1: Write disabled/sent/failed delivery RED tests**

Assert disabled mailer makes a new round `disabled` with zero attempts and no SMTP call. Enabled initial delivery leases generation `1`, increments attempt count once, reads stored snapshot bytes, and completes as `sent` or bounded `failed` with telemetry plus matching audit committed together. Storage read/hash mismatch and mailer throw are mapped to bounded failure codes. A telemetry/audit transaction failure leaves the prior safe state and never leaks through the already-committed publication response. Provider response/message is never stored.

- [ ] **Step 2: Write retry/lease/stale-completion RED tests**

Cover failed, newly configurable disabled, and queued-after-deadline states; reject sent, pending queued lease, terminal task retry, stale round ID/version, foreign owner, and non-current generation. Two retries produce one mail call. A stale completion with an old `deliveryAttemptGeneration` updates neither telemetry nor audit.

- [ ] **Step 3: Run focused tests and capture RED**

Run: `cd backend && npm test -- tests/estimate-delivery.test.ts`

Expected: FAIL because the delivery service is absent.

- [ ] **Step 4: Implement lease acquisition and attempt input**

```ts
export interface EstimateDeliveryService {
  deliverInitial(roundId: string): Promise<EstimateClientReviewSummary>;
  retry(
    actor: PublicUser,
    input: { estimateId: string; roundId: string; version: number }
  ): Promise<EstimateClientReviewSummary>;
}

const DELIVERY_ATTEMPT_DEADLINE_MS = 30_000;
```

Acquire using one `findOneAndUpdate` predicate over exact round ID/version/current generation/retryable state/expired lease. Set `deliveryStatus: "queued"`, increment round version plus attempt generation/count, and persist attempted/deadline timestamps. Retry also appends `estimate_email_retry_requested` in the acquisition transaction.

- [ ] **Step 5: Send exact bytes and complete by exact generation CAS**

After acquisition, read `pdfStorageReference` through a persistence-only select and verify byte size/SHA before mail. Send the stored filename/bytes and stored `estimateSnapshot` presentation values. Completion matches round ID, exact attempt generation, and `deliveryStatus: "queued"`; it increments round version, sets sent/failed fields, and appends the corresponding audit in one transaction. It deliberately does not require the lease-time round version, so an exact in-flight attempt may complete after a task decision increments that version; no new retry may start once terminal.

```ts
const completed = await EstimateClientReviewRoundModel.updateOne(
  {
    _id: lease.roundId,
    deliveryStatus: "queued",
    deliveryAttemptGeneration: lease.attemptGeneration
  },
  {
    $set: completionFields,
    $inc: { version: 1 }
  },
  { session }
);
if (completed.matchedCount === 1) await appendDeliveryAudit(session);
```

When `matchedCount` is zero, return the safe current summary and write no audit.

- [ ] **Step 6: Verify focused GREEN and typecheck**

Run:

```bash
cd backend && npm test -- tests/estimate-delivery.test.ts
cd backend && npm run typecheck
```

Expected: PASS with exact one-attempt behavior and no Estimate semantic version change.

- [ ] **Step 7: Review and commit**

```bash
git diff --check
git add backend/src/services/estimate-delivery.service.ts backend/tests/estimate-delivery.test.ts
git diff --cached --check
git commit -m "feat: track and retry estimate email delivery"
```

### Task 8: Shared Client/Admin Decision and Proof Transaction

**Files:**
- Create: `backend/src/services/estimate-decision.service.ts`
- Create: `backend/tests/estimate-client-decision.test.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/services/estimate-project-handoff.ts`

**Interfaces:**
- Consumes: pending round/model, proof storage metadata, review decision scope, existing Estimate/Lead/design/project transition logic, and AuditService.
- Produces: `EstimateDecisionService.decide(input)`; existing Client route becomes a thin adapter and Task 9 Admin route calls the same method.

- [ ] **Step 1: Freeze existing Client decision contract with RED extraction tests**

Keep the Client body `{ decision, note }`, normalized Lead email ownership, response Estimate shape, not-found behavior, readiness error, request-changes effects, approval/project/freeze/Lead/kickoff effects, and current audit semantics. Add expectations that the server resolves the current pending round/version internally; the Client sends no new field. A legacy Client-visible Estimate with no round follows the same transition without synthesizing a round/proof.

- [ ] **Step 2: Write Admin-source/proof RED tests**

Cover required proof for both decisions, required non-empty rejection note, assigned/scope/version validation, Admin actor/source audit, proof metadata creation in the decision transaction, matching active Client lookup by normalized Lead email, null Client ID when absent, and a hard assertion that Admin ID is never supplied as Client ID.

- [ ] **Step 3: Run focused decision tests and capture RED**

Run: `cd backend && npm test -- tests/estimate-client-decision.test.ts`

Expected: FAIL because no shared decision service or round resolution exists.

- [ ] **Step 4: Add a trusted transaction-internal readiness method**

Do not call the current role-gated `approvalReadiness(user, ...)` with an Admin. Extract its drawing/plan query into:

```ts
approvalReadinessForDecision(
  estimateId: string,
  session: mongoose.ClientSession
): Promise<EstimateDesignApprovalReadiness>;
```

Keep the existing public `approvalReadiness(user, ...)` contract and authorization unchanged; both methods reuse one private calculation.

- [ ] **Step 5: Implement the discriminated decision context and shared CAS**

```ts
export interface EstimateDecisionService {
  decide(input: {
    round: EstimateDecisionRoundTarget;
    decision: EstimateClientDecision;
    note: string;
    context: EstimateDecisionContext;
  }): Promise<{
    estimate: Record<string, unknown>;
    clientReview: EstimateClientReviewSummary;
  }>;
}
```

Inside one transaction, when `round` is non-null, match its pending ID/version plus Estimate `sent_to_client` and Estimate/design-lifecycle versions. Admin source rejects a null round. Client source may use null only when no current round exists; it then matches the existing Estimate/design-lifecycle boundary and writes no round/proof. For `request_changes`, preserve current increments/review/audit and resolve the round when present. For approval, call the trusted readiness query, resolve Designer/Manager exactly as current code, resolve/reuse project, freeze design, mark Lead won, queue kickoff, and resolve the round when present.

- [ ] **Step 6: Make project handoff nullable-client safe**

Change `ResolveApprovalProjectInput.clientId` to `string | null`. Direct Client source passes authenticated Client ID. Admin source queries `{ emailNormalized, role: "client", active: true, accountKind: "standard" }` using the repository/model's actual normalized-email field and passes that ID or null. Existing linked-project identity allows a null Client only when current `project.clientId` is null; never overwrite another Client.

```ts
const clientId = context.source === "client_portal"
  ? context.actor.id
  : (await UserModel.findOne({
      emailNormalized: normalizeEmail(lead.clientEmail),
      role: "client",
      active: true,
      accountKind: "standard"
    }).session(session).lean())?._id ?? null;
```

- [ ] **Step 7: Persist proof and source-specific audits atomically**

Admin source creates the one-to-one proof record in the same transaction as round resolution and appends `estimate_client_proof_stored` plus Admin approve/changes audit with `recordedOnBehalfOf: "client"`. Portal source appends `estimate_client_response_recorded_through_portal` and never creates proof. Audit may contain MIME, byte size, `sha256`, and `noteLength`, but no raw note, filename, reference, or content.

```ts
if (context.source === "admin_proof") {
  await EstimateClientResponseProofModel.create([{
    _id: `estimate-client-proof-${randomUUID()}`,
    reviewRoundId: round.id,
    estimateId: estimate._id,
    storageReference: context.proof.storageReference,
    originalFilename: context.proof.originalFilename,
    mimeType: context.proof.mimeType,
    byteSize: context.proof.byteSize,
    sha256: context.proof.sha256,
    uploadedById: context.actor.id,
    uploadedAt: occurredAt
  }], { session });
}
```

- [ ] **Step 8: Define the unchanged Client adapter contract for Task 9**

Document in the service test that the adapter resolves the pending round after existing Estimate/Lead ownership checks, passes that round or null plus `{ source: "client_portal", actor, proof: null }`, and returns only the current Client Estimate `data` shape. Task 9 performs this route replacement atomically with the Admin route and authorization metadata.

- [ ] **Step 9: Verify focused GREEN and typecheck**

Run:

```bash
cd backend && npm test -- tests/estimate-client-decision.test.ts
cd backend && npm run typecheck
```

Expected: PASS with equivalent business states and distinct true actor/source metadata.

- [ ] **Step 10: Review and commit**

```bash
git diff --check
git add backend/src/services/estimate-decision.service.ts backend/src/services/estimate-design.service.ts backend/src/services/estimate-project-handoff.ts backend/tests/estimate-client-decision.test.ts
git diff --cached --check
git commit -m "feat: share client estimate decision workflow"
```

### Task 9: Protected APIs, Policy Parity, Immutable Downloads, and Admin Projection

**Files:**
- Create: `backend/src/routes/estimate-client-responses.ts`
- Create: `backend/tests/estimate-client-response-routes.test.ts`
- Create: `backend/tests/fixtures/estimate-client-response-route-operations.ts`
- Modify: `backend/src/routes/estimates.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/domain/authorization.ts`
- Modify: `backend/src/domain/route-operations.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/admin-project-summary.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/tests/estimate-pdf-routes.test.ts`
- Modify: `backend/tests/leads.test.ts`
- Modify: `backend/tests/full-journey.test.ts`
- Modify: `backend/tests/admin-projects.test.ts`
- Modify: `backend/tests/authorization-policy.test.ts`
- Modify: `backend/tests/route-operation-registry.test.ts`
- Modify: `backend/tests/auth-authorization.test.ts`
- Modify: `backend/tests/frontend-authorization-contract.test.ts`
- Modify: `frontend/src/api/authorization-contract.ts`
- Modify: `frontend/src/api/authorization-contract.test.ts`

**Interfaces:**
- Consumes: Tasks 2–8 services, strict proof upload mode, exact six API paths, and existing authorization registry conventions.
- Produces: mounted backend routes, policy `2026-08-24.estimate-client-response.v1`, safe Admin project projection, immutable Client/Admin PDF behavior, and frontend permission parity for Tasks 10–11.

- [ ] **Step 1: Write permission and operation-registry RED tests**

Add exact role expectations:

```ts
const additions = {
  admin: [
    "estimation.client_response_tasks.read",
    "estimation.client_response_tasks.decide",
    "estimation.client_response_proof.read"
  ],
  super_admin: [
    "estimation.client_response_tasks.read",
    "estimation.client_response_tasks.decide",
    "estimation.client_response_proof.read",
    "estimation.estimate_email.retry"
  ],
  estimator_sales: [
    "estimation.client_response_proof.read",
    "estimation.estimate_email.retry"
  ]
} as const;
```

The current closed catalogs move from `97` to `101` permissions and from `101` to `107` protected human operations. Task 11 moves the frontend protected/presentation route registry from `20` to `22` entries.

Assert every other role receives none. Advance backend/frontend policy versions together. Add `estimate_client_response` to the non-project namespace union and `estimate_client_response` to the availability union. Register exactly:

```ts
"GET /admin/estimate-client-response-tasks"
"GET /admin/estimate-client-response-tasks/:roundId"
"GET /admin/estimate-client-response-tasks/:roundId/pdf"
"GET /admin/estimate-client-response-tasks/:roundId/proof"
"POST /admin/estimate-client-response-tasks/:roundId/decision"
"POST /estimates/:estimateId/client-email/retry"
```

Compose the new fixture after `staff-invitation-route-operations.ts`; do not alter prior fixture bytes.

- [ ] **Step 2: Write route/auth/disclosure RED tests**

Cover list filters and existing pagination bounds, stable pending-first ordering, detail shape, exact stored PDF headers/bytes, proof headers/bytes, multipart decision validation, retry JSON validation, and all role/scope combinations. Assert authentication and permission plus service preauthorization run before Multer; a foreign task request never calls upload storage. Missing/foreign task, PDF, and proof all return the same existing 404 envelope.

- [ ] **Step 3: Write estimator/Client compatibility RED tests**

Assert both low-value submit and high-value `send-client` use publication; high-value initial submit does not. Estimator read/mutation responses contain optional safe `clientReview`. For current new rounds, the existing Client PDF path serves stored bytes and stored filename; legacy rows generate live PDF with the same URL/authorization/not-found behavior. Client decision body/response remains unchanged, closes a current pending round without proof, and still decides a legacy Estimate without creating a round.

- [ ] **Step 4: Write Admin-project safe-summary RED tests**

Extend `EstimateSummaryRecord`/memory fixtures with safe round summaries only. Assert `AdminProjectSummary.estimate.clientReview` and `hasPendingClientResponseTask` appear for the scoped initiating Admin and Super Admin, remain null/false without a round, and contain no recipient, note, storage reference, filename, or proof metadata.

- [ ] **Step 5: Run the backend/parity RED group**

Run:

```bash
cd backend && npm test -- tests/estimate-client-response-routes.test.ts tests/estimate-pdf-routes.test.ts tests/leads.test.ts tests/full-journey.test.ts tests/admin-projects.test.ts
cd backend && npm test -- tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/auth-authorization.test.ts tests/frontend-authorization-contract.test.ts
cd frontend && npm test -- src/api/authorization-contract.test.ts
```

Expected: FAIL for missing routes, permissions, fixture layer, projection, and service wiring.

- [ ] **Step 6: Add the four permissions and six operation records atomically**

Use `2026-08-24.estimate-client-response.v1` in both auth snapshots. List/detail/PDF use task-read; proof uses proof-read; decision uses task-decide; retry uses email-retry. Use service-level actor/assignment/owner predicates for row scope; operation metadata supplies only coarse permission and audit context.

```ts
{ key: "GET /admin/estimate-client-response-tasks", permission: "estimation.client_response_tasks.read", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "read", superAdminBehavior: "global_read", availability: "estimate_client_response" },
{ key: "GET /admin/estimate-client-response-tasks/:roundId", permission: "estimation.client_response_tasks.read", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "read", superAdminBehavior: "global_read", availability: "estimate_client_response" },
{ key: "GET /admin/estimate-client-response-tasks/:roundId/pdf", permission: "estimation.client_response_tasks.read", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "read", superAdminBehavior: "global_read", availability: "estimate_client_response" },
{ key: "GET /admin/estimate-client-response-tasks/:roundId/proof", permission: "estimation.client_response_proof.read", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "read", superAdminBehavior: "global_read", availability: "estimate_client_response" },
{ key: "POST /admin/estimate-client-response-tasks/:roundId/decision", permission: "estimation.client_response_tasks.decide", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "estimate_client_response" },
{ key: "POST /estimates/:estimateId/client-email/retry", permission: "estimation.estimate_email.retry", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "personal", superAdminBehavior: "admin_override", availability: "estimate_client_response" },
```

- [ ] **Step 7: Implement strict schemas and thin route handlers**

```ts
const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "changes_requested"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

const adminDecisionSchema = z.object({
  decision: z.enum(["approve", "request_changes"]),
  note: z.string().trim().max(1_000).default(""),
  version: z.coerce.number().int().positive()
}).strict().superRefine((value, context) => {
  if (value.decision === "request_changes" && value.note.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "Explain the Client's requested changes." });
  }
});

const retrySchema = z.object({
  roundId: z.string().trim().min(1),
  version: z.number().int().positive()
}).strict();
```

Decision middleware order is authenticate → `requireOperation` → `requireDecisionScope` → strict `uploadSingleFile(... proof options ...)` → strict body parse → save proof → shared decision. On every failure after save, call `deleteQuietly`; on success, only immutable metadata remains.

- [ ] **Step 8: Integrate the existing Estimate router atomically**

Replace only low-value publication and ready-to-client send sequences with Task 6. Keep high-value pre-publication states. Replace the Client decision body with the Task 8 adapter while returning the same payload. Resolve stored-current-round Client PDF first and fall back to live generation only when no round exists. Attach safe current `clientReview` to estimator reads/mutation results.

```ts
const currentRound = await reviews.currentRoundForClientEstimate(
  req.authenticatedUser!,
  String(estimate._id)
);
if (currentRound) {
  const download = await reviews.readClientPdf(
    req.authenticatedUser!,
    currentRound.id
  );
  sendDownload(res, download);
  return;
}
const legacyPdf = await estimatePdf.generate(toEstimatePdfInput(estimate, lead));
sendDownload(res, legacyPdf);
```

- [ ] **Step 9: Wire services into `createApp` with safe test defaults**

Add `estimateMailer?: EstimateMailer` and `clientPortalUrl?: string` to `AppDependencies`. Construct review storage, review service, delivery service, publication service, and decision service once. Default to `{ deliveryKind: "disabled" }` and a credential-free local `/client` URL in tests. Mount the new router before the generic 404 and inject the publication/decision/review collaborators into `createEstimatesRouter`.

```ts
const reviewStorage = createEstimateClientReviewStorage(storage);
const reviews = createEstimateClientReviewService({ storage: reviewStorage });
const delivery = createEstimateDeliveryService({
  reviews,
  storage: reviewStorage,
  mailer: dependencies.estimateMailer ?? { deliveryKind: "disabled" },
  portalUrl: dependencies.clientPortalUrl ?? "http://localhost:5173/client",
  audit: auditService,
  now: clock
});
```

Construct publication and decision with those same instances; do not construct per-route storage or mail clients.

- [ ] **Step 10: Extend Admin project loaders without reference-bearing records**

```ts
export interface EstimateSummaryRecord {
  id: string;
  leadId: string;
  projectId: string | null;
  status: string;
  total: number;
  clientReview: EstimateClientReviewSummary | null;
}

export interface AdminProjectEstimateSummary {
  id: string;
  status: string;
  total: number;
  clientReview: EstimateClientReviewSummary | null;
  hasPendingClientResponseTask: boolean;
}
```

Mongo loads the latest round with an explicit safe projection. Memory state gains an optional safe round-summary collection defaulting to `[]` so route tests remain database-independent. `adminProjectSummary` accepts already-scoped safe values and never imports storage fields.

- [ ] **Step 11: Verify focused GREEN and cross-stack typechecks**

Run:

```bash
cd backend && npm test -- tests/estimate-client-response-routes.test.ts tests/estimate-pdf-routes.test.ts tests/leads.test.ts tests/full-journey.test.ts tests/admin-projects.test.ts
cd backend && npm test -- tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/auth-authorization.test.ts tests/frontend-authorization-contract.test.ts
cd backend && npm run typecheck
cd frontend && npm test -- src/api/authorization-contract.test.ts
cd frontend && npm run typecheck
```

Expected: PASS; prior Client contracts remain green and backend/frontend permission sets match exactly.

- [ ] **Step 12: Review and commit**

```bash
git diff --check
git add backend/src/routes/estimate-client-responses.ts backend/src/routes/estimates.ts backend/src/app.ts backend/src/domain/authorization.ts backend/src/domain/route-operations.ts backend/src/services/auth.service.ts backend/src/repositories/types.ts backend/src/repositories/admin-project-summary.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/tests/estimate-client-response-routes.test.ts backend/tests/fixtures/estimate-client-response-route-operations.ts backend/tests/estimate-pdf-routes.test.ts backend/tests/leads.test.ts backend/tests/full-journey.test.ts backend/tests/admin-projects.test.ts backend/tests/authorization-policy.test.ts backend/tests/route-operation-registry.test.ts backend/tests/auth-authorization.test.ts backend/tests/frontend-authorization-contract.test.ts frontend/src/api/authorization-contract.ts frontend/src/api/authorization-contract.test.ts
git diff --cached --check
git commit -m "feat: expose scoped estimate client responses"
```

### Task 10: Estimator Delivery State and Exact-Round Retry UI

**Files:**
- Create: `frontend/src/features/leads/EstimateDeliveryStatus.tsx`
- Create: `frontend/src/features/leads/EstimateDeliveryStatus.test.tsx`
- Create: `frontend/src/styles/estimate-delivery.css`
- Modify: `frontend/src/features/leads/leadsApi.ts`
- Modify: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- Modify: `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: Task 9 safe `EstimateClientReviewSummary`, retry endpoint, existing Estimate controls/query/refetch, Button and notice conventions.
- Produces: persisted four-state email presentation and exact `{ roundId, version }` retry without resubmitting the Estimate.

- [ ] **Step 1: Write API contract RED tests in the existing workspace suite**

Extend frontend Estimate types and mock handlers to expect:

```ts
export interface EstimateClientReviewSummary {
  id: string;
  sendGeneration: number;
  estimateVersion: number;
  version: number;
  deliveryStatus: "queued" | "sent" | "failed" | "disabled";
  deliveryAttemptCount: number;
  deliveredAt: string | null;
  status: "pending" | "approved" | "changes_requested";
}

export interface EstimateDraft extends EstimateDraftInput {
  // existing fields
  clientReview?: EstimateClientReviewSummary | null;
}
```

Assert `retryEstimateClientEmail("estimate-1", { roundId: "round-1", version: 3 })` posts exactly that JSON to `/estimates/estimate-1/client-email/retry`.

- [ ] **Step 2: Write four-state component RED tests**

Assert exact visible outcomes:

| Delivery status | Copy | Action |
|---|---|---|
| `sent` | `Email sent` and delivered timestamp | none |
| `failed` | `Email delivery failed` | `Retry email` |
| `disabled` | `Email unavailable` | `Retry email` |
| `queued` | `Email queued` | none |

Also assert retry busy/disabled copy, accessible status/alert announcements, and no Retry for a terminal review task.

- [ ] **Step 3: Write workspace publication/refetch/retry RED tests**

Cover low-value submit and high-value send with all delivery states. Prove the mutation result copy distinguishes Client portal success from email status, the immediate `GET /leads/:leadId/estimate` refetch retains `clientReview`, retry uses only the retry endpoint, and a 409 invalidates/refetches without replay. Assert Submit/Send request counts do not increase during retry.

- [ ] **Step 4: Run focused frontend tests and capture RED**

Run: `cd frontend && npm test -- src/features/leads/EstimateDeliveryStatus.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx`

Expected: FAIL because the summary type, retry function, component, and state-aware copy are absent.

- [ ] **Step 5: Add the API/query-key contract**

```ts
export const leadKeys = {
  // retain existing keys
  estimate: (leadId: string) => ["leads", leadId, "estimate"] as const
};

export const retryEstimateClientEmail = (
  estimateId: string,
  input: { roundId: string; version: number }
) => apiClient.post<EstimateClientReviewSummary>(
  `/estimates/${encodeURIComponent(estimateId)}/client-email/retry`,
  input
);
```

Use `leadKeys.estimate(leadId)` in the existing read query and every invalidation/refetch; do not create a second source of Estimate cache truth.

- [ ] **Step 6: Implement the focused status component**

```tsx
interface EstimateDeliveryStatusProps {
  review: EstimateClientReviewSummary;
  retrying: boolean;
  onRetry(): void;
}

export function EstimateDeliveryStatus({
  review,
  retrying,
  onRetry
}: EstimateDeliveryStatusProps) {
  const retryable = review.status === "pending" &&
    (review.deliveryStatus === "failed" || review.deliveryStatus === "disabled");
  // Render one StatusBadge/copy block and only the retryable Button.
}
```

Format the sent timestamp with an explicit locale/time-zone strategy consistent with the workspace tests. The component receives no submit/send callback.

- [ ] **Step 7: Integrate retry while retaining current control eligibility**

Keep Save, Submit, and Send predicates unchanged. After publication, set notice copy from returned delivery state and refetch the one Estimate query. Retry calls `retryEstimateClientEmail(saved.data.id, { roundId: review.id, version: review.version })`; success announces and refetches, while 409 announces stale state and refetches without automatic second mutation.

```ts
const retryEmail = useMutation({
  mutationFn: () => retryEstimateClientEmail(saved.data!.id, {
    roundId: saved.data!.clientReview!.id,
    version: saved.data!.clientReview!.version
  }),
  onSuccess: async () => {
    setNotice("Estimate email delivery updated.");
    await saved.refetch();
  },
  onError: async (error) => {
    if (error instanceof ApiError && error.status === 409) await saved.refetch();
  }
});
```

- [ ] **Step 8: Add isolated responsive/focus styles and import them**

Style `.estimate-delivery` with existing tokens, visible focus, wrapping status/action layout, and a single-column narrow-screen rule. Add `@media (prefers-reduced-motion: reduce)` only if the component adds motion. Import `./styles/estimate-delivery.css` in `main.tsx`.

- [ ] **Step 9: Verify focused GREEN and frontend typecheck**

Run:

```bash
cd frontend && npm test -- src/features/leads/EstimateDeliveryStatus.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
cd frontend && npm run typecheck
```

Expected: PASS with no duplicate Submit/Send requests.

- [ ] **Step 10: Review and commit**

```bash
git diff --check
git add frontend/src/features/leads/EstimateDeliveryStatus.tsx frontend/src/features/leads/EstimateDeliveryStatus.test.tsx frontend/src/features/leads/leadsApi.ts frontend/src/features/leads/LeadEstimateWorkspace.tsx frontend/src/features/leads/LeadEstimateWorkspace.test.tsx frontend/src/styles/estimate-delivery.css frontend/src/main.tsx
git diff --cached --check
git commit -m "feat: show and retry estimate email delivery"
```

### Task 11: Admin Client-Response Inbox, Detail, Proof Decision, and Project Link

**Files:**
- Create: `frontend/src/features/admin/estimateClientResponsesApi.ts`
- Create: `frontend/src/features/admin/estimateClientResponsesApi.test.ts`
- Create: `frontend/src/features/admin/ClientResponseInboxPage.tsx`
- Create: `frontend/src/features/admin/ClientResponseInboxPage.test.tsx`
- Create: `frontend/src/features/admin/ClientResponseTaskDetailPage.tsx`
- Create: `frontend/src/features/admin/ClientResponseTaskDetailPage.test.tsx`
- Create: `frontend/src/features/admin/ClientResponseDecisionDialog.tsx`
- Create: `frontend/src/features/admin/ClientResponseDecisionDialog.test.tsx`
- Create: `frontend/src/styles/client-responses.css`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/admin/AdminProjectDetailPage.tsx`
- Modify: `frontend/src/features/admin/AdminProjectDetailPage.test.tsx`
- Modify: `frontend/src/features/admin/adminProjectsApi.ts`
- Modify: `frontend/src/app/routePaths.ts`
- Modify: `frontend/src/app/routePaths.test.ts`
- Modify: `frontend/src/app/routeRegistry.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/router.test.tsx`
- Modify: `frontend/src/components/layout/navigation.test.tsx`
- Modify: `frontend/src/components/ui/PageHeader.tsx`
- Modify: `frontend/src/components/ui/PageHeader.test.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: Task 9 Admin APIs/permissions/project summary, generic API blob/progress helpers, TanStack Query, existing Dialog/Field/ProgressBar/DownloadButton/PageState patterns.
- Produces: two permission-gated routes, Client responses navigation, stable server-scoped inbox/detail, exact-PDF/proof downloads, accessible proof-required decision dialog, and Admin project task link.

- [ ] **Step 1: Define frontend safe DTOs and write API RED tests**

```ts
export interface EstimateClientResponseTaskListItem {
  id: string;
  version: number;
  sendGeneration: number;
  project: { id: string; name: string } | null;
  client: { name: string; email: string };
  estimate: { id: string; version: number; total: number };
  assignedAdmin: { id: string; name: string };
  deliveryStatus: EstimateClientReviewSummary["deliveryStatus"];
  deliveryAttemptCount: number;
  deliveryAttemptedAt: string | null;
  deliveredAt: string | null;
  status: EstimateClientReviewSummary["status"];
  decision: "approve" | "request_changes" | null;
  proofAvailable: boolean;
  createdAt: string;
}

export interface EstimateClientResponseTaskDetail
  extends EstimateClientResponseTaskListItem {
  estimateSnapshot: EstimateClientReviewSnapshot;
  pdf: { filename: string; mimeType: "application/pdf"; byteSize: number; sha256: string };
  decisionSource: "client_portal" | "admin_proof" | null;
  decisionNote: string | null;
  decidedAt: string | null;
}

export interface EstimateClientResponseDecisionResult {
  estimate: { id: string; status: string; version: number; projectId: string | null };
  clientReview: EstimateClientReviewSummary;
}
```

API tests assert encoded list/detail/PDF/proof paths, stable query order `status`, `limit`, `offset`, and exact FormData order/content: `decision`, optional trimmed `note`, decimal `version`, one `proof`.

- [ ] **Step 2: Write inbox/detail/navigation/router RED tests**

Register `/admin/client-responses` and `/admin/client-responses/:roundId` with `estimation.client_response_tasks.read`, presentation roles Admin/Super Admin, and navigation only on the list route. Assert other roles never see the link or render the pages. Add traversal-safe `safeReturnPath` cases so authenticated Admin/Super Admin may return to either new path after login while every other role and encoded traversal remain rejected. Inbox tests cover loading/error/empty, `aria-busy`, pending/approved/changes-requested history filters, stable pagination, statuses, timestamps, and detail links. Detail tests cover immutable line items/totals, PDF/proof controls, pending actions, read-only terminal tasks, 404, and task-scoped download errors.

- [ ] **Step 3: Write proof dialog RED tests**

Cover Approve and Reject, missing proof, disallowed client-selected file type, missing/over-1000 rejection reason, first-invalid-control focus, exact multipart body, progress semantics, disabled controls while sending, 409 invalidate/refetch without replay, success announcement, close, and focus to the page heading. The browser-side MIME/extension check is advisory; server validation remains authoritative.

- [ ] **Step 4: Write Admin project summary RED tests**

Assert a current pending review renders Client response state and a link to its round, terminal state renders read-only status, no round renders no section/action, and existing negative assertions still prove no Estimate edit or Client impersonation controls.

- [ ] **Step 5: Run the focused RED group**

Run:

```bash
cd frontend && npm test -- src/features/admin/estimateClientResponsesApi.test.ts src/features/admin/ClientResponseInboxPage.test.tsx src/features/admin/ClientResponseTaskDetailPage.test.tsx src/features/admin/ClientResponseDecisionDialog.test.tsx
cd frontend && npm test -- src/features/admin/AdminProjectDetailPage.test.tsx src/app/routePaths.test.ts src/app/router.test.tsx src/components/layout/navigation.test.tsx src/components/ui/PageHeader.test.tsx
```

Expected: FAIL because Admin DTOs, API/page/dialog files, routes, navigation, and heading focus support are absent.

- [ ] **Step 6: Implement deterministic API/query keys**

```ts
export const estimateClientResponseKeys = {
  all: ["estimate-client-responses"] as const,
  list: (
    status: "pending" | "approved" | "changes_requested" | undefined,
    pagination: PaginationInput
  ) => ["estimate-client-responses", "list", status ?? "all", pagination] as const,
  detail: (roundId: string) =>
    ["estimate-client-responses", "detail", roundId] as const
};

export function decideEstimateClientResponse(
  roundId: string,
  input: { decision: "approve" | "request_changes"; note: string; version: number; proof: File },
  onProgress: (percent: number) => void
): Promise<EstimateClientResponseDecisionResult> {
  const body = new FormData();
  body.append("decision", input.decision);
  if (input.note.trim()) body.append("note", input.note.trim());
  body.append("version", String(input.version));
  body.append("proof", input.proof, input.proof.name);
  return apiClient.postMultipartWithProgress(
    `/admin/estimate-client-response-tasks/${encodeURIComponent(roundId)}/decision`,
    body,
    onProgress
  );
}
```

Use `apiClient.getBlob` for both task PDF and proof so filename/error behavior remains centralized.

- [ ] **Step 7: Implement the server-scoped inbox and immutable detail**

Follow `AccessRequestInboxPage` for `keepPreviousData`, stale-row comparison by ID/version/status, table containment, and pagination. Expose filters `Pending`, `Approved history`, `Changes requested history`, and `All`; each maps directly to the exact server `status` query, so no post-pagination client filtering occurs. Detail renders `estimateSnapshot` data only and gates action buttons with `hasFrontendPermission(..., "estimation.client_response_tasks.decide")` plus pending status.

```ts
const taskQuery = useQuery({
  queryKey: estimateClientResponseKeys.list(status, pagination),
  queryFn: () => getEstimateClientResponses(status, pagination),
  placeholderData: keepPreviousData
});
const currentTask = taskQuery.data?.items.find(
  (item) => item.id === selectedTask?.id
);
const selectionIsCurrent = currentTask?.status === "pending" &&
  currentTask.version === selectedTask?.version;
```

- [ ] **Step 8: Implement proof-required decision behavior**

Use `Dialog`, `Field`, `ProgressBar`, and `useFeedback`. The visible choices are **Approve** and **Reject**; Reject sends `decision: "request_changes"`. Keep separate field errors for proof and reason; focus the first invalid control. On 409, keep the dialog open, invalidate list/detail, announce that the task changed, and never replay. On success, invalidate list/detail/Admin project queries, close once, announce, then focus the connected detail/inbox heading.

```ts
const mutation = useMutation({
  mutationFn: () => decideEstimateClientResponse(
    task.id,
    { decision, note, version: task.version, proof: proof! },
    setProgress
  ),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: estimateClientResponseKeys.all });
    feedback.announce("Client response recorded.");
    onSaved();
  },
  onError: async (error) => {
    if (error instanceof ApiError && error.status === 409) {
      await queryClient.invalidateQueries({ queryKey: estimateClientResponseKeys.all });
    }
  }
});
```

- [ ] **Step 9: Add narrowly reusable PageHeader focus support**

```tsx
export interface PageHeaderProps {
  // existing props
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
}

<h1
  ref={headingRef}
  className="ui-page-header__title"
  id={id}
  tabIndex={headingTabIndex}
>
  {title}
</h1>
```

Default output remains unchanged when props are omitted. Client-response pages pass `headingTabIndex={-1}` and the ref used after successful decision.

- [ ] **Step 10: Mount registry/router/navigation and project summary**

Use a `MailCheck`-class Lucide icon and label `Client responses`. Add both registered elements through `registeredElement`; do not create any Client route. Extend `safeReturnPath` with an exact Admin/Super-Admin-only `/admin/client-responses` prefix after the existing traversal/origin checks; do not broaden it to arbitrary `/admin` paths. Extend `AdminProjectSummary.estimate` with Task 9's safe summary/pending boolean and link only when `clientReview` is non-null and assigned work is visible.

```ts
const canReturnToClientResponses =
  (role === "admin" || role === "super_admin") &&
  (parsed.pathname === "/admin/client-responses" ||
    parsed.pathname.startsWith("/admin/client-responses/"));
```

Accept the candidate when it matches the existing role-home boundary or this exact additional boundary.

- [ ] **Step 11: Add responsive/accessibility styles and import them**

Style focus-visible states, scroll-contained table, status layout, immutable totals, file input, progress, and narrow-screen dialog/detail. Ensure controls meet existing minimum target sizing and reduced-motion rules. Import `./styles/client-responses.css` in `main.tsx`.

- [ ] **Step 12: Verify focused GREEN and frontend typecheck**

Run:

```bash
cd frontend && npm test -- src/features/admin/estimateClientResponsesApi.test.ts src/features/admin/ClientResponseInboxPage.test.tsx src/features/admin/ClientResponseTaskDetailPage.test.tsx src/features/admin/ClientResponseDecisionDialog.test.tsx
cd frontend && npm test -- src/features/admin/AdminProjectDetailPage.test.tsx src/app/routePaths.test.ts src/app/router.test.tsx src/components/layout/navigation.test.tsx src/components/ui/PageHeader.test.tsx
cd frontend && npm run typecheck
```

Expected: PASS with exact permission gating, stale refresh, progress, and focus behavior.

- [ ] **Step 13: Review and commit**

```bash
git diff --check
git add frontend/src/features/admin/estimateClientResponsesApi.ts frontend/src/features/admin/estimateClientResponsesApi.test.ts frontend/src/features/admin/ClientResponseInboxPage.tsx frontend/src/features/admin/ClientResponseInboxPage.test.tsx frontend/src/features/admin/ClientResponseTaskDetailPage.tsx frontend/src/features/admin/ClientResponseTaskDetailPage.test.tsx frontend/src/features/admin/ClientResponseDecisionDialog.tsx frontend/src/features/admin/ClientResponseDecisionDialog.test.tsx frontend/src/styles/client-responses.css frontend/src/api/types.ts frontend/src/features/admin/AdminProjectDetailPage.tsx frontend/src/features/admin/AdminProjectDetailPage.test.tsx frontend/src/features/admin/adminProjectsApi.ts frontend/src/app/routePaths.ts frontend/src/app/routePaths.test.ts frontend/src/app/routeRegistry.ts frontend/src/app/router.tsx frontend/src/app/router.test.tsx frontend/src/components/layout/navigation.test.tsx frontend/src/components/ui/PageHeader.tsx frontend/src/components/ui/PageHeader.test.tsx frontend/src/main.tsx
git diff --cached --check
git commit -m "feat: add Admin client response tasks"
```

### Task 12: Real Mongo Publication, Retry, and Decision Races

**Files:**
- Create: `backend/tests/estimate-publication-mongo.replica-set.test.ts`
- Create: `backend/tests/estimate-client-decision-mongo.replica-set.test.ts`
- Modify if a RED race proves necessary: `backend/src/services/estimate-publication.service.ts`
- Modify if a RED race proves necessary: `backend/src/services/estimate-delivery.service.ts`
- Modify if a RED race proves necessary: `backend/src/services/estimate-decision.service.ts`
- Modify if a RED cleanup case proves necessary: `backend/src/services/estimate-client-review-storage.ts`

**Interfaces:**
- Consumes: complete backend service/API behavior from Tasks 1–9 and the existing replica-set helper.
- Produces: executable proof of exactly-once publication/delivery/decision, stale-CAS no-ops, grant rechecks, and orphan cleanup under real transactions.

- [ ] **Step 1: Write a deterministic publication race harness**

Use `startReplicaSet`, unique fixture IDs, injected gated mailer/storage/audit collaborators, and explicit promises rather than sleeps:

```ts
const results = await Promise.allSettled([
  publication.publishEstimateToClient(input),
  publication.publishEstimateToClient(input)
]);
expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
expect(await EstimateClientReviewRoundModel.countDocuments({ estimateId })).toBe(1);
expect(sentAttachments).toHaveLength(1);
```

Also assert one persisted snapshot, one deleted loser snapshot, one compatibility notification, one semantic Estimate review, one task assignment, and one publication audit pair.

- [ ] **Step 2: Add high-value/stale-publication and revised-generation cases**

Race approved `send-client` against a stale status/version and prove one transition. Then complete request-changes → edit/save version increment → republish and assert generation `2`, a different hash/PDF, and immutable generation `1` metadata/bytes.

- [ ] **Step 3: Add retry acquisition/completion races**

Gate mail send after lease acquisition. Start two retries and assert one SMTP call/attempt generation. Resolve the review while delivery is in flight and assert only the exact completion generation may update telemetry. Complete an older attempt after a newer generation and assert a full no-op including no delivery audit.

- [ ] **Step 4: Add Client-vs-Admin and Admin-vs-Admin decision races**

Use `Promise.allSettled` for:

- Client approve vs Admin approve;
- Client request changes vs Admin request changes;
- two Admin approvals with distinct proof objects;
- two Admin request-changes decisions;
- stale task version after a revised generation.

For each, assert one terminal round result, one Estimate/design-lifecycle transition, one source-specific semantic audit set, zero-or-one committed proof according to winning source, and deletion of every losing stored proof.

- [ ] **Step 5: Add authorization-state and transactional-cleanup races**

Revoke the initiator grant and separately deactivate the Admin after page read but before decision; regular Admin must lose access while Super Admin may still decide. Inject publication/decision audit failure after snapshot/proof save and assert transaction rollback plus storage deletion and no SMTP call.

- [ ] **Step 6: Run both suites and capture RED**

Run:

```bash
cd backend && npm test -- tests/estimate-publication-mongo.replica-set.test.ts
cd backend && npm test -- tests/estimate-client-decision-mongo.replica-set.test.ts
```

Expected: any non-atomic query, missing generation predicate, stale audit write, or cleanup gap fails with an exact count/hash/reference assertion.

- [ ] **Step 7: Tighten only the failed compare-and-set filters**

Publication predicates must include Estimate ID/owner/status/version plus unique dedupe/generation. Delivery completion must include round ID, `deliveryStatus: "queued"`, and exact `deliveryAttemptGeneration`. Decision must include round ID/status/version and Estimate ID/status/version/design-lifecycle/frozen state. Do not add retry loops that can replay semantic work; map known transaction/duplicate conflicts to safe 409 or identical-dedupe current state only.

```ts
const roundDecisionFilter = {
  _id: roundId,
  status: "pending",
  version: expectedRoundVersion
};
const estimateDecisionFilter = {
  _id: estimateId,
  status: "sent_to_client",
  version: expectedEstimateVersion,
  designLifecycleVersion: expectedDesignLifecycleVersion,
  designFrozenAt: null
};
```

Both filters must match in the same transaction before proof metadata or terminal audits are created.

- [ ] **Step 8: Rerun focused races and adjacent unit suites**

Run:

```bash
cd backend && npm test -- tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-client-decision-mongo.replica-set.test.ts
cd backend && npm test -- tests/estimate-publication.test.ts tests/estimate-delivery.test.ts tests/estimate-client-decision.test.ts tests/estimate-client-response-routes.test.ts
cd backend && npm run typecheck
```

Expected: PASS repeatedly with exact counts and cleanup.

- [ ] **Step 9: Review and commit**

```bash
git diff --check
git add backend/tests/estimate-publication-mongo.replica-set.test.ts backend/tests/estimate-client-decision-mongo.replica-set.test.ts backend/src/services/estimate-publication.service.ts backend/src/services/estimate-delivery.service.ts backend/src/services/estimate-decision.service.ts backend/src/services/estimate-client-review-storage.ts
git diff --cached --check
git commit -m "test: prove estimate client response races"
```

If no production file changed, stage only the two test files; never create empty mechanical edits.

### Task 13: Client Compatibility and Cross-Feature Accessibility Gate

**Files:**
- Modify: `frontend/src/test/accessibility.test.tsx`
- Modify: `frontend/src/app/router.test.tsx`
- Test unchanged: `frontend/src/features/client/ClientDashboard.test.tsx`
- Test unchanged: `frontend/src/features/client/ClientDashboard.collapsible.test.tsx`
- Test unchanged: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`
- Test unchanged: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx`
- Test unchanged: `frontend/src/features/estimates/ClientPlanPageReview.test.tsx`
- Test unchanged: `frontend/src/features/estimates/ClientFullPlanNav.test.tsx`
- Test unchanged: `frontend/src/features/estimates/estimateDrawingJourney.test.tsx`
- Test unchanged: `backend/tests/estimate-pdf-routes.test.ts`
- Test unchanged: `backend/tests/full-journey.test.ts`
- Modify only if a focused accessibility assertion fails: `frontend/src/styles/client-responses.css`
- Modify only if a focused accessibility assertion fails: `frontend/src/styles/estimate-delivery.css`
- Modify only if a focused accessibility assertion fails: Task 10–11 frontend components.

**Interfaces:**
- Consumes: complete frontend feature from Tasks 10–11 and unchanged Client production components/routes.
- Produces: regression evidence that the additive Admin/Estimator work did not alter Client visibility/actions and that new pages/dialog/status UI meets existing accessibility standards.

- [ ] **Step 1: Add route-registry preservation assertions**

Assert the registry grows only by the two Admin paths, the existing `/client` and `/client/projects/:projectId` entries remain byte-for-byte equivalent in permission/presentation/navigation metadata, and no new Client route or Admin proof/task permission appears for Client.

- [ ] **Step 2: Add integrated axe and keyboard tests**

Render Admin inbox, detail, decision dialog, and Estimator delivery status inside existing providers. Run axe on loading, populated, terminal, validation-error, and narrow-container states. Exercise Tab/Shift+Tab containment, Escape/return focus, first-invalid focus, progress semantics, live announcements, successful heading focus, visible download error, and pending-to-terminal stale refresh.

- [ ] **Step 3: Run new accessibility tests and capture failures**

Run: `cd frontend && npm test -- src/test/accessibility.test.tsx src/app/router.test.tsx`

Expected: PASS if Tasks 10–11 reused primitives correctly; any failure names the missing label/focus/contrast/landmark behavior to fix.

- [ ] **Step 4: Run the Client suites unchanged**

Run:

```bash
cd frontend && npm test -- src/features/client/ClientDashboard.test.tsx src/features/client/ClientDashboard.collapsible.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/ClientPlanPageReview.test.tsx src/features/estimates/ClientFullPlanNav.test.tsx src/features/estimates/estimateDrawingJourney.test.tsx
cd backend && npm test -- tests/estimate-pdf-routes.test.ts tests/full-journey.test.ts
```

Expected: PASS without editing Client production files. New rounds use stored PDF bytes; legacy estimates retain live generation; the same three Client statuses and existing decision/drawing/plan paths remain.

- [ ] **Step 5: Fix only demonstrated accessibility defects and rerun**

For each failure, add the narrow missing label/ref/style in the Task 10–11 component, then rerun the exact failing test followed by the two commands from Steps 3–4. Do not restructure `ClientDashboard`, `EstimateReviewPanel`, `estimateWorkflowApi`, or Client route entries.

- [ ] **Step 6: Verify frontend typecheck and production build**

Run:

```bash
cd frontend && npm run typecheck
cd frontend && npm run build
```

Expected: PASS; only the known non-blocking bundle-size warning may remain.

- [ ] **Step 7: Review and commit**

```bash
git diff --check
git add frontend/src/test/accessibility.test.tsx frontend/src/app/router.test.tsx frontend/src/styles/client-responses.css frontend/src/styles/estimate-delivery.css frontend/src/features/admin/ClientResponseInboxPage.tsx frontend/src/features/admin/ClientResponseTaskDetailPage.tsx frontend/src/features/admin/ClientResponseDecisionDialog.tsx frontend/src/features/leads/EstimateDeliveryStatus.tsx frontend/src/features/leads/LeadEstimateWorkspace.tsx
git diff --cached --check
git commit -m "test: preserve client estimate accessibility"
```

Stage only files that actually changed; unchanged Client production files must not appear in this commit.

### Task 14: Startup Indexes, Production Wiring, Documentation, Security Scans, and Final Gates

**Files:**
- Create: `backend/src/models/application-indexes.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/tests/server.test.ts`
- Modify: `backend/.env.example`
- Modify: `backend/README.md`
- Modify: `README.md`
- Modify only for verified final defects: files owned by Tasks 1–13.

**Interfaces:**
- Consumes: shared `MailDeliveryConfig`, invitation/estimate mailer factories, app dependencies, both new models, all focused suites.
- Produces: fail-closed pre-listen index initialization, real production mailer/storage/portal wiring, operator documentation, leak-scan evidence, sequential full-suite/build evidence, and independent review sign-off.

- [ ] **Step 1: Write pre-listen index and mailer-wiring RED tests**

Update the server dependency seam and assert exact order:

```ts
export interface ServerDependencies {
  // existing seams
  prepareApplicationIndexes?: () => Promise<void>;
}
```

Tests must prove connect → optional database preparation → application indexes → repository/app factory → listen. An index failure disconnects and never constructs/listens. Complete SMTP creates both external invitation and estimate mailers from one config and passes a `/client` portal URL; absent SMTP passes both disabled boundaries. No secret appears in captured app configuration or errors.

- [ ] **Step 2: Run focused startup tests and capture RED**

Run: `cd backend && npm test -- tests/server.test.ts tests/config.test.ts`

Expected: FAIL because application-index preparation and the real EstimateMailer injection are not wired.

- [ ] **Step 3: Implement one application index initializer**

```ts
export async function initializeApplicationIndexes(): Promise<void> {
  await UserModel.init();
  await UserInvitationModel.init();
  await prepareEstimateClientReviewIndexes();
}
```

Call it after Mongo connects and before repository/app/listen. Do not use `syncIndexes()` and do not synthesize historical rounds.

- [ ] **Step 4: Wire both real mailers and one storage instance**

```ts
const mailConfigured = env.mailDelivery.kind === "smtp";
const invitationMailer = mailConfigured
  ? createSmtpInvitationMailer(env.mailDelivery)
  : { deliveryKind: "disabled" as const };
const estimateMailer = mailConfigured
  ? createSmtpEstimateMailer(env.mailDelivery)
  : { deliveryKind: "disabled" as const };
const clientPortalUrl = mailConfigured
  ? new URL("/client", env.mailDelivery.publicFrontendUrl).toString()
  : "http://localhost:5173/client";
const storage = createLocalStorage(env.UPLOADS_DIR);
```

Pass `storage`, `estimateMailer`, `clientPortalUrl`, and existing invitation mailer into `createApp`. Disabled mail is never treated as an HTTP publication failure.

- [ ] **Step 5: Verify startup GREEN and backend typecheck**

Run:

```bash
cd backend && npm test -- tests/server.test.ts tests/config.test.ts
cd backend && npm run typecheck
```

Expected: PASS with index failure occurring before bind and both mailers sharing the secure config.

- [ ] **Step 6: Update operator documentation with exact behavior**

Document all of the following in `.env.example`, backend README, and root README:

- `SMTP_FROM` is the general Lisno sender for staff invitations and Estimate attachments.
- The existing complete SMTP variable group remains all-or-nothing; certificate verification cannot be disabled.
- Publication succeeds into the Client portal when SMTP is disabled/failed, records safe delivery state, and supports explicit owner/Super-Admin retry of the same PDF.
- The initiating active Admin receives the response task; otherwise the sole active Super Admin does.
- Admin approve/reject requires one PDF/JPEG/PNG/WebP proof; Reject means request changes.
- Client Dashboard/PDF/Approve/Request changes/drawing/plan behavior remains; no historical backfill occurs.
- Remote production requires HTTPS for the frontend origin and API; the portal link carries no token, email, Estimate ID, or credential.

- [ ] **Step 7: Commit startup and documentation**

```bash
git diff --check
git add backend/src/models/application-indexes.ts backend/src/server.ts backend/tests/server.test.ts backend/.env.example backend/README.md README.md
git diff --cached --check
git commit -m "docs: wire estimate response delivery operations"
```

- [ ] **Step 8: Run focused feature suites in dependency order**

Run:

```bash
cd backend && npm test -- tests/estimate-pdf.test.ts tests/estimate-client-review-models.test.ts tests/estimate-client-review-storage.test.ts tests/estimate-mailer.test.ts tests/estimate-client-review-service.test.ts tests/estimate-publication.test.ts tests/estimate-delivery.test.ts tests/estimate-client-decision.test.ts tests/estimate-client-response-routes.test.ts
cd backend && npm test -- tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-client-decision-mongo.replica-set.test.ts
cd frontend && npm test -- src/features/leads/EstimateDeliveryStatus.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/admin/estimateClientResponsesApi.test.ts src/features/admin/ClientResponseInboxPage.test.tsx src/features/admin/ClientResponseTaskDetailPage.test.tsx src/features/admin/ClientResponseDecisionDialog.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx src/test/accessibility.test.tsx
```

Expected: every focused suite passes.

- [ ] **Step 9: Run static secrecy and forbidden-change scans**

Run each command separately:

```bash
rg -n "pdfStorageReference|storageReference|attachment\.bytes|proof\.data|provider(Message|Response)|SMTP_PASSWORD" backend/src/routes backend/src/contracts frontend/src
rg -n "client_response_tasks|client_response_proof|estimate_email" frontend/src/features/client frontend/src/features/estimates/EstimateReviewPanel.tsx
rg -n "syncIndexes\(" backend/src/models/EstimateClientReviewRound.ts backend/src/models/EstimateClientResponseProof.ts backend/src/models/application-indexes.ts backend/src/services/estimate-client-review.service.ts backend/src/services/estimate-publication.service.ts backend/src/services/estimate-delivery.service.ts backend/src/services/estimate-decision.service.ts
rg -n "client_rejected|lead_lost|mailbox polling|proof replacement" backend/src/routes/estimate-client-responses.ts backend/src/services/estimate-publication.service.ts backend/src/services/estimate-delivery.service.ts backend/src/services/estimate-decision.service.ts frontend/src/features/admin/ClientResponseInboxPage.tsx frontend/src/features/admin/ClientResponseTaskDetailPage.tsx frontend/src/features/admin/ClientResponseDecisionDialog.tsx
```

Expected: no matches. Persistence/storage services and model files are intentionally outside the first scan; `createIndexes`/`.init()` are allowed, `syncIndexes()` is not.

- [ ] **Step 10: Run production type/build/PDF gates**

Run sequentially:

```bash
cd backend && npm run typecheck
cd backend && npm run build
cd backend && npm run verify:estimate-pdf-build
cd frontend && npm run typecheck
cd frontend && npm run build
```

Expected: PASS. Existing informational Mongoose deprecation and Vite chunk-size warnings may remain only if unchanged; no new warning is accepted without review.

- [ ] **Step 11: Run both full suites sequentially**

Run:

```bash
cd backend && npm test
cd frontend && npm test
```

Expected: all tests pass; do not run the suites concurrently because they share process/database resources.

- [ ] **Step 12: Request three independent read-only reviews**

Use `superpowers:requesting-code-review`. Give one reviewer backend publication/delivery/storage/security, one reviewer frontend/Admin/Estimator/Client compatibility/accessibility, and one reviewer the full branch against the approved spec. Require findings to cite exact files/lines and classify blocking vs non-blocking. Reviewers do not edit or use Git.

- [ ] **Step 13: Resolve every blocking finding with focused RED/GREEN**

For each validated finding, first add the smallest failing focused test in the owning task's suite, run it to capture RED, implement the narrow fix, rerun that focused suite, then rerun typecheck and any affected race/Client/accessibility suite. Commit fixes by concern; do not combine unrelated review changes.

- [ ] **Step 14: Repeat final evidence after review fixes**

Repeat Steps 9–11 from the final commit. Record final backend/frontend test counts, build results, PDF verification, static scan results, and accepted unchanged warnings in the handoff.

- [ ] **Step 15: Verify local-only branch state**

Run:

```bash
git status --short
git log -5 --oneline
git diff --check
```

Expected: clean tracked worktree, commits only on `feature/phase1_module1`, and no push/merge. Leave all commits local for the user to merge later.
