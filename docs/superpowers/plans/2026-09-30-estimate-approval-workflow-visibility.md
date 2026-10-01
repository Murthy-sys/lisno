# Estimate approval gate for Project progress: task plan

Source of truth: [approved specification](../specs/2026-09-30-estimate-approval-workflow-visibility-design.md). Status: approved; Mode A implementation verified locally on 2026-09-30.

## Contract and existing work

- Add `estimateApprovalStatus?: "approved" | "awaiting_approval" | "source_issue"` to the design-workflow response. The server populates it from its canonical project-linked approved-Estimate context; older responses that omit it do not display progress. Both Client portal and proof-backed Admin on-behalf approvals converge on the existing `client_approved` source.
- Render `ProjectWorkflowProgress` only for literal `approved`. Keep other project content and backend action authorization as they are. No persisted field, migration, new endpoint or estimate decision rule is needed.
- The initial worktree is dirty with the earlier Designer upload and furniture-panel work. `backend/src/services/project.service.ts` already contains a space-planning source-issue wording change; `frontend/src/features/workflow/projectWorkflowApi.ts` already contains furniture dimensions and completion blocker fields. Preserve these edits and all other unrelated paths. Save a fresh status and relevant per-target diff before any writer begins.

## Dependency-ordered tasks

| Order | Owner and affected area | Work | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | Primary: baseline and shared contract | Record the dirty-path set and current diffs for each assigned target. Reproduce the preapproval six-locked-stage render using the existing panel fixture. Set the exact status spelling and response semantics above for both writers. | AC1, AC3; current failure and source-of-truth behavior are documented without touching product code. |
| 2 | Backend owner: `backend/src/services/project.service.ts`, approved-source helper if needed, `backend/src/openapi.ts`, focused backend tests | Resolve the canonical approved Estimate for the requested project on each workflow read. Return `approved`, `awaiting_approval` or `source_issue` using existing context/version rules; catch only the established repository source conflict. Preserve initial-payment behavior and the pre-existing source-issue wording. Cover zero rooms, distinct projects, conflicting sources and legacy payment receipt. | AC2, AC3, AC4; only a valid same-project approved source marks the response approved, without changing workflow actions or persistence. |
| 3 | Frontend owner: `frontend/src/features/workflow/projectWorkflowApi.ts`, `ProjectWorkflowPanel.tsx`, `ProjectWorkflowPanel.test.tsx`, approval mutation paths and their tests | Align the optional DTO with the backend field. Hide the shared progress and portal before approval, while preserving other panel content and open forms after a failed refresh of previously approved data. Invalidate `projectWorkflowKeys` after Client portal and Admin on-behalf Estimate approval; verify existing approval paths that already invalidate the key. Test missing field, pending, source conflict, approved, refresh and presentation modes. | AC1, AC2, AC4, AC5; no stage UI appears early and it appears promptly after either valid approval. |
| 4 | Primary integration and integrity review | Compare backend/frontend status semantics and inspect the full diff against the initial dirty baseline. Review project identity, immutable approval lineage, source conflicts, authorization, caching/invalidation, stale data, and preservation of prior work. Resolve confirmed defects before final tests. | AC1–AC5; the display rule is based on server-confirmed approval and no existing action gate is weakened. |
| 5 | Final verification | Run focused source, API contract, panel and approval-invalidation tests, then typechecks/builds and adjacent regressions. Render pending and approved states at desktop and mobile widths, including the timeline portal; inspect loading/error and console/accessibility behavior. Finish with `git diff --check` and `git status --short`. | AC1–AC5; provide exact results, unrun checks and any remaining limitation. |

After task 1 fixes the shared field contract, backend and frontend tasks can run in parallel because they own non-overlapping paths. The backend owner alone edits backend files, including the dirty project service. The frontend owner alone edits frontend files, including the dirty DTO. The primary owns cross-layer decisions, documents and final reconciliation. In approved Mode A, use native non-overlapping implementation agents, followed sequentially by an integrity reviewer and verification runner. In Mode B, the primary performs those slices and checks inline.

## Verification matrix

- **Approval source:** two unequal projects, one with a Client-approved Estimate and one unapproved; proof-backed Admin on-behalf approval has the same eligible result. Neither cross-project linkage nor a draft, sent, changes-requested, missing or ambiguous source can set `approved`. A valid approved source with zero rooms remains eligible. An old `initialPaymentAt` alone does not confer eligibility.
- **API and compatibility:** response status is one of the three documented values; OpenAPI and TypeScript agree. A frontend response missing the field stays hidden. Existing payment, furniture, space-planning and workflow action fields retain their behavior.
- **Presentation:** before approval, no Project progress heading, stage timeline, portal navigation, details or action controls render in full, Client and Designer modes. After approval, the same workflow reappears. Initial loading/error does not flash stages; a failed later refresh preserves a previously approved open form and displays the existing stale warning.
- **Refresh:** Client portal and Admin on-behalf approval success invalidates the project workflow query; requesting changes does not make the timeline visible. Existing periodic refetch still sees an approval recorded in another session.
- **Rendered check:** inspect one desktop and one narrow viewport for pending and approved states, including a caller that uses `timelineContainer`. Check that other project content remains present and no browser console or accessible-name regression appears.

## Commands and evidence

```text
cd backend && npm test -- tests/design-workflow-state.test.ts tests/project-workflow.test.ts tests/api-docs.test.ts
cd backend && npm test -- tests/design-workflow-state.replica-set.test.ts
cd frontend && npm test -- src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/admin/ClientResponseDecisionDialog.test.tsx
cd backend && npm run typecheck && npm run build
cd frontend && npm run typecheck && npm run build
git diff --check && git status --short
```

Adjust focused test filenames to the actual edited tests. Broaden to the Client, Designer and workflow suites only for a concrete cross-screen risk or shared-contract regression. Browser QA may use deterministic local responses; distinguish it from a live customer-project check. Do not run a seed, migration, deployment, commit or push.

## Completion record

- **AC1–AC4:** `backend/src/services/project.service.ts` returns approval visibility from the canonical project-linked approved Estimate; `backend/src/openapi.ts` documents the optional rollout field. `frontend/src/features/workflow/projectWorkflowApi.ts` accepts the field, and `ProjectWorkflowPanel.tsx` mounts progress only for literal `approved` with a matching project ID. Other panel content and backend action rules remain unchanged.
- **AC2 and AC5:** `EstimateReviewPanel.tsx` and `ClientResponseDecisionDialog.tsx` invalidate workflow queries after successful Client and proof-backed Admin approval. Designer approved-project test fixtures were updated to include the new status; prior upload and furniture changes were preserved.
- **Integrated checks:** Backend focused tests passed 357/357 and Mongo replica-set tests 63/63. Frontend focused/adjacent tests passed 62/62 after correcting eight stale-fixture failures from the first run. Both backend and frontend typechecks and builds passed; `git diff --check` passed. Mongo emitted a Mongoose deprecated `new` option warning, and the frontend build retained its over-500 kB chunk warning.
- **Rendered QA:** A temporary local fixture showed no progress or portal before approval or for missing/source-issue status, then showed the six-stage timeline after approval in full and Client portal modes at 1280×720 and 390×844. There was no horizontal overflow or browser console error; axe reported zero violations in the inspected pending and approved states. The fixture was deleted.
- **Limits and external actions:** No live customer project, full repository suite, OCR checks, migration, seed, commit, push or deployment was run. The new status has memory-backed end-to-end service coverage and Mongo approved-source coverage; no new Mongo end-to-end workflow response assertion was added.
