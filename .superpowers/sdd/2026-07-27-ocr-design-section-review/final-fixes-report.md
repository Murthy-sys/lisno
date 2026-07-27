# Final whole-branch review fixes

Implemented all five important review findings and both requested security
minors.

## Changes

- Worker temporary file suffixes now come from the backend-authoritative MIME
  type, not the user filename. PDF, PNG, JPEG, and WebP are mapped explicitly.
- Extraction claim tokens were removed from URLs. Source, heartbeat, complete,
  and failure calls use `X-Extraction-Claim-Token`.
- Added claim-token-guarded lease renewal in memory and Mongo repositories,
  an internal heartbeat endpoint, and periodic worker heartbeats.
- Added configurable worker ceilings for PDF pages, decoded page pixels,
  generated output bytes, and maximum lease-renewal processing time.
- Added a configurable OCR confidence floor (default `0.2`) in both worker and
  backend result acceptance. Candidates at or above the floor retain their
  confidence so the existing `< 0.7` designer warning remains visible.
- Backend now verifies canonical decoded worker image payloads have a PNG
  signature and IHDR chunk before persistence.
- Client/read-only section review payloads include only an authenticated source
  page URL, with no storage reference or draft data. The review card exposes it
  in a protected preview disclosure.
- The exact owning designer can reload terminal submitted, changes-requested,
  and approved extraction states, including submitted status/history comments.
  Other designers still receive not-found, and mutation rules remain unchanged.

## Verification

- Backend: 203 tests passed; TypeScript typecheck passed; production build
  passed.
- Frontend: 83 tests passed; TypeScript typecheck passed; Vite production build
  passed.
- OCR worker: 16 non-model tests passed; the explicitly marked real Paddle
  model smoke test was not run.
- `git diff --check` passed.

## Caveat

The worker cannot forcibly interrupt native Paddle inference safely from its
polling thread. Instead, it stops renewing the lease after
`OCR_MAX_PROCESSING_SECONDS`; stale completion is claim-token rejected and the
job becomes reclaimable. Page, pixel, candidate, and output ceilings bound
normal document-driven resource growth.
