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

Use the same long `OCR_WORKER_TOKEN` for the backend and worker. The value below
is an explicitly non-secret local-development example; replace it outside local
development. Start services in this order:

```bash
# Terminal 1
cd backend
OCR_WORKER_TOKEN="local-development-only-ocr-worker-token-123456" npm run dev

# Terminal 2
cd ocr-worker
source .venv/bin/activate
export OCR_WORKER_TOKEN="local-development-only-ocr-worker-token-123456"
python3 -m lisno_ocr.worker

# Terminal 3
cd frontend && npm run dev
```

Check `GET http://127.0.0.1:3000/api/v1/health` before starting the worker.
PaddleOCR may download and cache model files on its first real extraction, so
the first job can take longer. See [ocr-worker/README.md](ocr-worker/README.md)
for worker settings, supported formats, model-cache behavior, and recovery.

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
