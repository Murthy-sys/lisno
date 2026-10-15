# Main Line Design rules implementation plan

Specification: [design](../specs/2026-10-14-main-line-design-rules-design.md).

Authority: standing user instruction waives routine approval waits; Mode A parallel work. Initial worktree evidence is in `/tmp/lisno-design-rules/`. Preserve all prior dirty changes.

## Current parent task: completed implementation and focused verification

1. Discovery and contracts: complete. Three independent audits traced configuration/estimate lineage, designer gates and procurement paths. User confirmed payment deadline anchor and non-binding vendor discussion.
2. Configuration and estimate backend (worker): revision-owned Design schema/defaults/validation, legacy compatibility, current catalogue projection, saved snapshots and frozen public quotation/PDF notes. Own backend configuration/catalogue/estimate projection files and focused tests. AC1–2.
3. Project requirements backend (worker): source-linked requirement state/history, scoped read/action service/routes, submission gates and immutable submission evidence, stock deadlines, repository adapters and focused tests. Own new requirements modules, repository adapters and design-workflow/design-plan integration. AC3–5,7.
4. Frontend (worker): Design questionnaire, preserved visibility editor, shared types, project selection/checklist UI, procurement stock list, client-safe approvals and quotation notes, focused rendered tests. Own frontend and shared files. AC1–5,7.
5. Root integration: application/router registration, authorization/OpenAPI inventory, every PO/award guard, source/assignment fencing and regression tests. Coordinate service signatures before edits. AC5–6.
6. Independent integrity review: complete, no blocking defects. Corrected the mobile critical-task label for newly introduced Design/stock rows; pending requirements must not be called overdue. Reviewed source fencing, permissions, all PO paths, immutable history and client-safe DTOs.
7. Verification on integrated worktree: complete with the limits below. Focused backend replica tests, frontend interaction tests, typechecks/builds, authorization/API inventory, real browser at desktop/mobile, diff check and preservation audit. AC8.

Tasks 2–5 may run in parallel on explicit non-overlapping paths. Shared changes or contract changes must be communicated immediately. No staging, commits, deployments, seeding or migrations.

## Verification evidence
Implementation writers are frozen. Before the integrated run: configuration backend 505 passed with one known pre-existing vendor-induction Budget failure; project requirements/workflow 356 distinct passed; PO 131 passed; authorization/API 215 passed; frontend 168 passed. These runs overlap and must not be summed as distinct coverage.

Browser checks rendered the actual configuration, internal project checklist and client checklist components with synthetic API fixtures at 1440px and 390px. Native keyboard controls, Custom defaults, dirty navigation, versioned saves, point-by-point PO signoff, reasoned deferral and client approval passed; no overflow or unexpected requests/page errors. Final project-panel rerun after display correction also passed. Evidence and screenshots: `/tmp/lisno-design-rules/browser-verification.md`.

All 15 initially untracked files retain their original hashes. Browser/Vite sessions are closed and task-generated browser logs moved to `/tmp/lisno-design-rules/`.

Final integrated results:
- Backend: 1,305 distinct tests passed across 30 files, with two failures matching the prior documented baseline: reopened vendor-induction Budget validation, and Procurement inline classification expected 201/actual 403. New Design/workflow/PO group passed 506/506; configuration/publication/authorization group passed 799 with those two failures.
- Frontend: 185 distinct tests passed across 14 files. The corrected permission-count fixture and one transient cached-client-content assertion passed the final integrated rerun. Daily-critical 28 tests were rerun after the final copy correction.
- `npm run typecheck` passed in backend, frontend and mobile. `npm run build` passed in backend and frontend; existing large-bundle warning remains.
- Mobile notification rendered test: one test passed on both runs, including `--detectOpenHandles`; both processes retained an unidentified handle and were stopped after bounded diagnosis. Clean test-process shutdown is not verified.
- `git diff --check` passed; final status captured. No dependencies, migrations, seeds, commits, pushes, deployments, live data changes or customer communications.

Exact commands, exits, logs and acceptance mapping: `/tmp/lisno-design-rules/final-verification.md`. Browser details: `/tmp/lisno-design-rules/browser-verification.md`. Generated ignored build outputs: `backend/dist`, `frontend/dist`; other task evidence remains outside the repository in `/tmp/lisno-design-rules/`.

Full backend/frontend/mobile suites, native device/build checks and OCR checks were not run. The legacy KnowledgeScreens suite with 15 known failures was excluded. No lint script exists. Independent review noted two additional coverage limits: no dedicated simultaneous source/assignment mutation versus PO/submission test, and no explicit persisted review-round/client-read readiness snapshot round-trip test; code paths, dependency fences and DTO allowlists were reviewed.

Principal affected areas: revision-owned Design configuration and catalogue/quotation notes; new backend `domain/design-requirements.ts`, `services/design-requirements.service.ts` and transaction-bound repository adapters; shared docket and four PO-family guards; authorization/OpenAPI; frontend `KnowledgeDesignRulesPanel` and `ProjectDesignRequirementsPanel`; shared/web/mobile critical-task consumers. All prior untracked work remains byte-identical.
