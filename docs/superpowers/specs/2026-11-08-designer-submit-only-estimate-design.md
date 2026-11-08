# Designer estimate: one Submit action

Date: 2026-11-08
Status: Implemented and verified; results recorded in the task plan

## Goal

Replace the Designer estimate screen's separate Save draft action with **Submit**.
The Designer edits the estimate and submits once; the application saves those
changes and sends the saved revision to the Client's existing review flow.

This supersedes the previous Designer requirements for separate Save draft and
Send revised quotation controls. The Client's all-basket picker and the Sales
Save draft/Submit pair remain as previously requested.

## Current behavior and evidence

- `LeadEstimateWorkspace.tsx:1307` renders Save draft for every editable role;
  `:1231` also offers it in Configure for non-Sales users.
- `:161–164` derives publication eligibility from the saved approval state and
  `capabilities.canPublishQuotation`. After initial approval, unsaved Designer
  changes do not yet change either value, so the Submit control remains hidden.
- `backend/src/routes/estimates.ts:372` deliberately enables publication only
  after a saved material revision requires Client reapproval.
- `LeadEstimateWorkspace.tsx:581` already implements save followed by submission
  of the returned version, but its initial `canPublish` guard prevents using it
  for that first unsaved revision.
- The backend publication service rejects unchanged initial quotations with
  `QUOTATION_UNCHANGED`. Preserve that rule and immutable approval history.

## Required behavior

1. Show one primary **Submit** action in the Designer's current editable estimate
   Items/Summary footer. Remove the Designer's separate Save draft controls,
   including the Configure-screen control. Keep basket/room configuration and
   ordinary navigation available; submitting still requires a valid estimate.
2. An authorized assigned Designer can submit unsaved additions or edits after
   initial approval without first pressing Save draft. Also support a previously
   saved revision and a revision returned by the Client for changes.
3. Submit validates the current inputs, saves the current draft, verifies the
   returned version and publication eligibility, then submits that saved version
   through the existing publication endpoint. Show **Submitting…** and prevent
   duplicate clicks or conflicting edits while this operation is in progress.
4. Use backend-provided current assignment/edit eligibility to offer this combined
   action before the revision is saved. Preserve `canPublishQuotation` as the
   capability to publish the already-saved revision. If a separate preparation
   capability is needed, derive it from the same scoped primary-Designer rules;
   do not authorize submission from the role name alone.
5. For an unchanged initially approved estimate, disable Submit with a concise
   explanation that an estimate change is needed. If a local edit turns out not
   to change the quotation materially, show that result without publishing a
   duplicate review. Preserve all current validation for pricing, dimensions,
   required Configuration, stale versions and missing items.
6. If saving fails, do not submit. If saving succeeds but publication fails,
   preserve the committed revision, explain that submission failed and allow safe
   retry. Preserve uncertain-save recovery and existing publication/delivery
   idempotency; do not display a Client-review success message before publication.
7. Preserve pending-review, closed/finally approved and historical protections and
   the existing explicit reopening flow. Secondary/unrelated Designers gain no
   editing or publication rights.
8. Client review continues to show the revised estimate with the existing Approve
   and Request changes actions. Preserve the initial approval and internal scope.
   Other roles' action layouts, including Sales Save draft plus Submit, stay intact.

## Scope, assumptions and impacts

- Scope is Designer estimate actions and the eligibility needed for combined
  save/submission. “No Save draft” refers to the Designer's separate visible
  action; persistence remains necessary to submit an exact reviewed version.
- Existing navigation safeguards may persist changes while moving between
  configuration views; they do not publish. Do not turn ordinary navigation into
  a Client submission or remove unsaved-change protection.
- Extend existing staff DTO types/OpenAPI if an additive capability is required.
  Mutation shapes, pricing formulas and stored approval schemas stay unchanged.
- No new approval system, schema migration, dependency, automatic submission on
  each item edit, deployment, production mutation or customer message is included.

## Acceptance and focused verification

- **AC1:** Designer Items/Summary exposes Submit and no Save draft action; Configure
  also has no separate Save draft button. Sales retains both requested actions.
- **AC2:** From initial approval, add one item or edit an existing one and press
  Submit once. Save occurs first; publication uses its returned version. The
  Client can review that revision; other rooms, internal rows and the original
  approved snapshot remain intact.
- **AC3:** Saved revisions and Client-requested corrections can be submitted;
  unchanged initial estimates do not create another review.
- **AC4:** Save failure, publication failure, retry, rapid clicks, invalid inputs,
  stale/unknown outcomes and unauthorized/closed/historical states remain safe.
- **AC5:** Focused rendered Designer/Sales regressions, affected backend capability
  and publication replica-set tests, affected typechecks/builds and desktop/mobile
  action checks pass. Run `git diff --check`; avoid unrelated full suites.

## Risks and open decisions

Main risks are treating unsaved edits as already publishable, bypassing assignment
checks, submitting a stale version or losing changes after a partial failure.
Separate preparation eligibility from saved publication eligibility and reuse the
existing save/publication sequence with explicit failure states. No additional
product decision is needed beyond this specification approval.
