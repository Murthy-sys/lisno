# Project close control plan

1. Inspect existing project completion controls and authoritative local readiness using read-only queries.
2. Frontend owner: export/reuse the existing confirmation control with configurable trigger text, add guarded header action and focused permission/finance-independent regressions.
3. Root and independent reviewer: inspect preserved decision/version/permission guards; run relevant frontend tests/build and synthetic browser navigation/readiness checks. Do not submit a live completion decision.

## Completed validation

- Added the permission-gated Close project action in the admin project header, reusing the existing dialog independently of finance readiness/read permission.
- Preserved the Finance entry point and completion summary identity, authority version, CAS, idempotency, readiness and confirmation checks.
- Fixed inherited header styling that incorrectly prefixed the Close project action with a plus sign; override is scoped to this control in this header.
- AdminProjectDetailPage and FinancePages: 45 tests passed, including V3 post-phase draft with accepted initial source, finance-read permission on/off, blocked readiness, role/permission/status gating, completion refresh, and existing stale/network retry safeguards. TypeScript passed.
- Production build passed, with the existing large-bundle warnings. Independent read-only review found no material issues.
- Synthetic Playwright checks passed at desktop and mobile sizes: header visibility, lazy readiness fetch, ready confirmation enabled, blocked confirmation disabled, Cancel focus restoration, no document overflow, no render errors and zero completion writes. Screenshots inspected.
- Actual target project inspected read-only: active, client_approved site completion, authority version 4, no blockers, ready for Super Admin completion. No real project decision was submitted.
