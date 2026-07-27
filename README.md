# Lisno

Lisno is a role-based design operations platform. Designers manage delivery
work, managers and heads oversee deadlines and evaluations, and clients see
only approved, client-visible plans.

## Prerequisites and setup

- Node.js 20+ and npm
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
cd backend && npm install && npm run seed && npm run dev
# in another terminal
cd frontend && npm install && npm run dev
```

The API defaults to `http://localhost:3000`; Vite defaults to
`http://localhost:5173`. Uploaded files are stored under `backend/uploads`
unless `UPLOADS_DIR` is changed. `npm run seed` loads the deterministic demo
data and provides the accounts below. The backend loads `backend/.env` for its
development server, production `start` command, and seed command; Vite loads
`frontend/.env`.

> Warning: `npm run seed` is an explicit demo-reset operation. It deletes all
> records in Lisno's demo-domain collections (including design-version
> sequences) before inserting the deterministic seed. Never run it against a
> production database.

## Environment variables

Backend: `PORT`, `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN`, `UPLOADS_DIR`, and
`MAX_UPLOAD_MB`. `CORS_ORIGIN` is a comma-separated allow-list of full browser
origins. The server connects to `MONGODB_URI` before listening and exits on a
connection failure; the shipped server never uses the in-memory repository.
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
```

`npm run build` produces deployable TypeScript output in `backend/dist` and the
Vite production bundle in `frontend/dist`. `GET /api/v1/health` reports API
health. Upload validation intentionally verifies allowed file signatures and
claimed MIME agreement at the API boundary; it does not fully decode image
contents.
