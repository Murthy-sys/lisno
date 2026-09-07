# Super Admin Main Basket and Sub Basket configuration

Date: 2026-09-07
Status: Proposed — awaiting specification approval

## Goal

Simplify the Super Admin creation dialogs by removing Description, and let a user add or select a Sub Basket while creating a Main Line. Persist the Main Line's association with both the selected Main Basket and Sub Basket.

## Current behavior and evidence

- The Configuration screen is implemented in `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`, at `/admin/configuration/estimation`.
- `BasketEditorDialog` is shared by Add main basket and Edit main basket. Both currently render Description. Creation accepts a name and optional description; display order is allocated automatically.
- `CreateItemDialog`, currently titled Add estimation item, renders Main basket, Main Line name, and Description. It selects an active Main Basket and calls `createKnowledgeMainLine(basketId, input)`.
- `backend/src/models/AiEstimatorKnowledgeMainLine.ts` stores an immutable `basketId`. There is no Sub Basket entity or association in the inspected backend/frontend source.
- Main Line names are unique within their Main Basket for non-archived records. List/detail contracts expose `basketId` and `basketName`.
- Main Basket and Main Line writes use the existing knowledge services, actor checks, audits, and transactional persistence. Basket deletion already cascades through Main Lines and their configuration/history.

## Scope and non-goals

In scope: creation-form changes, parent-scoped Sub Basket creation/selection, persistent mapping, list/detail visibility, authorization registration, cache synchronization, and compatibility with existing records and basket deletion.

Out of scope: redesigning the Configuration screen; removing stored description data; changing other specification/vendor descriptions; editing or moving existing Main Lines between baskets; standalone Sub Basket rename/archive/delete management; changing calculations, approvals, OCR, or estimation rules; seeding, backfills, deployment, commits, or production writes.

The existing Edit main basket description field remains available: the request specifically identifies the new-basket dialog.

## Proposed UX and requirements

1. Add main basket contains Basket name and its existing actions, with no Description input. New baskets omit description from the creation request; existing stored descriptions remain intact.
2. The Main Line creation dialog contains Main basket, Sub basket, and Main Line name, with no Description input.
3. Main basket supports selecting an active basket and an Add main basket action within the creation flow. Creation returns to the preserved Main Line form and selects the new basket.
4. Sub basket supports selecting a child of the selected Main Basket and an Add sub basket action. The add form asks only for Sub Basket name; its parent is the current Main Basket. Successful creation selects the new Sub Basket and preserves the Main Line name.
5. Sub Basket controls remain unavailable until a Main Basket is selected. Changing Main Basket immediately clears the previous Sub Basket selection. Late responses for another parent must not replace the current choices.
6. New Main Lines created through this UI require both selections and a nonblank name. An empty Sub Basket list gives a clear Add sub basket action.
7. Sub Basket choices must support the full available collection through the established pagination/search conventions. Loading, failed fetch, retry, empty, duplicate-name, and pending-save states must be explicit. Failed fetches must not be presented as an empty collection.
8. Canceling a child add form returns to the Main Line form with its prior values. Failed saves retain entered values. A successfully created basket remains reusable if the user later cancels Main Line creation; do not silently delete it.
9. Show the saved Sub Basket name alongside the existing Main Basket information in item list/detail identity presentation. Existing records with no Sub Basket continue to render naturally without a fabricated mapping.
10. Preserve accessible labels, keyboard operation, dialog focus return, duplicate-submit protection, and usable narrow-screen layout using existing controls.

## Data and API contract

- Add a distinct Sub Basket resource with a stable ID, immutable parent `basketId`, normalized name, automatically allocated display order, version, actor metadata, and timestamps. Use a dedicated model/collection so parent baskets retain their current identity and uniqueness semantics.
- Enforce normalized Sub Basket name uniqueness within a Main Basket. The same Sub Basket name may exist under different Main Baskets; neither labels nor names are join keys.
- Add parent-scoped list/create endpoints at `GET` and `POST /admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets`, following existing pagination, validation, error, and audit conventions. Register each operation in authorization and OpenAPI, with access consistent with the corresponding Main Basket list/create capability.
- Extend Main Line creation with `subBasketId`. Retain the route's `basketId` as the parent source of truth. Validate on the backend that the Sub Basket exists and belongs to that Main Basket, and that the parent is eligible for creation. Reject mismatches and missing references without partial Main Line/revision/audit writes.
- Persist `subBasketId` as an immutable nullable association. Return the association in Main Line responses and `subBasketId`/`subBasketName` in list/detail responses. Preserve it in duplication and relevant identity/audit serialization; resolve names from IDs.
- Existing records and older callers that omit `subBasketId` remain supported as legacy unassigned records. New UI creation requires it. Keep optional description API fields for backward compatibility while omitting them from the two requested creation forms.
- Retain Main Line name uniqueness and display order scope at Main Basket level. Sub Baskets do not change existing Main Line identity, calculations, or revision/completeness rules.
- Update successful-create cache handling so both selectors and item list/detail show persisted values immediately and after reload. Sub Basket query keys include their parent ID.

## Integrity, lifecycle, and permissions

- Preserve the established service and direct-Mongoose architecture, actor guards, transactions, and audit conventions. Align any affected test doubles or alternate implementations with the changed service contract.
- Parent deletion must atomically remove its Sub Baskets along with the existing Main Line cascade. Extend deletion impact/confirmation to make Sub Basket removal visible without adding a separate deletion workflow.
- Coordinate Sub Basket creation and Main Line attachment with parent deletion using the existing dependency-guard pattern, preventing orphaned records under concurrent requests.
- Main Line duplication keeps the original Sub Basket association; legacy duplication remains unassigned. Historical approvals/revisions are not rewritten.
- No permission expansion: unauthorized users cannot create or enumerate Sub Baskets through direct API calls, and UI controls follow backend-provided capabilities.
- Use existing safe error reporting and audit infrastructure; add no sensitive diagnostic payloads or external side effects.

## Assumptions and decisions for approval

- “New main basket model” refers to the Add main basket modal; “main line” refers to the existing Add estimation item dialog.
- Each Sub Basket belongs to exactly one Main Basket, and each newly created UI Main Line selects exactly one Sub Basket.
- Adding/selecting both basket levels within the Main Line form is the intended workflow.
- Existing unassigned Main Lines remain usable; assigning them retrospectively is outside this request.
- A separate child resource is preferred over nesting Sub Baskets inside the Main Basket document: it supports stable references, scoped uniqueness, and paginated selection without expanding the parent document indefinitely. It requires explicit cascade handling, covered above.
- No additional unresolved decision blocks this proposed specification. Approval confirms the assumptions above, particularly required Sub Basket selection for new UI Main Lines and parent-scoped Sub Baskets.

## Compatibility, rollout, and risks

- The schema/API extension is additive. Missing legacy associations serialize as null; existing descriptions are preserved. No data backfill or reassignment is required.
- New collection/index creation follows the repository's deployment conventions. Implementation must verify required indexes and replica-set behavior locally; no live index operation or migration is authorized here.
- Release the backend capability before or together with the frontend. Reverting the new UI leaves additive data intact; do not drop Sub Basket records on rollback. A backend rollback after creating Sub Basket data needs a compatibility review because old deletion paths do not know about the new collection.
- Principal risks are stale parent/child selection, cross-parent attachment, incomplete serializers/duplication, duplicate-name races, and orphaned children during deletion. Acceptance checks must exercise each.
- Initial unrelated worktree changes: `.codex/config.toml`, `AGENTS.md`, and the untracked 2026-09-07 codex-agent-selection-execution-flow spec/plan. Preserve all of them. No application files were modified during discovery.

## Acceptance criteria and verification

- **AC1 — Description removal:** Neither Add main basket nor Main Line creation renders or submits Description. Creation still succeeds; existing description data and unrelated description controls remain intact.
- **AC2 — Add/select workflow:** Users can select existing or create new Main/Sub Baskets within the Main Line flow, preserving entered values and selecting newly created resources.
- **AC3 — Correct mapping:** A created Main Line persists both stable IDs; list/detail and reload display the correct mapping. Verify two distinct Main Baskets with identically named Sub Baskets.
- **AC4 — Parent isolation:** Changing Main Basket clears Sub Basket; late responses cannot restore the old choice. Direct API requests with another parent's child or a nonexistent child fail without partial writes.
- **AC5 — Validation and access:** Required UI fields, scoped normalized-name uniqueness, concurrent duplicate creation, direct API authorization, loading/error/retry states, and pagination behave correctly.
- **AC6 — Compatibility:** Legacy Main Lines remain readable/editable/duplicable without a Sub Basket; new duplication preserves its mapping. Existing Main Line naming, order allocation, and revision behavior remain consistent.
- **AC7 — Lifecycle:** Parent deletion includes Sub Baskets in impact and atomic cleanup; concurrent child creation/attachment cannot leave orphans. Verify transactional changes with replica-set integration tests.
- **AC8 — Usability:** Rendered keyboard/focus interaction, accessible names, cancel/retry behavior, and desktop/narrow-screen layouts pass focused checks.

Verification after implementation: focused backend model/service/route/authorization and replica-set integration tests; focused frontend creation, API, cache, compatibility, and deletion interaction tests; backend/frontend typechecks and builds; broader regression suites proportional to the shared contract changes; rendered responsive checks; `git diff --check` and final worktree inspection. No implementation tests have run at the specification stage.

## Workflow status

Only this specification is created. The separate task plan will be created after specification approval, followed by task-plan approval and the required execution-mode choice before implementation.
