# Lisno backend

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
