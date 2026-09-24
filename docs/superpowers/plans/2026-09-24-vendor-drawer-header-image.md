# Vendor drawer header image: task plan

Date: 2026-09-24
Status: Approved and complete in Mode A. Artwork integrated, scoped review clear, automated and rendered checks passed.
Source of truth: [Approved specification](../specs/2026-09-24-vendor-drawer-header-image-design.md).

## Scope and ownership

Small presentation-only correction: add the reference's cream chair, olive arch, timber slats, lamp and plants to the vendor drawer header. Preserve all vendor fields, behavior, existing dirty work and other panels. No dependencies, backend/mobile work, deployment or commits.

Primary owns integration, documents and final verification. Asset ownership is limited to one new decorative header asset under `frontend/src/assets/`. Styling ownership is limited to the vendor header selectors in `frontend/src/features/procurement/vendorProcurement.css`. Prefer the existing header pseudo-elements so no component API or form markup change is needed. Do not change shared `shell.css`, `Drawer` or `ContextPanel` behavior.

## Ordered tasks

1. **Capture baseline.** Save current status, the target CSS diff and target file copy under `/tmp/lisno-vendor-header-image-qa/`. Confirm current vendor header markup and styles before editing. Acceptance: preserve unrelated and pre-existing work.
2. **Prepare artwork.** Use the image-generation skill/tool to recreate the reference's decorative furniture composition without text or controls. Save an optimized local asset, inspect it, and target at most 150 KB at sufficient resolution for the compact header. Acceptance: spec AC1; visually recognizable chair/olive/slat/lamp/plant composition.
3. **Integrate header.** Replace the vendor header's CSS-only motif with the local image. Reserve room for copy and the close button; preserve dynamic Vendor details name/code. Adapt artwork sizing and hide it where narrow width cannot accommodate it. Keep decoration non-interactive and excluded from accessibility content. Acceptance: AC1–AC3; no form or shared-panel changes.
4. **Review and verify.** Inspect the scoped diff, then render Add vendor and Vendor details at 1440px, 768px and 390px, including long details text and light/dark appearance. Check overlap, overflow, close-button keyboard focus and image loading. Spot-check another contextual panel to confirm it is unchanged. Run the commands below. Acceptance: AC2–AC4.
5. **Handoff.** Record exact results and any limits, stop only task-owned temporary processes, and keep QA artifacts outside the repository. Do not stage, commit, deploy or mutate live vendor records.

## Parallelism

Task 3 follows the completed asset. In Mode A, an independent read-only reviewer can inspect current header constraints and prepare the rendered-check approach while the primary prepares artwork; assign no shared-file writers. Review and final verification follow integration. In Mode B, perform these small tasks inline. Only one parent task is in progress at a time.

## Verification commands

From `frontend/`:

```sh
npm test -- src/features/procurement/ProcurementVendorProfile.test.tsx src/features/procurement/VendorProcurement.test.tsx src/components/ui/ContextPanel.test.tsx src/components/ui/Drawer.test.tsx
npm run typecheck
npm run build
```

From repository root:

```sh
git diff --check
git status --short
```

Reuse the existing tests; no new behavior tests are necessary for a decorative image. Rendered checks use synthetic fixtures and must not save real vendor data. No full unrelated suites or lint claim are required.

## Implementation and verification evidence

- New artwork: `frontend/src/assets/vendor-drawer-header.webp`, 1086 × 362 with transparency, 83,710 bytes. Generated with the built-in image tool, then resized/compressed using existing `cwebp`; no dependency added.
- CSS: only vendor header selectors in `vendorProcurement.css`. Copy has reserved space, the close button remains 44 × 44px, and artwork hides at widths ≤767px. Shared drawer markup, vendor editor logic and `shell.css` remain byte-identical to the captured baseline.
- Final user refinement: artwork opacity is 0.3 for a subtle background appearance. A subsequent rendered check confirmed image opacity 0.3, title/close opacity 1, no overflow and zero header axe violations (`opacity-check.log`, `final-soft-header.png`). This opacity-only adjustment followed the passing automated suite and was checked visually without repeating unrelated tests.
- Actual `ProcurementVendorEditor` rendered with read-only synthetic transport: Add vendor and long-name Vendor details each checked at 1440px, 768px and 390px. All six states had zero document/drawer overflow, zero title/art/close overlap, zero scoped header axe violations and no application errors or API writes. Artwork visible on desktop/tablet and hidden on narrow mobile.
- Keyboard close and return focus passed. Another contextual panel retained its original header motif. Emulated dark OS preference remained legible with zero header axe violations; the product currently has no distinct dark-theme switch or dark stylesheet.
- Evidence, screenshots, baseline, browser transcript and relocated temporary harness: `/tmp/lisno-vendor-header-image-qa/`. Task browser and Vite server stopped. No live data, deployment, migration, staging or commit.
- Final automated checks: the four-test-file command above passed **71/71 tests**; frontend `npm run typecheck`, `npm run build`, and root `git diff --check` each exited 0. Exact commands and results are in `verification-report.md` in the QA directory. The existing Vite warning about chunks larger than 500 KB remains; no new test or typecheck warnings. No unrelated full suite or lint command was run.

### Final artwork prompt

Built-in image-generation mode, new decorative asset:

```text
Use case: product-mockup. Asset type: a small decorative website drawer-header artwork, not a UI mockup. Create a single photorealistic interior-design vignette, panoramic approximately 3:1 aspect ratio, on a genuinely transparent alpha background. Composition: a sculptural cream upholstered barrel lounge chair centered in front of a muted olive-green semicircular/arched wall panel; to the right of the chair a short section of vertical natural oak slats with dark narrow gaps, and a small light oak side table with an ivory ceramic table lamp; a few tasteful green leaves at the far right. On the left, a slim potted olive plant and a low round oak table with two cream books. Arrangement resembles a premium calm interior design studio. Keep the entire composition compact and low, with the olive arch rising behind the chair and the slats. Crop the top of the arch/slats slightly for a banner composition, while keeping the chair, table and lamp recognizable. Natural soft daylight, warm neutral materials, high quality furniture detail, restrained shadows under the objects only. Outside the isolated arrangement must be true transparency, no room background, no surrounding rectangular wall or sky. No text, no letters, no logos, no border, no UI controls, no watermark. It will be displayed at about 350px wide by 110px tall at the top-right of an Add vendor drawer, so prioritize a clear chair silhouette, plant, arch, wood slats and lamp.
```
