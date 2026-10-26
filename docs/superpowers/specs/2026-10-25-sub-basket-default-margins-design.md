# Sub-basket default margins

## Goal
Show PMC, Sub-vendor and In-house defaults beside every sub-basket name. Each control reports mismatched main lines and opens a review with an action to apply that mode's default.

## Evidence and decisions
- The screen is `KnowledgeBaseIndexPage` and its headers use `KnowledgeBasketCard`.
- Visible items are globally paginated. Derive summaries server-side over the full sub-basket, independent of filters and pagination.
- Canonical first main line is the nonarchived line with smallest `displayOrder`, then ID, including temporary items. Align the index order with that stable order. Both estimation and temporary items participate in mismatch counting and applying defaults; copy only the selected margin fields.
- Read the latest saved draft revision, otherwise the saved active revision. Name the source in the review. If that first line has missing or invalid margins, show unavailable; do not use another line or UI starter values.
- PMC defaults are `pmcMinimumMarginBps`/`pmcMarginBps`. Sub-vendor defaults are `subVendorMinimumMarginBps`/`subVendorMarginBps`. In-house defaults are labor and material minimum/starting gross margins. Count each mismatched line once per mode.
- Compare a target only when its current saved revision and configured Mode section resolve and that mode has complete, valid saved margins. Skip empty, missing, not-applicable and partially configured margins in both mismatch counts and apply targets. Check each mode independently; In-house requires both labor and material pairs. Saved zero margins remain configured wherever valid. Keep skipped lines in the snapshot token to detect later saves.
- Apply copies only selected margin fields into current drafts. Create a draft using existing revision logic when only an active revision exists. Preserve base rates, quantity limits, impacts, mode selections, other margins and immutable active/approved history. No automatic activation.

## Scope, constraints and failure behavior
No separate stored sub-basket override, custom default editor, migration, dependency, commit or deployment. The first main line remains the source of truth. Empty sub-baskets show no default. Unconfigured margins are skipped without filling in values or creating drafts. Configured mismatches with unrelated invalid settings still block applying defaults. Existing validation and authorization remain authoritative. Applying a mode is atomic and audited. A stale preview, changed membership or conflicting edit rejects the operation and requires refreshed review.

## API and UX
GET `/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets/:subBasketId/margins` returns source, population, version token and three default/mismatch summaries. POST `.../margins/apply` accepts mode and version token. Summary is server-derived and mutation requires configuration update authorization. Read-only users can inspect. Header controls remain visible for collapsed sub-baskets, while collapsed main baskets avoid loading hidden controls. Show explicit loading/error/retry and pending states. Reuse ContextPanel for accessible focus management and responsive review. Refresh knowledge, editable estimates and procurement consumers after success.

## Acceptance criteria
1. Three labeled controls show saved default percentages and full-scope mismatch counts next to sub-basket names.
2. Defaults remain stable across searches, pages and unrelated saves, and source changes are reflected after saving or deletion.
3. Each control previews the source, defaults and mismatched lines and applies only its selected mode.
4. In-house comparison includes both labor/material pairs and preserves each target's non-margin values.
5. Stale or invalid actions leave all lines unchanged; historical revisions remain immutable.
6. Empty, unavailable, read-only, loading, error and retry states are truthful and keyboard accessible; narrow widths do not overflow.
7. Existing configuration guards, validation, audit, query synchronization and unrelated work are preserved.
8. Only configured, saved margins contribute mismatches. Unset margins remain untouched by applying defaults; saving a configured difference makes it eligible. A current unset draft never falls back to its active revision, and an unset first source never falls through to another item.

## Execution context
User confirmed the target is the sibling lisno repository and requested autonomous implementation. Its original source is read-only under this session's filesystem sandbox. Prepare and verify an isolated copy under `/tmp/lisno-sub-basket-margins`, then request sandbox authorization to apply the concrete reviewed patch. Initial original dirty path: `.playwright-cli/console-2026-10-24T04-32-31-311Z.log`; leave it untouched.
