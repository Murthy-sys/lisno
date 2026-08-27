# Free Render Preview Deployment Design

## Goal

Provide a zero-cost Render configuration for temporarily previewing Lisno from the
Git-backed `feature/phase1_module1` branch while keeping MongoDB Atlas as the one
runtime database.

This configuration is a preview/demo environment only. It must not be presented as
production-ready and must not be used for irreplaceable project documents, bills,
receipts, design files, or customer communication.

## Current behavior and evidence

- The root `render.yaml` currently provisions:
  - `lisno-api` as a paid `starter` Node web service;
  - `lisno-ocr-worker` as a paid `starter` Python background worker;
  - `lisno-frontend` as a static site;
  - a 10 GB persistent disk mounted at `/var/data` for API uploads.
- The backend reads exactly one `MONGODB_URI` and connects Mongoose to that target.
  MongoDB Atlas therefore remains the runtime source of truth regardless of the
  Render compute plan.
- The API stores uploaded documents and images in local filesystem storage through
  `createLocalStorage(env.UPLOADS_DIR)`. The Mongo records retain opaque references,
  but the referenced bytes are stored on disk.
- Render Free supports web services and static sites, but not background workers.
- Render Free web services cannot attach persistent disks. Their filesystem is
  ephemeral and is cleared on redeploy, restart, or idle spin-down.
- Render Free web services spin down after 15 minutes without inbound traffic and
  can take about one minute to wake.
- Render Free web services cannot send outbound traffic on SMTP ports 25, 465, or
  587. The existing SMTP invitation/publication flow therefore cannot be assumed to
  work on a Free API service.

## Recommended approach

Create a clearly labeled **free preview** Blueprint configuration:

1. Change `lisno-api` from `starter` to `free`.
2. Remove the API persistent disk declaration because Free services cannot attach
   one.
3. Point `UPLOADS_DIR` at an explicitly ephemeral directory so its preview-only
   behavior is visible in configuration.
4. Omit `lisno-ocr-worker` from the free Blueprint because Render has no Free
   background-worker instance type.
5. Keep `lisno-frontend` as a free static site.
6. Keep the single Atlas `MONGODB_URI` secret and all other credentials in Render;
   no secret value enters Git.
7. Document the preview limitations next to the Blueprint so a future production
   deployment does not accidentally inherit them.

This is the smallest configuration that honors the immediate zero-cost request. It
does not try to disguise a background worker as a web service or claim ephemeral
uploads are durable.

## Alternatives and tradeoffs

### A. Free preview without OCR or durable uploads — recommended now

- Render cost: zero, subject to Render monthly included usage limits.
- API and frontend can be evaluated for ordinary navigation and database-backed
  workflows.
- OCR jobs are not processed by Render.
- Uploaded file bytes can disappear while their Mongo metadata remains, so only
  disposable test uploads are allowed.
- Invitation and publication email cannot be relied on through SMTP ports blocked
  by Render Free.

### B. Keep the current paid Render architecture

- Keeps the background worker, persistent uploads, and current topology.
- Appropriate for real projects and retained receipts/documents.
- Requires paid API compute, a paid worker, and persistent disk charges.

### C. Free API with external object storage and redesigned background processing

- Can make uploaded files durable without a Render disk.
- Still requires a supported execution platform for OCR and an email provider/API
  compatible with Free-service networking.
- Requires a separate cross-stack storage/worker/email design, implementation,
  security review, and migration plan; it is not part of this immediate change.

## Scope

- Adjust the Render Blueprint for a zero-cost preview deployment.
- Keep MongoDB Atlas as the sole runtime database.
- Preserve generated secrets and `sync: false` secret placeholders.
- Add operator-facing documentation explaining free-tier limitations and how to
  restore the paid topology.
- Validate the Blueprint structure and review the final diff.

## Non-goals

- Deploying or provisioning anything in the Render workspace.
- Mutating Atlas data, copying staff accounts, seeding, or running migrations.
- Making local filesystem uploads durable on Render Free.
- Running OCR continuously on Render Free.
- Making SMTP email work from Render Free.
- Replacing local storage with S3, Cloudflare R2, GridFS, or another object store.
- Deleting the paid topology or any existing Render resource.
- Changing application APIs, persistence schemas, authorization, finance logic, or
  user-facing procurement behavior.

## Requirements

### Deployment configuration

- `lisno-api` uses a Blueprint instance type accepted by Render Free.
- `lisno-api` has no persistent disk declaration.
- The configured upload directory is explicitly described as ephemeral.
- `lisno-ocr-worker` is not provisioned by the free Blueprint.
- `lisno-frontend` remains a static site.
- `MONGODB_URI`, `CORS_ORIGIN`, and `VITE_API_URL` remain externally supplied where
  currently required.
- No credential or private URL is committed.

### Operator clarity

- Configuration comments or deployment documentation state that:
  - files are disposable and may be lost;
  - OCR is unavailable unless a worker is run elsewhere;
  - SMTP delivery is unavailable/unreliable on the blocked Free ports;
  - cold starts and monthly Free-instance-hour limits apply;
  - the paid topology must be restored before using real project documents.

### Rollback

- Restoring the previous topology is a Git revert of the bounded Blueprint and
  documentation changes, followed by an explicitly authorized Render Blueprint
  sync.
- A rollback does not recover file bytes previously lost from an ephemeral Free
  instance.

## Assumptions

- “Use free Render instances now” means a non-production preview is acceptable.
- The Atlas cluster and intended permanent database remain external to Render.
- The active Git deployment branch is `feature/phase1_module1`.
- The user will not upload irreplaceable or sensitive documents to this preview.
- No Render resources currently exist in the selected workspace, based on the
  user’s dashboard report.

## Constraints and risks

- File metadata can outlive ephemeral file bytes, producing missing-document errors
  after a restart, redeploy, or spin-down.
- Procurement receipt images and supporting documents are therefore not durable in
  this preview.
- Pending OCR jobs will remain unprocessed without a separately operated worker.
- Staff invitation creation requires mail preflight; with mail unavailable, the
  established invariant is no invitation/token/audit/email write.
- Cold starts can make the first request appear slow or temporarily unavailable.
- One Free API can consume the workspace’s monthly Free instance-hour allocation;
  exhaustion can suspend it for the rest of the month.
- Render may suspend Free services for unusually high service-initiated traffic,
  including external database or object-storage traffic.
- Deployment remains an external production-like action and requires exact approval
  immediately before clicking **Deploy Blueprint**.

## Data, API, UX, and operational impact

- **Data:** MongoDB records remain in Atlas. File bytes do not gain equivalent
  durability and may disappear independently of their metadata.
- **API:** No endpoint contract changes are planned. Upload endpoints remain usable
  only for disposable preview data.
- **UX:** Cold starts and missing OCR processing are visible limitations. No UI
  redesign is included.
- **Email:** SMTP delivery must be considered disabled on the Free deployment unless
  a separately approved compatible delivery mechanism is introduced.
- **Operations:** Health verification must cover the API health endpoint and a
  database-backed read. Upload/OCR/email workflows must be marked unsupported rather
  than treated as passing production acceptance.

## Acceptance criteria

1. The Blueprint contains only Render service types that can be deployed at zero
   instance cost: one Free Node web service and one static site.
2. No persistent disk is requested by the Free API service.
3. The API still accepts one externally supplied Atlas `MONGODB_URI` and does not
   introduce a second database.
4. The free Blueprint does not provision a background worker.
5. No secret, token, credential, private URL, or personal data is added to the
   repository.
6. Operator documentation plainly states the loss-of-files, no-OCR, SMTP, cold-start,
   and usage-limit constraints.
7. Blueprint validation and `git diff --check` pass locally.
8. No Render deployment, Atlas mutation, seed, migration, commit, or push is performed
   as part of the local implementation.

## Open decisions

- Before this preview is used for real project work, choose either:
  - restore the paid API disk and paid OCR worker; or
  - approve a separate durable object-storage, background-processing, and email
    delivery design.
- Exact Render deployment remains a later authority gate after the local Blueprint
  diff and validation results are reviewed.

