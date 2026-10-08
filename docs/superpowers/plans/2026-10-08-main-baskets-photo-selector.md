# Main Baskets photo selector: task plan

Approved specification: [Main Baskets photo selector](../specs/2026-10-08-main-baskets-photo-selector-design.md).

## Scope and status
Implement the approved compact photo-card chooser, local basket search, and sticky selection footer. Preserve the existing catalogue, stable basket identity, recommendation cleanup, estimate state, permissions, and surrounding screens.

The specification and task plan are approved; Mode A was selected. Tasks 1–5 are complete as of 2026-10-08. Separate asset, UI, and test owners were followed by independent integrity review and command verification on the frozen integrated worktree. The initial dirty-path set and empty target diff are captured under `/tmp/lisno-main-baskets-photo-selector-qa/`. Desktop/mobile baseline screenshots were captured before UI edits. Configure uses document scrolling, with no nested scroll container. Unrelated existing changes remain preserved.

## 1. Capture the baseline and settle the implementation contract
Owner: primary agent. Depends on task-plan approval and execution-mode selection. Acceptance: AC1, AC3–AC7.

- Recheck `git status --short` and capture relevant target diffs before assigning writers. Current implementation targets have no existing changes.
- Preserve the completed work in `ContactAndEstimateCard.tsx`, `LeadDetail.tsx`, `LeadDetail.test.tsx`, `estimationProgress.css`, `ProjectChatHeader.tsx`, `ProjectChatHeader.test.tsx`, and `ProjectWorkflowPanel.tsx`, plus their specifications/plans. Do not stage, revert, or reformat them.
- Capture the existing chooser at desktop/mobile widths using synthetic data. Confirm the actual content scroll container and footer positioning constraints without changing application-shell behavior.
- Confirm this interface between the asset and UI packages: `mainBasketImages.ts` exports `resolveMainBasketImage(name: string): string | null`, returning an imported local asset URL for matched categories and null for an unmatched category. It uses an explicit presentation-only alias map. The user clarified during implementation that unmatched categories should use a static skeleton thumbnail. Basket IDs remain the only selection/business keys.
- Extract the current card into `MainBasketSelectionCard.tsx` to keep this redesign bounded inside the large workspace. Its props remain `basket`, `selected`, `disabled`, and `onToggle`; it owns disclosure and image-error presentation only.
- Keep the workspace as owner of search, selected IDs, catalogue state, bulk deselection, and navigation. Keep the domain deselection helper unchanged unless a demonstrated defect makes a scoped amendment necessary.
- Share the frozen props, image-resolver export, CSS scope, and ownership with writers. Do not assign agents any dirty target until its prior diff has been understood.

## 2. Implement the approved packages
Depends on task 1. The following non-overlapping packages can progress in parallel in Mode A. In Mode B, the primary agent performs them inline. No writer may edit another package's files; return integration issues to the primary agent.

### 2A. Category photo assets
Owner in Mode A: one bounded asset implementation agent. Acceptance: AC1, AC6.

Exclusive files:
- `frontend/src/assets/main-baskets/` for the optimized decorative photo assets.
- `frontend/src/features/leads/mainBasketImages.ts` for the resolver and concise provenance comments.

Actions:
- Reuse suitable repository assets where they fit. For missing subjects, apply the image-generation skill and create representative photographs matching the approved reference subjects during this implementation stage.
- Cover the named reference categories with deliberate framing; leave unknown names unmapped for the static skeleton placeholder. Keep duplicate/related lighting subjects visually appropriate without manufacturing business classifications.
- Use explicit normalized label aliases strictly for decoration, including the reference's abbreviated labels. Do not guess persisted IDs or modify catalogue/API types.
- Bundle local assets through static imports. Keep dimensions/resolution appropriate for small card thumbnails and inspect every crop before handing off. Report asset sizes and provenance; do not introduce runtime external URLs, dependencies, upload management, or Configuration writes.
- Deliver the settled resolver export to the UI owner. The UI may prepare against this agreed export while assets are in progress; final verification waits for actual assets.

### 2B. Chooser, card layout, and selection footer
Owner in Mode A: one frontend implementation agent. Acceptance: AC1–AC6.

Exclusive files:
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/MainBasketSelectionCard.tsx` (new extracted component)
- `frontend/src/styles/estimator-dashboard.css`, limited to the configure chooser/card/footer rules.

Actions:
- Preserve existing Add/Added accessible names and pressed state, article heading, details IDs, independent disclosure, and read-only behavior during extraction.
- Add the local image to each card with reserved dimensions, empty alt text, lazy loading for offscreen images, and a static skeleton placeholder for unknown categories or image errors that preserves layout and controls.
- Recompose the card into a photo on the left and a compact heading/action area on the right, with disclosure content below. Use the approved four/two/one-column layout, flexible long-name heights, and selected treatment. Remove obsolete chooser shadow/spacing rules instead of piling on conflicting overrides.
- Add an accessible search field beside Refresh available items. Derive visible baskets from the loaded catalogue with trimmed, case-insensitive name matching in configured order. Keep selected IDs and Continue eligibility independent of filtering. Add distinct no-search-results and clear-search controls.
- Preserve loading, legacy mode, empty catalogue, denied/error/retry, dynamic unavailable count, and refresh behavior. Search/refresh must not reset basket selection or entered estimate values.
- Add a guarded bulk-clear handler that applies `deselectConfiguredRecommendationSources` once to the included source keys belonging to the selected basket IDs, clears pending recommendation context using the established cleanup, and empties the selection set. Preserve line objects, saved IDs, rooms, quantities, prices, and classifications. Do not loop through stale toggle closures, call a mutation, or delete persisted data.
- Replace the configured Continue button with the sticky configure-only selection bar. Count all selected IDs, including filtered-out/missing catalogue entries. Retain exactly one Continue action and its existing guards and `buildLines` callback. Keep the historical-items return action unchanged.
- Disable Clear all when selection editing is disallowed or selection is empty. Preserve submission guards. Use a status announcement without moving focus.
- Scope footer styles to the configure view and its actual scroll container. Provide mobile wrapping/safe-area spacing and sufficient scroll clearance so the last card and focused controls remain visible. Do not modify the existing builder scroll mechanism or shell.

### 2C. Behavioral regressions
Owner in Mode A: a separate test agent. Acceptance: AC2–AC7.

Exclusive files:
- `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`
- `frontend/src/features/leads/LeadEstimateRecommendations.test.tsx`, only if the recommendation round-trip scenario belongs there rather than in the workspace tests.

Actions:
- Extend existing rendered tests rather than creating implementation-mirroring coverage or duplicating existing card tests.
- Cover trimmed/case-insensitive search, configured ordering, no-results/clear-search, selected count across hidden results, and Continue using all selected IDs. Confirm search performs no catalogue mutation/request.
- Verify Add/Added and independent disclosure retain keyboard behavior, descriptions/count chips/type controls stay omitted, and image failure leaves the card usable.
- Exercise Clear all with at least two selected baskets, one hidden by search, entered line quantity/rate values, and recommendation sources/dependents. Verify all selections clear, existing recommendation inclusion cleanup occurs, stored/entered data remain available, no save request occurs, and re-adding follows individual deselection semantics.
- Cover disabled Clear all/Continue for empty selection, locked/submitted state, and catalogue error. Preserve zero-item basket, refresh failure/retry, saved selection, and builder-return regressions.
- Verify the configure view has exactly one Continue action and the existing builder route/state transition. Tests may be prepared in parallel, but run the final suite only after all writers finish.

## 3. Integrate and review
Depends on 2A–2C. Owner: primary agent, then an independent `integrity_reviewer` in Mode A; equivalent inline review in Mode B. Acceptance: AC1–AC7.

- Inspect the combined diff and asset output against the approved reference and baseline. Reconcile imports, props, styles, and test expectations.
- Review global-vs-filtered selection, stable ID use, missing selected baskets, bulk-clear recommendation cleanup, preservation of entered/persisted lines, locked states, refresh/error behavior, and absence of new writes.
- Inspect image failure handling, title wrapping, independent disclosure, stylesheet leakage, footer overlap, and duplicated Continue controls. Check that builder scrolling and prior lead/payment redesign work remain unchanged.
- Fix concrete findings within ownership boundaries, then freeze all product/test/asset writes before final command verification.

## 4. Verify the integrated result
Depends on task 3 and any fixes. Owner: primary agent for rendered checks; `verification_runner` for commands in Mode A. Mode B performs both inline. Acceptance: AC1–AC7.

Run from `frontend/`:

```sh
npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/roomRecommendations.test.ts src/features/leads/estimationCatalogueApi.test.ts
npm run typecheck
npm run build
```

Run typecheck and build sequentially. If a check fails, diagnose and fix the cause, rerun the affected checks, and broaden testing only for a demonstrated shared regression. No backend contracts change, so backend/migration suites are not part of this UI verification. There is no repository lint script.

Rendered checks using the existing synthetic browser fixture, with temporary local transport overrides if needed:
- Wide 2048px desktop, 1440px laptop/desktop, 768px tablet, and 390px/320px mobile widths; also a short-height viewport and effective 200% zoom/enlarged text.
- At least the reference's full category set for layout comparison, plus a long name, unknown name, zero-item basket, selected card, and expanded last-card disclosure. Do not substitute fixture names for production catalogue data in product code.
- Verify four desktop columns, compact card heights and image crops, no horizontal overflow, preserved surrounding room controls, visible selected state, no descriptions/count chips/type controls, and no gratuitous empty card space.
- Exercise search, clear search, Add/Added, disclosure, filtered Clear all, refresh success/failure/retry, locked state, and Continue by keyboard and pointer. Confirm quantities/rates survive the intended navigation/selection round trips.
- Scroll to the last card and focus its controls; confirm the footer remains reachable and does not cover content. Check mobile keyboard/viewport behavior to the extent the available browser tooling supports it, and state any emulation limitation.
- Verify unknown/failed image fallback, lazy image layout stability, local asset requests, browser console/request errors, accessible names/states/focus, and a focused automated accessibility scan. Inspect the captured screenshots as images.

Run repository hygiene checks after verification:

```sh
git diff --check
git status --short
```

## 5. Record results and hand off
Depends on task 4. Owner: primary agent. Acceptance: AC7.

- Record exact final test counts, command results, visual viewport/state checks, asset provenance/sizes, any incomplete checks, and known warnings in this plan. Do not reuse earlier task counts as fresh evidence.
- Stop only the preview/browser sessions created for this task. Move temporary screenshots/logs to `/tmp/lisno-main-baskets-photo-selector-qa/`; retain only intended product image assets in the source tree. Preserve unrelated runtime outputs.
- Update the approved spec and plan status after completion without reopening approval gates for routine fixes.
- Report the implemented result and remaining limits concisely. No staging, commits, pushes, deployment, production writes, migrations, or external customer communication are authorized.

## Execution and ownership rules
Before Mode A or B is selected, only the approval documents and safe read-only investigation are allowed. After Mode A, 2A/2B/2C may run concurrently with explicit ownership and the shared interface above; tell every writer they are not alone and must preserve others' edits. Respect the available concurrent-agent limit, reusing existing threads where appropriate. The primary agent owns documents, product interpretation, shared-contract reconciliation, and integration. Review and final verification follow all writers sequentially.

Mode B keeps implementation, review, and verification in the primary thread without implementation subagents.

## Final implementation and verification

Product files: `LeadEstimateWorkspace.tsx`, extracted `MainBasketSelectionCard.tsx`, `mainBasketImages.ts`, 17 assets under `frontend/src/assets/main-baskets/`, and chooser/footer rules in `estimator-dashboard.css`. Regression changes are limited to `LeadEstimateWorkspace.test.tsx` and `LeadEstimateRecommendations.test.tsx`.

- AC1/AC6: compact photo cards, four/two/one columns, local category images, static neutral skeleton for unknown names or image failures. Descriptions, count chips and basket-level type controls remain omitted from the cards; details still expose actual catalogue information when expanded.
- AC2/AC3: search is local, trimmed and case-insensitive. Filter order follows the catalogue; the selected count and Continue use all selected IDs. Search clears without losing selection; refresh retains selection/query; disclosure is independent. Empty catalogue and no search results are distinct.
- AC4: Clear all uses the established deselection helper once, clears pending recommendation context, and preserves rooms, saved line identity, entered quantity/rates and classifications. Regression round trips verify recommendation cleanup and retained values. Browser checks confirmed zero writes and no catalogue reads during search/clear.
- AC5: the measured sticky footer remains in document flow with focus clearance. It retains exactly one Continue action and existing validation. Locked state and failed refresh disable selection/Clear all/Continue; search remains usable with a loaded catalogue. Keyboard Continue reaches the existing builder.
- AC7: independent integrity review found no confirmed defects or blockers after reconciliation. The explicit positive-count no-results guard is a clarity improvement; the earlier review's stray-zero concern was retracted because the original ternary already returned null.

Final commands, run sequentially from `frontend/` after writers froze:

| Command | Result |
| --- | --- |
| `npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/roomRecommendations.test.ts src/features/leads/estimationCatalogueApi.test.ts` | Exit 0; 118/118 tests across 5 files: 42 workspace, 37 recommendations, 20 configured estimate, 14 room recommendations, 5 catalogue API |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; 3,076 modules transformed; Vite warned about chunks over 500 kB |
| `git diff --check` from repository root | Exit 0 |

Rendered verification used the local synthetic enterprise fixture and a temporary transport override; no production data or API writes were used. All 17 reference categories and an unknown long name were exercised. Screenshots were inspected at 2048, 1440, 768, 390 and 320 px widths, plus a 720×500 effective enlarged-layout viewport. Four columns rendered at 2048/1440, two at 768/720, and one at 390/320, without horizontal overflow. Cards were about 130 px high; the longest mobile name expanded to about 133 px. The footer was about 58 px high on desktop/tablet and 120 px on narrow mobile.

Interaction checks covered selection, search/no results/clear, filtered bulk clear, details, unknown and failed photos, refresh/retry, empty catalogue, locked estimate and keyboard Continue. At the last expanded mobile card, focused disclosure ended at 611.45 px while the sticky footer began at 683.95 px. A 390×460 viewport left the focused search control above the footer. Automated accessibility scans returned zero violations at 1440 px and 390 px, with 34 passes each; the desktop scan reported an incomplete color-contrast check and two axe asset-preload warnings, so it is not evidence of a complete contrast audit. Fresh-load final checks recorded no application console errors, failed requests or render errors. Earlier transient Vite errors during concurrent asset writes recovered before final checks.

Limitations: reduced viewport sizes exercise responsive/reflow behavior but do not reproduce native browser 200% zoom, enlarged system text or a real mobile keyboard. Full frontend, backend, replica-set and OCR suites were not run for this bounded frontend change. There is no lint script. No dependencies, lockfiles, APIs, schema, migrations, commits, pushes, deployments or production records were changed.

Task-created browser/preview sessions were stopped. Screenshots and browser logs were moved out of the source tree to `/tmp/lisno-main-baskets-photo-selector-qa/`; the baseline/injection helpers remain there as temporary verification evidence. The build generated ignored `frontend/dist/` output. Product image files are the only retained new image deliverables in the repository.

## Asset provenance and final prompts

All 17 shipped thumbnails are 320×320 WebP encoded using existing `cwebp` at quality 78, totaling 171,826 bytes (167.8 KiB). No runtime external image host is used. Fifteen were generated with the built-in image-generation tool on 2026-10-08; `material-samples.webp` reuses the repository's `configuration-header.webp`, and `interior-furnishings.webp` reuses `projects-living-room.webp`. Each crop was visually inspected. The photographs are generic representatives authorized by the user, not copies of the screenshot's originals. The resolver's explicit normalized aliases affect decoration only; unmatched labels return null for the skeleton.

Generated source PNGs are at `/Users/apple/.codex/generated_images/01a119ef-0e5f-7171-b1c8-f42e67ecf9dd/`; shipped files are under `frontend/src/assets/main-baskets/`.

Every generation prompt used this exact prefix followed by its subject suffix below:

> Use case: photorealistic-natural. Asset type: representative category photo for a small interior-estimation basket card, never a UI mockup. Square photograph, one continuous scene. Close centered subject stays readable when cropped vertically, realistic material detail, restrained warm neutral colors, soft natural light. No people, words, letters, logos, watermarks, borders, collage, or graphic overlays.

- `pop-gypsum.webp`: Look upward into a modern room showing a smooth white POP gypsum false ceiling with a clean recessed rectangular cove and a few tiny recessed downlights. Ceiling fills 80 percent of frame, only narrow warm beige wall edges visible. Architectural photograph, practical Indian residential interior.
- `pendant-lighting.webp`: Three elegant cylindrical brushed brass pendant lights at staggered heights over a small dark wood counter. Close architectural detail with the fixtures centered, muted warm gray room background. Pendants dominate frame; real electrical fixture installation.
- `painting.webp`: Close photograph of a paint roller with an ivory roller sleeve and a short red handle resting in a dark paint tray beside an open unbranded can of muted off-white wall paint, with a textured newly painted wall behind. Tactile professional painting supplies.
- `general-tools.webp`: Close overhead photograph of neatly arranged general home installation tools: cordless drill, hammer, tape measure and screwdriver on a natural wood workbench. Central cluster, realistic worn steel and rubber, no brands or writing.
- `electrical-switches.webp`: Close straight-on photograph of a modern electrical switch plate installed on a softly textured warm gray wall. Two clean rectangular rocker switches and one Indian universal power socket, unbranded matte ivory finish, plate centered and large in frame. Real electrical fitting detail.
- `on-site-woodwork.webp`: Close photographic detail of an oak cabinet door being built in a tidy carpentry workshop: a compact hand plane resting on a solid wood board with neat curled wood shavings and a clamp. Warm natural timber grain dominates, central tools clearly readable.
- `modular-cabinetry.webp`: Photograph of a finished modular residential kitchen with natural light oak cabinets and muted taupe cabinet fronts, clean inset handles, stone counter. Frame a compact vertical section of tall cabinets and base drawers; cabinetry is unmistakable and fills the image, no people.
- `decorative-ceiling.webp`: Architectural photograph looking upward at an elegant decorative coffered ceiling with clean rectangular inset panels and simple white molding, soft perimeter cove light. Ceiling fills most of frame, warm neutral classic interior, no ornate chandelier.
- `light-fixtures.webp`: Close photograph of three different modern ceiling light fittings on a warm light gray studio work surface: a compact black cylindrical spotlight, an ivory round recessed LED downlight and a brushed metal wall sconce. Product photography, recognizable fixtures, centered arrangement, no wires clutter.
- `glass-partition.webp`: Architectural photograph of a clear floor-to-ceiling glass partition with slender dark bronze frames and a simple glass door dividing two contemporary interior rooms. Centered glass edge and door handle catch daylight reflections, neutral timber floor, glasswork clearly readable, no people.
- `glass-stair.webp`: Architectural photograph of a small contemporary indoor staircase with oak stair treads and clean transparent glass railing panels fixed with subtle stainless steel fittings. Focus on the glass balustrade and stair run in a warm neutral interior, centered composition.
- `acp-facade.webp`: Close architectural photograph looking obliquely along a contemporary building facade clad with crisp light silver aluminum composite panels, clear rectangular seams and a dark glazed window at one edge. Daylight, real brushed aluminum surface, panels are the subject, no signage.
- `slatted-ceiling.webp`: Architectural photo looking upward along an installed contemporary ceiling made from parallel medium oak wood slats separated by narrow dark gaps. One discreet linear light between slats, ceiling dominates frame, slight perspective and narrow beige wall edge, clearly distinguishable from smooth gypsum ceiling.
- `pvc-ceiling.webp`: Photograph looking upward at an installed white PVC tongue-and-groove panel ceiling in a tidy small residential interior. Long smooth ivory plastic strips with thin gray seams clearly visible, modest recessed round light and narrow wall cornice, simple practical finish, ceiling fills almost all frame.
- `metal-framing.webp`: Close photographic view of aluminum and galvanized metal framing profiles at an interior fit-out construction site. Several vertical silver studs joined to a horizontal frame, visible clean screws and right-angle joints, smooth gray unfinished wall behind. Clearly a metal fabrication/partition frame, no people, no text.
