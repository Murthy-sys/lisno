# Lisno

Lisno is a role-based design operations platform. Designers manage delivery
work, managers and heads oversee deadlines and evaluations, and clients see
only approved, client-visible plans.

## Prerequisites and setup

- Node.js 20+ and npm
- Python 3.11+ for OCR extraction
- MongoDB configured as a replica set (transactions are required)

For a local replica set:

```bash
mkdir -p .local/mongo-rs0
mongod --dbpath .local/mongo-rs0 --replSet rs0 --bind_ip 127.0.0.1
mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
```

Copy each workspace example environment file, then set a long JWT secret:

```bash
cp backend/.env.example backend/.env
cd backend && npm install
NODE_ENV=development ALLOW_DEMO_SEED=true DEMO_SEED_DATABASE=lisno_demo npm run seed
cd ../frontend && npm install
cd ../ocr-worker && python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test,model]"
```

The API defaults to `http://localhost:3000`; Vite defaults to
`http://localhost:5173` and proxies local `/api` requests to the API, so local
frontend development does not require an environment file. Uploaded files are
stored under `backend/uploads` unless `UPLOADS_DIR` is changed. The explicitly
gated seed command loads deterministic demo data and provides the accounts
below. The backend loads `backend/.env` for its production `start` and seed
commands without overriding shell values.

## Start the application

`npm run dev` starts the backend and OCR worker together with the same
development-only `OCR_WORKER_TOKEN`. An explicitly configured token still takes
precedence and must be replaced with a real secret outside local development.
Start the application with:

```bash
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend && npm run dev
```

One `Ctrl+C` stops both backend processes. If the worker virtual environment is
missing, the command prints its setup steps. PaddleOCR may download and cache
model files on its first real extraction, so the first job can take longer. See
[ocr-worker/README.md](ocr-worker/README.md) for worker settings, supported
formats, model-cache behavior, and recovery.

Once the backend is running, its interactive Swagger documentation is available
at `http://localhost:3000/api-docs/`; the raw OpenAPI document is available at
`http://localhost:3000/openapi.json`.

## Client signup and project linking

Clients create an account at `http://localhost:5173/signup`. The form requires
name, email, mobile number, address, password, and password confirmation;
passwords must be 12–128 characters and both password fields must match.

When an Admin initiates a project, they enter the Client's contact details even
if that Client does not have a Lisno account yet. Lisno stores those details as
a project snapshot and normalizes the email for linking. Client signup
atomically claims every unclaimed project with the same normalized email, so
capitalization and surrounding whitespace do not affect the match. Existing
project contact snapshots remain unchanged. An email already used by an
internal account cannot be selected as a project client.

> Production blocker: this email-based claim flow does not yet verify control
> of the client email address. Do not enable public production signup/project
> claiming until email verification is enforced before a client can claim any
> project. This warning documents the blocker without changing current Client
> behavior.

Admins assign an Estimator during project initiation. After Estimate approval,
an Admin or Super Admin assigns the Designer who uploads the design plan; the
Designer cannot create projects or approve Estimates. Inactive Estimator and
Designer accounts cannot be assigned.

### Existing database migration

Back up the production database and run the migration dry run first. The command
reads `MONGODB_URI` from `backend/.env` (or the current environment), reports
the number of users and projects inspected, and reports duplicate normalized
emails without writing:

```bash
cd backend
npm run migrate:client-linking -- --dry-run
```

Resolve every reported duplicate before the production migration. Then run the
same migration without `--dry-run`; it backfills normalized emails and missing
client-contact snapshots and synchronizes the relevant indexes:

```bash
cd backend
MONGODB_URI="mongodb://production-host/lisno" npm run migrate:client-linking
```

The migration is safe to rerun after it succeeds because it writes only missing
or changed compatibility fields. Do not run `npm run seed` as part of the
migration; the seed command resets demo-domain data.

### Estimate design mapping migration

Back up production first; operators must verify that the archive exists and is
restorable before the write run:

```bash
mongodump --uri="$MONGODB_URI" --archive="lisno-before-estimate-design-mapping.archive.gz" --gzip
cd backend
npm run migrate:estimate-design-mapping -- --dry-run
npm run migrate:estimate-design-mapping
npm run migrate:estimate-design-mapping -- --dry-run
```

Review every `conflicts` entry in the JSON report. The final dry run must report
`drawingsChanged: 0` and `revisionsChanged: 0`. Do not run `npm run seed`.

### Approved-project finance backfill

Deployments with projects whose Estimate was already approved must create their
finance baseline so Super Admin's portfolio includes them, even while Design is
pending. Back up the database, run the write-free report, and review every
non-zero `skipCounts` value and `conflicts` entry:

```bash
cd backend
npm run migrate:project-finance-backfill -- --dry-run
npm run migrate:project-finance-backfill
npm run migrate:project-finance-backfill -- --dry-run
```

The migration prefers the immutable Client-approved Estimate snapshot, uses a
strict legacy approval fallback only when that snapshot does not exist, and is
safe to rerun. After the write run, the final report should contain only
`alreadyPending` or `alreadyOpen` projects and no unresolved conflicts. Do not
run `npm run seed`.

## Drawing-title extraction

OCR creates application-internal `section` records only for supported drawing
titles: floor, room, ceiling, site, roof, electrical, plumbing, and furniture
layout plans, plus directional elevations (front, rear/back, side, left, and
right). A supported title may include a controlled floor, room, residence, or
project qualifier.

For estimate-design PDFs, the worker first reads the lower title block. When a
page has a recognized `TITLE` value, it emits exactly one proposal whose crop is
the full rendered page. Untitled PDF pages, and every supported image format,
continue through the regular OCR and drawing-region extraction fallback.

The worker explicitly excludes legends, notes and directives, key/vicinity
plans and location maps, dimensions and symbols, material/finish specifications,
cross sections, details, diagrams, schedules, and unsupported drawing types.
In this application, a `section` record is an extracted UI/data record; it must
not be confused with an architectural Section drawing, which is excluded from
this title taxonomy.

> Warning: `npm run seed` is an explicit demo-reset operation. It requires
> development/test, exact `ALLOW_DEMO_SEED=true`, a loopback `mongodb://` URI,
> and an exact allowlisted `lisno_demo`/`lisno_test*` database match. It deletes
> all records in the authorized demo-domain collections (including access
> requests, project grants, authorization coordination, and design-version
> sequences) before inserting deterministic fixtures. Never run it against a
> production database.

## Environment variables

Backend: `PORT`, `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN`,
`UPLOADS_DIR`, `MAX_UPLOAD_MB`, `API_DOCS_ENABLED`, `OCR_WORKER_TOKEN`, `OCR_LEASE_SECONDS`,
`ALLOW_DEMO_SEED`, and `DEMO_SEED_DATABASE`. The two demo-seed variables are
only for an intentional local destructive reset; the database name must match
the URI exactly. The worker uses the matching token, `OCR_API_BASE_URL`,
`OCR_POLL_SECONDS`, and
`OCR_REQUEST_TIMEOUT_SECONDS`. `CORS_ORIGIN` is a comma-separated allow-list of
full browser origins. The server connects to `MONGODB_URI` before listening and
exits on a connection failure; the shipped server never uses the in-memory repository.
Frontend deployments may set `VITE_API_URL` to a full versioned API base URL
(for example, `https://api.example.com/api/v1`) when the API uses a separate
origin. Local Vite development uses its `/api` proxy without this variable.

Staff invitations, Estimate attachments, and Design plan attachments use one
all-or-nothing mail group:
`PUBLIC_FRONTEND_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE`,
`SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM`. `SMTP_FROM` is the general
Lisno sender for staff invitations and Estimate and Design plan attachments. `SMTP_TLS_MODE`
must be `implicit` or `starttls`. `SMTP_TLS_REJECT_UNAUTHORIZED` is optional
and, when present, must be exactly `true`; certificate verification cannot be
disabled and remains required when the variable is omitted.
`SMTP_DELIVERY_TIMEOUT_SECONDS` is optional, defaults to 120, and accepts
30-600 seconds for the complete delivery including attachment upload. With every
SMTP-related variable absent, external mail is disabled. Supplying any
incomplete group, including the optional variable by itself, stops startup
before the database connection or listener. A complete, valid group enables
external SMTP delivery without opportunistic plaintext fallback.
`PUBLIC_FRONTEND_URL` must be a single credential-free HTTP or HTTPS origin
with no path, query, or fragment. Remote production requires HTTPS for both the
frontend origin and API. See
[backend/README.md](backend/README.md#mail-delivery-and-client-response-operations)
for delivery and failure behavior.

## Estimate delivery and Client responses

Estimate publication succeeds into the Client portal when SMTP is disabled or
delivery fails, records a safe delivery state, and does not roll back the
published response round. The authorized Estimate owner or a Super Admin can
explicitly retry the same stored PDF; retry does not regenerate the PDF or
create a new review round, task, Estimate semantic version, or send generation;
it does update delivery attempt telemetry.

The initiating active Admin receives the Client-response task; otherwise the
sole active Super Admin does. Admin Approve and Reject each require exactly one
PDF, JPEG, PNG, or WebP proof. Reject means Request changes and does not mark
the lead lost.

The existing Client Dashboard, PDF, Approve, Request changes, drawing, and plan
behavior remains unchanged. Historical estimates are not backfilled and retain
their established legacy behavior. Estimate email links lead to `/client` and
carry no token, email, Estimate ID, or other credential.

## Staff invitations

Production begins with one Super Admin provisioned through a separately
reviewed operator process; the local seed is not a production privileged-user
bootstrap. Only the current sole active Super Admin can list, create, resend,
or revoke staff invitations. Creating one requires exactly Name, Email, Role,
and Mobile, with no title. Every canonical staff and trade role is eligible
except Client and Super Admin.

An invitation expires after 24 hours and can be accepted only once. Resending
rotates the token and supersedes the earlier link; revoking makes the current
link unavailable. Tokens are transient and carried only in the URL fragment,
only their SHA-256 digests are stored, and raw tokens or links must never be
logged or included in audit or email-provider metadata. Acceptance creates an
ordinary active user but does not install a session, so the new staff member
signs in through the normal login flow.

Accepted real staff users can use allowed remote frontend and backend
deployments. Reserved demo identities and their JWTs are local-only, and the
application blocks external invitation delivery to them. Client provisioning
remains separate: Clients use the signup and project-linking flow above and are
never created through a staff invitation.

## Demo accounts

All accounts use `LisnoDemo2026!`.

- Designer — `ananya@lisno.example`
- Design manager — `aarav@lisno.example`
- Design head — `head@lisno.example`
- Client — `client@aurora.example`
- Super Admin — `super-admin@lisno.example`
- Admin — `admin@lisno.example`
- Procurement — `procurement@lisno.example`
- Finance Manager — `finance-head@lisno.example`
- Site Manager — `site-manager@lisno.example`
- Electrician — `worker-electrician@lisno.example`
- Plumber — `worker-plumber@lisno.example`
- Carpenter — `worker-carpenter@lisno.example`
- Painter — `worker-painter@lisno.example`
- Civil Worker — `worker-civil@lisno.example`
- Other Worker — `worker-other@lisno.example`

These deterministic local accounts are fixtures only. Seeding is not a
production privileged-account bootstrap; provision production identities
through a separately reviewed operational process.

## Roles and visibility

- Designers create projects within their authorization, update their tasks,
  and upload versions.
- Managers view direct reports, revise deadlines with a reason, approve plans,
  and record separate evaluations.
- Heads inspect the organization, approvals, and evaluations.
- The sole active Super Admin administers staff invitations; Finance Manager
  and Site Manager remain ordinary staff roles after acceptance.
- Clients view their projects, floor progress, and only approved,
  client-visible files. Drafts, internal notes, KPI details, and evaluations
  are never exposed to the client UI or API responses.

## Delivery signals

Risk is calculated on the backend: gray for not-started work before its start,
green for healthy/on-time work, yellow for forecast or near-term risk, and red
for missed deadlines. KPI combines weighted on-time completion (35%), approval
quality (25%), revision efficiency (15%), update discipline (15%), and workload
completion (10%) for eligible tasks; manager/head evaluations remain separate
from the calculated KPI.

## Verification and production builds

The backend additionally exposes `npm run seed` and `npm start`. Both
workspaces expose `npm test`, `npm run typecheck`, and `npm run build`.
There is currently no lint script in either `package.json`.

```bash
cd backend && npm run typecheck && npm test && npm run build
cd ../frontend && npm run typecheck && npm test && npm run build
cd ../ocr-worker && .venv/bin/python -m pytest -m "not model"
```

`npm run build` produces deployable TypeScript output in `backend/dist` and the
Vite production bundle in `frontend/dist`. `GET /api/v1/health` reports API
health. Upload validation intentionally verifies allowed file signatures and
claimed MIME agreement at the API boundary; it does not fully decode image
contents.
