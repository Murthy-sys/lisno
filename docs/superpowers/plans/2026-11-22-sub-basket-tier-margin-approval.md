# Task plan for Sub-Basket tier margins and exception approval

The specification and task plan were approved on 22 November 2026. The user selected parallel implementation. [Approved specification](../specs/2026-11-22-sub-basket-tier-margin-approval-design.md)

The end-to-end acceptance case starts with a Premium Sub-vendor default of 20% minimum and 30% maximum. Saving 20% / 35% on one Main Line changes its current draft and puts an exception on the Sub-Basket header. Super Admin sees which lines would change and approves the candidate. The Sub-Basket and its eligible Premium Sub-vendor lines then show 20% / 35%. The test must also check the distinct Signature, Functional, and adjacent Sub-Basket values after approval.

## Tasks and ownership

| Order | Deliverable | Owner in parallel mode | Depends on | Specification criteria |
| --- | --- | --- | --- | --- |
| 1 | Agree request, response, preview and retry contracts in code | Primary agent | Execution choice | AC1–AC9 |
| 2 | Store defaults and compare all three tiers from one read | Backend implementer | 1 | AC1, AC3–AC5, AC8 |
| 3 | Capture the pre-edit baseline, implement writes, and protect the routes | Same backend implementer | 2 | AC2–AC8 |
| 4 | Implement header, editor, exception review and Main Line feedback | Frontend implementer | 1 | AC1–AC6, AC9, AC10 |
| 5 | Integrate, review and verify the complete workflow | Primary agent, then integrity reviewer, then verification runner | 3 and 4 | AC1–AC10 |

Tasks 2–3 and task 4 can proceed in parallel after task 1. The primary agent owns shared types, the shared client, backend wire-contract definitions and any revisions to those contracts. The backend implementer owns the other affected backend files and tests. The frontend implementer owns the web feature and its tests. Keep the same owner for transactional edits because manual saves, bulk updates and Signature restore all use the item service. In inline mode the primary agent executes all tasks sequentially, including review and verification.

### 1. Establish the shared contract

- Recheck worktree status and relevant per-file diffs before assigning any writes. At plan creation the only existing change was the untracked specification.
- Extend `shared/knowledge/knowledgeSubBasketMarginTypes.ts`, `shared/knowledge/knowledgeApi.ts` and `backend/src/contracts/ai-estimator-knowledge-sub-basket-margins.ts`. Keep existing callers of per-tier reads and Signature restore compatible. Give the matrix its own all-tier query and response identity.
- Under the existing Sub-Basket margins route, define operations to read all tiers, preview a proposed change, save selected defaults and approve a specific exception. Use the same scope representation for preview and commit. A scope identifies tier, mode and any component by stable IDs. Direct edits carry validated pairs in basis points. Exception approval carries the saved candidate identity and scope. The server resolves the value.
- Define baseline provenance, explicit unset slots, saved ranges, configuration issues and exception count units. Preview returns before/after pairs, affected IDs, competing values, exclusions with reasons, blockers and a token bound to the reviewed state and command. A committed command carries a stable operation identifier. Return affected line IDs and a way to identify an already committed operation.
- Keep Main Line price and UOM provenance separate from margin provenance. Use distinct asymmetric sample responses to exercise every contract field needed by the frontend. Validate the shared client through its existing request-shape tests.

### 2. Implement canonical defaults and comparison

- Extend `backend/src/models/AiEstimatorKnowledgeSubBasket.ts` with optional, validated defaults, provenance and version data. Use the existing Sub-Basket lifecycle. Legacy documents must remain readable without a backfill.
- In the existing margin domain and snapshot service, load the Sub-Basket's full current membership once and project all three tiers. Include temporary and off-page lines. Resolve each by stable ID, using the latest saved draft or otherwise the active revision. Preserve the existing price/UOM projection and separate default Mode read.
- For a legacy Sub-Basket, project the first line's saved tier values as existing defaults, including explicit gaps. For owned defaults, compare every line, including the first. A source reorder or removal cannot redefine an owned margin. Reads and previews must be free of writes.
- Use the same domain comparison and margin-only patch logic for read, preview and commit. Distinguish a valid exception, a missing configuration, an incompatible target and a matching value. Match In-house Labour/Material by component basket/Sub-Basket identity. Preserve zero margins where valid.
- Verify with two Sub-Baskets, unequal values for all tiers, multiple similarly named components, an active-only line, an archived line, a temporary line, and an empty Sub-Basket. Include both owned and genuinely unmigrated documents. Test query behavior across multiple lines to catch per-line or per-tier repeated database loads.

### 3. Implement manual capture, Super Admin decisions and HTTP operations

- In `ai-estimator-knowledge-item.service.ts`, detect a real margin change during a normal tier Mode save. Capture all three tiers from the pre-edit snapshot on the first such write, then save the individual draft in the same transaction. Test the first line's first edit, a previously unset tier, an ordinary non-margin save, and the separate default Mode. Bulk propagation must not recursively create manual-edit evidence. Update fixture construction where it represents legacy data predating this behavior.
- Implement server-side preview for both direct edits and exception approval. For approval, verify current basket membership, tier, mode, component and candidate revision. Determine the precise patch and validate all selected scopes together. Preview competing exceptions, compatible blank margins, absent tiers/costs and blocked legacy structures. Permit an explicit direct default save with zero targets.
- At commit, recheck the stored sole Super Admin, snapshot token, source versions and membership under the existing parent and line coordination. A stale review returns a conflict. Apply the selected scopes as one transaction. Reuse draft creation and tier-aware saves, accumulating edits so multiple scopes on the same line cannot overwrite each other. Only changed lines need new draft content. Preserve existing unscoped and single-target Signature restore semantics against the canonical baseline.
- Commit the default, exact before/after scope values, target drafts and audit evidence together. Record actor, source lineage, competing values replaced, affected IDs and operation identity. Make an exact retry recognizable after a lost response, including after later edits. Reject reuse of an operation ID for a different command. Same-value saves must not append redundant approval events or advance configuration revisions.
- Update `routes/ai-estimator-knowledge-admin.ts`, `domain/route-operations.ts`, `openapi/ai-estimator-knowledge.ts` and the route inventory fixture. Apply the read/update operations and existing stored-actor guard to each endpoint. Runtime validators must reject duplicate scopes, invalid ranges, unauthorized requests, a replacement price on an approval, and the separate default Mode on a tier write.
- Use real Mongo replica-set tests for approval against a concurrent candidate edit, simultaneous approvals, membership changes, replay and a late audit failure. Compare all affected documents, audit counts and history after rollback. Use route and stored-actor tests for other roles, inactive users and invalid sole-admin state.

### 4. Implement the Configuration workflow

- Update `KnowledgeSubBasketMargins.tsx`, its scoped CSS and its integration in `KnowledgeBaseIndexPage.tsx`. Show tier rows with actual PMC, Sub-vendor and In-house ranges in the Sub-Basket header. Keep component details discoverable while the Main Line list is collapsed. Fetch when the Main Basket expands. Preserve the existing disclosure, rename and deletion interactions.
- Use the existing panel and form controls for editing one or several tiers and reviewing an exception. Show the selected candidate, current default, proposed values, competitors, affected lines and exclusions. Bind the confirmation to the displayed preview. Editing a field or selecting another candidate requires a fresh preview. Label approval with the matching tier and keep restore separate.
- Surface saved local exceptions in `KnowledgeModeDefaults.tsx` and the Main Line Mode editor context. Show approved or legacy provenance accurately when the former source line is absent. An unsaved edit must not change the header count.
- Update `knowledgeApi.ts`, `knowledgeQueryKeys.ts` and `knowledgeMutationSync.ts` for the matrix, per-tier reads and affected consumers. Handle stale previews, navigation during requests, duplicate clicks and refresh-only retries after a successful commit. Verify manual section saves refresh the header as well as approvals refreshing Main Line details, history, activation review, estimates and Procurement.
- Exercise the controls by keyboard. Test focus return, accessible names, pending and failure states, competing candidates, unavailable counts, zero targets, two baskets with delayed responses, and a committed approval followed by a failed refresh.

### 5. Verify the integrated result

| Checks | Evidence required |
| --- | --- |
| Domain and transactional behavior, AC2–AC8 | Exercise the worked Premium example through normal section save and approval. Also cover Functional, Signature, component-only changes, multi-tier direct updates, rollback, stale review and retry. Compare the original active revision and historical estimate/issued amounts, and verify current editable estimate and Procurement reads select the updated draft. |
| Authorization and HTTP contracts, AC2, AC6, AC7 | Verify route inventory, runtime schemas, OpenAPI and negative access tests. Check an approval for a candidate from the wrong Sub-Basket produces no disclosure or write. |
| Rendered web behavior, AC1–AC6, AC9, AC10 | Open Configuration > Main Basket > Sub-Basket using isolated local fixtures. Save a manual change, return to the header, inspect the impact, approve and reopen the source and a sibling. Test a competing candidate, blocked submit, stale preview and refresh failure. Inspect keyboard operation, overflow, console and failed requests at 1440, 768 and 390 px. |
| Integration and compatibility, AC1–AC10 | Review the final diff against ownership, run focused and full checks below, and verify shared client compatibility with the mobile typecheck. Verify read-only legacy initialization, baseline survival after source removal, and isolation across tiers and baskets. |

Run the focused commands from their respective workspaces, along with any new suites introduced by these tasks.

```sh
# backend/
npm test -- tests/ai-estimator-knowledge-component-margins.test.ts tests/ai-estimator-knowledge-sub-basket-margins.replica-set.test.ts tests/ai-estimator-knowledge-routes.test.ts
npm test -- tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/super-admin-authorization.test.ts

# frontend/
npm test -- KnowledgeSubBasketMargins.test.tsx KnowledgeModeDefaults.test.tsx KnowledgeIndexPage.test.tsx knowledgeApi.test.ts knowledgeMutationSync.test.ts KnowledgeItemWorkspace.configurationModes.test.tsx

# mobile/
npm run typecheck
```

After integration, run `npm run typecheck && npm test && npm run build` in both backend and frontend, then `git diff --check` and `git status --short` at the repository root. Record actual results, any unverified criterion and temporary QA output paths. Rollout order is backend before frontend. If the new actions are disabled later, the backend must continue honoring previously stored baselines.

## Implementation verification

- The final focused run passed 322 backend tests, five HTTP and OpenAPI checks, and 182 frontend tests. These cover matching-tier propagation, authorization, immutable history, rollback, replay, stale approvals, cache refresh and keyboard interaction.
- A real browser saved a Premium Sub-vendor exception, reviewed and approved it, then applied separate Signature and Functional edits. Reopening both Main Lines showed the approved Premium maximum of 35%. Both lines persisted the expected maximums of 25%, 35% and 10% for Signature, Premium and Functional respectively. At 390, 768 and 1440 px, the page fit the viewport. Automated accessibility checks reported zero violations in the margin table and approval dialog.
- A real Mongo replica-set test verified that the editable estimate and Procurement read the same updated Premium draft. The test also checked the original active revision, sent BOQ and published estimate against their historical values.
- Backend and frontend typechecks and production builds passed. The mobile typecheck and repository whitespace check passed. All database and browser verification used local test data. No data backfill is required.
- The full backend run reported 7,953 passed, 77 failed and 24 skipped. Of the 77 failures, 62 reproduced on the original revision and 13 passed on isolated reruns. The remaining two passed after correcting active-only draft rollback and updating the server bootstrap fixture for the receipt model. All 54 final transaction and downstream pricing tests and all 31 server tests passed.
- The full frontend run reported 7,293 passed and 112 failed. Of those failures, 108 reproduced on the original revision and four passed on targeted reruns. The form test now waits for its asynchronous pending-input report, and all 37 tests in that suite passed. The full suites were run before those final corrections. The passing reruns above cover the affected paths.
