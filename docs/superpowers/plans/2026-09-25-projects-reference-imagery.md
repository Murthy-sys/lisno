# Projects reference imagery correction: plan

Date: 2026-09-25. Completed and verified under user's explicit approval waiver; Mode A.
Specification: [Reference imagery correction](../specs/2026-09-25-projects-reference-imagery-design.md).

Single parent task: correct the reference imagery mismatch.

1. Root: capture current dirty hashes/three UI snapshots under `/tmp/lisno-projects-imagery-qa`; inspect reference differences. Complete.
2. Root: generate and inspect wide living-room artwork with built-in imagegen; compress into `frontend/src/assets/projects-living-room.webp`, update provenance. Independent of UI structure work.
3. UI owner: `AdminProjectsPage.tsx`, `admin-project-grid.css`, narrow corresponding test adjustment. Wrap header and toolbar in one backdrop, match composition/title/image proportions, preserve compact card rows and all functional contracts. Use final asset path agreed above; no shell/backend edits.
4. Root: integrate asset/UI, render synthetic one-project and full-grid states at desktop/mobile; inspect actual images; check focus, filters, overflow, contrast and image loading. Fix confirmed issues.
5. Read-only review and focused final verification after writers finish: page tests, typecheck/build, browser checks and `git diff --check`; preserve all baseline dirty paths outside ownership.

No new behavior tests for purely visual CSS; adapt the existing image expectation only when its asset filename changes. Existing page interaction tests protect functional controls. No staging, commit, push, deployment or customer-data writes.

## Asset provenance and prompt

Generated with the built-in `image_gen` tool on 2026-09-25. Source PNG: `/Users/apple/.codex/generated_images/01a0d4b6-536b-7632-a30a-4efd90718efd/exec-ee6dd76f-9a6f-4d94-8663-8d4454f612c3.png`. Original retained. Final project asset: [projects-living-room.webp](../../../frontend/src/assets/projects-living-room.webp), 2172×724 pixels, 233,244 bytes. Compressed with existing `cwebp -q 84`; no new dependency, raster compositing or screenshot extraction. Header and cards share one cached decorative asset; it is not presented as a customer-supplied project photo.

Exact generation prompt:

```text
Use case: photorealistic-natural. Asset type: decorative photograph for an interior-design project administration website, used both as a wide header background and cropped project-card cover. Generate one high-resolution panoramic architectural interior photograph, aspect ratio 3:1, approximately 2400 by 800. Match this scene precisely in spirit: a spacious warm contemporary living room with a large cream-colored low sectional sofa with cream and muted sage cushions across the central area, round pale oak coffee table in front, large curved arch window with sheer beige curtains behind the sofa, warm vertical oak slat paneling, pale limestone plaster walls, full leafy indoor plants in matte cream ceramic pots, understated framed abstract art. Main sofa, arch and plants should form a complete balanced room composition in the central two-thirds so a center crop to 2:1 still shows the sofa and table clearly. View from across the room at seated eye level, architectural real-estate photography with straight verticals and natural proportions. Bright soft daylight, pale ivory and warm oak materials, green leaves, subtle realistic shadows and fabric texture, elegant but lived-in. Show the sofa seat, coffee table, rug and some floor; not just the upper wall. Frame horizontally with a little neutral wall breathing room left, but do not waste half the image on a blank wall. Do not use a single green armchair as the main subject. No people, no text, no UI, no logos, no watermarks, no collage, no borders, no vignette or white fade; the application will add its own text wash.
```

## Implementation and rendered evidence

The previous boxed header boundary is removed. The same image now paints behind the heading and toolbar. Desktop image is positioned at right bottom at 75% width, allowing the complete sofa and table to remain visible; narrower layouts use height-based/cover sizing with a stronger wash. Header title is the existing Poppins interface font at 32px desktop and 28px phone. Cards show a centered 2:1 room crop with top status pills. All prior compact metadata rows, estimate source, query behavior, permissions and detail actions are unchanged.

Root inspected desktop one-project, desktop eight-project, and phone screenshots from actual components with synthetic data. No real data writes. Six-width browser checks at 1920, 1440, 1024, 768, 390 and 320px each confirmed:

- Heading/toolbar in one continuous backdrop.
- Image loaded at natural dimensions and rendered at 2:1 in cards.
- No horizontal page overflow.
- Zero axe WCAG A/AA violations.
- Readable title and controls. Header height: 228px desktop, 282px at768, 334px at390, 384px at320 as controls wrap.

Search from the moved toolbar returned the expected project and list switching still worked. No unmocked requests occurred. Evidence lives in `/tmp/lisno-projects-imagery-qa/browser-final.log`, `projects-reference-match.png`, `one-project-<width>.png`, and `grid-1440.png`.

Independent scoped review passed: only the three owned UI/test files and new decorative asset changed; handlers, query/permission/cost logic and backend are untouched. All other initial dirty paths remain intact.

## Final automated verification and handoff

From `frontend/`, all commands exited zero:

```sh
npm test -- src/features/admin/AdminProjectsPage.test.tsx
npm run typecheck
npm run build
```

18/18 tests passed. Build transformed 2,940 modules in 8.51 seconds. Existing Vite >500 kB chunk warning remains. Final logs: `/tmp/lisno-projects-imagery-qa/final-page-tests.log`, `final-typecheck.log`, `final-build.log`. Four product-file hashes remained unchanged throughout final verification (`final-hashes-before.log`, `final-hashes-after.log`). Final diff hygiene passed. No lint script exists.

Browser console had zero errors and warnings; all expected assets loaded. The previous JPG is retained for unrelated uses. Final preview: `/tmp/lisno-projects-imagery-qa/projects-reference-match.png`. This asset is a new generated interpretation of the reference interior, not the original reference photograph.

No backend/full-suite/OCR checks were run for this visual-only correction. Browser checks used synthetic data in Chromium rather than real production records or physical devices. No dependencies, backend contract changes, migrations, production writes, commit or deployment occurred. Temporary preview browser/server were stopped and their generated logs moved outside the repository. No known unresolved defect remains in this change.
