# Role-based estimation pricing modes: task plan

Date: 2026-11-08
Status: Implemented and verified
Specification: [Approved specification](../specs/2026-11-08-estimate-role-based-pricing-mode-design.md)
Specification approved in conversation on 2026-11-08.

## Contract and scope

Use the approved phase matrix for V3 mode changes: linked Client plus assigned
owning Sales in `pre`; linked Client plus assigned primary Designer in `post`.
The handoff is initial Client approval. Existing assignment, source and edit-lock
checks still apply. Standard items remain Sub-Vendor. Only eligible Special
items expose editable modes; other accessible rows display their selected mode.

Keep the existing Designer project preview read-only and its editor entry point.
Do not change legacy workflows, publication stages, financial formulas, unrelated
editing permissions or the approved baseline. No new persisted field is needed.

Settle these additive API names before writers start:

- Staff estimate response: `capabilities.canChangePricingMode: boolean` for V3.
- Quotation detail: `canChangePricingMode: boolean` derived for the requesting
  actor and current estimate. Combine it with ordinary editing/source eligibility.
- Quotation lines and candidates: `classification: "standard" | "special"`
  when reliably resolved, and `pricingModeChoices: Array<{ pricingMode:
  EstimatePricingMode; choices: EstimateTierChoice[] }>` using the existing safe
  tier-choice shape. Standard rows only offer Sub-Vendor; Special rows can carry
  all three modes with explicit tier availability and current-source tokens.
- Keep existing `pricingMode` and `choices` intact for older consumers. New
  frontend read fields are optional for compatibility; absence never grants
  mode-edit authority or supplies fabricated alternate prices.
- Quotation `add` and `update` operations accept optional `pricingMode` using
  the established enum. Omission preserves existing saved/default behavior.
  Mode changes use server-owned classification; Clients cannot submit a new
  classification, rate, amount or pricing breakdown.

Use shared backend eligibility logic in the existing collaboration policy area,
with transaction-local checks at every affected write boundary. Project/actor
authority must precede safe mode-choice projection. Expose no raw catalogue or
internal cost/margin fields. Preserve integer-paise and source-revision rules.

## 1. Capture baseline and confirm mutation boundaries

Owner: primary agent. Acceptance: AC2, AC3, AC5 and preservation constraints.

- Capture initial dirty paths and exact contents/diffs of all owned targets.
  Reconcile earlier changes before assigning dirty files. Do not revert or
  reformat unrelated work, including concurrent pricing/rounding changes.
- Trace full-draft saves, quotation add/update, tier/dimension updates and
  other reachable writers to identify effective mode changes. Existing tier
  and quantity operations must not accidentally acquire mode-changing power.
- Confirm stable-ID and room/Main Line matching for changed, excluded, removed
  and re-added rows. Apply phase restrictions to the effective result, including
  classification resets and replacement attempts, while permitting unchanged
  modes on otherwise authorized saves. Preserve initial estimate creation rules.
- Confirm capability reads and mutations use consistent assignment, lifecycle
  and closed/pending-review handling. Preserve operation-specific privileged
  behavior without introducing a new override.
- Record ownership and the API contract above before parallel editing begins.
  If evidence requires a material scope change, update the affected approved
  document and use its gate; routine implementation details need no new approval.

## 2. Extract the shared compact control

Owner: primary agent. Depends on step 1. Acceptance: AC1, AC4, AC6.

Create a small shared `EstimatePricingModeControl` in the existing estimates
feature, reusing the current switch/radio markup and scoped styles. It accepts
effective mode, item context, editable/disabled state and change callbacks; it
does not fetch, calculate prices, persist or decide permissions.

Keep remembered non-PMC selections above individual rows, scoped by actor,
project/estimate, saved context and stable line identity. Reuse the existing
builder memory behavior; the Client workspace must have equivalent reset and
row-remount behavior. Do not introduce a second persisted mode state.

Primary ownership for this step: the new shared component and its focused
interaction test. Publish its props and accessible names before step 3:
`PMC pricing mode for <item context>`, `Sub-Vendor pricing mode for <item context>`
and `In-house pricing mode for <item context>`. Avoid a separate decorative UI.

## 3. Implement three bounded slices

Depends on steps 1–2. In Mode A, slices A, B and C can run in parallel after
the shared API/control contracts are fixed. Each writer is responsible for its
own focused regressions and must preserve other contributors' work. No writer
may edit another slice's files; coordinate discoveries with the primary agent.
In Mode B, the primary agent performs these slices sequentially.

### A. Backend capability, mutation enforcement and projection

Owner in Mode A: `backend_implementer`.

Exclusive areas: affected sections of `backend/src/routes/estimates.ts`,
`services/estimate-collaboration-policy.service.ts`, `estimate-tiers.service.ts`,
`quotation.service.ts`, `quotation-recommendations.service.ts`, quotation/estimate
OpenAPI definitions and relevant backend tests. Other backend files require an
explicit ownership transfer after the primary agent reviews their existing diff.

- Return the dedicated capability from current assignment, phase and edit state.
  Revalidate it under existing authorization/project fences inside saves.
- Permit Client mode requests only within the matrix and Standard/Special rules.
  Apply the equivalent restriction to staff saves, including indirect changes.
  Validate before committing approval supersession, totals, version or audit.
- Build additive safe mode/tier choices from the current Configuration source.
  Reuse existing tier/component calculations and visibility filtering. Match
  candidate classification/defaults to the actual add path; preserve room-level
  saved choices and avoid duplicate source work where practical.
- Apply an intentional mode change before authoritative repricing. Clear
  incompatible component metadata and require valid current In-house selections.
  Reject unavailable pricing and stale source tokens without fallback values.
- Preserve CAS, priced revision/digest invalidation, audit attribution, hidden
  scope and immutable approvals. Keep Client pending-review supersession and
  subsequent Sales/Designer submission behavior intact.
- Update strict runtime validation, documented request/response contracts and
  API contract tests. Existing registered operations remain the route authority.
- Test unequal projects and asymmetric identities; raw API bypasses; stale Sales
  saves across the handoff; reassignment; Standard-mode rejection; rollback of
  invalid batches; legacy bodies; all three prices/components; pending-review
  supersession; saved mode reload; prior snapshot and baseline preservation.

Acceptance: AC2–AC5, backend portion of AC7.

### B. Client draft, row and quotation integration

Owner in Mode A: `frontend_implementer` B.

Exclusive areas: `frontend/src/features/client/quotationApi.ts`,
`clientQuotationDraft.ts`, `clientQuotationCandidates.ts`, `ClientQuotation.tsx`,
`ClientQuotationLine.tsx`, scoped `clientQuotation.css`, and their relevant tests.
The Client writer also owns focused additions to
`features/estimates/ProjectQuotationWorkspace.test.tsx` for mode visibility and
the existing Designer edit entry point. No staff editor or shared CSS edits.

- Add the read/write types above and carry mode/eligibility through candidate
  conversion, drafts, add/update serialization and save confirmation.
- Resolve tier/component choices for the draft's selected mode. An old response
  still renders its saved mode, but cannot enable unsupported mode selection.
  Never silently fall back to another mode's choices after an explicit change.
- Connect the shared control using server capability, current row eligibility
  and existing edit/error locks. Keep Standard and read-only mode text visible.
  Keep current saved totals clearly distinguished from unsaved changes; do not
  label an old amount as the recalculated result of a new mode.
- Maintain per-line remembered non-PMC mode in the workspace and reset it on
  actor/project/estimate/saved-context changes. Clearing, discarding, filtering
  or changing rooms must not copy one line's remembered state into another.
- Preserve quantity and dimensions; validate/reset In-house components on mode
  transitions. Missing rates must remain actionable validation feedback, with
  no configured/base-price annotation or new price override.
- Extend uncertain-save confirmation to compare requested mode in addition to
  existing source/version/quantity checks. Preserve refresh/conflict recovery,
  draft navigation guards and affected-query invalidation.
- Verify both allowed Client stages, denied/missing capabilities, persisted and
  new items, all toggle transitions, mode-specific tier choices, component
  validation, lost responses and read-only Designer preview visibility.

Acceptance: AC1, AC2, AC4–AC6, Client portion of AC7.

### C. Sales/Designer workspace capability integration

Owner in Mode A: `frontend_implementer` C.

Exclusive areas: `frontend/src/features/leads/leadsApi.ts`,
`LeadEstimateWorkspace.tsx`, `ConfiguredEstimateBuilder.tsx`, relevant staff
workspace/builder tests, and scoped `frontend/src/styles/estimator-dashboard.css`.
Do not edit Client feature files or the primary-owned shared component.

- Add the staff capability type and thread mode editability independently of
  overall draft editability through all row paths, including excluded rows.
- Reuse the shared control and existing mode-change pricing callback. Preserve
  remembered choices and manual prices during unrelated quantity edits.
- Show selected mode read-only for Sales after handoff. Guard classification
  actions that would implicitly reset a mode when mode editing is unauthorized;
  avoid disabling unrelated permitted actions. Handle missing V3 capability
  conservatively without breaking existing initial creation or legacy flows.
- Keep primary Designer edits, Standard restrictions, Save/Submit behavior,
  recommendation selection and all-basket browsing intact.
- Test initial Sales editing, post-approval Sales view-only mode, post-approval
  primary Designer editing, stale/missing capability, safe classification
  transitions and unchanged-mode saves. Preserve saved payload and reload checks.

Acceptance: AC1–AC4, AC6, staff portion of AC7.

## 4. Integrate and review

Owner: primary agent. Depends on all writers handing back ownership.
In Mode A, use `integrity_reviewer`; in Mode B, review inline.

Compare the final diff with the captured baseline and approved specification.
Trace the complete Client edit/save, Sales initial submission, initial approval,
Designer revision/submission and Client reapproval sequence. Review effective
mode changes through direct/indirect write paths, safe projections, source
freshness, integer units, cache refresh, uncertain-response confirmation and
immutable history. Resolve confirmed findings before final verification.

Keep one parent task in progress and record completed slice evidence here.
Tests run during concurrent edits are preliminary, not final integrated results.

## 5. Final verification and handoff

Owner: primary agent. In Mode A, use `verification_runner` after review fixes.
An independent browser check can run alongside automated checks against the
same stable integrated tree, using an isolated synthetic fixture only.

Run focused tests first. Required backend baseline from `backend/`:

```sh
npm test -- tests/quotation-edits.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/estimate-mode-pricing.test.ts tests/quotation-openapi.test.ts tests/client-quotation-projection.test.ts tests/quotation-approval-state.test.ts
npm run typecheck
npm run build
```

Include any newly introduced policy or mode regression suite explicitly. Use the
repository's isolated Mongo replica-set harness for changed transactional paths;
do not weaken transactions or connect to a user/production database. If shared
OpenAPI definitions change, also run `tests/api-docs.test.ts`.

Required frontend baseline from `frontend/`:

```sh
npm test -- src/features/client/clientQuotationDraft.test.ts src/features/client/clientQuotationCandidates.test.ts src/features/client/quotationApi.test.ts src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.items.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx src/features/estimates/ProjectQuotationWorkspace.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx
npm run typecheck
npm run build
```

Also run the new shared-control tests and any other suites whose product paths
are modified. Broaden only for new failures or unresolved shared-contract risks.
There is no repository lint script. No OCR or full repository suite is planned.

Browser checks at desktop and narrow mobile widths must inspect actual Client
and staff components with synthetic data: eligible/readonly/Standard modes,
PMC round trips, keyboard focus and radios, fresh saved PMC, different rooms,
missing-price feedback, pending/error states and absence of horizontal overflow.
Include rendered accessible-name/state checks; use real backend regression
tests, not mock UI assertions, as evidence for authorization and persisted money.

Run `git diff --check` and `git status --short`. Record exact commands/results,
AC coverage, affected files, unrun checks, limitations and generated outputs.
Remove owned fixtures/screenshots after inspection. Preserve unrelated artifacts
and external service state. No backend/OCR restart, migration, seed, production
mutation, external delivery, commit, staging, push or deployment is authorized.

## Execution record

Specification and task plan approved; Mode A selected in conversation on
2026-11-08. All implementation gates are complete.

- Step 1: baseline captured under `/private/tmp/lisno-role-pricing-mode/`,
  including initial dirty paths, existing diffs and 3,153 source/document files.
  Existing prior changes remain the starting point for every writer.
- Mutation tracing identifies staff full-draft PUT and quotation PATCH as mode
  writers; tier/dimension mutations preserve mode. The canonical staff-save
  operation already denies Super Admin personal writes; this remains unchanged.
- Step 2: primary added the shared presentation-only `EstimatePricingModeControl`
  and four focused interaction tests. Preliminary test run: 4/4 passed.
- Step 3: `pricing_mode_backend`, `pricing_mode_client` and `pricing_mode_staff`
  own their respective non-overlapping slices above. API names and shared-control
  props were provided before writers began.
- Staff slice handed back: 153 tests across five focused suites passed;
  frontend typecheck and targeted diff checks passed. Sales mode restrictions
  preserve unrelated quantity/manual-price edits and initial creation.
- Client slice handed back: 97 tests across eight focused suites passed;
  frontend typecheck and targeted diff checks passed. Coverage includes both
  phases, keyboard/accessibility, memory isolation, save/reload, uncertain-save
  comparison, unavailable modes and alternate-mode candidates.
- Backend handed back: 382 tests across ten suites, typecheck and diff checks
  passed. The broader run exposed an existing projection-test fixture's unstubbed
  approval-resolver database call. Its scoped stub now preserves the visibility
  assertions; real approval behavior remains covered by replica-set tests.
- Browser fixture uses the actual staff builder and Client row with synthetic
  data at loopback port 4192. No application backend/OCR service was started.
  All implementation writers have finished; final browser checks and independent
  integrity review are running against the integrated worktree.
- Step 4 complete: independent review found one compatibility regression in
  excluding older manual Standard rows with no recorded pricing mode. The
  guard now preserves absent mode metadata for exclusions while still rejecting
  explicit invalid Standard modes and included-row repricing without a mode.
  A real Client PATCH regression covers absence preservation and unchanged other
  rows. The 91-test quotation-edit suite and backend typecheck passed after the
  fix; the reviewer confirmed it resolved with no remaining findings.
- Browser verification complete: 14 cases at 1440px/390px; role/read-only/Standard
  states, toggle round trips, current prices, fresh saved-PMC fallback, explicit
  missing-price feedback and no horizontal overflow. Additional Client/staff
  radio-arrow checks passed; switch/radio-label touch targets are 44px. Scoped
  axe checks found zero violations or incomplete checks. No browser page/console
  errors. Both primary and browser verifier inspected representative images.
- Browser scope is real components with synthetic props, not live backend
  authorization or persistence. The 1,307-file frontend/shared hash stayed
  unchanged through browser verification. No product changes followed it.
- Step 5 complete: independent `pricing_mode_verification` passed the complete
  focused test set and both workspaces' typecheck/production build.

## Final outcome

The same compact PMC control is used in Client, Sales and Designer estimation.
The backend exposes and enforces the requested phase-based authority: Client
and assigned Sales initially; Client and primary Designer after initial Client
approval. Standard items remain Sub-Vendor. Sales post-handoff and Designer
preview rows show the selected mode without permitting mode changes.

Client drafts now carry explicit mode changes, current mode-specific tier/
component options and exact saved-mode confirmation after uncertain responses.
Existing review supersession, Client approval, immutable snapshots, source/version
checks and unrelated edit behavior remain intact. No new pricing formula,
dependency, persisted boolean or migration was introduced.

## Final checks and results

All final commands exited 0 on the integrated tree. The exact backend test run:

```sh
cd backend
npm test -- tests/estimate-pricing-mode-policy.test.ts tests/quotation-openapi.test.ts tests/quotation-edits.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts tests/quotation-approval-state.test.ts tests/client-quotation-projection.test.ts tests/estimate-mode-pricing.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

Backend: **383/383 tests across 10 suites passed**, including transactional
replica-set checks and the legacy mode-less exclusion regression.

The frontend command in step 5 ran with the two additional suites below appended
to the same test invocation, followed by `npm run typecheck` and `npm run build`:

- `src/features/estimates/EstimatePricingModeControl.test.tsx`
- `src/features/client/ClientQuotation.pricingMode.test.tsx`

Frontend: **283/283 tests across 15 suites passed**. Typecheck and production
build passed for both workspaces. Frontend transformed 3,337 modules; its existing
large-chunk warning remains (main JS 3,295.40 kB; gzip 906.16 kB).

`git diff --check` and `git status --short` exited 0. All 2,413 source/test/config
file hashes remained unchanged throughout final verification (combined SHA-256
`43da0c3b60b80448f00a8d140955aadbacd35bb2898c7096b7784c77cd99036f`).
Independent integrity review has no unresolved findings. Browser and scoped axe
results are recorded above; their limitation is synthetic rendered components,
with authorization and persistence verified separately through real API tests.

Acceptance coverage: AC1/AC6 by Client/staff rendered tests and browser matrix;
AC2/AC3 by capability/policy, staff PUT and Client PATCH tests; AC4 by draft,
candidate, component, save/reload and money assertions; AC5 by replica-set review,
version, reassignment and immutable-history tests; AC7 by the integrated checks.

## Affected files

Backend source:

- `backend/src/openapi.ts`
- `backend/src/openapi/quotation.ts`
- `backend/src/routes/estimates.ts`
- `backend/src/services/estimate-collaboration-policy.service.ts`
- `backend/src/services/estimate-tiers.service.ts`
- `backend/src/services/quotation-recommendations.service.ts`
- `backend/src/services/quotation.service.ts`

Frontend source:

- `frontend/src/features/client/ClientQuotation.tsx`
- `frontend/src/features/client/ClientQuotationLine.tsx`
- `frontend/src/features/client/clientQuotationCandidates.ts`
- `frontend/src/features/client/clientQuotationDraft.ts`
- `frontend/src/features/client/quotationApi.ts`
- `frontend/src/features/estimates/EstimatePricingModeControl.tsx` (new shared control)
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/leadsApi.ts`

Regression files:

- `backend/tests/client-quotation-projection.test.ts`
- `backend/tests/estimate-pricing-mode-policy.test.ts` (new)
- `backend/tests/estimator-catalogue-estimate.replica-set.test.ts`
- `backend/tests/quotation-edits.replica-set.test.ts`
- `backend/tests/quotation-openapi.test.ts`
- `frontend/src/features/client/ClientQuotation.pricingMode.test.tsx` (new)
- `frontend/src/features/client/clientQuotationCandidates.test.ts`
- `frontend/src/features/client/clientQuotationDraft.test.ts`
- `frontend/src/features/estimates/EstimatePricingModeControl.test.tsx` (new)
- `frontend/src/features/estimates/ProjectQuotationWorkspace.test.tsx`
- `frontend/src/features/leads/ConfiguredEstimateBuilder.test.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx`

This specification and task plan are the only documentation changes for this
task. Existing unrelated work was preserved; no CSS or lockfile changes were
needed.

## Limits and cleanup

Full backend/frontend and OCR suites were not run; verification used the approved
focused scope. No lint command exists. No live customer workflow, production
mutation, seed, migration, external delivery, staging, commit, push or deployment
was performed. No task-specific failure remains; the existing frontend chunk-size
warning is unchanged in scope.

Ignored outputs refreshed by required builds: `backend/dist/`, `frontend/dist/`
and `frontend/node_modules/.tmp/`. The task's isolated fixture on port 4192 and
Playwright session were stopped after inspection; owned browser artifacts were
removed. Application backend/OCR and independently launched services were left
untouched. Temporary baseline copies, diffs and verification logs are removed
after the results above are recorded; unrelated pre-existing artifacts remain.

## Follow-up: toggle missing in the running Designer screen

The user reported Special selected with no PMC toggle and confirmed the current
role was Designer. This correction resumes the already approved scope and keeps
the permission matrix unchanged.

Runtime evidence: the existing local backend started at 22:30:42 IST, before
the capability code was updated at 22:49:04 IST. The local launcher uses a plain
`node --import tsx` source entrypoint without a file watcher. That process had
not loaded `canChangePricingMode`. Separately, the workspace disables saved-query
focus refresh, and Refresh items previously reloaded only catalogue data. An old
capability response could therefore remain indefinitely after selecting Special.

The already-running local backend/OCR/rules supervisor was gracefully reloaded
with its same `node scripts/local-chat.mjs --with-ocr` command as part of this
runtime correction. It resumed successfully; backend `/api/v1/health` returned
200/ok, rules became ready and OCR started with no module-not-found error.
No seed or data migration ran. A read-only check of the local demo estimate
matching the screenshot confirmed V3 post/draft, initial approval present,
editing open and matching primary-Designer assignment; no identities were logged.
This runtime reload is a follow-up action, separate from the earlier implementation
which left application services untouched.

`LeadEstimateWorkspace.tsx` now refreshes the saved estimate/capabilities alongside
the catalogue when Refresh items is clicked. Both refresh indicators cover both
requests. Existing hydration/version logic preserves unsaved classification,
quantity and manual price; absent/denied capabilities never gain an unsafe fallback.

Four regressions in `LeadEstimateWorkspace.collaboration.test.tsx` cover Sales
pre and Designer post missing-to-present capabilities, explicit denial, dirty
edit preservation and a newer server version retaining conflict protection.
Independent read-only review found no regressions.

Correction checks all passed:

```sh
cd frontend
npm test -- src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
npm run typecheck
npm run build
```

Tests: **104/104 across two suites**. Build: 3,337 modules, existing large-chunk
warning only (main JS 3,295.46 kB). `git diff --check` passed. Broader prior suites
and browser layout checks were not repeated for this small refresh-only change;
no backend source or permission policy changed. Ignored frontend build outputs
were refreshed. The correction baseline under `/private/tmp/lisno-pmc-runtime-fix`
is removed after recording results. The resumed local session remains running;
its necessary runtime log is `/private/tmp/lisno-pmc-runtime.log` (not committed).

User recovery: click **Refresh items** once in the existing Designer estimate;
this obtains the current permission without discarding unsaved item changes.
