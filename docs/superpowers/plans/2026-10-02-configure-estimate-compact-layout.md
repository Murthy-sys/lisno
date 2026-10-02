# Configure Estimate compact layout task plan

Source of truth: [Configure Estimate compact layout design](../specs/2026-10-02-configure-estimate-compact-layout-design.md). This plan implements only the Configure step. The existing item-selection redesign and catalogue/backend work are separate in-progress changes.

## Ownership and worktree boundaries

- The primary agent owns the layout contract, `LeadEstimateWorkspace.tsx`, `estimator-dashboard.css`, integration tests in the already-dirty `LeadEstimateWorkspace.test.tsx`, and final diff reconciliation. Record the relevant current diffs before writing; preserve every unrelated hunk in these files.
- A separate component slice may own only `RoomDimensionsAccordion.tsx`, `RoomsMultiSelectDropdown.tsx`, and focused tests for those components. These files were clean at planning time. It must keep the existing props and callbacks and must not edit workspace markup or the shared stylesheet.
- Do not edit `ConfiguredEstimateBuilder.tsx`, API types, backend files, project-chat authorization/query code, shared shell styles, lockfiles, or the other untracked plans/specs for this request.
- In Mode A, the primary workspace/style slice and the bounded room-control slice may run in parallel after the DOM/class contract is set. Integration tests, review, and final verification wait for both. In Mode B, the primary agent performs the same sequence inline.

## Dependency-ordered tasks

### 1. Capture the baseline and settle the local contract

**Owner:** primary agent. **Dependencies:** approved specification and execution mode.

- Capture `git status --short` and the current diffs of the three dirty target files. Read the final Configure JSX and CSS selectors again immediately before edits so concurrent in-progress estimate work is retained.
- Define Configure-only class names and DOM order for masthead, navigation, Project details, room-dimension sections, Main Basket rows, and continuation. Use the existing callbacks and query data. Choose the screenshot's row-end chevron as a real, independently operable disclosure of a concise catalogue breakdown; the checkbox alone changes selection.
- Keep content width tied to the available `.ui-workspace` area beside the sidebar. Scope CSS under the Configure view so item-selection and other estimator screens remain stable.

**Exit evidence:** target diffs understood, no contract or data change, and file ownership communicated before parallel writes.

### 2A. Build the Configure workspace and basket hierarchy

**Owner:** primary agent. **Files:** `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, `frontend/src/styles/estimator-dashboard.css`. **Dependencies:** task 1. **Parallel with:** task 2B in Mode A.

- Restructure only the Configure rendering into the compact masthead and navigation row, a two-column Project details section, room-dimensions area, and dense Main Basket section. Place the existing room selector's chips under its field without duplicating selected-room state.
- Add basket row markup with a native checkbox label, separate disclosure button with `aria-expanded` and `aria-controls`, live Sub Basket/Main Line/temporary counts, and a concise expanded breakdown from the current catalogue. A disclosure click must not select the basket, and a selection click must not open the disclosure.
- Reuse existing total, status, critical count, loading/error/empty messaging, refresh, and continuation. Keep long labels and notices able to grow naturally.
- Add Configure-scoped tokens and responsive CSS matching the reference's compact spacing, warm canvas, quiet borders, and restrained selected state. Use no drop shadows, gradients, emoji, hover animation, new Lucide icons, or new dependency. Keep overlays above section bounds and retain visible keyboard focus.

**Exit evidence:** acceptance criteria 1, 2, and the UI portion of 4–5 can be exercised in a browser without altering estimate data or the later builder.

### 2B. Refine room controls for the compact section

**Owner:** bounded component owner in Mode A; primary agent in Mode B. **Files:** `frontend/src/features/leads/RoomDimensionsAccordion.tsx`, `frontend/src/features/leads/RoomsMultiSelectDropdown.tsx`, and a new focused room-control test file only if interaction behavior changes. **Dependencies:** task 1. **Parallel with:** task 2A in Mode A.

- Consolidate each room's dimensions heading to one labelled disclosure control with its area or **Not set** status, while preserving length/width editing and room removal. Remove the standalone global expand/collapse row or integrate its action into useful heading space when multiple rooms make it valuable.
- Preserve the room selector's search, selected chips, keyboard handling, and `onChange` contract. Correct singular/plural selection text and ensure a long room label or multiple chips can wrap within the new grid.
- Use the established controls and local inline graphics where necessary; add no icon package or new business state.

**Exit evidence:** acceptance criteria 2 and 4 for room interactions; existing workspace call sites compile unchanged.

### 3. Integrate and cover meaningful regressions

**Owner:** primary agent. **Files:** `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx` and any narrowly necessary Configure-only test support. **Dependencies:** tasks 2A and 2B.

- Reconcile both slices and review the complete Configure markup, styles, and pre-existing dirty hunks. Keep item-selection styling and previous tests intact.
- Extend rendered tests around one realistic multi-basket catalogue and one room: section and field labels, count derivation including temporary items, basket checkbox versus disclosure independence, dimension edit/removal, refresh and Continue behavior. Cover at least one denied/error or disabled state without duplicating every existing catalogue test.
- Check that draft payloads and totals remain unchanged through the existing estimate workflow tests. Do not add snapshot tests that only mirror markup.

**Exit evidence:** acceptance criteria 4–5 pass in focused tests and no unrelated workflow behavior changes appear in the final diff.

### 4. Verify the integrated screen and hand off

**Owner:** primary agent in Mode B; primary agent coordinates an independent `integrity_reviewer` followed by `verification_runner` in Mode A after all writers finish. **Dependencies:** task 3.

- Run focused frontend tests for `LeadEstimateWorkspace` and the room controls, then `npm run typecheck` and `npm run build` in `frontend/`. Broaden frontend tests only for a concrete regression found in shared styles or components. There is no repository lint script.
- Render the actual app or fixture at a wide desktop with sidebar, the approximately 998×677 reference content size, tablet, and narrow mobile. Inspect initial-view density, long names, multiple selected rooms, dropdown clipping, selected/expanded rows, loading/error states, keyboard focus, and horizontal overflow. Check 200% text zoom and reduced-motion behavior. Fix and recheck any issue found.
- Inspect the final scoped diff, run `git diff --check` and `git status --short`, and report exact pass/fail evidence, any checks that could not run, generated temporary outputs, and remaining limitations. Do not stage, commit, deploy, or touch production.

**Exit evidence:** acceptance criteria 1–6 verified against the approved specification, with explicit limits on any unverified state.

## Acceptance and verification trace

| Specification criterion | Implementation task | Verification |
| --- | --- | --- |
| 1. Reference hierarchy and workspace width | 2A | Rendered wide and reference-size inspection |
| 2. Responsive fields and room dimensions | 2A, 2B | Desktop/tablet/mobile render, room interaction test, overflow check |
| 3. Initial-view density and flexible long content | 2A | 998×677 comparison, long-name fixture, 200% text zoom |
| 4. Pointer and keyboard operations | 2A, 2B, 3 | Focused rendered tests and keyboard walkthrough |
| 5. Truthful values/states and unchanged data | 2A, 3 | Existing workflow tests, state inspection, scoped diff review |
| 6. Accessibility and final quality | 2A–4 | Focus/labels/reduced-motion checks, typecheck, build, hygiene |
