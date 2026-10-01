# Lead workspace reference redesign task plan

**Date:** 2026-10-01

**Status:** Completed and verified

**Approved specification:** [Lead workspace reference redesign](../specs/2026-10-01-lead-workspace-reference-redesign-design.md)

## Delivery boundary

Redesign `/estimator-sales` to reflect the supplied reference while retaining the existing search, exact-stage filter, project initiation, quick review, lead/estimate links, and eligible PDF export. Keep the current API and permission contracts. Do not add the reference's unsupported filters, sorting, bulk selection, grid mode, or growth chart. Use the existing `projects-living-room.webp` asset and page-local CSS; add no dependency.

The worktree was clean before the specification was created. At plan creation, only the new specification is untracked. Before implementation, capture `git status --short` and any per-target diff again; preserve any new unrelated changes and resolve ownership of a dirty target before a writer edits it. Do not stage, commit, push, deploy, seed, or mutate production.

## Ordered tasks

| Task and dependency | Owner and affected area | Deliverable and acceptance link | Verification |
| --- | --- | --- | --- |
| **T0. Baseline and source contract**. Starts after execution-mode choice. | Primary agent; read-only inspection of `LeadDashboard.tsx`, its two test files, relevant CSS import order, asset, and current worktree. | Record existing actions, query behavior, visual constraints, and dirty-path diffs before writes. Establish stable accessible labels and action destinations for T1/T2. Supports AC2–4 and scope preservation. | Run the current focused Lead dashboard and PDF tests; inspect errors rather than assuming baseline pass. |
| **T1. Route markup and page styling**. Depends on T0. | One frontend source owner for `frontend/src/features/leads/LeadDashboard.tsx` and a new page-local `frontend/src/features/leads/lead-workspace.css`. Existing shared CSS is read-only unless the primary agent explicitly reassigns a necessary, bounded override. | Build the interior header, four accurate metric treatments, search and all-nine-stage filter, aligned seven-group wide list, and labelled compact rows at narrower widths. Derive dates, next actions, statuses, initials, and amounts from existing records. Preserve initiation, quick review, links, PDF error handling, and query states. Supports AC1–5. | Check TypeScript while editing; inspect actual route at wide and intermediate widths; verify no unrelated selector effects. |
| **T2. Behavior regression coverage**. Depends on the T1 markup/accessible-name contract, then may run while T1 visual polishing continues if files remain separate. | Separate test owner for `frontend/src/features/leads/LeadDashboard.test.tsx`; `LeadDashboard.pdf.test.tsx` only if PDF control markup changes. No source or CSS edits. | Test real filter request values for all nine stages, search fields supported by the API, accurate metric copy and estimate-failure isolation, created/next-action display, empty versus no-match messaging, permission-limited controls, route targets, quick-review focus, and export eligibility. Keep existing initiation and PDF tests meaningful. Supports AC2–4. | `cd frontend && npm test -- src/features/leads/LeadDashboard.test.tsx src/features/leads/LeadDashboard.pdf.test.tsx`. |
| **T3. Integrated review and corrections**. Depends on T1/T2. | Primary agent; final diff and any focused fixes returned to the explicit file owner. | Reconcile component, CSS, and tests; verify stable-ID joins, truthful metrics, permission gates, no dummy controls, and no shared-style regressions. Resolve findings before final verification. Supports AC1–6. | Inspect `git diff` including untracked files; run focused tests again on the integrated tree. |
| **T4. Final verification and rendered QA**. Depends on T3. | Primary agent in Mode B; verification runner after writers finish in Mode A. Verification only, except focused fixes returned to the owner. | Prove wide desktop, intermediate workspace width after the sidebar, narrow mobile, and 200% zoom. Exercise search, stage selection, quick review/focus, primary navigation, and error/empty presentation with deterministic data. Inspect relevant other estimation route for CSS spillover. Supports AC1, AC3–6. | `cd frontend && npm run typecheck`; `cd frontend && npm run build`; focused tests above; rendered keyboard/responsive checks; browser console and network review; `git diff --check`; `git status --short`. Report any unrun checks exactly. |

## Ownership and parallel work

- The primary agent owns product interpretation, the approved specification, this plan, shared-file decisions, integration, and final reporting.
- In **Mode A**, independent read-only baseline audits of UI/CSS risk and test/API behavior may run together at T0. One frontend source writer owns both TSX and its page-local CSS because the markup and styling depend on the same layout contract. After that writer declares the accessible-name and action contract, a test writer may edit only the two named test files while the source writer polishes the page-local CSS. An integrity reviewer follows substantial source changes; a verification runner checks only the integrated tree after all writers finish. No two writers edit the same file.
- In **Mode B**, the primary agent executes T0–T4 inline and performs the equivalent integrity and verification review sequentially, without implementation subagents.
- Backend files, `leadsApi.ts`, shared tokens, role themes, app shell, other route components, and lockfiles are outside writer ownership. Escalate a genuinely required contract change to the primary agent and update the approved documents before broadening scope.

## Acceptance and checks

| Specification criterion | Proof required |
| --- | --- |
| **AC1: Reference hierarchy and visual restraints** | Rendered wide/intermediate/mobile comparison: header image crop and readable text, four metrics, search/filter strip, dense list; no shadows, glass, harsh gradients, decorative Lucide icons, or hover-only actions. |
| **AC2: Truthful data** | Tests and review prove values come from the current authorized responses, saved value includes drafts with accurate copy, pagination is described honestly, and no sample `+12%` or stage counts appear. |
| **AC3: Existing behavior and permissions** | Tests exercise search and every exact stage value through the current endpoint; initiation, quick review, navigation, and eligible export remain permission- and status-correct. |
| **AC4: Async and empty states** | Tests cover list loading/error/retry, estimate-only failure, background refresh, empty pipeline, and no matching leads; rendered check confirms controls remain usable. |
| **AC5: Responsive and accessible operation** | Browser check at approximately 1440px, 1100px, and 390px viewport widths plus 200% zoom; keyboard focus, labelled controls, readable long text, touch targets, no page overflow. |
| **AC6: Quality and isolation** | Focused Lead and PDF tests, frontend typecheck/build, rendered route check, nearby estimate route smoke check, `git diff --check`, and final status inspection. |

No backend, migration, external delivery, or production action is part of this plan. There is no repository lint script, so lint is not a claimed verification step.
