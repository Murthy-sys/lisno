# Procurement basket panels: supplied reference

Date: 2026-10-12
Status: Implemented and verified on 2026-10-12 in approved Mode A. Baseline limitations are recorded in the task plan.

## Goal

Make Procurement's Configure Main Basket and Configure Sub-Basket side panels closely match the image supplied with this request. Use the same visual language for both creation forms and saved configuration workspaces, while retaining their different permissions and existing behavior.

The latest attached image is the design authority for composition, relative proportions, typography, spacing, icons, selected states and borders. Its specific selected-row treatment and restrained corners take precedence over general styling preferences for these elements only. Real application content and editor state remain authoritative.

## Current behavior and evidence

- `frontend/src/features/vendor-basket-proposals/ProposalWorkspace.tsx` shares Procurement and Super Admin rendering. Its current `procurementMainReference` condition requires Procurement scope and excludes Sub-Basket targets. The Sub-Basket workspace consequently misses the newer summary, hierarchy and title treatment.
- `procurement-main-basket.css` styles only `.basket-proposal--procurement-main-reference`. Existing workspace tests explicitly assert that Sub-Basket panels do not receive it. Those expectations must change for Procurement Sub-Baskets while preserving the Super Admin exclusion.
- `proposal.css` defines 70vw desktop drawers and full-width drawers below 1200px. Its base hierarchy uses a narrow 190px column. Shared `.basket-proposal` styling also reaches Super Admin review, so unqualified overrides would be unsafe.
- The workspace already exposes real proposal status, selected Main Line, section version, saved/dirty/loading/error state, hierarchy actions and refresh. They can provide the reference's summary without new state or API calls.
- Mode content comes from `KnowledgeModePanel` and `KnowledgeModeConfigurationBuilder`. Several rules in `knowledge-mode-reference.css` require `.ui-app-shell .knowledge-page` ancestry, which is unsuitable for portal-rendered proposal drawers. Reusing components alone does not give the drawers the Configuration presentation.
- `CreateProposalPanel.tsx` already omits Vendor name, and the request submission flow already closes panels and retains vendor entries. These completed requirements must remain intact.
- The repository contains extensive uncommitted previous work. Capture the current dirty paths and target contents before implementation; preserve all unrelated changes.

## Scope and non-goals

Apply the redesign only to Procurement Main Basket and Sub-Basket proposal creation, editing, resumed drafts and read-only request views. Cover Overview, Mode, Recommendations and Quality Parameter so their framing remains consistent.

Keep Super Admin Configuration and approval-review screens visually and functionally unchanged. Do not modify backend contracts, calculations, authorization, notifications, request lifecycle, routing, saved records or database indexes. No sync, seed, migration, deployment, dependency, font or lockfile changes are needed.

This is a presentation change with minimal semantic JSX hooks where necessary. Do not duplicate shared editors, introduce fake controls or remove working controls that lie below the screenshot crop.

## Design requirements

1. **Panel/header.** Preserve the requested 70% desktop width. Use the reference's compact Procurement eyebrow, prominent Configure Main Basket/Sub-Basket title and top-right close button. Keep header decoration restrained and local, reusing existing assets or CSS where suitable. Do not add imagery, shadows, gradients or motion effects. Remove redundant workspace subtitle spacing where the summary already carries the context.
2. **Identity strip.** Directly below the header, place a full-width, lightly tinted bordered strip with a basket symbol, real basket name, actual status badge and right-aligned Refresh saved configuration action. Long names wrap without displacing the close or refresh controls. Main Basket retains its existing edit action. Use existing project SVG primitives or small local SVGs, with no new icon-library dependency or added Lucide imports.
3. **Context and save state.** For Sub-Baskets, put the selected parent Main Basket context and the explanation of inherited quality beneath the name inside the strip, as in the reference. Put real saved/unsaved/saving/error feedback below that context. Retain meaningful live announcements and show success only after the saved result is known. Do not hardcode Draft, Section saved, timestamps or version numbers. Do not restore Vendor name in either form or summary.
4. **Hierarchy.** Match the enclosed left column, approximately one fifth to one quarter of the usable panel width, with a practical minimum around 200–220px. Place the Sub-Baskets and Main Lines heading above editable Sub-Basket names. Main Lines use a document symbol, strong readable name and muted green selected treatment. Match the reference's narrow selected indicator within this scoped UI. Style Add Main Line as a full-width dashed-border action with a plus symbol. An empty Procurement Main Basket draft offers Add Sub-Basket to create its first child; once a Sub-Basket exists, hide the redundant Add Sub-Basket action in that panel. Keep Add Main Line and current removal/edit capabilities; a Sub-Basket request cannot gain permission to create sibling Sub-Baskets or edit its parent.
5. **Main Line toolbar.** Align the selected line title left and Edit Main Line/Remove Main Line actions right with the reference's simple edit/delete symbols and separator. Wrap safely when space is limited. Keep their current handlers, accessible names and disabled rules.
6. **Tabs.** Match the reference's even spacing, muted inactive labels, green active label, gentle active background and lower selection rule. Retain Overview, Mode, Recommendations and Quality Parameter and their current keyboard navigation. The active tab must describe the displayed content: Mode settings remain under Mode even though the image highlights Overview while showing mode content.
7. **Mode section.** Match the enclosing light surface, section-version row, divider, Mode heading, selectable PMC/Execution controls and expanded PMC block. Use the reference's header composition, description row/edit action, management-fee label, Collapse control, calculations heading and Test calculations action. Preserve all existing Execution variants and settings, pricing, specifications, formulas and validation. Show the corresponding iconography without adding decorative controls or hiding the native selection/focus semantics.
8. **Calculations and other sections.** Apply consistent border, spacing, typography and action treatment to existing rate/quantity, margin and simulator controls. Keep current financial values and units. Overview retains UOM, Add UOM, surfaces and Add Surface. Recommendations retains its real editor. Main Basket quality remains editable when authorized; inherited Sub-Basket quality remains read-only. In Procurement Configure Sub-Basket, do not render or fetch inherited quality before a Main Line exists; after one is added, expose it through that Main Line's Quality Parameter tab. Super Admin empty-state review remains unchanged. Do not add the removed Saved summary tab.
9. **Initial creation forms.** Use the same compact header, spacing, labels, bordered fields and action styling before a proposal exists. Show only the requested basket name and, for Sub-Basket creation, the selected parent context. Do not show a fabricated saved identity strip or hierarchy before creation succeeds.
10. **Footer and completion.** Keep existing save, close and submission-readiness controls reachable with consistent styling. Saving remains separate from sending for approval. Preserve unsaved-change confirmation, uncertain-result retry, confirmed-submit panel closure, retained vendor drafts and All my requests behavior.

## Architecture and compatibility

Use one explicit Procurement-only presentation modifier for both proposal targets. Extend or replace the existing Main-Basket-only presentation rules within the proposal feature, with target-specific differences limited to content and existing capabilities.

Prefer scoped wrappers and CSS within `frontend/src/features/vendor-basket-proposals/`. If a shared editor requires an optional presentation hook, preserve its default markup/behavior for Configuration and Super Admin. Do not widen global Configuration CSS selectors to all drawers or rely on role attributes on app-shell ancestors across portals.

Import the necessary scoped styles directly through the proposal entry so a cold Procurement navigation renders correctly without first opening Configuration. Keep the current data source, mutation handlers, query keys and computed state. No API, persistence, permission or workflow transition changes are expected. Rollback removes only the presentation hooks/styles, without database work.

## Responsive and accessible states

- Desktop remains 70vw at viewport widths of 1200px and above; smaller viewports use full width.
- Check 1920, 1440, 1024, 768 and 390px widths. Adapt the hierarchy/editor arrangement to usable panel width and stack when necessary. Do not squeeze rate fields or clip headings to maintain two columns.
- Match the reference proportions at a comparable wide panel size; do not use the resized screenshot's pixel dimensions as browser CSS dimensions.
- Preserve semantic labels, focus trapping/return, Escape behavior, keyboard tab selection, visible focus, native checkbox state, and accessible action names. Decorative symbols are hidden from assistive technology.
- Keep the footer from covering content. Avoid page-level horizontal overflow; constrain any genuinely wide data table to its own scrolling area.
- Verify empty hierarchy, no selected line, long names, loading, failed reads, unsaved edits, saving/error/retry, submitted and rejected read-only states. Essential actions must remain visible and reachable without hover.

## Risks and verification

- **Shared-style leakage:** compare ordinary Configuration and Super Admin review before/after; assert only Procurement gets the new modifier.
- **Portal CSS gaps:** render a cold Procurement route and inspect Overview and Mode for both targets.
- **Dense mode controls:** inspect the reference-like wide layout and narrow stacked layout with actual PMC and Execution content, long names and existing calculation inputs.
- **State misrepresentation:** retain tests for saved/dirty/error feedback and actual section versions. Do not mark an unresolved mutation saved for cosmetic consistency.
- Run focused proposal workspace/creation and affected shared editor tests, frontend typecheck/build, rendered interaction/accessibility checks and `git diff --check`. Reuse disposable browser fixtures; do not mutate the configured local or production database. Broad backend suites are unnecessary unless scope unexpectedly changes.
- Record screenshots as temporary artifacts outside tracked source, exact checks, any pre-existing failures and unrun verification. Do not infer pixel fidelity from code inspection alone.

## Acceptance criteria

- **AC1:** Both Procurement saved workspaces match the attached identity-strip, hierarchy, line-toolbar, tab and Mode composition with real data.
- **AC2:** Both initial creation panels share the new visual language and contain no Vendor name field or requirement.
- **AC3:** All existing hierarchy actions, four sections, UOM/surface creation, saving, refresh, dirty guards, retry and request submission still work with their existing permissions and semantics.
- **AC4:** Sub-Basket parent configuration and shared quality remain unchanged; Super Admin Configuration and review retain their existing appearance and behavior.
- **AC5:** At all five target widths, layout, labels, focus, scrolling and primary actions remain usable; desktop retains 70% width.
- **AC6:** Status/version/save feedback is truthful across loading, success, dirty, failure and read-only states. No reference placeholders or invented data appear.
- **AC7:** Focused tests, typecheck/build, screenshots, interaction/accessibility checks and diff hygiene are recorded, with previous dirty work and database data preserved.

## Assumptions and open decisions

The image requests a shared visual treatment for both Procurement basket types, including the configured workspace pictured. Its sample names and values are illustrative; application data supplies the actual content. Existing tab content and financial behavior take precedence over the image's mismatched active-tab label. No further product decision is needed before approval of this specification.

Specification and task plan were approved, and the user selected Mode A. During implementation the user clarified that fonts and spacing should remain compact: title capped at 28px, basket title 20px, Main Line title 18px, with existing 13–14px body/control typography and responsive spacing. This refines the approved visual direction without changing scope.
