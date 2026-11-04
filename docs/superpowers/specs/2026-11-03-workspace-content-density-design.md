# Full-width, compact content layout across all web roles

Date: 2026-11-03
Status: Implemented and locally verified in approved Mode A. The full frontend suite retains 91 reproduced pre-existing failures; detailed evidence and limitations are recorded in the task plan.
Classification: Substantial frontend layout change, with cross-screen regression risk.

## Goal and confirmed scope

Use the available content area across the web application, reduce excessive top space and button spacing, and show more useful content immediately.

The user clarified that this applies to **all role screens and all web content pages**, not only the Client or estimation screen. Apply one consistent content-layout policy to the authenticated application: Super Admin, Sales Manager/Admin, Sales, Designer, design management, Procurement, Finance, Project Manager, execution/worker and Vendor screens, plus Client screens and shared project messaging.

“Entire space” means the available workspace beside navigation and below the global toolbar. It does not mean expanding individual text inputs, document pages or readable prose to arbitrary widths.

## Current behavior and evidence

These are the source findings captured before implementation. Final browser measurements are recorded in the task plan.

| Area | Evidence | Effect |
| --- | --- | --- |
| Shared page width | `frontend/src/styles/shell.css:315` sets the workspace measure to `--content-wide`, then caps each direct child. A Client override uses `--content-default`. `global.css:129` defines these as 90rem and 72rem. | Wide displays retain unused space, with a narrower Client content area. |
| Shared top spacing | `components/layout/common-shell.css:39` adds 24px above content. The common global toolbar is 72px high, reduced to 64px on narrow screens. Base shell padding also uses 24px. | Global chrome and page padding consume substantial vertical space before page content. |
| Repeated header rows | `components/ui/PageHeader.tsx` separately renders breadcrumb, eyebrow, title, description, metadata and actions; `styles/primitives.css:338` forces the breadcrumb onto a full row. Role styles add further header padding. | Short page identities can occupy several rows before filters or data begin. |
| Staff estimate precedent | `styles/estimator-dashboard.css:1117` already uses 6px workspace padding and full-width estimate content. `LeadEstimateWorkspace.tsx:133` measures the remaining builder height. | A compact, content-focused pattern already exists and can inform the common layout. |
| Client estimate overhead | `ProjectQuotationWorkspace.tsx` adds a page header above a second quotation header. `clientQuotation.css` adds 20px outer padding, 16px repeated gaps and item padding, with a `min(65vh, 48rem)` pane cap. | Shared estimation navigation exists, but the Client presentation shows fewer items in the available area. |
| Additional page caps | `common-shell.css:242` caps Procurement dashboard content at 1160px and adds another 24px horizontal inset. Designer plans retain their own `--content-wide` cap. | Changing only the main shell would leave inconsistent page-specific empty space. |
| Alternate layouts | `AppShell.tsx:37` uses a separate messaging shell and main region. Configuration, estimate builders and other workspaces have their own height/scroll rules. | These require explicit reconciliation and regression checks, not universal descendant overrides. |
| Existing control sizes | `global.css` already provides 36px default, 32px compact and 44px large controls; shared primitives restore touch sizes for coarse pointers. | Reuse existing size tokens instead of shrinking text or introducing another button system. |

The worktree contains the completed, uncommitted shared-estimation implementation from the preceding task. That is the starting point. Preserve its saved data, permission checks, source tokens, confirmations, navigation guards and tests. Shared shell, Client dashboard and Client project workflow styles currently have no pre-existing diff; Client quotation and estimator styles already contain the preceding task's changes.

## Recommended approach

Establish a single compact workspace contract in the existing shell and UI primitives, then reconcile page-level width/header overrides across the route inventory. Retain the existing typography, colors, components and role navigation. This uses the current architecture and does not require another UI library or new design theme.

Use explicit layout selectors and small shared tokens. Do not apply blanket descendant width, margin, height or overflow resets, and do not use browser zoom, transforms or reduced body font sizes to simulate density.

## Requirements

### R1. Available width and page insets

- Every authenticated page's outer content frame fills the available main column. Remove the default 72rem/90rem page cap and conflicting page-level caps that constrain whole working screens.
- Use approximately 12px horizontal page gutters on desktop and 8px on narrow screens, respecting safe-area insets. Existing workspaces with smaller intentional gutters may retain them.
- Use an 8px default content top inset; avoid adding a second page-wrapper inset over it.
- Keep intentional inner widths for prose, individual controls, dialogs, document previews and readable forms. Tables, grids, lists and multicolumn working areas should consume the released width.
- Scope any remaining width limit to the element needing it, not the entire page.

### R2. Compact global and page headers

- Reduce the common toolbar toward 56px plus the safe-area inset, retaining accessible account, notification, critical-task and navigation controls. Allow natural extra height when content or text zoom genuinely requires it.
- Align the shell grid, sticky offsets and available-height calculations with the actual toolbar height, including the messaging shell and Configuration background alignment.
- Use a compact identity/action row for normal page headers. Back navigation, title, short status and actions should share a row where space permits.
- Remove repeated decorative heading/explainer rows or place secondary explanatory copy in an appropriate compact disclosure. Retain a meaningful page heading and accessible names.
- Reduce oversized decorative dashboard header height across roles so it no longer postpones useful content. Preserve meaningful project identity and existing assets only where they fit the compact composition.
- Important pending actions, access/read failures, validation errors, stale data and unsaved-state notices remain visible and may increase header height.

### R3. Button and toolbar density

- Reuse the existing compact/default control dimensions: generally 32–36px for fine-pointer desktop toolbars, with 44px touch targets on coarse-pointer/narrow layouts.
- Use compact 4–8px action gaps and approximately 8–12px padding where appropriate. Remove duplicate outer padding around adjacent toolbars.
- Place primary actions and directly related secondary actions together. Avoid stretching ordinary desktop actions across the page or giving each button its own unnecessary row.
- Consolidate duplicate navigation or actions only when they perform the same operation in the same context. Keep all required capabilities discoverable and keyboard accessible; do not silently remove features.
- Long labels wrap or reflow; destructive actions and pending-save states remain clearly identifiable.

### R4. Useful height and dense content

- Data workspaces use the remaining viewport space after their real header, filters and actions. Remove arbitrary empty minimum-height areas and inappropriate viewport caps.
- Keep normal document scrolling on content pages. Use bounded panes only for workspaces that need them, such as estimation, messaging and dense editors.
- Avoid multiple competing scroll containers around the same data. Sticky controls must not cover the first or final row, focus target, validation message or input when the mobile keyboard opens.
- The Client estimate uses the same compact layout principles as the staff estimate: a consolidated header, compact row-based fields on desktop, room/basket navigation and an item area using the remaining space. On mobile, fields reflow and remain operable.
- Keep the saved overall total and visible-only subtotal labels clear. Published review and working edits remain distinguishable, with approval blocked while edits are pending.

### R5. Scope coverage and preservation

- Apply the contract across authenticated list, detail, dashboard, configuration, estimation, procurement, finance, approvals, execution, Client, Vendor and shared messaging screen families. Include both direct routes and `/home` role landing pages.
- Build a route/layout coverage inventory during planning so page-specific overrides are not missed. Do not implement a Client-only selector as the solution.
- Preserve role-based visibility, saved values, routing, filter state, pagination, safe APIs, confirmations, dirty-navigation protection and current scroll/focus behavior unless a specific spacing correction requires a presentation adjustment.
- No changes to backend contracts, persistence, financial calculations, approval rules, permissions, emails or Configuration semantics.

## Assumptions and non-goals

- This is an authenticated web workspace change. Standalone login, invitation acceptance, public token pages, native mobile screens, printable documents and PDF layouts are separate surfaces and are not being redesigned.
- “Maximum content” means reduced wasted space with legible controls, not the smallest possible typography or touch targets.
- There is no new theme, font family, icon dependency, animation, decorative effect or imagery requirement.
- Do not redesign the sidebar's information architecture, add features, remove business actions or restructure the approval workflow.
- No dependency installation, data migration, commit, push, deployment or production mutation is needed.

## Data, API and state impacts

This is a presentation change. Queries, response shapes, mutation payloads and backend authorization remain authoritative. Layout components must not remount stateful editors when the viewport changes, collapse an ancestor containing an active save, or reset dirty forms when switching between compact and expanded presentation.

If the estimate's existing viewport-measurement logic is shared, preserve observer/listener cleanup and account for toolbar/footer resize, safe areas, text zoom and the visual viewport. CSS remains the preferred mechanism for ordinary page sizing.

Rollback consists of reverting only this change's scoped layout/component edits while retaining the preceding shared-estimation implementation. No data rollback is needed.

## Risks and mitigations

- **CSS precedence across roles:** reconcile the layered shared styles and page overrides explicitly; verify computed geometry in a browser.
- **Accidental stretching:** distinguish outer page width from inner prose, inputs, image ratios and document limits.
- **Hidden content or focus:** check sticky headers, drawers, dialogs, chat composer and builder footers at narrow widths and text zoom.
- **Dirty-form regression:** retain existing save/recovery/navigation tests and exercise the consolidated controls.
- **Verification baseline:** the preceding task established unrelated repository test failures. Recheck relevant baselines, report actual outcomes and separate existing failures from new regressions rather than changing unrelated behavior.

## Acceptance criteria

1. **AC1, all roles:** every authenticated route family uses the shared full-width content frame or a documented functional layout exception; Client is no longer uniquely constrained to 72rem.
2. **AC2, width:** at 1440px and 1920px, normal data-page outer frames occupy the main-column width minus the specified gutters, without a leftover centered page-width cap.
3. **AC3, top space:** clean normal pages begin within 8px of the global toolbar; a single-line desktop page identity/action header has no decorative minimum height or unnecessary separate breadcrumb/eyebrow rows.
4. **AC4, density:** matched before/after captures show more useful content on Client home, project and estimation screens and representative staff screens. A simple Client estimate exposes at least three included rows at 1440×900 and one simple editable item at 390×844 without initial scrolling, using synthetic data and no alerts.
5. **AC5, height:** estimation and messaging use the available viewport without empty reserved bands, clipped controls or inaccessible final content. Normal pages continue scrolling naturally.
6. **AC6, controls:** desktop action bars use compact spacing, touch targets remain usable, and keyboard focus, accessible names and essential actions are retained.
7. **AC7, responsive:** check 390, 768, 1024, 1440 and 1920px, plus 200% text/zoom behavior. No unintended document overflow, overlapping controls or unreadable labels; intentional table scrolling is contained and accessible.
8. **AC8, functional safety:** saved-estimate loading, visible-item editing, save-and-return, scoped removal, stale/error/unknown-save handling, approval blocking, role restrictions and key cross-role navigation continue working.
9. **AC9, regression coverage:** rendered checks cover Client, Sales, Designer, Admin/Super Admin, Procurement, Finance, Project Manager/execution, Vendor and messaging layout families. Include loading, empty, error, populated and read-only examples where applicable, with no new runtime errors.
10. **AC10, verification:** run relevant shell/header/button and feature tests, frontend typecheck and build, accessibility checks and `git diff --check`. Backend/OCR runs are unnecessary unless the implementation unexpectedly crosses those boundaries. Record exact results and baseline limitations.

## Open decisions

None blocking specification review. The user resolved scope explicitly: all role content screens across the web application. Detailed route ownership and verification cases belong in the separate task plan after specification approval.
