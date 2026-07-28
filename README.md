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
cp frontend/.env.example frontend/.env
cd backend && npm install && npm run seed
cd ../frontend && npm install
cd ../ocr-worker && python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test,model]"
```

The API defaults to `http://localhost:3000`; Vite defaults to
`http://localhost:5173`. Uploaded files are stored under `backend/uploads`
unless `UPLOADS_DIR` is changed. `npm run seed` loads the deterministic demo
data and provides the accounts below. The backend loads `backend/.env` for its
development server, production `start` command, and seed command; Vite loads
`frontend/.env`.

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

## Client signup and project linking

Clients create an account at `http://localhost:5173/signup`. The form requires
name, email, mobile number, address, password, and password confirmation;
passwords must be 12–128 characters and both password fields must match.

When a designer creates a project, they enter the client's contact details even
if that client does not have a Lisno account yet. Lisno stores those details as
a project snapshot and normalizes the email for linking. Client signup
atomically claims every unclaimed project with the same normalized email, so
capitalization and surrounding whitespace do not affect the match. Existing
project contact snapshots remain unchanged. An email already used by an
internal account cannot be selected as a project client.

Designers choose the project manager from the active-manager search in the
project creation dialog. The selection is independent of the designer's
reporting line: any active design manager can own the project, while inactive
or non-manager accounts are rejected.

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

## Drawing-title extraction

OCR creates application-internal `section` records only for supported drawing
titles: floor, room, ceiling, site, roof, electrical, plumbing, and furniture
layout plans, plus directional elevations (front, rear/back, side, left, and
right). A supported title may include a controlled floor, room, residence, or
project qualifier.

The worker explicitly excludes legends, notes and directives, key/vicinity
plans and location maps, dimensions and symbols, material/finish specifications,
cross sections, details, diagrams, schedules, and unsupported drawing types.
In this application, a `section` record is an extracted UI/data record; it must
not be confused with an architectural Section drawing, which is excluded from
this title taxonomy.

> Warning: `npm run seed` is an explicit demo-reset operation. It deletes all
> records in Lisno's demo-domain collections (including design-version
> sequences) before inserting the deterministic seed. Never run it against a
> production database.

## Environment variables

Backend: `PORT`, `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN`, `UPLOADS_DIR`,
`MAX_UPLOAD_MB`, `OCR_WORKER_TOKEN`, and `OCR_LEASE_SECONDS`. The worker uses
the matching token, `OCR_API_BASE_URL`, `OCR_POLL_SECONDS`, and
`OCR_REQUEST_TIMEOUT_SECONDS`. `CORS_ORIGIN` is a comma-separated allow-list of
full browser origins. The server connects to `MONGODB_URI` before listening and
exits on a connection failure; the shipped server never uses the in-memory repository.
Frontend: `VITE_API_URL`, the full versioned API base URL (for example,
`http://localhost:3000/api/v1`). See the two `.env.example` files for local
defaults.

## Demo accounts

All accounts use `LisnoDemo2026!`.

- Designer — `ananya@lisno.example`
- Design manager — `aarav@lisno.example`
- Design head — `head@lisno.example`
- Client — `client@aurora.example`

## Roles and visibility

- Designers create projects within their authorization, update their tasks,
  and upload versions.
- Managers view direct reports, revise deadlines with a reason, approve plans,
  and record separate evaluations.
- Heads inspect the organization, approvals, and evaluations.
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
