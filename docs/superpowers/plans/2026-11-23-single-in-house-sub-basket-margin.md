# Task plan for one In-house margin section per Sub-Basket tier

The specification and task plan were approved on 23 November 2026. The selected execution mode was parallel implementation. The [approved specification](../specs/2026-11-23-single-in-house-sub-basket-margin-design.md) defines acceptance criteria AC1 through AC5. The worked example is Signature in **POP Gypsum**. Its editor should open with one In-house section showing Labour 15% / 20% and Material 10% / 20%. A Super Admin must be able to review and apply those prefilled values to eligible components, including the 25% / 35% component referenced as **popp**.

## Dependencies and ownership

| Order | Deliverable | Owner in parallel mode | Depends on | Acceptance |
| --- | --- | --- | --- | --- |
| 1 | Define the shared default, proposal, preview and retry contracts | Primary agent | Execution mode selection | AC1–AC5 |
| 2 | Resolve existing defaults and group manual proposals on read | Backend implementer | 1 | AC1, AC4 |
| 3 | Apply a reviewed default across eligible components in one transaction | Same backend implementer | 2 | AC2–AC5 |
| 4 | Show one editor, support prefilled saves and present grouped exceptions | Frontend implementer | 1 | AC1, AC2, AC4, AC5 |
| 5 | Review and verify the integrated workflow | Primary agent, integrity reviewer, verification runner | 2–4 | AC1–AC5 |

After task 1, the web work can run alongside backend tasks 2 and 3. The primary agent owns shared types, the client, HTTP validation, OpenAPI and contract tests. The backend owner handles models, domain functions, services and domain/replica-set suites. The frontend owner handles the web feature and its rendered tests. In inline mode the primary agent executes the same work sequentially. Before edits, capture the dirty paths and inspect each assigned file, including untracked files from the earlier margin and chip changes.

### 1. Define the read and write contracts

- Trace `shared/knowledge/knowledgeSubBasketMarginTypes.ts`, its backend counterpart, the shared client, and `knowledge-margin-decision-schemas.ts`. Give the shared default an identity composed of owning Sub-Basket, tier and mode. Retain component IDs for edit evidence, target rows, exclusions and comparisons.
- Define the read states the panel needs: saved shared default, prefilled legacy proposal, conflicting choices and unconfigured. Include enough information to offer review when valid prefilled values differ from current rows. Define one In-house notification per Main Line and tier, with identifiable component proposals under it. The server resolves the selected proposal from saved evidence.
- Give shared In-house decisions an explicit contract version or discriminator. Bind it to the preview and commit tokens. A cached component-scoped command cannot become a broader write. Retain the authenticated exact-receipt retry path for previously completed commands, including where the old request body must still parse. Keep existing PMC, Sub-vendor and scoped Signature restore callers compatible. Cover accepted, stale, wrongly scoped and replayed requests in HTTP and shared-client tests.

### 2. Resolve a single default and retain component evidence

- Extend the Sub-Basket baseline model and validators to read legacy component defaults and persist the shared In-house default per tier. Read the latest draft or otherwise active revision for each current Main Line. Use the full Sub-Basket membership, including eligible temporary lines.
- Implement the precedence table in the approved spec in `ai-estimator-knowledge-margin-matrix.ts` and the snapshot service. Compare complete sets in integer basis points. Deduplicate equal Labour/Material sets even if their source IDs differ. Show the competing choices if two approved sets disagree. Missing values stay unconfigured. Opening the panel and requesting a preview perform no writes.
- Keep manual field evidence on its originating component. Group genuine pending edits by owning Main Line and tier for the bell, review list and Main Line status. Preserve competing proposals for explicit selection and retain evidence while a baseline is unresolved. Cover copy, initialization, description-only and cost-only saves, update, revert, and historical records whose authorship cannot be established.

### 3. Preview, commit and reconcile

- Change the In-house decision planner to enumerate components on eligible lines belonging to the selected Sub-Basket. For each component, show the current and proposed Labour/Material values. Deduplicate the affected line count. Identify incomplete costs and blocked legacy shapes before commit. Check that the current legacy cost representation can express distinct Labour and Material rates.
- Enable explicit application of a valid prefilled legacy set even when the inputs have not changed. Distinguish establishing the shared default from replaying an already-applied decision. Include the zero-eligible-target case and a second identical save in regression tests.
- In the item service, revalidate the actor, membership, proposal, baseline and review token. Compose all reviewed changes for a line before saving its draft. Patch only the four margin fields on eligible cost rows. For an active-only line, use the established draft creation path and retain cleaned references. Persist the shared default, target changes, pending-state cleanup, audit and operation receipt atomically. Clear a resolved source proposal even if its own cost row already matched.
- Exercise rollback after an audit failure, concurrent saves, stale membership and exact replay using a Mongo replica set. Verify the existing Signature restore retains its reviewed line selection. Check that editable estimate and Procurement readers use the updated current draft and that active history, published estimates and issued BOQs preserve their recorded values.

### 4. Update the tier panel and bell

- In `KnowledgeMarginDecisionPanel.tsx` and `knowledgeMarginFields.ts`, render **PMC**, **Sub-vendor** and **In-house** once per tier, in that order. Give the In-house editor four accessible percentage inputs. Keep component names in the impact and exception details. Use the same shape in `KnowledgeModeDefaults.tsx` wherever it displays the Sub-Basket default.
- Allow review of the screenshot’s prefilled values without requiring an artificial input change. For conflicting legacy sets, show **Choose shared margins**, selectable source values and editable fields. For an empty tier, show **Not configured**. Preserve drafts across tier switches, multi-tier saves, dirty-close confirmation, read-only access and refresh recovery.
- Update the bell and candidate selection to use the server’s grouping. A line with two competing component proposals contributes one to the count and exposes both choices. Require the chosen component proposal before approval. Refresh the originating Sub-Basket, candidate and affected line views, including the source when only its pending status changed.

## Verification

| Acceptance | Concrete checks |
| --- | --- |
| AC1 | Use the screenshot fixture, conflicting approved sets, identical legacy sets and an empty tier. Assert one In-house fieldset with four inputs on all three tiers. Opening and dismissing each case leaves the database unchanged. |
| AC2 | Review the prefilled 15/20 and 10/20 ranges. Verify two component rows on one line and a sibling line receive the expected values. Assert the distinct line count, exact component IDs, preserved base costs, and isolation of other tiers, modes and a real line owned by the neighbouring **popp** Sub-Basket. |
| AC3 | Cover an active-only target, legacy shapes, a partially configured component and a zero-target save. Inspect before/after revisions, audit and receipt after rollback, stale review, replay and a competing decision. Test read-only and unauthorized identities. |
| AC4 | Create two manual proposals on one line, change a description, revert a margin and approve a selected proposal. Compare badge counts, selected values and remaining evidence with backend state. Include an unresolved baseline and an unflagged older difference that a preview would overwrite. |
| AC5 | Run the actual side-panel workflow at 390, 768 and 1440 px with keyboard navigation, labelled inputs, focus return and a sibling reopened after saving. Send a legacy component-scoped command and verify its write scope cannot expand. |

Start with the backend margin matrix, margin replica-set, downstream pricing, knowledge route and OpenAPI suites. On the frontend run the Sub-Basket margins, Mode defaults, decision client, cache and Main Line save suites. Run the mobile typecheck for shared contract compatibility. Finish with backend and frontend typechecks, full tests and production builds, plus `git diff --check` and `git status --short`. Record exact results and baseline failures. Verification uses isolated local data. Release the compatible backend before the new web command; the design requires no live backfill.
