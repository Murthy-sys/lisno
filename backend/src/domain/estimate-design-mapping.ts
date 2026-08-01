import { estimatePdfCatalogue } from "./estimate-pdf-catalogue.js";

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
  rooms: readonly { roomId: string; terms: readonly string[] }[];
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

function candidateKey(candidate: Pick<EstimateMappingCandidate, "roomId" | "catalogueId">) {
  return `${candidate.roomId}\u0000${candidate.catalogueId}`;
}

function miscMapping(): MiscEstimateDesignMapping {
  return { roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc" };
}

export function mappingContextForEstimate(
  estimate: { rooms?: unknown; scopes?: unknown; lineItems?: unknown }
): EstimateMappingContext {
  const rooms = (Array.isArray(estimate.rooms) ? estimate.rooms : []).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const room = value as Record<string, unknown>;
    const id = typeof room.id === "string" ? room.id.trim() : "";
    const label = typeof room.label === "string" ? room.label.trim() : "";
    if (!id || !label) return [];
    const aliases = Array.isArray(room.aliases)
      ? room.aliases.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    return [{ id, terms: roomTermsFor(label, aliases) }];
  });
  const enabledScopes = new Set(
    (Array.isArray(estimate.scopes) ? estimate.scopes : [])
      .filter((value): value is string => typeof value === "string")
  );
  const candidates = new Map<string, EstimateMappingCandidate>();
  const invalidIncludedItems: Array<EstimateMappingContext["invalidIncludedItems"][number]> = [];

  for (const value of Array.isArray(estimate.lineItems) ? estimate.lineItems : []) {
    if (!value || typeof value !== "object") continue;
    const line = value as Record<string, unknown>;
    if (line.included !== true) continue;
    const catalogueId = typeof line.catalogueId === "string" ? line.catalogueId.trim() : "";
    const roomName = typeof line.roomName === "string" ? line.roomName.trim() : "";
    const entry = estimatePdfCatalogue.get(catalogueId);
    if (!entry) {
      invalidIncludedItems.push({ roomName, catalogueId, reason: "unknown_catalogue" });
      continue;
    }
    const roomMatches = rooms.filter((room) => room.terms.includes(normalizeMappingTerm(roomName)));
    if (roomMatches.length !== 1) {
      invalidIncludedItems.push({ roomName, catalogueId, reason: "unknown_room" });
      continue;
    }
    if (!enabledScopes.has(entry.sectionId)) {
      invalidIncludedItems.push({ roomName, catalogueId, reason: "disabled_scope" });
      continue;
    }
    const room = roomMatches[0]!;
    const candidate: EstimateMappingCandidate = {
      roomId: room.id,
      roomTerms: room.terms,
      catalogueId,
      itemTerms: itemTermsFor(entry.description, itemAliases[catalogueId] ?? []),
      scopeSectionId: entry.sectionId
    };
    candidates.set(candidateKey(candidate), candidate);
  }

  return {
    rooms: rooms.map((room) => ({ roomId: room.id, terms: room.terms })),
    candidates: [...candidates.values()].sort((left, right) => candidateKey(left).localeCompare(candidateKey(right))),
    invalidIncludedItems
  };
}

export function autoMapDrawingTitle(title: string, context: EstimateMappingContext): AutoMappingResolution {
  const normalized = normalizeMappingTerm(title);
  const itemMatches = context.candidates.filter((candidate) =>
    candidate.itemTerms.some((term) => containsTerm(normalized, term))
  );
  const mentionedRooms = new Set(
    context.rooms.filter((room) => room.terms.some((term) => containsTerm(normalized, term))).map((room) => room.roomId)
  );
  const matches = itemMatches.filter((candidate) => mentionedRooms.size === 0 || mentionedRooms.has(candidate.roomId));
  const candidateKeys = matches.map(candidateKey).sort();
  if (matches.length !== 1) {
    return { mapping: miscMapping(), reason: matches.length === 0 ? "absent" : "ambiguous", candidateKeys };
  }
  const [match] = matches;
  return {
    mapping: { roomId: match.roomId, catalogueId: match.catalogueId, scopeSectionId: match.scopeSectionId, mappingStatus: "auto_mapped" },
    reason: "unique",
    candidateKeys
  };
}

export function assignEstimateItem(
  assignment: { roomId: string; catalogueId: string },
  context: EstimateMappingContext
): EstimatorAssignedMapping {
  const candidate = context.candidates.find((item) => item.roomId === assignment.roomId && item.catalogueId === assignment.catalogueId);
  if (!candidate) {
    throw new InvalidEstimateDesignAssignmentError("The selected estimate item is not included for this room.");
  }
  return { roomId: candidate.roomId, catalogueId: candidate.catalogueId, scopeSectionId: candidate.scopeSectionId, mappingStatus: "estimator_assigned" };
}

export function assertEstimateDesignMapping(mapping: Record<string, unknown>): asserts mapping is EstimateDesignMapping {
  const status = mapping.mappingStatus;
  const roomId = mapping.roomId;
  const scopeSectionId = mapping.scopeSectionId;
  const catalogueId = mapping.catalogueId;
  const isMisc = status === "misc" && roomId === null && scopeSectionId === null && catalogueId === null;
  const isMapped = (status === "auto_mapped" || status === "estimator_assigned") &&
    [roomId, scopeSectionId, catalogueId].every((value) => typeof value === "string" && value.trim().length > 0);
  if (!isMisc && !isMapped) {
    throw new TypeError("Estimate design mapping must have either all-null Misc fields or all-present mapped fields.");
  }
}
