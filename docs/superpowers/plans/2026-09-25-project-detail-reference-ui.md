# Project detail reference UI plan

Specification: [Project detail reference UI](../specs/2026-09-25-project-detail-reference-ui-design.md).

Single parent task completed: match the reference project-details UI using existing behavior only.

1. Root: capture dirty hashes and target snapshots in `/tmp/lisno-project-detail-ui-qa`; inspect current page and style system. Complete.
2. Independent read-only audit: identify data and action compatibility with reference. Complete: reference-only editing, timelines, managers, tabs and counts are unsupported and must not be fabricated.
3. UI implementer owns `AdminProjectDetailPage.tsx`, new `admin-project-detail.css`, and narrowly required `AdminProjectDetailPage.test.tsx` presentation regression changes. Preserve all hooks/business logic, component inputs, permissions, mutation handlers and shared sources. Run focused tests. No other product files.
4. Root owns synthetic browser harness and docs. In parallel with UI work, prepare actual AppShell/page preview and representative approved/draft/missing/long/loading/error states, with writes blocked.
5. After writer completion: independent integrity review of integrated product diff; resolve confirmed issues, then independent final verification (detail tests, typecheck, build). Root checks wide/laptop/tablet/phone rendering, nav/disclosure/retry, accessibility and console/network outputs. Inspect screenshots and compare reference.
6. Reconcile all baseline dirty hashes, diff hygiene and evidence; stop temporary browser/server and move generated artifacts outside the repository. Record exact checks and limitations here.

No staging, commit, push, backend changes, new dependencies, seed, migration, external communication or production mutation.

## Final implementation and review

Changed only `AdminProjectDetailPage.tsx`, its test file and new `admin-project-detail.css`. Reused the existing interior WebP, PageHeader, Overview/Messages navigation and all operational panels. Full-width root uses 24px desktop/16px smaller-screen shell gutters. Desktop uses a fluid main column with five fact tiles and a 300px sidebar; smaller layouts stack. Information/assignment open by default, retaining their keyboard disclosures. Strengthened CSS specificity to avoid shared admin styles overriding the new page; the estimate rows use two columns where space allows.

The screenshot's unsupported actions, tabs, manager, timeline and progress values were omitted. Created date is accurately labelled; reference artwork is explicitly illustrative. Known Sales/Designer/Client identities come from the existing detail response. Independent integrity review found no changes to queries, permission conditions, finance source construction, rupee conversion, mutation handlers, panel order or retry behavior. Every initially dirty file (109) remained unchanged.

## Verification evidence

Final independent commands in `frontend/` all exited zero:

```sh
npm test -- src/features/admin/AdminProjectDetailPage.test.tsx
npm run typecheck
npm run build
```

13/13 detail tests passed, including the existing 12 behavioral flows, meaningful summary/default-open keyboard checks and asymmetric mutable-versus-approved estimate values. Three product-file hashes remained stable during final verification. Production build passed in 8.62 seconds; the existing >500kB bundle warning remains. `git diff --check` passed. No lint script exists.

Actual AppShell/page browser checks in Chromium used synthetic API responses with writes blocked:

- Final widths 1920, 1440, 1024, 768, 390 and 320px: no horizontal overflow; zero axe WCAG A/AA violations; desktop 300px sidebar and smaller-screen stacking confirmed.
- Draft, missing approved baseline, absent estimate/assignment, long text, pending Designer handoff and permitted finance/worker views all rendered correctly without unexpected requests. Long and finance states were rechecked at 1440 and 320px after final CSS changes; no overflow or accessibility violations.
- Keyboard collapse/reopen, Messages navigation, read-only header action visibility and error retry passed. Approved facts use ₹2,42,667 despite the fixture's mutable estimate value of ₹9,99,999. Missing approved baseline remains unavailable.
- Final browser capture recorded zero console warnings/errors and page exceptions. Earlier console connection errors were caused by intentionally restarting the temporary QA server; the final independent capture is clean.
- Desktop and phone screenshots were inspected as images. Evidence: `/tmp/lisno-project-detail-ui-qa/final-desktop.png`, `final-mobile.png`, `final-layout-results.log`, `state-results.log`, `final-states-and-console.log`, and final test/typecheck/build logs in the same directory.

No backend/full frontend/OCR suite was run for this scoped UI change. Browser checks used synthetic data in Chromium, not production records or physical devices. No remaining confirmed defect. Temporary browser/server stopped; generated browser logs kept under `/tmp/lisno-project-detail-ui-qa`, outside the repository. Changes remain local and not deployed.
