# Backend-owned Inclusion and Exclusion lists

Status: implemented in approved execution mode A. Focused tests, builds and integrity review passed. Desktop interaction and mobile rendered-state checks passed; the final native mobile conflict-repair click check was inconclusive because of browser-tool timeouts. See the task plan for exact verification evidence and limitations.

## Goal

In Main Line → Mode → Execution → Sub-Vendor, display the Inclusion and Exclusion items supplied by the backend. Users can delete any item, including the last item, and the deletion remains after saving and reloading. The same value cannot be selected in both lists at once.

This follows the approved enterprise UI modernization. The compact checklist layout remains; this request changes list sourcing and therefore requires a separate specification under the repository workflow.

## Current behavior and evidence

- Baseline is commit `cd0d3e1` (`css changes`); the worktree was clean at investigation start.
- `frontend/src/features/ai-estimator-knowledge/knowledgePmcScope.ts:13` defines six hardcoded starter items. `KnowledgeModeConfigurationBuilder.tsx:444` substitutes these when a saved list is missing and also creates the other default list when an item changes.
- `knowledgeModePendingChanges.ts:83` and `knowledgeModeDescription.ts:58` also use those defaults. Updating only the rendered checklist would leave inconsistent pending-change and paragraph behavior.
- `KnowledgePmcScopeChecklist.tsx` already removes rows by stable ID, handles keyboard focus, and calls the parent draft update. The parent marks Mode dirty and synchronizes the scope paragraph.
- The backend already owns the saved arrays in `advanced.payload.modeConfigurations[]`, on the canonical `modeKind: "pmc"` configuration. Section validation accepts explicit empty arrays; saving replaces the supplied payload and reads return persisted data without injecting starter rows. A new Main Line starts with an empty section payload.
- Existing frontend tests in `KnowledgePmcScope.test.tsx` and `KnowledgeModeSectionStateRemoval.test.tsx` cover deletion, empty lists, independent list state, paragraph synchronization, and Save Mode/Discard. These are code/test observations, not evidence of a reproduced production persistence failure.
- Current frontend and backend validation check duplicates within each list but do not reject the same selected value across the two lists. `backend/tests/ai-estimator-knowledge-item.service.test.ts:327` currently saves Transport selected in both lists. This is valid under the old behavior and must be handled explicitly when introducing the requested restriction.

## Proposed behavior

1. Use the existing backend section response as the list source. Preserve each returned item's ID, name, selected state, and order.
2. A missing list or explicit `[]` displays the existing empty state. Do not manufacture Transport, Shifting, or any other entry in the frontend. Previously persisted entries continue to appear.
3. Delete removes exactly that item from the chosen list in the local Mode draft. The other list and other Main Lines are unaffected, even when names match.
4. Retain the current Save Mode workflow: Save persists the remaining items, including `[]`; Discard restores the saved lists. Refresh after a successful save must not recreate deleted entries. This request does not introduce automatic saves of unrelated Mode edits.
5. Add Inclusion/Add Exclusion continue creating local draft entries with stable IDs; they become persisted backend data through Save Mode. Adding to one missing list must not populate the other list with defaults.
6. Use the same saved/draft data in the checklist, pending-change review, and generated/edited paragraph. Remove deleted selected names while retaining unrelated wording and the existing previous-value synchronization behavior.
7. Preserve loading/error/retry, denied/read-only state, conflict handling, dirty navigation guards, compact responsive layout, accessible names, and deletion focus recovery.
8. Make selections mutually exclusive across lists. Selecting Transport in Exclusions disables the unchecked Transport option in Inclusions; selecting it in Inclusions applies the inverse rule. Keep the unavailable row visible, with an explanation such as “Selected in Exclusions.” shown only in a hover/keyboard-focus tooltip and retained as a screen-reader description. Do not show that explanation inline or silently uncheck, delete, or move the opposite entry. Existing both-selected legacy conflicts retain their visible repair message.
9. Unchecking or deleting the selected entry immediately makes the opposite option selectable again in the draft. Deleting an unavailable unchecked row remains allowed. Adding a matching name to the opposite list is allowed as an unchecked entry, but selecting it is blocked while the original entry is selected.
10. Determine equivalent values using the existing normalization shared in behavior by `normalizePmcScopeName` and `normalizeKnowledgeIdentity`: Unicode NFKC, trim, collapse whitespace, and case-insensitive comparison. Thus `Transport` and ` transport ` conflict even though their row IDs differ. Stable IDs remain the identity for editing, deletion, persistence, and audit; normalized names are used only for this value constraint, not as record join keys.
11. Enforce the same mutual-exclusion rule in frontend validation and authoritative backend section validation. A direct API submission with the same normalized value selected in both lists must return the established validation response with actionable item/selection paths, before any persistence, version bump, or audit write. Unselected duplicates across lists remain valid.

## Contract and compatibility

Reuse the authenticated section GET/PUT operations and the existing `{ id, name, selected }` item shape. Keep `expectedVersion` and `expectedAggregateVersion` checks, current authorization, and immutable revision behavior. Retain the legacy PMC storage location even though the controls are shown under Sub-Vendor.

No new endpoint, schema, shared global catalogue, dependency, data migration, seed, or backfill is required. The existing write contract gains a cross-list selection constraint. Missing lists are treated as empty for display; opening a record must not write data. Existing persisted lists are loaded without silently changing their values. On save failure or conflict, do not report success or discard the pending deletion; use the existing retry/conflict workflow and query refresh behavior.

For previously saved conflicting selections, display both values with a clear message requiring one side to be unchecked or deleted before saving Mode. Keep already-checked controls enabled for deselection even when the opposite value is also checked; otherwise users could not repair the conflict. Block saving a still-conflicting Mode payload. Read-only and immutable historical records remain readable and unchanged, with an explanation where needed. Do not automatically choose a winner or rewrite stored history.

## Scope and assumptions

The list is owned by the current Main Line revision, matching the existing application model. A delete is not a global removal across all Main Lines. A reusable centrally managed catalogue would be a separate feature and is outside this request.

The intended behavior changes are that records without saved lists no longer show six invented defaults, and a value can be selected in only one list at a time. Users may add the desired items through the existing controls. Financial formulas, margin settings, other configuration sections, approved estimates, and the previously approved UI layout are outside scope.

## Risks and acceptance criteria

- **AC1 — Backend source:** arbitrary backend item names/IDs render unchanged; missing arrays show empty lists; no frontend starter catalogue remains in runtime code.
- **AC2 — Delete and reload:** delete an ordinary item and the final item from each list; Save Mode and a fresh GET/remount preserve the remaining list or `[]`.
- **AC3 — Independence:** use unequal lists and matching names with different IDs, with at most one side selected; deleting one item leaves the other list's data and another Main Line unchanged, while the opposite option's availability updates appropriately.
- **AC4 — Draft workflow:** Discard restores deleted items; failed/stale-version saves retain the draft and show the existing actionable state.
- **AC5 — New entries:** add/save/reload an item from an initially missing or empty list without creating phantom entries in either list.
- **AC6 — Consistency:** pending-change rows identify real additions/removals only; deleting selected custom items updates the paragraph and retains unrelated free text.
- **AC7 — Accessibility and permissions:** keyboard deletion transfers focus appropriately, deleting the last item exposes the empty state/Add action, and read-only users cannot mutate lists.
- **AC8 — Mutual exclusion:** test both selection directions; disabling includes an accessible reason; unchecking or deleting re-enables the counterpart; mouse/keyboard interaction cannot create a conflicting draft; adding an unchecked counterpart does not bypass the restriction.
- **AC9 — Backend enforcement:** direct API/service saves reject both-selected values, including case, whitespace and NFKC variants with different IDs; valid opposite-unchecked values save/reload successfully; rejected writes do not change payload, versions or audit history.
- **AC10 — Legacy recovery:** an existing both-selected record loads without modification, explains the conflict, allows either selected checkbox to be unchecked or the row deleted, and saves only after the conflict is resolved. Discard restores the original state and warning; read-only history is not mutated.
- **AC11 — Verification:** focused checklist, Mode save, pending-change, paragraph, backend validation and section-persistence tests; frontend/backend typecheck and build; rendered desktop/mobile delete, disabled-selection, legacy-conflict and empty-state checks; broader backend tests proportional to the shared validator changes; `git diff --check`.

Main regression risks are tests or consumers depending on the old synthetic defaults or allowing both-selected values, paragraph recognition of deleted names, accidentally repopulating empty lists, frontend/backend normalization differences, and making old conflicting records impossible to repair. Address these through the acceptance checks rather than a data rewrite.

## Open decisions

None blocking under the stated per-Main-Line and Save Mode assumptions. Approval of this specification confirms that missing backend lists should be empty rather than receiving automatic starter items, and equivalent values must not be selected in both lists.
