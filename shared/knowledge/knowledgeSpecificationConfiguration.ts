import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue
} from "./knowledgeTypes";

export const KNOWLEDGE_MAX_SPECIFICATIONS = 50;
export const KNOWLEDGE_MAX_BRANDS = 200;

export interface KnowledgeSpecificationConfiguration {
  readonly id: string;
  readonly name: string;
  readonly brandId: string | null;
  readonly description: string | null;
  /** Compatibility-only data from the former typed Specification contract. */
  readonly hiddenTypedFields: KnowledgeJsonObject | null;
}

export interface KnowledgeSpecificationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ParsedKnowledgeSpecifications {
  readonly specifications: readonly KnowledgeSpecificationConfiguration[];
  readonly issues: readonly KnowledgeSpecificationIssue[];
}

export function validateKnowledgeBrands(
  value: KnowledgeJsonValue | undefined
): readonly KnowledgeSpecificationIssue[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [{ path: "brands", message: "Brands must be a list." }];
  }

  const issues: KnowledgeSpecificationIssue[] = [];
  if (value.length > KNOWLEDGE_MAX_BRANDS) {
    issues.push({
      path: "brands",
      message: `Brands cannot contain more than ${KNOWLEDGE_MAX_BRANDS} entries.`
    });
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  value.forEach((entry, index) => {
    const path = `brands.${index}`;
    if (!isObject(entry)) {
      issues.push({ path, message: "Brand must be an object." });
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!["id", "name", "description"].includes(key)) {
        issues.push({ path: `${path}.${key}`, message: "Unknown Brand property." });
      }
    }

    const id = stringValue(entry.id);
    if (!id.trim()) {
      issues.push({ path: `${path}.id`, message: "Brand ID is required." });
    } else if (id !== id.trim() || id.length > MAX_SHORT_TEXT) {
      issues.push({ path: `${path}.id`, message: "Brand ID must be a bounded stable ID." });
    } else if (ids.has(id)) {
      issues.push({ path: `${path}.id`, message: "Brand IDs must be unique." });
    }
    if (id) ids.add(id);

    const name = typeof entry.name === "string" ? entry.name : "";
    const normalizedName = normalizeComparable(name);
    if (!normalizedName) {
      issues.push({ path: `${path}.name`, message: "Brand name is required." });
    } else if (name.length > MAX_SHORT_TEXT) {
      issues.push({ path: `${path}.name`, message: `Brand name must be ${MAX_SHORT_TEXT} characters or fewer.` });
    } else if (names.has(normalizedName)) {
      issues.push({ path: `${path}.name`, message: "Brand names must be unique." });
    }
    if (normalizedName) names.add(normalizedName);

    if (
      Object.hasOwn(entry, "description")
      && entry.description !== null
      && (typeof entry.description !== "string" || !entry.description.trim() || entry.description.length > MAX_TEXT)
    ) {
      issues.push({ path: `${path}.description`, message: `Description must be nonempty and ${MAX_TEXT} characters or fewer.` });
    }
  });
  return issues;
}

const MAX_SHORT_TEXT = 240;
const MAX_TEXT = 4_000;
const TYPED_COMPATIBILITY_KEYS = ["type", "options", "value"] as const;
let fallbackIdCounter = 0;

export function parseKnowledgeSpecifications(
  value: KnowledgeJsonValue | undefined,
  brands?: KnowledgeJsonValue
): ParsedKnowledgeSpecifications {
  if (value === undefined) return { specifications: [], issues: [] };
  if (!Array.isArray(value)) {
    return {
      specifications: [],
      issues: [{ path: "specifications", message: "Specifications must be a list." }]
    };
  }

  const specifications: KnowledgeSpecificationConfiguration[] = [];
  const issues: KnowledgeSpecificationIssue[] = [];
  value.forEach((entry, index) => {
    const path = `specifications.${index}`;
    if (!isObject(entry)) {
      issues.push({ path, message: "Specification must be an object." });
      return;
    }

    const hasTypedCompatibility = TYPED_COMPATIBILITY_KEYS.some((key) =>
      Object.hasOwn(entry, key)
    );
    const allowedKeys = hasTypedCompatibility
      ? ["id", "name", "brandId", "description", ...TYPED_COMPATIBILITY_KEYS]
      : ["id", "name", "brandId", "description"];
    for (const key of Object.keys(entry)) {
      if (!allowedKeys.includes(key)) {
        issues.push({ path: `${path}.${key}`, message: "Unknown Specification property." });
      }
    }

    const hiddenTypedFields: Record<string, KnowledgeJsonValue> = {};
    if (hasTypedCompatibility) {
      for (const key of TYPED_COMPATIBILITY_KEYS) {
        if (Object.hasOwn(entry, key)) hiddenTypedFields[key] = entry[key]!;
      }
    }

    specifications.push({
      id: stringValue(entry.id),
      name: typeof entry.name === "string" ? entry.name : "",
      brandId: Object.hasOwn(entry, "brandId")
        ? typeof entry.brandId === "string"
          ? entry.brandId
          : ""
        : null,
      description: entry.description === null
        ? null
        : typeof entry.description === "string"
          ? entry.description
          : "",
      hiddenTypedFields: hasTypedCompatibility ? hiddenTypedFields : null
    });
  });

  return {
    specifications,
    issues: [...issues, ...validateKnowledgeSpecifications(specifications, brands)]
  };
}

export function validateKnowledgeSpecifications(
  specifications: readonly KnowledgeSpecificationConfiguration[],
  brands?: KnowledgeJsonValue
): readonly KnowledgeSpecificationIssue[] {
  const issues: KnowledgeSpecificationIssue[] = [];
  if (specifications.length > KNOWLEDGE_MAX_SPECIFICATIONS) {
    issues.push({
      path: "specifications",
      message: `A Main Line can contain at most ${KNOWLEDGE_MAX_SPECIFICATIONS} Specifications.`
    });
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  const brandIdCounts = brands === undefined
    ? null
    : new Map<string, number>();
  if (brandIdCounts && Array.isArray(brands)) {
    for (const brand of brands) {
      if (!isObject(brand) || typeof brand.id !== "string") continue;
      brandIdCounts.set(brand.id, (brandIdCounts.get(brand.id) ?? 0) + 1);
    }
  }
  specifications.forEach((specification, index) => {
    const path = `specifications.${index}`;
    validateStableId(specification.id, `${path}.id`, issues);
    if (ids.has(specification.id)) {
      issues.push({ path: `${path}.id`, message: "Specification IDs must be unique." });
    }
    ids.add(specification.id);

    const normalizedName = normalizeComparable(specification.name);
    if (!normalizedName) {
      issues.push({ path: `${path}.name`, message: "Item name is required." });
    } else if (specification.name.length > MAX_SHORT_TEXT) {
      issues.push({
        path: `${path}.name`,
        message: `Item name must be ${MAX_SHORT_TEXT} characters or fewer.`
      });
    } else if (names.has(normalizedName)) {
      issues.push({ path: `${path}.name`, message: "Item names must be unique." });
    }
    if (normalizedName) names.add(normalizedName);

    if (specification.brandId !== null) {
      if (
        !specification.brandId.trim()
        || specification.brandId !== specification.brandId.trim()
        || specification.brandId.length > MAX_SHORT_TEXT
      ) {
        issues.push({
          path: `${path}.brandId`,
          message: "Brand must use a bounded stable ID."
        });
      } else if (brandIdCounts && brandIdCounts.get(specification.brandId) !== 1) {
        issues.push({
          path: `${path}.brandId`,
          message: "Choose a configured Brand."
        });
      }
    }

    if (
      typeof specification.description === "string" &&
      specification.description.length > MAX_TEXT
    ) {
      issues.push({
        path: `${path}.description`,
        message: `Brief description must be ${MAX_TEXT} characters or fewer.`
      });
    }
  });
  return issues;
}

export function createKnowledgeSpecification(): KnowledgeSpecificationConfiguration {
  return {
    id: createStableSpecificationId(),
    name: "",
    brandId: null,
    description: "",
    hiddenTypedFields: null
  };
}

export function serializeKnowledgeSpecifications(
  specifications: readonly KnowledgeSpecificationConfiguration[]
): readonly KnowledgeJsonObject[] {
  return specifications.map((specification) => ({
    id: specification.id,
    name: specification.name,
    ...(specification.brandId ? { brandId: specification.brandId } : {}),
    ...(specification.description === null
      ? { description: null }
      : specification.description.trim()
        ? { description: specification.description }
        : {}),
    ...(specification.hiddenTypedFields ?? {})
  }));
}

export function referencedSpecificationIds(
  priceEntries: KnowledgeJsonValue | undefined
): ReadonlySet<string> {
  if (!Array.isArray(priceEntries)) return new Set();
  const ids = new Set<string>();
  for (const entry of priceEntries) {
    if (!isObject(entry)) continue;
    const direct = stringValue(entry.specificationId);
    if (direct) ids.add(direct);
    if (entry.priceVersion !== undefined && isObject(entry.priceVersion)) {
      const resolved = stringValue(entry.priceVersion.specificationId);
      if (resolved) ids.add(resolved);
    }
  }
  return ids;
}

function validateStableId(
  value: string,
  path: string,
  issues: KnowledgeSpecificationIssue[]
) {
  if (!value.trim()) issues.push({ path, message: "Specification ID is required." });
  else if (value !== value.trim() || value.length > MAX_SHORT_TEXT) {
    issues.push({ path, message: "Specification ID must be a bounded stable ID." });
  }
}

function createStableSpecificationId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `knowledge-specification-${random}`;
  fallbackIdCounter += 1;
  return `knowledge-specification-${Date.now().toString(36)}-${fallbackIdCounter}`;
}

function normalizeComparable(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function stringValue(value: KnowledgeJsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: KnowledgeJsonValue): value is KnowledgeJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
