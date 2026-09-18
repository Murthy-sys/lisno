# Procurement items under approved estimate budgets

## Outcome and current evidence
The user's clarified request keeps Record purchase/receipt UI removed, but lists approved estimate items and each item's estimated budget, with procurement subitems added underneath. The prior flat-table-only implementation is superseded by this grouping; its removal of the separate old purchase card/dialog remains.

The backend procurement resolver already reads immutable approved estimate snapshot lines, stable line IDs (or established legacy keys), commercial version/round and integer-paise line amounts. GET /procurement/projects projects them into sections and items. It retains included zero-quantity lines; the frontend display helper currently filters zero-budget lines, so the grouped detail must explicitly preserve all canonical selected lines. Existing ProjectProcurementItem rows have only a project identity, so a safe persisted source link is required. Its current project-wide unique index prevents using the same material under different parent estimate items.

## Product and UX
Show compact estimate sections and item rows with room, specification/catalogue identifier, estimated quantity/UOM and **Estimated budget** from the approved line. Each row has Add item and a disclosure for its own procurement table. New item forms retain item name, brand, configured UOM, unit price and saved/reusable vendor controls. Lazy-load independently paginated child tables when opened; do not group only the first project-wide page. Reuse existing typography/tokens with thin dividers, compact controls, responsive stacked metadata and no separate spend-summary card or receipt form.

Unit prices remain unit prices: do not sum them into spend/remaining budget without quantities, and do not mutate the finance ledger, budget, approved estimate, tasks or approvals as a result of adding these child records. Budget is the canonical pre-GST line amount, clearly labelled Estimated budget. Keep all selected lines including zero-budget lines.

The user's follow-up requests a more polished professional screen. Use a compact title with an estimate badge, tinted section headers with item counts, aligned budget/action columns and a subtle expanded-row accent. Child tables sit on a light inset background with restrained borders. Keep the established palette, small typography, 16px control icons, 44px mobile controls and responsive labelled table rows. No new dashboard summaries, finance values or dependencies. Preserve editor drafts even when background project refresh fails, violates integrity or removes the eligible project: hide stale lists/budgets, retain only the blocked editor until explicit dismissal. Revoked workspace access and project navigation still remove the editor.

Existing rows are never matched by names or silently backfilled. An Items needing assignment section keeps unlinked/noncurrent records visible. A legacy unlinked row can be explicitly assigned once while editing. A previously linked row cannot move to another estimate item. Noncurrent linked rows remain visible for review; current-source mutation is blocked pending reconciliation.

### Table value chips
Follow-up: render item name, brand, selected vendor, UOM and unit price as compact, lightly tinted text chips. Use a stable field-based palette from existing color tokens, dark readable text, soft borders and content-sized wrapping. Keep missing vendor neutral and historical availability notes outside the chip. Chips are plain text, not interactive controls or status indicators; preserve table semantics, price alignment, mobile labels, editing and all source/budget behavior. Verify existing table interactions, frontend typecheck/build and rendered contrast/overflow at desktop and phone widths. No API, dependency or persistence change is needed.

## Frozen contract
- No new route or expanded permission. Reuse existing Procurement-only item operations and their project access checks.
- New create body adds required flat `estimateId`, positive integer `estimateVersion`, and `sourceLineItemKey` to current itemName/brand/uomId/vendorId/pricePaise.
- Update preserves expectedVersion CAS. Optional source triple must be all-or-none; when provided for an unlinked legacy row it explicitly assigns once. Linked rows must retain the exact same source and validate against the current approved snapshot. Omission preserves legacy unlinked edits and current linked identity.
- Persist nullable source fields `estimateId`, `estimateVersion`, `estimateReviewRoundId`, `sourceSectionId`, `sourceLineItemKey`. Server derives section and approval-round identity. All identity-bearing fields absent means legacy; partial/malformed lineage fails closed. Nullable reviewRoundId is allowed only when the existing canonical legacy approval resolver establishes that source.
- DTO adds `estimateSource: null | { estimateId, estimateVersion, estimateReviewRoundId: string | null, sourceSectionId, sourceLineItemKey }`.
- Separate item-list query schema adds an all-or-none exact parent triple filter plus `unassigned=true` (mutually exclusive). Unassigned returns legacy or noncurrent source rows, using the current canonical tuple/line set. No filter retains project-list API compatibility. Existing q/limit/offset remain; vendor-list validation stays narrow and unchanged.
- Include parent lineage in frontend query keys and validate response project/parent identities. Invalidate the project's child-list prefix on mutation. Source conflicts invalidate eligible-project data while preserving user drafts and requiring current-source review.
- Backend mutation validates canonical source and coordinates source reads/writes in its existing Mongo transaction, preserving actor checks, audit, CAS and race/rollback safety. No current mutable-estimate or name fallback is added.

## Index and compatibility
Replace only the known project-wide unique index with a named unique index over projectId, estimateId, estimateVersion, sourceLineItemKey, itemNameNormalized, brandNormalized, uomId, vendorId. This permits identical materials under different parents while preventing same-parent duplicates. Missing/null lineage keeps legacy uniqueness.

Prepare `backend/src/migrations/project-procurement-source-index.ts` and focused tests, default read-only dry run. Check exact index definitions, partial lineage, duplicate groups and conflicts; record index metadata; create new unique index before dropping only the known old index. No broad syncIndexes or data rewrite. Apply/rollback require deliberate invocation; rollback refuses when the old project-wide uniqueness is no longer satisfiable. Index transition is a deployment prerequisite on an existing database; no live migration, deployment or production mutation is authorized or run in this task. No dependency/lockfile changes.

## Acceptance and verification
1. All selected approved estimate items, including zero-budget lines, display the exact approved line budget under the right project/room.
2. Add item submits the precise estimate/version/line source and shows the saved row only under that parent after save/reopen; existing configured UOM and vendor reuse work.
3. Same material under two parents succeeds; same-parent duplicate fails. Wrong project/estimate/version/excluded key, stale CAS and concurrent source changes cannot write or leak records.
4. Pagination/search stay parent-scoped beyond the first page. Existing rows remain visible and require explicit assignment; linked identity cannot silently move.
5. No Record purchase/receipt controls return, and no finance/approval/task side effects occur.
6. Route/schema/OpenAPI, asymmetric identity and unequal-budget tests, replica-set transaction/rollback/concurrency cases, migration dry-run/rollback tests, frontend grouped interaction/accessibility, desktop/tablet/mobile browser checks, typechecks/builds and dirty-work preservation pass.

Standing autonomous Mode A authorization applies. No material product choice remains open. Parent owns contract and integrated documents; workspace writers may not cross boundaries.
