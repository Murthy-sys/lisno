# Temporary local frontend connected to the production API

Date: 2026-10-01  
Status: Awaiting specification approval

## Goal and decision

Run the local Vite frontend against the production API for a temporary period. The user chose **local frontend → production API**. Production API requests will use production services and their production database through the deployed backend. The local backend and local MongoDB do not need production credentials or configuration changes. The earlier production-to-local data copy has not run and is outside this temporary switch.

## Current behavior and evidence

- The ignored `frontend/.env` currently sets `VITE_API_URL` to a loopback HTTP `/api/v1` endpoint. `frontend/src/api/client.ts` reads that value for JSON, stream, and upload requests; it supports an absolute API base URL. `frontend/development-server.ts` proxies relative `/api` requests to the local backend, so an absolute URL bypasses that proxy.
- Historical repository deployment documentation identifies `https://lisno.onrender.com/api/v1` as the public backend URL. On 2026-10-01, a read-only request to its `/health` endpoint returned HTTP 200. Preflight requests from `http://localhost:5173` returned HTTP 204 with that origin allowed and `Authorization` and `Content-Type` allowed for POST. Recheck these responses when switching because deployment configuration can change.
- The frontend stores its bearer token under `lisno.auth.token` in browser local storage. A token from local development must not be reused as a production session. Production credentials stay with the user; none are added to local files or logs.
- Starting the local backend would connect to its configured MongoDB, initialize indexes, and run notification and maintenance work. This temporary mode does not require starting it. No local database data or production database data is copied.

## Proposed behavior and scope

1. Preserve the exact prior ignored `frontend/.env` value in a restricted local rollback note, then change only `VITE_API_URL` to the verified public HTTPS production API base URL. Do not alter tracked frontend or backend source, `render.yaml`, or production service settings for the basic switch.
2. Restart the local Vite process and use `http://localhost:5173` in a fresh browser profile or a session with the local bearer token cleared. The frontend's existing authorization and role behavior remains backend-controlled.
3. Verify a public health request and an authenticated read after the user logs in with a production account. Browser network requests should go to the production API; the local backend and MongoDB must remain unused by this frontend session. Avoid logging credentials, tokens, private response bodies, or client data in evidence.
4. Normal controls in this frontend will call live production routes. An authorized save, approval, invitation, upload, or other mutation can change production data and trigger production mail, storage, OCR, and workflow effects. The switch itself performs no such mutation. No read-only UI mode is promised.
5. To return to local operation, restore the exact previous `frontend/.env` value, restart Vite, and clear the browser's production bearer token and query state before using local credentials.

## Options and rationale

| Option | Effect | Tradeoff |
| --- | --- | --- |
| **Set the ignored frontend API URL directly to production (recommended)** | Uses existing absolute-URL support and verified localhost CORS with no tracked code or production setting change. | Browser requests are cross-origin and live; CORS must remain enabled for the local origin. |
| Make the Vite development proxy target configurable | Keeps browser requests same-origin and avoids relying on production CORS. | Requires tracked config and test changes for a temporary need; the existing CORS check currently passes. |
| Point the local backend at production MongoDB | Makes local server jobs and mutations operate on production data. | Outside the user's selected frontend-only mode and inconsistent with the local development demo guard. |

## Data, API, UX, and safety constraints

- `VITE_API_URL` is a public API address, not a database URI or secret. Do not place MongoDB credentials, JWT secrets, SMTP credentials, or production tokens in Vite environment variables; `VITE_*` values enter frontend bundles.
- Do not start the local backend for this mode. Do not run the production-to-local import, demo seed, migration, or a production database write as setup.
- Production authorization remains authoritative. Local frontend code may differ from the deployed frontend; if the production API contract rejects a local screen, report the mismatch rather than changing production data or routes to conceal it.
- Use a fresh browser session or clear the existing local token before connecting. Do not collect or expose production client data during verification.
- This is temporary developer-local configuration. The rollback must restore the exact previous URL; no commit, deployment, or production environment edit is part of the switch.

## Acceptance criteria

1. The local frontend at `http://localhost:5173` sends API requests to the verified HTTPS production API base URL. A public health request succeeds and production CORS still permits the local origin and authorization header.
2. The local backend and local MongoDB are not used for this session, and no database import or production setting change occurs as setup.
3. An existing local bearer token is not sent as a production session. The user can log in with their own production account and complete at least one read-only application check without exposing private data in logs or screenshots.
4. Only ignored local configuration changes for the switch. The previous value is recoverable, and rollback restores local API targeting and clears the production browser session.
5. The handoff explicitly states that ordinary UI mutations now affect production and that production media/services are reached through the production API.

## Assumptions, risks, and open decisions

- The user's selection of “local frontend → production API” permits ordinary role-authorized frontend behavior, including production writes when the user intentionally uses write controls. If read-only browsing is required, that is a different behavior and needs an explicit constraint before implementation.
- The historical public URL and CORS response were verified today but can change. A failed live check blocks the switch pending a current public API base URL or a revised proxy approach.
- The duration is unspecified. The configuration remains local until the user asks to roll it back or changes it manually; no scheduled automatic reversal is assumed.
- The prior production-to-local copy request is not completed by this temporary mode. If that copy is still wanted later, it needs a read-only production MongoDB source and its own dry run.
