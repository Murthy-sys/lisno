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
| Finance Head | `finance-head@lisno.example` |
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
