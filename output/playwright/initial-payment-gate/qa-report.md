# Optional initial receipt browser QA

Date: 2026-11-28 (Asia/Kolkata).

Actual `ProcurementEstimateSource` and `ProjectInitialPaymentStatus` components rendered in a disposable frontend-only fixture at localhost:4181. Authentication and API responses are synthetic. No development backend, real payment, database or production service was used.

- Chrome 158 headless on macOS, viewport widths 390 and 1440, height 960. Reduced-motion preference enabled.
- Missing receipt: work-order readiness is ready, receipt remains unrecorded, optional explanation visible.
- Older receipt: readiness remains ready and the original November 1 receipt timestamp remains visible for optional attestation.
- Missing quotation approval: actual backend-style blocker remains visible; receipt form is unavailable.
- Finance actor: ready work-order status with no unauthorized receipt form.
- Legacy workflow: original receipt-dependent kickoff explanation is retained.
- All 10 width/state combinations have no document horizontal overflow. Screenshots inspected for narrow missing-receipt and desktop historical-receipt states.
- Receipt reference field to submit button works using Tab and Enter. Exactly one intercepted `confirm_initial_payment` mutation was recorded, and the success message states that existing execution dates are unchanged.
- Final matrix: zero page runtime exceptions. Console entries during the final matrix were React development notices only. Earlier fixture setup produced a missing-module error and restart websocket messages; these were resolved before the final matrix and are not product errors.

Evidence: `missing-390.png`, `missing-1440.png`, `stale-390.png`, `stale-1440.png`. These and the disposable harness are ignored QA output.

Limits: component fixture rather than authenticated application/backend E2E; no native-device, Safari or performance benchmark claim. Rendered automated tests separately cover permission, cache refresh, invalid metadata and accessibility behavior.
