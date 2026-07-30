# Task 9 verification report

Commit: `f60dd53 test: cover misc estimate drawing journey`

## Journey coverage

- Backend fixtures now use complete mapped tuples (`FC01` / `auto_mapped`) and a persisted true-null Misc tuple. The journey confirms an unverified drawing returns `ESTIMATE_DRAWINGS_UNVERIFIED`, verifies the Misc drawing through the public PATCH endpoint, submits it, and exposes literal null mapping fields in the client DTO.
- Frontend fixtures now use complete mapping tuples with no empty-string identifiers. The estimator view exposes verified `TV UNIT` under Misc and enables submission; the subsequent client view exposes the same drawing under Misc and enables approval. Existing annotation, replacement, history, readiness, and final-estimate assertions remain covered.

## Focused verification

| Command | Result | Count | Test duration | Failures |
| --- | --- | --- | --- | --- |
| `cd backend && npm test -- --run tests/full-journey.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts` | PASS | 98 / 98 | 2.56s | 0 |
| `cd frontend && npm test -- --run src/features/estimates/estimateDrawingJourney.test.tsx src/features/leads/EstimateDesignUploads.test.tsx src/features/estimates/ClientEstimateDrawings.test.tsx` | PASS | 22 / 22 | 4.20s | 0 |

The initial test-first run was red: the exact mapped fixture correctly surfaced that automatic mapping begins unverified, and the older journey expectation used the stale accessible label `Mark mapping verified`. The corrected fixture marks the mapped drawing verified before proving the remaining Misc block; the expectation now matches the rendered `Mark drawing verified` control. An earlier parallel backend focused run also had one transient extraction-claim fixture failure; the required serial command passed with 98 / 98, so no unrelated test was changed.

## Release verification

| Command | Result | Count / duration | Failures |
| --- | --- | --- | --- |
| `cd backend && npm test` | PASS | 445 / 445, 4.88s | 0 |
| `cd backend && npm run typecheck` | PASS | 3.34s wall time | 0 |
| `cd backend && npm run build` | PASS | 3.49s wall time | 0 |
| `cd backend && npm test -- --run tests/estimate-design-mapping-migration.replica-set.test.ts` | PASS | 5 / 5, 1.87s | 0 |
| `cd frontend && npm test` | PASS | 223 / 223, 7.71s | 0 |
| `cd frontend && npm run typecheck` | PASS | 3.78s wall time | 0 |
| `cd frontend && VITE_API_URL=/api/v1 npm run build` | PASS | 5.50s wall time; Vite build 1.52s | 0 |
| `cd ocr-worker && .venv/bin/python -m pytest -q` | PASS | 316 / 316, 37.00s | 0 |
| `git diff --check` | PASS | no output | 0 |

Warnings observed without test failures: frontend MSW reported unmatched requests in existing signup/login coverage; the production build reported a JavaScript chunk above 500 kB; OCR worker reported five SWIG deprecations and no `ccache` warning. These were not changed by Task 9.

## Responsive manual verification

Not automated or claimed. The controller confirmed that no in-app browser instance is available, and the local app/auth fixture setup cannot be exercised through a browser in this environment. No rendered desktop or 320 px conclusions were invented.
