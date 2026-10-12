# Procurement basket panels: match Add Vendor presentation

Date: 2026-10-12
Status: Approved, implemented and verified locally. Task plan approved; user selected Mode A. Completion recorded 2026-10-13.

## Goal

Give Procurement's Configure Main Basket and Configure Sub-Basket side panels the same header illustration and visual treatment as the existing Add Vendor side panel. Preserve every current basket field, value and workflow. Remove the All my requests and normal Refresh baskets shortcuts from the Add Vendor side panel.

The user's latest constraint is binding: do not add or remove any existing Main Basket/Sub-Basket variable. Interpret this as preserving fields, labels, values, validation, payloads and configuration controls. The requested image is the existing decorative header illustration, not a new image-upload field.

## Current behavior and evidence

- `ProcurementVendorEditor.tsx` uses `ContextPanel` with `.vendor-profile`. Its presentation lives in `frontend/src/features/procurement/vendorProcurement.css`.
- Add Vendor's header uses `frontend/src/assets/vendor-drawer-header.webp`, an existing interior illustration. It sits to the right of the heading at 30% opacity, approximately 120px high, with reserved text/close-button space. Below 768px, it hides the illustration and releases that space.
- `CreateProposalPanel.tsx` renders both initial basket-name forms. After creation it renders `ProposalWorkspace.tsx`, which also serves existing drafts. The supplied screenshots show both stages, so both are in scope.
- `procurement-main-basket.css` applies `.basket-proposal--procurement-reference` to Procurement Main/Sub-Basket panels, explicitly hides the header artwork pseudo-elements and overrides header/body spacing. Super Admin review does not use this modifier.
- `proposal.css` gives basket panels 70vw desktop width and full width below 1200px. Preserve that existing width requirement while matching Add Vendor's visual treatment.
- `VendorBasketFields.tsx` renders the normal Refresh baskets button and All my requests shortcut inside the vendor form. It also provides Retry baskets during catalog errors; this recovery action is distinct from the normal refresh shortcut.
- My Requests is also reachable from Procurement navigation and the vendor-directory header. Those entry points remain.
- The worktree was clean at initial investigation for this request. Capture it again before implementation because other work may occur between approvals.

## Requirements and scope

1. Apply Add Vendor's existing illustration, alignment, opacity, header divider, close-control treatment and text spacing to Procurement Main/Sub-Basket panels, both before and after a draft is created. Reuse the existing asset and shared drawer architecture.
2. Match Add Vendor's restrained body spacing, field density and action styling using the existing typography and tokens. Keep text readable and compact; no oversized type, unnecessary empty spacing or new decorative assets.
3. Retain the current 70% desktop basket-panel width, responsive full-width behavior, configuration hierarchy, tabs and saved-state summary. Prevent the illustration from overlapping long headings, descriptions or the close control. Use Add Vendor's mobile artwork-hiding behavior.
4. Preserve every existing basket field, label, required marker, value, helper message, validation, option, state condition and payload. Retain the selected Main Basket context for Sub-Baskets and all existing configuration, save, refresh, submit, dirty-state and permission behavior. In particular, keep Refresh saved configuration inside the basket workspace.
5. Remove All my requests and the normal Refresh baskets button only from the Add Vendor panel. If the shared field component also serves existing-vendor details, use a local presentation option so those other consumers retain their current behavior. Do not remove fields or other Add Vendor actions.
6. Keep catalog loading, automatic refetch/invalidation, error display and Retry baskets recovery working. Removing the normal refresh shortcut must not leave a failed catalog with no retry path or change which basket values can be selected.
7. Preserve Procurement's My Requests navigation, vendor-directory requests entry, submitted-request status, close-all-panels behavior and retained vendor draft. No request-history feature or route is removed.
8. Scope basket styling to Procurement. Keep Configuration screens, Super Admin review, other drawers and the completed shared modal redesign unchanged.

## Implementation direction and impacts

Reuse or share the existing Add Vendor header treatment through a narrowly scoped presentation class or common CSS rules. Reconcile the basket-specific artwork-hiding overrides rather than duplicating form components or changing global drawer defaults. Keep form ownership and data/state handlers intact.

Likely affected areas are `procurement-main-basket.css`, the proposal panel wrappers if a shared presentation hook is required, `VendorBasketFields.tsx`, its Add Vendor caller in `ProcurementVendorEditor.tsx`, and focused frontend tests. Change `vendorProcurement.css` only if extracting shared header rules can preserve Add Vendor's existing appearance exactly.

This is frontend presentation work. No API, authorization, financial, schema, persistence or notification change is required. No dependency, database sync, migration, seed or deployment is in scope. Rollback is the scoped frontend diff, preserving any unrelated work.

## Acceptance criteria

- Main and Sub-Basket initial forms and saved workspaces display the same existing decorative image and header treatment as Add Vendor at desktop widths, with compact readable spacing.
- No basket fields, variables, validations, payloads or configuration actions are added, removed or changed.
- Add Vendor no longer displays All my requests or normal Refresh baskets. Error-only Retry baskets remains operable, and My Requests remains accessible outside the Add Vendor panel.
- Existing-vendor details and unrelated consumers retain their current controls; Configuration and Super Admin review remain unchanged.
- At 390px, 768px, 1440px and 1920px, artwork, headings and controls do not overlap; all form/configuration actions remain reachable. Long names and error states wrap safely.
- Focused creation/workspace/vendor regressions, frontend typecheck/build and `git diff --check` pass, with any baseline failures identified separately. Rendered checks compare all four basket states with Add Vendor and confirm its field inventory is unchanged.

## Risks, verification and assumptions

The main risks are CSS specificity hiding the reused illustration, insufficient room for long header text, and removing utilities from unintended shared consumers. Verify scoped selectors, both basket targets before/after creation, Add Vendor versus existing-vendor details, error retry and external My Requests navigation. Include keyboard close/dirty confirmation and request-submission regression checks; these behaviors should not change.

Assumptions: “same UX” requests visual parity using the current Add Vendor illustration, with the previously requested basket width retained. “Refresh list” refers to Refresh baskets inside Add Vendor, as shown in the supplied crop. There are no unresolved data or product decisions requiring clarification before this specification can be approved.
