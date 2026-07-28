# Backend Development Environment Design

## Goal

Make `cd backend && npm run dev` start without requiring every developer or
worktree to create a private `.env` file first, while retaining strict secret
validation outside the development command.

## Design

Add a development entrypoint that supplies deterministic, clearly local-only
values for `JWT_SECRET` and `OCR_WORKER_TOKEN` only when those variables are
absent. It then imports the existing server entrypoint. Values explicitly
provided by the shell or `backend/.env` take precedence.

The shared environment schema remains unchanged. Consequently, `npm start`,
the seed command, migrations, and direct calls to `loadEnvironment()` continue
to reject missing or weak credentials.

## Testing

Add focused tests proving that the development environment:

- supplies valid local defaults when credentials are missing;
- preserves explicitly configured credentials;
- produces values accepted by the existing strict environment loader.

Run the focused tests, the full backend test suite, type checking, and a
bounded startup smoke test. The smoke test may still require the documented
local MongoDB replica set; success means configuration passes and the backend
reaches its normal database connection/startup path.
