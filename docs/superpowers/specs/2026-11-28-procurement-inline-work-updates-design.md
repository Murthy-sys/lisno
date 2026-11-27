# Procurement: inline work updates without percentages

Date: 2026-11-28 (Asia/Kolkata)
Status: Specification and separate task plan approved; Mode A selected. Implementation and scoped verification completed on 2026-11-28.

## Goal

Show and record work updates directly within each item's P1, P2 or P3 expansion panel. Replace percentage-based presentation and entry in this area with work status, notes, dates and delay details. Make the next action discoverable in the setup-required state shown in the user's screenshot.

This follows the completed priority-panel change. P1 remains first, and all earlier-priority observations must be recorded before updating later priorities. Physical work need not be complete to unlock the next priority.

## Current behavior and evidence

- `frontend/src/features/procurement/lifecycle/ProgressPanel.tsx`, `AppointedItemPreview`: before project setup, the panel displays vendor percentage/status and optional vendor notes. It has no item-level action. This matches the screenshot's `0% · Ready`, `Set up project checks`, and `Review not opened` state.
- The same file's `ReviewRound` displays vendor and Procurement percentages. A saved round already provides an inline check/correction form, but its labels describe checks rather than work updates. `ProgressCheckForm` includes an optional observed-percentage field.
- `backend/src/domain/procurement-progress.ts`, `procurementProgressObservationSchema` and command validation: `progress` supports `null` for every status, including not started and completed. Status, notes, observation time, next action and next check date are required; blocked/delayed work additionally requires recovery details. Percentages are unnecessary for valid work updates.
- `backend/src/services/procurement-lifecycle.service.ts`, `setup`: explicit setup saves the review/inspection policy and creates the first review in the same transaction when applicable. It requires active execution, an issued vendor order, current source/version and authorized Procurement access.
- `backend/src/services/procurement-progress.service.ts`, `list`/`command`: projected version-zero rounds require the explicit `open` command. Saved rounds expose snapshot membership, `canCheck`, earlier-item blockers, allowed actions, checks and append-only correction history.
- `LifecycleShared.tsx`, `useLifecycleWrite`: existing writes carry idempotency keys and refresh affected queries; stale/denied responses have established handling.

## Scope and assumptions

This is a frontend change within Progress & Inspections using the existing lifecycle APIs. Interpret “work updates” as Procurement's saved observations of appointed work. Vendor-reported status/notes remain separate and clearly labelled, so a Procurement update never impersonates a vendor report.

Remove work percentages from this area's item previews, saved item summaries, and update/correction forms. Do not change percentage entry elsewhere in vendor workflows, unrelated upload progress indicators, or historical stored data. Keep actual item/update counts in priority headers.

Retain the existing setup, review cadence, P1/P2/P3 ordering, snapshot reconciliation, permissions, correction reasons, inspection policy and signoff rules. Do not silently initialize a project, choose inspection settings on behalf of the user, open a review on page load, or record updates by expanding a panel. No backend/schema/API change, dependency, migration or backend startup is needed.

## User experience

### Item presentation

1. Keep each item inside its current priority panel with its name, room, appointed vendor and original target date.
2. Show **Vendor status** using the actual status, with a clear unavailable value when missing. Display vendor notes when supplied; do not infer a status from a stored number.
3. Give the item's **Work update** a clear label. Show its latest saved Procurement status, notes, update date/time and author, next action/check date, and delay/recovery details. If no current-round update exists, say **No work update recorded for this review**. Do not invent a current update or reuse a previous round's observation as current.
4. Keep existing review/correction history reachable, with previous records immutable. A new all-round per-item activity feed is outside this bounded change.

### Update inside the panel

- For an eligible item in a saved open review, show **Update work**. It opens the form within that same item and expansion panel. Use **Work status**, **Work update notes**, observation date/time, next action and next check date. Keep delay/recovery and forecast controls; remove the percentage input.
- Saving records through the existing `check` command. Show the returned/refetched saved work update in the same panel, with clear save feedback. Do not automatically collapse the panel or move to another priority.
- For an already checked item, show **Amend work update** and use the existing `correct` command. Preserve the required correction reason and append-only audit/history semantics; do not replace an earlier record in place.
- Later-priority items remain visible with a disabled update action and their specific earlier-item explanation until the server grants eligibility. Expanding P2/P3 never changes eligibility.

### Setup-required and unopened-review states

- In the screenshot's setup-required preview, an authorized item has an explicit **Set up to update work** action. It reveals and focuses the existing shared project setup form in this Progress tab. Avoid duplicate setup forms for individual items. Setup continues to require an explicit policy/reason submission.
- Retain the selected stable item ID while setup completes. After successful setup and fresh review data, reveal that item's priority panel and return focus to its inline update action, or show the current prerequisite/blocker if it is not eligible. Do not submit an observation automatically.
- For an initialized project without a saved current round, show **Start review to update work** where the server permits `open`. Clicking it explicitly opens the review using the current source/version contract, then returns to the selected item after refresh. Version-zero projections remain non-editable until saved.
- If setup/open is unavailable, display the actual prerequisite or permission state. Never offer a functioning-looking save action without a valid saved review.
- Setup/open failure retains the user's setup draft and selected item and displays the error. A missing or changed item after refresh must result in a clear message, never selection of a different item by name or array position.

## Data, state and permissions

- New check and correction submissions from this percentage-free form send `progress: null`. The backend already supports this. Even when amending an older numeric observation, the new revision contains no percentage; previous revisions retain their original values. Do not send an invisible stale numeric value that conflicts with a changed work status.
- Preserve `projectId`, `roundId`, `itemId`, correction `checkId`, source digest, expected version, idempotency key, actor identity and invalidation behavior. No new storage or audit event is required.
- Use round member snapshots for current grouping; use available current source items for previews. Retain reconciliation, unresolved-priority handling and source-unavailable behavior.
- Procurement may update only when the existing backend capabilities permit. Admin stays read-only. Stale/loading/error data, paused/submitted/missed rounds, completed projects and revoked access retain their restrictions.
- Preserve drafts while collapsing panels, switching priority disclosures, or receiving a non-denied failure. New project/actor/round identity clears incompatible drafts and pending item selection. Setup-to-first-round continuation carries only the selected stable ID; never transfer an observation draft into a different review implicitly.
- Keep valid item deep links, keyboard focus and expansion behavior. Reveal an item before focusing it. Do not steal focus from hidden retained tabs or repeatedly refocus on normal refresh.

## Alternatives and decision

Recommended: reuse the existing observation and correction contracts, with explicit item-level access to setup/start-review prerequisites. This supplies the requested inline updates without changing saved-history or ordering rules.

Automatically setting up the project or adding a separate update store would change policy selection, lifecycle activation, auditing and signoff behavior. The request does not require those changes, so they are excluded.

## Acceptance criteria

- **AC1:** No work percentage display or percentage input appears in P1/P2/P3 item previews, saved summaries or update/correction forms, including records with existing numeric values. Work status, vendor notes and real update counts remain meaningful.
- **AC2:** Each eligible item can save status and notes from an inline form in its priority panel. Successful saves render the current saved update, author/time, follow-up and applicable delay details without closing the panel.
- **AC3:** The screenshot's setup-required state has an actionable, permission-aware path from the item to explicit setup and back. Projected/unopened rounds have an explicit start-review path. Browsing panels sends no writes; observations require a saved round.
- **AC4:** New updates and amendments submit `progress: null`; all four statuses remain valid with required fields, including blocked recovery details. Amendments retain the correction reason and immutable prior revisions.
- **AC5:** Multiple P1 items must all have observations before P2, then P3. Empty groups, snapshot reconciliation, null priority, version conflicts, read-only access, failed setup/open, and revoked access retain their safeguards.
- **AC6:** Drafts and expansion choices survive ordinary collapse/refetch/failure. Project/actor/round changes cannot leak drafts or selected-item continuation. Keyboard interaction, deep links, setup-to-item focus and responsive layouts work at 390, 768 and 1440 pixels.

## Verification and risks

Use focused rendered tests for active updates, amendment of a prior numeric record, setup/start-review continuation, exact payloads, failed writes, and no-write browsing. Retain the existing sequencing/draft/access regressions. Validate representative null-progress payloads against the existing backend schema without modifying backend product behavior. Run frontend typecheck/build and proportionate browser interaction/accessibility checks with synthetic API data while the backend stays stopped.

The principal risks are confusing vendor and Procurement reports, silently erasing old numeric history, sending an invisible percentage inconsistent with status, or losing the selected item during setup/refetch. Explicit source labels, `null` only on the new revision, stable IDs, existing capabilities, and focused lifecycle-transition tests address those risks.

No migration is required. Rollback is the scoped frontend change. No deployment, production mutation, seed, commit, push or external communication is included.

## Working-tree preservation and open decisions

Current dirty paths, tracked target diff and copies of the existing untracked lifecycle targets are captured under `/tmp/lisno-procurement-inline-work-updates/`. Preserve the completed priority-panel implementation and all unrelated work. Refresh this baseline before writers start.

No unresolved product decision remains: percentages are removed from this surface, observations remain the saved work-update source, and existing prerequisites stay explicit. Implementation, affected files, acceptance evidence and verification limits are recorded in the [completed task plan](../plans/2026-11-28-procurement-inline-work-updates.md).
