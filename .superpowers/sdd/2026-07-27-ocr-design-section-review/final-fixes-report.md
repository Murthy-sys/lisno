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

## Hardening round 2

- PDF pages are now inspected and rendered lazily. Page count and scaled pixel
  dimensions are rejected before pixmap allocation; each full-resolution page
  image is closed before advancing.
- Image dimensions are inspected from the header before Pillow loads and
  decompresses image pixels.
- OCR candidate count is enforced before crop/PNG work. A running decoded
  output budget rejects during page/section generation, so later candidates
  and pages are not encoded after exhaustion.
- Worker output defaults to 40 MiB and is capped at 44 MiB, leaving bounded
  base64 and JSON overhead below Express's 64 MiB transport limit.
- Backend result validation now fully decodes PNGs with Sharp and verifies page
  and crop pixel dimensions against the declared contract.
- Worker startup validates heartbeat interval below the configured lease and
  maximum processing duration above the heartbeat interval.
- Owning designers receive safe non-draft revision history and client comments
  in terminal/review states; the read-only UI renders that history.

## Hardening round 3

- PyMuPDF pixmaps are explicitly dropped after Pillow copies their samples and
  before the page is yielded to OCR; page images and documents close on success
  and failure paths.
- Claim and heartbeat responses now carry the authoritative lease duration.
  The worker schedules renewal at a safety fraction of each returned duration,
  including non-default short leases, without duplicating backend lease config.
- Backend PNG validation reads Sharp metadata first, rejects format, declared
  dimension, and 40-million-pixel violations before full decode, then performs
  a complete decode under the same pixel cap.
- Pillow source handles now close through `finally` on load and conversion
  failures.
