# Configuration Main Line: Client view preview

Date: 2026-11-09
Status: Implemented; scoped verification passed; broader frontend validation has unrelated blockers

## Goal

Add a **Client view** button to the Configuration Main Line workspace. It opens a right-side panel at 80% of the desktop viewport width, showing how the current Main Line appears in the client estimation interface.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx` renders the Main Line header and lifecycle actions, but has no client preview. Its current revision is `draftRevision ?? activeRevision`.
- `frontend/src/components/ui/Drawer.tsx` already supplies a contextual right drawer, modal semantics, keyboard/focus management, backdrop dismissal and focus restoration. A feature-scoped width override can provide 80% width without changing other drawers.
- `frontend/src/features/client/ClientQuotationLine.tsx` and `frontend/src/features/estimates/EstimateLineRow.tsx` provide the current client row and shared compact estimator presentation. The recent compact typography, pricing controls and In-house details must carry through to this preview.
- `getEstimationCatalogue({ includeReadyNonActive: true })` exposes the saved current Main Line projection, including stable IDs, revision/version, tiers, selling rates, UOM, client visibility and In-house component choices. Its backend selects the saved draft ahead of the active revision. Ineligible lines are omitted.
- The catalogue service permits the existing Super Admin configuration user. This feature does not require Client impersonation or a project/lead API request.
- A real quotation has saved amounts, project assignments and approval state that this configuration screen does not have. The preview must not invent these values.

## Scope and assumptions

- The preview contains the **current Main Line only**, in its Main Basket/Sub Basket context, using the existing estimator row appearance. It does not load a real client's entire estimate.
- Use the latest **saved** configuration. Unsaved editor input is excluded and preserved. Display a concise notice when the workspace has unsaved changes: “Preview uses saved configuration. Save your changes to update it.”
- This is an internal preview for users already authorized to access Configuration and the underlying read API. It does not change what real Client, Sales or Designer accounts may edit.
- A sample quantity of 1 is presentation context, clearly covered by the preview label. Required dimensions remain unset rather than fabricated.

## Requirements

1. Place a compact text button labelled **Client view** in the existing Main Line header actions. Opening it does not navigate away, save, discard changes, or trigger the unsaved-navigation prompt.
2. Open the existing contextual Drawer from the right. Desktop width is `80vw`, with full usable height and independently scrolling content. On narrow tablet/mobile layouts use the full viewport width so controls remain usable.
3. Use a compact header showing “Client view” and the current Main Line name. Include one short “Preview only” explanation and a clear Close control. Preserve Escape/backdrop close, focus containment and return focus to the trigger.
4. Reuse the client estimation row/shared estimator components and their styles, rather than recreating the row as a separate design. Show the current name, UOM, tier availability, item type presentation, quantity, rate/amount presentation and applicable pricing/component/dimension controls as the existing client UI does.
5. Any tier, quantity or component interaction is local preview state only. Reset that state when closing or changing Main Line. There are no Save, Submit, approval, quotation mutation or Configuration mutation actions in the panel. Standard/Special and pricing presentation obey the existing row rules; preview controls do not confer permissions.
6. Resolve the selected Main Line by stable ID from the existing catalogue projection. Fetch only while the panel is open and refresh on reopening so a completed Configuration save is reflected. Use the current saved revision and never substitute another line or fall back to an older revision after a newer draft is incomplete.
7. Preserve the actual client presentation of unavailable tiers, missing prices, required dimensions and component-dependent rates. Do not expose Configuration base costs, margins or the removed configured-price/tier-note details. Do not manufacture a saved amount; use the existing client pending/unsaved presentation when there is no quotation amount.
8. Respect `clientVisible`: a hidden line shows a concise “This Main Line is hidden from clients” state. An archived, absent or otherwise ineligible catalogue line shows an explicit unavailable-preview state. A missing configuration must not be presented as a valid zero-priced item.
9. Provide scoped loading, error/retry and empty/unavailable states. A refresh error must not silently display stale values as current. Keep the underlying editor and its local values intact throughout.
10. Preserve the established compact visual style and accessible names, keyboard behavior and responsive controls. Avoid decorative new icons, gradients, shadows or unrelated layout changes.

## Architecture and data impacts

- Frontend-only composition in the Configuration feature, using the existing Drawer, catalogue read helper and estimator presentation components.
- Prefer the existing client row with a small, explicit preview adapter; reuse shared row primitives where quotation-only labels require a truthful preview state. Do not duplicate pricing formulae or build a fake quotation/project record.
- Keep preview state isolated from editor payloads and query-backed persisted data. Query identity includes the Main Line; late responses from a previous line must not render under the next line's title.
- Configuration saves retain their existing invalidation behavior. Reopening the preview must read refreshed catalogue data rather than relying on an indefinitely cached result.
- No schema, backend contract, permission, approval, financial calculation or storage changes. No migration, dependency addition or external publication is needed.

## Non-goals

- Editing a real estimate, creating a lead/project, sending anything to a client, changing client edit permissions or previewing project-specific approvals.
- Live preview of unsaved Configuration edits.
- A separate pricing calculator, fabricated In-house totals, or showing internal cost/margin breakdowns.
- Redesigning the surrounding Configuration workspace or all shared drawers.

## Risks and handling

- **Client fidelity:** reuse the production row and stylesheet boundaries; verify actual rendered output within the drawer, including overrides from Configuration styles.
- **Unavailable data:** the current catalogue intentionally excludes some lines. Show the explicit state rather than reconstructing missing values from unrelated or historical data.
- **Stale data/identity:** resolve by stable ID, refresh on open, clear previous-line local state and visibly handle failed refreshes.
- **Responsive width:** an 80% panel reduces row space. Check the existing compact layout at desktop and full-width mobile sizes without clipping controls or creating page-level horizontal scroll.
- **Dirty worktree:** existing estimate/client files contain prior authorized changes. Capture relevant baseline diffs before implementation and preserve those changes.

## Acceptance criteria and verification

- AC1: Client view opens from the current Main Line header and leaves unsaved editor values unchanged; no save or mutation call occurs.
- AC2: Drawer measures 80% viewport width on desktop and full width on mobile; content remains usable, scrollable and unclipped.
- AC3: The preview matches the current client estimator row styling and displays only the selected stable-ID Main Line in its basket context.
- AC4: Saved draft wins over active data; reopening after save refreshes the preview. Unsaved changes have the specified notice. Switching lines never leaks the prior line's display/state.
- AC5: Available, missing-price, hidden-client, ineligible, required-dimension, In-house, loading and error/retry states are truthful. No source cost/margin leakage or invented approved/saved totals.
- AC6: Preview interactions remain local; no Configuration/quotation/estimate mutation, approval or submission is reachable.
- AC7: Keyboard opening/closing, focus trap, Escape, backdrop dismissal, focus return and accessible control labels work in the rendered panel.
- Verify with focused Configuration preview/integration tests plus relevant shared-row tests, frontend typecheck/build, and rendered desktop/mobile interaction checks. Run `git diff --check` and inspect final status. No lint claim: this repository has no lint script.

## Open decisions

None blocking the specification. The saved-current-line preview and full-width mobile behavior are the stated assumptions for approval.

## Delivery evidence

Implemented in Mode A. Preview-specific tests and rendered desktop/tablet/mobile checks passed. See the [task plan verification record](../plans/2026-11-09-configuration-main-line-client-preview.md) for exact results, preserved concurrent changes and the unrelated failures blocking full frontend validation.
