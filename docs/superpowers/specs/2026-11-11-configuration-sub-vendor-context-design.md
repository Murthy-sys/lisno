# Configuration Sub-Vendor basket context and source check buttons

Date: 2026-11-11
Status: Approved and implemented in Mode A. Requested UI, browser, typecheck and build checks pass; the selected regression lane retains 32 independently confirmed baseline failures. See the task plan's execution record.

## Goal

In Configuration → Main Lines → Mode → Execution, show the current Main Basket and Sub Basket names within Sub-Vendor, and give the Sub-Vendor / In-house selections clear check-button styling consistent with the existing top-level mode choices.

## Current behavior and evidence

- Initial worktree is clean; there are no existing target changes to preserve.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.tsx:474` renders Execution source choices as independent native checkboxes. Both sources may be selected, and visibility changes preserve their settings without saving or marking the form dirty.
- The top-level mode choices use a custom visual selection indicator, while execution-source choices use the native checkbox presentation (`knowledge-mode-reference.css:77`, `:113`, `:285`; `ai-estimator-knowledge.css:4544`). This specification aligns the source selection presentation; it does not add a second selection model.
- The Sub-Vendor panel currently contains scope inclusions/exclusions, calculation inputs and margin controls, but no dedicated Main Basket / Sub Basket context.
- `KnowledgeModePanel.tsx:684` supplies only `mainLineName` to the builder. Its existing `item` already includes `basketId`, `basketName`, `subBasketId` and `subBasketName` through `KnowledgeItemDetail` in `shared/knowledge/knowledgeTypes.ts`.
- `KnowledgeItemWorkspacePage.tsx:652` already displays these basket names in the page heading. The same builder serves the main Mode screen and the Signature, Premium and Functional editors.

## Scope and requirements

1. Add a compact, read-only context row at the top of the expanded Sub-Vendor body, before its existing scope and pricing content. Show explicit labels **Main Basket** and **Sub Basket**, followed by the current Main Line's corresponding names. Also display `Main Basket: <name> · Sub Basket: <name>` in the Sub-Vendor header in place of its Main Line subtitle, so both names remain visible when collapsed.
2. Pass the current item's basket context through `KnowledgeModePanel` into the existing builder. Names are display values, never join keys. Use no extra request, copied configuration field or editable basket selector.
3. If there is no assigned Sub Basket, show **Not assigned**. If an assigned basket's name is unavailable, show **Name unavailable** rather than substituting a different name. Long names wrap on narrow screens.
4. Render **Sub-Vendor** and **In-house** as labelled check buttons with a clearly visible checked indicator and distinguishable unchecked state. Match the existing mode choices' spacing, typography and selection treatment, using the current theme tokens and a CSS/native check indicator without adding decorative icons or dependencies.
5. Retain native checkbox semantics and independent multi-selection. Users can select either, both or neither. Clicking the label or pressing Space on its focused input toggles that source. Preserve visible keyboard focus and the existing controlled-panel relationship.
6. Preserve panel expansion, validation-driven reveal/focus, read-only browsing, in-progress inputs, saved values and save/unsaved-change behavior. Source visibility remains local UI state and must not itself modify Configuration data.
7. Apply these changes through the shared builder so the main Mode screen and enabled Signature, Premium and Functional editors behave consistently. Basket context always follows the current Main Line; tier settings remain independent.

## Assumptions and non-goals

- “Check buttons like Estimation and execution” is interpreted as matching the existing upper mode-selection treatment. The current upper labels are PMC and Execution. This request does not add Estimation/Execution flags under each source or rename those upper choices.
- Basket names refer to the Main Line being configured, not a vendor's separate basket assignment or an In-house component's basket.
- This is a bounded web frontend presentation change. No backend/API/schema, permissions, financial calculation, shared Configuration ownership, mobile application, Procurement, dependency or migration change is needed.
- Preserve the recent common Description layout and grouped tier navigation. No unrelated redesign is included.
- No commits, deployment, production data changes or external actions are authorized by this specification.

## Approach, constraints and risks

Extend the existing builder props and scoped Configuration styles. Keep the existing controls and state transitions. The repository already establishes this approach; a new data model is unnecessary.

The main risks are stale context after changing Main Lines, CSS hiding a selected indicator or focus ring, inadvertently converting multi-selection into single-selection, and losing unfinished input values while panels are hidden. Verify these boundaries with distinct Main Lines and different basket names. Missing-name states must remain explicit. Rollback consists only of reverting the bounded frontend changes; no data rollback is required.

## Acceptance criteria and verification

- **AC1: Basket context.** Sub-Vendor displays both labelled names from the current Main Line in the main and tier editors. Changing Main Lines updates the labels without leaking previous values. Missing assignments and unavailable names use the specified text.
- **AC2: Check-button behavior.** Both source choices show clear checked/unchecked states, support independent pointer and keyboard selection, expose accurate accessible names/checked state, and retain visible focus.
- **AC3: Preserved editor behavior.** Switching, hiding or collapsing sources preserves calculations, margins, scope data and pending edits. Selection alone causes no write or dirty state. Read-only users can continue browsing while editing remains restricted. Validation still reveals its target.
- **AC4: Responsive presentation.** At desktop and narrow mobile widths, long basket names and both source controls fit without overlapping or causing page overflow. The common Description and existing section hierarchy stay intact.
- **AC5: Validation.** Run relevant builder and Mode panel rendered regressions, frontend typecheck and production build, plus a browser check of the visual indicator, focus and context at desktop/mobile widths. Run `git diff --check` and review the final changed paths. No lint result will be claimed because the repository has no lint script.

## Open decisions

None under the stated interpretation. The user approved the basket placement and visual-only selection change, approved the separate task plan, and selected Mode A.

## Header visibility follow-up

After seeing the expanded body, the user reiterated that both basket names should be displayed. Extend the existing Sub-Vendor header subtitle with the same resolved names and explicit labels, retaining the body context. This is a presentation refinement within the approved basket-display requirement. Names continue to come from the current Main Line's assigned basket IDs; `na`, when supplied as the saved Sub Basket name, is displayed verbatim rather than replaced with the Main Line name. There is no rename, data mutation or extra lookup. Verify updated names, collapse/expand visibility, accessible description and narrow-screen wrapping.
