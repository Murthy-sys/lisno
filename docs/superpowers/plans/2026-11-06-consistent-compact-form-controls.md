# Consistent compact form controls: implementation plan

Date: 2026-11-06
Status: Implemented. Focused regressions, typecheck/build and representative desktop/mobile checks passed. Extended browser checks remain unrun as documented below.

Source of truth: [Approved specification](../specs/2026-11-06-consistent-compact-form-controls-design.md). AC1–AC5 refer to that specification.

## Outcome and boundaries

Apply a shared compact form standard to all furniture actions, contextual side panels, common popups and shared form controls. Target 18px panel headings/checkbox visuals, 12–13px field labels, 13–14px body/control text and 36px desktop fields/actions. Retain 16px editable-control text and at least 44px interactive targets for narrow/coarse-pointer layouts. Preserve the existing family, colors, control states, drawer geometry and form behavior.

No backend, API, permissions, calculations, email, storage or schema changes. No dependencies, lockfile changes, real submissions/uploads, user-service restarts, commits or deployment. Navigation, dashboard figures, document content and specialized estimate-grid behavior remain outside the presentation change.

## Ownership and sequencing

The primary owns the approved contract, inventory, documents, integration and final reconciliation. Keep only one parent phase in progress. Do not spawn agents until the user selects Mode A. In Mode B, the primary performs all work inline, including review and verification.

In Mode A, the primary can run independent read-only consumer/cascade audits during T1. After the shared density and hit-area contract is settled, use explicit non-overlapping write assignments:

| Slice | Exclusive write ownership | Dependencies |
| --- | --- | --- |
| Shared form foundation | `frontend/src/styles/global.css`, `base.css`, `primitives.css`; `frontend/src/components/ui/Field.tsx`, `Field.test.tsx`, `Button.test.tsx` | T1 contract and baseline |
| Shared overlays | `frontend/src/styles/shell.css`; `frontend/src/components/ui/dialog.css`, `Drawer.test.tsx`, `ContextPanel.test.tsx`, `Dialog.test.tsx` | T1 contract; shared token names agreed before parallel edits |
| Furniture integration | `frontend/src/features/workflow/ExistingFurnitureWorkflow.tsx`, `existingFurnitureWorkflow.css`, `ExistingFurnitureWorkflow.test.tsx` | T1 contract; preserves previously completed request-panel edits |
| Consumer adapters | Exact feature TSX/CSS/tests listed by T1, primary-owned initially | Shared foundation settled; only assign disjoint files after baseline review |

These are permitted ownership boundaries, not a requirement to edit every file. `Button.tsx`, `ContextPanel.tsx` and `Drawer.tsx` should remain unchanged unless evidence shows a presentation mechanism is necessary; the primary must explicitly assign any such file before a writer touches it. Do not split a shared stylesheet between writers. Agents must be told they are not alone and must not revert others' edits.

## T1. Capture baseline, inventory consumers and settle compatibility

Owner: primary with optional independent read-only audits in Mode A. Dependency: task-plan approval and execution-mode choice. Covers AC2–AC5.

1. Capture dirty paths, relevant existing diffs, protected-file hashes and target copies in a temporary task directory. The two furniture product targets already contain the completed request-panel change; their diff has been inspected during planning and must be preserved through consolidation. Other pre-existing changes remain protected.
2. Inventory shared/native checkbox and radio usage, `Field`/input/select/textarea/file-input consumers, contextual drawers and common dialogs. Record path, selector, wrapping/explicit-label/table pattern, density override, proposed disposition and verification coverage in this plan before assigning adapters.
3. Audit the actual layer order (`theme`, `base`, `components`, `shell`, `utilities`) plus unlayered feature CSS. Identify overrides that would defeat compact sizing or mobile text/target sizes. Avoid changing unrelated global type/spacing tokens used by charts, page headings or navigation.
4. Capture rendered baseline for the shown dimensions panel, the existing compact request panel, ordinary form, common dialog, another contextual panel, table checkbox and separate-label checkbox. Use actual components and the app's CSS declaration/font loading, synthetic data and an isolated QA server/browser. Do not open or submit real drafts.
5. Settle one shared presentation contract: token names/defaults, scoped typography, responsive breakpoints and checkbox/radio target treatment. Prefer existing native inputs and associated labels; do not add wrappers indiscriminately. If a standalone control needs a wrapper, preserve refs, native props, IDs, explicit label association, form submission and layout compatibility, and verify that pattern before propagation.

Exit: complete consumer/override inventory, exact adapter ownership, reproducible baseline and a compatible shared contract. Routine implementation decisions within the approved specification do not reopen approval gates. Any material behavior or scope change requires updating the affected approved artifact first.

## T2. Implement the common standard and integrate consumers

Owner: approved writers in Mode A; primary in Mode B. Dependency: T1. Covers AC1–AC5.

### T2a. Shared form foundation

- Centralize only needed density values in existing tokens/rules. Keep existing compact controls from being reduced twice.
- Align labels, helper/error text, input/select/textarea/file input and standard form-button typography and spacing. Use mobile/coarse control text/target rules explicitly; preserve multiline textarea height, native file chooser and filename wrapping.
- Separate compact checkbox/radio visuals from usable label/wrapper targets. Cover implicit labels, separate `Field` labels, unlabeled-looking table selection controls with accessible names, and indeterminate checkboxes.
- Preserve default/controlled state, refs, required/invalid/disabled/read-only semantics, focus indicators and React Hook Form registration. Avoid broad `!important` resets, transform scaling or synthetic click forwarding that double-toggles labels.
- Update the current checkbox test that conflates visual size with a 44px target only alongside meaningful semantics and rendered target evidence. Keep invalid-outline and native form registration/submission coverage. Do not replace it with a CSS-string assertion of 18px.

### T2b. Shared contextual panels and common popups

- Replace contextual-only oversized header, field and action defaults with the shared compact scale. Align popup control sizing and touch rules without overwriting its existing palette or geometry.
- Apply typography to form/overlay content with deliberate selectors; preserve semantic section hierarchy, special table/financial type and uploaded document/preview content.
- Tighten header/body/footer padding and control gaps while retaining safe areas, scrolling, full-height placement, widths, close targets, long-title/action wrapping and footer access.
- Preserve focus trap/return, nested dialogs and dirty-close behavior. Add behavioral regression coverage only if a structural change is needed.

### T2c. Every furniture action

- Consolidate the request-only density rules into the shared system. Keep furniture-specific structural rules local and apply them consistently across request, preference, dimensions entry, approval and return actions.
- Compact room headings, item legends, item grids, labels, input/select fields, file input, helper/error text, confirmation checkbox and Add/Remove/submit/Cancel actions.
- Preserve two-column item fields where space permits and a single column on narrow screens. Verify newly added items adopt the same styles.
- Keep all handlers and payloads intact: room selection, count/dimension modes, units, required evidence, self-confirmation, exact review submission IDs and version checks.

### T2d. Reconcile feature overrides

- Resolve inventory findings through the shared rule when possible; use narrow consumer adapters only where existing markup/feature CSS requires them.
- Check workflow panels, vendor form/selection/table patterns, knowledge configuration forms and administration forms as distinct consumers. Include legacy/native controls in the disposition table rather than assuming shared component changes affect them.
- Preserve Sales basket browsing and specialized estimate-grid interactions. Do not reformat/rewrite dirty feature files to make a style change.
- Record intentional structural exceptions with evidence and verification. Do not classify an oversized control as an exception merely to skip it.

Parallelism: T2a/T2b/T2c may progress concurrently only after token/target contracts are fixed and ownership is disjoint. T2d depends on the settled foundation and the exact inventory; the primary integrates it or assigns a free writer with exclusive paths. Run final tests after all writers finish, not against a transient shared worktree.

## T3. Review the integrated change

Owner: primary plus `integrity_reviewer` in Mode A; primary inline in Mode B. Dependency: all T2 writers finished. Covers AC1–AC5.

- Review the full task diff against the baseline and inventory. Confirm all intended consumers use the common standard without duplicate local size overrides.
- Review checkbox/radio target size, input identity/ref/form behavior, native labels, disabled/busy/invalid states, table fit, CSS precedence, mobile input text, long content and overlay focus behavior.
- Confirm no authorization, calculation, workflow payload or external-effect changes. Reconcile every finding; repeat only affected checks after fixes.

## T4. Verify the stable integrated result

Owner: primary plus `verification_runner` in Mode A after review fixes; primary inline in Mode B. Covers AC1–AC5.

Run tests in bounded batches to avoid the resource contention observed during earlier full-workspace runs. Do not run multiple broad suites concurrently.

Core regression commands from `frontend/`:

```sh
npm test -- src/components/ui/Field.test.tsx src/components/ui/Button.test.tsx src/components/ui/Drawer.test.tsx src/components/ui/ContextPanel.test.tsx src/components/ui/Dialog.test.tsx --maxWorkers=2
npm test -- src/features/workflow/ExistingFurnitureWorkflow.test.tsx src/features/workflow/WorkflowStageActions.furnitureApproval.test.tsx src/features/workflow/WorkflowStageActions.furnitureScope.test.tsx src/features/workflow/WorkflowStageActions.furnitureReview.test.tsx --maxWorkers=2
npm test -- src/features/procurement/VendorDirectory.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/designer/ProjectStructureDialog.test.tsx --maxWorkers=2
npm run typecheck
npm run build
```

Add focused suites for every materially adapted consumer found in T1, including knowledge forms and any native estimate controls actually touched. `WorkflowStageActions.measurement.test.tsx` is additionally required if shared checkbox/selector changes affect its room selection/ref behavior. Shared native registration, validation and focus tests must pass even if no component TSX changes are made.

The full frontend suite is not the default: foundational and affected-consumer batches plus rendered coverage are the primary verification lane. Broaden only for a review finding or shared-contract concern not covered by those checks, using bounded concurrency. Backend/OCR suites and migrations are outside this task. No lint script exists; do not report lint as run.

Rendered verification with synthetic APIs and actual styles/fonts:

| Criterion | Evidence required |
| --- | --- |
| AC1 | Request, preference, self/assisted dimensions and review/correction forms; dynamic Add/Remove; dimensions/count modes; helper/error/evidence/self-confirmation states. |
| AC2 | Shared standalone form, common popup, non-furniture contextual panel, knowledge form, vendor form/table selection and separate-label checkbox; final inventory disposition. |
| AC3 | Computed visual and click/touch target bounds; label click and Tab/Space; checked/unchecked/indeterminate; disabled/busy; invalid outline; explicit label/ref focus; native submission; axe scans. |
| AC4 | 1440px, 768px and 390px viewports; coarse-pointer desktop; actual 200% browser zoom or a documented equivalent reflow test with its limits. Long titles/names/errors/filenames and enough items to scroll. Controls/footer stay in viewport with no horizontal overflow. |
| AC5 | Exact synthetic payloads and request versions, required-unit/evidence/confirmation validation, dirty-close/Keep editing/discard/focus return, nested overlay and representative consumer actions. |

Wait for loaded fonts, settled drawer bounds and completed focus transitions before measurement/screenshots. Use no real uploads, customer submissions or emails. Inspect screenshots rather than trusting computed styles alone. Report unsupported browser-specific checks explicitly instead of treating emulation as a physical-device test.

## T5. Reconcile, clean up and hand off

Owner: primary. Dependency: T4 passed.

- Run `git diff --check` and `git status --short`; compare protected hashes and inspect all newly dirty paths.
- Record modified files, exact test/build results, rendered metrics/screenshots reviewed, inventory coverage, intentional exceptions and unrun checks in this plan. Do not claim universal visual verification from a single furniture screenshot.
- Remove only task-created fixtures/screenshots/logs and stop only task-owned QA sessions/servers. Preserve existing runtime services, email setup, drafts and earlier changes. Document ignored build output where relevant.
- Report the compact furniture result and shared consistency outcome, principal implementation decision, verification and remaining limits. No commits, deployment or external actions are included.

## Progress

- Specification: approved by the user.
- Task plan: approved by the user.
- Execution mode: A.
- T1 complete: baseline saved in `/private/tmp/lisno-compact-forms`; audits and rendered baseline captured. Original upload panel:24px title,44px checkbox/fields,720px width.
- T2 complete: shared foundation/overlays, all furniture actions and inventoried feature density adapters integrated. Native DOM/refs and payloads unchanged. Field/Button early focused batch passed23 tests in2 files.
- T3 complete: independent integrity review found no confirmed blocker in the29-path task diff; no API, persistence, authorization or delivery changes. Native input DOM/refs retained.
- T4 complete for the final bounded verification lane:850 unique selected tests passed after targeted retries and a test-fixture correction; typecheck/build passed. Representative browser checks passed with explicit extended-check limits below.
- T5 complete: protected files reconciled, task-only browser/server/fixtures/screenshots removed; no unrelated changes.

## Implementation inventory and verification record

To be completed during T1 and T4 after execution is authorized. Planning has identified wrapped-label, separate-label, table-selection, native-control and portalled-overlay patterns; no consumer has yet been marked verified for the new shared implementation.


### T1 settled contract and inventory

The two independent read-only audits found 28 shared Checkbox and 14 shared Radio JSX sites in 22 production files, plus 24 raw-checkbox and 29 raw-radio sites (including primitive definitions). Every production choice consumer has an implicit enclosing label. The estimate thumbnail checkbox is nested in a span inside its label. Native markup/refs remain unchanged; a shared implicit-label target rule and a separate-label Field grid treatment preserve interactive targets. No universal wrapper or synthetic click forwarding is needed.

Shared form tokens: `--form-control-font-size` 14px desktop / 16px narrow-or-coarse; `--form-label-font-size` 13px; `--form-button-font-size` 13px; `--form-choice-size` 18px; `--form-choice-target-size` 32px / 44px; `--form-choice-target-inline-size` 24px / 44px; `--form-field-gap` 6px; `--form-group-gap` 12px. Reuse existing `--control-height` 36px / 44px; preserve explicit compact and large control variants outside ordinary form defaults. Shared panels use existing 18px text scale and 11px eyebrow. No global page-type reset.

| Area / paths under frontend/src | Existing pattern or conflict | Ownership / disposition |
| --- | --- | --- |
| styles/global.css, base.css, primitives.css; components/ui/Field.test.tsx | Shared values, native choice visuals; explicit-label public contract | Foundation writer; preserve native input/ref and invalid outline |
| styles/shell.css; components/ui/dialog.css | Contextual large fields/actions/title; popup touch overrides | Overlay writer; retain geometry and semantic styling |
| features/workflow/ExistingFurnitureWorkflow.tsx, existingFurnitureWorkflow.css | Request-only density; upload fields/room/item sections | Primary; move common density to shared rules, keep local structure |
| features/workflow/workflowStageActions.css, furnitureUomField.css | 40px fields, 44px desktop footer, 20–24px padding | Primary adapters; keep room refs, submit blockers and nested UOM behavior |
| styles/designer-home.css | High-specificity designer portal buttons force 14px | Primary; shared action font token |
| features/site-manager/site-manager.css | 22px panel title, fixed13px mobile fields/34px actions | Primary; shared title/control/action values |
| features/ai-estimator-knowledge/knowledge-configuration-ui.css, ai-estimator-knowledge.css, knowledge-quality-workspace.css, knowledge-overview-table.css, knowledge-recommendations.css | Multiple native/shared choice sizes; fixed control fonts and oversized form fields | Primary adapters; preserve configuration/table meaning and intentional layout |
| features/procurement/vendorProcurement.css | 20px choices, basket targets, large header/actions | Primary adapters; preserve card-label overlay and file dropzone |
| features/procurement/vendorDirectory.css | 18px checkbox within44px table label,48px column | Already compatible; preserve, verify indeterminate/ref/table behavior |
| features/vendor-basket-proposals/procurement-main-basket.css, procurement-basket-mode.css | 124px header,44–46px controls/actions and20px choices | Primary adapters; preserve proposal hierarchy/zero-padding workspace body |
| Knowledge mode reference glyph/card; estimate thumbnail checkbox | Deliberately hidden native control or image-backed label | Preserve structural rendering and whole-label target; verify behavior |
| Native choices in login, client/estimator, project-manager, procurement and design requirements | Enclosing labels with feature size overrides | Shared low-specificity defaults plus targeted size adapters after inspection; no handler changes |
| Project chat, project-manager dialog, estimate submission checklist | Already compact headings/actions | Preserve compact presentation; retain44px touch targets |
| Notifications/status/chat/proposal body padding; execution print | Child-owned spacing or print geometry | Structural exceptions preserved |

The primary owns all feature adapters listed above. Shared writers must not edit these paths. Current feature adapters are clean except the understood furniture request edits; any additional dirty adapter must have its existing diff inspected before editing. The browser baseline uses synthetic components and isolated port5176; original source/CSS copies remain available for comparison.


Additional adapter ownership confirmed during implementation: primary owns `auth/login-page.css`, `styles/estimator-dashboard.css`, `features/project-manager/{project-manager.css,pm-estimations.css}`, `features/procurement/{procurementBasket.css,purchaseOrders.css}`, `features/workflow/project-design-requirements.css`, and `features/client/clientQuotation.css` for native choice sizing only (plus standard PM estimate input height/font). Foundation writer additionally owns `features/ai-estimator-knowledge/knowledge-quality.css`. All these paths were initially clean. Native checkbox/radio dimensions now use the common visual token, while feature colors, selection logic, table/thumbnail structure and financial content are preserved.


### Integrated implementation decisions

The implementation changes27 CSS files, the furniture ContextPanel class, and native-control behavioral coverage in Field.test.tsx. It adds no component wrapper, synthetic checkbox click handler, dependency, backend change or new financial/workflow value. Shared input/radio/checkbox native semantics remain intact. The request-only presentation is consolidated into an existing-furniture panel class that preserves local room/item structure across all actions.

Feature adapters use the common density tokens. Vendor/proposal artwork is resized within the existing header; colors and source assets remain unchanged. Intentional existing compact utility variants remain compact on desktop and have touch targets. Vendor table selection retains44px labels in48px columns. The knowledge mode-card's hidden1px native input and separate visible glyph remain a structural exception with whole-card labeling; estimate thumbnails retain their image-backed labels. Native raw-choice colors are preserved rather than assigning a new accent globally.

Integrity review: no confirmed correctness blocker; static CSS review cannot establish every live route at every viewport, so rendered representative consumers and measured hit targets are required. The final verification lane includes39 focused test files spanning shared primitives, furniture/workflow, vendor/procurement, client/estimate, administration/designer, site manager, proposal, knowledge, authentication and project-manager consumers, with at most2 Vitest workers.


Final regression uncovered an unchanged ProposalWorkspace test fixture that renders a routing-aware Recommendations child without a Router. Root assumes exclusive ownership of `features/vendor-basket-proposals/ProposalWorkspace.test.tsx` for adding the missing test-only MemoryRouter provider. Its baseline hash and content were captured before editing. No production navigation behavior is changed; the existing recommendation/discard assertions remain intact. The two initially timed-out cases passed their isolated retries.


## Final verification and handoff

Completed 2026-11-07. Product behavior remains unchanged; the sole production TSX change is the common existing-furniture panel class. Final task changes comprise27 CSS files,2 test files and1 production component. The independent integrity review found no confirmed blocker in the presentation diff; the later test-only MemoryRouter addition was reviewed inline and its full35-test file passed.

### Automated checks

- Initial bounded Vitest run:39 files,850 tests;847 passed,3 failed. Two cases timed out during the run and passed on isolated retry with one worker. The third exposed an unchanged fixture missing the app's Router context.
- Corrected only that test fixture by adding MemoryRouter. Full `ProposalWorkspace.test.tsx` rerun:35 passed. **All850 unique selected tests passed across the final runs.** Passing unrelated tests were not rerun unnecessarily.
- `npm run typecheck`: passed initially and again after the test-fixture fix.
- `npm run build`: passed,3333 modules transformed. Existing warning for chunks larger than500kB remains. No production source changed after this build.
- `git diff --check`: passed. Final hashes/status reconcile all30 intended source/test paths; no unrelated baseline file changed and no task QA artifacts remain in the worktree.

Exact initial selected-test command:

```sh
npm test -- src/components/ui/Field.test.tsx src/components/ui/Button.test.tsx src/components/ui/Drawer.test.tsx src/components/ui/ContextPanel.test.tsx src/components/ui/Dialog.test.tsx src/features/workflow/ExistingFurnitureWorkflow.test.tsx src/features/workflow/WorkflowStageActions.furnitureApproval.test.tsx src/features/workflow/WorkflowStageActions.furnitureScope.test.tsx src/features/workflow/WorkflowStageActions.furnitureReview.test.tsx src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/FurnitureUomField.test.tsx src/features/workflow/ProjectDesignRequirementsPanel.test.tsx src/features/procurement/VendorDirectory.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx src/features/procurement/VendorInductionWeb.test.tsx src/features/procurement/PurchaseOrdersPanel.test.tsx src/features/procurement/ProcurementBasketModeEditor.test.tsx src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/client/ClientEstimateTiers.test.tsx src/features/client/ClientQuotation.test.tsx src/features/estimates/EstimateLineRow.test.tsx src/features/admin/UserMutationDialog.test.tsx src/features/designer/ProjectStructureDialog.test.tsx src/features/site-manager/SiteManagerWorkspace.test.tsx src/features/site-manager/SiteManagerProjectPage.test.tsx src/features/vendor-basket-proposals/CreateProposalPanel.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx src/features/vendor-basket-proposals/ProposalIntakeWorkspace.test.tsx src/features/ai-estimator-knowledge/KnowledgeQualityImportDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quality.test.tsx src/features/ai-estimator-knowledge/KnowledgeSectionEditor.overview.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx src/auth/LoginPage.test.tsx src/features/project-manager/ProjectManagerEstimateNavigation.test.tsx src/features/project-manager/PMShared.test.tsx --maxWorkers=2
```

Exact isolated failure retry:

```sh
npm test -- src/features/procurement/PurchaseOrdersPanel.test.tsx src/features/procurement/VendorInductionWeb.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx --maxWorkers=1 --testNamePattern 'clears the backend quote after a successful item removal|scrubs the token, validates conditional questions, and omits hidden answers|clears discarded recommendation validation before saving a different section'
```

Final fixture verification (from frontend):

```sh
npm test -- src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx --maxWorkers=1
npm run typecheck
```

### Rendered evidence and limits

- Actual components, real app layer declaration, loaded Poppins fonts and designer role marker; isolated port5176, synthetic state/API methods, no real project writes.
- Furniture desktop1440:18px title/checkbox,32px room labels,36px fields with14px text,36px actions with13px text,720px dimensions panel. Mobile390:18px title/checkbox,44px row/field/action targets,16px editable text,390px panel. Twenty-room long form scrolls with reachable footer and no horizontal overflow.
- Final mobile matrix passed all12 modes: assisted upload,request,self-entry,review,correction,preference,ordinary shared form,context panel,common dialog,vendor,knowledge,table. Every measured checkbox/radio label target was at least44×44; textareas84px. Actual vendor-profile panel class included.
- All12 desktop and768px modes loaded and measured before a redundant screenshot timeout prevented retaining the aggregate JSON. Representative furniture/vendor/knowledge/dialog screenshots were reviewed; the lost aggregate is not claimed as retained evidence.
-24 distinct interaction assertions passed: label/Space/Tab selection; dirty-close/Keep editing/discard/focus return; required-selection and busy states; exact synthetic room/version payload; item Add/Remove and count mode; self-confirmation and assisted evidence; review submission identity; correction note; preference payload; explicit-label toggle; keyboard invalid focus; native indeterminate/ref/form submission; vendor table selection.
- After repeated elapsed-time feedback, extended browser scenarios were stopped. **Live-browser axe scans, coarse-pointer desktop emulation,200% zoom/equivalent reflow and the final knowledge dependent-field interaction were not run.** Vendor classification-card pointer interaction was not conclusively verified in the fixture; its existing whole-card label intercepted a direct-input automation click. No product failure was established. Automated consumer regressions passed, but these remaining browser limits must not be presented as full cross-device/accessibility verification.
- Full frontend/backend/OCR suites, physical-device/Safari checks, production actions and migrations were not performed. The repository has no lint script.

### Affected source/test files

- `frontend/src/auth/login-page.css`
- `frontend/src/components/ui/Field.test.tsx`
- `frontend/src/components/ui/dialog.css`
- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
- `frontend/src/features/ai-estimator-knowledge/knowledge-configuration-ui.css`
- `frontend/src/features/ai-estimator-knowledge/knowledge-overview-table.css`
- `frontend/src/features/ai-estimator-knowledge/knowledge-quality-workspace.css`
- `frontend/src/features/ai-estimator-knowledge/knowledge-quality.css`
- `frontend/src/features/ai-estimator-knowledge/knowledge-recommendations.css`
- `frontend/src/features/client/clientQuotation.css`
- `frontend/src/features/procurement/procurementBasket.css`
- `frontend/src/features/procurement/purchaseOrders.css`
- `frontend/src/features/procurement/vendorProcurement.css`
- `frontend/src/features/project-manager/pm-estimations.css`
- `frontend/src/features/project-manager/project-manager.css`
- `frontend/src/features/site-manager/site-manager.css`
- `frontend/src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx`
- `frontend/src/features/vendor-basket-proposals/procurement-basket-mode.css`
- `frontend/src/features/vendor-basket-proposals/procurement-main-basket.css`
- `frontend/src/features/workflow/ExistingFurnitureWorkflow.tsx`
- `frontend/src/features/workflow/existingFurnitureWorkflow.css`
- `frontend/src/features/workflow/furnitureUomField.css`
- `frontend/src/features/workflow/project-design-requirements.css`
- `frontend/src/features/workflow/workflowStageActions.css`
- `frontend/src/styles/base.css`
- `frontend/src/styles/designer-home.css`
- `frontend/src/styles/estimator-dashboard.css`
- `frontend/src/styles/global.css`
- `frontend/src/styles/primitives.css`
- `frontend/src/styles/shell.css`


### Cleanup and unchanged systems

The isolated browser session and task Vite server were stopped; temporary harnesses, screenshots and task CLI artifacts were removed. The baseline/log directory `/private/tmp/lisno-compact-forms` was removed after results were recorded here. Normal ignored build output remains in `frontend/dist/` and existing build caches. User frontend/backend/email-enabled services and drafts were preserved. No dependency, lockfile, API, persistence, permission, finance or email change; no commit, push, deployment or real submission occurred.
