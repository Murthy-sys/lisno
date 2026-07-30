# Production Estimate Design Mapping and Misc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist truthful nullable estimate-drawing mappings, automatically resolve a drawing title to one included room/item pair, let estimators assign an exact included item, and submit verified Misc drawings without inventing identifiers.

**Architecture:** A pure backend mapping module builds candidates only from the persisted estimate's rooms and included catalogue lines, resolves normalized title aliases deterministically, and derives `scopeSectionId` from the backend catalogue. Drawing and immutable revision records store one discriminated mapping tuple with real `null` values; a dedicated versioned assignment endpoint atomically accepts only `{roomId, catalogueId}` while drawing verification remains an independent state. Estimator and client views render Misc as presentation state rather than a fake room or scope, and an idempotent dry-run-capable migration applies the same resolver to legacy records.

**Tech Stack:** Node.js 20+, TypeScript 5, Express 5, Zod 3, Mongoose 9 with replica-set transactions, Vitest/Supertest, React 19, TanStack Query, Testing Library, Vite 6.

## Global Constraints

- Scope is limited to mapping schema, title-to-included-item resolution, estimator assignment, Misc submission/display, migration, documentation, and journey verification. Do not change worker retry/completion, resource bounds, storage, health, or observability behavior in this plan.
- `roomId`, `scopeSectionId`, and `catalogueId` are either all non-empty real identifiers or all actual `null`; never persist `""`, `"null"`, `"undefined"`, or fabricated Misc identifiers.
- Persist `mappingStatus` as exactly `"auto_mapped"`, `"estimator_assigned"`, or `"misc"`.
- Automatic mapping may choose only one unique included `{roomId, catalogueId}` candidate from the persisted estimate. Zero or multiple candidates produce the all-null `"misc"` tuple and never fail extraction completion.
- The backend derives `scopeSectionId` from `estimatePdfCatalogue.get(catalogueId).sectionId`. Worker proposals and browser payloads are never authoritative for scope.
- Estimator assignment accepts `{roomId, catalogueId}` atomically and rejects a room/item pair that is not currently included on the persisted estimate.
- `verified` remains independent from `mappingStatus`. A verified Misc drawing may be submitted; any active unverified drawing still blocks submission.
- Client-visible Misc is a UI group only. Do not create a Misc room, scope, catalogue row, database identifier, or revision identifier.
- Keep accepting the prior worker proposal shape during staged rollout; this plan reads its `detectedTitle` but does not require a worker deployment.
- During backend-first/frontend-last rollout, keep the prior correction/manual request shapes as deprecated compatibility unions. Resolve a legacy `{roomId, scopeSectionId}` only when that room/scope contains exactly one included catalogue item; never guess among multiple items. The new exact-item endpoint remains strict.
- Use the supplied PDF only as a private regression source: its first six canonical titles are `TV UNIT`, `DINING - SEATER UNIT`, `PUJA - UNIT`, `PUJA BACK PANEL`, `CROCKERY - UNIT`, and `KITCHEN`, and the full file has 34 pages. Commit literal title fixtures only; do not commit or copy the private PDF, and do not encode either six or 34 as a page-count contract.
- The migration must support `--dry-run`, report counts and ambiguity conflicts, write in bounded batches, make no writes in dry-run mode, and be safe to rerun.
- Production execution of the migration requires a reviewed dry run and a verified MongoDB backup.

## File Map

- `backend/src/domain/estimate-design-mapping.ts` owns mapping types, title aliases, normalization, context construction, automatic resolution, assignment validation, and tuple validation.
- `backend/src/models/EstimateDesignDrawing.ts` and `backend/src/models/EstimateDesignRevision.ts` persist the current mapping and immutable mapping snapshots.
- `backend/src/services/estimate-design.service.ts` applies backend-owned mapping at extraction completion, exact-item assignment, manual creation, corrections, replacements, submission, and DTO serialization.
- `backend/src/routes/estimate-designs.ts` validates the versioned exact-item assignment request and stops accepting browser-authored scope changes.
- `backend/src/migrations/estimate-design-mapping.ts` plans, reports, dry-runs, and applies the legacy backfill.
- `frontend/src/features/leads/EstimateDesignUploads.tsx` owns estimator Misc grouping, exact-item assignment, and the independent verification gate.
- `frontend/src/features/estimates/ClientEstimateDrawings.tsx` renders submitted all-null mappings in a real Misc presentation group.
- `docs/estimate-design-image-review.md`, `backend/README.md`, and `README.md` document the mapping contract, migration safety, and rollout command.

---

### Task 1: Add the deterministic backend mapping resolver

**Files:**
- Create: `backend/src/domain/estimate-design-mapping.ts`
- Create: `backend/tests/estimate-design-mapping.test.ts`
- Read-only dependency: `backend/src/domain/estimate-pdf-catalogue.ts`

**Interfaces:**
- Consumes: persisted estimate rooms, persisted included line items, enabled scopes, and `estimatePdfCatalogue`.
- Produces:

```ts
export const estimateDesignMappingStatuses = [
  "auto_mapped",
  "estimator_assigned",
  "misc"
] as const;

export type EstimateDesignMappingStatus =
  (typeof estimateDesignMappingStatuses)[number];

export type MiscEstimateDesignMapping = {
  roomId: null;
  scopeSectionId: null;
  catalogueId: null;
  mappingStatus: "misc";
};

export type AutoMappedEstimateDesignMapping = {
  roomId: string;
  scopeSectionId: string;
  catalogueId: string;
  mappingStatus: "auto_mapped";
};

export type EstimatorAssignedMapping = {
  roomId: string;
  scopeSectionId: string;
  catalogueId: string;
  mappingStatus: "estimator_assigned";
};

export type EstimateDesignMapping =
  | MiscEstimateDesignMapping
  | AutoMappedEstimateDesignMapping
  | EstimatorAssignedMapping;

export class InvalidEstimateDesignAssignmentError extends Error {}

export interface EstimateMappingCandidate {
  roomId: string;
  roomTerms: readonly string[];
  catalogueId: string;
  itemTerms: readonly string[];
  scopeSectionId: string;
}

export interface EstimateMappingContext {
  rooms: readonly {
    roomId: string;
    terms: readonly string[];
  }[];
  candidates: readonly EstimateMappingCandidate[];
  invalidIncludedItems: readonly {
    roomName: string;
    catalogueId: string;
    reason: "unknown_catalogue" | "unknown_room" | "disabled_scope";
  }[];
}

export interface AutoMappingResolution {
  mapping: EstimateDesignMapping;
  reason: "unique" | "absent" | "ambiguous";
  candidateKeys: readonly string[];
}

export function mappingContextForEstimate(
  estimate: {
    rooms?: unknown;
    scopes?: unknown;
    lineItems?: unknown;
  }
): EstimateMappingContext;

export function autoMapDrawingTitle(
  title: string,
  context: EstimateMappingContext
): AutoMappingResolution;

export function assignEstimateItem(
  assignment: { roomId: string; catalogueId: string },
  context: EstimateMappingContext
): EstimatorAssignedMapping;

export function assertEstimateDesignMapping(
  mapping: Record<string, unknown>
): asserts mapping is EstimateDesignMapping;
```

- `mappingContextForEstimate`, `autoMapDrawingTitle`, and `assignEstimateItem` are the only public mapping decision functions. Service and migration code must call them rather than reproducing matching logic.

- [ ] **Step 1: Write the failing unique, alias, absent, ambiguity, and assignment tests**

```ts
import { describe, expect, it } from "vitest";
import {
  assignEstimateItem,
  autoMapDrawingTitle,
  mappingContextForEstimate
} from "../src/domain/estimate-design-mapping.js";

const estimate = {
  rooms: [
    { id: "room-bedroom-1", label: "Bedroom 1" },
    { id: "room-bedroom-2", label: "Bedroom 2" }
  ],
  scopes: ["CA"],
  lineItems: [
    {
      catalogueId: "CA01",
      roomName: "Bedroom 1",
      specification: "BWR ply + veneer + polish",
      included: true
    },
    {
      catalogueId: "CA01",
      roomName: "Bedroom 2",
      specification: "MDF + PU paint",
      included: true
    },
    {
      catalogueId: "CA02",
      roomName: "Bedroom 1",
      specification: "Swing door — veneer",
      included: false
    }
  ]
};

describe("estimate design mapping", () => {
  it("maps TV UNIT - BEDROOM 1 to the one included exact item", () => {
    const resolution = autoMapDrawingTitle(
      "TV UNIT - BEDROOM 1",
      mappingContextForEstimate(estimate)
    );

    expect(resolution).toEqual({
      mapping: {
        roomId: "room-bedroom-1",
        catalogueId: "CA01",
        scopeSectionId: "CA",
        mappingStatus: "auto_mapped"
      },
      reason: "unique",
      candidateKeys: ["room-bedroom-1\u0000CA01"]
    });
  });

  it("uses derived room and item aliases without case or punctuation sensitivity", () => {
    expect(
      autoMapDrawingTitle(
        "Tv Console / Bed 1 - Elevation",
        mappingContextForEstimate(estimate)
      ).mapping
    ).toEqual({
      roomId: "room-bedroom-1",
      catalogueId: "CA01",
      scopeSectionId: "CA",
      mappingStatus: "auto_mapped"
    });
  });

  it("does not map an item to the wrong room when the mentioned room lacks it", () => {
    const onlyBedroomOne = {
      ...estimate,
      lineItems: estimate.lineItems.filter((line) =>
        line.roomName !== "Bedroom 2"
      )
    };
    expect(
      autoMapDrawingTitle(
        "TV UNIT - BEDROOM 2",
        mappingContextForEstimate(onlyBedroomOne)
      )
    ).toMatchObject({
      mapping: {
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc"
      },
      reason: "absent"
    });
  });

  it.each([
    ["MBR - WARDROBE", "Master Bedroom", "CA02"],
    ["PBR STUDY", "Parents Bedroom", "CA06"],
    ["KBR WARDROBE", "Kids Bedroom", "CA02"],
    ["MBR DRESSER UNIT", "Master Bedroom", "CA07"],
    ["COMMON VANITY", "Common", "CA07"]
  ])("maps production room/item shorthand in %s", (title, roomName, catalogueId) => {
    const context = mappingContextForEstimate({
      rooms: [{ id: `room-${roomName}`, label: roomName }],
      scopes: ["CA"],
      lineItems: [{
        catalogueId,
        roomName,
        specification: "fixture",
        included: true
      }]
    });
    expect(autoMapDrawingTitle(title, context).mapping).toMatchObject({
      roomId: `room-${roomName}`,
      catalogueId,
      scopeSectionId: "CA",
      mappingStatus: "auto_mapped"
    });
  });

  it("keeps TV UNIT in Misc when that included item exists in two rooms", () => {
    expect(
      autoMapDrawingTitle(
        "TV UNIT",
        mappingContextForEstimate(estimate)
      )
    ).toEqual({
      mapping: {
        roomId: null,
        catalogueId: null,
        scopeSectionId: null,
        mappingStatus: "misc"
      },
      reason: "ambiguous",
      candidateKeys: [
        "room-bedroom-1\u0000CA01",
        "room-bedroom-2\u0000CA01"
      ]
    });
  });

  it("keeps an absent catalogue title in Misc", () => {
    expect(
      autoMapDrawingTitle(
        "BAR COUNTER - BEDROOM 1",
        mappingContextForEstimate(estimate)
      )
    ).toMatchObject({
      mapping: {
        roomId: null,
        catalogueId: null,
        scopeSectionId: null,
        mappingStatus: "misc"
      },
      reason: "absent",
      candidateKeys: []
    });
  });

  it("assigns only an included room/item pair and derives its scope", () => {
    const context = mappingContextForEstimate(estimate);
    expect(assignEstimateItem({
      roomId: "room-bedroom-2",
      catalogueId: "CA01"
    }, context)).toEqual({
      roomId: "room-bedroom-2",
      catalogueId: "CA01",
      scopeSectionId: "CA",
      mappingStatus: "estimator_assigned"
    });
    expect(() => assignEstimateItem({
      roomId: "room-bedroom-1",
      catalogueId: "CA02"
    }, context)).toThrow("The selected estimate item is not included for this room.");
  });

  it.each([
    ["TV UNIT", "CA01", "CA"],
    ["DINING - SEATER UNIT", "LF02", "LF"],
    ["PUJA - UNIT", "CA12", "CA"],
    ["PUJA BACK PANEL", "CA12", "CA"],
    ["CROCKERY - UNIT", "CA11", "CA"],
    ["KITCHEN", "CA09", "CA"]
  ])("maps supplied title %s to one included item", (
    title,
    catalogueId,
    scopeSectionId
  ) => {
    const context = mappingContextForEstimate({
      rooms: [{ id: "room-bedroom-1", label: "Bedroom 1", aliases: [] }],
      scopes: ["CA", "LF"],
      lineItems: ["CA01", "LF02", "CA12", "CA04", "CA11", "CA09"].map(
        (id) => ({
          catalogueId: id,
          roomName: "Bedroom 1",
          specification: "fixture",
          included: true
        })
      )
    });

    expect(autoMapDrawingTitle(title, context).mapping).toEqual({
      roomId: "room-bedroom-1",
      catalogueId,
      scopeSectionId,
      mappingStatus: "auto_mapped"
    });
  });
});
```

- [ ] **Step 2: Run the resolver test and verify RED**

Run: `cd backend && npm test -- --run tests/estimate-design-mapping.test.ts`

Expected: FAIL with `Cannot find module '../src/domain/estimate-design-mapping.js'`.

- [ ] **Step 3: Implement canonical terms and the exact alias table**

```ts
import { estimatePdfCatalogue } from "./estimate-pdf-catalogue.js";

const itemAliases: Readonly<Record<string, readonly string[]>> = {
  CA01: ["tv unit", "television unit", "tv console"],
  CA02: ["wardrobe", "closet"],
  CA04: ["wall paneling", "wall panelling"],
  CA06: ["study", "study unit", "bookcase", "bookcase unit"],
  CA07: ["dresser", "dresser unit", "vanity", "vanity unit"],
  CA09: ["modular kitchen", "kitchen", "kitchen cabinets"],
  CA11: ["crockery unit", "display unit"],
  CA12: ["pooja unit", "puja unit", "pooja back panel", "puja back panel"],
  EL01: ["electrical plan", "lighting plan", "power plan"],
  FC01: ["false ceiling", "reflected ceiling", "rcp"],
  FL01: ["floor finish", "flooring plan"],
  LF02: ["dining seater unit", "dining table", "dining set"]
};

function normalizeMappingTerm(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\b(?:drawing|elevation|layout|plan|detail)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(title: string, term: string) {
  return ` ${title} `.includes(` ${term} `);
}

function roomTermsFor(label: string, explicitAliases: readonly string[]) {
  const normalized = normalizeMappingTerm(label);
  const terms = new Set(
    [label, ...explicitAliases].map(normalizeMappingTerm).filter(Boolean)
  );
  const numberedBedroom = /^bed(?:room)?\s+(\d+)$/u.exec(normalized);
  if (numberedBedroom) {
    terms.add(`bed ${numberedBedroom[1]}`);
    terms.add(`br ${numberedBedroom[1]}`);
  }
  if (/\bmaster\b.*\bbed(?:room)?\b/u.test(normalized)) terms.add("mbr");
  if (/\bparents?\b.*\bbed(?:room)?\b/u.test(normalized)) terms.add("pbr");
  if (/\bkids?\b.*\bbed(?:room)?\b/u.test(normalized)) terms.add("kbr");
  return [...terms];
}

function itemTermsFor(description: string, aliases: readonly string[]) {
  return [...new Set(
    [description, ...description.split("/"), ...aliases]
      .map(normalizeMappingTerm)
      .filter(Boolean)
  )];
}
```

Implement context construction with exact room-name equality after normalization, then deduplicate by the atomic pair:

```ts
export function mappingContextForEstimate(
  estimate: { rooms?: unknown; scopes?: unknown; lineItems?: unknown }
): EstimateMappingContext {
  const rooms = (Array.isArray(estimate.rooms) ? estimate.rooms : [])
    .flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const room = value as Record<string, unknown>;
      const id = typeof room.id === "string" ? room.id.trim() : "";
      const label = typeof room.label === "string" ? room.label.trim() : "";
      if (!id || !label) return [];
      const aliases = Array.isArray(room.aliases)
        ? room.aliases.filter((item): item is string =>
            typeof item === "string" && item.trim().length > 0
          )
        : [];
      return [{
        id,
        terms: roomTermsFor(label, aliases)
      }];
    });
  const enabledScopes = new Set(
    (Array.isArray(estimate.scopes) ? estimate.scopes : [])
      .filter((value): value is string => typeof value === "string")
  );
  const candidates = new Map<string, EstimateMappingCandidate>();
  const invalidIncludedItems: Array<
    EstimateMappingContext["invalidIncludedItems"][number]
  > = [];

  for (const value of Array.isArray(estimate.lineItems)
    ? estimate.lineItems
    : []) {
    if (!value || typeof value !== "object") continue;
    const line = value as Record<string, unknown>;
    if (line.included !== true) continue;
    const catalogueId = typeof line.catalogueId === "string"
      ? line.catalogueId.trim()
      : "";
    const roomName = typeof line.roomName === "string"
      ? line.roomName.trim()
      : "";
    const entry = estimatePdfCatalogue.get(catalogueId);
    if (!entry) {
      invalidIncludedItems.push({
        roomName,
        catalogueId,
        reason: "unknown_catalogue"
      });
      continue;
    }
    const roomMatches = rooms.filter((room) =>
      room.terms.includes(normalizeMappingTerm(roomName))
    );
    if (roomMatches.length !== 1) {
      invalidIncludedItems.push({
        roomName,
        catalogueId,
        reason: "unknown_room"
      });
      continue;
    }
    if (!enabledScopes.has(entry.sectionId)) {
      invalidIncludedItems.push({
        roomName,
        catalogueId,
        reason: "disabled_scope"
      });
      continue;
    }
    const room = roomMatches[0]!;
    const candidate: EstimateMappingCandidate = {
      roomId: room.id,
      roomTerms: room.terms,
      catalogueId,
      itemTerms: itemTermsFor(
        entry.description,
        itemAliases[catalogueId] ?? []
      ),
      scopeSectionId: entry.sectionId
    };
    candidates.set(candidateKey(candidate), candidate);
  }

  return {
    rooms: rooms.map((room) => ({
      roomId: room.id,
      terms: room.terms
    })),
    candidates: [...candidates.values()].sort((left, right) =>
      candidateKey(left).localeCompare(candidateKey(right))
    ),
    invalidIncludedItems
  };
}
```

- [ ] **Step 4: Implement unique resolution, ambiguity reporting, and exact assignment**

```ts
export function autoMapDrawingTitle(
  title: string,
  context: EstimateMappingContext
): AutoMappingResolution {
  const normalized = normalizeMappingTerm(title);
  const itemMatches = context.candidates.filter((candidate) =>
    candidate.itemTerms.some((term) => containsTerm(normalized, term))
  );
  const mentionedRooms = new Set(
    context.rooms
      .filter((room) =>
        room.terms.some((term) => containsTerm(normalized, term))
      )
      .map((room) => room.roomId)
  );
  const matches = itemMatches.filter((candidate) =>
    mentionedRooms.size === 0 || mentionedRooms.has(candidate.roomId)
  );
  const candidateKeys = matches.map(candidateKey).sort();

  if (matches.length !== 1) {
    return {
      mapping: miscMapping(),
      reason: matches.length === 0 ? "absent" : "ambiguous",
      candidateKeys
    };
  }
  const [match] = matches;
  return {
    mapping: {
      roomId: match.roomId,
      catalogueId: match.catalogueId,
      scopeSectionId: match.scopeSectionId,
      mappingStatus: "auto_mapped"
    },
    reason: "unique",
    candidateKeys
  };
}

export function assignEstimateItem(
  assignment: { roomId: string; catalogueId: string },
  context: EstimateMappingContext
) {
  const candidate = context.candidates.find((item) =>
    item.roomId === assignment.roomId &&
    item.catalogueId === assignment.catalogueId
  );
  if (!candidate) {
    throw new InvalidEstimateDesignAssignmentError(
      "The selected estimate item is not included for this room."
    );
  }
  return {
    roomId: candidate.roomId,
    catalogueId: candidate.catalogueId,
    scopeSectionId: candidate.scopeSectionId,
    mappingStatus: "estimator_assigned" as const
  };
}
```

`assertEstimateDesignMapping` must reject sentinel strings and enforce the all-null/all-present invariant. It must not coerce bad live writes; only the migration in Task 8 may normalize legacy values.

- [ ] **Step 5: Run the focused resolver test**

Run: `cd backend && npm test -- --run tests/estimate-design-mapping.test.ts`

Expected: PASS with the exact Bedroom 1, alias, absent, ambiguity, excluded-item, and backend-derived `CA` assertions.

- [ ] **Step 6: Commit the resolver**

```bash
git add backend/src/domain/estimate-design-mapping.ts backend/tests/estimate-design-mapping.test.ts
git commit -m "feat: resolve drawings to included estimate items"
```

### Task 2: Enforce true-null mapping persistence and serialization

**Files:**
- Modify: `backend/src/models/EstimateDesignDrawing.ts:5-22`
- Modify: `backend/src/models/EstimateDesignRevision.ts:10-29`
- Modify: `backend/src/services/estimate-design.service.ts:2709-2765`
- Modify: `backend/tests/estimate-design-extraction.test.ts:437-453`
- Modify: `backend/tests/estimate-design-upload.test.ts:301-359`
- Modify: `frontend/src/api/types.ts:636-673`

**Interfaces:**
- Consumes: `EstimateDesignMapping`, `EstimateDesignMappingStatus`, and `assertEstimateDesignMapping` from Task 1.
- Produces: identical mapping fields on both current drawings and immutable revision snapshots:

```ts
interface EstimateDesignMappingFields {
  roomId: string | null;
  scopeSectionId: string | null;
  catalogueId: string | null;
  mappingStatus: EstimateDesignMappingStatus;
}
```

- `EstimateDesignDrawing` and `EstimateDesignRevision` frontend types both extend `EstimateDesignMappingFields`.

- [ ] **Step 1: Replace the empty-string model test with failing true-null invariant tests**

```ts
it("stores unresolved drawing and revision mappings as actual nulls", async () => {
  const drawing = new EstimateDesignDrawingModel({
    _id: "drawing-misc",
    uploadId: "upload-1",
    sourcePageId: "page-1",
    estimateId: "estimate-1",
    active: true,
    verified: true,
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc",
    detectedTitle: "TV UNIT",
    displayTitle: "TV UNIT",
    source: "ocr"
  });
  const revision = new EstimateDesignRevisionModel({
    _id: "revision-misc",
    drawingId: "drawing-misc",
    revisionNumber: 1,
    sourcePageId: "page-1",
    crop: { x: 0, y: 0, width: 100, height: 80 },
    croppedFileReference: "misc.png",
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc",
    label: "TV UNIT",
    reviewStatus: "draft"
  });

  await expect(drawing.validate()).resolves.toBeUndefined();
  await expect(revision.validate()).resolves.toBeUndefined();
  expect(drawing.toObject()).toMatchObject({
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc"
  });
  expect(revision.toObject()).toMatchObject({
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc"
  });
});

it.each(["", "null", "undefined"])(
  "rejects the legacy %s mapping sentinel on live writes",
  async (sentinel) => {
    const drawing = new EstimateDesignDrawingModel({
      _id: `drawing-${sentinel || "empty"}`,
      uploadId: "upload-1",
      sourcePageId: "page-1",
      estimateId: "estimate-1",
      active: true,
      verified: false,
      roomId: sentinel,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc",
      detectedTitle: "Unknown",
      displayTitle: "Unknown",
      source: "ocr"
    });
    await expect(drawing.validate()).rejects.toThrow();
  }
);

it("rejects a partial mapping tuple in a query update", async () => {
  await expect(
    EstimateDesignDrawingModel.updateOne(
      { _id: "drawing-misc" },
      { $set: { roomId: "room-bedroom-1" } },
      { runValidators: true }
    )
  ).rejects.toThrow("Mapping updates must set the complete tuple.");
});
```

- [ ] **Step 2: Run model and serialization tests and verify RED**

Run: `cd backend && npm test -- --run tests/estimate-design-extraction.test.ts tests/estimate-design-upload.test.ts`

Expected: FAIL because revisions default to `""`, `catalogueId`/`mappingStatus` are not persisted, and revision DTOs stringify `null`.

- [ ] **Step 3: Add nullable fields and cross-field validation to both schemas**

```ts
const nullableMappingIdentifier = (immutable = false) => ({
  type: String,
  default: null,
  immutable,
  validate: {
    validator: (value: unknown) =>
      value === null ||
      (
        typeof value === "string" &&
        value.trim().length > 0 &&
        !["null", "undefined"].includes(value.trim().toLowerCase())
      ),
    message: "Mapping identifiers must be a real identifier or null."
  }
});

// Drawing schema.
roomId: nullableMappingIdentifier(),
scopeSectionId: nullableMappingIdentifier(),
catalogueId: nullableMappingIdentifier(),
mappingStatus: {
  type: String,
  required: true,
  enum: estimateDesignMappingStatuses,
  default: "misc"
},

// Revision schema.
roomId: nullableMappingIdentifier(true),
scopeSectionId: nullableMappingIdentifier(true),
catalogueId: nullableMappingIdentifier(true),
mappingStatus: {
  type: String,
  required: true,
  enum: estimateDesignMappingStatuses,
  default: "misc",
  immutable: true
}
```

Add `pre("validate")` middleware to each schema that calls `assertEstimateDesignMapping` with the four fields. A `"misc"` document with one non-null identifier and a mapped document with any null identifier must fail validation.

Document validation does not protect query updates. Add this complete-tuple query middleware to the mutable drawing schema for `updateOne`, `updateMany`, and `findOneAndUpdate`:

```ts
const mappingKeys = [
  "roomId", "scopeSectionId", "catalogueId", "mappingStatus"
] as const;

function validateMappingUpdate(this: mongoose.Query<unknown, unknown>) {
  const update = this.getUpdate();
  if (Array.isArray(update)) {
    const touchesMapping = update.some((stage) => {
      const value = stage as Record<string, Record<string, unknown> | string[]>;
      return mappingKeys.some((key) =>
        key in (value.$set ?? {}) ||
        key in (value.$addFields ?? {}) ||
        (Array.isArray(value.$unset) && value.$unset.includes(key))
      );
    });
    if (touchesMapping) {
      throw new Error("Pipeline updates cannot change mapping fields.");
    }
    return;
  }
  const set = (update?.$set ?? {}) as Record<string, unknown>;
  const unset = (update?.$unset ?? {}) as Record<string, unknown>;
  const direct = (update ?? {}) as Record<string, unknown>;
  const touchesMapping = mappingKeys.some((key) =>
    key in set || key in unset || key in direct
  );
  if (!touchesMapping) return;
  if (
    mappingKeys.some((key) => key in unset) ||
    !mappingKeys.every((key) => key in set)
  ) {
    throw new Error("Mapping updates must set the complete tuple.");
  }
  assertEstimateDesignMapping(set);
}
```

Register it on the drawing schema and require every live drawing update to use one complete `$set` tuple. On the revision schema, register separate `updateOne`, `updateMany`, and `findOneAndUpdate` middleware that rejects **any** mapping-field change with `Revision mapping snapshots are immutable.`; live services create a replacement revision rather than mutate history. Add drawing tests for partial and invalid complete tuples plus revision tests for both complete and partial mapping updates. Task 8 uses a narrowly scoped, explicitly validated raw-collection migration path to repair legacy revision snapshots without weakening this live invariant; neither test may depend only on document `pre("validate")`.

- [ ] **Step 4: Serialize nullable mapping fields without string coercion**

```ts
function mappingDto(record: Record<string, unknown>) {
  const candidate: Record<string, unknown> = {
    roomId: record.roomId ?? null,
    scopeSectionId: record.scopeSectionId ?? null,
    catalogueId: record.catalogueId ?? null,
    mappingStatus: record.mappingStatus ?? "misc"
  };
  try {
    assertEstimateDesignMapping(candidate);
    return candidate;
  } catch {
    return {
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc" as const
    };
  }
}

function drawingDto(drawing: Record<string, unknown>) {
  return {
    id: String(drawing._id),
    uploadId: String(drawing.uploadId),
    sourcePageId: String(drawing.sourcePageId),
    estimateId: String(drawing.estimateId),
    active: Boolean(drawing.active),
    verified: Boolean(drawing.verified),
    ...mappingDto(drawing),
    detectedTitle: String(drawing.detectedTitle),
    displayTitle: String(drawing.displayTitle),
    source: String(drawing.source),
    roomConfidence: drawing.roomConfidence ?? null,
    scopeConfidence: drawing.scopeConfidence ?? null,
    ocrConfidence: drawing.ocrConfidence ?? null,
    roomEvidence: drawing.roomEvidence ?? [],
    scopeEvidence: drawing.scopeEvidence ?? []
  };
}

function revisionDto(revision: Record<string, unknown>) {
  return {
    id: String(revision._id),
    drawingId: String(revision.drawingId),
    revisionNumber: Number(revision.revisionNumber),
    sourcePageId: String(revision.sourcePageId),
    crop: revision.crop,
    ...mappingDto(revision),
    label: String(revision.label),
    reviewStatus: String(revision.reviewStatus),
    submittedAt: revision.submittedAt ?? null,
    reviewerId: revision.reviewerId ?? null,
    reviewedAt: revision.reviewedAt ?? null,
    changeSummary: revision.changeSummary ?? null,
    annotationLayerId: revision.annotationLayerId ?? null,
    annotations: revision.annotations ?? null,
    replacementUploadId: revision.replacementUploadId ?? null,
    replacesRevisionId: revision.replacesRevisionId ?? null
  };
}
```

Extend the workspace serialization test so its drawing and revision both return all-null `"misc"` mappings and the serialized JSON contains none of `""`, `"null"`, or `"undefined"` as identifier values. Add one legacy-record case with valid room/scope strings but missing `catalogueId`/`mappingStatus`; the compatibility DTO must emit the all-null Misc tuple until Task 8 migrates it.

- [ ] **Step 5: Update frontend contract types**

```ts
export type EstimateDesignMappingStatus =
  | "auto_mapped"
  | "estimator_assigned"
  | "misc";

export interface EstimateDesignMappingFields {
  roomId: string | null;
  scopeSectionId: string | null;
  catalogueId: string | null;
  mappingStatus: EstimateDesignMappingStatus;
}

export interface EstimateDesignDrawing extends EstimateDesignMappingFields {
  id: string;
  uploadId: string;
  sourcePageId: string;
  estimateId: string;
  active: boolean;
  verified: boolean;
  detectedTitle: string;
  displayTitle: string;
  source: "ocr" | "manual";
  roomConfidence: number | null;
  scopeConfidence: number | null;
  ocrConfidence: number | null;
  roomEvidence: Array<{ value: string }>;
  scopeEvidence: Array<{ value: string }>;
}

export interface EstimateDesignRevision extends EstimateDesignMappingFields {
  id: string;
  drawingId: string;
  revisionNumber: number;
  sourcePageId: string;
  crop: CropRect;
  label: string;
  reviewStatus: EstimateDrawingReviewStatus;
  submittedAt: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  changeSummary: string | null;
  annotationLayerId: string | null;
  annotations: AnnotationDocumentV1 | null;
  replacementUploadId: string | null;
  replacesRevisionId: string | null;
}
```

The shared four-field mapping contract makes revision identifiers nullable while retaining every listed drawing/revision property.

- [ ] **Step 6: Run focused tests and type checks**

Run: `cd backend && npm test -- --run tests/estimate-design-extraction.test.ts tests/estimate-design-upload.test.ts && npm run typecheck && cd ../frontend && npm run typecheck`

Expected: PASS; both models validate actual nulls, reject sentinels/incoherent tuples, workspace JSON preserves nulls, and TypeScript accepts nullable revision mappings.

- [ ] **Step 7: Commit the persistence contract**

```bash
git add backend/src/models/EstimateDesignDrawing.ts backend/src/models/EstimateDesignRevision.ts backend/src/services/estimate-design.service.ts backend/tests/estimate-design-extraction.test.ts backend/tests/estimate-design-upload.test.ts frontend/src/api/types.ts
git commit -m "feat: persist truthful nullable drawing mappings"
```

### Task 3: Apply backend-owned automatic mapping during extraction completion

**Files:**
- Modify: `backend/src/services/estimate-design.service.ts:919-1055`
- Modify: `backend/src/services/estimate-design.service.ts:2798-2826`
- Modify: `backend/src/services/estimate-design.service.ts:3083-3155`
- Modify: `backend/tests/estimate-design-extraction.test.ts:126-169`
- Modify: `backend/tests/estimate-design-extraction.test.ts:370-421`
- Modify: `backend/tests/estimate-design-extraction.test.ts:649-692`

**Interfaces:**
- Consumes: `mappingContextForEstimate` and `autoMapDrawingTitle` from Task 1; the prior worker proposal shape remains accepted.
- Produces: every extracted drawing and revision receives one identical `EstimateDesignMapping` snapshot; every new extracted drawing starts with `verified: false`, independently of mapping success.

- [ ] **Step 1: Add included estimate lines to the extraction fixture and write failing authority tests**

Add these persisted estimate lines to `setup()`:

```ts
lineItems: [
  {
    catalogueId: "CA01",
    roomName: "Bedroom 1",
    specification: "BWR ply + veneer + polish",
    unit: "lot",
    rate: 32_000,
    quantity: 1,
    included: true,
    amount: 32_000
  },
  {
    catalogueId: "CA01",
    roomName: "Bedroom 2",
    specification: "MDF + PU paint",
    unit: "lot",
    rate: 32_000,
    quantity: 1,
    included: true,
    amount: 32_000
  }
]
```

Use `Bedroom 1` and `Bedroom 2` as the two fixture room labels. Add:

```ts
it("maps from the canonical title and persisted included item, not worker scope", async () => {
  const { app, drawings, revisions } = setup();
  const leased = await claim(app);
  const body = completeBody();
  body.pages[0]!.sections = [{
    ...body.pages[0]!.sections[0]!,
    label: "TV UNIT - BEDROOM 1",
    proposal: {
      detectedTitle: "TV UNIT - BEDROOM 1",
      room: {
        id: "worker-room-that-does-not-exist",
        confidence: 0.99,
        evidence: ["worker guess"],
        ambiguous: false
      },
      scope: {
        id: "FC",
        confidence: 0.99,
        evidence: ["worker guess"],
        ambiguous: false
      }
    }
  }];

  const response = await complete(app, leased.body.data.claimToken, body);

  expect(response.status).toBe(200);
  expect(drawings[0]).toMatchObject({
    verified: false,
    roomId: "room-bedroom-1",
    catalogueId: "CA01",
    scopeSectionId: "CA",
    mappingStatus: "auto_mapped"
  });
  expect(revisions[0]).toMatchObject({
    roomId: "room-bedroom-1",
    catalogueId: "CA01",
    scopeSectionId: "CA",
    mappingStatus: "auto_mapped"
  });
});

it("completes extraction with a true-null Misc mapping when title mapping is ambiguous", async () => {
  const { app, jobs, drawings, revisions } = setup();
  const leased = await claim(app);
  const body = completeBody();
  body.pages[0]!.sections = [{
    ...body.pages[0]!.sections[0]!,
    label: "TV UNIT",
    proposal: {
      detectedTitle: "TV UNIT",
      room: { id: null, confidence: 0.2, evidence: [], ambiguous: true },
      scope: { id: null, confidence: 0.2, evidence: [], ambiguous: true }
    }
  }];

  const response = await complete(app, leased.body.data.claimToken, body);

  expect(response.status).toBe(200);
  expect(jobs[0]).toMatchObject({ status: "estimator_review" });
  expect(drawings[0]).toMatchObject({
    verified: false,
    roomId: null,
    catalogueId: null,
    scopeSectionId: null,
    mappingStatus: "misc"
  });
  expect(revisions[0]).toMatchObject({
    roomId: null,
    catalogueId: null,
    scopeSectionId: null,
    mappingStatus: "misc"
  });
});
```

Repeat the Misc case with `label` and `proposal.detectedTitle` equal to `Unidentified drawing — page 1`, zero OCR confidence, and null worker matches. Assert the backend still completes, stores the exact nonempty display/detected title for estimator correction, and persists the same all-null `mappingStatus: "misc"` tuple on drawing and revision. This is the bounded-extraction plan's no-title fallback and must never become a job failure.

- [ ] **Step 2: Run the extraction test and verify RED**

Run: `cd backend && npm test -- --run tests/estimate-design-extraction.test.ts`

Expected: FAIL because completion rejects the worker's unknown room, trusts worker scope, couples mapping confidence to `verified`, and stores revision misses as empty strings.

- [ ] **Step 3: Build and snapshot the mapping context before artifact work**

```ts
const taxonomy = taxonomyForEstimate(estimate);
const mappingContext = mappingContextForEstimate(estimate);
const normalized = await normalizeEstimateResult(
  result,
  input.maxUploadBytes
);
```

Keep `taxonomyForEstimate` for the prior claim response. Remove worker room/scope validation from `normalizeEstimateResult`; it must validate title, crop, image, and size only. Inside the completion transaction compare both `taxonomyForEstimate(currentEstimate)` and `mappingContextForEstimate(currentEstimate)` with their preflight snapshots so a concurrent estimate-line change produces the existing extraction-state conflict rather than stale mapping.

- [ ] **Step 4: Persist the resolver output on drawing and revision**

```ts
const { mapping } = autoMapDrawingTitle(
  section.proposal.detectedTitle,
  mappingContext
);
const drawingDocument = {
  _id: drawingId,
  uploadId: upload._id,
  sourcePageId: pageId,
  estimateId: upload.estimateId,
  active: true,
  verified: false,
  ...mapping,
  detectedTitle: section.proposal.detectedTitle,
  displayTitle: section.label,
  source: "ocr",
  roomConfidence: section.proposal.room.confidence,
  scopeConfidence: section.proposal.scope.confidence,
  ocrConfidence: section.confidence,
  roomEvidence: section.proposal.room.evidence.map((value) => ({ value })),
  scopeEvidence: section.proposal.scope.evidence.map((value) => ({ value }))
};
const revisionDocument = {
  _id: revisionId,
  drawingId,
  revisionNumber: 1,
  sourcePageId: pageId,
  crop: { ...section.crop },
  croppedFileReference: storedCrop.reference,
  ...mapping,
  label: section.label,
  reviewStatus: "draft",
  submittedAt: null,
  reviewerId: null,
  reviewedAt: null,
  changeSummary: null,
  annotationLayerId: null,
  replacesRevisionId: null
};
```

The worker's room/scope confidence and evidence remain diagnostic metadata only. A mapping `"misc"` result must proceed through the same persistence transaction and mark the job/upload `estimator_review`.

- [ ] **Step 5: Run extraction and resolver suites**

Run: `cd backend && npm test -- --run tests/estimate-design-mapping.test.ts tests/estimate-design-extraction.test.ts`

Expected: PASS; the invalid worker guess cannot override backend `CA`, ambiguous `TV UNIT` completes as Misc, and all newly extracted drawings remain unverified.

- [ ] **Step 6: Commit backend automatic mapping**

```bash
git add backend/src/services/estimate-design.service.ts backend/tests/estimate-design-extraction.test.ts
git commit -m "feat: auto-map extracted titles on the backend"
```

### Task 4: Add versioned exact-item assignment and backend-derived scope

**Files:**
- Modify: `backend/src/routes/estimate-designs.ts:20-30`
- Modify: `backend/src/routes/estimate-designs.ts:57-62`
- Modify: `backend/src/routes/estimate-designs.ts:174-192`
- Modify: `backend/src/services/estimate-design.service.ts:124-138`
- Modify: `backend/src/services/estimate-design.service.ts:167-207`
- Modify: `backend/src/services/estimate-design.service.ts:593-760`
- Modify: `backend/src/services/estimate-design.service.ts:1190-1420`
- Modify: `backend/src/services/estimate-design.service.ts:1421-1698`
- Modify: `backend/src/services/estimate-design.service.ts:2281-2460`
- Modify: `backend/tests/estimate-design-extraction.test.ts:694-793`
- Modify: `backend/tests/estimate-design-extraction.test.ts:1031-1078`

**Interfaces:**
- Consumes: pure `assignEstimateItem({ roomId, catalogueId }, context)` from Task 1.
- Produces:

```ts
export interface AssignEstimateItemInput {
  version: number;
  roomId: string;
  catalogueId: string;
}

export type ExactMappingChange = {
  roomId: string;
  catalogueId: string;
};

export type LegacyMappingChange = {
  roomId: string;
  scopeSectionId: string;
};

export type DeprecatedMappingChange =
  | ExactMappingChange
  | LegacyMappingChange;

export type CreateManualEstimateDrawingInput = {
  displayTitle: string;
  crop: CropRect;
} & DeprecatedMappingChange;

export interface EstimateDesignService {
  assignEstimateItem(
    user: AuthenticatedUser,
    drawingId: string,
    input: AssignEstimateItemInput
  ): Promise<Record<string, unknown>>;
}
```

- New HTTP contract: `PUT /api/v1/estimate-design-drawings/:drawingId/estimate-item` has strict body `{ version, roomId, catalogueId }`; this route rejects `scopeSectionId` and returns backend-derived scope.
- Existing correction/manual endpoints temporarily accept either new `{roomId, catalogueId}` fields or prior `{roomId, scopeSectionId}` fields. The representations are mutually exclusive. A legacy pair resolves only when one included candidate has that exact room and derived scope; zero/multiple candidates return `409 EXACT_ESTIMATE_ITEM_REQUIRED` with an allowlisted refresh/select-item message.

- [ ] **Step 1: Write failing assignment route tests**

```ts
it("atomically assigns an exact included estimate item and preserves verification", async () => {
  const { app, drawings, revisions } = setup();
  const leased = await claim(app);
  const body = completeBody();
  body.pages[0]!.sections[0] = {
    ...body.pages[0]!.sections[0]!,
    label: "TV UNIT",
    proposal: {
      detectedTitle: "TV UNIT",
      room: { id: null, confidence: 0.5, evidence: [], ambiguous: true },
      scope: { id: null, confidence: 0.5, evidence: [], ambiguous: true }
    }
  };
  await complete(app, leased.body.data.claimToken, body);
  const drawing = drawings.find((item) => item.detectedTitle === "TV UNIT")!;
  drawing.verified = true;

  const response = await owner(
    request(app).put(
      `/api/v1/estimate-design-drawings/${drawing._id}/estimate-item`
    )
  ).send({
    version: 1,
    roomId: "room-bedroom-1",
    catalogueId: "CA01"
  });

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({
    verified: true,
    roomId: "room-bedroom-1",
    catalogueId: "CA01",
    scopeSectionId: "CA",
    mappingStatus: "estimator_assigned",
    revision: {
      revisionNumber: 2,
      roomId: "room-bedroom-1",
      catalogueId: "CA01",
      scopeSectionId: "CA",
      mappingStatus: "estimator_assigned",
      reviewStatus: "draft"
    }
  });
  expect(revisions.filter((item) => item.drawingId === drawing._id))
    .toHaveLength(2);
});

it.each([
  {
    version: 1,
    roomId: "room-bedroom-1",
    catalogueId: "CA02"
  },
  {
    version: 1,
    roomId: "room-bedroom-1",
    catalogueId: "CA01",
    scopeSectionId: "FC"
  }
])("rejects an excluded item or client-authored scope", async (body) => {
  const { app, drawings } = setup();
  const leased = await claim(app);
  await complete(app, leased.body.data.claimToken);
  const before = structuredClone(drawings);
  const response = await owner(
    request(app).put(
      `/api/v1/estimate-design-drawings/${drawings[0]!._id}/estimate-item`
    )
  ).send(body);

  expect(response.status).toBe(400);
expect(drawings).toEqual(before);
});
```

Add staged-rollout tests using the currently deployed frontend payloads. A legacy room/scope correction and manual create with one included candidate must succeed and persist its real `catalogueId`; the same payload with two included catalogue items in that room/scope must return `409 EXACT_ESTIMATE_ITEM_REQUIRED`, make no write, and never select the first item by array order.

- [ ] **Step 2: Run assignment tests and verify RED**

Run: `cd backend && npm test -- --run tests/estimate-design-extraction.test.ts`

Expected: FAIL with route `404`; manual creation still expects `scopeSectionId`, and general edit still accepts browser-authored room/scope.

- [ ] **Step 3: Add strict route schemas and the assignment route**

```ts
const estimateItemAssignmentSchema = z.object({
  version: z.number().int().positive(),
  roomId: z.string().trim().min(1).max(128),
  catalogueId: z.string().trim().min(1).max(64)
}).strict();

const editDrawingBase = z.object({
  version: z.number().int().positive(),
  displayTitle: z.string().trim().min(1).max(500).optional(),
  crop: cropSchema.optional(),
  verified: z.boolean().optional()
});
const editDrawingSchema = z.union([
  editDrawingBase.extend({
    roomId: z.string().trim().min(1).max(128),
    catalogueId: z.string().trim().min(1).max(64)
  }).strict(),
  editDrawingBase.extend({
    roomId: z.string().trim().min(1).max(128),
    scopeSectionId: z.string().trim().min(1).max(64)
  }).strict(),
  editDrawingBase.strict()
]).refine(
  (value) => Object.keys(value).some((key) => key !== "version"),
  { message: "Provide at least one drawing change." }
);

router.put(
  "/estimate-design-drawings/:drawingId/estimate-item",
  protectedRoute,
  estimatorOnly,
  validateBody(estimateItemAssignmentSchema),
  async (request, response, next) => {
    try {
      response.json({
        data: await estimateDesigns.assignEstimateItem(
          request.authenticatedUser!,
          request.params.drawingId as string,
          request.body
        )
      });
    } catch (error) {
      next(error);
    }
  }
);
```

Change `createManualDrawingSchema` to the strict union of its shared manual fields plus either exact `{ roomId, catalogueId }` or deprecated `{ roomId, scopeSectionId }`. Because each arm is strict, a body containing both fields is rejected.

- [ ] **Step 4: Implement assignment as one guarded drawing/revision transaction**

Inside `EstimateDesignService.assignEstimateItem`, repeat the same ownership, editable-lifecycle, active-drawing, latest-version, upload/job state, and compare-and-swap guards used by `editDrawing`. Resolve only after loading the current estimate inside the transaction:

```ts
const mapping = resolveEstimateItemAssignment(
  {
    roomId: assignment.roomId,
    catalogueId: assignment.catalogueId
  },
  mappingContextForEstimate(currentEstimate)
);
const revision = {
  _id: randomUUID(),
  drawingId,
  revisionNumber: Number(currentRevision.revisionNumber) + 1,
  sourcePageId: currentRevision.sourcePageId,
  crop: { ...currentRevision.crop },
  croppedFileReference: currentRevision.croppedFileReference,
  ...mapping,
  label: String(currentDrawing.displayTitle),
  reviewStatus: "draft",
  submittedAt: null,
  reviewerId: null,
  reviewedAt: null,
  changeSummary: null,
  annotationLayerId: null,
  annotations: null,
  replacementUploadId: null,
  replacesRevisionId: currentRevision._id
};

await EstimateDesignRevisionModel.create([revision], { session });
const updated = await EstimateDesignDrawingModel.updateOne(
  {
    _id: drawingId,
    active: true,
    roomId: currentDrawing.roomId ?? null,
    scopeSectionId: currentDrawing.scopeSectionId ?? null,
    catalogueId: currentDrawing.catalogueId ?? null,
    mappingStatus: currentDrawing.mappingStatus ?? "misc",
    verified: Boolean(currentDrawing.verified)
  },
  { $set: mapping },
  { session, runValidators: true }
);
if (updated.matchedCount !== 1) staleDrawing();
```

Import the pure function as `assignEstimateItem as resolveEstimateItemAssignment` to keep the service method name clear. At the service boundary, translate `InvalidEstimateDesignAssignmentError` from the exact assignment/manual paths to registered `400 INVALID_ESTIMATE_DESIGN_ASSIGNMENT`; never let it become a generic 500. Do not include `verified` in `$set`; assignment preserves it. Audit `estimate_design_item_assigned` with old/new four-field mappings and the new revision number.

For compatibility only, add `assignLegacyRoomScope({ roomId, scopeSectionId }, context)`: filter included candidates by the exact room and backend-derived scope, require exactly one candidate, then call the same exact assignment resolver with that candidate's catalogue ID. Zero or multiple candidates map to registered `409 EXACT_ESTIMATE_ITEM_REQUIRED`, not a plain error. Use it in existing edit/manual service paths; do not expose it to automatic title mapping or the new endpoint. Mark the compatibility schema/helper for removal only after frontend rollout telemetry shows no legacy requests.

- [ ] **Step 5: Make manual creation use the same exact assignment resolver**

Resolve `{roomId, catalogueId}` against the current persisted estimate inside the manual-creation transaction. Store the returned `"estimator_assigned"` tuple on both drawing and revision. Keep `verified: true` for a crop the estimator explicitly creates, but do not infer verification from `mappingStatus`.

Update the manual route test request and assertions:

```ts
.send({
  displayTitle: "Bedroom 1 TV unit",
  roomId: "room-bedroom-1",
  catalogueId: "CA01",
  crop: { x: 10, y: 15, width: 30, height: 20 }
});

expect(response.body.data).toMatchObject({
  verified: true,
  roomId: "room-bedroom-1",
  catalogueId: "CA01",
  scopeSectionId: "CA",
  mappingStatus: "estimator_assigned"
});
```

- [ ] **Step 6: Make ordinary edits preserve mapping while retaining the deprecated backend union**

Represent mapping changes on the deprecated PATCH/manual service inputs as the mutually exclusive `DeprecatedMappingChange` union from the interface above; keep both route-schema arms until the documented telemetry gate. The dedicated assignment endpoint remains exact-only. A PATCH with neither mapping pair is an ordinary `{displayTitle, crop, verified}` edit and preserves mapping; the updated frontend stops sending mapping through this route. Every new correction or replacement revision snapshots:

```ts
roomId: currentDrawing.roomId ?? null,
scopeSectionId: currentDrawing.scopeSectionId ?? null,
catalogueId: currentDrawing.catalogueId ?? null,
mappingStatus: currentDrawing.mappingStatus ?? "misc"
```

Ordinary `{displayTitle, crop, verified}` edits must not remap from the edited display title. A deprecated mapping arm still goes through the exact or unique-legacy resolver and its typed public error mapping; it never writes browser-authored scope directly. Exact assignment remains the new frontend action through the dedicated endpoint.

Update both direct image replacement and queued PDF/HEIC replacement paths in the additional service ranges listed above. Snapshot the complete four-field tuple onto each replacement revision without `String(...)` coercion. Add mapped and true-null Misc tests for both paths, including the queued replacement completion, and assert no replacement turns `null` into `"null"` or changes mapping status.

- [ ] **Step 7: Run backend assignment and extraction tests**

Run: `cd backend && npm test -- --run tests/estimate-design-mapping.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts`

Expected: PASS; assignment derives `CA`, rejects excluded/cross-room items and `scopeSectionId`, creates one immutable revision, preserves verification, and manual drawing creation stores `"estimator_assigned"`.

- [ ] **Step 8: Commit exact-item assignment**

```bash
git add backend/src/routes/estimate-designs.ts backend/src/services/estimate-design.service.ts backend/tests/estimate-design-extraction.test.ts backend/tests/estimate-design-review.test.ts
git commit -m "feat: assign drawings to exact estimate items"
```

### Task 5: Keep verification required while allowing verified Misc submission

**Files:**
- Modify: `backend/src/services/estimate-design.service.ts:1421-1698`
- Modify: `backend/src/services/estimate-design.service.ts:1803-1992`
- Modify: `backend/src/services/estimate-design.service.ts:2730-2743`
- Modify: `backend/tests/estimate-design-extraction.test.ts:1080-1116`
- Modify: `backend/tests/estimate-design-review.test.ts:507-569`

**Interfaces:**
- Consumes: the true-null discriminated mapping tuple from Tasks 1-2.
- Produces: submission requires `drawing.verified === true` for every active drawing, including drawings whose revision is already approved, but accepts both mapped and `"misc"` tuples; client DTO mapping comes from the latest visible revision.

- [ ] **Step 1: Replace the old ambiguous-mapping submit test with separate verification and Misc assertions**

```ts
it("blocks an unverified Misc drawing but submits it after independent verification", async () => {
  const { app, drawings, revisions, jobs } = setup();
  const leased = await claim(app);
  const body = completeBody();
  body.pages[0]!.sections[0] = {
    ...body.pages[0]!.sections[0]!,
    label: "TV UNIT",
    proposal: {
      detectedTitle: "TV UNIT",
      room: { id: null, confidence: 0.5, evidence: [], ambiguous: true },
      scope: { id: null, confidence: 0.5, evidence: [], ambiguous: true }
    }
  };
  await complete(app, leased.body.data.claimToken, body);
  const misc = drawings.find((item) => item.detectedTitle === "TV UNIT")!;

  const blocked = await owner(
    request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
  ).send();
  expect(blocked.status).toBe(409);
  expect(blocked.body.error.code).toBe("ESTIMATE_DRAWINGS_UNVERIFIED");

  const verified = await owner(
    request(app).patch(`/api/v1/estimate-design-drawings/${misc._id}`)
  ).send({ version: 1, verified: true });
  expect(verified.status).toBe(200);
  expect(verified.body.data).toMatchObject({
    verified: true,
    roomId: null,
    catalogueId: null,
    scopeSectionId: null,
    mappingStatus: "misc"
  });

  for (const drawing of drawings) drawing.verified = true;
  const submitted = await owner(
    request(app).post("/api/v1/estimates/estimate-1/design-drawings/submit")
  ).send();
  expect(submitted.status).toBe(200);
  expect(jobs[0]).toMatchObject({ status: "submitted" });
  expect(revisions.filter((item) => item.drawingId === misc._id).at(-1))
    .toMatchObject({
      roomId: null,
      catalogueId: null,
      scopeSectionId: null,
      mappingStatus: "misc",
      reviewStatus: "submitted"
    });
});
```

- [ ] **Step 2: Add a failing client serialization test for submitted Misc**

```ts
it("exposes a submitted Misc drawing with true-null revision mapping", async () => {
  const { app, drawings, revisions } = setup();
  Object.assign(drawings[0]!, {
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc",
    verified: true
  });
  Object.assign(revisions[0]!, {
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc",
    reviewStatus: "submitted"
  });

  const response = await request(app)
    .get("/api/v1/client/estimates/estimate-1/design-drawings")
    .set("Authorization", auth("user-client-aurora", "client"));

  expect(response.status).toBe(200);
  expect(response.body.data.drawings[0]).toMatchObject({
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc",
    verified: true
  });
  expect(JSON.stringify(response.body.data.drawings[0])).not.toContain(':""');
});
```

- [ ] **Step 3: Run focused backend tests and verify RED**

Run: `cd backend && npm test -- --run tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts`

Expected: FAIL because `editDrawing` still forbids verifying a null mapping, revisions do not preserve the four-field tuple on verification, and client DTOs omit `catalogueId`/`mappingStatus`.

- [ ] **Step 4: Separate verification checks from mapping checks**

Delete the `if (verified && (!roomId || !scopeSectionId))` rejection from `editDrawing`. Call `assertEstimateDesignMapping` against the current four mapping fields, preserve them unchanged in the new revision and drawing, and continue requiring `verified` in `submitDrawings`.

Replace submission's room/scope catalogue check with:

```ts
assertEstimateDesignMapping({
  roomId: drawing.roomId ?? null,
  scopeSectionId: drawing.scopeSectionId ?? null,
  catalogueId: drawing.catalogueId ?? null,
  mappingStatus: drawing.mappingStatus ?? "misc"
});
if (!drawing.verified) {
  unverifiedDrawings();
}
if (!revision || revision.reviewStatus === "changes_requested") {
  unverifiedDrawings();
}
if (
  revision.reviewStatus !== "approved" &&
  revision.reviewStatus !== "draft"
) {
  unverifiedDrawings();
}
```

Do not add a `mappingStatus === "misc"` rejection. Keep the existing `ESTIMATE_DRAWINGS_UNVERIFIED` error and drawing-verification copy. Add an approved-revision fixture whose drawing is unverified (representing legacy/corrupt state) and assert submission is still rejected; approval never bypasses the independent drawing verification requirement.

- [ ] **Step 5: Serialize the latest visible revision mapping to clients**

```ts
function clientDrawingDto(
  drawing: Record<string, unknown>,
  revision: Record<string, unknown>,
  page: Record<string, unknown>
) {
  return {
    ...drawingDto(drawing),
    uploadId: String(page.uploadId),
    sourcePageId: String(revision.sourcePageId),
    verified: Boolean(drawing.verified),
    ...mappingDto(revision),
    displayTitle: String(revision.label)
  };
}
```

This keeps a hidden draft from changing the client's group and carries submitted Misc nulls without fabricated values.

- [ ] **Step 6: Run focused backend tests**

Run: `cd backend && npm test -- --run tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts`

Expected: PASS; unverified Misc is blocked, verified Misc submits, and the client receives the latest visible all-null `"misc"` snapshot.

- [ ] **Step 7: Commit nonblocking Misc submission**

```bash
git add backend/src/services/estimate-design.service.ts backend/tests/estimate-design-extraction.test.ts backend/tests/estimate-design-review.test.ts
git commit -m "feat: submit verified misc estimate drawings"
```

### Task 6: Add estimator Misc grouping and exact included-item selectors

**Files:**
- Modify: `frontend/src/features/leads/LeadEstimateWorkspace.tsx:33-45`
- Modify: `frontend/src/features/leads/LeadEstimateWorkspace.tsx:152-160`
- Modify: `frontend/src/features/leads/estimateDesignApi.ts:40-66`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.tsx:29-42`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.tsx:69-241`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.tsx:264-272`
- Modify: `frontend/src/features/leads/EstimateDrawingRow.tsx:7-104`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.test.tsx:8-62`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.test.tsx:178-217`
- Modify: `frontend/src/features/leads/EstimateDesignUploads.test.tsx:446-497`
- Modify: `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`
- Modify: `frontend/src/styles/index.css:55-59`

**Interfaces:**
- Consumes: persisted estimate rooms and included lines from `saved.data`; drawing/revision mapping fields from Task 2.
- Produces:

```ts
export interface EstimateDesignItemOption {
  roomId: string;
  catalogueId: string;
  label: string;
  scopeLabel: string;
}

interface EstimateDesignUploadsProps {
  estimateId: string;
  rooms: EstimateDesignPlacementOption[];
  scopes: EstimateDesignPlacementOption[];
  items: EstimateDesignItemOption[];
}

export const assignEstimateDrawingItem = (
  drawingId: string,
  input: {
    version: number;
    roomId: string;
    catalogueId: string;
  }
) => Promise<EstimateDesignDrawingUpdate>;

export const createManualEstimateDrawing = (
  estimateId: string,
  input: {
    displayTitle: string;
    roomId: string;
    catalogueId: string;
    crop: CropRect;
  }
) => Promise<EstimateDesignDrawingUpdate>;
```

- [ ] **Step 1: Write a failing estimator interaction test**

Extend fixture drawings/revisions with `catalogueId` and `mappingStatus`, then add:

```tsx
it("shows verified Misc, assigns an exact item without scope, and does not block submit", async () => {
  const miscDrawing = {
    ...drawings[0],
    id: "drawing-misc",
    displayTitle: "TV UNIT",
    verified: true,
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc" as const
  };
  const miscRevision = {
    ...revisions[0],
    id: "revision-misc",
    drawingId: "drawing-misc",
    label: "TV UNIT",
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc" as const
  };
  let assigned = false;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/estimate-design-drawings/drawing-misc/estimate-item")) {
      assigned = true;
      return response({
        ...miscDrawing,
        roomId: "room-bedroom",
        catalogueId: "CA01",
        scopeSectionId: "CA",
        mappingStatus: "estimator_assigned",
        revision: {
          ...miscRevision,
          revisionNumber: 2,
          roomId: "room-bedroom",
          catalogueId: "CA01",
          scopeSectionId: "CA",
          mappingStatus: "estimator_assigned"
        }
      });
    }
    if (url.endsWith("/estimates/estimate-1/design-drawings/submit")) {
      return response({ submittedCount: 1 });
    }
    if (url.endsWith("/estimates/estimate-1/design-uploads")) {
      return response({
        uploads: [{
          id: "upload-1",
          estimateId: "estimate-1",
          leadId: "lead-1",
          originalFilename: "plan.pdf",
          mimeType: "application/pdf",
          sizeBytes: 12,
          uploaderId: "user-1",
          uploadedAt: "2026-07-30T00:00:00.000Z",
          extractionStatus: "estimator_review",
          failureCode: null,
          failureMessage: null,
          canRetry: false
        }],
        pages: [page],
        drawings: assigned ? [{
          ...miscDrawing,
          roomId: "room-bedroom",
          catalogueId: "CA01",
          scopeSectionId: "CA",
          mappingStatus: "estimator_assigned"
        }] : [miscDrawing],
        revisions: assigned ? [{
          ...miscRevision,
          revisionNumber: 2,
          roomId: "room-bedroom",
          catalogueId: "CA01",
          scopeSectionId: "CA",
          mappingStatus: "estimator_assigned"
        }] : [miscRevision]
      });
    }
    if (url.includes("/estimate-design-revisions/")) {
      return new Response(new Blob(["image"], { type: "image/png" }));
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const user = userEvent.setup();
  renderWithQuery(
    <EstimateDesignUploads
      estimateId="estimate-1"
      rooms={rooms}
      scopes={[...scopes, { id: "CA", label: "Carpentry" }]}
      items={[{
        roomId: "room-bedroom",
        catalogueId: "CA01",
        label: "CA01 · TV unit",
        scopeLabel: "Carpentry"
      }]}
    />
  );

  const misc = await screen.findByRole("region", { name: "Misc drawings" });
  expect(within(misc)).toHaveTextContent(
    "No exact estimate item is assigned. You can still submit after verifying the drawing."
  );
  expect(screen.getByRole("button", {
    name: "Submit drawings to client"
  })).toBeEnabled();

  await user.click(within(misc).getByRole("button", {
    name: "More actions for TV UNIT"
  }));
  await user.click(screen.getByRole("menuitem", {
    name: "Assign estimate item"
  }));
  await user.selectOptions(screen.getByLabelText("Room"), "room-bedroom");
  await user.selectOptions(screen.getByLabelText("Exact estimate item"), "CA01");
  await user.click(screen.getByRole("button", { name: "Assign item" }));

  const put = await vi.waitFor(() => {
    const found = requests.find((entry) =>
      entry.url.endsWith(
        "/estimate-design-drawings/drawing-misc/estimate-item"
      )
    );
    expect(found).toBeDefined();
    return found!;
  });
  expect(JSON.parse(String(put.init?.body))).toEqual({
    version: 1,
    roomId: "room-bedroom",
    catalogueId: "CA01"
  });
  expect(JSON.parse(String(put.init?.body))).not.toHaveProperty("scopeSectionId");
  expect(await screen.findByRole("region", {
    name: "Bedroom, Carpentry drawings"
  })).toBeVisible();
});
```

Add a manual-create interaction to the same suite: select a room and exact included item, create the crop, and assert the POST body contains `{ displayTitle, roomId, catalogueId, crop }` with no `scopeSectionId`. Include two items in one room/scope so the test would fail if the UI still sends the deprecated ambiguous room/scope shape.

- [ ] **Step 2: Run the component test and verify RED**

Run: `cd frontend && npm test -- --run src/features/leads/EstimateDesignUploads.test.tsx`

Expected: FAIL because the component groups by verification/missing scope, has no `items` prop or assignment endpoint, and disables submit for Misc.

- [ ] **Step 3: Expose only persisted included-item options from the estimate workspace**

Build options from `saved.data`, not unsaved local builder state:

```tsx
const persistedRooms = (saved.data?.rooms ?? []) as RoomDraft[];
const designItemOptions = (saved.data?.lineItems ?? []).flatMap((line) => {
  if (!line.included) return [];
  const room = persistedRooms.find((item) => item.label === line.roomName);
  const section = estimateBuilderSections.find((candidate) =>
    candidate.rows.some((row) => row.id === line.catalogueId)
  );
  const row = section?.rows.find((candidate) =>
    candidate.id === line.catalogueId
  );
  if (!room || !section || !row) return [];
  return [{
    roomId: room.id,
    catalogueId: line.catalogueId,
    label: `${line.catalogueId} · ${row.description}`,
    scopeLabel: section.label
  }];
});
```

Pass `persistedRooms`, persisted enabled scopes, and `designItemOptions` to `EstimateDesignUploads`. This keeps the selectors aligned with the backend's persisted assignment context.

In `LeadEstimateWorkspace.test.tsx`, create unsaved local room/line edits that are absent from `saved.data`. Assert neither the assignment selector nor the manual-create selector exposes them until the mocked save response returns those persisted values. This proves both flows use the same backend-aligned option source.

- [ ] **Step 4: Add the exact-item API helper and mutation**

```ts
export const assignEstimateDrawingItem = (
  drawingId: string,
  input: {
    version: number;
    roomId: string;
    catalogueId: string;
  }
) => apiClient.put<EstimateDesignDrawingUpdate>(
  `/estimate-design-drawings/${encodeURIComponent(drawingId)}/estimate-item`,
  input
);
```

The mutation invalidates `estimateDesignKeys.workspace(estimateId)` on success and reports `"Estimate item assigned."` in the existing action notice.

Change `createManualEstimateDrawing` and its dialog to use the same room-filtered exact-item options and send `{ roomId, catalogueId }`; remove `scopeSectionId` from the new frontend payload. The backend retains its deprecated union only for old clients during the rollout window.

- [ ] **Step 5: Group mapping and verification independently**

```ts
const miscDrawings = activeDrawings.filter((drawing) =>
  drawing.mappingStatus === "misc"
);
const unverifiedDrawings = activeDrawings.filter((drawing) =>
  !drawing.verified
);
const grouped = useMemo(() => {
  const result = new Map<string, EstimateDesignDrawing[]>();
  activeDrawings
    .filter((drawing) =>
      drawing.mappingStatus !== "misc" &&
      drawing.roomId !== null &&
      drawing.scopeSectionId !== null &&
      drawing.catalogueId !== null
    )
    .forEach((drawing) => {
      const key = `${drawing.roomId}\u0000${drawing.scopeSectionId}`;
      result.set(key, [...(result.get(key) ?? []), drawing]);
    });
  return result;
}, [activeDrawings]);

const readyToSubmit =
  activeDrawings.length > 0 &&
  unverifiedDrawings.length === 0 &&
  workspace.data?.uploads.every((upload) =>
    upload.extractionStatus === "estimator_review" ||
    upload.extractionStatus === "approved"
  );
```

Render a region `aria-label="Misc drawings"` with heading `Misc` and exact warning `No exact estimate item is assigned. You can still submit after verifying the drawing.` Do not use `"misc"` in a room/scope key.

- [ ] **Step 6: Add an assignment dialog and make verification mapping-neutral**

`EstimateDrawingRow` receives `onAssignItem` and shows `Assign estimate item` for a draft Misc drawing or `Change estimate item` for a mapped draft drawing. The dialog filters item options by selected room and sends only the selected pair:

```tsx
function EstimateItemAssignmentDialog({
  selection,
  rooms,
  items,
  busy,
  error,
  onSubmit,
  onClose
}: AssignmentDialogProps) {
  const [roomId, setRoomId] = useState(selection.drawing.roomId ?? "");
  const roomItems = items.filter((item) => item.roomId === roomId);
  const [catalogueId, setCatalogueId] = useState(
    selection.drawing.catalogueId ?? ""
  );
  const selected = roomItems.find((item) =>
    item.catalogueId === catalogueId
  );

  return (
    <Dialog title={`Assign ${selection.drawing.displayTitle}`}
      eyebrow="Exact estimate item" onClose={onClose} busy={busy}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (roomId && selected) onSubmit({ roomId, catalogueId });
      }}>
        <label>Room<select value={roomId} onChange={(event) => {
          setRoomId(event.target.value);
          setCatalogueId("");
        }}>
          <option value="">Choose room</option>
          {rooms.map((room) => <option value={room.id} key={room.id}>
            {room.label}
          </option>)}
        </select></label>
        <label>Exact estimate item<select value={catalogueId}
          disabled={!roomId}
          onChange={(event) => setCatalogueId(event.target.value)}>
          <option value="">Choose included item</option>
          {roomItems.map((item) => <option value={item.catalogueId}
            key={`${item.roomId}:${item.catalogueId}`}>
            {item.label} · {item.scopeLabel}
          </option>)}
        </select></label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={!selected || busy}>Assign item</button>
      </form>
    </Dialog>
  );
}
```

Remove room/scope selectors from `CorrectionDialog`; it submits only `displayTitle`, `crop`, and `verified`. Rename checkbox copy to `Mark drawing verified`. It may be checked for a Misc drawing.

- [ ] **Step 7: Update footer and error copy**

Use:

```tsx
<span>
  {unverifiedDrawings.length
    ? `${unverifiedDrawings.length} drawing${
        unverifiedDrawings.length === 1 ? "" : "s"
      } still need visual verification.`
    : miscDrawings.length
      ? `${miscDrawings.length} verified Misc drawing${
          miscDrawings.length === 1 ? "" : "s"
        } can be submitted without assignment.`
      : "All drawings are verified and assigned."}
</span>
```

Submission failure copy remains verification-focused: `The drawings could not be submitted. Verify every active drawing and try again.` Add existing visual-language styles for `.estimate-design-uploads__misc` and the assignment form, including the current 640 px stacking behavior.

- [ ] **Step 8: Run estimator component tests and frontend typecheck**

Run: `cd frontend && npm test -- --run src/features/leads/EstimateDesignUploads.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx && npm run typecheck`

Expected: PASS; verified Misc leaves submit enabled, unverified mapped or Misc disables it, the request contains only version/room/item, and the refreshed drawing moves to Bedroom/Carpentry.

- [ ] **Step 9: Commit estimator mapping UI**

```bash
git add frontend/src/features/leads/LeadEstimateWorkspace.tsx frontend/src/features/leads/LeadEstimateWorkspace.test.tsx frontend/src/features/leads/estimateDesignApi.ts frontend/src/features/leads/EstimateDesignUploads.tsx frontend/src/features/leads/EstimateDrawingRow.tsx frontend/src/features/leads/EstimateDesignUploads.test.tsx frontend/src/styles/index.css
git commit -m "feat: add estimator misc item assignment"
```

### Task 7: Render submitted Misc drawings in the client review

**Files:**
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.tsx:38-122`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx:76-169`
- Modify: `frontend/src/features/estimates/ClientEstimateDrawings.test.tsx:240-342`
- Modify: `frontend/src/styles/index.css:117-118`

**Interfaces:**
- Consumes: latest visible drawing/revision mappings from Task 5.
- Produces a presentation-only discriminated group:

```ts
type ClientDrawingGroup =
  | {
      kind: "mapped";
      room: ClientEstimateDrawingOption;
      scope: ClientEstimateDrawingOption;
      drawings: EstimateDesignDrawing[];
    }
  | {
      kind: "misc";
      drawings: EstimateDesignDrawing[];
    };
```

- [ ] **Step 1: Add a failing client Misc display test**

Update drawing/revision fixtures with `catalogueId` and `mappingStatus`, then add:

```tsx
it("shows a submitted true-null mapping in a client Misc group", async () => {
  const miscDrawing = {
    ...drawing("drawing-misc", "Unassigned TV detail", "", ""),
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc" as const
  };
  const miscRevision = {
    ...revision(
      "revision-misc",
      "drawing-misc",
      "Unassigned TV detail",
      "",
      "",
      "submitted"
    ),
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc" as const
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const common = commonResponse(url);
    if (common) return common;
    if (url.endsWith("/api/v1/client/estimates")) {
      return json([estimate("estimate-a", "Aurora Villa")]);
    }
    if (url.endsWith(
      "/api/v1/client/estimates/estimate-a/design-drawings"
    )) {
      return json({
        uploads: [],
        pages: [page],
        drawings: [miscDrawing],
        revisions: [miscRevision],
        readiness: {
          ready: false,
          total: 1,
          approved: 0,
          awaitingReview: 1,
          changesRequested: 0
        }
      });
    }
    if (url.includes("/estimate-design-revisions/")) {
      return new Response(new Blob(["image"], { type: "image/png" }));
    }
    throw new Error(`Unhandled request: ${url}`);
  });

  const user = userEvent.setup();
  renderApp(["/client"]);
  const card = (await screen.findByRole("heading", {
    name: "Aurora Villa",
    level: 3
  })).closest("article")!;
  await user.click(within(card).getByRole("button", { name: /Aurora Villa/ }));

  const misc = await within(card).findByRole("region", {
    name: "Misc drawings"
  });
  expect(within(misc).getByRole("heading", {
    name: "Misc",
    level: 5
  })).toBeVisible();
  expect(within(misc)).toHaveTextContent(
    "This drawing was submitted without an estimate-item assignment."
  );
  expect(within(misc).getByRole("article", {
    name: "Unassigned TV detail drawing"
  })).toBeVisible();
  expect(within(misc).getByRole("button", {
    name: "Approve Unassigned TV detail"
  })).toBeEnabled();
});
```

- [ ] **Step 2: Run the client test and verify RED**

Run: `cd frontend && npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx`

Expected: FAIL because current grouping only iterates configured room/scope pairs and silently omits all-null mappings.

- [ ] **Step 3: Build mapped and Misc groups without sentinel keys**

```ts
const groups = useMemo<ClientDrawingGroup[]>(() => {
  const mapped = new Map<string, EstimateDesignDrawing[]>();
  const misc: EstimateDesignDrawing[] = [];
  for (const drawing of workspace?.drawings ?? []) {
    if (!drawing.active || !latest.has(drawing.id)) continue;
    if (
      drawing.mappingStatus === "misc" ||
      drawing.roomId === null ||
      drawing.scopeSectionId === null ||
      drawing.catalogueId === null
    ) {
      misc.push(drawing);
      continue;
    }
    const key = `${drawing.roomId}\u0000${drawing.scopeSectionId}`;
    mapped.set(key, [...(mapped.get(key) ?? []), drawing]);
  }
  const resolved: ClientDrawingGroup[] = rooms.flatMap((room) =>
    scopes.flatMap((scope) => {
      const drawings = mapped.get(`${room.id}\u0000${scope.id}`) ?? [];
      return drawings.length
        ? [{ kind: "mapped" as const, room, scope, drawings }]
        : [];
    })
  );
  return misc.length
    ? [...resolved, { kind: "misc" as const, drawings: misc }]
    : resolved;
}, [latest, rooms, scopes, workspace?.drawings]);
```

Render mapped groups with their existing accessible label. Render the Misc variant as:

```tsx
<section
  className="client-estimate-drawings__group client-estimate-drawings__group--misc"
  aria-label="Misc drawings"
>
  <h5>Misc</h5>
  <p>This drawing was submitted without an estimate-item assignment.</p>
  {group.drawings.map(renderDrawing)}
</section>
```

Pluralize the sentence when the group has more than one drawing. Reuse the same `ClientDrawingRow`, preview, annotation, approval, and change-request controls.

- [ ] **Step 4: Add focused Misc styles**

Use the existing warning palette from `.estimate-design-uploads__placement`; add border/background/text declarations only to `.client-estimate-drawings__group--misc`. Do not add a room/scope option, hidden ID, or client-side mapping mutation.

- [ ] **Step 5: Run client tests and frontend typecheck**

Run: `cd frontend && npm test -- --run src/features/estimates/ClientEstimateDrawings.test.tsx && npm run typecheck`

Expected: PASS; Misc is visible and reviewable, while mapped room/scope groups and approval readiness behavior remain unchanged.

- [ ] **Step 6: Commit client Misc display**

```bash
git add frontend/src/features/estimates/ClientEstimateDrawings.tsx frontend/src/features/estimates/ClientEstimateDrawings.test.tsx frontend/src/styles/index.css
git commit -m "feat: show misc drawings in client review"
```

### Task 8: Add the idempotent mapping migration, dry run, and operator documentation

**Files:**
- Create: `backend/src/migrations/estimate-design-mapping.ts`
- Create: `backend/tests/estimate-design-mapping-migration.test.ts`
- Create: `backend/tests/estimate-design-mapping-migration.replica-set.test.ts`
- Create: `backend/tests/helpers/mongo-replica-set.ts`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `README.md:80-103`
- Modify: `backend/README.md:24-43`
- Modify: `docs/estimate-design-image-review.md:58-78`

**Interfaces:**
- Consumes: `mappingContextForEstimate` and `autoMapDrawingTitle` from Task 1; `EstimateModel`, `EstimateDesignDrawingModel`, and `EstimateDesignRevisionModel`.
- Produces:

```ts
export interface EstimateDesignMappingMigrationConflict {
  recordKind: "drawing" | "revision";
  recordId: string;
  title: string;
  reason:
    | "ambiguous_title"
    | "ambiguous_legacy_room_scope"
    | "invalid_legacy_mapping"
    | "missing_estimate"
    | "estimate_changed"
    | "concurrent_change";
  candidateKeys: string[];
}

export interface EstimateDesignMappingMigrationReport {
  drawingsScanned: number;
  drawingsChanged: number;
  revisionsScanned: number;
  revisionsChanged: number;
  autoMapped: number;
  misc: number;
  sentinelValuesNormalized: number;
  conflictCount: number;
  conflicts: EstimateDesignMappingMigrationConflict[];
  conflictsTruncated: boolean;
  unresolvedCount: number;
  dryRun: boolean;
}

export async function migrateEstimateDesignMappings(
  options: { dryRun?: boolean; batchSize?: number } = {}
): Promise<EstimateDesignMappingMigrationReport>;

export async function runEstimateDesignMappingMigrationCommand(
  dependencies?: {
    argv?: string[];
    loadEnvironment?: () => { MONGODB_URI: string };
    connect?: (
      uri: string,
      options: { autoIndex: false }
    ) => Promise<unknown>;
    disconnect?: () => Promise<unknown>;
    writeOutput?: (output: string) => void;
  }
): Promise<void>;
```

- [ ] **Step 1: Write failing dry-run, sentinel, ambiguity, and rerun tests**

Install the real replica-set test dependency first:

Run: `cd backend && npm install --save-dev mongodb-memory-server@11.2.0`

Create the shared `MongoMemoryReplSet` helper and a real integration suite in the files listed above. Start one WiredTiger member with MongoDB test commands enabled so the later bounded-completion plan can use a real `failCommand` rollback test; expose start, clear, stop, and admin-database access helpers with cleanup in `afterAll`. Seed raw legacy drawing/revision BSON, run the write migration twice, and verify exact stored nulls/mapping tuples, immutable live revision updates, bounded migration-only revision repair, compare-and-swap behavior, and zero second-run changes.

```ts
describe("estimate design mapping migration", () => {
  it("normalizes sentinels, auto-maps unique titles, and reports ambiguity", async () => {
    mockEstimates([{
      _id: "estimate-1",
      rooms: [
        { id: "bed-1", label: "Bedroom 1", aliases: [] },
        { id: "bed-2", label: "Bedroom 2", aliases: [] }
      ],
      scopes: ["CA"],
      lineItems: [
        { catalogueId: "CA01", roomName: "Bedroom 1", included: true },
        { catalogueId: "CA01", roomName: "Bedroom 2", included: true }
      ]
    }]);
    mockDrawings([
      {
        _id: "drawing-unique",
        estimateId: "estimate-1",
        detectedTitle: "TV UNIT - BEDROOM 1",
        roomId: "",
        scopeSectionId: "null"
      },
      {
        _id: "drawing-ambiguous",
        estimateId: "estimate-1",
        detectedTitle: "TV UNIT",
        roomId: "undefined",
        scopeSectionId: ""
      }
    ]);
    mockRevisions([
      {
        _id: "revision-unique",
        drawingId: "drawing-unique",
        label: "TV UNIT - BEDROOM 1",
        roomId: "",
        scopeSectionId: ""
      },
      {
        _id: "revision-ambiguous",
        drawingId: "drawing-ambiguous",
        label: "TV UNIT",
        roomId: "null",
        scopeSectionId: "undefined"
      }
    ]);

    const report = await migrateEstimateDesignMappings({ dryRun: true });

    expect(report).toMatchObject({
      drawingsScanned: 2,
      drawingsChanged: 2,
      revisionsScanned: 2,
      revisionsChanged: 2,
      autoMapped: 2,
      misc: 2,
      dryRun: true,
      conflicts: [
        {
          recordKind: "drawing",
          recordId: "drawing-ambiguous",
          title: "TV UNIT",
          reason: "ambiguous_title",
          candidateKeys: ["bed-1\u0000CA01", "bed-2\u0000CA01"]
        },
        {
          recordKind: "revision",
          recordId: "revision-ambiguous",
          title: "TV UNIT",
          reason: "ambiguous_title",
          candidateKeys: ["bed-1\u0000CA01", "bed-2\u0000CA01"]
        }
      ]
    });
    expect(report.sentinelValuesNormalized).toBe(12);
    expect(EstimateDesignDrawingModel.collection.bulkWrite).not.toHaveBeenCalled();
    expect(EstimateDesignRevisionModel.collection.bulkWrite).not.toHaveBeenCalled();
  });

  it("writes only changed records in bounded batches and is safe to rerun", async () => {
    const state = setupMutableMigrationState();

    const first = await migrateEstimateDesignMappings({
      dryRun: false,
      batchSize: 1
    });
    expect(first.drawingsChanged).toBe(2);
    expect(EstimateDesignDrawingModel.collection.bulkWrite).toHaveBeenCalledTimes(2);
    expect(EstimateDesignRevisionModel.collection.bulkWrite).toHaveBeenCalledTimes(2);

    state.returnMigratedDocuments();
    vi.mocked(EstimateDesignDrawingModel.collection.bulkWrite).mockClear();
    vi.mocked(EstimateDesignRevisionModel.collection.bulkWrite).mockClear();
    const second = await migrateEstimateDesignMappings({
      dryRun: false,
      batchSize: 1
    });
    expect(second.drawingsChanged).toBe(0);
    expect(second.revisionsChanged).toBe(0);
    expect(EstimateDesignDrawingModel.collection.bulkWrite).not.toHaveBeenCalled();
    expect(EstimateDesignRevisionModel.collection.bulkWrite).not.toHaveBeenCalled();
  });

  it("preserves a coherent legacy manual mapping before considering its title", async () => {
    mockDrawings([{
      _id: "drawing-manual",
      estimateId: "estimate-1",
      source: "manual",
      detectedTitle: "Arbitrary site note",
      roomId: "bed-1",
      scopeSectionId: "CA",
      catalogueId: "CA01",
      mappingStatus: undefined
    }]);
    const report = await migrateEstimateDesignMappings({ dryRun: false });
    expect(lastDrawingSet()).toMatchObject({
      roomId: "bed-1",
      scopeSectionId: "CA",
      catalogueId: "CA01",
      mappingStatus: "estimator_assigned"
    });
    expect(report.misc).toBe(0);
  });

  it("streams records and never buffers more than one configured batch", async () => {
    const tracker = setupCursorMigrationState({ records: 1_205 });
    await migrateEstimateDesignMappings({ dryRun: false, batchSize: 100 });
    expect(tracker.maximumBufferedRecords()).toBeLessThanOrEqual(100);
    expect(tracker.contextCacheSizeAfterEachFlush()).toEqual(
      expect.arrayContaining([expect.any(Number)])
    );
    expect(Math.max(...tracker.contextCacheSizeAfterEachFlush()))
      .toBeLessThanOrEqual(100);
  });
});
```

`autoMapped`, `misc`, `conflictCount`, and `unresolvedCount` count drawing and revision records together; the separate scanned/changed fields retain the per-kind breakdown. `setupMutableMigrationState` in the unit test owns literal estimate/drawing/revision arrays and applies `$set` from mocked raw-collection `bulkWrite` calls to those arrays; `returnMigratedDocuments()` changes subsequent mocked finds to the mutated arrays. This proves second-run planning behavior, while the replica-set suite proves actual BSON writes and Mongoose immutability behavior.

Add an all-present legacy tuple whose `{roomId, catalogueId}` is not included and assert it becomes true-null Misc with `invalid_legacy_mapping`. Add a scan/flush race that performs an exact estimator assignment after planning; assert the migration compare-and-swap does not overwrite it and reports `concurrent_change`. Add an estimate-context race that changes persisted rooms/line items or `updatedAt` before flush; assert writes planned from that stale context are skipped and reported as `estimate_changed`.

- [ ] **Step 2: Run the migration test and verify RED**

Run: `cd backend && npm test -- --run tests/estimate-design-mapping-migration.test.ts`

Expected: FAIL with `Cannot find module '../src/migrations/estimate-design-mapping.js'`.

- [ ] **Step 3: Implement legacy normalization, planning, and conflict reporting**

```ts
const legacyNullSentinels = new Set(["", "null", "undefined"]);

function normalizeLegacyMappingIdentifier(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return legacyNullSentinels.has(trimmed.toLowerCase()) ? null : trimmed;
}

function unresolvedLegacyMapping(
  title: string,
  reason:
    | "ambiguous_legacy_room_scope"
    | "invalid_legacy_mapping",
  candidateKeys: string[] = []
) {
  return {
    mapping: {
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc" as const
    },
    conflict: { title, reason, candidateKeys }
  };
}

function mappingForLegacyRecord(
  record: Record<string, unknown>,
  title: string,
  context: EstimateMappingContext
) {
  const roomId = normalizeLegacyMappingIdentifier(record.roomId);
  const scopeSectionId =
    normalizeLegacyMappingIdentifier(record.scopeSectionId);
  const catalogueId =
    normalizeLegacyMappingIdentifier(record.catalogueId);

  if (roomId && scopeSectionId && catalogueId) {
    const included = context.candidates.find((candidate) =>
      candidate.roomId === roomId &&
      candidate.catalogueId === catalogueId &&
      candidate.scopeSectionId === scopeSectionId
    );
    if (included) {
      return {
        mapping: {
          roomId,
          scopeSectionId,
          catalogueId,
          mappingStatus: record.mappingStatus === "auto_mapped"
            ? "auto_mapped"
            : "estimator_assigned"
        },
        conflict: null
      };
    }
    return unresolvedLegacyMapping(title, "invalid_legacy_mapping");
  }

  if (roomId && scopeSectionId && !catalogueId) {
    const candidates = context.candidates.filter((candidate) =>
      candidate.roomId === roomId &&
      candidate.scopeSectionId === scopeSectionId
    );
    if (candidates.length === 1) {
      return {
        mapping: assignEstimateItem({
          roomId,
          catalogueId: candidates[0]!.catalogueId
        }, context),
        conflict: null
      };
    }
    return unresolvedLegacyMapping(
      title,
      "ambiguous_legacy_room_scope",
      candidates
        .map((candidate) =>
          `${candidate.roomId}\u0000${candidate.catalogueId}`
        )
        .sort()
    );
  }

  if (roomId || scopeSectionId || catalogueId) {
    return unresolvedLegacyMapping(title, "invalid_legacy_mapping");
  }

  const resolution = autoMapDrawingTitle(title, context);
  return {
    mapping: resolution.mapping,
    conflict: resolution.reason === "ambiguous"
      ? {
          title,
          reason: "ambiguous_title" as const,
          candidateKeys: [...resolution.candidateKeys]
        }
      : null
  };
}
```

The helper returns a conflict reason and all-null Misc for invalid/ambiguous legacy tuples. A fully coherent all-present legacy tuple is preserved before title matching only when its exact room/catalogue/scope candidate is currently included, including for immutable historical revisions; an absent `mappingStatus` becomes `estimator_assigned` unless it was explicitly `auto_mapped`. A legacy room/scope pair with missing catalogue is preserved only when exactly one currently included candidate fits. Only an all-null legacy tuple uses title auto-mapping. Missing contexts and absent title matches increment/report unresolved counts instead of silently disappearing from the report.

Scan drawings with a sorted Mongoose cursor in `batchSize` chunks. For each chunk fetch only its distinct estimates, retain each estimate's exact `updatedAt` context version, build contexts, plan/write the chunk, then clear both records and contexts. Immediately before flush, reread those estimate versions; skip and report `estimate_changed` for every planned record whose context changed. Scan revisions in separate chunks; fetch only that chunk's parent drawings and estimates, and use each revision's own mapping snapshot/title. Never load all distinct estimate IDs, all documents, or all writes into memory.

Count each legacy room/scope/catalogue value that is missing or one of the three string sentinels and becomes null. Compare all four target fields before creating an `updateOne`; do not rewrite unchanged migrated records. Each write filter contains `_id` plus the exact original value **and field-existence state** for all four mapping fields. A concurrent mapping change therefore cannot be overwritten.

- [ ] **Step 4: Apply bounded writes and add the CLI**

```ts
async function flushMigrationBatch(
  collection: Collection,
  writes: PlannedMappingWrite[],
  dryRun: boolean
) {
  if (dryRun || writes.length === 0) return;
  for (const write of writes) {
    assertEstimateDesignMapping(write.target);
  }
  await collection.bulkWrite(writes.map((write) => ({
    updateOne: {
      filter: {
        _id: write.id,
        ...exactOriginalMappingFilter(write.original)
      },
      update: { $set: write.target }
    }
  })), {
    ordered: false
  });
  await verifyWrittenTargetsOrReportConcurrentChanges(collection, writes);
}
```

Use `EstimateDesignDrawingModel.collection` and `EstimateDesignRevisionModel.collection` only inside this migration module. This explicit raw-collection path is what permits validated legacy revision repair while live Mongoose revision paths remain immutable. After each bulk call, reread the attempted IDs; any document that does not contain the target tuple is a `concurrent_change` conflict and is not counted as changed. Flush once per cursor chunk and discard the array immediately. Cap retained conflict details at 1,000 while continuing exact `conflictCount`/`unresolvedCount` totals; set `conflictsTruncated` when later details are omitted. Validate `batchSize` as an integer from 1 through 1,000 and default it to 500. Skip raw `bulkWrite` entirely for `dryRun`. The command connects with `{ autoIndex: false }`, runs the migration, prints exactly one JSON report line, and disconnects in `finally`:

```ts
writeOutput(`${JSON.stringify(report)}\n`);
```

Add:

```json
"migrate:estimate-design-mapping": "tsx src/migrations/estimate-design-mapping.ts"
```

- [ ] **Step 5: Document backup, dry run, execution, and interpretation**

Add an `Estimate design mapping migration` section to the root README and backend README with these exact commands:

```bash
mongodump --uri="$MONGODB_URI" --archive="lisno-before-estimate-design-mapping.archive.gz" --gzip
cd backend
npm run migrate:estimate-design-mapping -- --dry-run
npm run migrate:estimate-design-mapping
npm run migrate:estimate-design-mapping -- --dry-run
```

Document that operators must verify the archive exists and is restorable before the write run, review every `conflicts` entry, expect the final dry run to report `drawingsChanged: 0` and `revisionsChanged: 0`, and must not run `npm run seed`. Update `docs/estimate-design-image-review.md` to state:

- backend exact-title aliases and included lines are authoritative;
- `TV UNIT - BEDROOM 1` maps to Bedroom 1 / `CA01` / Carpentry when that pair is included;
- `TV UNIT` remains Misc when `CA01` is included in multiple rooms;
- assigning an item is optional for submission, but verifying every active drawing is required;
- clients see submitted unresolved drawings under Misc.

- [ ] **Step 6: Run unit and real replica-set migration tests**

Run: `cd backend && npm test -- --run tests/estimate-design-mapping-migration.test.ts tests/estimate-design-mapping-migration.replica-set.test.ts && npm run typecheck`

Expected: tests and typecheck PASS; the dependency-injected command test prints one JSON object with `"dryRun":true`, count fields, and a `conflicts` array without writes; the real replica-set suite proves write, immutability, CAS, context-version, and rerun behavior without requiring an externally running `rs0`.

- [ ] **Step 7: Commit migration and runbook**

```bash
git add backend/src/migrations/estimate-design-mapping.ts backend/tests/estimate-design-mapping-migration.test.ts backend/tests/estimate-design-mapping-migration.replica-set.test.ts backend/tests/helpers/mongo-replica-set.ts backend/package.json backend/package-lock.json README.md backend/README.md docs/estimate-design-image-review.md
git commit -m "feat: migrate legacy estimate drawing mappings"
```

### Task 9: Verify the complete estimator-to-client mapping journey

**Files:**
- Modify: `frontend/src/features/estimates/estimateDrawingJourney.test.tsx`
- Modify: `backend/tests/full-journey.test.ts`
- Test: all mapping-focused backend and frontend files from Tasks 1-8

**Interfaces:**
- Consumes: automatic mapping, exact assignment, independent verification, nonblocking Misc submission, and client Misc display.
- Produces: one automated journey proving no layer reintroduces a fake identifier or mapping-based submit block.

- [ ] **Step 1: Add mapping fields to every journey fixture**

For mapped fixtures use:

```ts
catalogueId: "FC01",
mappingStatus: "auto_mapped" as const
```

For the journey's unresolved fixture use:

```ts
roomId: null,
scopeSectionId: null,
catalogueId: null,
mappingStatus: "misc" as const,
verified: true
```

Apply the same four-field snapshot to each corresponding revision. Do not use empty strings in test data.

- [ ] **Step 2: Extend the backend full journey with verified Misc submission**

After extraction, set one persisted drawing/revision to the true-null `"misc"` tuple, verify it through the public PATCH endpoint, submit drawings, and assert the client workspace:

```ts
expect(submitted.status).toBe(200);
const clientWorkspace = await request(app)
  .get(`/api/v1/client/estimates/${estimateId}/design-drawings`)
  .set("Authorization", clientToken);
expect(clientWorkspace.status).toBe(200);
expect(clientWorkspace.body.data.drawings).toContainEqual(
  expect.objectContaining({
    verified: true,
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc"
  })
);
```

Retain the journey's existing assertion that submission before `verified: true` returns `ESTIMATE_DRAWINGS_UNVERIFIED`.

- [ ] **Step 3: Extend the React journey through estimator and client views**

In the estimator phase, return one verified Misc drawing and assert submission is enabled before assignment:

```tsx
const miscGroup = await screen.findByRole("region", {
  name: "Misc drawings"
});
expect(within(miscGroup).getByText("TV UNIT")).toBeVisible();
expect(screen.getByRole("button", {
  name: "Submit drawings to client"
})).toBeEnabled();
await user.click(screen.getByRole("button", {
  name: "Submit drawings to client"
}));
expect(replacementSubmitted).toBe(true);
```

In the subsequent client phase, return that submitted drawing unchanged and assert:

```tsx
const clientMisc = await within(card).findByRole("region", {
  name: "Misc drawings"
});
expect(within(clientMisc).getByRole("article", {
  name: "TV UNIT drawing"
})).toBeVisible();
expect(within(clientMisc).getByRole("button", {
  name: "Approve TV UNIT"
})).toBeEnabled();
```

Keep the existing annotation, replacement, history, approval-readiness, and final-estimate assertions intact.

- [ ] **Step 4: Run the focused journey tests and verify GREEN**

Run: `cd backend && npm test -- --run tests/full-journey.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts && cd ../frontend && npm test -- --run src/features/estimates/estimateDrawingJourney.test.tsx src/features/leads/EstimateDesignUploads.test.tsx src/features/estimates/ClientEstimateDrawings.test.tsx`

Expected: PASS; the estimator can submit a verified all-null Misc drawing, the client sees and can review it under Misc, and an unverified drawing remains blocked.

- [ ] **Step 5: Commit journey coverage**

```bash
git add backend/tests/full-journey.test.ts frontend/src/features/estimates/estimateDrawingJourney.test.tsx
git commit -m "test: cover misc estimate drawing journey"
```

- [ ] **Step 6: Run the full release verification**

Run:

```bash
cd backend
npm test
npm run typecheck
npm run build
npm test -- --run tests/estimate-design-mapping-migration.replica-set.test.ts
cd ../frontend
npm test
npm run typecheck
VITE_API_URL=/api/v1 npm run build
cd ../ocr-worker
.venv/bin/python -m pytest -q
cd ..
git diff --check
```

Expected: all backend, frontend, and worker tests PASS; both production builds PASS; the real migration suite passes against its managed replica set and includes a no-write dry run; `git diff --check` prints no output.

- [ ] **Step 7: Perform responsive journey verification**

Run the backend/frontend locally, open the estimator estimate workspace at desktop width and 320 px, and verify:

1. Misc uses a real heading and warning without a blank/fake room or scope.
2. Room selection filters the exact included-item selector.
3. Assignment refreshes the row into its backend-derived room/scope group.
4. A verified unassigned Misc drawing leaves `Submit drawings to client` enabled.
5. An unverified mapped or Misc drawing disables submission.
6. The client portal shows submitted unassigned drawings under Misc with working preview, approve, and request-changes controls.

Expected: no horizontal overflow, clipped selector labels, duplicate Misc groups, fabricated identifiers, or regression in drawing preview/review controls.
