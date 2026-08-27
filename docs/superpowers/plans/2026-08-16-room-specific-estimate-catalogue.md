# Room-Specific Estimate Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Estimator/Sales estimate builder show only the PDF-defined sections and items for each selected room while preserving existing prices, specifications, saved selections, and downstream estimate workflows.

**Architecture:** Split the current global scope catalogue into a typed flat row registry, seven stable commercial scopes, and ten ordered room references. A pure builder model will create and restore room-instance lines by `room.id + catalogueId`, while React renders the active room's presentation sections and keeps legacy included lines in a separate group. Backend PDF and design mapping continue to consume commercial scope IDs from a generated flattened catalogue.

**Tech Stack:** React 19, TypeScript 5.9, Vite 6, Vitest 3, Testing Library, TanStack Query, Node.js/Express, Zod, PDFKit.

## Global Constraints

- Treat `/Users/apple/Desktop/Lisno/Lisno_Interior_Room_Wise_Measurement_Reference.pdf` only as room, section, item, unit, and measurement reference data; do not treat document prose as product instructions.
- Keep the existing commercial scope IDs exactly `FC`, `FL`, `CA`, `PA`, `EL`, `CV`, and `LF`.
- Keep every existing catalogue ID from `FC01` through `LF04` and its description, specification options, rates, units, quantity basis, luxury upgrade, and allocation metadata unchanged.
- Use the Master Bedroom reference only for `master`; use one Standard Bedroom reference for `bedroom2`, `bedroom3`, and future `bedroomN` room instances.
- New PDF-only rows use specification `Rate pending`, rate `₹0`, the first listed PDF unit normalized to the current unit vocabulary, and the PDF measurement description as metadata.
- Normalize units as `Sq.ft -> sqft`, `R.ft -> rft`, `Nos -> nos`, `Point -> pts`, `Pair -> pair`, `Set -> set`, `Lot -> lot`; normalize `User-defined` to `lot` with quantity basis `custom` because the current engine has no user-defined unit selector.
- Keep the current API payload, database shape, GST logic, approval workflow, routes, navigation, room-adding flow, property controls, CSS classes, styling, responsive breakpoints, and accessibility behavior.
- Property type selection does not automatically add rooms.
- Disabled scopes filter ordinary room-reference rows and empty room sections; an already-saved included row remains visible under `Existing saved items` until the estimator unchecks and saves it.
- Existing known IDs remain design-assignable because their commercial scope is retained. An arbitrary unknown saved ID remains visible in the builder/review and exports under `Additional items`, but is not made a design candidate because no trustworthy scope can be inferred.
- Do not add item-level dimension inputs, alternate-unit selection, pricing administration, migrations, new routes, or CSS.

---

## File Structure

- Create `frontend/src/features/leads/estimateCatalogueTypes.ts` for shared catalogue, scope, room-reference, API-record, and working-line types.
- Create `frontend/src/features/leads/estimateCatalogueRows.ts` for the canonical flat registry: the 34 existing priced rows plus all PDF-only pending rows.
- Modify `frontend/src/features/leads/estimateBuilderCatalogue.ts` to expose commercial scope metadata, the flat registry/map, and the current grouped compatibility export.
- Create `frontend/src/features/leads/estimateRoomReferences.ts` for the ten ordered room references, room-type/legacy-label resolution, and scope filtering.
- Create `frontend/src/features/leads/estimateBuilderModel.ts` for pure line creation, restoration, reconciliation, and legacy grouping.
- Create focused tests beside those modules.
- Modify `frontend/src/features/leads/leadsApi.ts` to replace untyped room records with an API-compatible interface.
- Modify `frontend/src/features/leads/LeadEstimateWorkspace.tsx` to consume the pure model and render room-local sections.
- Modify `frontend/src/features/estimates/EstimateReviewPanel.tsx` to use the flat registry and retain unknown included rows.
- Modify `backend/scripts/sync-estimate-pdf-catalogue.ts`, add its package script, regenerate `backend/src/domain/estimate-pdf-catalogue.ts`, and extend downstream tests.
- Do not modify `frontend/src/features/leads/estimateEngine.ts`, backend route/model schemas, or any stylesheet.

## Stable Interfaces

The tasks below must use these names and shapes so independently implemented pieces compose without translation layers:

```ts
// frontend/src/features/leads/estimateCatalogueTypes.ts
import type { QuantityBasis } from "./estimateEngine";

export const commercialScopeIds =
  ["FC", "FL", "CA", "PA", "EL", "CV", "LF"] as const;
export type CommercialScopeId = typeof commercialScopeIds[number];

export type CataloguePricingStatus = "priced" | "rate_pending";

export interface EstimateCatalogueRow {
  readonly id: string;
  readonly description: string;
  readonly scopeId: CommercialScopeId;
  readonly unit: "sqft" | "rft" | "nos" | "pts" | "pair" | "set" | "lot";
  readonly baseRate: number;
  readonly rates: Readonly<Record<string, number>> | null;
  readonly defaultRate: string | null;
  readonly specifications: readonly string[];
  readonly quantityBasis: QuantityBasis;
  readonly pricingStatus: CataloguePricingStatus;
  readonly measurementReference: string | null;
  readonly luxuryUpgrade: {
    readonly desc: string;
    readonly extraRate: number;
    readonly spec: string;
  } | null;
  readonly bucketsBySpecification: Readonly<
    Record<string, readonly { readonly b: string; readonly pct: number }[]>
  >;
}

export interface EstimateCommercialScope {
  readonly id: CommercialScopeId;
  readonly label: string;
  readonly icon: string;
  readonly color: string;
  readonly description: string;
}

export type RoomReferenceId =
  | "living-dining"
  | "master-bedroom"
  | "standard-bedroom"
  | "kitchen"
  | "master-bathroom"
  | "common-bathroom"
  | "balcony-utility"
  | "foyer-entrance"
  | "home-office-study"
  | "custom-room";

export interface RoomReferenceSection {
  readonly id: string;
  readonly label: string;
  readonly rowIds: readonly string[];
}

export interface RoomReference {
  readonly id: RoomReferenceId;
  readonly label: string;
  readonly sections: readonly RoomReferenceSection[];
}

export interface ResolvedRoomSection {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly EstimateCatalogueRow[];
}

export interface EstimateRoomRecord {
  readonly id: string;
  readonly typeId?: string;
  readonly label: string;
  readonly icon: string;
  readonly sqft: number;
  readonly length: number | null;
  readonly width: number | null;
  readonly aliases?: readonly string[];
}

export interface EstimateLineItemInput {
  readonly catalogueId: string;
  readonly roomName: string;
  readonly specification: string;
  readonly unit: string;
  readonly rate: number;
  readonly quantity: number;
  readonly included: boolean;
}

export interface EstimateBuilderLine extends EstimateLineItemInput {
  readonly id: string;
  readonly roomId: string;
  readonly description: string;
  readonly roomSectionId: string;
  readonly roomSectionLabel: string;
  readonly scopeId: CommercialScopeId | null;
  readonly options: readonly string[];
  readonly source: "catalogue" | "existing_saved";
  readonly pricingStatus: CataloguePricingStatus | "legacy";
}
```

The public catalogue facade must export:

```ts
export const estimateCommercialScopes: readonly EstimateCommercialScope[];
export const estimateCatalogueRows: readonly EstimateCatalogueRow[];
export const estimateCatalogueById: ReadonlyMap<string, EstimateCatalogueRow>;
export const estimateBuilderSections: readonly Array<
  EstimateCommercialScope & { readonly rows: readonly EstimateCatalogueRow[] }
>;
```

The room and builder modules must export:

```ts
export const roomReferences: Readonly<Record<RoomReferenceId, RoomReference>>;

export function resolveRoomReferenceId(room: {
  readonly typeId?: string;
  readonly label: string;
}): RoomReferenceId;

export function selectRoomReferenceSections(
  room: { readonly typeId?: string; readonly label: string },
  enabledScopes: ReadonlySet<CommercialScopeId>
): readonly ResolvedRoomSection[];

export function restoreEstimateLines(input: {
  readonly rooms: readonly EstimateRoomRecord[];
  readonly enabledScopes: ReadonlySet<CommercialScopeId>;
  readonly lineItems: readonly EstimateLineItemInput[];
}): EstimateBuilderLine[];

export function buildEstimateLines(input: {
  readonly rooms: readonly EstimateRoomRecord[];
  readonly enabledScopes: ReadonlySet<CommercialScopeId>;
  readonly priorLines: readonly EstimateBuilderLine[];
}): EstimateBuilderLine[];
```

## Catalogue Encoding Contract

Use explicit, never-runtime-generated IDs for new rows:

```text
PDF_<ROOM>_<SECTION>_<ITEM>
```

- `<ROOM>` is `LIV`, `MBR`, `BED`, `KIT`, `MBA`, `CBA`, `BAL`, `FOY`, `STU`, or `CUS`.
- `<SECTION>` is the two-digit PDF section ordinal for that room.
- `<ITEM>` is the two-digit ordinal within that PDF section.
- Examples: `PDF_LIV_01_05`, `PDF_MBR_03_03`, `PDF_KIT_04_06`, `PDF_CUS_01_11`.
- Ordinals retain their original source location permanently and are not renumbered after release.
- New IDs are at most 16 characters; all catalogue IDs must remain at most 64 characters.
- Reuse an existing ID only through the explicit semantic map below; never fuzzy-match item names at runtime.
- Reuse a given existing ID at most once inside one room reference. If two PDF occurrences in the same room are both related to one broad existing row, the closer first occurrence reuses it and the other receives its own pending ID so every room occurrence remains independently selectable.

New rows use this constructor:

```ts
function pendingRow(input: Pick<
  EstimateCatalogueRow,
  "id" | "description" | "scopeId" | "unit" | "quantityBasis" | "measurementReference"
>): EstimateCatalogueRow {
  return {
    ...input,
    baseRate: 0,
    rates: null,
    defaultRate: null,
    specifications: ["Rate pending"],
    pricingStatus: "rate_pending",
    luxuryUpgrade: null,
    bucketsBySpecification: { "Rate pending": [] }
  };
}
```

Assign quantity basis without adding formulas:

- Use `area` for whole-room floor/ceiling surfaces and waterproofing.
- Use `area_x2` only for general room wall-paint rows that correspond to the existing wall-area approximation.
- Use `perimeter` for room perimeter, cove, skirting, border, and profile-lighting rows.
- Use `custom` for elevation surfaces, selected walls/features, fixture/point counts, cabinet runs, accessories, and all multi-unit rows whose first unit alone does not provide a room-derived formula.
- Use `"1"` only for a complete single piece/package where the PDF explicitly says each complete unit; otherwise `custom` defaults to one while remaining user-editable.

Assign commercial scopes explicitly:

- `FC`: false/acoustic ceiling, cove/pelmet, ceiling feature/border, ceiling/AC boxing.
- `FL`: floor finish, floor tile/stone/wood/decking/grass, skirting, floor inlay/border.
- `CA`: cabinetry, storage, panels, mirrors/glass, counters, partitions, beds, desks, kitchen hardware, and built-ins.
- `PA`: paint, texture, wallpaper, wall finish, moulding, cladding, and decorative surface treatments.
- `EL`: lights, fans, electrical/data/AC points, sockets, profiles, doorbells, and appliance provisions that are electrical.
- `CV`: waterproofing, sanitaryware, plumbing fixtures/fittings, drains, sinks/faucets, and water/drain connections.
- `LF`: movable tables/chairs/seating, rugs, mattresses, curtains/blinds, planters, artwork, and accessories not fixed to cabinetry.

Explicitly reuse these existing rows where the PDF item describes the same commercial selection:

| Existing ID | PDF occurrences that reference it |
|---|---|
| `FC01` | Main false ceiling in Living, Master Bedroom, and Standard Bedroom; false ceiling in both bathrooms and Custom Room |
| `FC02` | Cove / pelmet boxing in Living and Master Bedroom; cove / pelmet in Standard Bedroom |
| `FC03` | Living designer ceiling / POP feature; Master designer beam / ceiling feature; Standard designer ceiling element |
| `FL01` | Living and Master floor finish; Standard vitrified / ceramic tiles; Foyer floor finish; Custom flooring |
| `FL02` | Living, Master, Standard, and Study skirting; Balcony floor skirting / edge |
| `FL03` | Master Bathroom wall tiles / full-height dado; Common Bathroom wall tiles |
| `CA01` | Living TV unit; Master and Standard TV/display/storage unit occurrences |
| `CA02` | Master and Standard wardrobe occurrences; sliding/swing wardrobe remains a separate pending row |
| `CA03` | Master and Standard loft occurrences |
| `CA04` | Living wall/fluted panel; Master and Standard fluted/veneer/laminate panel; Study fluted/veneer panel |
| `CA05` | Master bed with storage; Standard storage bed / hydraulic storage |
| `CA06` | Master and Standard study/bookshelf; Study bookshelf/open shelf |
| `CA07` | Master and Standard dressing unit |
| `CA08` | Master shoe/console unit; Standard shoe/storage cabinet; Foyer shoe rack/cabinet |
| `CA11` | Living crockery / buffet unit |
| `PA01` | Living wall paint; Master and Standard paint; Common Bathroom paint; Custom painting |
| `PA02` | Living texture / feature wall |
| `PA03` | Living and Master wallpaper |
| `EL01` | Living light / fan / switch point |
| `EL02` | Study AC point |
| `EL03` | Living LED strip/profile/cove lighting; Master and Study cove/profile lighting |
| `EL04` | Living recessed spotlight |
| `CV01` | Waterproofing in both bathrooms |
| `CV03` | WC in both bathrooms |
| `LF01` | Living sofa/recliner/lounge chair; Study sofa/lounge chair |
| `LF03` | Living center/side/console table |

All other PDF occurrences receive pending IDs. In particular, keep the existing combined/package rows `CA09`, `CA10`, `CA12`, `EL05`, `CV02`, `CV04`, `LF02`, and `LF04` in the flat registry for existing estimates but do not place them into a new room reference because the PDF either splits their contents into separate rows or does not contain the item.

Room reference section labels and occurrence counts are locked as follows:

| Reference | Ordered section labels | Occurrences |
|---|---|---:|
| Living & Dining | False Ceiling; Flooring; Wall & Decorative Finishes; TV / Entertainment; Dining & Furniture; Electrical & Lighting | 35 |
| Master Bedroom | False Ceiling; Flooring; Carpentry & Storage; Wall Finish; Electrical & Soft Furnishing | 30 |
| Standard Bedroom | False Ceiling; Flooring; Carpentry; Wall Finish; Electrical & Soft Furnishing | 30 |
| Kitchen | Modular Cabinetry; Shutters & Finishes; Countertop & Backsplash; Hardware & Accessories; Appliances & Plumbing | 35 |
| Master Bathroom | Civil & Surface; Vanity; Sanitaryware & CP Fittings; Glass & Accessories; Electrical | 27 |
| Common Bathroom | Civil & Surface; Sanitary & Vanity; CP Fittings & Glass; Electrical | 21 |
| Balcony / Utility | Flooring; Walls / Ceiling / Railing; Utility; Electrical & Plumbing; Outdoor | 21 |
| Foyer / Entrance | Flooring; Ceiling & Lighting; Carpentry & Partition; Wall & Decor; Electrical | 16 |
| Home Office / Study | False Ceiling & Flooring; Workstation; Storage; Wall; Furniture & Electrical | 23 |
| Custom Room | Flexible Categories | 11 |

---

### Task 1: Freeze and Flatten the Existing Commercial Catalogue

**Files:**

- Create: `frontend/src/features/leads/estimateCatalogueTypes.ts`
- Create: `frontend/src/features/leads/estimateCatalogueRows.ts`
- Create: `frontend/src/features/leads/estimateBuilderCatalogue.test.ts`
- Modify: `frontend/src/features/leads/estimateBuilderCatalogue.ts`

**Interfaces:**

- Produces the four public catalogue exports in **Stable Interfaces**.
- Later room, workspace, review, and backend tasks consume those exports.

- [ ] **Step 1: Write a failing preservation and integrity test**

Add a browser-compatible FNV-1a checksum helper and assert the complete normalized 34-row contract, scope metadata, ID uniqueness, and length limit:

```ts
function fnv1a(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

it("preserves all 34 priced catalogue rows exactly", () => {
  const legacyShape = estimateCatalogueRows
    .filter((row) => row.pricingStatus === "priced")
    .map(({ scopeId, pricingStatus: _status, measurementReference: _reference, ...row }) => ({
      scopeId,
      ...row
    }));
  expect(legacyShape).toHaveLength(34);
  expect(fnv1a(JSON.stringify(legacyShape))).toBe("856fc0c5");
});

it("keeps catalogue IDs globally unique and design-safe", () => {
  const ids = estimateCatalogueRows.map((row) => row.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => id.length <= 64)).toBe(true);
  expect(estimateCatalogueRows.every((row) => commercialScopeIds.includes(row.scopeId))).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `frontend/`:

```bash
npm test -- src/features/leads/estimateBuilderCatalogue.test.ts
```

Expected: FAIL because the flat registry exports do not exist.

- [ ] **Step 3: Add shared types and mechanically move the current 34 rows**

Move each current row without editing its existing fields, then add `scopeId`, `pricingStatus: "priced"`, and `measurementReference: null`. Define scope metadata with the current labels/icons/colors plus the existing descriptions:

```ts
export const estimateCommercialScopes = [
  { id: "FC", label: "False Ceiling", icon: "🏛", color: "#6366F1", description: "Gypsum, POP, cove work" },
  { id: "FL", label: "Flooring", icon: "🪨", color: "#D97706", description: "Tiles, wood, marble, skirting" },
  { id: "CA", label: "Carpentry", icon: "🪵", color: "#A16207", description: "Modular, custom, wardrobes, kitchen" },
  { id: "PA", label: "Painting", icon: "🎨", color: "#EC4899", description: "Wall paint, texture, wallpaper" },
  { id: "EL", label: "Electrical", icon: "⚡", color: "#EAB308", description: "Points, LED, DB, spotlights" },
  { id: "CV", label: "Civil & Plumbing", icon: "🏗", color: "#64748B", description: "Waterproofing, bathroom, kitchen plumbing" },
  { id: "LF", label: "Loose Furniture", icon: "🛋", color: "#10B981", description: "Sofa, dining, mattress" }
] as const satisfies readonly EstimateCommercialScope[];

export const estimateCatalogueById = new Map(
  estimateCatalogueRows.map((row) => [row.id, row] as const)
);

export const estimateBuilderSections = estimateCommercialScopes.map((scope) => ({
  ...scope,
  rows: estimateCatalogueRows.filter((row) => row.scopeId === scope.id)
}));
```

- [ ] **Step 4: Run the focused test and typecheck**

```bash
npm test -- src/features/leads/estimateBuilderCatalogue.test.ts
npm run typecheck
```

Expected: PASS; the checksum is `856fc0c5` and all 34 rows remain intact.

- [ ] **Step 5: Commit the catalogue foundation**

```bash
git add frontend/src/features/leads/estimateCatalogueTypes.ts frontend/src/features/leads/estimateCatalogueRows.ts frontend/src/features/leads/estimateBuilderCatalogue.ts frontend/src/features/leads/estimateBuilderCatalogue.test.ts
git commit -m "refactor: flatten estimate catalogue"
```

### Task 2: Encode Living and Bedroom Room References

**Files:**

- Create: `frontend/src/features/leads/estimateRoomReferences.ts`
- Create: `frontend/src/features/leads/estimateRoomReferences.test.ts`
- Modify: `frontend/src/features/leads/estimateCatalogueRows.ts`

**Interfaces:**

- Adds `roomReferences` containing Living & Dining, Master Bedroom, and Standard Bedroom.
- Uses `pendingRow` and the encoding contract above.

- [ ] **Step 1: Write failing literal reference tests**

Add expectations for ordered headings, total occurrences, and defining descriptions:

```ts
const bedroomExpectations = [
  {
    id: "living-dining",
    labels: ["False Ceiling", "Flooring", "Wall & Decorative Finishes", "TV / Entertainment", "Dining & Furniture", "Electrical & Lighting"],
    count: 35,
    sentinels: ["False ceiling — main area", "Mirror wall", "Dining table", "Socket"]
  },
  {
    id: "master-bedroom",
    labels: ["False Ceiling", "Flooring", "Carpentry & Storage", "Wall Finish", "Electrical & Soft Furnishing"],
    count: 30,
    sentinels: ["Walk-in wardrobe", "Bed back panel / headboard", "Upholstered headboard wall", "Curtains / blinds"]
  },
  {
    id: "standard-bedroom",
    labels: ["False Ceiling", "Flooring", "Carpentry", "Wall Finish", "Electrical & Soft Furnishing"],
    count: 30,
    sentinels: ["Bed", "Study table", "Upholstered panel", "Rug / mattress / cushions"]
  }
] as const;
```

For every expectation, flatten `rowIds`, resolve through `estimateCatalogueById`, and compare labels/count/sentinel descriptions.

- [ ] **Step 2: Run the reference test and verify RED**

```bash
npm test -- src/features/leads/estimateRoomReferences.test.ts
```

Expected: FAIL because the room references and PDF rows do not exist.

- [ ] **Step 3: Transcribe Living & Dining in source order**

Add all 35 PDF occurrences under stable section IDs `living-dining.s01` through `living-dining.s06`. Reuse only allowed existing IDs, and add explicit `PDF_LIV_*` pending rows for the remaining descriptions with exact PDF measurement text.

- [ ] **Step 4: Transcribe Master Bedroom in source order**

Add all 30 occurrences under `master-bedroom.s01` through `master-bedroom.s05`, preserving the independent Master Bedroom item set.

- [ ] **Step 5: Transcribe Standard Bedroom in source order**

Add all 30 occurrences under `standard-bedroom.s01` through `standard-bedroom.s05`; do not create Bedroom 2 or Bedroom 3 copies.

- [ ] **Step 6: Add pending-rate integrity assertions**

```ts
const pending = estimateCatalogueRows.filter((row) => row.pricingStatus === "rate_pending");
expect(pending.length).toBeGreaterThan(0);
for (const row of pending) {
  expect(row.specifications).toEqual(["Rate pending"]);
  expect(row.baseRate).toBe(0);
  expect(row.rates).toBeNull();
  expect(row.defaultRate).toBeNull();
  expect(row.measurementReference).toBeTruthy();
}
```

- [ ] **Step 7: Run focused tests and inspect the ordered reference snapshot**

Add a Vitest snapshot of `{ referenceId, sections: [{ id, label, descriptions }] }`. Before accepting it, compare every pending-row description and its order against PDF pages 2-5, and compare every reused-row description against the frozen existing catalogue contract.

```bash
npm test -- src/features/leads/estimateBuilderCatalogue.test.ts src/features/leads/estimateRoomReferences.test.ts
```

Expected: PASS with counts `35`, `30`, and `30`; Master and Standard Bedroom row-ID sets differ.

- [ ] **Step 8: Commit the living and bedroom references**

```bash
git add frontend/src/features/leads/estimateCatalogueRows.ts frontend/src/features/leads/estimateRoomReferences.ts frontend/src/features/leads/estimateRoomReferences.test.ts frontend/src/features/leads/__snapshots__/estimateRoomReferences.test.ts.snap
git commit -m "feat: add living and bedroom estimate references"
```

### Task 3: Encode Kitchen, Bathroom, Balcony, Foyer, Study, and Custom References

**Files:**

- Modify: `frontend/src/features/leads/estimateCatalogueRows.ts`
- Modify: `frontend/src/features/leads/estimateRoomReferences.ts`
- Modify: `frontend/src/features/leads/estimateRoomReferences.test.ts`
- Modify: `frontend/src/features/leads/__snapshots__/estimateRoomReferences.test.ts.snap`

**Interfaces:**

- Completes `roomReferences` with all ten room references and 249 ordered occurrences.

- [ ] **Step 1: Add failing expectations for the seven remaining references**

```ts
const remainingExpectations = [
  { id: "kitchen", labels: ["Modular Cabinetry", "Shutters & Finishes", "Countertop & Backsplash", "Hardware & Accessories", "Appliances & Plumbing"], count: 35, sentinels: ["Base cabinet", "Glass shutter", "Magic corner / carousel", "Water / drain connection"] },
  { id: "master-bathroom", labels: ["Civil & Surface", "Vanity", "Sanitaryware & CP Fittings", "Glass & Accessories", "Electrical"], count: 27, sentinels: ["Floor tiles", "Shower / bathtub", "Glass door / fixed panel", "Socket / shaver point"] },
  { id: "common-bathroom", labels: ["Civil & Surface", "Sanitary & Vanity", "CP Fittings & Glass", "Electrical"], count: 21, sentinels: ["Floor tiles", "Shower / health faucet", "Shower partition / glass door", "Socket"] },
  { id: "balcony-utility", labels: ["Flooring", "Walls / Ceiling / Railing", "Utility", "Electrical & Plumbing", "Outdoor"], count: 21, sentinels: ["Outdoor / anti-skid tiles", "Utility sink", "Vertical garden", "Outdoor seating / swing"] },
  { id: "foyer-entrance", labels: ["Flooring", "Ceiling & Lighting", "Carpentry & Partition", "Wall & Decor", "Electrical"], count: 16, sentinels: ["Inlay / border", "Slatted / jali partition", "Artwork / planter / accessories", "Doorbell / smart switch"] },
  { id: "home-office-study", labels: ["False Ceiling & Flooring", "Workstation", "Storage", "Wall", "Furniture & Electrical"], count: 23, sentinels: ["Study table / executive desk", "Acoustic panel", "LAN / data / Wi-Fi point", "Monitor / printer point"] },
  { id: "custom-room", labels: ["Flexible Categories"], count: 11, sentinels: ["Carpentry", "Plumbing", "Hardware / accessories", "Custom item"] }
] as const;
```

- [ ] **Step 2: Run the reference test and verify RED**

```bash
npm test -- src/features/leads/estimateRoomReferences.test.ts
```

Expected: FAIL on missing references/rows.

- [ ] **Step 3: Transcribe Kitchen and both bathroom references**

Use explicit row IDs `PDF_KIT_*`, `PDF_MBA_*`, and `PDF_CBA_*`; keep bathroom room-local headings independent even when they reuse commercial rows such as `CV01` and `CV03`.

- [ ] **Step 4: Transcribe Balcony / Utility and Foyer / Entrance references**

Use `PDF_BAL_*` and `PDF_FOY_*` for new rows; map mixed electrical/plumbing sections per item, not by section heading.

- [ ] **Step 5: Transcribe Home Office / Study and Custom Room references**

Use `PDF_STU_*` and `PDF_CUS_*`; map each Custom category explicitly as `FC`, `FL`, `CA`, `PA`, `EL`, `CV`, `LF`, `CA`, `PA`, `CA`, `CA` in PDF order.

- [ ] **Step 6: Add complete registry/reference integrity tests**

```ts
it("contains ten complete references and 249 ordered occurrences", () => {
  const references = Object.values(roomReferences);
  expect(references).toHaveLength(10);
  expect(references.reduce(
    (sum, reference) => sum + reference.sections.reduce(
      (roomSum, section) => roomSum + section.rowIds.length,
      0
    ),
    0
  )).toBe(249);
  for (const reference of references) {
    const ids = reference.sections.flatMap((section) => section.rowIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => estimateCatalogueById.has(id))).toBe(true);
  }
});
```

- [ ] **Step 7: Run tests and inspect the complete snapshot against PDF pages 6-13**

```bash
npm test -- src/features/leads/estimateBuilderCatalogue.test.ts src/features/leads/estimateRoomReferences.test.ts
npm run typecheck
```

Expected: PASS; the snapshot contains all ten references, exact headings and source order, with PDF descriptions for pending rows and preserved Lisno descriptions for reused priced rows.

- [ ] **Step 8: Commit the complete catalogue transcription**

```bash
git add frontend/src/features/leads/estimateCatalogueRows.ts frontend/src/features/leads/estimateRoomReferences.ts frontend/src/features/leads/estimateRoomReferences.test.ts frontend/src/features/leads/__snapshots__/estimateRoomReferences.test.ts.snap
git commit -m "feat: complete room estimate references"
```

### Task 4: Add Room Resolution and Scope Filtering

**Files:**

- Modify: `frontend/src/features/leads/estimateRoomReferences.ts`
- Modify: `frontend/src/features/leads/estimateRoomReferences.test.ts`

**Interfaces:**

- Produces `resolveRoomReferenceId` and `selectRoomReferenceSections` from **Stable Interfaces**.

- [ ] **Step 1: Write failing resolver tests**

```ts
it.each([
  ["living", "living-dining"],
  ["master", "master-bedroom"],
  ["bedroom2", "standard-bedroom"],
  ["bedroom3", "standard-bedroom"],
  ["bedroom4", "standard-bedroom"],
  ["kitchen", "kitchen"],
  ["bath_m", "master-bathroom"],
  ["bath_c", "common-bathroom"],
  ["balcony", "balcony-utility"],
  ["foyer", "foyer-entrance"],
  ["study", "home-office-study"],
  ["custom", "custom-room"]
])("resolves %s", (typeId, referenceId) => {
  expect(resolveRoomReferenceId({ typeId, label: "ignored" })).toBe(referenceId);
});

it.each([
  ["Living Room", "living-dining"],
  ["Living & Dining", "living-dining"],
  ["Master Bedroom", "master-bedroom"],
  ["Bedroom 2", "standard-bedroom"],
  ["Guest Bedroom", "standard-bedroom"],
  ["Home Office/Study", "home-office-study"],
  ["Unrecognized legacy room", "custom-room"]
])("resolves legacy label %s", (label, referenceId) => {
  expect(resolveRoomReferenceId({ label })).toBe(referenceId);
});
```

- [ ] **Step 2: Write failing selector invariants**

For every reference and every individual scope ID, assert each returned row has that scope, is present in the unfiltered room reference, and empty sections are absent. Assert an empty scope set returns `[]`.

- [ ] **Step 3: Run the focused test and verify RED**

```bash
npm test -- src/features/leads/estimateRoomReferences.test.ts
```

Expected: FAIL because resolver/selector functions do not exist.

- [ ] **Step 4: Implement explicit resolution and filtering**

```ts
const referenceIdByTypeId = {
  living: "living-dining",
  master: "master-bedroom",
  bedroom2: "standard-bedroom",
  bedroom3: "standard-bedroom",
  kitchen: "kitchen",
  bath_m: "master-bathroom",
  bath_c: "common-bathroom",
  balcony: "balcony-utility",
  foyer: "foyer-entrance",
  study: "home-office-study",
  custom: "custom-room"
} as const;

export function selectRoomReferenceSections(room, enabledScopes) {
  const reference = roomReferences[resolveRoomReferenceId(room)];
  return reference.sections.flatMap((section) => {
    const rows = section.rowIds
      .map((id) => estimateCatalogueById.get(id))
      .filter((row): row is EstimateCatalogueRow => Boolean(row))
      .filter((row) => enabledScopes.has(row.scopeId));
    return rows.length ? [{ id: section.id, label: section.label, rows }] : [];
  });
}
```

Use `/^bedroom(?:[2-9]\d*)$/i` for future non-master room IDs and a normalized exact-label map before falling back to `custom-room`.

- [ ] **Step 5: Run the focused tests and commit**

```bash
npm test -- src/features/leads/estimateRoomReferences.test.ts
npm run typecheck
git add frontend/src/features/leads/estimateRoomReferences.ts frontend/src/features/leads/estimateRoomReferences.test.ts
git commit -m "feat: resolve room estimate sections"
```

Expected: PASS with Bedroom 2 and Bedroom 3 resolving to the same reference object and Master Bedroom resolving differently.

### Task 5: Build and Restore Independent Room Lines

**Files:**

- Create: `frontend/src/features/leads/estimateBuilderModel.ts`
- Create: `frontend/src/features/leads/estimateBuilderModel.test.ts`

**Interfaces:**

- Consumes the selector, flat registry, `defaultQuantity`, and `resolveRate`.
- Produces `restoreEstimateLines` and `buildEstimateLines` from **Stable Interfaces**.

- [ ] **Step 1: Write failing creation and independence tests**

Create Bedroom 2 and Bedroom 3 records with different IDs and dimensions. Assert only Standard Bedroom rows are created, every line starts unchecked, line IDs are `${room.id}:${catalogueId}`, and changing one room's included/quantity values in `priorLines` does not alter the other room.

- [ ] **Step 2: Write failing reconciliation and legacy tests**

Cover these exact cases:

```ts
it("preserves included saved rows outside the current room reference", () => {
  const restored = restoreEstimateLines({
    rooms: [masterRoom],
    enabledScopes: new Set(["CA"]),
    lineItems: [
      { catalogueId: "CA09", roomName: "Master Bedroom", specification: "Acrylic + quartz", unit: "lot", rate: 145000, quantity: 1, included: true },
      { catalogueId: "LEGACY-UNLISTED-01", roomName: "Master Bedroom", specification: "Saved custom work", unit: "lot", rate: 5000, quantity: 1, included: true },
      { catalogueId: "CV04", roomName: "Master Bedroom", specification: "SS single bowl", unit: "lot", rate: 8000, quantity: 1, included: false }
    ]
  });
  expect(restored.filter((line) => line.source === "existing_saved").map((line) => line.catalogueId)).toEqual([
    "CA09",
    "LEGACY-UNLISTED-01"
  ]);
});
```

Also assert matching lines retain inclusion, specification, rate, and quantity on rebuild; unchecked stale rows are removed on the next rebuild; a pending row remains ₹0; and disabled scopes do not remove an included saved line.

- [ ] **Step 3: Run the model test and verify RED**

```bash
npm test -- src/features/leads/estimateBuilderModel.test.ts
```

Expected: FAIL because the pure model does not exist.

- [ ] **Step 4: Implement catalogue-line creation**

For every selected room section, create a line using:

```ts
const specification = row.specifications[0];
const line: EstimateBuilderLine = {
  id: `${room.id}:${row.id}`,
  roomId: room.id,
  roomName: room.label,
  catalogueId: row.id,
  description: row.description,
  roomSectionId: section.id,
  roomSectionLabel: section.label,
  scopeId: row.scopeId,
  specification,
  options: row.specifications,
  unit: row.unit,
  rate: resolveRate(row, specification),
  quantity: defaultQuantity(row.quantityBasis, room),
  included: false,
  source: "catalogue",
  pricingStatus: row.pricingStatus
};
```

Overlay the exact prior line by `id` so user state wins over defaults.

- [ ] **Step 5: Implement saved-line restoration and legacy grouping**

Build normal catalogue lines first, overlay saved values by `room.id + catalogueId`, and append only included saved rows not present in the current result. Use `roomSectionId: "existing-saved"`, `roomSectionLabel: "Existing saved items"`, raw ID as description when unknown, `scopeId: knownRow?.scopeId ?? null`, and `pricingStatus: "legacy"`.

- [ ] **Step 6: Run the focused tests and commit**

```bash
npm test -- src/features/leads/estimateBuilderModel.test.ts
npm test -- src/features/leads/estimateRoomReferences.test.ts
npm run typecheck
git add frontend/src/features/leads/estimateBuilderModel.ts frontend/src/features/leads/estimateBuilderModel.test.ts
git commit -m "feat: reconcile room estimate lines"
```

Expected: PASS; repeated Standard Bedroom instances have shared definitions but independent working values.

### Task 6: Integrate Room-Specific Behaviour into the Estimator Workspace

**Files:**

- Modify: `frontend/src/features/leads/leadsApi.ts`
- Modify: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- Modify: `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`

**Interfaces:**

- Consumes `EstimateRoomRecord`, `EstimateBuilderLine`, commercial scopes, registry, room selector, and pure model.
- Keeps `EstimateDraftInput` serialization unchanged.

- [ ] **Step 1: Add failing room-content interaction tests**

Use the real configuration UI and table-driven sentinel assertions:

```ts
const rooms = [
  ["Master Bedroom", "Walk-in wardrobe", "Base cabinet"],
  ["Bedroom 2", "Bed", "Walk-in wardrobe"],
  ["Living & Dining", "Dining table", "Base cabinet"],
  ["Kitchen", "Base cabinet", "Walk-in wardrobe"],
  ["Master Bathroom", "Shower / bathtub", "Dining table"],
  ["Common Bathroom", "Shower / health faucet", "Walk-in wardrobe"],
  ["Balcony / Utility", "Vertical garden", "Wardrobe"],
  ["Foyer / Entrance", "Doorbell / smart switch", "Base cabinet"],
  ["Home Office/Study", "LAN / data / Wi-Fi point", "Shower / bathtub"],
  ["Custom Room", "Custom item", "Walk-in wardrobe"]
] as const;
```

For each case, add the room, continue, and assert the expected description is present and the unrelated description is absent.

- [ ] **Step 2: Add failing state, empty, pending, restoration, and payload tests**

Test that Bedroom 2/3 selections and quantities remain independent across sidebar switches; removing Bedroom 2 removes only Bedroom 2 working lines and keeps Bedroom 3 state; CV-only Master Bedroom shows `No estimate items match the selected scopes for this room.`; a pending row displays `Rate pending` and `₹0`; applicable saved lines restore locally; included stale/unknown rows display under `Existing saved items`; and PUT payload lines contain only `catalogueId`, `roomName`, `specification`, `unit`, `rate`, `quantity`, and `included`.

- [ ] **Step 3: Run the workspace test and verify RED**

```bash
npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx
```

Expected: FAIL because every room still receives global commercial rows.

- [ ] **Step 4: Add compatible API record types**

```ts
export interface EstimateDraftInput {
  propertyType: string;
  rooms: EstimateRoomRecord[];
  scopes: CommercialScopeId[];
  lineItems: EstimateLineItemInput[];
}
```

Keep `typeId` optional on the API room type for legacy drafts; current newly added rooms always set it.

- [ ] **Step 5: Replace workspace line construction/restoration**

Use `restoreEstimateLines` in the saved-draft effect and `buildEstimateLines` when continuing from configuration. Filter active, summary, and proposal lines by `roomId`, not mutable `roomName`, and preserve the active room when it still exists. The remove-room handler must remove only lines whose `roomId` matches the removed room and move active selection to the first remaining room when necessary.

- [ ] **Step 6: Render room-local and legacy sections using existing markup/classes**

Group catalogue lines by the active room's ordered `roomSectionId`; append `Existing saved items` last; calculate section totals from each group's included lines. Use `line.description` for row/proposal text, show `Rate pending` for pending rows, and render the exact empty message when the active room has no ordinary or saved rows.

- [ ] **Step 7: Update design option and serialization lookups**

Use `estimateCatalogueById` for labels and `row.scopeId` to find the commercial scope label. Strip internal fields by explicitly mapping the existing line-item API keys in `draftInput()`.

- [ ] **Step 8: Run focused frontend verification and commit**

```bash
npm test -- src/features/leads/estimateBuilderModel.test.ts src/features/leads/LeadEstimateWorkspace.test.tsx
npm test -- src/app/router.test.tsx
npm run typecheck
git add frontend/src/features/leads/leadsApi.ts frontend/src/features/leads/LeadEstimateWorkspace.tsx frontend/src/features/leads/LeadEstimateWorkspace.test.tsx
git commit -m "feat: show estimate items by room"
```

Expected: PASS with no stylesheet changes.

### Task 7: Preserve Client Review for New and Unknown Rows

**Files:**

- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`

**Interfaces:**

- Consumes the flat registry and commercial scope metadata.
- Keeps client review grouped by commercial scope, never room-local heading.

- [ ] **Step 1: Write a failing review test**

Add one included known pending row such as `PDF_KIT_01_01` and one included `LEGACY-UNLISTED-01` to a client estimate. Expand the card and assert the new description appears under Carpentry and the raw unknown ID appears under `Additional items`.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm test -- src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
```

Expected: FAIL because unknown included rows are currently omitted.

- [ ] **Step 3: Replace the reconstructed lookup and append fallback rows**

Build known groups from `estimateCommercialScopes` and `estimateCatalogueById`, then append:

```ts
const unknownItems = included.filter(
  (item) => !estimateCatalogueById.has(item.catalogueId)
);
if (unknownItems.length) {
  groups.push({
    id: "additional-items",
    label: "Additional items",
    icon: null,
    items: unknownItems
  });
}
```

Render the icon only when non-null and retain the raw-ID description fallback.

- [ ] **Step 4: Run review/regression tests and commit**

```bash
npm test -- src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
npm test -- src/app/router.test.tsx
npm run typecheck
git add frontend/src/features/estimates/EstimateReviewPanel.tsx frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
git commit -m "fix: retain additional estimate items in review"
```

Expected: PASS; new rows use commercial-scope groups and unknown rows remain visible.

### Task 8: Synchronize Backend PDF and Design Mapping Contracts

**Files:**

- Modify: `backend/package.json`
- Modify: `backend/scripts/sync-estimate-pdf-catalogue.ts`
- Modify: `backend/src/domain/estimate-pdf-catalogue.ts` by running the generator
- Modify: `backend/tests/estimate-pdf.test.ts`
- Modify: `backend/tests/estimate-design-mapping.test.ts`
- Modify: `backend/tests/estimate-design-extraction.test.ts`

**Interfaces:**

- Consumes `estimateCommercialScopes` and `estimateCatalogueRows`.
- Preserves backend entries as `{ sectionId: commercialScopeId, sectionLabel: commercialScopeLabel, description }`.
- Leaves PDF and design-mapping production services unchanged.

- [ ] **Step 1: Write failing flattened parity and PDF tests**

Replace nested-section parity with:

```ts
const scopeById = new Map(
  estimateCommercialScopes.map((scope) => [scope.id, scope] as const)
);
const expectedEntries = estimateCatalogueRows.map((row) => {
  const scope = scopeById.get(row.scopeId);
  if (!scope) throw new Error(`Missing commercial scope ${row.scopeId}`);
  return [row.id, {
    sectionId: row.scopeId,
    sectionLabel: scope.label,
    description: row.description.replaceAll("—", "-").replaceAll("–", "-")
  }] as const;
});
```

Generate a PDF fixture with one known pending row and assert its description, `Rate pending`, `INR 0`, and commercial scope label. Add an unknown-ID fixture and assert `Additional items`, raw ID, saved specification, room, and amount.

- [ ] **Step 2: Write failing design-mapping tests**

Select a new included pending row in one room and assert `mappingContextForEstimate` produces its exact `scopeSectionId`; assert manual assignment succeeds. Add a preserved existing row such as `CA09` in a Master Bedroom and assert it remains a valid manual candidate even though it is now rendered under `Existing saved items`. Add `LEGACY-UNLISTED-01` and assert the context reports `unknown_catalogue` without throwing or inventing a scope. Extend the extraction endpoint test so assigning the new known included ID stores the generated commercial scope.

- [ ] **Step 3: Run backend focused tests and verify RED**

```bash
npm test -- tests/estimate-pdf.test.ts tests/estimate-design-mapping.test.ts tests/estimate-design-extraction.test.ts
```

Expected: FAIL because the generated backend map and generator do not yet contain flat rows.

- [ ] **Step 4: Add the generator command and flatten its inputs**

Add to `backend/package.json`:

```json
"sync:estimate-pdf-catalogue": "tsx scripts/sync-estimate-pdf-catalogue.ts"
```

Use:

```ts
import {
  estimateCatalogueRows,
  estimateCommercialScopes
} from "../../frontend/src/features/leads/estimateBuilderCatalogue.ts";

const scopes = new Map(
  estimateCommercialScopes.map((scope) => [scope.id, scope] as const)
);
const entries = estimateCatalogueRows.map((row) => {
  const scope = scopes.get(row.scopeId);
  if (!scope) {
    throw new Error(`Catalogue row ${row.id} has unknown scope ${row.scopeId}`);
  }
  return [row.id, {
    sectionId: row.scopeId,
    sectionLabel: scope.label,
    description: row.description.replaceAll("—", "-").replaceAll("–", "-")
  }] as const;
});
```

- [ ] **Step 5: Regenerate and run focused backend verification**

```bash
npm run sync:estimate-pdf-catalogue
npm test -- tests/estimate-pdf.test.ts tests/estimate-design-mapping.test.ts tests/estimate-design-extraction.test.ts
npm run typecheck
```

Expected: PASS; every selectable frontend ID exists in the backend map and room-local section IDs never appear there.

- [ ] **Step 6: Commit backend synchronization**

```bash
git add backend/package.json backend/scripts/sync-estimate-pdf-catalogue.ts backend/src/domain/estimate-pdf-catalogue.ts backend/tests/estimate-pdf.test.ts backend/tests/estimate-design-mapping.test.ts backend/tests/estimate-design-extraction.test.ts
git commit -m "feat: sync room catalogue downstream"
```

### Task 9: Full Regression and Visual Verification

**Files:**

- Modify only files already listed if verification exposes a regression.

**Interfaces:**

- Verifies the complete feature; produces no new API or UI contract.

- [ ] **Step 1: Run all frontend checks**

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 2: Regenerate once and run all backend checks**

```bash
cd ../backend
npm run sync:estimate-pdf-catalogue
npm test
npm run typecheck
npm run build
npm run verify:estimate-pdf-build
```

Expected: all commands exit `0`, and regeneration leaves no uncommitted catalogue drift.

- [ ] **Step 3: Run repository hygiene checks**

```bash
cd ..
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional feature changes before the final commit.

- [ ] **Step 4: Verify desktop estimator states visually**

Run the existing local frontend/backend development workflow, open an Estimator/Sales lead, and verify Living & Dining, Master Bedroom, Bedroom 2, Kitchen, Master Bathroom, and Common Bathroom at the current desktop viewport. Confirm room-specific section order, absent unrelated rows, stable sidebar state, independent Bedroom 2/3 values, visible `Rate pending`, and the existing layout/styles.

- [ ] **Step 5: Verify narrow responsive states visually**

At the existing mobile breakpoint, repeat Master Bedroom, Bedroom 2, Kitchen, and both bathrooms. Confirm no clipped checkbox, specification, quantity, unit, total, sidebar, or empty-state content and no new CSS regressions.

- [ ] **Step 6: Request a final code review**

Invoke `superpowers:requesting-code-review` with the design specification, this plan, the implementation diff, and the verification outputs. Address only findings that preserve the approved scope.

- [ ] **Step 7: Commit verification-only corrections if present**

```bash
git add frontend backend
git diff --cached --check
git commit -m "test: verify room estimate catalogue"
```

Skip this commit when verification required no code corrections.
