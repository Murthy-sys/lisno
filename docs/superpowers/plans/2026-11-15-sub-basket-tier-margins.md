# Sub-Basket tier margins task plan

Date: 2026-11-15
Status: Complete; revised plan approved and executed in Mode A
Approved specification: [Compact Sub-Basket tier row](../specs/2026-11-15-sub-basket-tier-margins-design.md).
The user approved the revised specification after confirming “Only tier names; click to view margins.” Earlier tier-query work remains implemented; this plan covers the remaining presentation change. The user approved the revised plan and selected execution Mode A.

## Outcome and boundaries

Show the Sub-Basket name, **Signature | Premium | Functional**, and permitted rename/delete icons in a compact header. Remove its other header labels, count badge, and inline margin rows. A tier opens the existing comparison panel at PMC, with PMC / Sub-vendor / In-house controls inside. Keep loading, missing-data, error/retry, and mismatch details inside the panel.

Retain the implemented explicit tier reads, shared query keys, source selection, formatting, cache invalidation, identity isolation, and Signature-only apply guards. Preserve deletion authorization, target, confirmation, and focus return. No backend, formula, persistence, dependency, or pricing change is needed. Main Basket and direct-item header presentation remains unchanged.

## Dependency-ordered tasks and ownership

### R1. Preserve the current implementation

Owner: primary. Preparation for AC1–AC6.

Capture the current dirty-path set and relevant target diffs under `/tmp/lisno-sub-basket-tier-margins-qa/compact-row` before writers start. Read the existing changes in every assigned dirty target. Retain the earlier tier-data implementation and unrelated work. Use previous successful checks as the baseline; do not repeat them before editing without a new reason.

### R2. Implement the bounded presentation revision

Depends on R1. This is the single in-progress implementation task, with two non-overlapping slices that can run in parallel in Mode A.

**Slice A: tier controls and panel.** A frontend implementer owns only these files under `frontend/src/features/ai-estimator-knowledge/`:

- `KnowledgeSubBasketMargins.tsx`
- `KnowledgeSubBasketMargins.test.tsx`
- `knowledge-sub-basket-margins.css`

Replace the stacked rows with three text buttons and decorative separators, using existing visual tokens. Keep the tier group horizontal even when its parent moves to a second line. Remove header values, badges, headings, and status text. Open the selected tier at PMC and provide three compact mode controls inside the existing panel. Render that panel during loading and failed reads as well as when data exists; retry only the selected tier. Preserve mutation locks, stale-comparison protection, origin identity, Signature-only writes, percentage formatting, and source/mismatch details. Return focus to the tier trigger. Prevent tier interaction from toggling the Sub-Basket disclosure.

Update existing rendered tests for the new interaction. Cover three unequal tiers and mode switching, pending/error/empty panels, keyboard/focus, and retained Signature write guards. Keep the existing meaningful race/cache tests; do not replace them with styling-only assertions. Do not modify API or query-key files.

**Slice B: header integration and delete icon.** Primary owns only these files in the same directory:

- `KnowledgeBasketCard.tsx`
- `KnowledgeBaseIndexPage.tsx`
- `KnowledgeIndexPage.test.tsx`
- `knowledge-index.css`

Remove the eyebrow and count only for the Sub-Basket header. Reuse the existing trash icon and icon-action treatment, keeping the accessible name identifying the Sub-Basket. Preserve existing authorization conditions, click target, confirmation, and focus refs. Adjust the Sub-Basket header layout to align name, tier group, and actions on wide screens; let the tier group move together on narrow screens. Scope CSS so Main Basket and direct-item headers retain their layout. Update only relevant index assertions and reuse existing deletion/permission coverage.

Integration contract: `KnowledgeSubBasketMargins` keeps its existing public props and remains the `headerDetails` content. Slice A owns only its internal markup/CSS; primary owns the surrounding header and action layout. The panel title remains tier-and-mode qualified. No shared stylesheet is assigned to two writers.

In Mode A, tell the writer that others are working in the repository, that existing edits must be preserved, and that ownership is limited to the three assigned paths. In Mode B, primary performs both slices inline without implementation subagents.

### R3. Integrate and verify

Depends on both R2 slices. Owner: primary. Covers AC1–AC6.

Review the integrated diff, especially panel states without loaded data, mode switching, Signature apply guards, and unchanged delete confirmation. Keep review proportional to this UI revision; no new cross-stack audit is needed unless a contract unexpectedly changes.

Run from `frontend/`:

```sh
npm test -- --maxWorkers=2 src/features/ai-estimator-knowledge/KnowledgeSubBasketMargins.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx
npm run typecheck
npm run build
```

The index suite covers shared-header consumers and existing deletion behavior. Retain earlier passing query/default/cache evidence for unchanged files. Broaden verification only for a new failure or relevant code change. There is no repository lint script.

Reuse the synthetic browser fixture and inspect desktop (1440px), tablet (768px), and narrow (390px and 320px) layouts. Verify the horizontal names, compact spacing, long Sub-Basket names, no header values/extra labels, and no page overflow. Open each tier, switch modes, check distinct values and independent loading/error/retry/empty states, keyboard focus return, parent-disclosure independence, and accessibility. Check the icon-only delete trigger opens the existing confirmation and cancel returns focus; make no real deletion or margin write.

Finish with `git diff --check`, `git status --short`, and comparison with the R1 preservation snapshot. Remove any temporary repository harness, close owned browser sessions, and record results here. Temporary QA evidence remains under `/tmp/lisno-sub-basket-tier-margins-qa/compact-row`.

## Acceptance trace

| Criterion | Work | Evidence |
| --- | --- | --- |
| AC1: compact header with only requested content | R2 A/B | Header assertions and responsive browser inspection |
| AC2: isolated data and states | R2 A | Existing identity tests plus loading/error/empty panel checks |
| AC3: tier/mode details and Signature-only writes | R2 A | Unequal values, mode switching, existing mutation guard tests |
| AC4: cache consistency | Preserve existing implementation; R3 review | Earlier query/cache checks and retained component regression tests |
| AC5: styling, accessibility, preservation | R1, R2 A/B, R3 | Responsive/focus/accessibility checks, typecheck/build, diff hygiene |
| AC6: accessible delete icon and unchanged other headers | R2 B, R3 | Index deletion/permission tests, confirmation/cancel browser check |

## Retained implementation and prior evidence

The preceding approved work added explicit tier reads, the shared tier query-key helper, and separate comparison context. Its focused tier/default/cache suite passed 62 tests; two selected index checks passed. Prior browser checks covered 1440/768/390/320px, unequal tier values, independent states, long names, focus return, and zero axe violations. The prior build passed with the existing chunk-size warning. These results describe the earlier presentation, not verification of the pending compact row.

No backend/OCR/mobile suites, replica-set tests, migration, seed, live data mutation, deployment, commit, or push are included. R1–R3 are complete. The two implementation slices were integrated and verified; unrelated work was preserved.


## Final verification of the compact row

- `npm test -- --maxWorkers=2 src/features/ai-estimator-knowledge/KnowledgeSubBasketMargins.test.tsx`: **16 passed**, exit 0. Covers unequal tier/mode values, loading/error/empty panels, retries, identity changes, Signature-only writes, saving locks, failed-refresh targets, and focus return.
- `npm test -- --maxWorkers=2 src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx`: **59 passed**, exit 0. Covers header consumers and existing deletion/permission behavior.
- `npm run typecheck`: passed, exit 0. `npm run build`: passed, exit 0, with the existing warning about chunks larger than 500 kB.
- Synthetic real-browser checks passed at 1440/768/390/320px. Desktop/tablet headers are 61px tall; mobile keeps the three tiers together beneath the name/actions. No extra header labels/values, text Delete label, or page/header overflow. Long names also passed at 390/320px.
- All nine tier/mode combinations showed their distinct expected margins. Premium/Functional exposed no apply action. Enter/Escape and deletion cancellation returned focus correctly without toggling the disclosure. Independent loading, error/retry, and missing-value states stayed inside the panel, and retries did not refetch other tiers.
- Browser accessibility checks reported zero axe violations. No application console errors, route errors, unexpected requests, or writes occurred. Axe logged asset-preload warnings in the synthetic QA environment.
- `git diff --check` passed. Final worktree comparison found no unrelated modified or new paths. All three owned browser sessions were closed.
- Evidence: `/tmp/lisno-sub-basket-tier-margins-qa/compact-row/` (`component.log`, `index.log`, `typecheck.log`, `build.log`, browser logs, screenshots, and preservation snapshots). Build output is ignored under `frontend/dist/`; no runtime artifacts were added to tracked product files.

Changed product files are the seven explicitly owned R2 paths. Existing query/API/backend implementation was retained. No new dependencies, migrations, production mutation, commit, push, or deployment. Full frontend/backend/OCR/mobile suites were not run for this bounded UI change; no lint script exists. Remaining limitation: Premium/Functional comparisons remain read-only under the existing API, as approved.
