# Inline room dimensions task plan

Date: 2026-11-15
Status: Implemented and verified; T1–T4 complete.
Approved specification: [Room dimensions in the selection dropdown](../specs/2026-11-15-inline-room-dimensions-design.md).
Specification approval: the user replied “Approved” after that specification was presented. Its original proposal wording is retained; this plan records the approval.
Task-plan approval: the user replied “Approved” after this plan was presented.
Execution mode: A, parallel sub-agents, explicitly selected on 2026-11-15 after task-plan approval.

## Outcome and boundaries

Each selected room displays Length (ft) and Width (ft) beside its name inside the existing Rooms dropdown. Remove the separate dimension cards. Preserve the current styling, saved IDs/measurements, calculations, selection/removal rules, and parent-owned save operations in Sales and Client setup.

Only frontend presentation, its bindings, focused tests, and this execution record are in scope. No backend/API changes, dependencies, lockfiles, production data, seeds, migrations, deployment, commits, or pushes. Preserve the existing vendor/default-Project-Manager work and running local development stack.

## Settled implementation contract

- Extend the existing room picker with controlled dimension values and a dimension callback. The shared value contains `id` (stable room ID), `selectionKey` (exact corresponding option ID), `label`, `length`, and `width`. Export its type from the room-control module, without requiring consumers to import the obsolete accordion.
- `EstimateSetupFields` passes these values and its existing `onDimensionChange(id, change)` callback to the dropdown. The parent owns values and saving. No second measurement store, save-on-close behavior, or backend field is added.
- Sales explicitly supplies the mapping from its room type/selection key to saved room ID. Client uses its existing `roomKey` distinction between `type:` and `saved:` keys. Do not join by labels or list positions. Retained or duplicate saved rooms must remain individually addressable; a duplicate cannot be silently collapsed into another room's input. Where a Sales selection key represents multiple saved instances, expose distinct saved-instance rows and route removal through the existing stable-ID callback rather than changing other rooms.
- Render a bounded, searchable, non-modal form popover with grouped native checkboxes and sibling measurement inputs. Replace the listbox/option semantics that cannot correctly contain interactive inputs. Preserve the existing room icons without adding icon dependencies. A row uses compact aligned columns for selection/name, Length, and Width; long names wrap inside their column.
- Selection/name controls toggle selection. Clicking or typing in a measurement never toggles selection, closes the popover, or submits the surrounding form. Guard Enter in the picker where it would otherwise submit; preserve number-input editing keys. Search/checkbox keyboard navigation stays scoped to those controls, not the measurement inputs. Escape and Done close and restore trigger focus.
- Search, chips, counts, select/deselect visible results, Clear all, and Done retain their current purpose. Hiding a row through search or closing the popover never changes its values. Preserve numeric/null conversion and dimension validation.
- Opening the popover is allowed for inspection of existing dimensions when edits are disabled. Checkboxes, chips/removal, bulk actions, and measurements remain non-mutating under the parent guard. No permission, loading, busy, or stale-state restriction is bypassed.
- Remove `RoomDimensionsAccordion` from shared setup. Remove its now-unused implementation/type and card-only styling only after confirming no production consumers remain. Do not retain an unused alternate editing surface.

## Dependency-ordered work

Only one parent task is in progress at a time. Mode A permits the T2 slices below to run in parallel after T1; Mode B performs them inline without implementation subagents.

### T1. Baseline and ownership

Owner: primary agent. Covers AC1–AC5 preparation.

1. Capture the initial dirty-path set, per-target diffs, and hashes of unrelated untracked work under `/tmp/lisno-inline-room-dimensions-qa` before writers start. Current targets are clean, while vendor/default-Project-Manager paths are already dirty.
2. Reconfirm all picker/accordion production consumers and rendered test consumers. Run the focused baseline commands below; record actual failures rather than assuming previous task results still apply.
3. Share the controlled dimension shape, semantics, row class names, and ownership with writers. In Mode A, tell each writer they are not alone and must preserve others' edits. Only the primary may extend ownership to additional files.

Exit: baseline captured, data/control contract settled, and no overlapping writer ownership.

### T2. Implement the inline control and consumer bindings

Parent owner: primary agent. Depends on T1. Covers AC1–AC5.

**Slice A: room control.** Mode A owner: `frontend_implementer` for:

- `frontend/src/features/leads/RoomsMultiSelectDropdown.tsx`
- `frontend/src/features/leads/RoomControls.test.tsx`
- `frontend/src/features/leads/RoomDimensionsAccordion.tsx` removal after integration confirms it is unused

Implement controlled inline inputs and valid form-popover semantics. Preserve search/bulk/chip behavior, keyboard access, focus return, and read-only inspection. Use explicit saved IDs for callbacks. Tests must cover two unequal rooms, different selection/saved IDs, blank values, retained/duplicate rows, no accidental deselection/submission, close/reopen/search retention, empty search, and disabled mutations. This slice does not edit shared setup, consumers, or styles.

**Slice B: shared setup and parent adapters.** Mode A owner: a separate `frontend_implementer` for:

- `frontend/src/features/estimates/EstimateSetupFields.tsx` and `EstimateSetup.test.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, `LeadEstimateWorkspace.test.tsx`, and `LeadEstimateRecommendations.test.tsx`
- `frontend/src/features/client/ClientQuotationSetup.tsx`, `ClientQuotationSetup.test.tsx`, and `ClientQuotation.setup.test.tsx`

Pass the agreed values with explicit selection-key/stable-ID mapping, render no separate cards, and preserve parent state/guards. Keep Client confirmation and protected-removal logic intact. Update consumer tests for native checkbox selection only where room-option semantics changed; do not alter unrelated property/item selectors. Verify stable IDs and values in saved payloads and on reload, with unequal rooms and duplicate/legacy Client entries. Report any further affected test file before editing it.

**Slice C: layout and integration support.** Owner: primary agent for:

- `frontend/src/styles/estimator-dashboard.css`, limited to room-picker/dimension selectors
- Additional consumer regression or synthetic browser-fixture changes only after their current diff is understood

Reuse existing tokens and field treatment. Keep Length/Width beside the selected name at 1440px, 390px, and 320px, with room-name wrapping, aligned measurement columns, bounded vertical scrolling, visible focus, and no horizontal page overflow. Existing unselected rows retain their visual hierarchy. Do not add card headers, extra status badges, icons, motion, or a new theme. Remove obsolete card-only selectors without changing unrelated estimate styles.

Safe parallelism: A, B, and C have disjoint paths and may progress concurrently against the agreed contract. B does not invent fallback identity matching if A's interface is incomplete. Final verification waits for all three.

Exit: both parent screens use the inline editor, no duplicate dimension surface remains, and slice regressions pass or have precisely identified baseline failures.

### T3. Integrate and review

Owner: primary agent. Depends on all T2 slices. Covers AC1–AC5.

- Inspect the combined diff and all remaining references to the accordion. Reconcile type imports and any test consumers outside the assigned slices.
- Trace selection, dimension edits, removal confirmation, guarded callbacks, and saving using stable room IDs. Verify that opening a read-only picker cannot mutate values and that closing it is not a save action.
- Confirm search/bulk actions preserve hidden selections; removal/focus handling remains usable when an edited row disappears or Client confirmation opens.
- In Mode A, run `integrity_reviewer` on this frontend integration, concentrating on saved-room identity, lost edits, permission/busy guards, event propagation, and accessibility semantics. In Mode B, perform the same review inline. Resolve confirmed findings through the file owner.
- Compare unrelated dirty work against T1 and ensure vendor/default-manager changes and runtime configuration are preserved.

Exit: no unresolved scoped review defect; writers and review fixes finished.

### T4. Final verification and handoff

Owner in Mode A: `verification_runner` after T3; primary owns browser QA and final reconciliation. Mode B: primary performs all checks inline. Covers AC1–AC5.

Focused baseline and final command, from `frontend/`:

```sh
npm test -- src/features/leads/RoomControls.test.tsx src/features/estimates/EstimateSetup.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/client/ClientQuotationSetup.test.tsx src/features/client/ClientQuotation.setup.test.tsx
```

Include any further rendered suites discovered to use the changed room controls; keep the final exact suite list in this record. Run meaningful assertions rather than replacing failures with broad queries. Then run:

```sh
npm run typecheck
npm run build
```

Broaden tests when failures or unresolved cross-consumer concerns justify it. Backend/OCR/mobile suites are not required for this frontend-only contract-preserving change. Do not claim lint passed; the repository has no lint script.

Browser QA uses synthetic fixtures and the actual rendered Sales and Client setup at 1440px, 390px, and 320px. Check two selected rooms, unequal dimensions, blank values, long names, retained/duplicate rooms, search, keyboard/tab flow, Escape/Done focus return, read-only inspection, Client removal confirmation, no unexpected save requests, no separate cards, and no overflow or console errors. Run automated accessibility checks on the open editable and read-only popovers. Keep screenshots/logs under the temporary QA directory; do not expose real client data or change the configured default manager.

Finish with repository-root `git diff --check` and `git status --short`. Record exact results, baseline failures, unrun checks, affected files, temporary evidence, and remaining limitations in this plan. Do not claim completion if a new scoped failure remains. No commit, push, migration, seed, production change, or deployment is included.

## Acceptance trace

| Criterion | Tasks | Final evidence |
| --- | --- | --- |
| AC1: same-row inputs, no separate cards | T2 A/B/C, T4 | Shared setup tests and desktop/mobile browser views |
| AC2: stable identity and retained values | T2 A/B, T3, T4 | Asymmetric saved IDs, duplicate/retained rooms, save/reload checks |
| AC3: interaction/removal/guards | T2 A/B, T3, T4 | No-submit/no-deselect tests, disabled mutations, Client confirmation |
| AC4: accessible responsive controls | T2 A/C, T3, T4 | Keyboard, focus, axe, and three-width rendered checks |
| AC5: styling/contracts/worktree preservation | T1–T4 | Parent regression suites, typecheck/build, integrated diff and hygiene |

## Final execution record

Specification and task plan approved; Mode A selected. T1–T4 complete. `inline_control` implemented the picker; `inline_bindings` connected shared setup, Sales, and Client; primary integrated scoped styles; `inline_review` found no scoped integrity issue; `inline_verify` ran the final focused tests and typecheck. Existing runtime data remained outside this task.

The selected room name, Length, and Width now share a row in the existing dropdown. Separate dimension cards and their unused component were removed. Parent-owned values, saved room IDs, calculations, removal confirmation, save operations, and backend contracts are preserved. Production changes are limited to the dropdown, shared setup bindings, Sales/Client adapters, and room styles. Two additional existing tests (`router.test.tsx` and `LeadEstimateWorkspace.firstSubmit.test.tsx`) now query room checkboxes. No dependencies or lockfiles changed.

Verification, from `frontend/` unless noted:

- Baseline six-file command above with `--maxWorkers=2`: **127 tests passed** before edits.
- Final same six-file command with `--maxWorkers=2`: **135 tests passed**, six files, exit 0. Includes distinct saved IDs, unequal dimensions, blank values, duplicate/legacy Client rooms, save/reload, search retention, guarded mutations, focus, keyboard handling, and Client removal confirmation.
- `npm test -- --maxWorkers=2 src/app/router.test.tsx src/features/leads/LeadEstimateWorkspace.firstSubmit.test.tsx`: **161 passed, one known baseline failure**. The router case `continues from configured rooms to estimate item selection` expects `Wardrobe carcass` and also fails on the baseline; it is outside this alignment change.
- `npm run typecheck`: exit 0, no diagnostics.
- `npm run build`: exit 0 after the final accessibility adjustment and removal of temporary QA fixtures. Vite reports existing large bundle warnings.
- Rendered Sales and Client checks at **1440px, 390px, and 320px**: selected measurements remain beside their room names, no separate cards, and no horizontal overflow. Client coverage includes long names, legacy/duplicate rooms, confirmation cancellation, search, Escape focus return, and read-only inspection. Sales Done/reopen preserves values. No console/route errors, unexpected requests, or save requests occurred. Automated accessibility checks report **zero violations** for editable Sales/Client and read-only Client controls. A focusable scroll region resolves keyboard access in the disabled state.
- Repository-root `git diff --check`: passed. Compared pre-existing tracked diffs and unrelated untracked hashes against T1: no unexpected changes.

Evidence is under `/tmp/lisno-inline-room-dimensions-qa` (baseline/final logs, build log, synthetic browser logs, and desktop/mobile screenshots). Temporary repository browser fixtures were removed and owned browser sessions closed. The local frontend preview remains available on port 5173; the existing backend stack is preserved.

Full repository suites, backend/OCR/mobile checks, and lint were not run for this bounded frontend change; the repository has no lint script. No seed, migration, production mutation, deployment, commit, or push was performed. The known router baseline failure and existing bundle-size warnings remain; there is no unresolved scoped UI issue.
