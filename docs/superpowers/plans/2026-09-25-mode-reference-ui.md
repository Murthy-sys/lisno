# Mode reference UI implementation plan

Specification: [Mode reference UI](../specs/2026-09-25-mode-reference-ui-design.md).

One parent task: implement the supplied Mode tab layout without changing functionality.

1. Root captured initial dirty hashes, target snapshots and diffs in `/tmp/lisno-mode-reference-qa/`. Read-only audits trace calculation invariants and sidebar data. Complete.
2. Main UI implementer owns ModePanel presentational import, ModeConfigurationBuilder, ModeDescriptionEditor, PmcScopeChecklist and new `knowledge-mode-reference.css`. Preserve handlers/state/storage; arrange selector/description, section headers, source controls and scope cards. May adjust focused tests only for genuine semantic UI changes. No calculation editor/table or sidebar files.
3. Calculation implementer owns ModeCalculationEditor/Table and new `knowledge-mode-calculation-reference.css`. Use existing groups/controls, provide rate/margin/action composition, preserve all financial and simulator logic. No main builder, margin input/domain or sidebar files. Can run in parallel with step2.
4. Root owns workspace Mode scope attribute, optional summary presentation hook, new `knowledge-mode-sidebar.css`, docs, QA fixtures and rendered verification. Keep existing sidebar data/order/height behavior. No overlapping writer paths.
5. After writers finish, independent integrity review checks behavior/financial/data/permission invariants against snapshots. Resolve findings; final verification runner runs focused Mode/builder/description/scope/calculation/pending tests and frontend typecheck/build. Root checks rendered viewport/state matrix, keyboard/axe and actual interaction flows, including unchanged Overview.
6. Reconcile dirty hashes, record exact results and limits, close only owned preview tools and move temporary browser artifacts to the QA folder. No production writes/commits/deployment.
