# Mobile typography and content spacing

Status: approved and implemented in Mode A. Local checks passed; native-device and release-build validation remain unperformed. Results and limitations are recorded in the [task plan](../plans/2026-10-16-mobile-content-density.md).

## Goal and scope

Fit more useful content on mobile screens by reducing oversized headings, excessive padding, and repeated gaps while retaining readable text, clear hierarchy, and usable controls.

Assumption: this request applies to the mobile app's content workspaces, with Configuration as the first reference screen. Apply a consistent scale through shared primitives and align oversized local overrides in Dashboard, Projects, Procurement, estimates, generic workspace/detail views, and supporting list/settings screens. Existing compact Configuration editors provide the lower-density-size reference; their small text should not be reduced further.

## Current behavior and evidence

- The worktree is clean at this inspection. Target-file diffs are empty.
- `mobile/src/ui/tokens.ts` defines page titles at 24/30, section titles at 18/25, body text at 14/21, and metadata at 12/18 (font size/line height in React Native layout units).
- `mobile/src/ui/primitives.tsx` gives shared screens 20 horizontal padding, 24 vertical padding and section gaps. Default fields use 16-unit text and a 52-unit minimum height; default buttons also have a 52-unit minimum height. Existing compact fields/buttons already use a 44-unit minimum.
- Local overrides bypass the shared scale: Configuration catalog title 25/33, Projects title 32/38, Project detail title 28/34, Procurement title 27/36, and Dashboard title 36/38. Updating shared tokens alone will leave those screens oversized.
- `knowledgeUi.tsx` already provides compact detail styles: 12-unit screen padding, 8–10-unit gaps, 12-unit body text, 14-unit section titles, and 44-unit controls. `KnowledgeItemWorkspace.tsx` uses a 20/27 title and still smaller metadata/tab labels. These must not receive a blanket font reduction.
- Several shared workspace/detail/list containers use 20-unit padding and 24-unit gaps. Projects and Dashboard also reserve space for artwork and headers, so reducing title text alone may not recover meaningful content space.

The observations above are the pre-change source audit. Rendered before/after evidence was collected during implementation using synthetic data and is recorded in the task plan.

## Recommended behavior

Use one compact content scale with explicit exceptions for existing dense editors. Retain existing font families, colors, artwork, information order, and interaction patterns.

| Element | Target at normal system text size |
| --- | --- |
| Standard page title | 20/26; up to 22/28 for illustrated workspace headers |
| Section heading | 16/22 |
| Card/row heading | 14/20 |
| Body copy and input values | 14/20; retain established 12–13-unit dense-editor text |
| Field labels and ordinary button labels | 13/18; existing compact 12-unit labels remain |
| Metadata/helper text | 12/17; do not shrink existing smaller labels |
| Prominent dashboard metric | 22–24, retaining complete values and units |
| Page inset | 12–16, according to the existing screen layout |
| Section gap | 12–16 |
| Panel padding / related-field gap | 10–12 / 6–8 |
| Default input/button minimum height | 48; preserve existing compact 44-unit controls |

1. Extend existing shared typography and primitives. Use content-specific spacing where necessary; do not globally shrink `spacing` constants used by safe areas, navigation, modals, or artwork.
2. Align local content-title and spacing overrides with the scale. Preserve established display font families where used; reduce their size and excess header allocation. Keep images in proportion and important content clear of artwork.
3. Reduce redundant vertical gaps around headings, descriptions, filters, and repeated panels. Pair short related fields only where the existing layout supports it; wrap to one column when width or larger text requires it. Do not rearrange workflows or add new disclosures solely to meet a density target.
4. Preserve existing compact Configuration body/input sizes and accessible tab controls. Focus its changes on the catalog header and avoid double-reducing the item editor. Preserve all six tabs and save/discard/conflict behavior.
5. Preserve font scaling. Use minimum heights and wrapping rather than fixed heights that clip enlarged text. Keep interactive areas at least their existing 44-unit minimum; avoid overlapping hit areas.
6. Keep full financial amounts, units, errors, selections, and primary actions readable. Do not truncate critical values or remove explanatory content to appear more compact. Do not change amount formatting or the recently added render recovery behavior.

The credible alternatives are a shared-scale pass with targeted overrides (recommended for consistency), or a Configuration-only pass (smaller impact but leaves the other observed oversized workspaces unchanged). This specification assumes the shared-scale approach; no new density setting or user preference is needed.

## Non-goals and invariants

- No font replacement, dependency, visual rebranding, new animation, navigation redesign, or changes to splash/onboarding artwork.
- No redesign of chat message typography, document/PDF content, charts' underlying data, or generated/shared documents. Ordinary list headings may use the new content scale; icon glyph and avatar sizes are not typography defects.
- Existing shared controls may inherit compact defaults on authentication/supporting screens; verify their usability. Do not restyle authentication or onboarding hero typography.
- Preserve authorization, data fetching, query keys, calculations, API contracts, persistence, and all save/mutation behavior. No migration is needed.
- No production mutation, deployment, commit, or release installation is included.

## Acceptance criteria and verification

1. Shared content typography and targeted local overrides follow the documented hierarchy. No blanket multiplier reduces all text or spacing, and existing compact Configuration text is not made smaller.
2. Before/after synthetic renders at 390×844 show measurably less space consumed by headers and repeated gaps on Configuration catalog and Projects, with the same content/actions retained. Record measured differences instead of claiming an unmeasured density improvement.
3. Inspect Configuration catalog and detail (including Mode and Design), Projects list/detail, Dashboard, Procurement, and a shared form/list. At 320 and 390-unit phone widths, long labels and unequal financial values remain readable, all controls are reachable, and no horizontal clipping occurs. Check a 768-unit layout to preserve tablet behavior.
4. Check representative forms, Configuration tabs, and actions with enlarged system text (at least 1.5×). Allow content to grow/scroll; preserve accessible names, selected/disabled states, and usable touch targets.
5. Run focused existing UI tests for affected surfaces, including the Configuration crash regression and recovery integration. Add interaction regression coverage only for an actual behavioral risk; do not add tests that merely repeat style constants. Run mobile typecheck, Android JS export, and `git diff --check`.
6. Inspect the running Android app when practical. Distinguish native verification from React Native Web previews and renderer tests. State any device/build gap explicitly.

## Risks, rollback, and open decisions

Shared styles can affect many screens; local title overrides and existing compact variants require explicit reconciliation. Enlarged text can wrap buttons and long money values, and artwork may collide with shorter headers. Control these risks through scoped changes and rendered checks before broadening the change.

Rollback is limited to the presentation files changed by this work. No data transformation or migration is involved. Approval stages are complete and no blocking product decision remains.
