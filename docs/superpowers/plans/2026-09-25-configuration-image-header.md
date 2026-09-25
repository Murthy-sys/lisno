# Configuration image header: task plan

Date: 2026-09-25
Status: Implemented and verified in approved Mode A. T0–T5 complete; final evidence and limitations recorded below.
Source of truth: [Approved specification](../specs/2026-09-25-configuration-image-header-design.md).

## Outcome and acceptance mapping

Add one optimized, local interior-design image behind the existing top of Configuration. Cover the index, Overview, Mode, Recommendation & Exclusions, Quality Parameters, and reusable values without adding height or changing their behavior.

| Criterion | Deliverable | Tasks |
| --- | --- | --- |
| AC1 | Consistent artwork across every Configuration destination and section | T1–T5 |
| AC2 | Right-weighted image, legible light text zone, unchanged compact geometry | T0–T2, T4–T5 |
| AC3 | Responsive crop, no overflow or seams, text-enlargement verification | T2–T5 |
| AC4 | Preserved navigation, unsaved-change handling, controls and overlays | T2–T5 |
| AC5 | Loading/error/read-only and blocked-image fallback remain usable | T2–T5 |
| AC6 | Route-scoped backdrop disappears outside Configuration | T2, T4–T5 |
| AC7 | Integrated tests/build, evidence review and preservation of unrelated work | T0, T4–T5 |

Keep one parent task in progress: implement and verify the approved Configuration image header. The dependency graph is T0 → T1/T2/T3 → T4 → T5. T1, T2 and T3 may proceed in parallel after their contracts are settled; final visual composition waits for the real asset.

## Settled integration contract

- Mark only the established Configuration routes in `AppShell.tsx`, using the project's existing route-matching approach. Use an explicit shell hook such as `data-configuration-backdrop="true"` for `/admin/configuration/estimation`, `/admin/configuration/estimation/items/:itemId`, and `/admin/configuration/estimation/reusable-values`. Do not use a broad substring match or change route guards.
- Tabs remain owned by `KnowledgeItemWorkspacePage`; selecting a section leaves the backdrop route marker unchanged. No per-tab image state or remounting.
- Add `frontend/src/components/layout/configuration-shell.css`, imported through AppShell, with every presentation rule restricted to the Configuration hook. Existing `common-shell.css`, shared PageHeader, workspace editor logic, index spacing, and vendor styles remain outside the writer's ownership.
- The asset contract is `frontend/src/assets/configuration-header.webp`. Use a single image matching the approved scene, with right-side visual detail and quiet left space. Aim for 2000–2400px width and no more than 300KB; inspect the result and document any necessary exception.
- Prefer coordinated CSS backgrounds for the topbar and workspace, backed by solid neutral colors. Derive alignment from their actual shared content width and existing topbar height, including mobile safe-area behavior. Keep an opaque sticky-topbar backing so content cannot bleed through on scroll.
- Start near a 320–380px combined desktop image region and 220–280px mobile region. Its fade/crop may be refined from rendered evidence; these are painting dimensions, not new content spacing or fixed text heights.
- No new transforms, ancestor filters, clipping, or unnecessary stacking contexts. If a decorative node proves necessary, keep it non-interactive, out of document flow, and hidden from accessibility APIs, and recheck fixed overlays.
- Image failure produces the neutral canvas. Preserve the 45px simple basket header, 44px targets, icon-only Search/Filters, card dimensions, and workspace content offsets.
- No dependencies, fonts, API changes, real writes, route additions, global search feature, card thumbnails, or new animation.

## T0. Capture the current baseline and ownership

Owner: primary agent. Dependency: approved task plan and selected execution mode. Product writes: none.

1. Recheck repository instructions, current files, and dirty paths. Save the relevant diffs and full source/hash snapshots before assigning any writer. Preserve the existing vendor/backend/mobile and compact-index work.
2. Use `/tmp/lisno-configuration-image-qa/` for this task's artifacts. Reuse the existing synthetic QA approach from `/tmp/lisno-knowledge-compact-qa/` without overwriting its previous evidence.
3. Capture index and workspace baseline geometry with the same synthetic data and sidebar at 1440px and 320px: topbar height, page/header offsets, simple basket height, card heights, section-tab/command positions, and overflow. Include an unrelated route's shell appearance.
4. If richer fixture preparation delays a before screenshot, freeze the relevant before-state modules and render that exact snapshot later. Never restore old files into the live shared worktree just to capture a baseline.
5. Run existing AppShell and relevant Configuration layout tests before edits to classify pre-existing failures. The old test counts from earlier work are background, not proof about this baseline.

Acceptance: reviewed boundaries, reproducible before-state, and no ambiguity about ownership of dirty files.

## T1. Produce the clean background asset

Owner: primary agent. Dependency: T0. May run alongside T2/T3 in approved Mode A.
Exclusive product ownership: `frontend/src/assets/configuration-header.webp`.

1. Read and announce the image-generation skill when first applying it. Generate a clean bitmap matching the approved reference: sunlit interior material-study workbench, wood/stone samples, drawings and a small plant concentrated on the right, spacious warm light area on the left, no text or interface elements.
2. Inspect the generated image at useful resolution. Use the image-generation tool for any visual editing; use existing local encoding tools only for file-format/size optimization. Do not add project dependencies for compression.
3. Encode the approved composition as the local WebP asset. Record dimensions and byte size, and inspect the compressed file for banding, artifacts, and crop suitability.
4. Hand the asset path and image dimensions to the CSS owner. Keep intermediate generations and provenance/QA notes in the temporary directory; only the final intended image belongs in the frontend assets.

Acceptance: UI-free artwork that fits the approved scene, is suitable behind text, and meets the size target or has a documented quality-based exception.

## T2. Implement the Configuration shell hook and scoped styling

Owner in Mode A: one `frontend_implementer`. In Mode B: primary agent.
Dependency: T0 and the settled asset/class contract. Final art-direction checks require T1.
Exclusive owned files:

- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/configuration-shell.css` (new)
- `frontend/src/components/layout/AppShell.test.tsx`

1. Add the Configuration route marker without changing role checks, authentication, notifications, messaging, sidebar behavior, route elements, or the main/skip-link structure.
2. Paint the topbar/workspace background with the shared image, readable wash, and fade. Reconcile selector specificity and import order against existing role/shell styles using the new scoped stylesheet.
3. Preserve all flow dimensions and sticky offsets. Adjust crop/alignment at the existing sidebar and phone breakpoints; avoid a seam where the image passes from topbar to workspace.
4. Keep the sticky topbar opaque beneath its artwork, neutral fallback colors in place, and unchanged surface opacity where dense content needs it. Do not make editor fields transparent to show more of the image.
5. Add meaningful AppShell regression coverage for eligible routes and route transitions: index, item, reusable values, an unrelated destination, and return navigation. Assert the decorative hook does not add an accessible landmark/image or alter existing shell controls. Preserve current shell tests.
6. Report any required cross-boundary change before editing another file. The worker shares the worktree, must not revert others' changes, and must accommodate unrelated work.

Acceptance: the layer works on each route and state without changing content geometry, accessible shell behavior, or unrelated-page appearance.

## T3. Prepare rendered verification with representative sections

Owner in Mode A: an independent QA helper, limited to `/tmp/lisno-configuration-image-qa/`. In Mode B: primary agent.
Dependency: T0. May run alongside T1/T2 because it does not edit product files.

1. Adapt the existing synthetic harness to use the real AppShell, index, reusable-values page, and item workspace. Add representative valid fixtures for Overview, Mode, Recommendation & Exclusions, and Quality Parameters rather than relying only on the prior empty-section overview fixture.
2. Include loading, list/detail failure, read-only, long-title, temporary-item, and asset-failure scenarios. Allow account/notification menus and mobile navigation to be exercised using synthetic identity and notification data.
3. Support navigating between Configuration and an unrelated existing route in the same mounted shell, so marker cleanup and CSS isolation are observable.
4. Keep all API writes blocked. Unsaved-change checks can edit a local form and discard/cancel navigation without saving any real data. Use browser request interception for image failure; do not remove the asset from the worktree.
5. Preserve the exact before-state snapshot needed for comparisons and document fixture limits. Hand off the harness to the primary agent before final browser execution; do not modify it concurrently with active captures.

Acceptance: every required page/state can be rendered without customer data or backend mutation, and unexpected mock gaps are distinguishable from product errors.

## T4. Integrate and review

Owner: primary agent, with an independent `integrity_reviewer` in approved Mode A; equivalent inline review in Mode B.
Dependencies: T1/T2 finished and T3 handed off.

- Inspect the real asset behind every header and tune only the scoped styling. Check that the title remains the visual focus and image detail does not obscure controls.
- Review the route marker, role boundaries, loading/error rendering, CSS scope, resource loading, and cleanup when navigating away.
- Verify that no flow padding/heights, tab logic, mutation state, data mapping, permissions, vendor styles, or unrelated dirty paths changed.
- Review scroll behavior and containing blocks: dialogs, tooltips, notification/account menus, and sticky section commands must keep their previous placement and hit targets.
- Inspect meaningful tests and the complete final diff. Resolve confirmed findings within the original owner's files before final verification. Minor crop/wash refinements stay within the approved spec; material scope changes return to the appropriate approval boundary.

## T5. Verify the integrated result and hand off

Owner in Mode A: `verification_runner` for final automated checks, primary agent for browser QA and reconciliation. Mode B: primary agent performs both.
Dependency: T4 fixes completed. Do not treat tests run against concurrent edits as final evidence.

Run from `frontend/`:

```sh
npm test -- src/components/layout/AppShell.test.tsx
npm test -- src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeReusableValueCategories.test.tsx
npm test -- src/features/ai-estimator-knowledge/KnowledgeCatalogNotices.test.tsx src/features/ai-estimator-knowledge/useUnsavedKnowledgeGuard.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.test.tsx
npm run typecheck
npm run build
```

Broaden frontend tests only if the final shared-shell diff or a new regression warrants it. Do not silently weaken an assertion or attribute a failure to prior work without baseline evidence. Full backend/OCR/replica-set suites are unnecessary because no corresponding contracts change. There is no lint script.

Rendered verification:

| Matrix | Evidence |
| --- | --- |
| Index, all four item sections, reusable values | Inspect actual screenshots at 1440px and 390px, verify the same artwork and preserve header/content geometry. |
| 1920, 1024, 768, 320px | Check crop continuity, shell breakpoints, long labels, form/section content, overflow, and usable controls; record dimensions for the compact index. |
| Scrolled desktop/mobile | Topbar remains readable and sticky, body content does not bleed through it, section command bars and menus keep their positions. |
| Keyboard and overlays | Search/Filters tooltips, tab navigation, mobile section selector, visible focus, account/notifications, menu dismissal, Add/Edit dialog open/cancel, and local dirty-form navigation guard. |
| Loading/error/read-only and blocked image | Neutral fallback, no image-induced layout shift, accessible messages and working controls. |
| Route transitions | Compare unrelated route before/after Configuration; confirm no lingering image, route marker, or altered controls. |
| Text enlargement | Check 200% text-only enlargement without transforms; document the exact method and any native-browser limitations. |
| Accessibility and runtime | Settled-state axe plus visual contrast inspection; inspect console/network and separate intentional fixture/image failures from unexpected errors. |

Finish at repository root with `git diff --check` and `git status --short`. Compare against T0 snapshots and the approved ownership set. Record exact test counts, build results/warnings, image size, viewport/state results, screenshots, unrun checks, and remaining limitations in this plan. Stop temporary QA servers/browsers and retain their artifacts outside the repository. Do not stage, commit, push, deploy, seed, migrate, or mutate production.

## Execution-mode boundaries

- Do not spawn agents or begin implementation before the remaining task-plan approval and A/B selection gates are complete. The earlier Mode A selection applied to the previous compact-layout task.
- Mode A: T1 primary-owned asset work, T2 bounded frontend implementation, and T3 temporary QA preparation can proceed independently. Share contract changes immediately. T4 review precedes T5 final verification.
- Mode B: perform implementation, review, and verification sequentially in the primary thread without implementation subagents.

## Definition of done

The approved image treatment is visible across all Configuration screens, stays readable and compact at supported widths, survives section/route transitions and image failure, and preserves existing interaction and authorization behavior. Final integrated review, scoped tests, typecheck/build, rendered checks, asset inspection, and diff hygiene are complete with honest limitations recorded. No external action or unrelated implementation is included.

## Implementation and final evidence

Completed on 2026-09-25 in approved Mode A. T0–T5 are complete.

### Product result and ownership

- Added an exact-route marker and scoped CSS import in `frontend/src/components/layout/AppShell.tsx`, plus four regression cases in `AppShell.test.tsx`.
- Added `frontend/src/components/layout/configuration-shell.css`: one shared image coordinate across the existing topbar and workspace, a restrained readability wash, lower fade, mobile crop, and opaque sticky backing. No flow sizing, offsets, stacking contexts, transforms, or content logic changed.
- Added `frontend/src/assets/configuration-header.webp`: 2172 × 724 pixels, 92,336 bytes. No dependency or lockfile change.
- Independent integrity review found no confirmed defect. Exact route probes included trailing slash, unrelated routes, and false prefixes.
- Final T0 hash comparison preserved all 67 initially dirty paths except this task's two approved documents. The previous vendor, backend, mobile, compact index, and workspace implementation is unchanged.

### Automated verification

| Check | Result |
| --- | --- |
| Baseline AppShell/index/workspace/mode tests | 52/52 passed before product writes |
| Final AppShell tests | 15/15 passed |
| Final index/workspace/mode/reusable-category group | 45/45 passed, four files |
| Final catalog notices/unsaved guard/basket-quality group | 57/57 passed, three files |
| Final aggregate | 117 tests passed across eight files |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; 2,938 modules; emitted image 92.34 kB |
| `git diff --check` | Passed |

The build retains the existing warning for chunks larger than 500 kB. No new test warning or failure was observed. Product hashes remained unchanged through final verification.

Logs: `/tmp/lisno-configuration-image-qa/final-{shell-tests,layout-tests,workflow-tests,typecheck,build}.log`.

### Rendered verification

Used real frontend components and routes with synthetic GET/SSE fixtures in a loopback-only harness. All API writes were blocked; no writes were attempted. Screenshots and JSON evidence are in `/tmp/lisno-configuration-image-qa/`.

- **AC1:** Rendered and inspected the index, Overview, Mode, Recommendation & Exclusions, Quality Parameters, and reusable values at 1440px and 390px. All share the same artwork. Temporary-item and long-title states were also exercised.
- **AC2:** Exact frozen-before/live comparisons at 1440px and 320px matched every measured box for the index, workspace, reusable values, and unrelated Projects page. The simple basket header stays 45px on desktop. Ordinary cards measured 102.80px at 1920px; narrower cards with wrapped metadata measured 121.59px at 1440px. These dimensions match the prior layout.
- **AC3:** Checked 1920, 1440, 1024, 768, 390, and 320px widths, including long titles. No document horizontal overflow or visible image seam was found. A simulated 20px mobile safe-area inset produced matching 84px topbar/workspace boundaries and a −84px background offset.
- **AC3 text:** Doubled each Configuration content element's computed font size and numeric line height in one captured pass, without transforms or changed viewport scale. Index, workspace, and reusable values had no document overflow at 1440px and 320px; headings and controls remained readable. This is a CSS text-enlargement approximation, not a native Safari/Firefox text-zoom run.
- **AC4:** Verified Search/Filters accessible tooltips and filter expansion; keyboard ArrowRight/Home section navigation with selected/focused tabs; mobile section selection; account Escape/focus restoration; notifications and navigation drawers; Add/Edit basket opening/cancellation; dirty Overview edits followed by Stay and Discard route navigation. No save or notification-read mutation was sent.
- **AC4 scroll:** Desktop and mobile topbars stayed at y=0 with opaque backing. Dialogs and side panels remained above the artwork with usable controls.
- **AC5:** Checked initial loading, empty lists, list/detail/catalog failures, detail recovery, and read-only sections. All four read-only sections retained the image marker with zero enabled Save buttons. Blocking the image request preserved identical measured geometry and a usable neutral canvas.
- **AC6:** Same-mounted navigation out to Projects removed both the route marker and image; the settled topbar returned to its original rgb(250,249,245). Returning restored the Configuration artwork. Frozen-before/live unrelated-route geometry and appearance were unchanged.
- **AC7:** Axe WCAG A/AA checks reported zero violations for all six views at 1440px and 390px, plus the index at 320px. During verification, console output contained React development notices and the deliberately aborted image request; no unexpected API paths or application errors. Stopping the local Vite server during cleanup also produced the expected development-WebSocket disconnect.

Primary evidence:
- `geometry-comparison.json`: eight before/live pairs, all identical geometry.
- `views-accessibility.json`: twelve settled page/section checks.
- `desktop-interactions.json`, `unsaved-mobile-scroll.json`, `fallback-states.json`, `settled-states-text200.json`, `final-browser-checks.json`.
- `live-*.png`, `view-*.png`, `responsive-*.png`, `blocked-image.png`, `text200-*.png`, and overlay/state screenshots.

### Asset provenance

Tool: built-in `image_gen.imagegen`, generate mode. Generated a clean image from the approved scene description; the supplied UI screenshot was composition guidance. Converted the generated PNG with existing `cwebp -q 82 -m 6 -metadata none` for format compression only. Inspected both source and compressed output. No visual image-editing script or additional dependency was used.

Saved asset: [configuration-header.webp](../../../frontend/src/assets/configuration-header.webp).

Prompt:

> Create a clean photographic background asset for an interior-design configuration workspace. Use case: photorealistic-natural. One ultra-wide horizontal image, approximately 2400 x 800 pixels (3:1 composition). Warm, sunlit interior-design material-study workbench photographed naturally. The left 48 percent is a spacious, very light warm ivory plaster wall with soft diffuse light and almost no detail, providing calm negative space for dark interface headings that will be added separately. Across the RIGHT half only, a pale oak designer's worktable in front of leaning large wood veneer and pale limestone sample boards, several small stone and fabric samples, loosely rolled architectural drawings without readable text, and a small olive-green plant in a simple cream ceramic pot near the far right. The upper-right boards and right-side workbench should remain recognizable when the image is cropped to a shallow website header. Subtle warm daylight and gentle real shadows, soft neutral beige, ivory, pale oak and restrained natural green. Refined architectural editorial photography, realistic material texture, credible physical perspective, no dramatic contrast. The scene should feel light and airy, as in a premium interior design studio. Keep the left side uncluttered and the right-side objects visually balanced, with the table coming into the bottom-right edge. No people, no lettering, no logos, no watermarks, no computer or phone screens, no UI, no buttons, no cards, no border, no vignette. Deliver only the clean photographic artwork; the application will apply its own gentle readability wash and lower fade.

### Limits and external actions

Browser checks used Chromium and synthetic data, not a production backend or real device. The Mode fixture also exercises existing legacy configuration validation messages, and the temporary fixture has unavailable Main Line metadata; these fixture states are unrelated to the background and remain usable. Actual native safe-area hardware and native browser text zoom were not exercised. Full frontend/backend/OCR suites were not run because this change only paints the shared shell; focused tests, typecheck, build, and rendered checks cover its risks. There is no lint script.

No commits, staging, pushes, deployment, database changes, migration, seed, or customer-data mutation were performed. Temporary verification files remain outside the repository; build/cache artifacts are ignored. The temporary browser, Vite harness, and task-specific keep-awake process have been stopped. No known defect remains in the implemented background layer.
