# Move existing In-house configuration into a component

## Goal and current evidence
The user's latest clarification supersedes prior copy-and-manual-removal behavior. Use existing configuration currently copies costs and scope but leaves the original visible even after Save. The original should be moved into the selected component automatically.

## Contract
Use existing configuration, dragging the reserved existing source, and its destination picker must perform one pending Mode update that replaces the target's inclusions/exclusions/Labour/Material and removes only the reserved source. Preserve the target ID and basket references, all siblings and unrelated Mode fields. Ordinary component-to-component copy retains its source. Display accurate move/copy guidance, focus and expand the target, clear deleted-source/replaced-target editor state, and use existing Save/Discard/CAS behavior. A failed save retains the pending move for retry; Discard restores both original and destination; conflict Keep editing preserves deletion while retaining unrelated remote additions. Invalid/stale/read-only operations must not remove the source. Explicit arrays prevent old root configuration from reappearing on reload. No background deduplication or automatic deletion on page load.

## Scope and validation
One frontend runtime component plus focused tests and these documents. No shared API/schema/calculation/dependency changes. Existing backend supports source deletion; selected IDs are never remapped automatically. Verify the click, drag and picker paths, exact target overwrite, source disappearance, ordinary-copy behavior, save/reload, failure/retry, Discard, conflict, raw-input guards and read-only access. Use isolated synthetic browser data; no production mutations or deployment. Preserve prior dirty files through a fresh snapshot and hash-checked delivery.
