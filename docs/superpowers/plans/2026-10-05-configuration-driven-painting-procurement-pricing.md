# Main Line Configuration propagation: amended task plan

Date: 2026-10-05  
Specification: [Configuration-driven Main Line values](../specs/2026-10-05-configuration-driven-painting-procurement-pricing-design.md), amendment approved by the user.  
Status: Implemented in execution mode A; focused verification passed, with an adjacent existing tender approval-queue test failure

## Outcome and contract

For current internal reads, the latest saved draft for a Main Line takes precedence over its active revision; otherwise use the saved active revision. Configuration-owned values propagate by stable `mainLineId` to every current consumer, including editable estimates, recommendations and Procurement. Do not copy a rate or label from a similarly named item. Preserve explicit estimate quantity/classification/selling-rate inputs, immutable approved customer records and external issued artifacts. A project-only Procurement rate override stays local. Internal prices remain server-calculated; vendor dispatch requires an activated current revision and a fresh BOQ.

Use the existing Configuration revision, estimate, procurement and TanStack Query structures. No generic event bus, new pricing store, migration, or read-side write is planned. A valid change should become visible after local save and on another session's next read/focus. Incomplete draft values show a specific issue; they do not silently fall back to stale active prices.

The worktree is already heavily dirty, including untracked files from the prior Painting implementation. Before any writer starts, capture the exact dirty-path set and each target's current contents/diff. Every owner must preserve prior work and coordinate a contract change before touching another owner's area.

## Dependency-ordered tasks

### 1. Consumer inventory and source contract — primary agent

- List current Main Line consumers and their Configuration-owned fields across backend Estimator Catalogue/recommendations, editable estimate reads/saves, Procurement Standard/Special calculations and frontend query families. Distinguish immutable review/approved/issued snapshots. Record active-with-new-draft, draft-only, inactive/archived, missing source and UOM-change behavior.
- Lock one shared latest-saved revision selector and additive source DTO behavior, joined by `mainLineId`. Specify how a saved draft affects internal display while BOQ dispatch remains blocked until activation. Identify stale-digest and permission boundaries. Share that contract with writers before edits.
- **Acceptance:** each current consumer has a named owner and a source/refresh rule; no owner invents a separate revision fallback.

### 2. Shared source and editable estimation — backend owner A, after task 1

**Owned area:** backend Configuration revision selection, Estimator Catalogue/recommendations and editable estimate read/save projection/services, with focused backend tests. Own the shared selector export; no Procurement, frontend or root-guidance edits.

- Expose latest saved draft or active Configuration fields by stable Main Line ID. Keep source version/CAS on writes and reject malformed/archived relationships. Rebase Configuration-owned fields of editable saved estimate lines on read and before save, preserving explicit quantity, classification and selling rate; require correction for incompatible UOM/precision rather than converting quantity. Published/approved snapshots and PDFs remain unchanged.
- Verify two projects/estimates using one Main Line, an active item whose draft was just saved, another same-named Main Line, multiple configured fields, draft reload/save and immutable review history.
- **Acceptance:** no manual source rebase is needed for an editable estimate, and current catalogue/recommendation reads agree on the same saved revision.

### 3. Procurement consumers and BOQ freshness — backend owner B, parallel with task 2 after task 1

**Owned area:** backend purchase-order mode resolution, basket/procurement read projections and focused procurement/BOQ tests. Consume owner A's locked selector contract; no edits to its files or frontend/root guidance.

- Resolve latest saved values for the same `mainLineId` in Standard and Special current internal calculations. Preserve Standard automatic Sub-vendor, Special's selected mode, project-only base-rate precedence, approved quantity/customer amount, integer-paise low-quantity math, compatible UOM check and the four-column basket API. An incomplete or unactivated draft may have an internal preview but cannot send a newly priced BOQ.
- Make changed configured source/calculation enter the private preparation digest so draft/sent BOQs require revision. Keep pending award/issued locks and vendor payload boundaries. Test two unequal projects, override/clear, changed limit/impact, active-with-new-draft, Special mode, UOM conflict and stale BOQ.
- **Acceptance:** current Main Line changes update internal Procurement wherever that line appears, without rewriting immutable approved or external records.

### 4. Current UI and cache refresh — frontend owner, parallel with tasks 2–3 after task 1

**Owned area:** `frontend/src/features/leads/` configured estimate/catalogue/recommendation UI, `frontend/src/features/ai-estimator-knowledge/knowledgeMutationSync.ts`, `frontend/src/features/procurement/` basket consumers and their focused tests. No backend/root-guidance edits.

- Show rebased Configuration-owned values in editable estimate lines without a manual “Use updated source” action; retain user inputs and show a concise UOM correction state. Invalidate affected estimation, recommendation and basket queries after Main Line section/lifecycle/relationship/master saves. Re-fetch current views on focus/return for changes by another user.
- Keep the simple four-column Standard basket and project-only edit control. Render only server amounts/errors; maintain accessible loading, keyboard and narrow-width states. Test local save, reload, another-session refresh, draft activation and invalid UOM/source.
- **Acceptance:** current screens for the same Main Line converge on saved Configuration data; unrelated Main Lines and historical records do not change.

### 5. Integrated review and durable rule — primary agent after writers

- Update the Configuration-first invariant in root `AGENTS.md` to say latest saved draft is current for internal consumers and activation gates new vendor dispatch. Reconcile shared selector/DTO, estimate rebasing, UI query keys, project overrides, BOQ digest and public payloads against the baseline.
- In the approved parallel mode, use an independent integrity reviewer after writers; fix confirmed finance, authorization, lineage, UOM or race defects before verification.
- **Acceptance:** all five specification acceptance criteria are met without confirmed cross-stack defects.

### 6. Final verification — verification runner after review fixes

- Run focused backend replica-set tests for estimation and procurement, focused frontend rendered/cache tests, backend/frontend typechecks and builds, `git diff --check` and final dirty-path comparison. Exercise two asymmetric projects and a same-named different Main Line. Check desktop/narrow-width rendering where a usable fixture exists. Report any adjacent test failure separately from changed-path results.
- No seed, backfill, live migration, production mutation, vendor delivery, stage, commit, push or deployment.
- **Acceptance:** exact checks/results and any unrun check are reported; only intended paths differ from the captured baseline.

## Safe parallel work and specification trace

After task 1 locks the shared selector/DTO, backend owners A and B can implement in distinct service files, while the frontend owner works from the agreed contract. Backend owner A owns the selector; backend owner B imports it and does not rewrite it. The primary agent owns contracts/docs/integration. Integrity review follows all writers; final verification follows review fixes. The previously selected Mode A continues for this amendment.

| Spec criterion | Tasks | Evidence |
| --- | --- | --- |
| AC1: any consumed field updates every current same-ID view | 1–4 | Two-project, multi-section, same-name identity regressions and rendered refresh |
| AC2: editable estimate draft rebases without losing user inputs | 2, 4–6 | Draft read/save, UOM conflict, approved-history tests |
| AC3: Standard/Special cost, override and draft dispatch gate | 3–6 | Paise/threshold, selected-mode, override/clear and BOQ guard tests |
| AC4: invalid source, stale BOQ, public/historical boundary | 2–6 | Missing/UOM/digest and vendor-payload assertions |
| AC5: integrated quality and preservation | 5–6 | Typechecks/builds, rendered checks, review and diff hygiene |
