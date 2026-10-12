# Procurement Configure Main Basket: reference styling

Date: 2026-10-12
Status: Approved and implemented locally; verification evidence recorded in the task plan.

## Goal and reference

Restyle the **Procurement → Configure Main Basket** workspace to follow the image supplied in this request: prominent header, basket identity/status strip, a substantial hierarchy column, underlined section tabs, spacious UOM/surface sections, and a restrained fixed footer.

This is a presentation change to the completed proposal workflow. The supplied image is the visual reference; existing saved data and application behavior remain authoritative.

## Current behavior and evidence

- `frontend/src/features/vendor-basket-proposals/ProposalWorkspace.tsx` renders both Procurement authoring and Super Admin review. It also handles existing-parent Sub-Basket proposals. A Procurement/Main-Basket-specific scope is necessary to avoid changing these other screens.
- Its `ContextPanel` currently has a title/eyebrow without the reference's supporting description. The basket heading and actions share a plain toolbar. The hierarchy column is fixed at 190px.
- `proposal.css` already preserves the requested 70vw desktop width and full viewport width below 1200px. Its generic `.basket-proposal` selectors affect both roles and both proposal types.
- Overview reuses `KnowledgeOverviewPanel` and `KnowledgeModeSurfacePanel`. Their UOM select, surface multiselect, selected-surface table, loading/error states and disabled rules already work. Their default presentation also serves ordinary Configuration.
- Existing footer saving calls `saveCurrent()` and handles the active editor's changes. Submission is a separate explicit action in the readiness section. Closing/refreshing/navigation preserve the existing unsaved-change guards.
- The hierarchy currently uses visible Edit/Remove/Add controls. It has no hierarchy search, collapse control or overflow-action menu.
- The worktree includes prior uncommitted backend/frontend feature work. Preserve that work and capture the relevant current content before implementation.

## Scope and boundaries

Apply the new visual treatment only when the workspace is Procurement authoring/viewing a **new Main Basket** proposal. Cover draft, submitted/read-only and decided-history states without changing their capabilities.

Keep ordinary Super Admin Configuration, Super Admin proposal review, existing-parent Sub-Basket workspaces, the Add vendor panel and initial name-entry form visually unchanged. Do not change backend services, API payloads, authorization, publication, notifications, database indexes or stored records. No database sync, migration, seed, deployment, dependency installation or lockfile change is required.

Interpret “CSS changes” as styling plus the smallest semantic JSX/presentation hooks needed for this composition. Keep the existing hierarchy actions accessible. The reference's search box, collapsible tree and three-dot menus are not added as decorative/inert controls or new features in this styling scope.

## Visual requirements

1. **Header:** retain the Procurement eyebrow and Configure Main Basket title. Match the reference's hierarchy and generous spacing using the existing application font. Add suitable supporting copy for the displayed section, with the reference's measurement/surface description on Overview. Use the existing close control and accessible behavior. Remove unrelated decorative header treatment only inside this scoped workspace.
2. **Basket strip:** group the real basket name, vendor name and actual proposal status in a light neutral bordered strip. Align Edit basket and Refresh actions on the right at wide widths and wrap them naturally on smaller screens. Existing actions retain their handlers and guards. Any saved/unsaved/saving/error indicator must derive from real editor/query/mutation state; a timestamp must use the saved record, never hardcoded “Just now.”
3. **Two-column body:** provide a wider hierarchy area, approximately 30–32% of the usable body at wide widths, bounded so the editor remains useful within the 70vw panel. Use a quiet neutral fill, a clear divider and consistent spacing. Keep the existing Main Line title and edit/remove actions in a compact arrangement so they remain discoverable.
4. **Hierarchy:** use stronger Sub-Basket names, indented Main Lines, the reference's muted green selected-row treatment and clear nested relationships. Style Add Main Line and Add Sub-Basket as full-width outlined/dashed actions within their appropriate hierarchy group. Retain all existing edit, remove and selection controls with meaningful labels and visible focus. Do not hide essential actions merely to match the screenshot.
5. **Tabs:** use flat text tabs, a thin divider, green active text and a clear underline. Preserve the four existing sections, roving keyboard navigation, dirty-state navigation guard and read-only behavior. Ensure these styles override the current filled-button presentation only within the new scope.
6. **Overview sections:** match the reference's Unit of measure and Applicable surfaces composition with a heading, muted description, existing icon treatment, full-width controls, restrained borders and generous spacing. Optional component presentation props may supply these titles or empty-state copy, provided their defaults and all ordinary Configuration output remain unchanged. Reuse existing symbols; add no icon library, image asset or font dependency.
7. **Surface states:** make the empty surface area spacious and readable, while keeping the label/select actionable. Preserve the real selected-surface table and remove/edit permissions for populated states. Do not replace available data with a decorative empty state.
8. **Footer:** restyle the existing footer to match the reference's right-aligned secondary and primary actions, with a thin upper border and stable spacing. Preserve current Close/Save behavior, validation and busy rules. A configuration save must never submit or approve a request. Keep the separate approval-submission action and readiness feedback visible and usable.
9. **Palette and shape:** use existing Lisno neutral, dark-text and muted-green tokens, subtle borders and the restrained control corners shown in the reference. Avoid added gradients, drop shadows, decorative motion or unrelated illustration. The selected-row cue follows this supplied reference specifically.

## Responsive and accessible behavior

- Preserve 70vw at viewport widths of 1200px and above, and full width below 1200px.
- Adapt the hierarchy/editor proportions to panel width. Stack them when a useful two-column composition no longer fits; do not shrink controls or clip labels.
- Verify 1440px, 1920px, 1024px, 768px and 390px viewports, long basket/vendor/line names, multiple children and empty hierarchy.
- Preserve semantic headings, input labels, focus trapping/return, Escape behavior, tab keyboard navigation and busy/disabled states. Keep actions reachable with touch and keyboard.
- Keep the footer from obscuring the last editor/readiness content. Restrict horizontal scrolling to genuinely wide data tables if necessary.
- Check loading, failure/retry, stale/unsaved, saved, submitted and read-only states. Never display a successful-save indicator during an unresolved save or conflict.

## Architecture and compatibility

Use a new root modifier on the target workspace, derived from its real `scope` and proposal target. Scope all new CSS beneath it. Do not rely on app-shell ancestry across drawer portals or impersonate a Super Admin role.

Keep shared components' default markup and appearance equivalent. Prefer local wrappers/classes; if a shared component needs a small optional presentation prop, default it to current behavior and verify ordinary Configuration before/after. Do not duplicate editor state, save handlers or API calls.

Data/API/state transitions and permissions are unchanged. Search, new persistence behavior, approval changes and new catalog features are outside this visual request. Rollback consists of removing the scoped modifier/styles/presentation hooks; there is no data migration.

## Risks and verification

- Shared CSS can unintentionally affect Configuration or review drawers. Verify negative scope coverage and compare rendered ordinary Configuration and Super Admin review against the captured baseline.
- Existing Configuration selectors can override proposal styles. Verify a cold Procurement entry without first loading the Configuration workspace.
- Narrow panels, long names and table content can crowd the new hierarchy proportion. Measure real layouts at the specified widths instead of relying on CSS inspection.
- Moving/renaming visual controls can obscure saving versus submission. Exercise save, dirty navigation, close/discard, metadata actions and submission readiness using existing handlers.
- Prior full suites contain documented baseline failures. Run focused workspace/Overview/surface regressions, frontend typecheck/build and browser interaction/accessibility checks; distinguish any current failures from the captured baseline. No new backend suite or live-database test is needed for a presentation-only change.

## Acceptance criteria

- **AC1:** The target Procurement workspace visibly follows the supplied header, summary strip, hierarchy, tab, section and footer composition with real content.
- **AC2:** All four sections and existing hierarchy, save, refresh, close and approval-submission actions remain functional with unchanged business behavior.
- **AC3:** Ordinary Configuration, Super Admin review, Sub-Basket proposal workspaces and the initial name-entry form retain their current presentation and behavior.
- **AC4:** Target layouts remain usable at all five viewport widths, with preserved 70vw desktop sizing, no unintended page overflow, accessible labels/focus and reachable footer controls.
- **AC5:** Save/status/empty/error/read-only presentation reflects actual state. No fabricated status, timestamp, placeholder interaction or hidden existing record is introduced.
- **AC6:** Focused checks, frontend typecheck/build, scoped visual comparison and `git diff --check` are recorded. Existing dirty work and database contents are preserved.

## Assumptions and open decisions

The user is requesting the reference's visual design for this named Procurement workspace, with current functionality retained. The screenshot does not authorize changes to saving/submission semantics or new hierarchy features. No additional product decision is required before spec approval. A separate task plan and execution-mode choice follow the repository's existing gates.
