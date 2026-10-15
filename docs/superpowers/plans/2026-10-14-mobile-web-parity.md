# Mobile web parity execution plan

Specification: [design](../specs/2026-10-14-mobile-web-parity-design.md).
Authority: user explicitly requests all missing web features and native UI preserving theme; standing autonomous Mode A applies. No repeated approvals for local implementation.

## Parent task: implementation and automated verification finished; device scope documented
1. Root: reconcile roles, permissions, route operations/policy and public invitation routes; navigation/session contracts and role fixtures. Own `mobile/src/contracts`, navigation/route integration and shared contracts. AC1.
2. Configuration worker: native Design/closure tabs,14 rules, versioned/uncertain saves using shared rules; preserve mobile compact controls/Quality/modes. Own `mobile/src/features/knowledge` only. AC2.
3. Client review worker: immutable published review display/notes, round-bound decision/PDF, phase/diff and source/error handling. Own `mobile/src/features/estimates` only. AC3.
4. Root/audits: complete current feature/action matrix, then assign bounded following batches with fresh explicit ownership:
   - staff estimate authoring/dynamic rooms, collaboration/requirements and invitations;
   - project/Design actions and actionable reminders;
   - vendor hierarchy request/review;
   - procurement/basket/tender/PO/work-order operations;
   - execution/Vendor work/completion;
   - finance/management/admin missing actions;
   - remaining chat/notification capabilities.
5. Integrate each batch into native routes/scaffold; update actual parity matrix, preserve backend/web contracts and unrelated dirty paths. Root owns shared integration, transport decisions and durable plan.
6. After all writers finish: independent integrity review; resolve findings; verification runner on integrated result. Native rendered tests, contract drift, typecheck, Android export, visual/device checks available, diff/status/preservation. AC9–10.

Steps1–3 safely run in parallel after the interfaces above are settled. Later file ownership will be recorded before assigning writers. No completed phase is a substitute for the full user scope.

## Verification and environments
Focused Jest rendered/model/API tests with real native components and synthetic transport; canonical contract-drift/session tests; mobile typecheck and `npm run export:android`; relevant web checks if shared models are extracted. Android SDK/adb installed, but no connected device/emulator was present at initial check. Determine available emulator before device QA; do not use production data.

Initial baseline: `/tmp/lisno-mobile-parity/initial-status.txt`, `initial-tracked.diff`, `initial-untracked-hashes.json`. Only pre-existing mobile dirty targets are the daily-critical notification control and its test; preserve those corrections when extending them.

Final integrated automated verification is complete. Exact results are recorded below; native device evidence is recorded separately.

## Implementation progress

| Acceptance | Implementation and ownership | Evidence / remaining work |
| --- | --- | --- |
| AC1 | Root: 18 roles, 196 permissions, 437 protected operations; current policy, invitations, typed routes and permission-derived navigation | Final canonical contract rerun passed (3 tests) |
| AC2, AC5 | Configuration worker: Design questionnaire, closure tab, hierarchy intake, My Requests and Super Admin review/configuration | Focused Knowledge/request suites pass; removed visibility editor stays absent |
| AC3 | Client/estimate worker: immutable pre/final reviews and artifacts, requirements, estimate authoring, dynamic rooms, calculations and lifecycle; root invitation/initiation routes | Focused reviews and authoring pass; Lead stage/history/filter integration complete and verified |
| AC4 | Root: versioned Design requirements, workflow forms, furniture/dimension/site evidence, payment queue; Client worker: Design uploads, extraction, drawing mapping/crops, PDF preparation, review/change requests, designer task queue | Focused workflow and Design suites pass; assignment, task and project activity panels integrated |
| AC6 | Procurement worker: sourcing/tenders/awards/order and approval workspaces; execution/Vendor work/completion | Focused API/rendered suites pass; unknown-result/receipt cleanup fixes pass focused regression tests |
| AC7 | Configuration worker: finance/management/users/access/tasks/proxy review; Procurement worker: dashboard drilldowns/personal KPI; root project administration/status/activity integration | Focused suites pass; invoice retry ownership fix passes regression tests |
| AC8 | Client worker: chat mentions/typing/participants/assistant filters/target navigation; root unified inbox and current critical review | Focused suites pass; target message/routing version, pagination and guard regressions added |
| AC9–10 | Root integration, read-only integrity reviewer, independent final verifier and native QA | Final integrated run: 171 suites / 1592 tests passed. Typecheck, contract tests and Android export passed. Page-vs-array query-key collision fixed and regression-tested. Bounded Android Configuration/sign-in walkthrough passed; full device matrix not run |

## Final ownership and review
- Root owns routes, scaffold, project composition, invitations, workflow actions/transport, unified notifications, current critical review, docs and final reconciliation.
- Client worker owns remaining Lead controls/pipeline and estimate Design-preparation integration. Prior Design, estimates and messages batches are frozen.
- Procurement worker owns only final finance invoice ownership, procurement receipt cleanup and command-classification fixes, with focused regressions.
- Configuration worker owns synthetic Android visual QA only; no concurrent product writes.
- Integrity reviewer delivered `/tmp/lisno-mobile-parity/final-integrity.md`: malformed successful-upload uncertainty, invoice version remount, revoked Design scope, critical-task navigation bypass, selected-file cleanup. Each finding has an explicit fix and regression; final targeted re-review confirmed all five resolved.
- The independent verification runner completed full mobile typecheck/tests, canonical contracts, Android export, diff hygiene and baseline preservation after writer freeze. No lint script exists.

## Native verification environment
Isolated Android API37 emulator (`emulator-5556`), Metro8091 and synthetic API4319. Fixture data, logs and screenshots live only in `/tmp/lisno-mobile-parity/`. An initial preview opened the existing local development backend because Expo virtual environment files override shell values. Root then isolated the preview with a temporary development environment override before feature interaction. No production backend was used. The temporary environment override was removed and tracked Metro/export runtime logs restored to baseline after both local preview servers stopped. The tracked router declaration retains the two new deterministic route types, required by this repository’s TypeScript configuration.

No dependencies or lockfiles changed. No backend/web behavior changes, migration, production mutation, live email, staging, commit, push or deployment is part of this implementation.

## Final automated verification
- `cd mobile && npm run typecheck`: exit 0.
- `cd mobile && npm test -- --runInBand`: 171 suites, 1,592 tests passed; one non-failing React act warning.
- `cd mobile && npm run test:contracts`: 3 tests passed.
- `EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 CI=1 npx expo export --platform android --output-dir /tmp/lisno-mobile-parity/android-export`: passed; Android Hermes bundle generated.
- Targeted independent review resolved all five findings; no confirmed remaining blocker in reviewed paths.
- Preservation audit: 120 pre-existing tracked diff sections and 38 untracked file hashes outside mobile/task docs unchanged. No package/lockfile changes.
- Logs/report: `/tmp/lisno-mobile-parity/final-*.log`, `final-integrity.md`, `final-verification.md`. Runtime UI evidence remains separate from automated evidence.

## Native result and remaining certification
Android phone sign-in, role navigation, Configuration hierarchy, Design Yes/No controls and vendor conditional fields, unsaved-change guard/discard, and closure tab verified with synthetic data. Screenshots inspected for Design and its guard. Exact fixture limitations and setup recorded in `/tmp/lisno-mobile-parity/visual-handoff.md`. Full device feature coverage, tablet/font-scale/TalkBack, iOS runtime, native Gradle assembly and live API end-to-end certification remain unrun. The implementation is locally verified within these stated limits; it has not been deployed.
