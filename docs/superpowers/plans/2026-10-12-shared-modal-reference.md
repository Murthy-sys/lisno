# Shared modal reference: task plan

Date: 2026-10-12
Status: Implemented and verified in approved Mode A on 2026-10-12. The full frontend suite retains 25 demonstrated pre-existing failures.
Baseline: `/var/folders/8j/zd8v148d3qs4hdqtz2sncbjm0000gn/T/lisno-modal-reference-8pkiq3ho` contains the initial worktree status, frontend diff and immutable source copy.
Specification: [Shared modal presentation](../specs/2026-10-12-shared-modal-reference-design.md), approved by the user on 2026-10-12.

## Outcome and constraints

Apply the supplied compact LISNO modal presentation throughout existing centered popups. Preserve all current fields, labels, values, helper text, validation, actions, permissions and behavior. Do not introduce screenshot sample fields or replace existing deletion safeguards. Keep existing side drawers and nonmodal popovers unchanged.

This plan covers frontend presentation only. No backend, database, migration, sync, notification, deployment, dependency, lockfile, commit or push work is authorized by it.

## Execution and ownership

After plan approval, obtain the repository's required execution choice. In Mode A use the independent implementation slices below; in Mode B the primary agent performs those same slices sequentially. The primary agent owns integration, product interpretation and shared presentation contracts. Keep one parent task in progress at a time; independent subtasks within that parent may run concurrently in Mode A.

All writers must preserve others' changes. A dirty file may be assigned only after its initial diff has been captured and understood. Any newly discovered shared dependency returns to the primary agent rather than receiving overlapping edits.

## 1. Establish the baseline and shared presentation contract

Owner: primary agent. Depends on plan approval and execution choice. Status: complete.

- Capture the initial `git status --short`, relevant tracked diffs and copies of relevant untracked files in a task-specific temporary directory. Preserve the existing Procurement and Configuration work.
- Reconcile the audited inventory of 55 shared Dialog call sites, feature overrides and three bespoke popup implementations with the current source. Record which consumers inherit the shared change and which need explicit presentation adjustments.
- Capture representative existing fields/actions and desktop/mobile rendering using isolated frontend fixtures or existing safe test data. Do not start a configured backend that seeds or changes a database for visual QA.
- Read the existing Dialog/overlay tests and consumer structures. Settle a minimal compatible presentation contract for toolbar, content and action footer before delegating writers. Keep overlay behavior, form ownership and existing Dialog props compatible.
- Identify every shared selector used by drawers; scope modal changes to centered overlays. Preserve the existing font and use the repository's LISNO asset.
- Run focused baseline checks where needed to distinguish pre-existing failures from regressions.

Acceptance: specification AC2–AC4 and AC6 have concrete baseline evidence; every candidate write has one owner; field/action and behavior preservation are explicit.

## 2. Implement and reconcile the modal presentation

Depends on task 1. Status: complete. Mode A slices may run concurrently only after the shared contract is settled.

### 2A. Shared shell and integration styles

Owner: primary agent.

Owned paths:

- `frontend/src/components/ui/Dialog.tsx` and its focused test file.
- Shared modal styles in `frontend/src/styles/index.css` and, only if required, `frontend/src/styles/primitives.css`.
- Modal-specific overrides in `frontend/src/styles/role-themes.css`, `frontend/src/styles/designer-home.css` and `frontend/src/styles/estimator-dashboard.css`.
- A dedicated shared modal stylesheet only if it reduces selector ambiguity; the primary agent owns its import and load order.

Work:

- Add compact LISNO toolbar presentation, preserve one accessible dialog name and retain the existing close/busy/inert/focus behavior.
- Apply the approved off-white surfaces, borders, 18–20px content headings, compact desktop labels/body text, consistent form gaps and separated footer styling.
- Keep mobile inputs readable, actions reachable and large forms/media unconstrained by the standard form width.
- Preserve consumer-owned forms and existing action ordering. Avoid broad button/control selectors that reach drawers or page content.
- Integrate requests from the other slices for shared style hooks. Do not infer destructive semantics from text or introduce new product controls.

### 2B. Configuration and basket proposal consumers

Owner in Mode A: one frontend implementer.

Owned paths: centered-dialog markup within `frontend/src/features/ai-estimator-knowledge/`, its `knowledge-configuration-ui.css` and `ai-estimator-knowledge.css`; centered-dialog markup/styles in `frontend/src/features/vendor-basket-proposals/`, including `ProposalMetadataDialog.tsx`, `ProposalMasterDialog.tsx` and modal rules in `proposal.css`; directly associated focused tests.

Work:

- Reconcile existing modal body/footer classes with the shared presentation contract.
- Preserve all existing deletion confirmation fields, impact checks, audit Reason, conflict/retry behavior and request-review state.
- Preserve every existing proposal field and draft workflow. The no-new-fields instruction does not authorize deleting current fields from unrelated dialogs.
- Keep Configuration and Procurement side drawers/workspaces visually and functionally unchanged. Scope any selector previously shared by Dialog and ContextPanel carefully.
- Ask the primary agent to handle changes needed in shared styles; do not edit slice 2A paths.

### 2C. Other shared-dialog consumers and feature overrides

Owner in Mode A: one frontend implementer.

Owned paths: centered-dialog presentation within `frontend/src/features/procurement/`, `leads/`, `messages/`, `admin/`, `access/`, `finance/`, `workflow/`, `site-manager/` and `estimates/`; feature-local modal CSS such as `procurementBasket.css` and `projectChat.css`; directly associated tests. Shared styles and files owned by other slices are excluded.

Work:

- Review all remaining shared consumers against the inventory; edit only those requiring presentation reconciliation.
- Resolve custom headers/close buttons in Procurement award and recommendations so each modal has one intended visible close control and a consistent toolbar.
- Preserve award form state/scrolling, recommendation content, message forms, attachment/emoji controls and role-specific actions.
- Preserve mandatory prompts, hidden close controls, busy dismissal restrictions and published-estimate focus refs.
- Preserve existing button labels, forms, payloads and handler wiring. Coordinate stylesheet changes in `styles/` with the primary agent.

### 2D. Media and bespoke popup presentation

Owner in Mode A: one implementer after a slot becomes available; no overlap with slices 2B or 2C.

Owned paths:

- `frontend/src/components/design/EstimateDrawingPreviewDialog.tsx` and `ImageAnnotationEditor.tsx`, with associated tests.
- `frontend/src/components/ui/FilePreview.tsx`.
- `frontend/src/features/client/ClientSiteCompletionReview.tsx`, `ClientVendorWorkReview.tsx` and centered dialogs in `DesignSectionReview.tsx`, with associated tests.
- Feature-local styles belonging exclusively to these consumers. Shared `styles/index.css` changes remain owned by the primary agent.

Work:

- Match popup chrome/density while retaining image/drawing dimensions, error/loading states, Previous/Next, zoom/annotation and existing note fields/actions.
- Preserve the native annotation note dialog's placement, submission and parent-editor focus model.
- Preserve nested preview/discard confirmation behavior and inert handling.
- Do not turn media viewers into compact forms or introduce new close/dismiss paths.

Acceptance for task 2: AC1–AC6 are implemented across the reconciled inventory, with no fields, actions, data or business logic changes. Each slice supplies its exact diff and focused verification evidence.

## 3. Review the integrated change

Owner: primary agent; in Mode A use an `integrity_reviewer` after all writers finish. Status: complete. Depends on task 2.

- Inspect only this task's changes against the captured baseline, including dirty and untracked files.
- Confirm all inventoried centered popups inherit the design or have explicit reconciliation; record any exception rather than silently omitting it.
- Check unchanged field/action inventories, form associations, required/disabled rules, handlers, typed-name/Reason safeguards and non-dismissable states.
- Check CSS specificity and portal role selectors for leakage into ContextPanel, Drawer, page controls and nonmodal popovers.
- Resolve confirmed findings before final verification. No concurrent implementation writes during final verification.

Acceptance: AC2–AC4 and AC6 pass integrated review; any scope or compatibility concern is resolved or clearly reported.

## 4. Verify the integrated result

Owner: primary agent; in Mode A use a `verification_runner` after review fixes are finished. Status: complete. Depends on task 3.

Run from `frontend/`:

1. Focused existing regression tests, including `src/components/ui/Dialog.test.tsx`, `src/features/vendor-basket-proposals/ProposalMetadataDialog.test.tsx`, `src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx`, `src/features/procurement/ProcurementBasketComparison.test.tsx`, `src/features/leads/EstimatorRecommendations.test.tsx`, `src/features/messages/DailyCriticalTasksPrompt.test.tsx`, `src/components/design/EstimateDrawingPreviewDialog.test.tsx`, `src/components/design/ImageAnnotationEditor.test.tsx`, `src/features/client/ClientSiteCompletionReview.test.tsx` and `src/features/client/ClientVendorWorkReview.test.tsx`. Include additional affected existing tests as identified by the final diff.
2. `npm run typecheck`.
3. `npm test`, appropriate to the globally shared Dialog impact. Separate demonstrated baseline failures from regressions; fix failures caused by this change.
4. `npm run build`.

Add tests only for meaningful preservation risks introduced by changed markup or overlay integration; avoid assertions that merely mirror cosmetic implementation.

Rendered checks:

- Verify representative form and destructive-dialog layouts at 390px, 768px, 1440px and 1920px. Check long content, increased text size and a short viewport.
- Check informational/version-conflict, mandatory/busy, Procurement award, recommendations, chat, nested drawer confirmation and media states at desktop and narrow widths.
- Exercise submit, Cancel, validation, busy/error states, Tab/Shift+Tab, Escape/backdrop rules, close buttons and focus restoration. Check one visible close control when permitted and one accessible dialog name.
- Compare representative Configuration and Procurement drawers and nonmodal popovers with baseline captures to demonstrate unchanged presentation.
- Inspect screenshots, runtime errors and any unexpected requests. Record screenshots/logs in a task-specific temporary directory.

Repository checks: `git diff --check` and `git status --short`. There is no repository lint script; do not claim lint passed. No backend or OCR tests are required for a presentation-only diff unless implementation unexpectedly crosses that boundary, which must be resolved before continuing.

Acceptance: AC1–AC7 have exact evidence. Do not label partially verified work complete.

## 5. Handoff

Owner: primary agent. Status: complete. Depends on task 4.

- Record actual modified files, decisions, checks/results, baseline failures, artifact locations and any unrun checks in this plan.
- Report the visual result and field/behavior preservation concisely, including remaining limitations if present.
- Stop only task-owned QA processes and retain no unintended runtime artifacts in the repository.
- Do not stage, commit, push, deploy or mutate databases.

## Approval boundary

Completed: specification approved, task plan approved, and user selected Mode A before implementation.


## Implementation and verification record

### Result

- Shared `Dialog.tsx` now uses `DialogToolbar.tsx` and scoped `dialog.css` for the compact LISNO toolbar, content introduction, controls and action footer. Optional icon/tone and close-label/ref presentation props retain the existing overlay lifecycle.
- All 55 shared Dialog call sites and three bespoke centered popups were reviewed. Consumer body/footer hooks and conflicting feature overrides were reconciled. Forms, fields, validators, payload handlers, action labels, permissions and mandatory/busy dismissal behavior remain unchanged.
- The two existing custom close buttons in recommendations and Procurement award moved to the shared toolbar with their original accessible labels and refs. No new product fields or dependencies were added.
- Reference styling is scoped to centered popups. Configuration and Procurement drawer flows stay intact. Final mobile drawing-tool wrapping was narrowed to the popup tool row after rendered QA exposed inherited word wrapping that was too aggressive.
- 68 frontend source/test/style files differ from this task's captured baseline. Exact inventory: `/tmp/lisno-modal-reference-evidence/changed-files.txt`. Principal shared files are `frontend/src/components/ui/{Dialog.tsx,DialogToolbar.tsx,dialog.css,Dialog.test.tsx}`; remaining changes reconcile feature wrappers/styles and regression coverage.

### Review

Independent integrity review compared current source against the immutable baseline, including JSX control attributes, form ownership, text and mutation handlers. It found no confirmed regression. Typed basket-name confirmation, audit Reason, impact checks, conflict/retry rules, overlay focus and nested inert handling remain intact. Bespoke image viewers retain their pre-existing focus-trap/Escape limitations; changing that interaction contract was outside this visual task.

### Automated checks

All commands ran from `frontend/` except repository hygiene:

- `npm test -- src/components/ui/Dialog.test.tsx src/components/ui/Drawer.test.tsx src/components/ui/ContextPanel.test.tsx src/features/vendor-basket-proposals/ProposalMetadataDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/components/design/EstimateDrawingPreviewDialog.test.tsx src/components/design/ImageAnnotationEditor.test.tsx src/features/client/ClientSiteCompletionReview.test.tsx src/features/client/ClientVendorWorkReview.test.tsx src/features/leads/EstimatorRecommendations.test.tsx`: 140 tests passed across 10 files.
- `npm test -- src/features/procurement/ProcurementBasketComparison.test.tsx src/features/messages/DailyCriticalTasksPrompt.test.tsx`: 50 tests passed across two files.
- Final CSS adjustment: `npm test -- src/components/ui/Dialog.test.tsx src/components/design/EstimateDrawingPreviewDialog.test.tsx src/components/design/ImageAnnotationEditor.test.tsx`: 59 tests passed across three files.
- `npm run typecheck`: passed, repeated after the final CSS adjustment.
- `npm run build`: passed, repeated after the final CSS adjustment; existing output-chunk size warning remains.
- `npm test`: 4,749 passed, 25 failed; 303 test files passed and seven failed. All 25 exact failure names reproduced in the immutable pre-change frontend snapshot. There are no current-only failures in that comparison. The full suite was not repeated for the final CSS-only wrapping adjustment; the focused checks, typecheck and build above were repeated.
- Baseline failure categories: authorization contract (1), password reset (1), accessibility smoke (2), designer furniture (1), Knowledge workspace layout (4), Knowledge Mode layout (1), Knowledge screens (15). Baseline rerun: 153 passed, 25 failed. Vite config was confirmed identical before using the current config path to run snapshot tests.
- `git diff --check`: passed; final `git status --short` inspected to preserve prior dirty work.

Exact logs: `/tmp/lisno-modal-final-{focused,focused-additional,typecheck,full-tests,baseline-failures,baseline-comparison,build,diff-check,status}.log` and `/tmp/lisno-modal-final-css-{focused,typecheck,build,diff-check,status}.log`. The full suite logged existing unmatched MSW-handler and React act warnings. No lint script exists and lint was not claimed.

### Rendered checks

Actual components were served using disposable frontend-only fixtures and synthetic read responses, without a backend or database. Screenshots were inspected as images.

- Six form/confirmation states at 390, 768, 1440 and 1920px: metadata, name-only form, proposed UOM, destructive lifecycle, version conflict and unsaved changes. No unintended horizontal overflow. The matrix was repeated after the final wrapping correction.
- Eight specialized states at 390 and 1440px: recommendations, tracked chat action, Procurement award, completion images, vendor-work images, native text annotation, drawing preview and file preview. No unintended popup horizontal overflow. Media navigation was exercised in both directions. Settled screenshots account for the existing award/drawer animations.
- Existing Configuration drawer screenshots are pixel-identical to the pre-change snapshot at 390 and 1440px. Rendered metadata field labels/values/required/disabled inventory also matches the baseline at both widths.
- Keyboard Enter submitted the same metadata payload; nested discard closed back to the focused Cancel control; Escape kept a busy modal open. At 390×500px the validation/error form's Save action remained reachable. Mobile drawing Submit change request remains reachable by scrolling.
- Axe check of the rendered proposed-UOM modal: zero violations. This is a representative check, not a claim of whole-application accessibility conformance.
- Completed fixture matrices recorded no JavaScript runtime errors. Initial fixture-server path and response-envelope errors were resolved before verification. Existing project font links were loaded for final captures. Reduced-motion rendering was included.

Evidence: `/tmp/lisno-modal-reference-evidence/screenshots/` and `/tmp/lisno-modal-reference-evidence/rendered-summary.json`. Temporary browser logs and screenshots were moved outside the repository. Task-owned QA browser and servers were stopped; the user's application server was not stopped.

### Limits and external actions

No production deployment, database mutation, synchronization, migration, seed, dependency change, commit or push occurred. Backend, replica-set and OCR suites were not run because this is a frontend presentation change. Required builds generated ignored `frontend/dist/` and TypeScript cache artifacts. The existing full-suite failures remain unresolved and separate from this task.
