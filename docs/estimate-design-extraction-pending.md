# Estimate Design Extraction — Pending Production Work

## Current milestone

- [x] Accept single-page and multi-page estimate PDFs within the configured limits.
- [x] Publish exactly one full-page drawing for every accepted source page.
- [x] Cover six pages as a regression fixture without creating a six-page product limit.
- [x] Reuse embedded title text first and keep lower-title-band OCR as the fallback.
- [x] Group repeated, uniquely resolved titles under the same estimate item.
- [x] Persist missing, ambiguous, and unmatched titles as true-null **Miscellaneous** drawings.
- [x] Keep estimator submission temporarily permissive and the submit control unconditionally enabled.
- [x] Save and restore versioned client annotation drafts after workspace remount.

## Ordered backlog

1. [ ] Complete replay-safe, idempotent project and estimate extraction completion, including deterministic conflict receipts.
2. [ ] Add poison-job retry scheduling, attempt limits, terminalization, and safe manual reset.
3. [ ] Add worker transport-only retries, stable result IDs, heartbeat reconciliation, and real replica-set completion tests.
4. [ ] Finish general bounded variable-page extraction: source-download limits, completion-body limits, artifact/drawing caps, and bounded bulk writes.
5. [ ] Add staged artifact publication, generation-aware reconciliation, and durable shared object storage.
6. [ ] Add structured backend/worker logs, safe diagnostic IDs, liveness/readiness probes, shared-model readiness, and rollout gates.
7. [ ] Reintroduce a configurable verification and exact-assignment submission policy after estimator workflow validation.
8. [ ] Run authenticated desktop and 320 px browser QA when a usable browser session is available.

## Approved implementation plans

- Items 1–3: [Idempotent Extraction Completion and Retry Lifecycle](./superpowers/plans/2026-07-30-idempotent-extraction-completion.md)
- Item 4: [Bounded Variable-Page Extraction](./superpowers/plans/2026-07-30-bounded-variable-page-extraction.md)
- Items 5–6: [Production Extraction Storage and Observability](./superpowers/plans/2026-07-30-production-extraction-storage-observability.md)
- Item 7 should begin only after the temporary permissive milestone has been validated with estimators.
- Item 8 is a release-quality follow-up and does not change the extraction or submission contract.

Resume these items in order. Do not mark an item complete until its plan-specific tests, operational checks, and rollout criteria pass.
