# Task plan: In-house rate and compact estimator basket

Date: 2026-10-02  
Status: Implemented and locally verified on 2026-10-02. The changes remain uncommitted and undeployed.  
Specification: [Estimator in-house base rate and compact basket layout](../specs/2026-10-02-estimator-in-house-rate-layout-design.md).

| Order | Area | Work | Acceptance criteria and verification |
| --- | --- | --- | --- |
| 1 | Catalogue service and OpenAPI | Batch-read the chosen revision's advanced section, derive the combined in-house base rate safely, and add the nullable projection. | AC 1–2; isolated catalogue tests for split, legacy, zero, partial, invalid, and source revision selection; backend typecheck. |
| 2 | Estimator draft state and API type | Prefill new rates, retain saved/manual values on refresh, and flag changed source rates. | AC 1–2; configured line state tests and workspace save-flow tests. |
| 3 | Builder component and scoped CSS | Replace stacked desktop row layout, remove redundant type caption, add Main Basket disclosure and jump behavior, and adapt narrow widths. | AC 3–4; rendered interaction test and desktop/mobile browser inspection. |
| 4 | Integrated review and verification | Inspect the combined diff and run focused tests, typechecks, builds, accessibility/interaction check, `git diff --check`, and `git status --short`. | AC 5; report exact results and any limits. |

The primary agent owns all touched paths in this inline execution. No Configuration write service, model, management UI, or production record is in scope. No migration, dependency, commit, push, or deployment is planned.

## Local verification outcome

- Backend estimator catalogue and OpenAPI tests: 61 passed. Backend production build passed.
- Frontend configured estimate, builder, workspace, and catalogue API tests: 43 passed; the affected builder/workspace rerun after the final empty-group change passed 34. Frontend production build passed with its existing large-chunk warning.
- Synthetic browser QA at 1280, 768, 390, and 320 px found no document overflow or runtime errors. The priced fixture showed ₹1,050 at quantity 1, retained the subtotal while collapsed, and reopened from the basket jump. Desktop and 320 px axe scans reported zero violations in the inspected state.
- `git diff --check` passed. Temporary Playwright files were removed. No live Configuration records, external delivery, or production state were touched.
