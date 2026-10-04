# Estimator collapsed Main Basket header alignment: task plan

Date: 2026-10-03  
Status: Approved and implemented in Mode A  
Approved specification: [estimator-collapsed-basket-header-design.md](../specs/2026-10-03-estimator-collapsed-basket-header-design.md)

## Implementation boundary

This is one localized CSS fix in `frontend/src/styles/estimator-dashboard.css`. The stylesheet already has uncommitted recommendation-alert work; capture its current diff before editing and preserve it. The primary implementer owns the header selectors and integration. No markup, state, API, dependency, migration, or financial calculation changes are planned. No independent implementation slice warrants a parallel writer.

## Dependency-ordered tasks

1. **Protect the baseline.** Record `git status --short` and the current stylesheet diff. Recheck the base `::before` rules, the later five-column rule, and the phone breakpoint. This establishes the exact selector conflict and protects the existing uncommitted work.
2. **Correct the header CSS.** In the Main Basket toggle rules only, remove or neutralize the legacy plus/minus pseudo-element for both `aria-expanded` states at sufficient specificity. Preserve the SVG basket icon, name, count, subtotal, chevron, full-width button, and focus styling. Add name-column containment only if the rendered long-name check shows it is needed.
3. **Verify rendered behavior.** At desktop and 390 px, inspect collapsed and expanded headers, including a long name. Check computed `::before` content, visible item order, chevron position, subtotal visibility, and horizontal overflow. Exercise pointer and keyboard toggling and confirm `aria-expanded` and content visibility. Capture screenshots and check browser console errors.
4. **Run focused checks and review.** Run frontend typecheck and build, `git diff --check`, and `git status --short`. Review the final stylesheet diff against the baseline and confirm no unrelated paths or recommendation styles were changed. Report any unavailable runtime check honestly.

## Acceptance mapping

- Specification AC1: tasks 2 and 3 verify the five intended children and absence of the legacy glyph.
- Specification AC2: tasks 2 and 3 verify expanded alignment and pointer/keyboard disclosure behavior.
- Specification AC3: task 3 verifies desktop and phone width, long-name wrapping, visible amounts, and no horizontal overflow.
- Specification AC4: tasks 3 and 4 provide rendered evidence, focused checks, diff hygiene, and a dirty-path review.

## Ownership and parallelism

The CSS edit is a single, shared target, so implementation stays with one owner. Read-only rendered review may run after the edit, but concurrent writers would add conflict risk without saving meaningful time. Final verification runs on the integrated worktree. No commit, push, deployment, or production action is included.

## Verification record

- Removed the obsolete Main Basket toggle pseudo-element rules and contained long names in their grid column. Existing recommendation CSS was preserved.
- Rendered the synthetic Estimator builder at desktop and 390 px. Expanded and collapsed headers had `::before` content `none`, aligned SVG chevrons and visible subtotals; the 390 px document had no horizontal overflow, including with a deliberately long unbroken name.
- Pointer, Space, and Enter toggles updated `aria-expanded` and controlled content visibility. The synthetic page reported no application errors, unexpected API requests, or browser console errors.
- `npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx`: 7 passed. `npm run typecheck`: passed. `npm run build`: passed with a pre-existing chunk-size warning. `git diff --check`: passed.
