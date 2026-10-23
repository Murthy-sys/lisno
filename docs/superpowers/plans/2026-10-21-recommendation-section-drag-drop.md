# Recommendation section drag-and-drop task plan

Date: 2026-10-21
Status: Approved on 2026-10-21; user selected Mode A. Parent task: Implement and verify recommendation section movement (complete). Wider pre-existing workspace failures are recorded below.

Approved source: [Move recommendation rules between sections](../specs/2026-10-21-recommendation-section-drag-drop-design.md). The user approved both documents on 2026-10-21. The subsequent requested correction makes the whole row the drag surface; the section transitions and save contract remain unchanged.

## Outcome and boundaries

Allow a rule to move among all four web recommendation sections through desktop dragging or the existing row action menu. Preserve the section theme, add/edit/remove controls, stable IDs, target details, explanation, and enabled state. Changes remain in the current draft until the existing section save action succeeds.

Keep the approved destination mapping:

| Destination | Trigger | Action | Requirement |
| --- | --- | --- | --- |
| Non-Negotiable Additions | added | add | must |
| Probable Additions | added | add | can |
| Exclusions | added | remove | Preserve must/can |
| Other scope rules | removed | Preserve add/remove | Preserve must/can |

No API, persistence schema, backend, native mobile, dependency, or lockfile changes are expected. No same-section sorting, cross-Main-Line transfers, catalog mutation, or automatic saving. Preserve the preceding multiple-brand implementation.

## Ownership and execution order

All paths below are relative to `frontend/src/features/ai-estimator-knowledge/` unless stated otherwise. The primary agent owns the approved contract, integration decisions, durable documents, and final reconciliation. Keep one parent task, “Implement and verify recommendation section movement,” in progress during execution.

| Task | Depends on | Owner in Mode A | Owned paths / deliverable | Acceptance |
| --- | --- | --- | --- | --- |
| T1. Capture baseline and settle helper interface | Plan approval and execution choice | Primary | Read-only target inspection, current dirty-path inventory, focused baseline results; publish helper and accessible-label interface | AC1–AC8 baseline |
| T2. Implement rule transition and guards | T1 | Primary | New `knowledgeRecommendationMoves.ts` and `.test.ts` | AC1, AC2, AC5, AC6 |
| T3. Add drag/drop and accessible move controls | T2 | `frontend_implementer` | `KnowledgeBudgetAlterationBuilder.tsx`, `knowledge-recommendations.css`, new `KnowledgeBudgetAlterationBuilder.moves.test.tsx`; existing builder test only if its harness genuinely needs updating | AC1–AC6, AC8 |
| T4. Verify workspace persistence and pending changes | T2 | Primary, parallel with T3 | `KnowledgeScreens.test.tsx`, `knowledgeRecommendationPendingChanges.test.ts`; synthetic browser fixture in `/tmp` | AC2, AC7 |
| T5. Integrate and review the complete change | T3 and T4 | Primary, then `integrity_reviewer` | Integrated diff and findings; fixes returned to the owning writer | AC1–AC8 |
| T6. Final verification and handoff | T5 and all confirmed fixes | `verification_runner`, with primary browser QA and reconciliation | Focused test/build evidence, browser screenshots/accessibility evidence, final scoped diff | AC1–AC8 |

In Mode B, the primary agent performs these tasks inline and sequentially, including review and verification. Do not spawn agents before the user selects Mode A. In Mode A, tell each writer that others share the worktree, assign the paths above explicitly, and require preservation of other writers' changes. T3 and T4 can run concurrently after T2 establishes the shared helper and interaction contract. Review follows finished writers; final verification follows resolved review findings.

## Task details

### T1. Baseline and implementation contract

- Re-capture `git status --short` and target diffs immediately before writers start. Relevant recommendation files were clean during planning; brand-related edits remain in backend, shared, frontend, and mobile files.
- Avoid edits to the already-dirty `KnowledgeSectionEditor.tsx` and unrelated brand files. If integration exposes a necessary change there, inspect its current diff and explicitly assign it to the primary agent before writing.
- Run existing builder, recommendation presentation, pending-change, and workspace screen tests. Record existing failures separately; do not attribute earlier reported test counts to this execution.
- Define one pure move operation taking the current rows, stable source ID, and destination group, and returning changed, unchanged, or rejected with a readable reason. Both drag and menu paths must call it.
- Use full destination names in accessible move labels, for example “Move to Probable Additions,” and describe dragging on the row. Publish these labels before the integration test work starts.

### T2. Transition and validation helper

- Resolve exactly one source by nonempty stable ID. Validate supported trigger/action/requirement values; preserve malformed data and reject unsafe movement instead of repairing it.
- Implement the four approved destination mappings without creating a new rule ID. Preserve all non-transition fields. Normalize an absent legacy `targetKind` through the existing convention, but do not overwrite an explicitly malformed discriminator.
- Use current rows, never a drag-start row snapshot. Return unchanged for a same-group move; append a moved row after existing destination rows while preserving unaffected relative order.
- Detect active target-kind/target-ID/destination-trigger collisions using existing validation semantics. Reject without mutating either row; retain disabled-rule duplicate allowances. Incomplete target or reason fields remain subject to existing save validation.
- Cover all 12 directed section transitions, both exclusion requirements, all valid Other action combinations, both target kinds, disabled rows, legacy target kind, extra fields, repeated moves, ordering, missing/duplicate IDs, invalid semantics, source disappearance, and active duplicate rejection.

### T3. Existing editor integration

- Make the whole item row draggable, including the item name, using the native desktop drag lifecycle. Keep Actions controls independent and preserve ordinary item-name clicks. Bind the local gesture to editor instance, Main Line, reset key, and rule ID. Ignore foreign drag data and clear state on drop, cancellation, source loss, reset, or permission loss.
- Add section header/body drop zones, including empty sections and the collapsed Other summary. Use existing theme tokens for a restrained target outline and brief semantic hint; expand Other after a successful move there.
- Add destination actions inside the existing row action menu. Both interaction routes use the helper and existing local `onChange`; neither performs a catalog mutation or a save.
- Preserve ordinary item-name click and menu behavior, enabled state, validation messages, unavailable target indicators, overlap warnings, and nested dialogs. Row text is now part of the requested drag surface.
- Announce success/rejection, update counts and unsaved presentation, and restore keyboard focus to the moved row's action control. Keep controls usable on narrow screens where the current numeric table column is hidden.
- Test rendered drag and menu paths, empty/collapsed targets, cancellation, same-section no-op, external data, read-only and late permission changes, stale owner/reset, latest row data, invalid identities, duplicate rejection, focus, and announcements. Assert unchanged add/edit/enable/disable/remove behavior and run an accessibility check.

### T4. Workspace integration coverage

- Exercise the actual recommendations workspace flow with synthetic catalog records and the existing mocked API, using the agreed accessible menu labels.
- Assert that moving alone performs no section API write or catalog mutation. Save must submit the same stable rule and target fields with the intended semantic changes and current expected version.
- Save and reload a Main Line rule and a whole-Sub-Basket rule, including repeated moves and required/optional exclusions. Check disabled state and explanations survive.
- Cover discard restoring the saved section, failed save preserving the local moved draft, and an externally refreshed section retaining the existing version-conflict review gate.
- Verify pending changes describe edits to the existing rule instead of reporting a deleted/recreated item. Preserve unrelated legacy recommendation/exclusion payload fields.
- Prepare any browser fixture under `/tmp/lisno-recommendation-moves-2026-10-21/` with synthetic data, real production components/styles, and no production credentials or API writes. Fixtures are temporary verification tools, not repository deliverables.

### T5. Integrity review

- Inspect the complete diff against the approved spec, especially ID-based updates, unknown-field preservation, Other trigger changes, duplicate validation, stale drag state, permission checks, focus, and explicit-save behavior.
- Confirm no API or shared schema changes, dependency changes, accidental brand regressions, unrelated reformatting, or generated artifacts entered the scoped diff.
- Resolve actionable findings with their owners before final verification. A material departure from the approved spec requires updating and reviewing that scope before implementation continues.

### T6. Final verification

Run the focused frontend lane from `frontend/` on the integrated worktree:

```sh
npm test -- src/features/ai-estimator-knowledge/knowledgeRecommendationMoves.test.ts src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.moves.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeRecommendationPresentation.test.ts src/features/ai-estimator-knowledge/knowledgeRecommendationPendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
npm run typecheck
npm run build
```

Browser verification uses the actual themed editor at a desktop width around 1440px and a narrow touch viewport around 390px:

- Desktop: drag a Main Line rule into an empty section, move a whole-Sub-Basket rule into a populated section, drop on collapsed Other, cancel a gesture, and verify external/same-section drops do nothing. Check ordinary scrolling during a drag through a long list.
- Keyboard/touch: move through every destination using the action menu; check visible focus, destination announcement, and access to existing controls.
- States: required/optional and disabled rules, duplicate destination rejection, unavailable targets, empty groups, and read-only views.
- Persistence: inspect the explicit save payload, reload saved rules, and test discard and a simulated failed save without reaching production.
- Visual/accessibility: inspect screenshots, run axe, check horizontal overflow and browser console/network errors, and confirm existing themed headers, tables, and item dialogs remain intact.

Run `git diff --check` and `git status --short` at repository root. There is no lint script; do not report lint as passed. Backend/mobile suites and the full frontend suite are not planned for this frontend-only slice unless evidence of a cross-boundary change or unresolved regression justifies broadening.

## Completion and handoff

Mark implementation complete only when all acceptance criteria have supporting evidence and review findings are resolved. Report the changed paths, exact checks and results, any unrun checks, temporary artifact locations, and remaining limitations, including the touch menu alternative to native dragging. Do not stage, commit, push, deploy, seed, migrate, or mutate production.

## Execution record

- T1 complete: original dirty paths and clean recommendation-target diffs captured in `/tmp/lisno-recommendation-moves-2026-10-21/initial-status.txt` and `initial-targets.diff`. Baseline tests: 240 passed, 15 failed. All failures were existing Mode/Overview cases in `KnowledgeScreens.test.tsx`.
- T2 complete: frontend helper and 33 focused tests added; no shared or backend contract changes.
- T3 complete by `recommendation_moves_ui`: builder, stylesheet, and 26 new rendered tests. All 126 existing builder tests remain unchanged and pass. Browser QA found that in-flow drag hints shifted target positions; the owner fixed this by positioning active-target hints outside normal flow and retaining the previous notice during a new drag.
- T4 complete: primary delegated the two test-only paths to `recommendation_moves_save_tests` while preparing the synthetic browser fixture. Five new workspace tests and 26 pending-change tests pass. Save fixtures use backend-supported rule fields; arbitrary extra-field retention is tested only for local moves.
- T5 complete: `recommendation_moves_integrity` found no blocking contract/data/focus defect, including in an incremental review of the hint correction.
- T6 complete: `recommendation_moves_verification` ran the integrated checks below, and the primary completed browser interaction/visual verification on the corrected component.
- No dependency, backend, mobile, schema, production, commit, staging, or deployment changes.

## Final verification evidence

Before the hint correction, the six-file lane printed above finished with **304 passed and 15 failed**. The 15 failing test names exactly match the initial baseline, all in existing Mode/Overview cases in `KnowledgeScreens.test.tsx`. Five unmatched `basket-requests` MSW warnings also match that baseline. No new failures were introduced. See `baseline.log` and `final-focused.log` in the temporary evidence directory.

After the final correction, these exact commands ran from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/knowledgeRecommendationMoves.test.ts src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.moves.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeRecommendationPresentation.test.ts src/features/ai-estimator-knowledge/knowledgeRecommendationPendingChanges.test.ts
npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx -t 'recommendation section move'
npm run typecheck
npm run build
```

- Focused files: **214 passed**, comprising 33 helper, 26 movement UI, 126 existing builder, 3 presentation, and 26 pending-change tests.
- Workspace movement cases: **5 passed**, 101 unrelated cases filtered out. Combined final focused result: **219 passed**, no test warnings.
- Typecheck passed. Production build passed in 8.58 seconds, with the existing large-chunk warning (main JS approximately 2.81 MB).
- Root `git diff --check` passed. Final status preserved the initial unrelated dirty work and added only the approved recommendation paths/documents.

Browser QA used Chromium with synthetic local data and the actual workspace, editor, API client, and production styles. Read/write API responses were isolated within the fixture; no production request or credential was used.

| Acceptance | Browser / rendered evidence |
| --- | --- |
| AC1–AC3 | Native drag moved a Main Line into empty Probable Additions and a whole Sub-Basket onto collapsed Other, opening it. Counts, action/relationship, saved/unsaved labels, and explicit save/reload payloads were inspected. |
| AC4 | At 390×844, browser-emulated touch opened and selected the Move to menu. Keyboard Tab/Enter moved a disabled item through all four destinations, restoring focus to its row action control each time. |
| AC5–AC6 | Native Escape cancellation and same-group drops preserved the rows. Duplicate target/trigger drops displayed an error and retained both rules. Read-only views had zero drag handles and zero move controls while retaining View. Unavailable targets retained their visible identity and Needs attention/Unsaved state; save remained blocked by existing validation. Other stale/malformed/foreign-gesture cases passed rendered tests. |
| AC7 | No writes occurred during dragging or menu moves alone. The actual API client submitted the explicit Save with section and aggregate versions; synthetic reload retained IDs, target kind, reasons and disabled state. A simulated failed Save retained the moved draft and retry succeeded. Discard and version conflicts passed workspace tests. |
| AC8 | Desktop 1440×1100 and narrow 390×844 had no horizontal overflow. A real mouse drag left all five section/summary top positions and heights exactly unchanged after the hint fix. Native edge scrolling worked on a 20-additional-item list at 1440×900; Escape then preserved the data. Existing controls remained covered by 126 unchanged builder tests. |

Rendered axe checks reported **zero violations** for desktop, narrow menu, narrow post-move, read-only, and unavailable-target recommendation controls. The final checked browser session had **zero console errors and zero warnings**. Screenshots were inspected; the existing section theme and controls remain intact.

Evidence directory: `/tmp/lisno-recommendation-moves-2026-10-21/`. Principal artifacts: `post-fix-focused.log`, `post-fix-workspace-moves.log`, `post-fix-typecheck.log`, `post-fix-build.log`, `desktop-drag-stable.png`, `narrow-move-menu.png`, `narrow-after-move.png`, and `narrow-readonly.png`. The task's preview server and browser sessions were stopped. Build output in ignored `frontend/dist` and TypeScript caches is not staged or committed.

Verification limits: the wider workspace lane remains red from the 15 documented baseline failures. The full frontend suite and backend/replica-set/mobile/OCR suites were not run for this frontend-only feature. Save tests and browser API responses are synthetic, not live Mongo/production integration. Touch was browser-emulated; no physical phone or native mobile app was tested. There is no lint script. No migration, deployment, commit, push, or production mutation was performed.

## Completed follow-up: whole-row dragging

The user requested dragging by holding the item itself, without requiring a specific handle. This correction is complete. The existing UI owner updated only `KnowledgeBudgetAlterationBuilder.tsx`, `knowledge-recommendations.css`, and `KnowledgeBudgetAlterationBuilder.moves.test.tsx`; the primary updated these documents and performed browser QA. The initial feature diff was retained at `/tmp/lisno-recommendation-moves-2026-10-21/whole-row-initial.diff` before the correction. Unrelated dirty brand work remains preserved.

- Valid editable rows now carry native draggability and accessible instructions. Item names, text cells, and padding start the same guarded move operation. The dedicated grip and its extra column/mobile spacing were removed.
- A normal item-name click still opens Edit. Actions retain their existing menu behavior; pointer-origin and drag-event checks prevent Actions controls from moving the row. Read-only and malformed rows remain non-draggable.
- The integrity reviewer found no confirmed blocker. Final verification ran after the writer finished: `npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.moves.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx` passed **159 tests** (33 movement, 126 existing builder). `npm run typecheck`, `npm run build`, and `git diff --check` passed. Build retained the existing large-chunk warning. Logs: `whole-row-{focused,typecheck,build}.log` in the evidence directory above.
- Chromium native dragging from a text cell, item-name button, and cell padding moved the row without opening Edit or making API writes. A subsequent ordinary name click opened Edit. Actions-origin dragging did not move the row and the menu remained usable. A whole Sub-Basket moved by its name into collapsed Other, which expanded, at 1440×1400. Read-only rendering exposed zero draggable rows and retained View controls.
- At 390×844, browser-emulated touch operated the existing Move menu successfully. Desktop and narrow axe checks reported zero violations, and page width matched viewport width. The final checked browser console had zero errors and zero warnings. Inspected screenshots: `whole-row-desktop.png` and `whole-row-narrow-menu.png` in the evidence directory.
- Browser automation retries were needed after stale references/navigation from unsaved synthetic drafts, and the collapsed-target test was rerun with source and destination simultaneously visible. These retries are not counted as successful checks. The successful native and touch checks above used fresh synthetic scenarios.

No helper, destination mapping, save implementation, API, backend, native app, dependency, or lockfile changes were made for this correction. Helper/save tests were not repeated because those paths are unchanged; the earlier evidence above still applies. The full suite was not rerun; the 15 previously recorded workspace failures remain outside this correction. No production mutation, deployment, migration, staging, commit, or push occurred.
