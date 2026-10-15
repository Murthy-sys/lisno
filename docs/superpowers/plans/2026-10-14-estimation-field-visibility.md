# Main Line estimation visibility implementation plan

Specification: [Main Line estimation visibility](../specs/2026-10-14-estimation-field-visibility-design.md).

Authority: user selected whole-Main-Line visibility and visible quotation prices; standing autonomous execution and Mode A apply. No external actions.

## Dependency-ordered tasks

1. Contract settlement and baseline (root, completed). Capture dirty state; settle aggregate metadata, safe optional Main Line references, defaults and immutable quote policy. Root owns shared/knowledge types/API and durable docs.
2. Implementation (completed; writers frozen). Parallel non-overlapping writers:
   - Backend owner: Main Line model, metadata service/validation/presentation, requirement model/schema/service, relevant API inventory/schema and focused tests. AC1–5. Preserve existing backend dirty files; do not change authorization grants or repository reads. Add replica-set cases for revocation and lineage.
   - Frontend owner: Design visibility panel/workspace integration, Configuration cache sync, client requirements selector/API, staff request display and focused tests. AC1–5. Preserve completed extra-tabs edits in KnowledgeItemWorkspacePage and existing tests. No shared/ or backend/ writes.
   - Root: shared/knowledge/knowledgeTypes.ts and knowledgeApi.ts compatibility additions; integration coordination and docs. No writer overlaps.
3. Independent integrity review after writers finish (integrity_reviewer, completed with all findings fixed and re-reviewed). Examine client projection, races, metadata lifecycle, idempotency, histories, cache/unsaved navigation and authorization. Root resolves confirmed findings with bounded ownership. AC1–5.
4. Final integrated verification (verification_runner after review/fixes, completed). Focused backend transaction/presentation tests and frontend interaction tests, backend/frontend typecheck/build, rendered synthetic browser at desktop/mobile, git diff --check. Record exact outcomes and distinguish the 15 known pre-existing KnowledgeScreens failures. AC1–6.
5. Handoff (root, completed). Inspect final scoped diff; update spec/plan evidence. Report changes, checks, unrun checks and limits. Do not stage, commit, migrate, email or deploy.

## Verification targets

- Backend: ai-estimator-knowledge metadata/model/route regressions; estimate-requirements.replica-set; estimator-catalogue-estimate.replica-set; estimate-client-presentation; unchanged publication/PDF contract tests where proportionate.
- Frontend: dedicated visibility panel + workspace navigation tests; ClientEstimateRequirements; requirement API payload and staff display; shared types and Configuration cache invalidation.
- Build/typecheck in both workspaces. Real rendered radio save/reload and client safe-list selection at 1440px and 390px with synthetic fixtures, no real client data.

## Evidence

Implementation and bounded integrated verification completed. Baseline snapshots: `/tmp/lisno-estimation-visibility/before-implementation-status.txt` and `before-implementation.diff`.

## Integrity review

Completed read-only cross-stack review. Fixed and re-reviewed uncertain metadata writes (including delayed commit/same-version read), pending-save discard navigation, and mixed-field withdrawal preserving original request history. No outstanding confirmed finding. Final verifier owns integrated evidence.

## Final outcome and verification

Implemented one metadata-level Internal/External choice in Main Line → Design; default/legacy/duplicate Internal. Existing authorized staff retain both classes. Client requirements can optionally select eligible External Main Lines through a name-only backend projection with transactional validation and stable references. Customer quote rates, amounts, GST, totals and approval history remain unchanged. No dependencies added or migration required.

Key files: `backend/src/models/AiEstimatorKnowledgeMainLine.ts`, `backend/src/services/ai-estimator-knowledge-item.service.ts`, `backend/src/services/estimate-requirements.service.ts`, requirement model/schema, shared knowledge types/API, `frontend/src/features/ai-estimator-knowledge/KnowledgeEstimationVisibilityPanel.tsx`, workspace/unsaved guard/cache sync, `frontend/src/features/client/ClientEstimateRequirements.tsx`, and `frontend/src/features/leads/StaffEstimateRequirements.tsx`. Related schemas/OpenAPI and regression tests were updated. All previous dirty changes remain intact.

Final backend checks: 411 passed, 2 confirmed baseline failures across 9 selected files. Final frontend checks: 216 passed, 15 confirmed baseline failures across 9 selected files. No new failure names. All new visibility/requirements/guard regressions pass. Backend and frontend `npm run typecheck` and `npm run build` exit 0. `git diff --check` exit 0.

Backend failures reproduce on isolated pre-implementation code: reopened vendor-induction Budget validation (accepted versus expected409) and the legacy Procurement direct basket-creation expectation (403 versus expected201). Frontend failures are the exact same 15 legacy Mode/Overview workspace failures previously recorded, with no additions or removals. Full repository suites and OCR were not run; no lint script exists. Existing Mongoose deprecation, baseline MSW handler warnings and large frontend bundle warnings remain.

Rendered checks: actual components at 1440px and 390px with synthetic API fixtures. Keyboard radios, unsaved protection, pending-save discard lock, versioned save and tab return, client optional selection, basket-change reset, correct ID submission and visible read-only quotation total passed. No overflow, unexpected API requests or application console/page errors. Task browser and Vite server stopped after verification. Real persistence and races are covered separately by replica-set tests.

Full evidence: `/tmp/lisno-estimation-visibility/final-verification.md`, structured `final-backend-tests.json` / `final-frontend-tests.json`, `final-baseline-comparison.json`, `browser-verification.md`, browser result logs and screenshots. Build outputs are ignored in `backend/dist/` and `frontend/dist/`. No production mutation, migration, seed, customer communication, commit or deployment performed.

### Exact selected test commands

Run from `backend/`:

```sh
npm test -- tests/estimate-requirements.replica-set.test.ts tests/ai-estimator-knowledge-models.test.ts tests/api-docs.test.ts tests/estimate-client-presentation.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/estimate-publication.test.ts tests/estimate-pdf-routes.test.ts --reporter=default --reporter=json --outputFile=/tmp/lisno-estimation-visibility/final-backend-tests.json
npm run typecheck
npm run build
```

Run from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeEstimationVisibilityPanel.test.tsx src/features/ai-estimator-knowledge/useUnsavedKnowledgeGuard.test.tsx src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/client/ClientEstimateRequirements.test.tsx src/features/leads/StaffEstimateCollaboration.test.tsx src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/estimates/ClientPublishedEstimate.temporary.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx --reporter=default --reporter=json --outputFile=/tmp/lisno-estimation-visibility/final-frontend-tests.json
npm run typecheck
npm run build
```

Both selected-suite commands exit 1 only for the baseline failures above. Requirements replica-set20/20, catalogue42/42, client presentation23/23, publication27/27 and PDF routes10/10 pass. Visibility panel12/12, guard5/5, client requirements14/14, staff collaboration9/9, mutation sync30/30 pass. Repository `git status --short` checked; generated artifacts are outside the tracked change set.
