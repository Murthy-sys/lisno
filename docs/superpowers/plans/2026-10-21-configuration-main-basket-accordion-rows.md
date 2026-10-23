# Configuration Main Baskets: accordion-row task plan

Date: 2026-10-21
Status: Specification and task plan approved on 2026-10-21; user selected Mode A. Parent task completed on 2026-10-22 with scoped local verification. Not deployed.

Approved specification: [Configuration Main Baskets: full-width accordion rows](../specs/2026-10-21-configuration-main-basket-accordion-rows-design.md).

## Outcome and boundaries

Change Main Baskets such as POP / Gypsum and Painting into a single vertical list of full-width accordion rows in every viewport. Use compact 56–64px category thumbnails, a consistent approximately 18px title, and aligned creation/management actions. Opening a basket reveals its existing contents below the same header.

Keep the accepted Sub-Basket sections, direct-item sections, Main Line cards, and their responsive layouts unchanged. Preserve multiple-open disclosure, stable IDs, initial collapse, lazy reads, filters, paging, page-qualified counts, permissions, dialogs, mutations, and focus recovery.

No backend, contracts, native mobile, shared image resolver, new assets/icons/fonts, dependencies, lockfiles, or unrelated feature changes. No staging, commit, push, deployment, live deletion, migration, or production request.

## Current implementation and approach

The root `.knowledge-basket-groups` currently gains two columns at a 44rem container width and four at 88rem. Main Baskets gain a larger expanded-only header at 64rem, including larger photography and a title-size change. These presentation rules cause the inconsistent open-panel/closed-card composition shown in the screenshot.

Use the existing `KnowledgeBasketCard` main variant and existing controlled disclosure contract. A CSS-focused change is preferred: remove the parent-list column changes, make all Main Basket headers horizontal at usable widths, reduce photo dimensions, and wrap the commands row when needed. Make only a small main-variant markup adjustment if actual layout or keyboard verification requires it.

The latest inspection found no dirty product files; only the new specification was untracked. Capture a new baseline after execution authorization because the shared worktree may change between turns. Previous hierarchy test results are background, not verification of this new layout.

## Fixed implementation contract

- Keep `KnowledgeBasketCard` props unchanged: variant, name, panel ID, photo URL, count text, expanded state, toggle callback/ref, creation actions, management actions, description, and children.
- Keep native disclosure buttons, configured accessible names, heading associations, stable panel IDs, hidden bodies, and refs. Creation/edit/delete buttons stay outside the disclosure button.
- Keep the category description in the Main Basket header, hidden while collapsed. Do not move or duplicate it in the body.
- Scope changed photo/title/header/toolbar rules to `--main`. Shared rules may be narrowed or overridden deliberately, but their computed effect on sub/direct variants must remain unchanged.
- Keep `.knowledge-basket-groups` one column at every breakpoint. Parent headings and thumbnails retain the same sizing in open and closed states; expanded descriptions may naturally increase height.
- Preserve existing Main Basket body padding, `.knowledge-basket-sections`, sub/direct group headers/bodies, item grids, and the entire item-card styling block.
- Do not modify `KnowledgeBaseIndexPage` state, queries, callbacks, permission checks, or render hierarchy. Its existing slots already provide the required actions and data.
- Do not modify `KnowledgeIndexItemCard.tsx`, shared image mappings, or child business behavior.

Any necessary departure from these boundaries returns to the primary for reconciliation. A material specification change requires updating its approval; routine layout refinements within these boundaries do not reopen the design gate.

## Dependency order and ownership

Keep one parent task in progress during execution: **Implement and verify Main Basket accordion rows**.

| Task | Depends on | Owner in Mode A | Responsibility and owned paths | Acceptance |
| --- | --- | --- | --- | --- |
| T1 Capture current baseline | Approved plan and selected mode | Primary | Dirty status, target snapshots/diffs, focused baseline tests, representative before screenshots | AC3, AC4, AC6 |
| T2 Implement parent rows | T1 | Frontend implementer | Main/root rules in `knowledge-index.css`; main branch of `KnowledgeBasketCard.tsx` and its component tests only if necessary | AC1, AC2, AC5 |
| T3 Audit child preservation and prepare QA | T1 | Read-only UX auditor; primary owns temporary fixture | Audit selector reach and child preservation boundaries; prepare width/state checks against current components | AC3, AC5 |
| T4 Integrate and inspect | T2, T3 | Primary | Final diff, actual browser layout/interactions, coordinate any scoped fixes | AC1–AC6 |
| T5 Integrity review | T4 | Read-only integrity reviewer | Parent-only source delta, disclosure/ref contract, unchanged children and business state | AC3, AC4, AC6 |
| T6 Final verification | T5 findings resolved | Verification runner; primary browser QA | Final commands on the integrated tree and completed rendered matrix | AC1–AC6 |
| T7 Record and hand off | T6 | Primary | Update completion evidence in this plan; preview links, cleanup, limits | AC6 |

T2 and T3 can run in parallel because the auditor does not write product files. The primary can prepare synthetic fixture data while the presentation writer works, but final screenshots/tests must use the finished integrated sources. Do not invent a second implementation slice when the CSS/component work is coupled.

The primary owns durable documents and any justified narrow changes to `KnowledgeIndexPage.test.tsx`. Existing index and mutation regressions should normally run unchanged; do not weaken assertions to accommodate a visual-only change. All other product paths are outside the writer's ownership.

In Mode A, give each agent explicit boundaries and tell writers they share the worktree and must preserve other contributors' edits. After writers finish, perform integrity review, resolve findings, and then run independent verification. In Mode B, the primary performs the equivalent work and verification inline.

## T1: Baseline and preservation

- Save `git status --short`, relevant diffs, and complete copies of `KnowledgeBasketCard.tsx`, `KnowledgeBasketCard.test.tsx`, `knowledge-index.css`, `KnowledgeBaseIndexPage.tsx`, `KnowledgeIndexPage.test.tsx`, and `KnowledgeIndexItemCard.tsx` before changes.
- Record the sub/direct CSS rules, body insets, root index integration, and item-card block so the final comparison can distinguish intended parent edits from accidental child changes.
- Run the focused test lane below; record actual results and pre-existing diagnostics without relying on the prior iteration's counts.
- Capture before views with current production styles and synthetic data at desktop and narrow widths. Include one open parent with populated/empty siblings, direct items, and long names. Keep the same fixture and widths for comparison.
- Store temporary evidence under `/tmp/lisno-main-basket-accordion-2026-10-21/`; keep artifacts out of source control.

## T2: Implement full-width compact headers

- Remove responsive two/four-column Main Basket overview behavior and expanded-only full-span assumptions. Preserve order and approximately 12px separation between full-width parents.
- Replace the large photo/header composition with a compact main-only row: square thumbnail, flexible identity/name/count, and creation/management controls. Reuse existing theme tokens and image fallback behavior.
- Keep the same thumbnail size and title typography between open and closed states. Remove the expanded-only large-header breakpoint. Allow descriptions and long names to grow naturally.
- At wide widths, keep actions aligned on the right with readable content-sized labels. At tighter widths, move coherent action groups to their own row. Preserve read-only and partial-permission layouts without empty toolbar space.
- Keep the name/disclosure target broad, minimum touch sizes and focus outline intact, and the chevron clearly associated with the name. Add no wrapper click handler that also fires from action buttons.
- Preserve all sub/direct rendering and child styles. Do not reformat unrelated CSS or rewrite working components.
- Reuse existing tests for actions, controlled expansion, keyboard/focus, fallback images, and child semantics. Adjust a structural assertion only if the intended main markup actually changes; add new tests only for a meaningful uncovered interaction, not CSS-string or implementation-mirroring checks. Browser measurement establishes layout correctness.

## T3–T5: Review and rendered verification

Use the real index component and production styles with synthetic local records. Reuse prior fixture infrastructure only after verifying its imports, data, and request interception against current source. Block real API mutations and never use customer data.

| Acceptance | Required rendered evidence |
| --- | --- |
| AC1 | Collapsed and mixed-open views at 1920, 1440, 1024, 768, 390, 320px. Measure one root column, parent widths equal to the list width, stable order, and sequential sibling placement. Multiple open parents remain independent. |
| AC2 | Inspect actual screenshots at all widths, long names, all action combinations, and 200% text. Thumbnails/title sizes remain consistent across states. Normal desktop headers meet the compact visual target without fixed-height clipping. No horizontal overflow or clipped controls. |
| AC3 | Compare the same expanded sub/direct content at matching widths before/after. Preserve child padding, typography, counts, controls, Main Line card dimensions/metadata, and item-grid behavior. Include same-named groups under different parents and an empty group. |
| AC4 | Verify initial lazy reads, filter reveal/temporary collapse/clear, paging, truthful counts, and retry after a failed child catalog. Open/cancel creation and parent edit/delete dialogs; confirm temporary-item parent selection. Exercise synthetic rename/delete focus, version-conflict reconfirmation, and refresh-only retry without a repeated DELETE. |
| AC5 | Keyboard Enter/Space and touch-equivalent disclosure; action clicks do not toggle parents. Check visible focus, image failure, empty/error/retry, read-only and update-only roles. Run axe in collapsed-wide, mixed-open-wide, and narrow states; inspect console errors and unexpected requests. |
| AC6 | Compare final changes with captured snapshots, run final focused commands, record warnings and evidence paths, and confirm no unrelated writes. |

The integrity reviewer must inspect the integrated diff after visual refinement, with particular attention to shared CSS selectors, sub/direct output, stable panel/ref relationships, and untouched index logic. Resolve confirmed issues before final verification. If late fixes affect layout or behavior, rerun only the impacted checks plus required final compilation/hygiene checks.

## T6: Exact verification commands

From `frontend/`, run the focused lane before edits and on the final integrated tree:

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

Record actual test counts, exits, and diagnostics. Existing pending basket-request MSW diagnostics and Vite chunk-size advisories were present in earlier runs; determine their current baseline rather than assuming they are unchanged.

No repository lint script exists. Backend/replica-set, OCR, native mobile, full unrelated frontend, and shared estimator/Procurement image-consumer suites are not required for this parent-only presentation scope. Broaden verification if an actual shared boundary changes; do not change such a boundary merely to facilitate styling.

## T7: Completion record and handoff

- Record the actual changed files, acceptance results, baseline/final checks, warnings, and unrun checks here.
- Link desktop and narrow screenshots showing full-width closed siblings and an expanded parent with its unchanged children.
- Distinguish Chromium/synthetic fixture evidence from live-backend, physical-device, and other-browser coverage.
- Stop only task-owned preview/browser processes. Report temporary artifact locations and ignored build output; do not commit them.
- Report no dependencies, data migrations, or external actions if that remains true. State explicitly that the changes have not been deployed.

## Approval record

- Specification: approved by the user on 2026-10-21.
- Task plan: approved by the user on 2026-10-21.
- Execution choice: A, parallel sub-agents, selected by the user on 2026-10-21.

## Completion record

T1–T7 are complete. The implementation required only `frontend/src/features/ai-estimator-knowledge/knowledge-index.css`, plus these specification/plan records. No component, test, state, query, mutation, API, or shared-contract implementation changed.

Main Baskets now remain one full-width row per category. Main-only header rules use 64px square thumbnails, consistent 18px titles, a compact metadata row, and content-sized actions aligned right at wide widths. At constrained widths the action groups wrap below the identity. Expanded descriptions remain in the same header. Ordinary desktop closed headers measure 88px; long content and narrow layouts grow naturally.

### Preservation and review

- Initial status, target diff, six complete source snapshots, and before screenshots were saved in `/tmp/lisno-main-basket-accordion-2026-10-21/`. Before implementation, the seven-file regression lane passed **233 tests** in 10.76 seconds.
- `KnowledgeBasketCard.tsx`, its test, `KnowledgeBaseIndexPage.tsx`, `KnowledgeIndexPage.test.tsx`, and `KnowledgeIndexItemCard.tsx` remain byte-identical to their snapshots. The complete CSS item-card block and all subsequent rules remain byte-identical.
- The read-only UX audit identified shared-selector hazards before writing. The writer kept changed styling beneath the immediate Main Basket header and preserved child/body rules.
- The independent visual review inspected all six collapsed widths, expanded desktop/narrow views, and 200% text. No concrete product defects were found. The independent integrity reviewer found no actionable defects in selector containment, scope, preserved semantics, or recorded layout evidence.

### Final command results

The verification runner executed the exact commands in T6 after implementation and integrity review finished.

| Check | Result | Log in the task temporary directory |
| --- | --- | --- |
| Seven-file focused test command | 7 files, **233 passed**; exit 0 | `final-focused.log` |
| Selected `KnowledgeScreens` item-card regression | **1 passed**, 105 intentionally skipped by `-t`; exit 0 | `final-workspace.log` |
| `npm run typecheck` | Passed, no diagnostics; exit 0 | `final-typecheck.log` |
| `npm run build` | Passed, 3,177 modules, Vite bundling 8.50 seconds; exit 0 | `final-build.log` |
| `git diff --check` | Passed; exit 0 | `final-diff-check.log` |
| `git status --short` | Only the stylesheet modified plus this spec/plan untracked | `final-status.log` |

Total final tests executed: **234 passed**. The focused baseline and final run each emit 58 existing MSW diagnostics for the same unmatched pending basket-request GET. The selected workspace check emits that diagnostic once. The build reports the previously observed category of chunk-size advisory for chunks over 500 kB; no separate before-build size comparison was performed. No other build warning or typecheck error was observed. Final diff hygiene was repeated after updating these records.

### Rendered acceptance results

- **AC1–AC2:** collapsed and mixed-open layouts were measured at 1920, 1440, 1024, 768, 390, and 320px. All parents equal their list's width and remain in one column. Photos remain 64×64px and titles 18px in both states. No measured horizontal page overflow or clipped header controls. The 200% text view also stays within the viewport. Inspected long names, missing-image fallback, and wrapped action groups remain readable.
- **AC3:** before/after computed styles and dimensions match exactly at 1440 and 390px for the Main Basket body, nested sections, Sub-Basket header/body, item grid, Main Line card, and direct-item header. Before/after desktop and narrow screenshots confirm accepted child styling is preserved.
- **AC4:** no Sub-Basket reads occur before initial expansion. Multiple parents open independently. Search, filtered collapse, clear/reset, advanced Basket filtering, next/previous paging, qualified page counts, and stable-ID item navigation passed. Browsing issued zero mutations. The navigation destination in this fixture is a stub; the selected existing workspace test covers real item-card rendering separately.
- **AC4–AC5:** all four parent actions open and cancel without toggling their parent. Temporary-item creation receives the selected `basket-0` parent. Synthetic Sub-Basket rename succeeds; delete cancel returns focus to its trigger; successful deletion preserves the same-named group under another parent and returns focus to POP / Gypsum. A simulated version conflict clears confirmation and requires renewed input. Post-delete refresh recovery issues no second DELETE.
- **AC5:** native Enter/Space and Chromium touch input disclose the expected parent/group. Read-only controls and empty toolbar slots are absent; update-only role has edit without create/delete. Image failure, empty catalog, failed child catalog, and retry recovery passed. Three axe scans (collapsed wide, expanded wide, expanded 320px) report **zero violations**. Captured page-error arrays and the final browser console contain no errors.
- **AC6:** source scope, final focused tests, typecheck/build, source preservation comparisons, browser matrix, and independent reviews are complete. No dependencies, new tests, lockfiles, shared resolver, backend, or native-app changes were needed.

Browser evidence: `final-matrix.log`/`final-matrix.json`, `baseline-child-metrics.log`, `final-child-metrics.log`, `final-states.log`, `final-browsing.log`, `final-dialogs.log`, and `final-recovery.log` in the task temporary directory. An initial QA browser session had closed and was reopened. A browser empty-state assertion initially matched two groups; scoping it to the intended Sub-Basket resolved that automation ambiguity, and the complete browsing scenario then passed. Neither required a product change.

Inspected screenshots include `after-collapsed-{1920,1440,1024,768,390,320}.png`, `after-expanded-{1920,1440,1024,768,390,320}.png`, `after-text200.png`, and paired before/after child captures. The narrow child capture was also checked at original resolution. Recommended handoff previews are **`after-collapsed-1440.png`**, **`after-mixed-1440.png`**, and **`after-expanded-390.png`**. The separate cropped `after-mixed-390.png` is not used as acceptance evidence.

### Cleanup, limits, and external actions

The task-owned browser session `main-basket-accordion` was closed and the preview on port 4324 was stopped. Review artifacts remain in `/tmp/lisno-main-basket-accordion-2026-10-21/`. The build generated ignored `frontend/dist/` and TypeScript metadata under `frontend/node_modules/.tmp/`; none are staged.

Browser verification used Chromium, synthetic local API responses, and emulated touch. It does not establish physical-device, Safari/Firefox, or live-backend behavior. Full unrelated frontend, backend/replica-set, OCR, native-mobile, and shared estimator/Procurement suites were not run because their boundaries were unchanged. No lint command was run because no script exists.

No staging, commit, push, deployment, seed, migration, production mutation, or customer communication occurred. Existing MSW diagnostics and the build chunk-size advisory remain the recorded limitations.
