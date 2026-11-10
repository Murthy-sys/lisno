# Main Line Applicable tiers toggle and grouped Mode editors

Date: 2026-11-11
Status: revised specification and refinement plan approved; Mode A refinement implemented and verified. The latest radio presentation follow-up is verified with 108 passing focused tests, browser checks, typecheck and build; see its execution record. Earlier broader-suite checks apply to the previous UI.

## Goal and confirmed interpretation

In Configuration → Main Lines, add an ON/OFF toggle under Overview → Applicable tiers. Show Signature, Premium and Functional choices when enabled. Keep one top-level **Mode** tab and move the existing tier editors inside that section, preserving their functionality and independently saved settings.

The user's clarification is: “we will have only Mode.. and all signature,Premium, Functional will move under Modes with same functionality”. This specification interprets that as one top-level navigation entry, not removal or merging of the separate mode configurations.

## Current behavior and evidence

- The worktree was clean at investigation start.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx` renders three always-visible Applicable tiers checkboxes and edits the existing `overviewPayload.applicableTiers` array. It already disables these controls while saving or without edit permission.
- `shared/knowledge/knowledgeModeTiers.ts` distinguishes four Configuration scopes: default, Signature, Premium and Functional. An explicit empty applicable-tier array means no tier modes; legacy payloads without the field retain Signature applicability.
- `KnowledgeItemWorkspacePage.tsx` derives available modes from the saved Overview, not the unsaved form. Each current mode renders the same `KnowledgeModePanel` with a scope-specific data source and editor-session key.
- `knowledgeWorkspaceSections.ts` currently inserts Mode, Signature Mode, Premium Mode and Functional Mode as separate top-level tabs. `KnowledgeSectionNavigation.tsx` also exposes them in the narrow-screen Configuration section selector.
- `knowledgeModeTierDataSource.ts` separates mode queries and saves by Main Line ID, revision, section and scope. The default scope has independent storage; Signature's established compatibility behavior is intentional.
- Existing configuration-mode workspace tests cover distinct mode values, failed Overview saves, hidden-tier data retention, unsaved-change protection, keyboard navigation and read-only access.

## Scope and non-goals

Scope: the web Main Line Configuration Overview controls and Mode navigation, plus directly affected tests and styles.

Do not change estimator screens, price calculations, PMC behavior, rate ownership, tier eligibility formulas, other Configuration sections, Procurement or native mobile screens. Do not add a backend field, migrate records, merge/copy mode settings, add dependencies, or change permission rules. No commits, deployment, production data edits or external actions are included.

## Required behavior

### Overview toggle

1. Add an accessible switch named **Applicable tiers** beside the existing heading, using the current Configuration visual style.
2. **OFF:** hide the three tier checkboxes and set the Overview draft's `applicableTiers` to `[]`. After a successful Save Overview, only the default editor is available under Mode. Keep every tier's saved configuration intact.
3. **ON:** display the existing Signature, Premium and Functional checkboxes. Switching from OFF initially selects all three; the user can then choose a subset before saving. Selecting none returns to OFF. No separate persisted enabled flag is needed.
4. On opening or refreshing a Main Line, initialize the switch from its current applicable tiers: any selected tier means ON, an explicit empty array means OFF. Preserve legacy missing-field semantics and existing selections without marking the form dirty merely by loading it.
5. Continue using **Save Overview**. The local controls respond immediately, but available mode editors change only after a successful save. A failed save keeps the unsaved choice available for retry and leaves saved mode availability unchanged.
6. Preserve the existing read-only/saving locks. Help text explains that the main Mode screen remains available and that disabling tiers preserves their saved configuration. Use Mode in user-facing labels instead of introducing a separate Default Mode label.

### One top-level Mode section

7. The primary Configuration navigation and its narrow-screen selector contain one **Mode** entry. Signature Mode, Premium Mode and Functional Mode are no longer sibling top-level sections.
8. Inside Mode, show only the enabled tier choices as radio buttons: **Signature Mode**, **Premium Mode**, **Functional Mode**. Remove the separate **Default Mode** tab/choice. Preserve the existing tier labels, order and functionality.
9. The main **Mode** screen directly displays the existing default editor, whether tiers are ON or OFF. When tiers are ON, the three enabled tier choices remain available inside this section; do not automatically open a tier in place of the default screen. When all tiers are OFF, omit the tier selector.
10. Entering **Mode** opens the default screen. Activating the main Mode tab while a tier editor is open returns to that default screen through the existing unsaved-change guard. Keep the current valid tier selection during ordinary refetches. Activating Mode while already on its default screen is a no-op.
11. Selecting a tier loads the same editor, scope, fields, pricing methods, calculations, descriptions, references, save controls and saved-summary information used by that tier today. The default screen uses **Mode** / **Save Mode** labels; tier save labels remain unchanged. The internal default scope and its separate settings remain intact.
12. Reuse the existing unsaved-change guard for switching inner modes or leaving Mode. Save/discard/cancel behavior and in-flight-save protections remain effective. Never silently unmount a dirty or saving editor when applicability refreshes.
13. If a currently selected tier becomes unavailable through a refreshed saved Overview, move a clean editor to Default Mode. Preserve a dirty/saving editor and the existing resolution protections until it is safe to leave; do not lose local edits or expose unavailable tiers as new choices.
14. Keep active mode identity separate from its parent navigation presentation. Scope-specific caches, pending editor sessions, Main Line/revision boundaries and save targets must remain unchanged. Mount only the selected editor; do not fetch or save all modes merely because they share one navigation section.

## Data, API and permission impacts

- Reuse the existing Overview `applicableTiers` array and its normal validated save flow; no API or schema change is required.
- Preserve independently stored default/Signature/Premium/Functional configuration. Turning applicability OFF changes only applicability metadata when explicitly saved.
- Preserve latest-draft/active-revision selection, version/CAS handling, conflict review, backend authorization and read-only history.
- Existing downstream consumers continue to interpret saved applicability exactly as before. This change does not invent a default-to-financial-tier price fallback in estimation.
- No automatic data writes when opening the page or changing navigation. The only writes remain explicitly requested existing saves.

## UX and accessibility

- Keep the existing design, surrounding settings and tier checkbox appearance; add only the switch and grouped navigation needed for this request.
- Use a keyboard-operable switch with an accessible checked state and visible focus. Associate help text with the control.
- Give parent navigation and inner tier navigation distinct accessible names and correct selected/panel relationships. The default screen has no selected tier; do not point its panel label or focus to a removed Default Mode tab. Keyboard navigation and focus must continue to work through cancelled/failed navigation attempts.
- Support desktop and narrow screens without overlapping controls or horizontal page overflow. The narrow-screen top-level selector still contains only Mode; provide usable inner mode selection within its panel.
- Keep loading, error/retry, permission and disabled states scoped to the selected editor.

## Implementation approach and constraints

Extend the existing Overview and workspace navigation. Reuse `KnowledgeModePanel`, its scoped data sources and the existing save/unsaved-change mechanisms. The current architecture provides a direct approach, so a backend redesign or new parallel configuration model is unnecessary.

Likely affected areas: `KnowledgeOverviewPanel.tsx`, `KnowledgeItemWorkspacePage.tsx`, the web navigation helper/component as needed, scoped Configuration CSS, and existing Overview/workspace/navigation tests. Do not alter shared storage semantics to simplify UI grouping.

Principal risks are scope mix-ups during a mode switch, losing unsaved edits, premature availability changes before Overview saves, confusing nested focus, and unintended changes to consumers of shared navigation helpers. Review those boundaries explicitly. Rollback is a bounded source revert; no data migration or rollback script is needed.

## Acceptance criteria

- **AC1 — Overview toggle:** OFF hides choices; ON reveals the three choices; subset selection, initialization, empty selection and locks behave as specified without unrelated field changes.
- **AC2 — Saved applicability:** successful Overview saves update inner mode choices; failed saves retain saved availability and local changes. Saved hidden-tier configurations survive OFF/ON and reload.
- **AC3 — Grouped navigation:** exactly one top-level Mode entry exists. Its inner choices contain only applicable Signature Mode, Premium Mode and Functional Mode, with no separate Default Mode option. Opening Mode shows the independent default editor; entering a tier and returning through Mode preserves the correct save/unsaved-change behavior. OFF shows the default editor directly. Verify desktop and narrow-screen controls.
- **AC4 — Same independent functionality:** unequal saved values across all four scopes and two Main Lines remain isolated after editing, saving, switching and reloading. Existing configuration forms and calculations are reused.
- **AC5 — Safe transitions:** unsaved edits, save failure, in-flight saves, applicability refreshes, Main Line/revision changes and read-only access retain their protections and target the correct scope.
- **AC6 — Focused verification:** rendered Overview/workspace/navigation tests cover AC1–AC5; keyboard and browser checks cover the switch and grouped Mode navigation at desktop and mobile widths. Run frontend typecheck/build, relevant data-source regressions and `git diff --check`. Broaden checks only if implementation changes a shared contract.

## Assumptions and open decisions

- The default configuration stays independently editable as the main Mode screen; only its separate navigation option and Default Mode label are removed.
- Individual tier checkboxes remain available when the toggle is ON; enabling an OFF toggle selects all three before the user narrows the selection.
- Saved applicability, rather than a new flag, controls the switch after reload.
- No unresolved product decision blocks this specification. Approval confirms these explicit interaction defaults; implementation remains gated by the separate task plan and execution choice.


## 2026-11-11 refinement: default editor is the main Mode screen

The user requested: “we don need default mode label seperatly.. we can go default screen asn remaing three things will come as it is”. Requirements 6 and 8–11, accessibility notes and AC3 above supersede the previous separate Default Mode selector and parent-click-preserves-tier behavior.

The current code renders a fourth Default Mode choice via `MODE_SECTION_LABELS` in `KnowledgeItemWorkspacePage.tsx`, and currently treats clicking the active parent Mode tab as a no-op. The correction removes that fourth choice, restores Mode/Save Mode wording for the default editor, and uses the main Mode navigation to open it. Signature/Premium/Functional editors, Overview switch semantics, stored values, prices and permissions stay unchanged. No other feature or layout redesign is included.

Verification for this refinement is limited to navigation/labels, returning to Mode with clean or dirty tier edits, default-scope identity, and desktop/mobile keyboard/accessibility behavior. Preserve the existing dirty-default and deferred-navigation protections. The old 200-pass/20-baseline-failure result is historical evidence and must not be reported as fresh validation of this refinement.


## Radio-control presentation follow-up

The user specified that Signature/Premium/Functional should use radio buttons. This changes the presentation of the existing mutually exclusive inner choices only: use one native radio group on desktop and mobile, retaining current labels, independent settings, main Mode return and unsaved-change behavior. On the main Mode screen no tier radio is checked. Preserve the Overview multi-select checkboxes, which control availability rather than the currently open editor. Selected editor content uses a correctly named region rather than tabpanel semantics. This remains within the approved mode-navigation behavior; no product/data decision or new approval gate is introduced.


## Clear the selected tier

The user clarified that all extra modes must be unselectable so the default screen is visible. Clicking an already-selected tier radio again (or activating it with Space) requests the existing main Mode navigation. After that navigation completes, all tier radios are unchecked and the independent default editor is visible. Preserve the existing unsaved-change confirmation, failed/in-flight-save protections, saved tier settings and Overview applicability. This adds no separate control, automatic save or pricing change.
