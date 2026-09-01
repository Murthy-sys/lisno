# Main Line Brands Section to Vendors Design

**Status:** Implemented — verified 2026-09-02  
**Date:** 2026-09-02  
**Scope:** Configuration → Main Basket → Main Line → Mode → Pricing

## Goal

Rename the visible **Brands** subsection in the Main Line Pricing editor to
**Vendors** so the screen uses the terminology requested by Super Admins,
without changing immutable pricing relationships or introducing a second
reusable Vendor source of truth.

## Current behavior and evidence

- The Main Line Pricing editor renders three structured areas:
  Specifications, Brands, and Price versions.
- The visible **Brands** subsection edits embedded
  `pricing.payload.brands[]` rows with stable row ID, Name, and optional
  Description.
- Reusable Vendors already have a separate canonical master collection and API
  family.
- Every immutable price version already stores its authoritative Vendor
  relationship as `vendorId` and resolves it against the reusable Vendor
  master.
- Existing bootstrap and saved revision data may contain `brands[]`; removing
  or rewriting that data would require compatibility and migration decisions
  beyond a terminology request.
- Relevant frontend and backend AI-estimator files are already dirty from
  approved work and must be preserved.

## Recommended interpretation

Apply a presentation-only rename inside the Main Line Pricing editor:

- **Brands** becomes **Vendors**.
- **Add brand** becomes **Add vendor**.
- The empty message becomes **No vendors configured.**
- The embedded row's **Name** control becomes **Vendor name** so the form is
  unambiguous.

Retain `pricing.payload.brands[]` as the compatibility storage key. This is the
smallest behavior change consistent with the request and avoids manufacturing
new Vendor IDs, changing price lineage, or duplicating the reusable Vendor
master contract.

## Requirements

1. The Main Line Mode/Pricing screen must not display the heading **Brands**.
2. The replacement heading must be **Vendors**.
3. Add, empty, row-label, validation, and accessible-name copy in this
   subsection must use Vendor terminology.
4. Existing saved `brands[]` rows must continue to render, edit, reorder,
   remove, and save without data loss.
5. New rows must retain the existing stable embedded-row ID behavior.
6. Saving must preserve Specifications, price versions, hidden Pricing keys,
   section CAS, aggregate CAS, and other dirty Mode blocks.
7. Draft-only editing, read-only historical revisions, permissions, conflict
   handling, and post-save editability must remain unchanged.
8. The existing reusable Vendors administration category, quick-add Vendor
   workflow, price-version Vendor dropdown, and `vendorId` relationships must
   remain unchanged.
9. No user-facing Main Line conflict or validation copy may identify the
   renamed subsection as Brands.

## Scope

- Main Line Pricing subsection heading and supporting form copy.
- Subsection-specific accessible names and rendered tests.
- Any Main Line conflict/validation presentation that directly exposes the
  embedded `brands` field label.

## Non-goals

- No rename of the persisted `pricing.payload.brands` key.
- No migration, backfill, bootstrap rewrite, or deletion of saved Brand rows.
- No new `vendorIds` field or vendor-applicability relationship.
- No change to reusable Vendor APIs, models, permissions, archive protection,
  or display-order behavior.
- No change to immutable `priceEntries[].vendorId`, prices, GST, paise
  calculations, tax lineage, or effective windows.
- No change to Specifications or other Main Line tabs.

## Data, API, and persistence impact

- **Data:** none; existing `brands[]` rows remain byte-compatible.
- **API:** none; request and response shapes remain unchanged.
- **Persistence:** none; no collection, index, or embedded schema change.
- **Identity:** embedded row IDs and price-version Vendor IDs remain distinct
  and stable.
- **Migration:** none.
- **Rollback:** revert the frontend terminology while leaving saved data
  untouched.

## UX and accessibility behavior

- Draft revisions show **Vendors**, **Add vendor**, **Vendor name**, and the
  Vendor-specific empty message.
- Read-only revisions show the same Vendor terminology without mutation
  actions.
- Keyboard reorder/remove behavior, focus management, touch targets, and error
  association remain unchanged.
- Existing responsive card/grid styling remains unchanged except for any
  adjustment required to prevent the longer label from wrapping incorrectly.

## Assumptions and constraints

- “Change Brands Section to vendors” means change the visible Main Line
  subsection terminology, not replace the authoritative reusable Vendor or
  price-version contracts.
- The compatibility key must remain hidden from users; internal field names may
  remain `brands` in code and payloads.
- Existing dirty worktree changes are user or previously approved work and
  cannot be reverted, reformatted broadly, or overwritten.

## Risks and mitigations

- **Terminology versus storage mismatch:** keep the compatibility key internal
  and assert all visible/accessibility copy uses Vendors.
- **Vendor identity confusion:** do not connect embedded row IDs to reusable
  Vendor IDs or price-version `vendorId` values.
- **Saved data loss:** preserve the existing payload key and serialization
  behavior; add an edit/save regression using a pre-existing row.
- **Copy drift:** test heading, add action, row control, empty state, read-only
  state, and absence of the old visible heading.

## Acceptance criteria

1. The Main Line Pricing editor displays **Vendors** where it previously
   displayed **Brands**.
2. Draft users see **Add vendor**, **Vendor name**, and **No vendors
   configured.** as applicable.
3. The visible subsection and its accessible controls no longer use Brand
   terminology.
4. Existing `brands[]` payload rows load and save with the same stable IDs,
   values, order, and descriptions.
5. Adding, editing, reordering, and removing a row works before and after a
   successful Mode save.
6. Specifications, hidden Pricing properties, price-version references, and
   other Mode blocks are preserved.
7. Read-only and conflict states use Vendor terminology and expose no new
   mutation capability.
8. Reusable Vendor management and immutable price-version `vendorId`
   relationships are unchanged.
9. Focused rendered/accessibility tests, frontend typecheck/build, and
   repository hygiene pass.

## Open decisions

No open decision remains under the least-expansive interpretation above. If
the intended behavior is instead a master-backed Vendor multi-select or a new
Main-Line-to-Vendor applicability relationship, that is a different data and
workflow contract and requires an updated specification before implementation.

## Implementation verification

- The Main Line Pricing subsection now uses Vendors terminology for its
  heading, add action, empty state, row control, validation summary, and
  read-only presentation.
- Existing `pricing.payload.brands[]` rows remain compatible and were verified
  through add, edit, reorder, remove, save, same-mounted edit, and second save.
- Stable row IDs, descriptions, order, hidden Pricing data, Specifications,
  immutable price references, section CAS, and aggregate CAS were preserved.
- Integrity review returned GO with no blocker, high, or moderate findings.
- Focused rendered lifecycle/error tests passed 11/11; the frontend full suite
  passed 1420/1420.
- Frontend typecheck, production build, and repository `git diff --check`
  passed. The existing Vite large-chunk advisory remains.
- No backend, API schema, reusable Vendor, CSS, dependency, lockfile,
  migration, seed, commit, push, deployment, or production action occurred.
