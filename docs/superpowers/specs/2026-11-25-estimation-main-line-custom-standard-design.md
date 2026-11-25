# Estimation Main Line: Standard / Custom selection

Date: 2026-11-25
Status: Specification and task plan approved; user selected Mode A. Implementation and verification recorded in the linked task plan.

## Goal and confirmed behavior

Show a **Standard / Custom** radio-button choice on every Main Line row in the estimation screen, and save the selected value with that estimate line.

The user explicitly confirmed: **“Save the choice only; keep pricing and requirements unchanged.”** This is an estimate-specific label, independent of pricing and Configuration-owned design rules.

## Current behavior and evidence

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` renders configured Main Line rows with inclusion, tier, PMC, quantity and price controls. It does not currently render the requested Standard / Custom choice.
- `frontend/src/features/estimates/EstimateLineRow.tsx` already provides a `type` presentation slot and radio styling patterns. Extend these existing row patterns rather than redesigning the estimation screen.
- `frontend/src/features/leads/leadsApi.ts` defines an existing `classification: "standard" | "special"`. This is a different concept: the PMC toggle changes classification alongside pricing mode, and choosing Standard in `configuredEstimate.ts` can switch to Sub-vendor pricing and reset price-related state.
- `backend/src/routes/estimates.ts` validates that existing Standard classification uses Sub-vendor pricing. It therefore cannot represent the new independent label safely.
- Configuration also has `designRules.itemNature: "standard" | "custom"`. `KnowledgeDesignRulesPanel.tsx` can change a Designer confirmation default when Custom is selected. The requested estimate label must not edit or reuse that behavior.
- Draft save/restore lives in `LeadEstimateWorkspace.tsx`, `configuredEstimate.ts` and `estimateDraftFingerprint.ts`. The payload currently saves configured lines that are included or already persisted; dirty tracking and save-response reconciliation explicitly list their fields.
- Estimate line persistence, revision snapshots and published snapshot validation use explicit schemas in `backend/src/models/Estimate.ts`, `backend/src/routes/estimates.ts`, `estimate-revisions.service.ts` and `estimate-client-presentation.ts`. A durable choice needs additive data handling, not just local radio state.
- The worktree contains 14 existing modified/untracked paths from the preceding Super Admin changes. Preserve those edits. No estimation implementation has been changed for this request.

## Scope and user experience

1. Add a compact fieldset labelled **Item type**, with native radio options **Standard** and **Custom**, inside each configured Main Line row. This label is presentation only; it does not replace the existing internal `itemType` distinguishing Main Lines from temporary items.
2. Each estimate-line occurrence has its own choice. The same Main Line in two different rooms may have different labels. Use stable line/room IDs for state and unique radio group names, never display names.
3. Default new and previously unmarked lines to Standard in the working editor. Respect an explicitly saved Custom value.
4. Show the control on included and excluded Main Line rows. It is editable only when the line is included and the estimate's existing edit permissions/state allow changes. Excluded rows show their retained/default choice disabled; selecting a radio must never include an item implicitly.
5. Preserve the selection when navigating rooms/sections, refreshing catalogue data, changing quantity or tier, and deselecting/reselecting a saved line. Save and reload must restore it.
6. Keep submission-in-flight, read-only, stale-source and historical-view restrictions consistent with existing row controls. No editing of immutable approved or issued history.
7. Support keyboard radio navigation, accessible group names identifying the Main Line and room, visible focus and narrow-screen wrapping. Reuse the existing visual system; no new dependency or page redesign.

Temporary items and legacy catalogue rows are outside this Main Line request. Do not add choices to basket-level controls or make selection apply to every Main Line in a basket.

## Data and API impact

Introduce a distinct optional estimate-line metadata field, provisionally named:

```ts
customizationType?: "standard" | "custom";
```

- Carry it through configured line input/read types, frontend draft state, save serialization, editing/draft fingerprints, response reconciliation, and restore paths.
- Add enum validation and persistence using the existing estimate save/read endpoints and model. Align memory and Mongo representations wherever line records are explicitly mapped.
- Preserve an existing stored value when an older client omits the field on an update. For a new/unmarked working line, Standard is the compatibility default.
- Preserve the value in new estimate revision/snapshot records where needed for staff save/restore and historical estimation display. Read older snapshots without requiring the field. Do not backfill or rewrite approved snapshots or issued files.
- Update relevant OpenAPI line shapes to reflect the optional field. No new endpoint or permission is needed.
- Backend acceptance of the optional field must precede sending it from a separately deployed frontend. This task does not authorize deployment.

## Pricing, design and workflow invariants

- Do **not** wire these radios to the existing `classification`, `pricingMode`, `rateSource`, `modeTier`, or Configuration `designRules.itemNature` fields.
- A label-only change must not clear saved pricing/component calculations, switch PMC/Sub-vendor/In-house mode, change selected components, or trigger dimension/quantity changes.
- With the same configuration revision and commercial inputs, changing only Standard/Custom leaves rates, line totals, GST, round off, PMC splits, margins and approved financial baselines identical.
- Do not bypass current Configuration freshness checks or normal validation. The new label must not introduce a separate pricing calculation or grant price-edit access.
- Do not generate/remove design requirements, change required/probable recommendations, add/remove lines, or alter approval policy because of this label.
- Continue using current estimate versions/CAS, permissions, save errors and cache invalidation. A label change counts as an unsaved draft edit and must not be lost or falsely reported saved if another edit arrives while saving.
- Keep draft-change detection distinct from commercial/design change detection so the label is saved without being interpreted as a pricing or design-scope change.

## Non-goals

- No price override fields, custom rates, new pricing methods, custom configuration creation or changes to existing Standard/Special classification.
- No change to Configuration-owned design requirements, procurement routing or task generation.
- No new PDF/email layout or customer-facing presentation requirement. Existing issued artifacts remain immutable.
- No migration/backfill, new dependencies, deployment, production mutation, commit or push.

## Assumptions and decisions

- Confirmed: the choice is a saved label only, with no pricing/design effect.
- Default: Standard for new/unmarked working lines; no Configuration-derived Custom inference.
- Scope: per Main Line occurrence within an estimate room, not a shared catalogue setting.
- Editing: include the line before changing the label, preserving current rules for which rows are saved.
- The existing shared staff estimation builder carries the control wherever that builder is used with normal editability. No separate role-specific mutation path.
- No unresolved product decision remains; these defaults are part of this specification for approval.

## Risks and mitigation

- **Accidental price changes:** use independent metadata and a metadata-only draft update; regression-test all three existing pricing modes with unequal amounts.
- **Lost choices:** cover catalogue rebuilds, save/reload, deselection/reselection, dirty fingerprints, and save-response reconciliation.
- **Wrong row changed:** test different Main Lines and the same Main Line in two rooms using stable IDs.
- **History or compatibility breakage:** accept old payloads/snapshots, preserve omitted stored values, and leave issued artifacts untouched.
- **Approval/design side effects:** keep this field out of commercial/design decision inputs while retaining it in draft persistence and immutable revision data.

## Acceptance criteria

1. Every configured Main Line row displays Standard and Custom as an accessible, mutually exclusive radio group, with the specified default and disabled states.
2. Choices are independent per line/room, survive normal navigation and source refresh, and round-trip through the existing save/read flow.
3. A label-only change saves as an edit but changes no price, tax, PMC payment split, margin, tier, quantity, dimension, design requirement, recommendation or approval policy.
4. Existing permissions, CAS conflicts, submission locks and immutable history remain enforced. Older estimates and clients remain compatible.
5. Desktop/mobile layout and keyboard/accessibility checks pass. Focused frontend/backend regression tests, typechecks/builds and repository hygiene checks pass on the integrated change.

## Verification scope after approval

Use focused row/workspace/fingerprint tests plus backend estimate save/read and revision serialization tests. Include Standard → Custom → Standard, different rows/rooms, PMC and In-house cases, save/reload, refresh, older omitted values, invalid enums, blocked edits, stale saves and immutable historical amounts. Verify unchanged design/recommendation outputs and financial totals with asymmetric fixtures. Run relevant frontend/backend typechecks/builds and rendered desktop/mobile checks; use transactional integration only if implementation changes a transactional path. No implementation or tests have run at this specification stage.
