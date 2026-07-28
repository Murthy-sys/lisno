# Frontend Development API Proxy Design

## Goal

Make `cd frontend && npm run dev` work against the local backend without
creating `frontend/.env`.

## Design

Configure Vite's development server to proxy every `/api` request to
`http://localhost:3000`. The frontend already falls back to the relative
`/api/v1` base URL, so no application request code needs to change.

The proxy applies only to Vite development. Production deployments may still
set `VITE_API_URL` when the API uses a different origin; same-origin production
deployments can retain the relative fallback.

Remove the local frontend environment copy step from the root setup
instructions. Keep `frontend/.env.example` as documentation for deployments
that need an explicit API origin.

## Testing

Extract the Vite development proxy settings as a named configuration value and
add a focused test proving `/api` targets `http://localhost:3000`. Run the full
frontend test suite, type checking, production build, and a live Vite proxy
request to the backend health endpoint.
