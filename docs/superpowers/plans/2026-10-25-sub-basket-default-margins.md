# Sub-basket default margins implementation

Specification: [design](../specs/2026-10-25-sub-basket-default-margins-design.md).

1. Root: inspect existing architecture and define API contracts and source/margin semantics. Complete.
2. Backend owner: implement whole-sub-basket summaries, atomic audited apply using existing revision/section validation, concurrency checks, route authorization and API documentation. Add focused replica-set and route tests. Complete.
3. Frontend owner, parallel with backend after shared contract: header controls, accessible review/apply, full query synchronization, responsive states and focused component/index tests. Complete.
4. Root: shared transport helpers and durable brief; integrate independent slices, inspect preservation and failure paths, run integrity review. Complete.
5. Root/reviewer: run focused tests, types/builds, responsive browser interaction and accessibility checks. Fix issues before applying. Complete in the isolated copy.
6. Root: prepare source-only patch, verify original target files are unchanged, obtain sandbox authorization and apply to lisno. Verify final diff and report exact checks. No commit or deployment. Prepared for sandbox-authorized delivery.

Verification maps to all acceptance criteria: full population/stable source/draft precedence/zero and missing values; per-mode comparison and field preservation; active-history protection; stale previews/foreign baskets/unauthorized users; atomic rollback; rendered controls and review/apply; responsive layout and keyboard focus; existing index/API/registry regressions; frontend/backend typechecks and builds. Replica-set testing uses synthetic local data only. No configured live database is used.


## Verification results

- Frontend: `npm run typecheck` and `npm run build` passed. Focused Vitest run covering `KnowledgeSubBasketMargins`, `KnowledgeIndexPage`, `KnowledgeBasketCard`, `knowledgeApi`, and `knowledgeMutationSync`: 125 passed. Deletion/display-order consumers: 69 passed.
- Backend: `npm run typecheck` and `npm run build` passed. `npm test -- tests/ai-estimator-knowledge-sub-basket-margins.replica-set.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-integration.replica-set.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts`: 410 passed, two failures. All new margin and existing integration tests passed.
- Both backend failures reproduce in clean original-source copies: Procurement basket creation expects 201 but receives 403; reopened vendor induction Budget test expects rejection but resolves.
- Broader frontend `KnowledgeScreens` suite has 16 existing-area failures (Specifications selectors and temporary-item index). Two representative failures reproduce in the untouched-source baseline; full baseline rerun was blocked by a Vite cache permission error. These unrelated failures are not presented as passing.
- Browser QA uses synthetic fixtures only: desktop (1663px), mobile (390px), PMC apply changes its count to zero while other modes remain mismatched, In-house review displays both margin pairs, no runtime errors, no horizontal overflow, and zero axe violations for the mobile header and open panel. Additional 320px, 768px and 1280px overflow checks and Escape focus restoration passed. Component tests verify read-only/error/empty/stale-token recovery, duplicate-submit guards and focus restoration.
- Independent integrity review passed after fixing unrelated malformed-field preservation and creation/rename summary invalidation.
- No lint script exists. No dependencies, migration, activation, commit, deployment or live data mutation.

Temporary logs/artifacts: `/tmp/lisno-sub-basket-margin-backend-final.log`, `/tmp/lisno-margin-backend-baseline.log`, `/tmp/lisno-margin-backend-baseline-item.log`, `/tmp/lisno-margins-frontend-build.log`, `/tmp/lisno-margins-backend-build.log`, `/tmp/lisno-margin-desktop.png`, `/tmp/lisno-margin-panel.png`, `/tmp/lisno-margin-mobile-controls.png`, `/tmp/lisno-margin-mobile-panel.png`. Synthetic QA entry and build artifacts are excluded from the source patch.

## Saved-configuration comparison refinement

1. Root: capture the current files and make per-mode comparison require a configured saved Mode section with complete valid margins. Preserve stable source selection and the complete concurrency snapshot. Implemented in the isolated copy.
2. Root: update review copy and cover unsaved/empty items, partial modes, saved zero, missing sections/revisions, draft precedence and apply preservation with focused tests. Complete.
3. Independent reviewer: inspect eligibility and preservation. Complete. Root verification passed: 24 backend replica-set tests, 68 frontend component/index tests, and both typechecks/builds. Source delivery uses target hash checks and a reload of the existing local backend, with no margin-data mutation.

The regression failed before the fix and passed afterward for both estimation and temporary items. The existing 20–30% versus 20–35% configured Sub-vendor regression still passes. Logs: `/tmp/lisno-unconfigured-margins-{repro,backend-tests,backend-build,frontend-tests,frontend-build}.log`.
