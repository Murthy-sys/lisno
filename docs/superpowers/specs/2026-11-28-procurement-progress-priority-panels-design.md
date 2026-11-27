# Procurement progress: P1, P2 and P3 expansion panels

Date: 2026-11-28 (Asia/Kolkata)
Status: Specification and task plan approved; Mode A selected. Implementation and scoped verification completed on 2026-11-28.

## Goal

Make priority checks the main content of the project's Progress & Inspections tab. Show P1, P2 and P3 as expansion panels in that order, with P1 open first, so Procurement can review and update the highest-priority work before proceeding to the next group.

The previously confirmed rule remains: record the current progress checks for all P1 items before updating P2, then P3. P1 work itself does not need to be completed. Physical inspections remain two or three visits across the project as a whole.

## Current behavior and evidence

- `frontend/src/features/procurement/lifecycle/ProgressPanel.tsx:44–49` already groups a current review's members into P1, P2, P3 and unresolved priority. It renders plain sections and omits empty groups; there is no expansion interaction.
- `ProgressPanel.tsx:67–69` renders the entire setup form before review content. When there is no current round, the item groups are absent. This matches the supplied screenshot's emphasis on setup instead of priority checks.
- `backend/src/contracts/procurement-lifecycle.ts` already exposes appointed items, stable IDs and their P1/P2/P3/null priorities through `summary.source.items`, including the setup-required state when the source is available.
- `backend/src/services/procurement-progress.service.ts:74–97` supplies per-item `canCheck`, `blockingItemIds`, check history and round actions. The command path enforces those gates. `backend/src/domain/procurement-progress.ts:44–48` checks for earlier-priority items without a recorded observation, rather than requiring completed work.
- `LifecycleShared.tsx:55–58` supports `?entity=<itemId>` links with scrolling and focus. Collapsed panels must reveal the linked item before this behavior runs.
- `LifecycleWorkspace.test.tsx` already covers P1 checking that unlocks P2 while work is still not started, draft retention after conflicts, revoked access, and project-level inspections.

## Scope and non-goals

This is a bounded frontend presentation and interaction change using the existing API. Extend the existing Progress panel and lifecycle styles; extract a small local priority-panel component only if it makes the code clearer.

Do not change priority assignments, server sequencing, review cadence, setup requirements, source reconciliation, permissions, payment/signoff rules or inspection counts. Do not create a review or save policy merely by opening the tab/panel. No backend/API/schema changes, native-mobile redesign, dependency installation or data migration are expected. Keep the development backend stopped.

## Required behavior

### Priority-first layout

1. Show three full-width expansion headers in fixed order: **P1**, **P2**, **P3**. Keep empty groups visible with an explicit empty-state message. Use the existing typography, colors, square edges and restrained styling; do not introduce decorative icons, gradients or animation.
2. Open P1 by default when entering a new project/review. P2 and P3 begin collapsed. Users can independently open or close any group to inspect it; browsing a locked group must remain possible. Opening a group never unlocks its edit actions.
3. For a current round, each header shows the number of items, recorded-check count such as `2 of 4 checked`, and a truthful state such as checks pending, checks recorded, or waiting for earlier-priority checks. These counts refer to observations in the current round, not physical work completion.
4. Retain each item's name, room, vendor, original target, vendor report, Procurement observation, notes, next action/check date and delay/recovery information. Existing record/correct forms belong inside that item's priority panel.
5. Put the existing setup/policy form behind an explicit **Set up project checks** or **Review policy** disclosure. When setup is required, show a short persistent notice and the permitted setup action above the priority panels. The full form is initially collapsed so it does not dominate the screen.
6. Before setup or before a saved current round exists, display read-only appointed items grouped by their actual priorities from the existing available source. Label them as awaiting setup/opening a review, without fabricating observations or completion counts. Keep existing setup/open-review mutations explicit and permission-controlled.
7. Keep review submission/history and project-wide inspections available after the priority groups. Do not split physical inspections into separate P1/P2/P3 visit requirements.

### Ordering, source and state safety

- Continue to use server-provided `canCheck`, `blockingItemIds`, round actions, version and source digest. All P1 checks must be recorded before P2 updates, and all earlier-priority checks before P3 updates. Empty earlier groups do not create a new block.
- A complete observation with status not started, in progress or blocked still satisfies that item's ordered check, as the existing backend permits. Do not substitute a 100% work-completion gate.
- Use the current review's member snapshots for active-round groups and counts. If appointments/priorities change, preserve the existing source-change comparison and reconciliation action; do not silently regroup saved observations using newer priorities.
- Show genuinely unassigned priorities in a separate **Priority not set** disclosure only when such items exist. Keep their editing blocked with the existing Configuration guidance; do not assign them to P3 or invent a default priority.
- Preserve form drafts when a panel is collapsed/reopened, when another panel is expanded, and during stale/error refresh states. Preserve open/closed choices across ordinary query refreshes; do not force a panel switch after saving a check. New project/review state must not inherit another project's edit draft.
- A valid item deep link opens its containing group and makes the item visible/focusable. Keep the existing URL parameters and stable item IDs.
- Paused/submitted/closed rounds, Super Admin read-only views, stale/source-conflict states and revoked access retain their existing restrictions. Unavailable/loading/error data must not appear as zero items, zero progress or a fabricated unlocked group.

### Accessibility and responsive behavior

Use semantic disclosure controls, preferably native `details`/`summary` where compatible with the existing focus behavior. Provide accessible names containing the priority and check summary, visible keyboard focus, and clear expanded/collapsed state. Keep mutation buttons outside the disclosure header to avoid nested controls.

Headers and item forms must wrap at narrow widths without document overflow. Expansion must work by keyboard and touch. Collapsing a group must not discard edits; no motion is required.

## Assumptions and decisions

- “Expansion panels” means independent collapsible sections within the existing Progress tab, not new top-level tabs or priority-edit controls.
- P1 is the first default-open section. A targeted item may additionally open its own section. Saving a check does not automatically move focus or collapse the user's current section.
- The screenshot represents a setup-required project. Priority groups should therefore remain discoverable before setup, using available appointed-item data; recording still follows the existing setup/open-review requirements.
- Existing backend data and sequencing are sufficient. No new product or architecture decision needs clarification at this stage.

## Risks and controls

Collapsing content could erase drafts or conceal linked items; keep form state mounted and explicitly reveal targeted groups. Preview items could be confused with saved round observations; label preview/setup states and use round snapshots once a review exists. Changing priority presentation could imply that an expanded P2 panel is editable; keep server-derived disabled actions and their explanation visible. Missing source data must remain an explicit unavailable state rather than an empty-group claim.

No migration or financial change is involved. Rollback is the local component/style change; existing checks, policy and history are untouched.

## Acceptance criteria and verification

- **AC1:** P1, P2 and P3 appear in order as expansion panels; P1 is initially open, P2/P3 collapsed, including empty priority groups.
- **AC2:** A setup-required project displays available appointed items in those panels plus a compact setup notice/action. Opening panels does not write data; update controls remain blocked until existing prerequisites are satisfied.
- **AC3:** Current-round counts and records are accurate. A not-started/blocked P1 observation can unlock P2 according to the backend; expanding P2/P3 alone cannot bypass earlier checks. Empty P1 does not create a new gate.
- **AC4:** Existing forms, notes, delays, corrections and history remain usable. Collapse/reopen and unrelated panel toggles retain drafts; source/version conflicts prevent stale writes.
- **AC5:** Deep links reveal the correct panel/item. Source changes, unresolved priority, loading/error, revoked access and read-only roles remain accurate and non-editable where required.
- **AC6:** Keyboard disclosure interaction, accessible names/focus and narrow/desktop layouts pass rendered/browser checks. Project-wide inspections and review policy remain available with their existing behavior.

Verification after implementation: focused Progress/Lifecycle rendered tests, existing ordered-progress domain tests as a regression check, frontend typecheck/build, browser checks at narrow and desktop widths with synthetic data, and repository diff/status checks. No production/backend-server startup is required.

## Working-tree preservation

The lifecycle files were untracked prior work and the repository contains many existing changes. Initial dirty paths, relevant tracked diffs and copies of the target component/style/test files are captured under `/tmp/lisno-procurement-priority-panels/`. The approved implementation preserved that work and all prior payment-gate fixes. The six-file frontend delta, verification evidence, and remaining test limits are recorded in the [completed task plan](../plans/2026-11-28-procurement-progress-priority-panels.md).
