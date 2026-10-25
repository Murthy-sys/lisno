# In-house preserved configuration implementation

Parent task: Implementation and verification complete. Local delivery uses the reviewed nine-file hash manifest and original-file backups; production deployment is outside scope.

1. Inspect storage and UI conversion; capture dirty files and baseline hashes. Complete.
2. Root owns shared clone helper, specification/plan, ModePanel integration if needed, and final delivery. Frontend agent owns KnowledgeInHouseComponents.tsx and knowledge-in-house-components.css. Verification agent owns replacement regression tests, using the existing contract; avoid overlapping writers.
3. Implement visible retained source, guarded whole-section/title/handle copy drag, any configured component as source, protected original, keyboard destination picker, target-only raw editor reset, and accessible feedback. Complete; no persistence contract changes.
4. Run focused component, pending-save, shared validation, and conflict tests. Review the integrated diff independently, resolve findings, then run final typecheck/build and targeted regressions.
5. Render synthetic legacy/split/single/readonly scenarios; inspect wide/narrow layout and replacement without modifying real configurations.
6. Create a hash-checked copy manifest and backups, obtain only the required filesystem escalation, apply named source/test/docs files, and verify hashes plus diff hygiene. Report exact results and limitations.

Acceptance criteria map to the numbered specification criteria. Existing source absence after prior deliberate removal is not automatically repaired. No deployment, production mutation, commits, dependencies, or price-selection changes.

## Verification results

- Frontend affected suites: KnowledgeInHouseComponents, KnowledgeInHouseComponentsTransfer, KnowledgeModePanelPendingChanges, KnowledgeModeConfigurationBuilder, knowledgeModeConfigurationComponents: 82 tests passed across 5 files.
- Latest visible-notice follow-up: component, Transfer and ModePanelPendingChanges rerun: 57 passed across 3 files; reminder clears when confirmed save version advances.
- Backend `npm test -- tests/ai-estimator-knowledge-in-house-components.test.ts`: 40 passed, including 17 new shared copy/preservation cases.
- Backend `npm run typecheck`: passed. No backend runtime or transactional save paths changed.
- Frontend `npm run build` (TypeScript plus production bundle): passed; existing large-bundle warnings remain.
- Independent integrity reviews of initial and generalized implementations: no actionable findings.
- Browser: synthetic ModePanel desktop keyboard destination selection copied both costs into a blank component and Save Mode confirmed section version 2. Original and source remained present. Desktop section and 390px iframe layouts inspected; mobile source/buttons/picker fit and wrap correctly. In-house accessibility audit: no WCAG A/AA violations, no captured browser errors or page overflow.
- Native browser drag starts and target outlines appear. The macOS automation session did not complete the OS drag/drop gesture and required Escape. End-to-end pointer completion remains a manual verification limitation; section/title/body/handle drop paths and protected controls pass rendered event interaction tests.
- Full repository suite and production data were not accessed. No lint script exists. No dependencies, migrations, commits, deployments or live data writes. Synthetic QA fixture/build output stays in /tmp and is excluded from delivery.
