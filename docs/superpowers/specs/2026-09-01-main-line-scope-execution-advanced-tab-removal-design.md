# Main Line Scope, Execution, and Advanced Tab Removal Specification

## Goal

Remove **Scope**, **Execution**, and **Advanced** from the Super Admin Main Line workspace under **Configuration → Main Basket → Main Line**, leaving a focused four-section navigation: **Overview**, **Mode**, **Recommendations**, and **Quality**.

## Current behavior and evidence

- `knowledgeWorkspaceSections.ts` defines seven first-level workspace sections: Overview, Mode, Scope, Recommendations, Quality, Execution, and Advanced.
- `KnowledgeSectionNavigation.tsx` uses that contract for both desktop tabs and the mobile **Configuration section** select, including keyboard navigation and dirty-navigation focus restoration.
- `KnowledgeItemWorkspacePage.tsx` maps Scope, Execution, and Advanced to their backend sections when selected. The same page also fetches those backend sections independently for configured-only Overview summaries.
- `knowledgeOverviewSummary.ts` projects saved Scope, Execution, and Advanced data into optional Overview cards and may use Scope/Advanced values when resolving Mode summaries.
- `KnowledgeOverviewPanel.tsx` can render **Open Scope**, **Open Execution**, and **Open Advanced** actions for those summaries. Those actions would become invalid after the tabs are removed.
- The relevant frontend files are already modified or untracked in the user's broad dirty worktree. Their existing unrelated changes must be preserved.

## Recommended behavior

- Remove Scope, Execution, and Advanced only from the first-level workspace navigation and direct editing path.
- Preserve all previously saved backend section data.
- Continue loading and displaying meaningful saved Scope, Execution, and Advanced information as configured-only Overview summaries.
- Remove direct **Open Scope**, **Open Execution**, and **Open Advanced** actions because no matching workspace destination remains.
- Keep backend completeness, warnings, blockers, activation rules, and immutable revision behavior unchanged.

This navigation-only approach is recommended because the user asked to remove tabs, not erase data or change backend contracts.

## Scope

- Reduce desktop tabs and the mobile section selector to:
  1. Overview
  2. Mode
  3. Recommendations
  4. Quality
- Update Arrow Left/Right, Home, End, wraparound, disabled-section, and focus-restoration behavior to the four-section order.
- Prevent Scope, Execution, and Advanced from becoming `activeSection` values through the workspace navigation contract.
- Preserve configured-only Overview projections sourced from the three hidden backend sections.
- Remove Overview navigation actions that target the removed tabs while retaining their saved summary content, local loading/error/retry states, and unresolved-reference handling.
- Update responsive, navigation, Overview, Mode, dirty-guard, and workspace regression tests.

## Non-goals

- Do not delete, archive, reset, migrate, or rewrite Scope, Execution, or Advanced backend data.
- Do not remove their backend section keys, schemas, validation, API endpoints, persistence, completeness findings, or historical revision content.
- Do not remove their configured-only Overview summary cards when meaningful saved data exists.
- Do not change Mode, Recommendations, Quality, UOM, Surfaces, pricing specifications, revision history, lifecycle actions, permissions, CAS, query keys, or cache invalidation.
- Do not change backend authorization or manufacture activation readiness in the frontend.
- Do not add dependencies, modify shared UI primitives, stage, commit, push, deploy, seed, migrate, or mutate production data.

## Requirements

1. Desktop and tablet workspace navigation must render exactly Overview, Mode, Recommendations, and Quality in that order.
2. The mobile **Configuration section** selector must expose exactly the same four options.
3. Scope, Execution, and Advanced must not render as tabs, selector options, or selectable active workspace editors.
4. Keyboard navigation must use the four-section order with correct Arrow Left/Right wraparound, Home, End, disabled-section skipping, and focus restoration after a declined dirty navigation.
5. Existing unsaved-change save/discard/stay behavior must remain intact across the remaining sections.
6. Overview must continue to fetch and project meaningful saved Scope, Execution, and Advanced data because hiding a tab must not hide or delete configured information.
7. Overview cards sourced from removed tabs must not render an **Open** action. Their loading, error, cached-refresh, retry, configured-only, and unresolved-value states must remain available.
8. Mode summary resolution may continue using saved Scope and Advanced data where the established projection requires it.
9. Backend blockers or warnings referencing hidden sections must remain visible through the existing activation-status and review flows; the frontend must not suppress or reinterpret them.
10. Read-only, archived, active, Draft, null-revision, and permission-gated workspace states must use the same four-section navigation without gaining mutations.

## Assumptions

- “Remove Scope, Execution, Advanced Tabs” means remove their direct workspace navigation/editors, not delete their saved data or backend capabilities.
- Saved values from these sections remain important enough to show as configured-only Overview summaries, consistent with the previously approved Overview contract.
- Because these sections are no longer directly editable from this screen, their Overview summaries are informational and retryable but do not provide a dead-end **Open** button.
- The backend may continue to return blockers tied to hidden sections. This change does not weaken activation rules or invent a frontend bypass.

## Constraints and invariants

- Backend section keys and stable IDs remain canonical.
- Existing section and aggregate CAS behavior for remaining editors remains exact.
- Frontend visibility is not authorization enforcement; backend authorization remains authoritative.
- No saved payload may be cleared merely because its tab is hidden.
- The accessible tablist/tabpanel relationship and labelled mobile selector must remain valid.
- Preserve unrelated dirty work and do not reformat shared files beyond the approved slice.

## Risks and mitigations

- **Dead Overview actions:** explicitly omit Open actions for summaries whose tabs are removed.
- **Silent data loss:** retain Overview queries/projections and add saved-data regression coverage.
- **Unresolvable activation blocker:** retain backend blocker presentation and document that backend rules are unchanged; do not hide blockers to make activation appear ready.
- **Keyboard order regression:** test the exact four-section tab and selector order, wraparound, Home/End, disabled sections, and declined dirty navigation.
- **Type leakage:** separate backend summary keys from the reduced navigable workspace-section type so hidden backend sections remain queryable without becoming selectable tabs.
- **Broad dirty worktree:** capture relevant diffs/hashes before writers and preserve all unrelated changes.

## Acceptance criteria

1. Only Overview, Mode, Recommendations, and Quality appear in the desktop tablist.
2. Only those four sections appear in the mobile Configuration section selector.
3. Scope, Execution, and Advanced cannot be selected or rendered as first-level workspace editors.
4. Four-section keyboard navigation and dirty-navigation focus restoration pass.
5. Saved meaningful Scope, Execution, and Advanced data remains visible through configured-only Overview summaries.
6. Those saved summary cards have no Open action targeting a removed tab.
7. Empty Scope, Execution, and Advanced summaries remain omitted; source-specific loading/error/retry behavior remains local.
8. Backend blockers/warnings referencing hidden sections remain visible and activation behavior is unchanged.
9. Remaining Overview, Mode, Recommendations, and Quality edit/save, CAS, conflict, permission, read-only, archived, and null-revision behavior remains correct.
10. No backend, API, persistence, schema, authorization, completeness, cache, migration, dependency, lockfile, or shared-primitive change is introduced.
11. Focused navigation/Overview/workspace tests, frontend typecheck, full frontend tests, production build, and `git diff --check` pass.
12. Live browser verification is attempted for the desktop tablist and mobile selector; if no browser is connected, the limitation is reported without substituting another browser surface.

## Data, API, permission, and UX impact

- **Data/API:** no contract change; hidden-section payloads remain stored and queryable.
- **Persistence/migration:** none.
- **Authorization:** unchanged.
- **Completeness/activation:** unchanged and backend-owned.
- **Cache/query behavior:** existing Overview summary queries remain; direct active-section queries for the removed tabs become unreachable from navigation.
- **UX:** first-level workspace navigation is reduced from seven sections to four; saved hidden-section information remains available as read-only Overview summaries without dead navigation actions.
- **External actions:** none authorized.

## Open decisions

No additional decision is required if the request is navigation-only. Deleting saved data, removing Overview summaries, suppressing backend blockers, or removing the backend section contracts would materially expand the request and require a new specification.
