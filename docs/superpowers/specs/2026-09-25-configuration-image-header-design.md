# Configuration: shared image background at the top

Date: 2026-09-25
Status: Approved, implemented, and verified in Mode A. Final evidence and limitations are recorded in the [task plan](../plans/2026-09-25-configuration-image-header.md).
Classification: Substantial frontend presentation change because it spans the shared shell and all Configuration destinations.

## Goal

Add the interior-design image treatment shown in the user's latest reference to the top of Configuration and its Overview, Mode, Recommendation & Exclusions, and Quality Parameters screens. Place the image behind the existing interface, keeping the recently approved compact layout and all current interactions.

## Current behavior and evidence

- `frontend/src/app/router.tsx` defines three Configuration destinations: `/admin/configuration/estimation`, `/admin/configuration/estimation/items/:itemId`, and `/admin/configuration/estimation/reusable-values`.
- `KnowledgeBaseIndexPage.tsx` renders the compact index. `knowledge-index.css` currently gives ordinary basket headers a 45px minimum with zero vertical padding, 44px action targets, and compact item cards. These user-approved density refinements must remain intact.
- `KnowledgeItemWorkspacePage.tsx` owns the item header and all four requested sections. `knowledgeWorkspaceSections.ts` identifies them as `overview`, `mode`, `recommendations`, and `quality`. Switching sections does not require four separate page-header implementations.
- `KnowledgeReusableValuesPage.tsx` is another Configuration destination. It uses the same shell and shared page-header/notice components.
- `AppShell.tsx` owns the topbar and workspace. `common-shell.css` places a 240px sidebar beside the content on desktop, hides that rail at 1024px and below, and uses a sticky 72px topbar, reduced to 64px on small phones. The workspace and topbar currently use plain backgrounds.
- `WorkspaceTopbar.tsx` provides notifications, account controls, and mobile navigation. It does not provide the global search box pictured in the reference.
- Existing `vendor-directory-header.webp` and `vendor-drawer-header.webp` assets were inspected. They show a console/plant scene and a chair composition, respectively; neither contains the material-sample workbench in the supplied reference. No standalone, clean source image for that workbench was found in the frontend assets.
- The worktree already contains unrelated vendor, backend, mobile, and Configuration work. Shared-shell files are currently clean; the compact index files include prior uncommitted work that must be preserved.

## Scope and assumptions

The reference requests the background image layer, not a reconstruction of the entire screenshot. The visual treatment covers the Configuration index, the common header above all four item sections, and reusable values for consistency within Configuration. Dialogs and side panels continue to use their existing surfaces over that background.

Assume the user wants a clean image matching the reference's scene and composition, rather than displaying the screenshot itself. Produce a UI-free bitmap showing a warm, sunlit interior-design workbench: wood and stone sample boards, drawings/material samples, and a small plant on the right. Leave a quiet light area on the left for headings. The supplied screenshot guides composition; it is not used as a page background with its text and controls baked in.

Non-goals: changing card thumbnails or metadata, adding a global search feature, restyling typography or controls, changing the notice wording, adding a tall hero section, adding motion/3D/parallax, changing sidebar artwork, or changing any API, permissions, workflow, data, or storage contract.

## Recommended visual and integration approach

Use one local optimized image with Configuration-specific shell background styling. A route marker on the existing shell limits the treatment to the three known Configuration destinations. Apply the same artwork and coordinated crop to the topbar/content header area so it reads as one visual layer, with a neutral wash behind text and a gradual fade into the existing page canvas below.

This shell-level approach is preferred because it reaches the index, all four item sections, reusable values, and their loading/error states. A page-header-only background would be simpler but would leave the topbar detached from the reference and risk inconsistent treatment when pages render early loading/error returns. Separate copies inside each section are unnecessary because the sections already share their header.

Keep the image as a background composition rather than a flow element that reserves additional height. Preserve the topbar's opaque backing and sticky behavior so scrolling content cannot show through account/notification controls. Prefer CSS backgrounds without new overlay stacking contexts; if a decorative element is required, it must be non-interactive and hidden from accessibility APIs. Do not add transforms, filters, or overflow clipping to shell ancestors that change fixed dialog positioning or cut off menus.

## Requirements

1. Show the same image treatment on the index and while each of Overview, Mode, Recommendation & Exclusions, and Quality Parameters is selected. Reusable values inherits the same treatment. Switching sections must not restart an animation or flash a different image.
2. Match the reference's light, warm material-study scene. Concentrate visual detail on the right, keep the left text zone quiet, and blend the image into the page canvas before it competes with dense cards or form content. Start with a roughly 320–380px desktop region including the topbar; adjust the crop and fade from rendered evidence without increasing content offsets.
3. On mobile, retain a subdued image at the top, use a shallower approximately 220–280px region, and favor readability over showing every prop. Account for the existing mobile topbar and safe-area spacing. Do not enlarge the header just to fit the artwork.
4. Preserve index card/header measurements, the 45px compact basket header, icon-only Search/Filters, visible filter count, 44px action targets, and all previous spacing changes. Preserve item-workspace section navigation and content positions.
5. Keep text and interactive controls readable over the brightest and darkest image areas. Retain opaque form/card/dialog surfaces where needed; maintain focus indicators and existing accessible names. Decorative imagery must create no extra tab stop or screen-reader announcement.
6. Keep the asset local, compressed, and cacheable. Target a wide approximately 2000–2400px WebP at no more than 300KB where visual quality permits; document any justified size exception. No runtime third-party image requests, new image-loading library, font, or dependency. Do not reserve layout height based on image loading.
7. If the image is missing or blocked, render a neutral background with readable controls and unchanged geometry. The page must remain fully usable.
8. Scope styles to the route marker. Dashboard, projects, procurement/vendor pages, messaging, and other roles' unrelated routes retain their current chrome. Remove the marker and backdrop when navigating away from Configuration. Existing authorization remains authoritative.
9. Treat the background as presentation only: no query invalidation changes, backend writes, permissions changes, unsaved-change behavior changes, section state changes, or navigation semantics changes. Keep authenticated notification/account menus and mobile navigation operable.

## Likely affected areas

- `frontend/src/components/layout/AppShell.tsx`: Configuration route marker, reusing established pathname matching.
- A narrowly scoped Configuration shell stylesheet, loaded through the established shell styling boundary.
- A new optimized asset under `frontend/src/assets/`.
- Focused shell/route regression coverage plus existing Configuration regression checks.

Shared PageHeader, editor business logic, backend, mobile app, and existing vendor imagery do not require modification. Exact file ownership and dependency-ordered work will be defined in the separate task plan after this specification is approved.

## State, compatibility, and failure behavior

Route location determines backdrop eligibility; item tabs do not independently toggle the background. An authorized Configuration route receives the same treatment whether its content is loading, empty, failed, read-only, or ready. Existing route guards still decide access. Image fetch/decode failure falls back to the neutral canvas without affecting those states.

No persistent state, API schema, migration, seed, or external service is involved. Rollback consists of removing the scoped route styling/marker and asset reference; previous page layout and behavior remain available. Do not deploy, commit, push, or mutate real Configuration records under this task.

## Risks and mitigations

- Busy artwork can lower contrast: control left/right crop and wash opacity using actual desktop/mobile screenshots and accessibility checks.
- A duplicated or misaligned crop can create a seam at the topbar: validate continuity at desktop, sidebar breakpoint, small-phone, and scrolled states. Keep the sticky bar's solid backing.
- Broad selectors can affect unrelated pages: use explicit route scoping and test navigation into/out of Configuration.
- A decorative element can intercept clicks or change overlay layering: favor background painting; explicitly verify menus, tooltips, dialogs, sticky section commands, and mobile navigation.
- Asset dimensions can add network cost or layout shifts: use one optimized local image and paint it without flow-sized markup.
- The original workbench photograph is unavailable: generate a clean image matching the reference's art direction; do not imply that it is the exact source photograph.

## Acceptance criteria and verification

| ID | Required evidence |
| --- | --- |
| AC1 | Rendered screenshots show the shared image on the index, all four named item sections, and reusable values. |
| AC2 | Artwork is right-weighted, gently blended, and readable behind the existing header; compact content positions and the 45px simple basket header do not expand. |
| AC3 | Desktop 1920/1440px, tablet 1024/768px, and mobile 390/320px have no new overflow, blocked controls, unreadable text, or unintended crop seams. Include a 200% text-enlargement check with its method recorded. |
| AC4 | Keyboard navigation, icon tooltips, section selection/unsaved-change handling, notifications/account menus, sticky controls, and dialogs remain operable; decorative imagery adds no accessible content. |
| AC5 | Loading/error/read-only states and an intentionally blocked image remain readable; no image-induced content shift. |
| AC6 | An unrelated route before/after Configuration navigation retains its original topbar/workspace appearance and has no lingering backdrop. |
| AC7 | Focused shell and affected Configuration tests, frontend typecheck/build, and repository diff hygiene pass, with actual results and any pre-existing failures recorded. No unrelated work is overwritten. |

Use actual components with synthetic data for rendered checks; no production mutations or customer data. Extend the existing temporary QA harness only where needed to exercise all four sections, not just the overview placeholder. Keep QA artifacts outside the repository. Full backend/OCR suites are unnecessary for this presentation-only work; choose frontend regression breadth according to the final shared-shell diff. There is no lint script.

## Open decisions

No blocking product question remains: the specification proposes one consistent backdrop across Configuration, including reusable values, using new clean artwork matching the screenshot. Approval confirms that scope and image direction. Asset generation and implementation begin only after the remaining repository workflow gates are satisfied.
