# Combined Backend and OCR Development Design

## Goal

Make `cd backend && npm run dev` the single command needed to run both the
Node backend and the Python OCR worker during local development.

## Design

Replace the current direct backend watcher command with a small Node
development coordinator. The coordinator starts:

- the backend through `tsx watch src/dev.ts`; and
- the OCR worker through `ocr-worker/.venv/bin/python -m lisno_ocr.worker`.

It gives both children the same environment and supplies the existing
deterministic local-only `OCR_WORKER_TOKEN` only when the developer has not
configured one. Explicit shell or `backend/.env` values continue to take
precedence.

The coordinator forwards termination signals, shuts down the sibling when
either process exits unexpectedly, and returns a failing exit status when a
child fails. Before spawning, it checks that the worker virtual-environment
Python executable exists. A missing environment produces a concise setup
command instead of a low-level spawn error.

Production `npm start`, seed, and migration commands remain unchanged.

## Testing

Unit tests will exercise process planning and lifecycle behavior through
injected spawn and filesystem boundaries. They will prove:

- both processes receive the same worker token;
- explicit tokens are preserved;
- the worker command resolves from the repository's `ocr-worker/.venv`;
- a missing virtual environment returns an actionable error;
- sibling shutdown and exit status propagation are coordinated.

Verification will include backend tests, type checking, compilation, OCR worker
tests that do not require model downloads, and a bounded live `npm run dev`
smoke test showing both services start from the one command.
