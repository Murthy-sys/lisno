# Configuration basket hierarchy: task plan

Date: 2026-10-21
Revision: 2
Status: Revision-2 specification and task plan approved on 2026-10-21; user selected Mode A. Parent task: Implement and verify Configuration hierarchy revision 2 (completed with scoped local verification; not deployed).

Approved specification: [Configuration basket hierarchy: distinct visual levels](../specs/2026-10-21-configuration-basket-photo-cards-design.md).

Approval record: the user separately approved the revised specification, approved this task plan, and selected A. Local implementation and verification may proceed using the ownership boundaries below.

## Outcome and scope

Give the three hierarchy levels visibly different structures:

- Main Basket: category photography, a stronger title, a substantial expanded category header, and creation/management actions grouped deliberately.
- Sub-Basket: a compact full-width nested section with no photo or photo placeholder, a smaller heading, qualified page count, independent controls, and its own attached item area.
- Main Line: its existing named item card inside that group. Direct items use a separate quiet section, without a photo or a Sub-Basket label.

Retain the reference-inspired four/two/one-column Main Basket overview. Use a vertical stack for Sub-Baskets. Preserve independent expansion, initial collapse, filtered disclosure state, stable IDs, lazy reads, ordering, page counts, permissions/freshness, dialogs, mutations, conflict/retry behavior, focus recovery, and all current Main Line information/actions.

No backend, API, shared data contract, native app, dependency, lockfile, image-map, estimation/Procurement UI, brand, recommendation, route, or persistence changes. No staging, commit, push, deployment, live deletion, migration, or production request.

## Current evidence

`KnowledgeBasketCard.tsx` currently renders one common photo-card structure for main, sub, and direct variants. `knowledge-index.css` gives all of them the same large header and gives both root/nested grids the same responsive columns. `KnowledgeBaseIndexPage.tsx` supplies category photos to every variant. These are the specific causes of the rejected hierarchy.

The index's expansion/query/filter/focus behavior was verified in the prior iteration and remains the behavior to preserve. Re-run a focused baseline before editing; historical test results are not current proof. In particular, tests requiring child photo placeholders encode the old presentation and should change intentionally, while existing permission, confirmation, identity, and state assertions must remain.

All relevant targets already contain revision-1 work. Other dirty files include unrelated brand and recommendation changes. Capture the current dirty-path list and per-target diffs/full snapshots before writers start; do not restore files from HEAD or overwrite unrelated changes.

## Presentation/integration contract

Keep `KnowledgeBasketCard` as the existing entry point so the hierarchy owner stays small. It must render distinct structures for Main Baskets and nested groups; sharing disclosure helpers does not require identical markup.

Preserve existing props and semantics: `variant`, `name`, `panelId`, `imageUrl`, `countText`, `expanded`, `onToggle`, optional `toggleRef`, `actions`, `description`, and `children`.

Add one optional `creationActions: ReactNode` slot for Main Basket create actions. The existing `actions` slot holds Main Basket management actions or Sub-Basket edit/delete actions. Do not infer action roles by inspecting button text or children.

- Main Basket passes its photo, two creation actions, and separate management actions. Existing callback bodies and accessible labels remain unchanged.
- Sub-Basket and direct variants pass `imageUrl={null}`. The renderer must not render a photo area or placeholder for either variant, even if a URL is accidentally supplied. Only main variants use image loading/error handling.
- Main Basket description remains hidden while collapsed and appears below the category name in the expanded header. It must not be duplicated in the body.
- Keep root variant classes, section associations, panel IDs, `hidden` bodies, refs, and native disclosure semantics stable where possible. Main headings remain h2; sub/direct headings remain h3. Level eyebrows sit outside the configured-name heading/button.
- Replace the nested `.knowledge-basket-card-grid` wrapper with `.knowledge-basket-sections`, a full-width vertical stack. Only `.knowledge-basket-groups` uses responsive Main Basket grid columns. Group bodies contain the existing `.knowledge-item-grid` unchanged.
- Sub-Basket counts use the existing supplied qualified text in a subdued capsule. No new counts, names, data lookups, permissions, or query behavior belong in the presentation component.
- Direct items retain their existing name and default-open disclosure, receive no category eyebrow or group management actions, and stay visually subordinate to the Main Basket.

This contract is fixed before parallel implementation. Any necessary deviation returns to the primary for reconciliation; agents must not invent incompatible fallbacks.

## Dependency order and ownership

Keep one parent task in progress: “Implement and verify Configuration hierarchy revision 2.” Execute the following tasks only after plan approval and execution-mode selection.

| Task | Depends on | Owner in Mode A | Owned files/responsibility | Acceptance |
| --- | --- | --- | --- | --- |
| T1 Baseline and preservation | Approved gates | Primary | Current target snapshots, relevant baseline, confirm contract | AC4, AC6 |
| T2 Distinct presentation | T1 | Presentation implementer | `KnowledgeBasketCard.tsx`, `KnowledgeBasketCard.test.tsx`, `knowledge-index.css` | AC1, AC2, AC5 |
| T3 Index integration | T1 | Integration implementer | `KnowledgeBaseIndexPage.tsx`, `KnowledgeIndexPage.test.tsx` | AC1, AC3, AC4 |
| T4 Integrate and visual refinement | T2, T3 | Primary | Integrated result, local browser fixture; coordinate any owner fixes | AC1–AC6 |
| T5 Integrity review | T4 | Read-only integrity reviewer | Final diff, stable identity, permission/query/focus preservation | AC3, AC4, AC6 |
| T6 Final verification | T5 findings resolved | Verification runner and primary browser QA | Final commands, responsive/interactions/accessibility evidence | AC1–AC6 |
| T7 Handoff | T6 | Primary | Record actual files/results/limits in this plan | AC6 |

T2 and T3 may run in parallel under the agreed component contract; their file ownership does not overlap. The primary owns shared interpretation and durable documents. `KnowledgeMainLineDeletion.test.tsx` and the already-dirty `KnowledgeScreens.test.tsx` remain primary-owned and should only change if actual structural integration requires a narrow adjustment. Do not weaken their behavioral assertions.

In Mode A, use native Codex subagents for the two independent writer slices and the subsequent review/verification stages. Every writer must be told that other contributors share the worktree, must not revert their changes, and must stay within explicit ownership. In Mode B, the primary performs the same sequence inline without implementation subagents. Final verification follows completed writers and resolved review findings in either mode.

## T1: Capture baseline

- Save initial `git status --short`, relevant diffs, and full copies of the three presentation files plus index source/tests. Snapshot primary-owned dirty tests before touching them.
- Run the seven-file focused lane below before edits. Record failures/warnings; distinguish existing MSW basket-request diagnostics from new failures.
- Confirm stable IDs, refs, action callbacks, and query/filter state against the current source. Retain the shared image resolver and compatibility export as they are.
- Store temporary evidence under `/tmp/lisno-basket-hierarchy-r2-2026-10-21/`. Do not commit artifacts.

## T2: Build different visual structures

- Render Main Baskets with their photo, “Main Basket” eyebrow, stronger title, qualified count, grouped creation controls, grouped management controls, and expanded description. Position expanded identity/actions across the header when width permits and stack them naturally when narrow.
- Render Sub-Baskets without any image area. Use the compact nested section header, “Sub-Basket” eyebrow, configured name, count capsule, edit/delete actions, and disclosure. Attach existing item content immediately beneath it; stack siblings vertically.
- Render direct items as a quiet section with its existing explicit name, no photo/eyebrow, and no invented management controls.
- Scope styles to the Configuration index. Use existing fonts/tokens, warm stone and off-white surfaces, olive controls, and fine borders. Main Basket outer boundaries carry the category containment; subgroups rely on inset, typography, spacing, and separators. Preserve Main Line styles and shared/global styles.
- Main overview title targets about 18px, expanded title about 20px, subheading about 16px; allow content-driven sizing and wrapping. Main content spacing targets 20–24px desktop/12px narrow. Subheaders target 64–80px for ordinary content without fixed-height clipping.
- Keep action groups together where possible and move them as groups at tighter widths. Maintain keyboard focus, touch targets, and semantic headings. No hover-only actions, new fonts/icons, shadows, gradients, colored left stripes, animations, or dependencies.
- Update component regressions to verify that sub/direct sections have no photo or placeholder, only Main Baskets load/fallback photos, level labels do not alter configured accessible names, grouped actions do not toggle disclosure, and stable IDs/refs/keyboard control remain correct. Reuse meaningful existing tests; do not add CSS-string assertions as visual proof.

## T3: Integrate without changing business behavior

- Pass existing Main Basket creation buttons to `creationActions` and management buttons to `actions`; keep their handlers, labels, and permission guards verbatim.
- Stop resolving/inheriting photos for Sub-Baskets/direct items. Change only their presentation props and the nested stack wrapper.
- Preserve every query key and enabled predicate, independent expansion collections, filtered collapse state, record ordering, conditional delete/edit eligibility, mutation handler, dialog, page count, and focus ref.
- Preserve the actual Main Line renderer and its links/information. Existing tests should still cover lazy reads, repeated names, direct items, errors/retries, filters/reset, paging, stale actions, and restricted roles.
- Add only necessary integration assertions proving that a visible Main Basket owns its photo, its named Sub-Baskets own the correct Main Lines, and direct items are a separate non-Sub-Basket section. Do not substitute class-name checks for user-visible relationships.

## T4–T5: Integrate, inspect, and review

- Run the actual Configuration page with production styles and synthetic local data. A small isolated fixture may reuse previous fixture infrastructure, but refresh its source imports/data and verify current DOM before operating it.
- Inspect a representative desktop view with Main Basket, expanded populated Sub-Basket, collapsed sibling, empty sibling, and actual named Main Lines visible together. Inspect the same hierarchy at narrow width. Resolve composition issues before declaring visual completion.
- Explicitly review whether the hierarchy remains recognizable when small “Main Basket”/“Sub-Basket” labels are ignored. Photo ownership, header scale, nested section shape, and leaf cards must each communicate a different level. Three similarly styled panels do not pass.
- Check long titles and all permitted action groups at container breakpoints. Avoid nested padding that compresses item cards. Ensure direct items cannot be mistaken for a configured Sub-Basket.
- Review the final diff against the captured baseline for permission, query/cache, version/identity, mutation, and focus regressions. Verify no unintended shared resolver, Main Line style, brand/recommendation, or native-app edits.
- Resolve findings through the affected owner, then run final verification on the integrated tree. Do not certify concurrent/transient builds.

## T6: Verification commands

From `frontend/`, run this focused lane for baseline and final verification:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketCard.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPresentation.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketDeletion.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineDeletion.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/ai-estimator-knowledge/CreateKnowledgeItemDialog.test.tsx
```

Final additional checks:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx -t 'renders minimal item cards'
npm run typecheck
npm run build
```

At repository root:

```sh
git diff --check
git status --short
```

No lint script exists. Shared estimation/Procurement photo tests need repeating only if the image resolver, shared component, or shared styles actually change; those changes are not planned. Broaden other tests only for a new failure or changed contract. Backend, replica-set, OCR, native-mobile, and full unrelated frontend suites are not required by this presentation-only scope.

### Rendered verification matrix

| Criteria | Checks |
| --- | --- |
| AC1–AC2 | Inspect collapsed overview and expanded three-level hierarchy at 1920, 1440, 1024, 768, 390, 320px, plus 200% text. Only Main Baskets have category photos. Subsections remain a vertical stack; Main Lines retain their names and existing cards. Check action grouping, spacing, long names, wrapping, overflow, and level recognition without badges. |
| AC3 | Open multiple parents/groups independently; check same-named Sub-Baskets under different parents, empty groups, direct items, stable order and DOM ownership. |
| AC4 | Apply/clear search and advanced filters, temporarily collapse a filtered group, change pages, and refresh. Verify restored choices, lazy reads, qualified counts, and no false empty inventory on a failed catalog. |
| AC4–AC5 | Open/cancel create and Main Basket edit/delete panels; verify selected temporary-item parent. Save a synthetic Sub-Basket rename. Test delete cancel/success focus, a version conflict requiring renewed confirmation, and post-delete refresh-only retry without repeated DELETE. Preserve one same-named sibling under another parent. |
| AC5 | Test keyboard Enter/Space, visible focus, disclosure/ref associations, touch-equivalent input, parent image failure/unknown image, empty/loading/error/retry, read-only, and update-only fixtures. Run axe in collapsed, expanded, and narrow states. Inspect browser console and unexpected requests. |
| AC6 | Final focused commands, diff review, dirty-work preservation, inspected screenshots, and logs. All mutations in browser tests use synthetic local records; no production data. |

Record screenshots showing the hierarchy itself, not only a collapsed grid. Store logs/screenshots in the revision-2 temporary directory. Stop task-owned preview processes/browser sessions after verification. Distinguish Chromium/synthetic fixture evidence from live backend or physical-device coverage.

## T7: Completion record and handoff

After implementation, update this plan with changed files, explicit acceptance results, exact command outcomes, baseline warnings/failures, browser findings and inspected artifact paths, and checks not run. Report no dependencies or migrations if that remains true. State whether deployment occurred; this plan does not authorize it.

Do not claim visual completion from test counts alone.

## Revision-2 execution record

- T1 complete: initial dirty status, relevant diffs, and seven full target snapshots saved in `/tmp/lisno-basket-hierarchy-r2-2026-10-21/`. Seven-file baseline passed all 229 tests in 10.51 seconds. Existing MSW pending basket-request diagnostics remain in the baseline.
- T2/T3 complete with separate presentation and integration owners. Main Baskets now use the photo/category structure and separate creation/management slots. Sub-Baskets use compact photo-free sections in a single-column stack; direct items use a quieter separate section. The focused writer checks passed: 11 component tests, 58 index tests, and frontend typecheck.
- Revision-2 product/test edits are limited to `KnowledgeBasketCard.tsx`, `KnowledgeBasketCard.test.tsx`, `knowledge-index.css`, `KnowledgeBaseIndexPage.tsx`, and `KnowledgeIndexPage.test.tsx`, all under `frontend/src/features/ai-estimator-knowledge/`. The specification and this plan record the work. `KnowledgeMainLineDeletion.test.tsx`, `KnowledgeScreens.test.tsx`, and all existing item-card CSS are byte-identical to the revision-2 snapshots. No new dirty paths were introduced; existing unrelated work was preserved. The revision-only source diff is `/tmp/lisno-basket-hierarchy-r2-2026-10-21/revision2-final.diff`.
- T4 complete: current production components/styles were rendered with a strict synthetic local fixture. Unexpected real API requests were blocked. Primary and independent UX reviews found no actionable visual defects. All three hierarchy levels remain recognizable when the small level labels are hidden.
- T5 complete: the independent integrity reviewer compared all five files with the captured revision-2 snapshots and found no actionable defects. Native disclosure semantics, IDs/refs, permissions, callbacks, queries/cache, mutations, focus recovery, Main Line rendering, and existing item styles were preserved.
- T6 complete: an independent verification runner executed the exact commands in the verification section after writers finished. All checks passed. Browser verification is detailed below.
- T7 complete: evidence, limitations, changed files, and check results are recorded here. The task-owned Playwright session `basket-hierarchy-r2` was closed, and the synthetic preview on port 4323 was stopped. Temporary logs/screenshots remain under `/tmp/lisno-basket-hierarchy-r2-2026-10-21/` for review.

### Final command results

| Command/check | Result | Evidence in the revision-2 temporary directory |
| --- | --- | --- |
| Seven-file focused test command above | 7 files, 233 tests passed; exit 0 | `final-focused.log` |
| `KnowledgeScreens.test.tsx -t 'renders minimal item cards'` | 1 passed; 105 intentionally skipped by name filter; exit 0 | `final-workspace.log` |
| `npm run typecheck` | Passed; exit 0 | `final-typecheck.log` |
| `npm run build` | Passed; exit 0 | `final-build.log` |
| `git diff --check` | Passed; exit 0 | `final-diff-check.log` |
| `git status --short` | Same dirty-path state as the initial snapshot | `final-status.log`, `initial-status.txt` |

Total final tests executed: **234 passed**. The baseline and final seven-file runs both contain 58 existing MSW diagnostics for the same unhandled pending `basket-requests` GET; the selected workspace test contains one equivalent diagnostic. The production build retains the existing chunk-size advisory for chunks over 500 kB. No new failing test or compilation error was observed. Repository diff hygiene was checked again after this completion record was updated.

### Rendered results and acceptance evidence

- **AC1–AC2, visual hierarchy:** collapsed and expanded layouts inspected at 1920, 1440, 1024, 768, 390, and 320px. The main overview uses four/two/one columns at those applicable widths; nested Sub-Baskets remain one column. Measured page width equals viewport width at each size, with no clipped card controls. Expanded child groups contain no photo areas. Long names and grouped creation/management controls remain visible. The 200% text view has no horizontal overflow.
- **AC3, ownership:** independent parent/group disclosure, repeated Sub-Basket names under different parents, direct items, and empty groups passed. Existing Main Line names remain visible and navigation supplies the correct stable ID. The browser fixture's destination is a stub; the focused workspace test independently covers existing item-card rendering.
- **AC4, browsing:** no child-catalog reads before a parent opens; search and advanced filters reveal matching items; temporary filtered collapse works; clearing filters restores ordinary expansion choices. Next/previous paging preserves surviving expansion and qualified page counts. Failed child catalogs display retry rather than false empty inventory. Initial empty state and recovery were checked. Browsing issued no mutation requests.
- **AC4–AC5, actions and recovery:** create/temporary-item and Main Basket edit/delete panels opened and cancelled correctly; temporary-item creation received the selected parent. A synthetic Sub-Basket rename succeeded. Delete cancel restored the trigger; successful deletion preserved a same-named group under another parent and focused the surviving parent. A simulated 409 cleared confirmation and required renewed input. A simulated post-delete catalog failure retried the refresh with no second DELETE.
- **AC5, access and input:** keyboard Enter/Space and Chromium touch input opened the correct groups. Read-only role rendered no mutation controls or visible empty action slots; update-only role exposed rename without create/delete. Parent image failure displayed the existing placeholder; children remained photo-free. Automated axe scans of collapsed-wide, expanded-wide, and expanded-320px states reported **zero violations**. Captured browser console and page-error checks found no errors.
- **AC6, scope:** no backend/shared contract, mobile, dependency, lockfile, image-map, or unrelated feature edits were made in this revision. No installs, migrations, seeding, staging, commits, pushes, deployments, or production mutations were performed.

Inspected screenshots: `r2-collapsed-{1920,1440,1024,768,390,320}.png`, `r2-hierarchy-{1920,1440,1024,768,390,320}.png`, `r2-hierarchy-no-labels.png`, `r2-hierarchy-text200.png`, and `r2-readonly-narrow.png`, all under the revision-2 temporary directory. The clearest handoff previews are `r2-hierarchy-1440.png` and `r2-hierarchy-390.png`. The independent UX reviewer also inspected all six collapsed widths and the representative expanded desktop/narrow views.

### Verification limits

Browser checks used Chromium, synthetic local API responses, and emulated touch; they do not establish live-backend, physical-device, Safari, or Firefox coverage. Main Line browser navigation used a stable-ID destination stub. No backend, replica-set, OCR, native-mobile, full frontend suite, or lint command was run; this presentation-only revision did not change those boundaries, and no lint script exists. Shared estimator/Procurement image tests were not repeated because their resolver and shared styles were unchanged from the prior iteration. Existing MSW diagnostics and the build-size advisory remain as described above.

## Historical revision-1 record

The previous iteration shared one photo-card design across levels. It was implemented in Mode A and behaviorally verified, then rejected by the user for insufficient visual hierarchy. The approved revision-2 specification supersedes that visual design.

Revision 1 relocated the unchanged decorative image resolver to `frontend/src/components/baskets/mainBasketImages.ts` with a compatibility re-export from `frontend/src/features/leads/mainBasketImages.ts`. It added the current presentation component and index integration, separate filter expansion state, lazy reads, page-count truth, and visible-parent focus recovery. These working contracts remain the starting point.

Prior recorded verification: 229 tests across seven focused files plus three single-test workspace/estimator/Procurement checks, typecheck, build, and diff hygiene passed. Baseline MSW unmatched pending basket-request diagnostics and Vite chunk-size warnings remained. Chromium synthetic-fixture checks covered widths, interactions, permissions, conflict/refresh recovery, and axe. These results belong to revision 1 and do not certify the revised UI.

Prior evidence remains at `/tmp/lisno-basket-photo-cards-2026-10-21/`, including initial status/diffs, workspace-test snapshot, baseline/final logs, fixture source, and `collapsed-*`, `expanded-*`, `enlarged-text.png`, and `narrow-sub-basket-detail.png` screenshots. No prior commit, deployment, migration, or production mutation was performed.
