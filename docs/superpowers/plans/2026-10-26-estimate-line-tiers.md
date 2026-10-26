# Estimate line tiers implementation plan

Source: [specification](../specs/2026-10-26-estimate-line-tiers-design.md).

1. Inspect pricing, current revisions, client authority and downstream lineage. Complete. User confirmed per-line selection.
2. Preserve the current dirty Lisno tree in `/tmp/lisno-estimate-tiers`; baseline hashes include the earlier Configuration feature. Complete.
3. Parallel implementation with explicit ownership:
   - Backend core: catalogue, working save/storage, source validation, design scope and OpenAPI.
   - Frontend: Sales line controls/helpers and client working-tier panel, safe API contracts and frozen tier labels.
   - Downstream: publication/PDF, procurement and assistant price-source protection.
   - Integration owner: narrow client service/router, authorization/audit integration, transaction regressions and durable docs.
4. Integrate and review selected-tier pricing, legacy omission preservation, hidden-client rules, dependency fences and immutable approvals. Run focused tests, typechecks and builds.
5. Verify actual rendered desktop/mobile controls with synthetic data. Check for unsaved live browser edits before applying source changes. Guarded copy only changed task files, then restart the local source server so validation is current. Verify destination hashes and diff hygiene.

No deployment, commit, push, dependency change, seed or production migration. User's explicit autonomous implementation instructions govern normal changes; filesystem boundaries still require tool escalation.

## Implementation and verification record

Implementation and independent reviews are complete. No new dependencies or lockfile changes. Verification used an isolated copy with installed dependency links and disposable Mongo replica sets.

- Core catalogue/save, pricing metadata and collaboration: 91 passing tests; OpenAPI: 65 passing tests after updating the expected route count for the two new endpoints.
- Client tier service: 11 passing replica-set tests, including hidden totals, unresolved-source privacy, saved incomplete lines, permission scope, stale configuration, simultaneous saves, locked reviews and explicit In-house selection.
- Authorization, frontend permission parity, route inventory and server: all passed in the five-suite root run (148 tests including the earlier nine client cases); the final client run adds two privacy cases.
- Publication, frozen client models/presentation, PDF, assistant and procurement: 247 focused tests plus 85 follow-up integration tests passed (some overlap).
- Web: 140 affected tests across 11 files passed, followed by 43 tests covering the requirement-query invalidation and client flows. Backend and frontend TypeScript/builds passed.
- Native compatibility: 47 focused tests passed, followed by the final 20-test model rerun; native TypeScript passed. No native binary build was required for these compatibility changes.
- Browser QA: actual Sales builder and Client tier panel, synthetic local data only, at desktop and 390px width. Verified unequal tier prices, unavailable Functional choice, destination component selection, save/reload and conflict handling. No runtime console errors; only the React DevTools informational message. Fixture files are excluded from delivery.
- Existing live Overview was saved (Save Overview disabled) before source application. No live estimate tier selections were changed during QA.

Focused checks cover the changed financial and permission boundaries. Full unrelated repository suites were not rerun. Existing frontend build chunk-size advisory remains. No deployment, migration, seed, commit or push was performed.
