# Startup artwork provenance

Prepared on 2026-10-19 for the approved realistic mobile splash revision. These are pre-rendered raster illustrations, animated by native image transforms rather than live 3D models.

## Source and fidelity

Source: the user's latest attached olive-green splash reference from 2026-10-19, passed directly to the built-in `image_gen.imagegen` tool through `num_last_images_to_include: 1` on each of four independent calls. `transparent_background` was `true` for every call. No CLI/API fallback, external stock imagery, or generated brand mark was used.

The tool reconstructed/extracted the four requested groups with matching subjects, arrangement, natural materials, perspective, and warm lighting. These are **not pixel-identical crops** of the flattened reference. The sofa retains its rug; the apartment and architectural tools retain their muted olive bases; the materials remain isolated with foliage. The original Lisno logo is not included in these assets and remains sourced from the repository's original vector geometry.

## Delivered assets and footprint

| File | Dimensions | PNG bytes | Decoded RGBA bytes |
| --- | --- | ---: | ---: |
| `interior.png` | 512 × 512 | 53,089 | 1,048,576 |
| `plan.png` | 512 × 512 | 77,101 | 1,048,576 |
| `materials.png` | 512 × 512 | 86,617 | 1,048,576 |
| `tools.png` | 512 × 512 | 72,486 | 1,048,576 |
| **Total** | | **289,293 (282.5 KiB)** | **4,194,304 (4 MiB)** |

All files have actual transparent alpha, no rectangular green backdrop, no reference branding, and no loading UI. The 512 px images are suitable for roughly 170 dp at 3× density. Runtime decode/GPU bookkeeping may use memory beyond the uncompressed pixel estimate above.

The built-in tool returned 1254 × 1254 RGBA PNGs. Existing repository `sharp` tooling resized them to 512 × 512 and encoded PNG with `compressionLevel: 9`, `palette: true`, `quality: 95`, `colours: 256`, and `dither: 0.3`. No subject repainting, synthetic SVG stand-ins, or background flattening occurred during optimization. Original outputs remain in the built-in tool's generated-images directory; only optimized production assets are bundled.

Output IDs: `interior`: `exec-1ab4426c-f15b-482f-a5e9-e83d09650a73.png`; `plan`: `exec-17f58db5-073f-496f-a3af-5f132b45a413.png`; `materials`: `exec-1c8767b1-a747-4edb-bd7e-ecc131ff6486.png`; `tools`: `exec-425c7314-8cdb-4a28-965d-99c5a273ce96.png`. Generation group: `01a1526b-d3c7-77c1-b1bb-c980cb916d9a`.

Temporary visual evidence: `/tmp/lisno-realistic-splash-qa/artwork/contact-sheet.png` displays all four optimized assets against the actual `#46552F` splash color. Detailed alpha/size measurements are in `asset-metrics.json` in the same temporary directory. Both are QA artifacts, not bundled assets.

## Exact prompt set

Each prompt consisted of the common prefix below, one group paragraph, and the common suffix. The calls were issued independently against the same user attachment.

### Common prefix

```text
Use case: background-extraction.
Asset type: one transparent image for a mobile application splash, pre-rendered realistic 3D artwork.
Input image: the latest user-attached olive Lisno splash is the EDIT TARGET, not merely loose inspiration.
```

### interior

```text
Extract only the TOP LEFT illustrated group: cream upholstered two-seat sofa with olive green cushions, warm cream-shade wooden floor lamp immediately on its right, leafy potted plant farther right, and oval natural rug under sofa and lamp. Preserve exactly the reference's furniture proportions, viewing angle, placement, natural textures, soft warm lighting, and intrinsic shadows. Retain the discrete muted olive backing shape if it is part of this group. Do not include any apartment, material samples, blueprint tools, brand mark, lettering, or loading UI.
```

### plan

```text
Extract only the TOP RIGHT illustrated group: isometric furnished apartment cutaway with cream walls, wood floors, bedroom at upper left, bathroom at upper right, kitchen/living furnishings and potted foliage. Preserve exactly the reference's diagonal isometric camera angle, apartment wall outline, room arrangement, materials, soft warm lighting, and intrinsic shadows. Retain its discrete muted olive backing slab. Do not include any sofa group outside the apartment, material sample group, blueprint tools group, brand mark, lettering, or loading UI.
```

### materials

```text
Extract only the BOTTOM LEFT illustrated group: overlapping upright material sample boards, a tall warm wood-grain board behind, white marble slab with fine gray veins, tan stone tile in front left, textured olive green sample in front right, and the leafy green plant behind them. Preserve exactly the reference's stacking, dimensions, viewing angle, natural textures, soft warm lighting, and intrinsic shadows. Retain its discrete muted olive backing slab. Do not include any sofa group, apartment, blueprint tools, brand mark, lettering, or loading UI.
```

### tools

```text
Extract only the BOTTOM RIGHT illustrated group: cream rolled architectural blueprint with subtle plan lines, upright wooden measuring ruler to its left, wooden triangular set square in front lower right, and green leaves behind on the right. Preserve exactly the reference's arrangement, perspective, natural textures, soft warm lighting, and intrinsic shadows. Retain its discrete muted olive backing slab. Do not include any sofa group, apartment, sample boards, brand mark, lettering, or loading UI.
```

### Common suffix

```text
Change only the extraction and canvas: isolate this complete group faithfully on a genuinely transparent alpha background. Remove the continuous green page background entirely, with no rectangular green backdrop and no extra design. Keep original objects and their realistic details, no simplified icons or line drawings. Keep the complete objects with a small even transparent margin, centered in a square 1024 x 1024 canvas suitable for rotation. Do not add text, logos, watermarks, borders, labels, invented objects, or a drop shadow beyond the group's existing natural intrinsic shadow. This output must contain only this one group.
```
