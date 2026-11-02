# Unique project number after estimate creation

Date: 2026-11-02
Status: Approved by the user on 2026-11-02
Classification: Substantial, with transactional identity and concurrency risk.

## Goal

Assign a permanent, globally unique, human-readable project number when an estimate is first successfully saved. The format starts at `Lisno000001`, followed by `Lisno000002`, and so on.

The user's latest instruction replaces the earlier invitation trigger: estimate creation is the trigger. Project initiation and invitation creation/delivery must not allocate this number.

## Current behavior and evidence

- `backend/src/services/admin-project.service.ts` creates a Project and linked Lead during Project Initiation. Their UUID-based IDs are internal identities; neither has a human-readable project number. Invitation delivery follows project creation independently.
- `backend/src/routes/estimates.ts` handles `PUT /leads/:leadId/estimate`. It checks permission, current estimate/version, and pricing/configuration, then creates the first `EstimateModel` or updates the existing estimate inside a Mongo transaction. The first persisted draft has status `draft` and version 1.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` invokes that endpoint when saving a draft. Its submit action also saves the draft before submitting, so both paths converge at the same creation boundary.
- `backend/src/models/Estimate.ts` has a unique `leadId`, and `backend/src/models/Lead.ts` has a unique partial index for non-null `projectId`. These establish a stable Lead-to-Estimate relationship and at most one linked Lead per Project.
- Legacy creation through `backend/src/services/lead.service.ts` can create a Lead with `projectId: null`. Its eventual Project is created during approval by `services/estimate-project-handoff.ts`; numbering must not move that project-creation boundary earlier.
- `repositories/admin-project-summary.ts` already projects Lead-owned information onto Admin project summaries. Lead and Project repository mappers explicitly select fields; a model-only addition would not reliably reach the UI.
- `models/DesignVersionSequence.ts` and the Mongo repository demonstrate an existing persistent sequence pattern. That counter is scoped to design versions and must not be repurposed for project numbering.
- Searches found no existing `projectNumber` or `projectCode` contract in the current backend, frontend, or shared source.
- The worktree contains unrelated quotation/design changes and the completed initiation-field changes. The initial dirty-path set was inspected. Their relevant diffs must be captured again before implementation writers start and preserved throughout this work.

## Assumptions and open decisions

- “After creating estimation” means the first successful persisted estimate draft, including a save performed immediately before submission. Opening the estimator, previewing prices, or changing a lead stage alone does not create a number.
- There is one global sequence per application database, shared across users, roles, cities, years, and project categories. It does not restart annually.
- The exact prefix is case-sensitive `Lisno`, with no spaces or separators. Pad the positive sequence to a minimum of six digits. After `Lisno999999`, continue with `Lisno1000000`; never truncate or wrap.
- New estimates created after this change receive numbers. Already-existing estimates are not numbered by a GET request or silently backfilled during editing. Historical numbering requires a separately approved backfill.
- Project name remains user-entered. The number is a separate read-only reference, not a replacement for the name or UUID.
- No blocking product decision remains under these assumptions. Approval accepts this trigger and historical-data scope.

## Recommended design and alternatives

**Recommended: Lead-owned immutable number with a dedicated database counter.** Allocate the number to the estimate's stable Lead when the first estimate is saved. Project and Estimate responses project the same stored number through existing ID links. This matches the existing intake lineage and supports legacy leads before their Project exists, without duplicate writable values.

**Alternative: store the number only on Project.** This is simple for the current initiation flow, but legacy estimates would require creating a Project earlier or reserving a number elsewhere until approval. Either changes workflow timing or introduces a second numbering source. Do not use this approach for this scope.

No client-side generation, record-count-based generation, UUID suffixes, or timestamp-based substitutes are permitted.

## Required behavior

1. A newly initiated Project/Lead has no number until its first estimate draft commits successfully.
2. The first successful estimate creation atomically assigns the next number, stores the estimate, and records the assignment audit event. No successful response exposes a number before commit.
3. Repeated saves, refreshes, submission, approvals, quotation revisions/unlocks, project renaming, reassignment, and invitation retries retain the same number.
4. Concurrent estimates for different leads receive different numbers. Concurrent first saves for the same lead may retain the established version-conflict behavior, but they must never assign multiple numbers or leave partial creation behind. A retried request resolves to the already committed number.
5. For a newly created estimate on an unlinked legacy Lead, allocate the number immediately on the Lead. When approval later links a Project, its read projection exposes that same number without allocating again.
6. Invalid, unauthorized, stale, or failed creation requests commit neither the estimate nor a new number/assignment audit. A failure inside the transaction rolls back its counter increment as well.
7. Numbers already issued are immutable and never intentionally reused. Cancellation, loss, archive, or later deletion of business records does not reset the counter. Numbers are identifiers, not a promise of a gap-free accounting sequence.

## Data and transaction contract

- Add an optional immutable `projectNumber` string to Lead persistence and record types. Historical and not-yet-numbered response values normalize to `null`; frontend types remain compatible with older responses that omit the field.
- Enforce uniqueness using a partial unique Mongo index on actual string-valued Lead numbers, allowing multiple missing/null historical values. Validate the exact format and positive numeric suffix.
- Add a dedicated persistent counter document for the project-number sequence, with an atomic increment, unique singleton key, and validated safe integer range. Keep its state separate from design-version and in-memory ID counters.
- Allocate from the existing estimate-save transaction after authorization and request validation. Re-read/fence the Lead within that transaction and verify Estimate/Lead/Project ID consistency before assignment. Do not rely on the pre-transaction Lead snapshot for concurrent numbering decisions.
- If the Lead already has a valid number, reuse it. If the first-save path unexpectedly encounters contradictory lineage or numbering data, return an explicit conflict and roll back instead of renumbering or selecting another record.
- Handle counter initialization and transient write conflicts with the repository's established transaction/retry behavior. Concurrent first allocation against an empty counter must be tested. Retries must be bounded and must not swallow business version conflicts.
- Missing counter state is safe to initialize only for a clean namespace with no previously issued numbers. Inconsistent counter/number state must fail clearly and require an authorized repair; never silently reset, overwrite, or derive a new identifier from a current document count.
- Preserve the existing direct-Mongoose estimate-save architecture. Extend memory and Mongo repository read contracts consistently where they expose Lead/Project metadata; do not introduce a parallel memory estimate workflow solely for this feature.
- Record actor, Lead ID, Estimate ID, optional Project ID, number, and assignment time in a single audit event within the transaction. Avoid adding client/contact data to the event.

## API and UX impacts

- Add read-only `projectNumber` to the existing authorized Lead reads, estimate-save/read/list responses, and Admin project list/detail projections. Project read projections that expose the number must derive it through the same stable linked Lead, never infer it from names.
- Existing create/update schemas must not accept user-supplied number overrides. No editable field, counter-management endpoint, or unauthenticated lookup by number is introduced.
- Show `Project number: Lisno000001` alongside the project name in the estimate workspace, Sales lead detail/list, and Admin project detail/list, including applicable list/grid representations. Reuse existing typography and layout; do not add cards, icons, motion, or dependencies for this reference.
- Before allocation and on historical unnumbered records, show the concise neutral state `Project number not assigned` in detail/workspace identity areas. Lists may omit the secondary line when absent. Do not show a speculative next number or confusingly present the UUID as the number.
- After first save, update the estimate cache and refresh all affected Lead, Admin project, and existing summary caches so navigating between the relevant screens shows the committed value. A failed save must not leave an optimistic number visible.
- Preserve responsive wrapping, copyable text, accessible labels, keyboard behavior, and existing loading/error states. Renaming a project must not change or hide its number.
- No financial amounts, approved estimates, published snapshots, issued PDFs, or existing client/email artifacts are rewritten. Adding the number to those artifacts is outside this change.

## Permissions and invariants

Existing estimate-create/edit permissions and backend route-operation checks remain authoritative. A number may be disclosed only where the caller already has access to the associated Lead/Estimate/Project. Sequential numbers do not become authorization credentials, route keys, or join keys.

Preserve version/CAS checks, quotation/design workflow state, approved financial baselines, client identity verification, invitation delivery behavior, project creation timing, and all existing UUID-based relationships.

## Compatibility, deployment, and rollback

No bulk backfill or seed operation is included. Existing estimates/projects remain readable without a number. Creation of a new estimate for an existing lead is covered; editing an estimate that already existed before rollout does not allocate retroactively.

The counter collection and uniqueness index are additive persistence changes. Local tests may create them in disposable databases. Any production index/counter initialization or deployment requires its own authorized release action and a read-only conflict check first. Do not run a production migration during implementation.

Rollback may stop future allocation/display while preserving issued Lead numbers, counter high-water state, and the unique index. Never remove or reset them during rollback. Re-enabling the feature must continue the sequence without reuse. A restored database must preserve counter and numbered records consistently.

## Scope and non-goals

In scope: first-estimate creation, durable global allocation, authorized read projections, Sales/Admin identification UI, cache consistency, audit, concurrency/rollback tests, and legacy unlinked-lead compatibility.

Out of scope: invitation-triggered numbering, initiation-triggered numbering, editable/custom prefixes, annual or per-city sequences, assigning numbers to historical saved estimates, new number-search/filter features, early Project creation, estimate pricing/approval changes, document/email redesign, dependencies, commits, deployment, production mutations, and live backfills.

## Risks

- A global counter serializes allocation briefly. Keep the counter operation small, inside the existing transaction, and avoid holding it during external work or email delivery.
- A duplicated first save or counter-initialization race can otherwise create collisions or consume numbers inconsistently. Rely on transaction boundaries plus database uniqueness, not UI button disabling.
- New first saves and historical estimates must be distinguished using persisted estimate existence, not a frontend flag or version guess.
- Legacy records may contain missing/broken project links. Fail explicit lineage conflicts rather than silently attaching a number to the wrong project.
- Read projections and stale caches can make one number appear missing or inconsistent. Verify the same value across saved estimate, Lead, and Admin project views.
- Dirty target files overlap earlier work. Preserve that baseline and restrict edits to this approved behavior.

## Acceptance criteria and verification

1. A fresh namespace allocates `Lisno000001` on the first successful estimate creation and `Lisno000002` for a second distinct lead. Both responses and subsequent reads return their correct values. Test minimum padding and expansion beyond six digits.
2. Project initiation, invitation creation/retry, estimator page open, preview calls, and lead-stage changes do not allocate a number. Both explicit draft-save and save-before-submit creation paths do allocate.
3. Re-saving, renaming, revising, submitting, approving, and retrying preserve the original number. Client input cannot set/change it. Historical already-saved estimates remain unnumbered without an explicit backfill.
4. Actual Mongo replica-set tests exercise concurrent first saves for the same and different leads, first-counter initialization, duplicate-key/write-conflict retries, and injected transaction failures. No duplicate number, orphaned assignment, partial estimate, or duplicate assignment audit may remain.
5. A new estimate for an unlinked legacy lead receives a number; later approval/project linking exposes exactly that number. Existing link conflicts fail without allocation. Verify two asymmetric identities/projects for leakage and lineage mistakes.
6. Lead/Estimate/Admin read projections return one canonical value or `null`. Unrelated updates preserve it. Memory and Mongo projections remain aligned, and OpenAPI documents the read-only response field without introducing input authority.
7. Frontend interaction tests and rendered browser checks confirm the number appears after save in the specified screens, survives navigation/refresh, and is absent from failed/optimistic saves. Check narrow/mobile and desktop identity layouts and cache refreshes.
8. Focused estimate save/approval/lineage tests, numbering replica-set tests, affected API/repository/frontend tests, both workspace typechecks/builds, and repository hygiene checks run on the integrated result. Record pre-existing failures separately; there is no lint script. No live migration, real email, production mutation, or deployment is performed.

This stage creates only the specification. The separate task plan and execution-mode choice follow approval under the repository workflow.
