# Recommendations and Quality reference redesign — task plan

Date: 2026-09-15  
Status: Implemented and reviewed; verification results and limits recorded below.  
Execution mode: A — parallel sub-agents, explicitly selected by the user.

### Progress

- T1 complete: clean implementation baseline at `30c88ac291f63a36c7b79e6917b3481323b89dbf`; 81 focused tests passed across five files. Baseline source snapshot is `/tmp/lisno-recommendations-quality-qa/baseline/frontend`.
- T2/T3/T4 and source integration complete. Recommendations lane passed 142 tests including the adapted workspace flows; Quality lane passed 176 tests; rail/layout lane passed 20 tests. Integrated TypeScript check passed.
- T6 complete: reviewer findings fixed (quality validation focus and simpler Exclusions columns). Browser review also corrected role-theme typography overrides, mobile checkbox sizing and the narrow-screen save bar.
- T7 checks complete with recorded limits: 384 focused tests and TypeScript/build passed; the full frontend suite has six failures reproduced on the clean baseline. Browser checks passed across the specified widths, except 200% text zoom could not be applied with the browser tool and remains unverified.

Specification: [Approved design](../specs/2026-09-15-recommendations-quality-reference-redesign-design.md).

## 1. Approved outcome and boundaries

Implement **Approach 1: redesign using existing behavior** for Recommendation & Exclusions and Quality Parameter. Match the references' compact tables, colored section headers, focused editing and contextual rail, with the supported-feature adaptations listed in the specification.

Preserve:

- Overview and Modes content, controls, layout, saving, calculations and existing context summaries.
- Existing tab labels, order, identities and count: four on a regular item, three on a temporary item.
- Backend contracts, permissions, stable IDs, revision/version checks, shared Main Basket quality ownership, existing Excel workflows and saved history.

The **tab strip alone** may change visually across all tab selections: clean background, thin baseline, compact spacing and a selected underline. Preserve its keyboard behavior, guarded navigation and current mobile selector.

Excluded: new AI services or generation controls, image upload/preview infrastructure, named-template management, new policy settings, hold points, automatic estimate changes, backend/schema changes, dependencies and lockfile changes. No commits, pushes, deployments, seeds or production mutations.

## 2. Current evidence and implementation shape

- Initial implementation source tree was clean. At plan preparation the only dirty path was the new specification; the user's selected approach and preservation boundaries have now been recorded there. Recheck before writers begin.
- `KnowledgeBudgetAlterationBuilder` owns related-item catalog loading/creation and current rule editing; keep its public props and callbacks stable while replacing its default presentation.
- `KnowledgeBasketQualityPanel` owns loading, draft baseline, saving, conflicts, import/export and pending-change publication. Keep that ownership and its imperative `save`/`discard` interface.
- `KnowledgeSectionEditor` is shared across sections. Limit any changes to quality field extraction and Recommendations-specific presentation; never change Overview, Mode, pricing or quantity behavior.
- `KnowledgeItemWorkspacePage` owns navigation and the shared rail. Add explicit section-scoped presentation hooks; preserve the Overview/Mode render branches and default rail subtree.
- `KnowledgeSectionNavigation` already handles roving focus, Arrow keys, Home/End, guarded selection and mobile selection. Prefer CSS changes for reference styling.
- `ContextPanel`, `Dialog`, `Drawer`, buttons and form fields already provide reusable accessible controls. Reuse them without modifying global primitives.

The first task establishes shared adapters and ownership boundaries. After that, Recommendations, Quality and workspace styling can progress independently in Mode A. Mode B performs the same tasks inline.

## 3. UI and draft contract to preserve

### Recommendation presentation

- Required additions: `trigger=added`, `action=add`, `requirement=must`.
- Probable additions: `trigger=added`, `action=add`, `requirement=can`.
- Exclusions: `trigger=added`, `action=remove`, preserving `must/can`.
- Removal-triggered rules: retain each original ID and expose them in **Other scope rules**. Per the user's follow-up, Trigger and Removal guidance columns are removed from the tables; the side panel retains trigger and scope-action editing.
- Older recommendations/exclusions remain visible and editable as existing notes.
- Add actions initialize existing fields only. Group-specific defaults must not rewrite existing rows. Offer **Add other scope rule** so all existing trigger/action combinations remain authorable.
- Use **Required addition/removal**, **Optional addition/removal**, and actual trigger/applicability text. No Auto add, Cascade remove, Replacement or Incompatible state is inferred.
- Summaries distinguish unsaved changes, disabled rules and unresolved targets. Do not mark draft rows as saved or valid just because they were added.

### Quality presentation

- One canonical `parameters` draft remains in `KnowledgeBasketQualityPanel`.
- Table filtering produces a view of the complete draft; changes always target stable IDs in the complete array. Preserve original row order and hidden rows.
- Canonical stage options follow the reference. Preserve arbitrary legacy stage strings and unset values without rewriting them.
- Add/edit panels use existing quality fields and validators. Existing question/type/options/criteria/photo behavior is extracted or reused, including cleanup of incompatible values on answer-type change.
- Expose stage, instructions and check method through the focused editor. Keep existing detailed evidence and other legacy fields intact.
- Display answer type and inspection method distinctly. All required/active policy flags retain their current normalization.
- Reorder acts on the full checklist. Disable reordering while a stage filter is active with a clear explanation, so a filtered subset cannot silently reorder hidden rows.

### Focused editing and save behavior

- Editors update the existing section/checklist local draft as fields change. Do not introduce a second persisted copy or an independent API save per row.
- **Done** closes the focused editor while retaining the local draft. Explain that the section/checklist Save action persists changes; closing is not saving to the server.
- New incomplete rows remain recoverable, editable and removable. A section save validates all rows and reveals/focuses the first relevant error, including one hidden by a filter or closed editor.
- Workspace discard restores the established baseline. Related catalog items already created remain independently persisted, as today.
- Preserve loading, failed refresh, partial/unavailable catalogs, read-only, archived, saving, conflict, failed save and retry states.

## 4. Ownership and dependency graph

Paths below are relative to `frontend/src/features/ai-estimator-knowledge/` unless stated otherwise. New filenames are proposed within this bounded feature; reuse an equivalent existing module if discovered before writing.

| Task | Owner in Mode A | Owned files/responsibility | Dependencies | Criteria |
| --- | --- | --- | --- | --- |
| T1: Baseline and shared integration contract | Primary | Baseline evidence; bounded `KnowledgeSectionEditor.tsx` extraction; initial shared interfaces | Approved plan and execution choice | AC1, AC3, AC5, AC8 |
| T2: Recommendations tables and editor | Frontend implementer, Recommendations slice | `KnowledgeBudgetAlterationBuilder.tsx`, its tests; optional `KnowledgeRecommendationRuleEditor.tsx`, `knowledgeRecommendationPresentation.ts`, associated tests and `knowledge-recommendations.css` | T1 | AC2, AC3, AC6, AC7 |
| T3: Quality table and editor | Frontend implementer, Quality slice | `KnowledgeBasketQualityPanel.tsx`, its tests; `KnowledgeQualityParameterFields.tsx`, `KnowledgeQualityChecklistEditor.tsx`, `knowledgeQualityPresentation.ts`, associated tests and `knowledge-quality-workspace.css` | T1 | AC4, AC5, AC6, AC7 |
| T4: Tab strip and contextual rails | Primary | `KnowledgeItemWorkspacePage.tsx`; optional new `KnowledgeReferenceContextRail.tsx`; `knowledge-reference-workspace.css`; only required navigation markup hooks | T1 | AC2, AC4, AC6, AC8, AC9 |
| T5: Integrated preservation and regression fixes | Primary | Shared `KnowledgeSectionEditor.tsx`, workspace tests, `KnowledgeScreens.test.tsx`, any necessary bounded integration fixes and feature documentation | T2, T3, T4 | AC2–AC9 |
| T6: Integrity review | Read-only integrity reviewer | Integrated diff review; no source writes | T5 | AC3, AC5–AC8 |
| T7: Final verification and handoff | Verification runner; primary handles visual assessment/fixes | Integrated checks and evidence; no product-source edits by runner | T6 findings resolved | AC8–AC10 |

Implementation graph: `T1 → (T2 || T3 || T4) → T5 → T6 → T7`.

Use a single parent implementation task with one current phase. T2/T3/T4 are children of that phase. No subagents are started before the user selects Mode A. Mode B keeps all work, review and verification in the primary thread.

Every writer must receive explicit ownership and be told they are not alone in the codebase, must not revert others' edits, and must return cross-boundary needs to the primary. Only the primary changes shared workspace/editor/test files. Once T1 creates any extracted quality field module, ownership transfers to T3 until it finishes.

## 5. Dependency-ordered tasks

### T1 — Establish baseline and shared integration contract

1. Capture `git status --short`, current HEAD and relevant target diffs. Preserve unrelated changes and re-evaluate ownership if new dirty targets appear.
2. Capture the current Recommendations, Quality, Overview and Modes appearance with an authorized local session or a disposable local fixture-backed browser harness. Never seed or alter user configuration to obtain screenshots.
3. Confirm baseline tests for the affected builders, shared quality panel and workspace pass; record pre-existing failures separately.
4. Freeze existing Recommendations props and Quality panel handle/callback signatures. Keep their current persistence owners.
5. If needed, extract the current `QualityRow` fields from `KnowledgeSectionEditor` into `KnowledgeQualityParameterFields.tsx` without altering their default behavior. Define optional inspection-metadata controls for the new Quality editor. Keep its existing answer-type cleanup and photo-count handling.
6. Agree section-specific CSS class names for Recommendations and Quality, and a tab-strip-only selector. No general `.knowledge-page`, `.ui-surface`, form control or shared panel overrides may change protected tabs.

Deliverable: evidence and stable integration interfaces for parallel work. Verify any extraction against the existing quality-field regressions before T3 starts.

### T2 — Rebuild Recommendations presentation

1. Replace the always-expanded rule forms with three reference-styled groups and compact tables. Keep empty-state headings and group add actions.
2. Build pure row grouping/summary helpers with stable IDs; retain disabled rows and all removal-triggered combinations.
3. Move existing rule editing into a focused panel. Preserve Basket/Sub Basket pagination, current target filtering, saved unavailable selections, related/temporary creation, editorial starters and delayed-response protection.
4. Add accessible row menus for edit, enable/disable and remove; preserve validation and focus return when the initiating row disappears.
5. Show supported action/applicability summaries, unsaved status and target availability without inventing relation types. Trigger and removal guidance are omitted from tables following the user's refinement.
6. Add compact mobile rows/details and long-name wrapping.
7. Update tests to open editors through the new interaction flow while retaining all existing behavioral assertions. Add mixed-trigger, grouping-without-mutation and closed-editor validation coverage.

Deliverable: independent Recommendations component using the existing payload, callbacks and catalogs.

### T3 — Rebuild Quality presentation

1. Keep shared Basket loading/saving/conflicts/import/export in `KnowledgeBasketQualityPanel`; mount a dedicated table editor for the live shared checklist.
2. Add stage filters/counts, handling unknown and unassigned stages. Preserve stable selection when rows are edited, removed or filtered out.
3. Add the compact table and focused editor with the supported metadata fields. Omit Hold Point, images and AI controls.
4. Preserve add, remove, reorder, all response types, choices/default cleanup and photo-count validation. Preserve incomplete drafts through Excel import and require full validation before saving.
5. Keep the existing Excel toolbar actions and conditional saved download. Downloads use confirmed saved data; imported checks append to the local draft after preview.
6. Keep the shared-scope note, legacy item history, success/error announcements, pending-change callbacks, late-save isolation and explicit conflict recovery.
7. Add/update tests for stage-filter save integrity, two distinct Baskets, detailed-field preservation, closed-editor error focus, read-only operations and Excel workflows.

Deliverable: live shared checklist table with unchanged API and version semantics.

### T4 — Style tabs and integrate contextual rails

1. Restyle tab chrome to the reference: white/transparent surface, fine baseline, readable compact labels and selected underline. Preserve labels, counts, order, navigation, keyboard/focus behavior and the narrow-screen selector.
2. Add a section-specific root hook for Recommendations and Quality. Keep Overview/Mode main content and rail rendering unchanged.
3. For Recommendations, show actual item identity/description, Basket/Sub Basket/UOM context and supported authoring tips. Reuse current query keys and saved data; omit item images, invented item codes, rates and margins.
4. For Quality, show saved Basket/checklist version and count, read-only policy information and accurate saved status. Keep draft/filter counts distinguishable from saved metadata.
5. Keep existing complete saved details and revision history reachable on the redesigned tabs through compact disclosures, without modifying shared summary projections or the protected tabs' rail.
6. Reserve space for loading states, preserve error/retry states and stack the rail when the table cannot fit. Avoid a nested second rail or changes to global shell width.

Deliverable: integrated tab styling and context shell, isolated from protected tab content.

### T5 — Integrate and verify preservation

1. Wait for all component writers; inspect diffs and reconcile interface differences before running final checks.
2. Integrate the focused recommendation groups with existing legacy notes. Limit `KnowledgeSectionEditor` changes to requested section branches.
3. Verify full draft → save → confirmed data → refreshed summary behavior for both redesigned tabs, including failed saves, stale versions and guarded navigation.
4. Exercise returning from each redesigned tab to Overview and Mode. Confirm existing forms, content layout, saved summary and save semantics remain the same, with only the approved tab-strip styling changed.
5. Verify regular/temporary tab identities/counts and no changes to tab labels or order.
6. Adapt integration tests that depended on the old visible forms. Preserve tests for behavioral invariants; avoid replacing them with CSS-string-only assertions.
7. Update `docs/ai-estimator-budget-alterations.md` and `docs/ai-estimator-quality-checklists.md` only for the final supported UI flow. Do not revise their backend behavior claims.

Deliverable: integrated worktree with focused regressions passing and documentation matching the final UI.

### T6 — Review integrated integrity

Review for: dropped/merged/rekeyed rules; filtering that truncates save payloads; changed target-creation semantics; hidden invalid rows; query refresh clobbering drafts; false saved/complete states; lost quality metadata; broken shared Basket versioning; inaccessible menus/dialogs; tab count/label changes; CSS effects on Overview/Mode.

The primary fixes confirmed findings within the relevant ownership boundary, then reruns affected checks before T7.

### T7 — Final verification and handoff

Run checks against the integrated worktree after all writers and review fixes finish. Record results, screenshots, limitations and remaining risks. Do not claim full screenshot functionality or pixel identity; verify the approved Approach 1 adaptations.

## 6. Verification commands and evidence

### Focused checks

From `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeRelatedItemSuggestions.test.ts src/features/ai-estimator-knowledge/knowledgeRecommendationPendingChanges.test.ts
npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quality.test.tsx src/features/ai-estimator-knowledge/knowledgeQuality.test.ts src/features/ai-estimator-knowledge/knowledgeQualityWorkbook.test.ts src/features/ai-estimator-knowledge/KnowledgeQualityImportDialog.test.tsx
npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx
```

Run new presentation/editor tests by their actual created filenames as part of the affected slice. Keep required existing tests even when new tests overlap them.

### Integrated frontend checks

The shared tab styling and workspace shell justify checking the full frontend after focused regressions:

```sh
cd frontend
npm run typecheck
npm test
npm run build
```

From the repository root:

```sh
git diff --check
git status --short
```

No repository lint script exists. Backend and OCR checks are not planned because their code and contracts remain unchanged; any unexpected requirement to change them must be reconciled with the approved scope first.

### Rendered acceptance matrix

| Surface/state | Evidence |
| --- | --- |
| Recommendations, populated/empty, long names | 1440 and 1280 widths against Image 1; all three groups and existing extra rules accessible |
| Quality, populated/empty, mixed stages/types/evidence | 1440 and 1280 widths against Image 2; accepted missing-feature adaptations recorded |
| Both tabs, responsive | 1024, 768 and 390 widths; 200% text zoom; no page overflow or inaccessible actions |
| Protected Overview/Mode | Same representative data and viewport before/after; unchanged content/rail, only tab chrome differs |
| Regular/temporary items | Existing four/three tabs, labels and order unchanged; temporary items retain shared quality |
| Editing/navigation | Keyboard menus, editor focus return, stage filters, validation focus, Save/Discard guard, loading/error/read-only/conflict states |
| Runtime | Browser console/network observations for exercised flows; no new relevant errors |

Use synthetic representative configuration data for screenshots where private data could otherwise appear. Keep temporary QA outputs in an ignored task-specific directory such as `/tmp/lisno-recommendations-quality-qa/`; record actual paths in the handoff. Do not commit screenshots, caches or builds.

If authenticated browser access cannot be obtained from the authorized local environment, use an isolated fixture-backed development harness. If visual checks remain blocked, report the concrete limitation and do not call rendered verification complete.

## 7. Handoff requirements

Report the two redesigned tabs, accepted reference adaptations, unchanged Overview/Mode/tab inventory, principal affected files, exact checks/results, screenshot evidence, unrun checks and remaining risks. Confirm whether dependencies or backend changes occurred; the expected answer is none. No migrations or external actions are part of this plan.

## 8. Final verification evidence

### User follow-up: simpler recommendation tables

Remove Trigger and Removal guidance from the saved-content tables, including Other scope rules. Keep the side-panel controls, all stored rules, saving and grouping unchanged. Ownership: Recommendations implementer updates the builder, scoped table widths and existing assertions; primary updates documentation and checks desktop/mobile rendering and slider controls. Verification is limited to the builder tests, TypeScript, diff hygiene and this rendered interaction.

Follow-up verified: all four table groups have seven columns; neither removed label appears in table cells. Existing builder tests25/25, TypeScript, production build and diff hygiene passed. Browser checks at1440 and390 show no overflow; the slider still exposes What happens if? and Scope action. The user's clarification explicitly includes Probable Additions and Exclusions. Build log: `/tmp/lisno-recommendations-quality-qa/verification/columns-build.log`; the existing large-chunk warning remains.

- Final focused lane: 18 files, **384 tests passed**. This includes both requested tabs, saved rails, workspace navigation, protected Overview/Mode behavior, quality field validation and Excel/import flows.
- `npm run typecheck`: passed. `npm run build`: passed (2239 modules); existing large-chunk warning remains. `git diff --check`: passed.
- Full `npm test`: **2657 / 2663 tests passed**, 184 / 189 files. All six failures reproduced on HEAD `30c88ac291f63a36c7b79e6917b3481323b89dbf`: authorization policy/version expectations (2), password-reset field clearing, signup Address expectation, access-request dialog focus, and legacy Mode margin incompleteness. No unrelated fixes were made.
- Browser QA used synthetic in-memory fixtures and the real app shell/routes. Both redesigned tabs had no document overflow at 1440, 1280, 1024, 768 and 390 widths. At 1280 the context rail stacks below the table to retain readable columns. Mobile rows, details, editors and the 44px save control were visually checked.
- Browser interaction evidence: all four regular tabs and three temporary tabs; stage filters; preserved extra scope rules; focused editors and Done; both successful saves; first-invalid-field focus; failed quality save retaining its draft; guarded discard; conflict read-only detail access; empty and loading/error states; keyboard Arrow navigation; no warnings/errors in the exercised live preview console.
- Protected-tab comparison at 1440: Overview rendered text, content width/height and rail width matched baseline exactly. Both Mode content panels and rail width also matched baseline exactly. Only tab-strip chrome changed.
- Limit: 200% text zoom remains unverified because the tool's zoom shortcuts did not change browser scale. Permission/CAS/network behavior is covered by component/integration tests and synthetic browser responses; no live backend mutation was used for QA.
- Logs and temporary fixture evidence: `/tmp/lisno-recommendations-quality-qa/verification/`. Browser screenshots were inspected during the session; no screenshot files were committed. Temporary preview servers were stopped and the viewport override reset.
- No backend/schema/dependency/lockfile changes, migrations, seeds, commits, pushes or deployments. Backend/OCR checks were not run; no lint script exists.
