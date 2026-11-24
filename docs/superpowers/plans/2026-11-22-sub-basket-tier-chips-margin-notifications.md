# Task plan for Sub-Basket tier chips and margin notifications

The specification and this plan were approved on 22 November 2026. The selected execution mode is parallel implementation. The [approved specification](../specs/2026-11-22-sub-basket-tier-chips-margin-notifications-design.md) defines five acceptance criteria. This plan uses AC1 through AC5 in the same order. It builds on the existing, uncommitted margin approval feature in the shared worktree.

## Tasks, dependencies and ownership

| Order | Deliverable | Owner in parallel mode | Depends on | Acceptance |
| --- | --- | --- | --- | --- |
| 1 | Define which saved changes count, and preserve the distinction between pending edits and other differences | Primary agent | Execution mode selection | AC2–AC4 |
| 2 | Record manual margin edits and resolve them in the existing transactions | Backend implementer | 1 | AC3, AC4 |
| 3 | Use that evidence in matrix reads, approval and impact previews | Same backend implementer | 1, 2 | AC2–AC5 |
| 4 | Build the compact header, selected-tier side panel and bell | Frontend implementer | 1 | AC1, AC2, AC3, AC5 |
| 5 | Verify the combined workflow and review the final diff | Primary agent, integrity reviewer, verification runner | 2–4 | AC1–AC5 |

Tasks 2–3 and task 4 can run in parallel once the contract and fixtures are agreed. The primary agent owns shared types, client and HTTP contract changes, and integration. The backend owner handles persistence, domain rules, services and their tests. The frontend owner handles the web controls, Main Line editor and rendered tests. In inline mode the primary agent executes the same tasks sequentially. Before writing, capture current status and the diff for each assigned tracked or new file. Preserve the prior feature and other working changes.

### 1. Define the notification contract

- Trace a percentage input through the Main Line Mode editor, the tier data source, the section update endpoint and the stored audit. Compare a margin-only save with a description-only save, a newly configured component prefilled with defaults, and a mixed save. Identify where incidental defaults enter the payload.
- Keep the existing decision routes and stable scope identity. In both the matrix and per-tier responses, define `exceptions` as the currently approvable manual edits. The count is their length across all three tiers. Keep the full set of differing values available to the comparison and impact planner, including values that carry no notification. Update the shared/backend types, runtime schemas, OpenAPI and client tests if the wire contract changes.
- Where the server cannot distinguish a generated value from an edited percentage, carry the edited scope and bound from the control through the existing save request. The server checks it against the saved before/after numbers. An absent hint on an existing caller may establish an edit only when the server can prove it from that save. Re-sending the same number, enabling a tier, copying values or saving an unrelated field supplies no such proof.
- Agree on asymmetric fixtures before parallel work. Use a Premium Sub-vendor 20% / 30% default, one manually edited line at 20% / 35%, a copied line with the same differing value, and a second Sub-Basket with its own defaults. Exactly one line qualifies for the bell. Both differences remain inspectable.

### 2. Record and resolve manual edits

- Extend the current Main Line save path in `ai-estimator-knowledge-item.service.ts`. Compare margin fields in integer basis points by tier, mode, stable component IDs and bound. Track Labour and Material correctly when components are reordered or costs change. Preserve pre-edit baseline capture when the first Main Line is edited.
- Persist a small optional record of pending scopes on the owning Main Line, tied to its Sub-Basket, with the current proposed range and edit lineage. Distinguish an untouched legacy record from a known empty set. Update pending status and audit evidence in the same transaction as the saved edit. Repeated edits replace one entry. Reverting to the default clears it. An unrelated save preserves it.
- Keep the record with the same logical Main Line across normal draft creation and activation. Duplication into a new Main Line must start without the source’s pending edits. Respect membership changes, component removal and archival so obsolete evidence cannot appear under a new parent or revive after a restore.
- For existing records, use the indexed audit by entity type and ID in batched reads. Accept only evidence of an actual field edit that still matches the current line, scope, value and unresolved history. Leave ambiguous values available for comparison. Before the first new write to a legacy record, preserve all provable pending scopes, including edits in other tiers. Reads must perform no writes. No backfill is required.

### 3. Connect reads, previews and approvals

- Update `ai-estimator-knowledge-margin-matrix.ts`, `ai-estimator-knowledge-sub-basket-margins.ts` and `ai-estimator-knowledge-margin-decision.ts`. Use one eligibility rule for pending status in the matrix, per-tier summary and approval lookup. Compute differences that a save will overwrite from the full saved configuration. Keep incomplete settings visible as configuration issues.
- At commit, recheck the stored Super Admin, membership, candidate, saved value and preview version. Include changes to eligibility in snapshot freshness. In the same transaction, clear only pending scopes resolved by an approval, direct default save or Signature restore, including the candidate when its line already has the approved value. Preserve other pending scopes on that line. Retain retry receipts, rollback, existing draft precedence and immutable issued history.
- Exercise the domain, HTTP and replica-set paths. Cover a legacy mismatch with and without reliable evidence, a stale or ineligible candidate submitted directly, a mixed edit, an audit failure, concurrent approval and replay. Check that the read query count stays bounded as more lines are added.

### 4. Implement the header and side panels

- In `KnowledgeMarginMatrix.tsx`, `KnowledgeSubBasketMargins.tsx` and the scoped index/margin CSS, replace the inline table and text actions with light Signature, Premium and Functional chip buttons and the bell. Follow the screenshot’s placement and icon shapes. Preserve the independent disclosure, rename/delete actions and readable wrapping at 390 px.
- In `KnowledgeMarginDecisionPanel.tsx`, pass the clicked tier into the existing editor. Open directly on that tier with its saved ranges and component names. Keep edits across in-panel tier switches. Use the existing review and save actions, dirty-close protection and read-only behaviour. Expose comparisons, configuration issues and Signature restore as secondary actions within the panel.
- Show a badge for a positive confirmed count, an unbadged bell with an accessible empty state at zero, and a distinct unavailable or loading state. Open the review list for the originating Sub-Basket. Keep the bell usable as a focus-return target after the last approval. Use the server’s pending list for the Main Line status in `KnowledgeModeDefaults.tsx` as well.
- Preserve query scoping across baskets and tiers. Exercise manual-save refresh, an approval that changes only eligibility on the source line, a delayed response after navigation, a stale preview and a failed refresh following a successful save.

## Verification and completion

| Acceptance | Evidence to collect |
| --- | --- |
| AC1, AC5 | Render the real header at 390, 768 and 1440 px with a long name and collapsed children. Check order, light fills, overflow, focus, Enter/Space, Escape and separate disclosure. Open all three chips and compare the panel title and values with the chip used. Check the bell at zero, positive, loading and unavailable. |
| AC2 | From Premium change a margin, also edit Functional before saving, review and commit once. Reopen the source and a sibling. Verify the persisted ranges, close-with-unsaved-edits handling, stale review, refresh retry and read-only access. |
| AC3 | With the two-Sub-Basket fixtures, compare the count and identities after unsaved edits, non-margin saves, duplication, component reorder, mixed saves, repeated edits and revert. Verify the bell, Main Line message, approval API and unaffected neighbouring basket together. |
| AC4 | Approve one eligible scope. Verify an unflagged differing value is disclosed before replacement, other scopes keep their pending records, and an active-only target receives a draft. Check exact before/after data, audit, receipt and counts after rollback, concurrent edits and retry. |

Start with the backend margin matrix, margin replica-set, knowledge route and downstream pricing suites. On the frontend, start with `KnowledgeSubBasketMargins.test.tsx`, `KnowledgeModeDefaults.test.tsx`, `KnowledgeIndexPage.test.tsx`, the Mode editor save tests and `knowledgeMutationSync.test.ts`. Run browser interaction and accessibility checks against isolated local data. Finish with backend and frontend typechecks, full tests and builds, the mobile typecheck for shared contract compatibility, and repository diff/status checks. Record exact results and distinguish reproducible baseline failures from regressions. Ship the backend semantics before enabling the updated web controls.

## Verification results

- An independent run passed 64 backend margin, replica-set and downstream pricing tests, three HTTP/OpenAPI checks, 174 web editor, header and cache tests, and 54 native editor tests. Backend, web and native typechecks passed. Both production builds passed.
- The browser opened all three chips, edited Premium on a Main Line and approved it from the bell. A second line already had the same 35% maximum. A description-only save on that line kept the count at zero. Saving 35% on the first line raised the count to one. Approval synchronized Premium across three lines. A subsequent two-tier edit persisted and the sibling editor displayed the new value. Checks at 390, 768 and 1440 px included a second Sub-Basket with a long name. Automated scans of the header and approval dialog found zero accessibility violations.
- The full frontend suite recorded 7,302 passes and 110 failures. Of these failures, 108 matched the established baseline. A project-initiation focus check and a Main Line summary identity check both passed in final, isolated reruns.
- The full backend suite recorded 7,949 passes, 89 failures and 24 skipped. Of these failures, 61 had previously reproduced on the original revision. The other 28 passed on final isolated runs, including four margin cases exercised by the broad run while their implementation was changing.
- The final layout check confirmed that a bell showing one exception shares the desktop row with all three chips and fits alongside them beneath the name at 390 px. The final frontend production build and repository whitespace check passed. All browser fixtures used an isolated local database.
