# Client estimate visibility implementation plan

Source: [specification](../specs/2026-10-26-client-estimate-line-visibility-design.md).

1. Inspect source, establish separate boolean contract, confirm screen-only scope and unchanged totals. Complete.
2. Implement independent slices in an isolated source snapshot:
   - Frontend owner: Overview radio, tracked field, conflict review, saved summary and focused tests.
   - Backend authority owner: validation/OpenAPI, current catalogue, estimate persistence, frozen publication flag and authority tests.
   - Client projection owner: complete outward snapshot filtering, comparison IDs and assistant financial reconciliation tests.
   - Integration owner: docs, client rendering/empty-state regressions, visual QA and final verification.
3. Integrate after writers finish, audit cross-layer propagation and immutable/full internal scope. Run focused tests, replica-set integration, typechecks and builds. Review financial totals and unchanged PDF behavior explicitly.
4. Verify actual rendered Overview radios and projected client rows/totals using synthetic local fixtures. Do not mutate live user records.
5. Compare final changes against captured baseline, apply only changed source files through a hash-guarded copy, and verify destination bytes and repository diff hygiene.

All implementation slices must use `clientVisible`, default absent values to true, and preserve full persisted snapshots and PDF rows. No shared file may have simultaneous owners. The user has authorized autonomous normal project changes; no additional workflow approval gates are introduced.

## Verification results

- Backend: 438 tests passed across validation, OpenAPI, review models/service, catalogue/estimate replica-set, publication/unit and replica-set, client presentation, assistant/unit and replica-set, and PDF/rendering and route suites. Commands use `npm test -- tests/<suite>.test.ts`; logs are `/tmp/lisno-client-visibility-backend-authority.log`, `/tmp/lisno-client-visibility-backend-publication.log`, and `/tmp/lisno-client-visibility-final-presentation.log`.
- Frontend: 113 tests passed across Overview, conflict review, shared payload/summary, published estimate visibility/temporary items, and ClientProject estimate review using `npm test -- --configLoader runner <seven test files>`. Log: `/tmp/lisno-client-visibility-frontend-final-tests.log`. Additional saved-summary consumer checks passed during implementation.
- Backend `npm run typecheck` and `npm run build` passed. Frontend standalone TypeScript and `npm run build` passed; Vite retains its existing large-chunk advisory.
- Chrome, synthetic local fixture: Yes default, No editing, local save/reload, read-only controls, keyboard arrow selection, screen-hidden row with unchanged total, all-hidden breakdown, and 390px layout checked. No live user records changed. Fixture server and tabs cleaned up after verification.
- Independent integrity review found no material propagation, authorization, financial or history issue.
- Full unrelated test suites and production runtime verification were not run. No migration, deployment, commit, push, or dependency additions.
