# Sub-Basket tier margins and exception approval

Date: 2026-11-22
Status: Approved on 22 November 2026
Classification: Substantial, with financial configuration, persistence, and authorization risks

## Goal and confirmed scope

In Configuration > Main Basket > Sub-Basket, display the saved margins for Signature, Premium, and Functional together, allow Super Admin to update their defaults, and surface manually changed Main Line tier margins as exceptions in the Sub-Basket header. Super Admin can review an exception and approve its values as the new Sub-Basket default, synchronizing the corresponding Main Line tier margins.

**Confirmed by the user:** approval updates only the matching tier across that Sub-Basket. It does not copy one tier's margin into the other two tiers. Within the selected tier, only the reviewed margin mode/component is updated; unrelated margins and configuration remain intact.

Example: Premium Sub-vendor is 20% minimum / 30% maximum. A Main Line is manually saved with 20% / 35%. The Sub-Basket retains its 20% / 30% default and shows an exception. Approving that exception changes the Premium Sub-vendor default and eligible Main Lines' Premium Sub-vendor margins to 20% / 35%. Signature, Functional, PMC, In-house, and all base rates remain unchanged.

## Current behavior and evidence

Investigation was read-only. `git status --short` was empty before this specification was created. No implementation, data mutation, or tests have been performed in this stage.

| Verified behavior | Current source |
| --- | --- |
| Sub-Basket headers contain three clickable tier names. Values and mismatches are inside a tier-specific panel, not visible together in the header. | `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`, `KnowledgeSubBasketMargins.tsx`, `knowledge-sub-basket-margins.css` |
| Tier reads are separate and explicit. Only Signature has a bulk apply action; Premium and Functional are read-only comparisons. | `KnowledgeSubBasketMargins.tsx`, `shared/knowledge/knowledgeSubBasketMarginTypes.ts`, `shared/knowledge/knowledgeApi.ts` |
| Defaults are derived from the first non-archived Main Line ordered by display order and stable ID. Its latest saved draft wins over its active revision. Mismatch comparison excludes that source line. | `backend/src/services/ai-estimator-knowledge-sub-basket-margins.ts` |
| The Sub-Basket document has no owned margin-default fields. Consequently, a manual edit to the first Main Line changes the apparent default without a separate approval. | `backend/src/models/AiEstimatorKnowledgeSubBasket.ts`, `readSubBasketMarginSnapshot` |
| `GET .../margins` accepts a tier; `POST .../margins/apply` has no tier or replacement-value input and applies Signature defaults to other lines. It does not promote an exception into a default. | `backend/src/routes/ai-estimator-knowledge-admin.ts`, `backend/src/services/ai-estimator-knowledge-item.service.ts` |
| Existing bulk writes use Mongo transactions, reviewed version tokens, membership coordination, draft creation for active-only targets, and transactional auditing. | `applySubBasketMargins` in `ai-estimator-knowledge-item.service.ts` |
| Configuration reads and writes use the stored, active, sole Super Admin guard. Other roles cannot currently edit these margins. | `backend/src/services/ai-estimator-knowledge-actor.ts`, `backend/src/domain/route-operations.ts` |
| Signature is stored at the Mode payload root. Premium, Functional, and the separate default Mode namespace are isolated. | `backend/src/domain/ai-estimator-knowledge-mode-tiers.ts`, `shared/knowledge/knowledgeModeTiers.ts` |
| Margin helpers preserve mode semantics and match In-house components by stable basket/Sub-Basket IDs. Incomplete or incompatible saved configurations cannot safely receive arbitrary patches. | `backend/src/domain/ai-estimator-knowledge-sub-basket-margins.ts` |
| Main Line default displays depend on this summary, including its separate source price/UOM metadata. Mutation synchronization also refreshes estimate and Procurement consumers. | `KnowledgeModeDefaults.tsx`, `knowledgeMutationSync.ts` |

Existing regression coverage includes tier isolation, missing-tier behavior, current-draft selection, temporary lines, component identity, transaction rollback, concurrent writes, and stale membership. Relevant files include `backend/tests/ai-estimator-knowledge-sub-basket-margins.replica-set.test.ts`, `backend/tests/ai-estimator-knowledge-routes.test.ts`, and `frontend/src/features/ai-estimator-knowledge/KnowledgeSubBasketMargins.test.tsx`.

The 2026-11-15 specification is historical context. This request supersedes its restrictions to tier-name-only headers and Signature-only bulk editing.

## Recommended design and alternatives

**Recommended: store versioned margin defaults on the Sub-Basket and derive current exceptions against them.** Keep Main Line tier settings as saved configuration, with an explicit, transactional promotion operation. This makes defaults independent of line order and ensures a source-line edit is reviewable. Existing audit infrastructure records edits and approvals; a second generic approval subsystem or background synchronization job is unnecessary.

**Alternative: retain the first Main Line as the default source and approve by rewriting it.** This requires less persistence work, but source edits, reordering, archival, or deletion can silently change the default. Detecting those changes would require a separate baseline anyway. It is not recommended for this workflow.

## Product behavior

### Sub-Basket summary and editor

1. Show all three tiers in a compact, labeled margin matrix in the Sub-Basket header area, visible while its Main Lines are collapsed. Use tier rows and PMC, Sub-vendor, and In-house values, not three separate cards.
2. Show PMC and Sub-vendor minimum/maximum pairs. Show In-house minimum/starting gross margins, retaining separate Labour and Material values and component identity. Never average differing components into one percentage. A component-rich summary can expand within the Sub-Basket to reveal every pair.
3. Show explicit `Not configured`, loading, or unavailable states. A failed or missing tier must never borrow another tier's values or another line's configuration.
4. Provide `Edit tier margins`. The editor exposes Signature, Premium, and Functional independently, allows changes to one or several tiers in one session, and saves the reviewed set atomically. It never assumes that all tiers should share a value.
5. Show old and new ranges, target Main Line counts, configuration exclusions, and existing exceptions that the save would replace. Super Admin's explicit `Save and apply margins` action approves a direct default edit and propagates only those selected scopes.
6. Unchanged values produce no configuration revisions or redundant approval records. Inputs use established percentage controls, labels, and backend validation.

### Manual changes and exception review

1. After a Main Line tier margin is saved and differs from its Sub-Basket baseline, the header shows an `Exceptions (N)` control. An edit to the first Main Line is treated identically to any other line.
2. Exceptions are based on saved server data, not unsaved keystrokes. Each exception identifies basket, Sub-Basket, Main Line, tier, mode, and the applicable component identity, plus baseline and current saved ranges.
3. A single exception groups a Main Line's changed range pair for a tier/mode; In-house groups the Labour/Material pair by component identity. Multiple changed scopes count separately. The review makes this counting unit clear.
4. A manual save does not approve itself, including a save by Super Admin. It does not change the Sub-Basket default or other Main Lines. The Main Line editor and default display identify the saved exception as awaiting review.
5. Preserve the existing behavior that a saved draft is the current internal configuration. Pending exception values therefore remain local saved values used by existing current-configuration consumers. This approval controls promotion to the Sub-Basket and synchronization across Main Lines; it does not introduce an estimate/publication approval gate or hide pending values from existing pricing consumers.
6. `Review exceptions` shows the current saved value and the default side by side, with an impact preview. `Approve and apply to Premium` (or the matching tier) promotes the selected saved range and synchronizes that same tier/mode/component across eligible Main Lines.
7. If several lines propose different values for the same scope, the reviewer chooses one candidate. The preview explicitly lists competing exceptions that the chosen value will replace. No averaging, first-candidate selection, or silent last-write-wins behavior is allowed. Approval audits the replaced values as well as the selected value.
8. The source candidate must still be saved, valid, in the reviewed Sub-Basket, and unchanged when approval commits. The server reads its value from the reviewed snapshot; a client cannot submit an unrelated replacement as an exception approval.
9. Successful approval refreshes the header, default displays, and affected Main Line tiers. Resolved exceptions disappear. A later manual deviation becomes a new current exception. Returning a line to its baseline clears its current exception without fabricating an approval.
10. Invalid, cleared, or incomplete saved margins are visibly flagged as needing configuration and cannot be promoted. They are not silently counted as matching. Historical differences discovered on first use are labeled as existing differences; do not invent a change author or date.
11. A dedicated rejection/history inbox is outside scope. Existing restore-default behavior remains available as a separately labeled operation; it must not be presented as approving the candidate value.

### Propagation boundaries

- Include all current non-archived Main Lines in the Sub-Basket, including temporary items and lines outside the current search/page.
- Read each line's latest saved draft, otherwise its current active revision. Write drafts only; create a draft for an active-only target through the established service. Preserve active revision history and issued/customer artifacts.
- Patch only selected margin fields in the selected tier. Preserve rates, UOM, low-quantity limits, impacts, descriptions, other mode settings, other tiers, and the separate default Mode namespace.
- Match In-house components by stable Main Basket/Sub-Basket identity and range kind, not names, array positions, or matching percentages. Do not add components or split a legacy single cost into two costs.
- The impact preview distinguishes eligible targets from absent/not-applicable tiers and missing component setups. Missing tiers or cost objects remain explicitly unconfigured; this feature does not manufacture them. A malformed configuration on an otherwise targeted line blocks that operation before writes rather than causing partial propagation.
- Compatible existing cost structures with blank margin fields may receive validated margins. Legacy structures that cannot represent the chosen Labour/Material ranges must be corrected before inclusion.
- Defaults can be set when no eligible lines exist, with an explicit zero-target message. Later valid saved tier configurations are compared against those defaults. Adding automatic creation of pricing/cost configuration is outside scope.

## Data, API, and authorization contract

### Stored defaults and compatibility

- Extend the existing Sub-Basket model with optional, strictly validated margin-baseline data keyed by Signature/Premium/Functional and mode/component identity. Store integer basis-point ranges, baseline version, provenance, update actor/time, and approval audit linkage where applicable.
- Keep imported legacy values distinguishable from explicitly approved values. Imported existing defaults must not be presented as historically approved.
- For legacy Sub-Baskets without stored baselines, reads may display the exact current first-line ranges as `Existing default`, with provenance. Reads do not write or initialize data, and missing values do not fall back to another line/tier/revision.
- On the first authorized default mutation, capture the complete existing three-tier baseline and apply the reviewed changes in the same transaction. On the first manual tier-margin change before initialization, capture the baseline from the **pre-edit** snapshot in that transaction, before saving the candidate. Record explicit unconfigured slots so the edited value cannot later become an implicit baseline. This also makes a first-line change detectable without a live backfill.
- If no baseline exists for a candidate scope, show `No Sub-Basket margin configured`; approval explicitly establishes that default. Never auto-approve the first newly entered margin.
- Once captured, the baseline is owned by the Sub-Basket and remains stable through first-line reordering, removal, and archival. Use the existing Sub-Basket document lifecycle so owned state cannot become an orphan on deletion.
- Derive current exceptions from a full consistent snapshot, including the first Main Line. Persist edit/approval evidence through transactional audit events rather than mutable approval-history rows. Current exception counts can change as configuration changes; committed approval events remain immutable.

### API impacts

- Extend margin summaries with explicit tier/baseline provenance and versions, current exceptions, configuration issues, and propagation eligibility. Shared frontend/backend types and OpenAPI must agree.
- Provide an all-tier reviewed snapshot for the matrix and multi-tier edits, avoiding a client-assembled token from three unrelated reads. Keep explicit per-tier reads for existing Main Line consumers.
- Add a strict bulk-default update command accepting the reviewed snapshot token and explicitly selected tier/mode/component ranges. Reject unknown fields, duplicate scopes, invalid ranges, and the separate `default` Mode namespace.
- Add an explicit exception-approval command accepting the reviewed snapshot token and exact candidate identity/scope. Derive promoted values from stored candidate data. Do not overload a restore-default action with opposite semantics.
- Preserve the existing unscoped Signature apply contract as a restore-default operation, routing it through the same canonical baseline/validation safeguards. It must not silently promote a manually edited first Main Line once baselines exist. Additional tier restores, if exposed, must send an explicit tier.
- Preserve price/UOM `sourceConfiguration` provenance separately from margin-baseline provenance. A margin-only Sub-Basket default is not a fabricated Main Line revision or source price. Update `KnowledgeModeDefaults` so valid owned margins remain visible even when the old first source no longer exists.

### Permission matrix

| Actor | Read configuration margins | Save Main Line tier margins | Update Sub-Basket defaults | Approve exception |
| --- | --- | --- | --- | --- |
| Stored active sole Super Admin with the applicable route operation | Yes | Yes, using existing draft/version rules | Yes | Yes, by an explicit action |
| Other authenticated roles | No new access | No new access | No | No |
| Inactive actor, invalid identity, unauthenticated request | No | No | No | No |

Synchronize new protected operations with the canonical authorization registry, runtime request validation, and OpenAPI. Recheck the stored actor inside the transaction. Existing Super Admin-only editing is retained; adding another proposing role would be a separate permission change.

### Financial invariants

- Margins remain integer basis points; display conversion is 100 basis points per percent. Monetary rates remain integer paise.
- Preserve the current validation: PMC 1,000–2,000 bps; Sub-vendor 0–9,500 bps in 500-bps steps; In-house below 10,000 bps. Preserve minimum <= maximum/starting and the more specific existing payload validators.
- Preserve the different PMC/Sub-vendor and In-house calculation semantics. This feature changes configured margins, not formulas, GST treatment, baseline costs, or rounding.
- Approved estimates, financial baselines, published/issued documents, and historical vendor amounts remain immutable. Editable estimate and Procurement consumers continue to resolve current Main Line drafts through their established paths; vendor dispatch retains its activation gate.

## Transactions, conflicts, and failure behavior

- Validate and preview the full selected target set before committing. Save defaults, create/update target drafts, and append the approval audit in one Mongo replica-set transaction. Any target or audit failure rolls back everything.
- The review token covers Sub-Basket baseline/version, membership, source/candidate versions, all affected line/revision/section versions, tier scope, and relevant component identity. Coordinate writes with existing parent/membership fences so inserts, moves, deletes, edits, and concurrent approvals cannot escape the reviewed snapshot.
- Stale data returns a conflict with no partial change. Refresh and require review of the new impact; never retry against changed data automatically.
- Duplicate clicks and retries must not create duplicate approval events or drafts. A committed reviewed operation has a stable operation identity/audit reference. The same operation retry either returns its recorded result or a clear already-applied response; it does not replay against newer configuration.
- Audit direct default changes and exception promotions with actor, time, before/after ranges, exact tier/mode/component, candidate lineage, baseline versions, affected IDs, replaced conflicting values, and operation identity. Manual margin-change audit details include enough scope and old/new data to distinguish a margin edit from unrelated section edits.
- Refresh all affected tier summaries and Main Line details, previews, history, activation review, configuration contexts, editable estimate/catalogue data, and Procurement caches through existing query synchronization. Late responses after navigation must not contaminate another basket or tier.
- A successful commit followed by a refresh failure remains a successful save, with a refresh warning and retry. Do not submit the financial mutation again as a refresh mechanism.

## UX, accessibility, and performance

- Reuse the existing Configuration tokens, typography, `ContextPanel`, form controls, and feedback components. No new dependencies or general visual redesign are expected.
- The hierarchy is Sub-Basket name/actions, all-tier margin summary, then exception status/action. Keep rename/delete/disclosure behavior intact. Margin controls must not toggle the parent disclosure.
- Use a compact table on wide screens and clearly labeled tier groups on narrow screens. At 390 px, every value and review action must remain reachable without horizontal page overflow. Component detail may expand; never truncate the only available identity/value.
- Use explicit accessible names containing tier, mode, and Sub-Basket; keyboard operation, visible focus, panel focus trapping/return, announced results, and pending-submit locks. No hover-only controls or unnecessary animation.
- Loading and retry are scoped to the relevant read. Unknown exception counts are unavailable, not zero. Cache data with failed validation or a failed refresh is not actionable.
- Read margins only for expanded Main Baskets, reuse TanStack Query caches, and batch the all-tier snapshot over the same full Sub-Basket records rather than issuing per-line requests. The backend comparison must remain independent of visible-page pagination.

## Scope exclusions and operating constraints

No role expansion, new email/notification delivery, OCR changes, new approval system for estimates, formula changes, cross-Sub-Basket propagation, automatic activation, native-mobile redesign, deployment, production mutation, seed, or live migration is included. Shared API/types remain compatible with existing consumers, including mobile.

No backfill is required for the proposed lazy baseline capture. No reads may write. Rollout must introduce backend contracts before the new frontend actions are enabled. Once baselines exist, a rollback must retain awareness of those fields and disable new actions if necessary; reverting to a first-line-only backend would lose canonical-margin semantics. Do not delete stored baselines/audit history as a rollback shortcut.

Principal risks are first-line edits escaping detection, cross-tier writes, silently overwriting a competing exception, applying to hidden/archived/wrong-basket lines, rewriting historical prices, stale reviews, component misidentification, and partially synchronized caches. The contracts above and the verification matrix below address these directly.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | The Sub-Basket displays all three tiers' actual margin ranges and scoped exceptions/configuration issues. | Rendered matrix and review tests with unequal tier values, component pairs, missing/error/loading states; visual inspection at 1440, 768, and 390 px. |
| AC2 | Super Admin can edit any or several tiers' defaults and apply the selected changes atomically. | Replica-set test covering Signature, Premium, Functional, and multi-tier save; rendered editor/request validation tests. |
| AC3 | A saved manual change on any Main Line, including the first, appears as an exception without changing the baseline or siblings. | Pre-edit lazy initialization, initialized baseline, first/middle/temporary line, unknown baseline, repeated edit, and revert tests. |
| AC4 | Approval promotes the exact reviewed candidate only to the matching tier/mode/component across the Sub-Basket. | At least two unequal Sub-Baskets and three unequal tiers; verify other tiers/modes/components, costs, descriptions, and the default Mode namespace are unchanged. |
| AC5 | Competing candidates and unconfigured/incompatible targets are explicit; there is no silent overwrite or fabricated setup. | Review impact assertions, exact affected/excluded IDs, conflicting values, missing tier/cost, partial margins, legacy cost shape, and stable component identity tests. |
| AC6 | Only the stored active sole Super Admin can update or approve; a manual save does not itself approve. | Real actor/route authorization tests for Super Admin, other roles, inactive actor, invalid identity, and sole-admin constraint; UI restrictions and strict schema tests. |
| AC7 | Concurrent, stale, duplicate, and failed operations cannot partially update data or duplicate history. | Replica-set concurrency, membership race, changed candidate/baseline, repeated operation, audit failure, and rollback tests. |
| AC8 | Approved defaults survive source reorder/removal; draft precedence and immutable active/issued history are preserved. | Legacy initialization/provenance, missing-source read, active-only draft creation, source lifecycle, and before/after historical document assertions. |
| AC9 | Every affected UI refreshes the canonical saved values without cross-tier/basket cache reuse or accidental resubmission. | Mutation synchronization and delayed-response tests, refresh-failure recovery, Main Line default display tests, editable estimate/Procurement regression coverage as affected. |
| AC10 | The workflow is accessible, responsive, and preserves the existing Configuration interactions. | Keyboard/focus/dialog checks, accessible names, duplicate-submit guards, no horizontal overflow, and rendered browser checks. |

Start with the margin replica-set and route suites, then related component-margin, authorization, frontend margin/default-display, API, and cache suites. After implementation, run backend and frontend typechecks, tests, and builds, plus `git diff --check` and `git status --short`. Use the repository's existing replica-set helper; do not weaken transactions for a standalone database. There is no lint script, so do not claim lint passed.

Exact test results and any unrun checks belong in the implementation handoff. No test or runtime verification is claimed by this specification.

## Assumptions and open decisions

- Confirmed: approval propagates to the matching tier only.
- Assumption: manual edits remain locally saved current configuration pending promotion; the new approval does not defer their existing local pricing effect. This is made explicit in the UI and preserves the repository's current-configuration invariant.
- Assumption: updating defaults directly is an explicit Super Admin approval action. A separate person is not required, because the product has exactly one active Super Admin.
- Assumption: this request covers Signature, Premium, and Functional. The separate default Mode editor retains its existing behavior.
- Assumption: approving a selected candidate intentionally replaces competing values for the same tier/mode/component, after displaying that impact. It does not preserve competing local overrides as permanent exceptions.
- No unresolved decision currently blocks this proposed scope. Any feedback changing these assumptions must update this specification before implementation.

The user approved the specification and the [task plan](../plans/2026-11-22-sub-basket-tier-margin-approval.md) and selected parallel implementation.
