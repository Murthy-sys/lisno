# Estimate references and furniture panel: task plan

Source of truth: [approved specification](../specs/2026-09-30-estimate-dimensions-furniture-panel-design.md). Status: approved; Mode A implementation verified locally on 2026-09-30.

## Contract and worktree boundary

- Add optional `estimateDimensions: { lengthFt: number; widthFt: number }` to each canonical `furnitureRooms` room when both approved Estimate values are positive finite numbers. Omit it for missing or invalid room dimensions. The estimate room dimensions are read-only references; actual item measurements and the furniture action payload do not change.
- Use the linked Client-approved Estimate and its existing project/version checks. Preserve room and estimate-item IDs, included-line filtering, point-count mode, configured UOM rules, proof and Client approval gates. Keep memory, Mongo, frontend DTO and OpenAPI aligned.
- Initial worktree status contains the prior Designer upload fix and its specification/plan. The prior edits in `backend/src/repositories/memory.ts`, `backend/src/repositories/mongo.ts` and `frontend/src/features/workflow/projectWorkflowApi.ts` are in scope only where this contract needs an additive edit; preserve their current diffs. The furniture editor, action panel and local CSS are currently clean. No writer may revert, stage or reformat unrelated work.

## Dependency-ordered tasks

| Order | Owner and affected area | Work | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | Primary: baseline and shared contract | Save relevant target diffs and establish a two-project, asymmetric-room test fixture. Record the current absence of estimated room dimensions in `furnitureRooms` and the current dense panel state. Confirm the optional DTO name and feet unit above before writers begin. | AC1, AC3; the source and visual baseline are reproducible without live data. |
| 2 | Backend slice: `backend/src/domain/workflow-estimate-items.ts`, repository types and memory/Mongo implementations, `backend/src/openapi.ts`, focused backend tests | Read and validate room length/width from the canonically linked approved Estimate; add optional room reference to the existing projection, including the no-items context where applicable. Keep selected line-item resolution unchanged. Test missing, malformed, zero/negative values; two projects; excluded items; source/version conflict; memory and replica-set Mongo parity. | AC1, AC5; only valid same-project approved room dimensions are projected, with no write or new persisted field. |
| 3 | Frontend slice: `frontend/src/features/workflow/projectWorkflowApi.ts`, `FurnitureDimensionsEditor.tsx`, `WorkflowStageActions.tsx`, their local CSS and focused tests | Add the optional DTO; present read-only room references and selected estimate items in accessible room/item disclosures; retain all draft fields while collapsed. Reveal/focus the first invalid hidden entry on submit. Refine local drawer spacing, overflow and footer action layout. Preserve UOM nested panel, no-furniture path, evidence, returned drafts and action payload. | AC1–AC4; an eligible Designer can scan the room, expand an item, enter measurements and submit without clipping or lost values. |
| 4 | Primary integration and review | Reconcile backend/frontend shape and existing dirty diffs, inspect complete changes and run an integrity review for source identity, workflow safety, focus and draft persistence. Resolve confirmed issues before final verification. | AC1–AC5; approval and source invariants remain intact. |
| 5 | Final verification | Run focused backend and frontend suites, typechecks/builds and repository hygiene. Render eligible, missing-room-size, returned, blocked and no-furniture states at desktop and narrow mobile widths. Exercise keyboard, disclosure, footer, UOM and validation paths; inspect browser errors and accessibility output. | AC1–AC5; report exact passed/failed checks and any limitation. |

After task 1 settles the optional field, tasks 2 and 3 can run in parallel with non-overlapping file ownership. The backend owner alone edits backend files, including the previously dirty repository files. The frontend owner alone edits frontend files, including the previously dirty DTO. The primary owns this plan, cross-layer decisions, integration and final handoff. In Mode A, use native implementation subagents for tasks 2 and 3, then an integrity reviewer and verification runner sequentially. In Mode B, the primary performs the same slices and review inline.

## Verification matrix

- **Projection and source:** approved room `10 × 12 ft` is returned for its own project and matched by room ID; a different project, draft estimate or excluded line contributes nothing. Missing/invalid size omits only the reference while items and declaration stay available. Memory and Mongo give the same result.
- **Form behavior:** room and item summaries show exact approved references; item dimensions or point count remain blank at first entry; returned data restores by estimate item ID; collapsing, switching rooms and adding a UOM preserve unsaved values. Hidden invalid fields open with usable focus/error guidance. Submission still sends only actual values, UOM IDs, selected room IDs and existing proof/note fields.
- **Review and failure:** no-furniture declaration, required evidence, stale version/source, inactive UOM, point-only items, Client review/approval, and missing workflow response retain existing controls and backend enforcement.
- **Rendered interface:** long room/item/specification names and large quantities fit the panel at 1280px, 390px and a narrow 320px viewport; footer labels are fully readable, body scroll is independent, fields and Add UOM fit, and focus order and screen-reader labels are clear. Include an enlarged-text check and an accessibility scan.

## Commands and evidence to collect

```text
cd backend && npm test -- tests/workflow-estimate-items.test.ts tests/design-workflow-state.test.ts tests/api-docs.test.ts
cd backend && npm test -- tests/design-workflow-state.replica-set.test.ts
cd frontend && npm test -- src/features/workflow/WorkflowStageActions.furnitureScope.test.tsx src/features/workflow/WorkflowStageActions.pointCounts.test.tsx src/features/workflow/WorkflowStageActions.submitBlocker.test.tsx src/features/workflow/FurnitureUomField.test.tsx
cd backend && npm run typecheck && npm run build
cd frontend && npm run typecheck && npm run build
git diff --check && git status --short
```

Add or update focused editor/disclosure tests in the frontend suite and run them with the commands above. Broaden only for a confirmed cross-workflow regression. Run browser QA against deterministic local responses if a suitable local project cannot be exposed safely; distinguish that from a live-project check. No migration, seed, deployment, commit, push or customer communication is included.

## Completion record

- **AC1 and AC5:** `backend/src/domain/workflow-estimate-items.ts`, repository types/memory/Mongo projections, and OpenAPI add the optional approved room size. Backend focused/API tests passed 413/413, adjacent workflow tests 65/65, and Mongo replica-set tests 76/76. Both backend typecheck and build passed. No persisted schema, write API, or migration changed.
- **AC1–AC4:** `frontend/src/features/workflow/projectWorkflowApi.ts`, `FurnitureDimensionsEditor.tsx`, `FurnitureUomField.tsx`, `WorkflowStageActions.tsx`, and scoped CSS expose approved references, accessible disclosures, preserved actual drafts, invalid-field focus, and a readable footer. Frontend focused tests passed 172/172; frontend typecheck and build passed.
- **Rendered QA:** A deterministic local fixture was rendered at 1280×720, 390×844, and 320×640. Eligible, returned, missing-reference, blocked and no-furniture states were inspected. Room/item disclosure, independent body scroll, nested Add UOM blocker, required-proof validation, footer, and 150% root text at 320×640 were checked. No horizontal overflow or browser console error was observed. Axe returned zero violations for the open eligible panel at desktop and 320px. The temporary fixture was removed after QA.
- **Integrity and hygiene:** A separate integrity review confirmed canonical approved-Estimate lineage, unchanged selected-item filtering and stable IDs, existing furniture action payload and approval/version/proof behavior, and preservation of prior Designer upload edits. `git diff --check` passed. No live customer project, production API, full repository test suite, commit, deployment, seed, or migration was run. Mongo emitted existing Mongoose option deprecation warnings and the Vite build warned about chunks above 500 kB; all checks completed successfully.
