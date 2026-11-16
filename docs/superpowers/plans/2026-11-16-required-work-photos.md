# Required work photos implementation plan

1. Trace grant and completion paths, preserve prior dirty work, settle historical compatibility.
2. Backend owner: reject grants, remove active projection, require valid photos for completion and verification, update OpenAPI and replica-set regressions.
3. Frontend owner in parallel: remove controls/messages, filter obsolete actions, require completion photos even with stale exemption payloads; update focused UI regressions.
4. Root: inspect integrated diff, verify tests/builds and rendered manager/vendor flows with synthetic data, refresh the existing local backend runtime and check health. Preserve historical data and do not issue live workflow decisions.

## Result

All tasks completed. Exemption grants (including replayed old grants) are rejected, active responses expose no exemption, and both completion submission paths plus verification require current-round photos. Stored audit history and previously recorded decisions are preserved. Stale UI payloads cannot expose a grant control or bypass validation.

Verification: 61 backend replica-set tests passed across execution, vendor-work and purchase-order suites; 77 focused frontend tests passed; both TypeScript checks and production builds passed; independent frontend integrity review found no material issue; git diff --check passed. The frontend build retains the existing large-chunk advisory.

Synthetic browser checks passed: manager grant and saved exemption message absent, photo-less verification blocked with Request changes available, vendor completion blocked despite an old exemption and succeeds after photo attachment, no mobile overflow or browser errors. Artifacts are temporary under /private/tmp/lisno-execution-qa/no-exemption-*. No live work decisions or migrations were run. The existing local backend supervisor was refreshed and /api/v1/health returned status ok.
