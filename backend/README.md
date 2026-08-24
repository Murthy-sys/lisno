# Lisno backend

See [Full-plan design review](../docs/estimate-full-plan-review.md) for the synchronized client/staff plan workflow, recovery, and demo checklist.

The backend owns estimate authorization, immutable design artifacts, OCR job
leases, drawing/revision state, client decisions, and final project creation.
MongoDB must run as a replica set because upload publication, drawing review,
replacement, and final estimate approval use transactions.

## Estimate drawing configuration

Copy `.env.example` to `.env` and configure:

- `MONGODB_URI` for a transaction-capable replica set;
- `JWT_SECRET` with an application secret of at least 32 characters;
- `UPLOADS_DIR` and `MAX_UPLOAD_MB` (default 25);
- `OCR_WORKER_TOKEN`, shared only with the Python worker and never exposed to
  browser code;
- `OCR_LEASE_SECONDS` (default 300) and `OCR_CONFIDENCE_FLOOR` (default 0.2).
- `OCR_MAX_ATTEMPTS` (default 5), `OCR_RETRY_INITIAL_SECONDS` (default 30),
  and `OCR_RETRY_MAX_SECONDS` (default 900) use seconds. The maximum delay
  must not be below the initial delay. Queued retries are eligible only at
  `nextAttemptAt`, terminal jobs have no next attempt, and a manual retry
  resets a failed job for a new attempt.

The backend accepts PDF, PNG, JPEG/JPG, WebP, TIFF/TIF, and HEIC/HEIF estimate
uploads only when the claimed type matches the file signature. Stored originals,
normalized pages, crops, replacements, and annotation layers stay behind
authenticated endpoints.

## Operations

Start the API and worker together with `npm run dev`, or start the compiled API
with `npm start` and run `python -m lisno_ocr.worker` separately. Both processes
must use the same worker token.

Extraction failures retain the original upload. The estimator retry endpoint
resets only a failed upload/job pair; lease expiry permits safe reclaim, while
claim tokens and result IDs prevent stale or duplicate publication. Repeated
decode/OCR failures should fall back to manual estimator room, scope, title, and
crop correction rather than bypassing review.

Final client estimate approval rechecks that every active latest drawing
revision is approved in the same transaction that freezes the design lifecycle
and creates the project. Estimates with no drawings keep the existing approval
behavior.

See [the workflow runbook](../docs/estimate-design-image-review.md) and
[the worker README](../ocr-worker/README.md) for supported formats, native HEIF
requirements, processing limits, and verification commands.

## Mail delivery and Client response operations

### Shared SMTP configuration

Staff invitations and Estimate attachments use one complete configuration group:

- `PUBLIC_FRONTEND_URL`;
- `SMTP_HOST`;
- `SMTP_PORT`;
- `SMTP_TLS_MODE`, set to `implicit` or `starttls`;
- `SMTP_USERNAME`;
- `SMTP_PASSWORD`;
- `SMTP_FROM`, the general Lisno sender for staff invitations and Estimate
  attachments, containing one mailbox with an optional display name.

`SMTP_TLS_REJECT_UNAUTHORIZED` is separate and optional. Certificate
verification cannot be disabled: when supplied, its only accepted value is
`true`; omitting it keeps verification enabled, and `false` is rejected.

When every SMTP-related variable is absent, external mail delivery is disabled.
Staff invitation create and resend return
`503 INVITATION_DELIVERY_UNAVAILABLE` before any token, invitation, audit, or
email write. Estimate publication still succeeds into the Client portal and
records a safe delivery state. Supplying any SMTP-related variable without the
complete required group—including supplying
`SMTP_TLS_REJECT_UNAUTHORIZED` alone—fails environment loading before the
database connection or listener starts. A complete, valid group enables
external SMTP delivery with certificate verification and forbids opportunistic
plaintext fallback.

`PUBLIC_FRONTEND_URL` must be one credential-free HTTP or HTTPS origin with no
path, query, or fragment. Remote production requires HTTPS for both this
frontend origin and the API. Estimate email links lead to `/client` and carry no
token, email, Estimate ID, or other credential.

### Estimate publication and Client response

Publishing an Estimate succeeds into the Client portal even when SMTP is
disabled or delivery fails. The committed publication records a safe delivery
state and is not rolled back by external mail. The authorized Estimate owner or
a Super Admin can explicitly retry delivery of the same stored PDF; retry does
not regenerate the PDF or create a new review round, task, Estimate semantic
version, or send generation; it does update delivery attempt telemetry.

The Client-response task goes to the initiating active Admin. When there is no
such Admin, it goes to the sole active Super Admin. Admin Approve and Reject
both require exactly one PDF, JPEG, PNG, or WebP proof. Reject means Request
changes; it does not mark the lead lost.

The existing Client Dashboard, PDF, Approve, Request changes, drawing, and plan
behavior remains unchanged. Historical estimates are not backfilled and
continue through their established legacy behavior.

### Staff invitation workflow

Production starts with one Super Admin provisioned through a separately
reviewed operator process; the demo seed is not a production privileged-user
bootstrap. Only the current sole active Super Admin can list, create, resend,
or revoke staff invitations. Creation accepts exactly Name, Email, Role, and
Mobile, with no title. Client and Super Admin cannot be invited; every other
canonical staff and trade role is eligible.

Invitations expire after 24 hours and are single-use. Resending rotates the
token and supersedes the previous link, while revoking makes the current link
unavailable. Raw tokens and links are transient and fragment-only. Only a
SHA-256 token digest is persisted; never log a raw token or link or add one to
audit or email-provider metadata.

Acceptance creates one ordinary active standard User and does not install an
authenticated session. The accepted staff member signs in through the normal
login flow. Real accepted staff can use allowed remote frontend and backend
deployments. Reserved demo identities and JWTs remain local-only, and external
invitation delivery to reserved demos is blocked. Clients continue to use the
separate signup and project-linking flow and are never provisioned through
staff invitations.

## Local demo seed

The demo seed is a destructive local reset. Its URI comes from `backend/.env`
and must use a loopback `mongodb://` host and a database whose name exactly
matches `DEMO_SEED_DATABASE`. With the example `lisno_demo` configuration, run:

```bash
NODE_ENV=development ALLOW_DEMO_SEED=true DEMO_SEED_DATABASE=lisno_demo npm run seed
```

The command refuses production, missing or non-exact opt-in flags, remote/SRV
targets, production-like database names, and URI/database mismatches before it
connects or loads models. It clears the authorized demo-domain collections
before rebuilding deterministic fixtures. This command is not a production
privileged-account bootstrap and must never be used to create production users.

Every local demo account uses `LisnoDemo2026!`:

| Role | Email |
| --- | --- |
| Designer | `ananya@lisno.example` |
| Design manager | `aarav@lisno.example` |
| Design head | `head@lisno.example` |
| Client | `client@aurora.example` |
| Super Admin | `super-admin@lisno.example` |
| Admin | `admin@lisno.example` |
| Procurement | `procurement@lisno.example` |
| Finance Manager | `finance-head@lisno.example` |
| Site Manager | `site-manager@lisno.example` |
| Electrician | `worker-electrician@lisno.example` |
| Plumber | `worker-plumber@lisno.example` |
| Carpenter | `worker-carpenter@lisno.example` |
| Painter | `worker-painter@lisno.example` |
| Civil Worker | `worker-civil@lisno.example` |
| Other Worker | `worker-other@lisno.example` |

### Estimate design mapping migration

Back up production first and verify the archive exists and is restorable before
the write command:

```bash
mongodump --uri="$MONGODB_URI" --archive="lisno-before-estimate-design-mapping.archive.gz" --gzip
cd backend
npm run migrate:estimate-design-mapping -- --dry-run
npm run migrate:estimate-design-mapping
npm run migrate:estimate-design-mapping -- --dry-run
```

The command prints one JSON report. Review every `conflicts` entry; the final
dry run must report `drawingsChanged: 0` and `revisionsChanged: 0`. Do not run
`npm run seed` for this operation.
