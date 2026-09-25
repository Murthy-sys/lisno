# Mobile Configuration parity implementation plan

Specification: [Mobile Configuration parity](../specs/2026-09-25-mobile-configuration-parity-design.md).

Parent task: implement mobile parity with the current frontend Configuration.

1. Complete independent mobile and frontend audits; capture clean baseline. Root owns contracts, integration and specification. Done.
2. Root extracts pure shared modules/API factory, adds native feature UI/query adapters, and publishes editor contracts. No behavioral changes to frontend.
3. Parallel independent writers after contracts are available:
   - Catalog writer: KnowledgeCatalogWorkspace, native catalog management, navigation labels and focused catalog tests.
   - Mode writer: native Mode editor/calculation simulators/specification editor and focused tests.
   - Rules writer: native Recommendation/Exclusions and basket Quality editor/workbook adapter and focused tests.
   - Root: native item workspace/save/guard/history/summary/Overview, shared domain modules and dependency/config files.
4. Integrate and verify each acceptance criterion; resolve contract issues centrally. All writers preserve other edits and use explicit non-overlapping paths.
5. Independent integrity review on completed integrated changes, resolve findings, then final verification runner. Run focused mobile UI/domain tests, typecheck and Android export, shared frontend tests/typecheck/build and rendered mobile layout/interaction checks.
6. Update mobile parity documentation, record exact results and limits, check final diff/hygiene, close task-owned QA tools. No commit/deployment/production writes.

## Integrated result and verification

Implementation tasks 1–4 are complete. Independent integrity review closed the applicability-transition and native XLSX actual-inflation findings. Final verification ran after the fixes. Documentation is updated; no backend routes, schemas or authorization rules changed.

### Principal changes

- Mobile navigation/fallback label is Configuration. Catalog grouping, all filters, paging, item creation/lifecycle, Main/Sub-Basket management and reusable-value screens now use the frontend contracts.
- Native Overview, Mode, Recommendation & Exclusions and shared Quality editors are integrated with history, saved summaries, captured versions, sequential Mode saves, explicit conflict review and pending-navigation protection.
- Reusable vendors include organization/bank/contact profiles, GST/MSME conditions, policy-bound certificates/photos, allocation baselines and frozen retries for uncertain writes.
- Frontend pure API/validation/presentation/workbook logic moved to `shared/knowledge`; existing frontend imports re-export it. Mobile uses the same conversions and server calculations.
- Mobile adds ExcelJS 4.4.0 for the existing XLSX format and direct pako 1.0.11 (already an ExcelJS dependency) for incremental, bounded ZIP preflight. No inflated archive output is retained during preflight.

### Checks

| Command / evidence | Result |
| --- | --- |
| Mobile `npm test -- --runInBand src/features/knowledge` | 14 suites, 75 tests passed |
| Frontend `npm test -- src/features/ai-estimator-knowledge/knowledge*.test.ts src/features/procurement/vendorProfileDraft.test.ts` | 28 files, 517 tests passed |
| Mobile and frontend `npm run typecheck` | Both passed |
| Mobile `npm run export:android` | Passed; Hermes bundle produced |
| Frontend `npm run build` | Passed; existing large-chunk warnings |
| Mobile `npm test -- --runInBand` | 945 passed, one pre-existing contract-count failure; process required interruption after Jest's open-handle warning |
| Isolated mobile `npm test -- --runInBand scripts/contract-drift.test.ts` | 2 passed, one pre-existing failure: expected 241 operations, canonical inventory has 245 |
| Broad frontend Configuration run | 1,493 passed, 19 failures; all 19 reproduced identically at isolated HEAD a57916a |
| Rendered native components via isolated React Native Web fixture | Catalog and four tabs inspected at phone width390; four tabs checked at320 and900 with no horizontal document overflow. Selector/tab/Quality editor interactions inspected with synthetic data. No runtime console errors in the final harness |
| `git diff --check` | Passed |

The mobile contract-count test, mobile operation contract and backend registry are byte-identical to HEAD. Baseline evidence and exact logs are in `/tmp/lisno-mobile-configuration-qa/`, including `frontend-baseline-comparison.md`, `final-mobile-contract-baseline.log` and `final-*.log`. Screenshots and task-owned browser logs were moved out of the worktree to `/tmp/lisno-mobile-configuration-qa/rendered/`; bundle outputs are `mobile/dist/android/` and `frontend/dist/`.

### Acceptance trace and limits

AC1–2: navigation change, catalog/vendor/baseline rendered tests. AC3–4/8–9: ItemWorkspace and workspace-draft tests cover read-only controls, original versions despite refresh, failed-save retention, conflict review and guarded navigation. AC5: Mode editor/model/simulator tests cover independent hidden drafts, exact paise/bps values, server reconciliation and stale-preview cancellation. AC6: Recommendations and native-rules tests cover stable targets. AC7: Quality/editor/workbook/archive tests cover independent basket versions, import review, saved-only export and malformed/oversized ZIP rejection. AC10: typechecks, bundles, shared regressions and responsive synthetic rendering recorded above.

Actual Android file-picker/sharing end-to-end, native Hermes responsiveness, TalkBack/200% font scaling/physical-device certification, iOS builds and isolated live-backend integration were not performed. An emulator was detected, but its existing session was left untouched. Browser rendering is not evidence of native OS behavior. Existing test failures and the full-run open handles remain outside this change. No lint script exists.

Concurrent unrelated project UI edits and tracked Expo log changes were preserved. No commit, push, deployment, production mutation, seed, migration or external message was performed.
