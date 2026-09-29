# Vendor induction and activation design

Date: 2026-09-28  
Status: Approved specification; implemented locally, pending separately authorized rollout  
Classification: High risk cross-stack workflow (public one-time access, vendor eligibility, procurement allocations, permissions, email, and persistent review history)

## Goal and confirmed decisions

Add **Overview** and **Induction** sections to each Procurement/Super Admin vendor detail on web and mobile. Staff can prepare an induction questionnaire manually or from an Excel workbook, request a vendor response by a one-time email link, review the answers, and approve the induction. The vendor has no login and may only answer the sent questionnaire. Show one authoritative vendor availability state: an otherwise enabled vendor is **Active** only after induction approval, both the current vendor self KPI and current official Procurement KPI exist, and Verification is complete. Until then it is **Under Review**.

The user confirmed that Procurement approval is required after the vendor submits, both KPI assessments are required, Under Review vendors cannot be assigned to new procurement work, and this rule applies to existing vendors. Existing project allocations remain visible. The user confirmed that Verification means a complete saved vendor profile plus Procurement-confirmed physical address verification.

## Current behavior and evidence

- `frontend/src/features/procurement/VendorKpiStaffPage.tsx` and `mobile/src/features/procurement/VendorKpiStaffScreen.tsx` are the current vendor detail experiences. They show profile context and KPI actions together, without Overview/Induction sections.
- `backend/src/models/AiEstimatorKnowledgeVendor.ts` defaults the stored lifecycle `status` to `active`. `frontend/src/features/procurement/vendorDirectoryColumns.tsx` and `mobile/src/features/knowledge/vendorDisplayStatus.ts` currently show Under Review only when the physical address is unverified. `backend/src/services/ai-estimator-knowledge-reference.service.ts` counts Active by the stored lifecycle and Under Review by the address flag, so those counts can overlap.
- `backend/src/services/procurement-vendor-profile.ts` already validates profile completeness and records physical verification actor/time. `backend/src/services/vendor-kpi.service.ts` owns current self/official KPI assessments and their rubric generation.
- `backend/src/services/project-procurement.service.ts` lists vendors using stored `status: active` and can create a bare active vendor from a project. `backend/src/services/procurement-vendor-allocation.service.ts` and `backend/src/services/project-vendor-suggestions.service.ts` also check only stored lifecycle status for new work. A visual label change alone would not enforce the requested activation rule.
- The existing KPI request demonstrates hashed, expiring, single-use public tokens, request delivery states, audit, and a responsive no-login form. Its token, request, and assessment records must remain separate from induction.
- Web and mobile already use ExcelJS for Quality checklist import. Web has a worker, size limits, preview, and formula/hyperlink rejection; mobile has a document picker and workbook parser. There is no vendor induction questionnaire/import path and no `.xlsx` attachment in the repository for the pasted example.

## Interpretation of the example questionnaire

The pasted rows combine three different subjects. Carpet area, employee ratios, cabins, meeting rooms, washrooms, AC/AHU, LAN, sprinklers, office style, and expansion purpose belong to a **client office brief**. Vendor registration time, internal payment cycle, and advance-guarantee policy describe the **buyer's procurement process**. Neither group should be published to a vendor as its induction by default. Duplicate manager-cabin rows, blank rows, mixed numeric/options/instructions, natural-language branching, and `#REF!` cells need explicit import feedback. Question numbers are display order, never stable identity. The sample's “If no, show the following question” should become an explicit conditional rule chosen by staff, not executable spreadsheet logic.

Provide an editable **interior procurement starter set** rather than copying the example into the vendor form. Suggested sections and prompts are:

| Section | Example vendor-facing questions | Applicability |
| --- | --- | --- |
| Capability | Years delivering commercial interiors; up to three comparable completed scopes; operating cities and maximum concurrent sites | Both |
| Capacity and delivery | Mobilization lead time in days; named site supervisor and typical trained crew size | Execution |
| Quality and defects | Sample/mockup approval process; inspection and snag-closing process; defects-liability period in months | Both |
| Site safety | PPE and site induction process; incident escalation; worker cover/insurance declaration; subcontracting disclosure with conditional detail | Execution |
| Supply reliability | Standard and urgent lead times; product traceability/certifications; replacement and warranty process | Supplier |
| Commercial readiness | Quotation validity and stated payment/advance requirements for staff review | Both |

These are suggested prompts, not automatic pass/fail rules or substitutes for the saved vendor profile. Staff may edit, omit, or add questions. Existing profile facts, such as name, type, representative, PAN, and bank details, are not requested again in the public induction form.

**Out of scope for this release:** a client office-planning questionnaire, changes to internal payment policy, automatic vendor risk scoring from answers, public document uploads, a vendor login, and rewriting historical procurement records. The existing vendor KPI rubric and scoring rules remain as approved.

## Scope and user experience

### Staff detail: web and mobile

- Vendor name opens a detail view with two clear sections: **Overview** (the current profile/KPI content, plus an activation checklist) and **Induction** (question draft, import, request status, response, review history). Preserve the role-specific back route and editor.
- Overview shows the single backend-derived availability label and the three gates: Induction approved, both KPIs complete, and Verification complete. Each incomplete gate links to the relevant staff action and shows a reason. Scores remain separate: the Procurement score is the official KPI; a score of zero is still a completed assessment.
- Induction permits Procurement and Super Admin to add, edit, reorder, duplicate, disable, and preview questions; choose whether each is required; publish a version; import an `.xlsx` draft; request or resend a vendor response; inspect the submitted answers; approve or request changes with a reason. A sent/published snapshot is immutable. Editing creates a new draft/version and never changes the form behind an emailed link.
- Show request states such as not sent, sending, sent with expiry, failed, expired, superseded, submitted awaiting review, changes requested, and approved. Keep the previous responses and staff decisions visible as read-only history. Errors, permission loss, stale versions, and failed delivery have explicit recovery actions.
- Mobile staff has the same two sections, question authoring, `.xlsx` import/preview, request, and review controls using its existing native file picker. The vendor's email link opens a responsive web page; no vendor mobile login is introduced.
- The new Induction sections and public response page use the existing Vendor detail/KPI visual language: shared colors, surfaces, typography, field controls, spacing, and responsive behavior on web and mobile.

### Vendor one-time induction form

- A separate `/vendor-induction` route shows only the approved basic identity fields: name, type, work profile, representative, and position, plus the exact published questions in the request snapshot. It does not show Lisno vendor code, baskets, bank/identity documents, staff KPI, verification notes, or another vendor's data.
- The vendor can answer visible questions, review answers, and submit once. Required questions are required only when their conditions are satisfied. Hidden answers are omitted from submission. Submission returns a neutral receipt, not an Active promise; Procurement still reviews it.
- After a change request, staff sends a fresh one-time link. Prior submissions stay immutable. The new link may include staff change notes but cannot expose internal review or scores. Expired, consumed, superseded, revoked, or invalid links show the same non-disclosing unavailable state.

## Questionnaire and import contract

- A questionnaire draft belongs to a stable vendor ID and vendor type. Staff may start from a versioned, editable Execution or Supplier starter set, add vendor-specific questions, or import a workbook into the draft. Publishing freezes a numbered questionnaire version. A request stores an immutable question snapshot and its version/hash; answers reference question and option IDs from that snapshot. Later template edits do not change an approved submission or automatically deactivate existing vendors.
- Supported answer types: short text, paragraph, non-negative number with explicit unit/minimum/maximum, yes/no, single choice, and multiple choice. Each question has a stable key, section, order, prompt, optional help text, type, required flag, and type-specific options/constraints. Conditional display can depend on a prior yes/no or choice answer. Reject missing targets, cycles, ambiguous options, duplicate keys, invalid units, and conditions on later questions. No arbitrary formula or script executes.
- Offer a downloadable `.xlsx` template with explicit `Key`, `Section`, `Question`, `Answer Type`, `Required`, `Option 1…N`, `Unit`, `Min`, `Max`, and `Show If` columns. Also recognize the pasted sample's `Q.No`, `Questions`, `Option 1…3`, and `Logic` headings as a **legacy preview**: import clear prompts/options as draft candidates and flag missing answer types or natural-language Logic for staff mapping. Empty rows are ignored; duplicate prompts/order and `#REF!`/formula/error/hyperlink cells are flagged. No row is published solely because a workbook was selected.
- Enforce workbook size, sheet/row/column, question/option length, and question-count limits before and after parsing. Parse on the client for preview; submit normalized JSON to the backend for independent validation. Do not persist raw workbook bytes or evaluate formulas. Preview shows row-level errors and lets staff select relevant vendor questions, so client brief and buyer-policy rows are excluded. Download/export of the saved questionnaire uses the same safe template shape.
- The pasted table is the only supplied example at this gate. Verification against a specific original workbook requires that file if its hidden sheets, merged cells, or formulas matter.

## State, activation, and compatibility

Keep the existing stored lifecycle (`active`, `inactive`, `archived`) for manual availability and historical compatibility. Add a backend-derived **effective vendor state** with precedence `Archived > Inactive > Under Review > Active`. For lifecycle-active vendors:

```text
Active = current induction approval
      AND current vendor self KPI
      AND current Procurement KPI
      AND complete vendor profile
      AND Procurement-confirmed physical address verification
```

The induction approval references the exact submitted questionnaire version and remains valid until staff explicitly reopens it or a material identity/type change invalidates it. Vendor type changes invalidate the matching KPI generation and induction approval. A physical address change resets verification through the existing profile rule. Email changes revoke outstanding induction links; staff review whether a new response is needed, while past decisions remain audited. An inactive or archived vendor never displays Active regardless of completed gates.

The backend returns `lifecycleStatus`, `effectiveStatus`, and gate details on staff vendor list/detail DTOs; the UI does not infer Active from a local address flag. Add an `effectiveStatus` query filter for the staff directory and use it in the visible Status control, including Under Review. Keep the existing `status` lifecycle filter/field for older clients, with its meaning explicit. Exclusive Active/Under Review counts use effective status; `ratedVendors` and average KPI remain separate metrics.

Apply the rule to **all** vendor records at rollout. Existing vendors without approved induction, both current KPIs, and Verification display Under Review without rewriting their lifecycle status. Read-only historical allocations and suggestions remain visible with their saved snapshots. New project assignment, vendor selection, new suggestions, and allocation increases require effective Active in backend transactional guards; reductions, cancellations, and historical corrections continue under existing authorization and finance rules. The project-level quick-add path may create a candidate vendor, but cannot immediately assign it until all gates are complete. Search/list endpoints return only eligible Active vendors for new work. Stale clients receive a clear conflict when availability changes after selection.

Prefer calculating readiness from the authoritative profile, verification, induction decision, and current KPI records in backend services and guarded transactions. A cached/indexed projection may be added only with transactional updates and reconciliation tests if directory query cost requires it. Repurposing the lifecycle status would lose the distinction between staff-disabled vendors and incomplete onboarding.

## Persistence, API, permissions, and security

- Add versioned questionnaire definitions, induction requests, immutable answer submissions, and immutable staff review decisions keyed by vendor ID. Use optimistic versions/CAS and idempotency keys for publish/request/submit/review. Audit actor, vendor ID, question snapshot/version, request/submission/decision IDs, timestamps, and state transitions without logging raw tokens or private answers.
- Add protected staff endpoints for detail, draft save/publish, import-normalized question save, request/resend, answer read, approval, and change request. Register every route in the canonical route-operation policy and OpenAPI, then synchronize web/mobile authorization mirrors. Grant `procurement.vendor_induction.read`, `.manage`, `.request`, and `.review` only to Procurement and Super Admin through operation-specific policy. A public token grants only inspect and submit of one vendor's one questionnaire; it grants no authoring, review, KPI, or profile access.
- Use the established configured mailer, preflight disabled/unavailable delivery, a cryptographically random hashed token, bounded lifetime (24 hours unless the approved KPI policy changes), recipient-email binding, newest-request-only validity, send-failure state, resend cooldown, rate limiting, no-store/no-referrer/no-index responses, and URL-fragment token capture/scrubbing. Disabled mail creates no token/request/audit/email write. Submission consumes the token and stores answers atomically; repeated/concurrent submission cannot create a second response, while an identical retry can return its receipt.
- Changing vendor type, recipient email, lifecycle to archived, or request generation revokes an outstanding link. Public inspect/submit returns a minimal projected questionnaire and basic vendor details; input/output are server validated. Malformed, expired, or cross-vendor tokens do not disclose whether a vendor exists. No real vendor email is sent during local implementation or testing.
- Recompute effective status and affected directory/overview, procurement selection, suggestions, and staff detail queries after induction, KPI, verification, profile, and lifecycle mutations. Server checks remain authoritative even if a web/mobile cache is stale.

## Alternatives and tradeoffs

1. **Recommended: derived readiness plus immutable questionnaire snapshots.** This keeps lifecycle, KPI, verification, and review as distinct sources of truth, avoids a backfill, and prevents edits from changing a sent form. Directory queries and selection guards must join these sources and be tested for performance/races.
2. **Persist an effective status on each vendor.** Indexed listing is simpler, but every KPI, profile, verification, induction, and lifecycle mutation must update it transactionally. A missed path could expose an incomplete vendor as Active; reconciliation and backfill become necessary. Use only if measured directory scale requires it.

## Acceptance criteria

1. Web and mobile vendor details have Overview and Induction sections for Procurement and Super Admin, with complete loading, empty, error, pending, submitted, review, and approval states. The current KPI/profile actions remain available in Overview.
2. Authorized staff can manually author and safely import/preview/publish vendor induction questions; the pasted client-brief/internal-policy rows are not silently sent to vendors. Validation covers duplicates, `#REF!`, formulas, unsupported logic, conditions, and type/option mismatches.
3. A request reaches the saved vendor email only through an authorized action and yields one token-scoped form. Vendor can only answer; staff can review, approve, or request changes. Request, answer, and review history are immutable and auditable.
4. A lifecycle-active vendor becomes effectively Active only when the induction approval, self KPI, official KPI, complete profile, and physical verification all exist and are current. Missing or revoked gates return it to Under Review. Inactive and Archived retain precedence.
5. Existing incomplete vendors become Under Review; their existing allocations remain readable. Backend rejects new assignments/suggestions/increases for them, including stale clients and project quick-add, while eligible Active vendors work normally. Directory filter/counts and web/mobile labels reconcile to the same backend state.
6. Role tests prove Procurement and Super Admin permissions, all other roles denied, and public tokens restricted to one questionnaire. Replica-set tests cover concurrent submit/approve/request, profile and KPI invalidation, mail disabled/failure/retry, and status/assignment races. Contract/OpenAPI, web/mobile rendered interaction/accessibility, responsive one-time form, typechecks/builds, and `git diff --check` pass.

## Constraints, rollout, and open decisions

No live data rewrite is required for the derived state, but applying it to all existing vendors can immediately reduce the pool available for **new** work. Before any separately authorized deployment, produce a read-only impact count of existing vendors and active project allocations, validate the directory/selection query plan, and prepare a rollback that restores prior selection behavior without deleting submitted history. No production migration, mail, deployment, commit, or push is authorized here.

The user answered the material activation decisions above. Remaining implementation assumption: the questionnaire is drafted per vendor from editable type-specific starter questions; published/requested versions are immutable. An actual `.xlsx` file has not been attached, so its exact workbook structure remains unverified. This does not block the defined import contract or the pasted-example review behavior.
