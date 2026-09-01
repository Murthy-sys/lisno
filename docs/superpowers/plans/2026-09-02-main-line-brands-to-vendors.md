# Main Line Brands Section to Vendors — Task Plan

**Status:** Implemented — verified 2026-09-02  
**Date:** 2026-09-02  
**Specification:** [Main Line Brands Section to Vendors Design](../specs/2026-09-02-main-line-brands-to-vendors-design.md)  
**Approved interpretation:** Presentation-only Main Line terminology change;
the compatible `pricing.payload.brands[]` storage and authoritative reusable
Vendor/price-version contracts remain unchanged.

## Objective

Replace user-visible Brand terminology in the Main Line Mode/Pricing embedded
section with Vendor terminology while preserving every saved row, stable ID,
Pricing property, immutable price-version relationship, CAS version, and
read-only rule.

## Fixed boundaries

- Main Line heading: **Brands** → **Vendors**.
- Add action: **Add brand** → **Add vendor**.
- Empty state: **No brands configured.** → **No vendors configured.**
- Embedded row label: **Name** → **Vendor name**.
- Persisted key remains `pricing.payload.brands`.
- Embedded row IDs do not become reusable Vendor IDs.
- Reusable Vendor administration and `priceEntries[].vendorId` remain
  authoritative and unchanged.
- No backend, API, schema, migration, seed, bootstrap, permission, pricing,
  tax, or finance change is authorized.

## Initial dirty-worktree contract

Before editing:

1. Capture `git status --short` and the relevant diffs for the editor and its
   tests.
2. Treat all existing AI-estimator changes as user or previously approved
   work.
3. Preserve the dynamic Specification builder, professional Mode layout,
   post-save CAS rebasing, hidden Pricing keys, and Overview omission behavior.
4. Do not stage, revert, broadly reformat, or overwrite unrelated changes.

## Ownership boundaries

| Owner | Assigned area | Must not change |
| --- | --- | --- |
| Primary integrator | Product interpretation, dirty-diff reconciliation, approved documents, final diff | Persistence/API contract, unrelated UI |
| Frontend implementation | Main Line Pricing subsection copy and focused rendered tests | Backend, reusable Vendor screens, pricing lineage |
| Integrity review | Read-only terminology, payload-preservation, identity, and regression review | Product files |
| Verification | Read-only focused/full checks and repository hygiene | Product files |

For inline execution, the primary integrator owns the frontend implementation
slice while preserving the same boundaries.

## Dependency-ordered tasks

### Task 1 — Capture baseline and trace visible Brand copy

1. Record the initial dirty status and exact relevant diffs.
2. Inventory every user-visible/accessibility occurrence of Brands tied to the
   Main Line `pricing.payload.brands` subsection.
3. Distinguish Main Line embedded-row copy from reusable Vendor screens,
   internal payload keys, test fixtures, and unrelated media “brands.”
4. Run the focused Pricing editor test as a behavioral baseline.

**Type:** Read-only.  
**Acceptance criteria:** AC 1–9.  
**Blocks:** Tasks 2–4.

### Task 2 — Apply the bounded Main Line terminology change

1. Change the subsection display label to **Vendors**.
2. Let the existing repeater derive **Add vendor** and
   **No vendors configured.** from the new display label.
3. Change only the embedded `brands` row's visible **Name** label to
   **Vendor name**.
4. Preserve the `brands` field discriminator, row factory, IDs, descriptions,
   serialization, ordering, remove/reorder behavior, and all unrelated Pricing
   keys.
5. Do not change Price versions, their Vendor master dropdown, quick-add
   Vendor, or reusable Vendor administration.

**Ownership:** Frontend implementation.  
**Likely files:**
`frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`.  
**Depends on:** Task 1.  
**Acceptance criteria:** AC 1–8.

### Task 3 — Update focused rendered and accessibility coverage

1. Update existing Pricing editor assertions from Brands to Vendors.
2. Assert the **Vendors** heading, **Add vendor** action, and **Vendor name**
   accessible textbox.
3. Add or preserve an empty-state assertion for **No vendors configured.**
4. Assert the old **Brands** heading is absent.
5. Exercise a pre-existing `brands[]` row through edit/save payload handling
   and confirm its ID, description, order, Specifications, hidden fields, and
   price entries are preserved.
6. Cover Draft and read-only rendering where the current test harness supports
   both without expanding scope.

**Ownership:** Frontend implementation.  
**Likely files:**
`frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx`
and an existing Mode/save screen test only if required.  
**Depends on:** Task 2.  
**Acceptance criteria:** AC 1–9.

### Task 4 — Focused verification and final diff review

1. Run the Pricing editor focused test.
2. Run the nearest Mode save/screen regressions that cover Pricing payload
   preservation and same-mounted post-save editing.
3. Run frontend typecheck and production build.
4. Run `git diff --check` and compare final dirty status with the baseline.
5. Confirm no backend, API, reusable Vendor, lockfile, or generated tracked
   file changed.

**Ownership:** Verification.  
**Depends on:** Task 3.  
**Acceptance criteria:** AC 1–9.

### Task 5 — Integrity review and handoff

Review the integrated diff for:

- accidental rename of the persisted `brands` key;
- conflation of embedded row IDs with reusable Vendor IDs;
- loss of descriptions, hidden Pricing keys, Specifications, or price entries;
- Brand copy still visible in the Main Line subsection;
- changes to immutable pricing/vendor relationships;
- Draft/read-only or accessible-name regressions.

Resolve any confirmed defect and rerun the affected checks. Report exact test
results, warnings, unrun checks, and actions not performed.

**Depends on:** Task 4.  
**Acceptance criteria:** AC 1–9.

## Acceptance-criteria traceability

| Acceptance criterion | Planned evidence |
| --- | --- |
| AC 1: Vendors heading | Rendered heading assertion |
| AC 2: Vendor action/field/empty copy | Role- and text-based rendered assertions |
| AC 3: no visible Brand copy | Negative heading/accessibility assertion and copy inventory |
| AC 4: saved row compatibility | Existing-row edit/payload equality assertion |
| AC 5: edit lifecycle | Repeater interaction and nearest Mode save regression |
| AC 6: Pricing preservation | Payload-preservation assertion with asymmetric hidden data |
| AC 7: read-only/conflict terminology | Existing read-only/conflict render coverage or focused addition |
| AC 8: reusable Vendor and `vendorId` unchanged | Final diff boundary inspection and existing Pricing test |
| AC 9: health and hygiene | Focused tests, typecheck, build, `git diff --check` |

## Parallel execution map

No implementation tasks should run in parallel: the copy change and its tests
touch the same tightly coupled frontend component behavior. Read-only integrity
review and final verification run sequentially after the writer finishes.

## Completion conditions

- All nine acceptance criteria have evidence.
- The Main Line subsection consistently says Vendors while saved `brands[]`
  rows remain compatible.
- No backend, API, migration, seed, dependency, lockfile, reusable Vendor,
  price calculation, or immutable price relationship changes occur.
- No production mutation, deployment, commit, push, or external action occurs.

## Execution outcome

- Execution mode A completed with one bounded frontend writer followed by
  sequential integrity review and verification.
- The initial integrity review identified missing Vendor-specific two-save
  lifecycle coverage and production `brands` error routing. Both gaps were
  remediated before re-review.
- Final integrity review returned GO with no unresolved blocker, high, or
  moderate finding.
- Focused Pricing/Mode verification passed 11/11 tests; the full frontend suite
  passed 1420/1420 tests.
- Frontend typecheck, build, and `git diff --check` passed. Build output was
  ignored under `frontend/dist/`; the existing bundle-size advisory remains.
- The bounded product slice changed only the Main Line editor, Mode error
  mapping, and their focused tests. Backend/API/reusable Vendor/CSS/lockfile
  contracts were untouched by this change.
- No migration, seed, dependency installation, commit, stage, push,
  deployment, production mutation, or external action was performed.
