# Recommendation & Exclusions for temporary Configuration items

## Goal

Make the existing combined **Recommendation & Exclusions** section available for temporary items in both the web Configuration workspace and the mobile Configuration workspace. A user with Configuration update permission can edit and save its rules on a temporary item's Draft revision using the same workflow as an estimation item.

## Current behavior and evidence

- Web hides the section in `KnowledgeItemWorkspacePage.tsx`, redirects a temporary item away from an active recommendations tab, and skips its saved-section query in `useKnowledgeSavedSummary.ts`. The summary calls it **Not applicable**.
- Mobile omits the tab and Quick summary group in `KnowledgeItemWorkspace.tsx`, although its section query and recommendation editor already exist.
- The backend creates temporary items with the recommendations section marked `not_applicable` and rejects updates to that section in `ai-estimator-knowledge-item.service.ts`. Its current service test asserts that restriction.
- `shared/knowledge/knowledgeWorkspaceSections.ts` already maps the combined tab to the existing `recommendations` section. The existing editor, validation, stable-ID relationships, saved summary projection, and revision/version controls are reusable.
- Earlier workspace specifications explicitly preserved the three-tab temporary restriction. This request supersedes that rule for Recommendation & Exclusions only.
- Initial dirty paths are `mobile/.expo/dev/logs/start.log` and `mobile/.expo/types/router.d.ts`. They are generated files outside this change and must be preserved.

## Scope and behavior

1. Show the fourth, combined Recommendation & Exclusions tab for regular and temporary items in both apps. Keep the established tab order: Overview, Mode, Recommendation & Exclusions, Quality Parameters. On mobile, keep the native label and layout that fit the four-tab design.
2. Render the same recommendation/exclusion editor, loading/error/retry states, unsaved-change guard, validation, version conflict handling, read-only history, and permission behavior for temporary items that regular items receive.
3. Include the temporary item's saved recommendations in the web and mobile Quick summaries. Empty saved data reads **Not configured**; a missing revision reads **No revision available**. Summaries use confirmed saved data for the selected item and revision, never unsaved editor state.
4. Permit backend `recommendations` reads and Draft updates for temporary items through the existing section route and payload. Initialize that section as `not_configured` on newly created temporary items. A successful save derives `configured` or `not_configured` from the payload even when an older temporary section arrived with `not_applicable`.
5. Preserve immutable Active revisions. Previously created temporary items and Drafts remain readable; their recommendations become editable on a Draft without a database backfill. New Draft revisions and duplicates made from older temporary items should carry a usable recommendations applicability state without changing their source revisions. Other temporary-only section restrictions remain in force.
6. Keep recommendations optional for activation, as they are for regular items. Completeness and availability reflect the saved applicability/content through the existing backend calculations; no UI-generated completion value is introduced.

## Assumptions and non-goals

- “Recommendation and exclusion tab” means the one existing combined tab, not two new tabs.
- This change concerns Configuration items. It does not add a new recommendation rule type, change estimator selection or financial formulas, rewrite historical Active revisions, create a new API, or change authorization.
- The existing backend context path already reads configured recommendation payloads by section key; no new downstream contract is requested.

## Data, API, and UX impact

- No schema or endpoint change: retain `GET`/update of the `recommendations` section, section payload shape, version/CAS fields, and existing authorization operation.
- New temporary items start with a writable recommendations section. Existing temporary sections can still contain persisted `not_applicable`; a Draft save must not echo that legacy flag back and hide newly saved rules from completeness or AI context. Copies from old revisions normalize this one section in the new Draft/duplicate while leaving historical source records untouched.
- Web and mobile summaries must query/show the same selected revision. Permission denial, failed loads, missing catalog targets, and stale data must remain explicit rather than appearing as empty recommendations.
- No live migration, seed, production mutation, dependency, or lockfile change is expected. Existing records transition when a normal authorized Draft save or copy occurs. Reverting the code restores the former temporary restriction without deleting stored rules.

## Risks

- A web save can inherit `not_applicable` from an older temporary section. The backend must normalize its applicability on save so persisted rules become usable.
- Existing Active history may retain the old applicability and completeness snapshot. The new tab may show an empty historical section, but historical records must not be silently rewritten.
- Showing the fourth mobile tab must remain legible and touch accessible at phone widths. Tab navigation and Quick summary must not leak another item or revision's saved data.
- Relationship rules must retain stable target IDs, validation, dependency coordination, and version conflict behavior for a temporary source item.

## Acceptance criteria

1. New and existing temporary items show the combined tab in web and mobile; a user can open it by pointer/touch and keyboard where applicable. Regular items retain the same navigation.
2. An authorized user can save and reload a recommendation or exclusion rule on a temporary Draft. Backend data and the saved summary show the confirmed rule; unsaved, failed, or conflicted edits do not appear as saved.
3. A legacy temporary section marked `not_applicable` becomes `configured` after saving nonempty valid rules, or `not_configured` after saving an empty payload. Its Active source revision remains immutable; new Draft/duplicate copies are usable.
4. Other temporary sections that were unsupported remain rejected. Existing authorization, validation, CAS, stable-ID relationship checks, and regular-item behavior still pass.
5. Empty, loading, error/retry, no-revision, read-only/archived, and saved-summary states are accurate on both platforms. Mobile remains usable at representative phone widths; web tab and summary pass rendered interaction/accessibility checks.
6. Focused backend, frontend, and mobile regressions pass, followed by relevant typechecks/builds and `git diff --check`. No generated Expo files or unrelated changes are modified by this work.

## Open decisions

None. The repository already has one combined section and a matching backend payload contract.
