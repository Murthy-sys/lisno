# Inline creation options for quality controls — task plan

## Approved source

- Specification: `docs/superpowers/specs/2026-09-20-quality-control-inline-create-options-design.md`

## Dependency-ordered tasks

1. **Preserve current work**
   - Capture the dirty-path set and focused diffs for the quality parameter component, styles, and tests.
   - Preserve all existing approved quality-control behavior.

2. **Move actions into the selects**
   - Add stable, local sentinel option values for Frequency and Performed by.
   - Append the correct `＋ Add …` option only for authorized users with an enabled form.
   - Intercept sentinel selection before normal value mapping, keep the controlled value unchanged, and open the existing dialog with the related select as the focus-return target.
   - Remove the separate action buttons and now-unused icon/button imports.

3. **Remove obsolete presentation styles**
   - Delete only the scoped pill-action rules that no longer have a rendered consumer.
   - Retain select sizing, responsive grid behavior, and unrelated quality styles.

4. **Strengthen focused tests**
   - Assert both create actions appear inside their related selects for authorized Super Admin users.
   - Assert sentinel selection opens the correct dialog without entering form state or save payloads.
   - Assert cancel preserves the prior selection and focus return; successful creation still selects the created value.
   - Assert the add options are absent without permission or while disabled.

5. **Verify the integrated result**
   - Run the focused quality-panel test file, frontend typecheck, frontend build, and scoped `git diff --check`.
   - Inspect desktop and mobile native select behavior, keyboard activation, cancellation, successful selection, and overflow/text zoom.

## Ownership boundaries

- Frontend implementation owns `KnowledgeQualityParameterFields.tsx`, the obsolete scoped rules in `knowledge-quality-workspace.css`, and directly related expectations in `KnowledgeBasketQualityPanel.test.tsx`.
- No backend, API, permission, persistence, dialog-content, dependency, or shared-select changes are in scope.
- The primary agent owns integration and preservation of pre-existing edits.

## Acceptance-criteria trace

- Tasks 2–3 place both actions inside their selects and remove duplicated external controls.
- Task 4 proves sentinel values cannot become field state or payload data and preserves permission/focus behavior.
- Task 5 covers responsive, keyboard, and regression requirements.

## Parallel execution

- Component behavior and its focused tests are coupled and should have one implementation owner.
- Final test execution and visual review can run independently after the implementation stabilizes; verification must use the integrated worktree.

## Verification commands

- `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.test.tsx`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `git diff --check -- frontend/src/features/ai-estimator-knowledge/KnowledgeQualityParameterFields.tsx frontend/src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.test.tsx frontend/src/features/ai-estimator-knowledge/knowledge-quality-workspace.css`
