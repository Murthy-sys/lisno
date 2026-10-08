# Compact Procurement project basket task plan

Date: 2026-10-05  
Status: proposed for approval  
Approved specification: [2026-10-05-compact-procurement-project-basket-design.md](../specs/2026-10-05-compact-procurement-project-basket-design.md)

## Delivery boundary and UI contract

Recompose only the opened basket within Procurement → Projects. Keep the current basket, mode, BOQ, vendor, comparison, award, and monitor APIs and guards. No backend, Configuration, public vendor, permission, or persistence changes are planned. No new dependency is needed.

Before any writer starts, recapture `git status --short` and inspect the current contents of each target. The basket components, stylesheet, and workspace tests are already untracked work; preserve their current behavior and avoid replacing or staging unrelated files. The integration contract is:

- Scope panel receives the existing `ProcurementBasketDetail`, project name, project ID, and `frozen` state. Render line amounts from `line.mode.preview.sellingPaise`; render the footer from `basket.workingTotalPaise` only when `workingTotalComplete` is true. Keep `ProcurementBasketModeEditor` as the only rate/mode edit path.
- Enquiry component retains its existing public props and API mutations. Candidate search may load before a BOQ draft because the current candidate endpoint requires a valid project/basket, not an enquiry ID. Selection stays local until a draft exists; sending remains disabled with a reason until BOQ, mode, and current-source guards pass.
- Stage display is derived from server data: no enquiry/draft → Enquiry; sent with no bids → Bids; sent with bids or award pending → Comparison; issued → Awarded. Keyboard-operable stage controls navigate to available content only and never change workflow state; future stages remain visibly unavailable.

## Dependency-ordered tasks

| Task | Affected area and concrete work | Depends on | Acceptance |
| --- | --- | --- | --- |
| T1. Baseline and component contract | Primary agent records the dirty-path set, checks existing basket target contents, fixes prop/class boundaries, and identifies current rendered assertions before edits. | Approval and execution choice | Existing work preserved; AC1–AC5 traceable. |
| T2. Compact scope panel | Extract the opened basket's scope display into `ProcurementBasketScopePanel.tsx` with its own `procurementBasketScope.css`. Show basket/project heading, labeled working benchmark, compact source rows, quantity/UOM, authoritative line amount, incomplete/mode blockers, and the existing mode editor action. Keep stable source-line keys. | T1 | AC1–AC2. |
| T3. Enquiry panel and stage presentation | Refactor `ProcurementBasketEnquiry.tsx` and add `procurementBasketEnquiry.css`. Place a keyboard-operable four-stage progress indicator above current content; expose vendor search/filter/list without the directory dropdown; preserve selected vendor IDs across draft creation; make BOQ fields compact but reachable; retain revision, delivery retry, comparison, award, monitor, and history paths. Keep all existing mutation/version/digest guards and query invalidations. | T1; can run alongside T2 | AC3–AC4. |
| T4. Composition and focused regression | Integrate T2 and T3 in `ProcurementBasketDetailView.tsx`; reconcile `procurementBasket.css` and responsive behavior. Update `ProcurementBasketWorkspace.test.tsx` to assert authoritative amounts, incomplete state, stage mapping, visible vendor search, selection/send guards, keyboard access, and unchanged legacy workflows. Review `ProcurementBasketComparison.test.tsx` and `ProcurementBasketMonitor.test.tsx` for regressions. | T2–T3 | AC1–AC5. |
| T5. Integrated verification and fixes | Run focused rendered tests, frontend typecheck/build, browser visual and interaction checks at desktop/tablet/narrow mobile widths, then diff hygiene. Fix confirmed issues within this scope and repeat only affected checks. | T4 | AC1–AC5. |

## Ownership and safe parallel work

The primary agent owns T1, `ProcurementBasketDetailView.tsx`, the shared `procurementBasket.css`, `ProcurementBasketWorkspace.test.tsx`, final integration, and T5. If the user selects **Mode A**, one frontend agent exclusively owns T2's new scope component and stylesheet; another exclusively owns T3's `ProcurementBasketEnquiry.tsx` and new enquiry stylesheet. Both receive the fixed props/data rules above, know they are sharing a dirty worktree, and must preserve others' edits. Neither edits the other's paths, the parent's shared files, backend files, or tests. T2 and T3 are the only safe parallel writers; T4 and T5 start after both finish. If the user selects **Mode B**, the primary agent completes the same tasks inline and performs the equivalent review/verification sequentially.

## Verification by acceptance criterion

- **AC1–AC2:** Render a basket with duplicate display names, mixed ready/missing modes, and unequal line amounts. Confirm stable ID navigation, project/basket heading, each line's source context, exact server working amounts and complete/incomplete footer, and stale-source blocking.
- **AC3:** Render before and after draft creation. Search and filter candidates by city, paginate, select multiple stable vendor IDs, save required BOQ fields, and verify dispatch uses the existing revision/digest and selected IDs. Include no-draft, ineligible, empty, failed-query, disabled-send, and dispatch-error states.
- **AC4:** Exercise sent with no bids, sent with bids, award pending, and issued states. Confirm the stage label, delivery retry, revision, comparison/award, monitor, and earlier-history access without a fabricated state transition.
- **AC5:** Check keyboard focus/labels and axe results in the focused rendered suite. In a browser, inspect 1440px, 820px, and 390px layouts, scrolling, form use, no page-wide overflow, and console/network errors. Use local or mocked data; send no real invitation.

Commands after integration:

```sh
cd frontend && npm test -- src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/ProcurementBasketComparison.test.tsx src/features/procurement/ProcurementBasketMonitor.test.tsx
cd frontend && npm run typecheck
cd frontend && npm run build
git diff --check
git status --short
```

The final handoff records exact results, any unrun checks, touched files, preserved dirty work, and remaining visual or workflow risks. No commit, push, deployment, seed, migration, production communication, or external send is part of this task.
