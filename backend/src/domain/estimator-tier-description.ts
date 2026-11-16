import type { KnowledgeModeTier } from "./ai-estimator-knowledge-mode-tiers.js";
import { validateKnowledgeSectionPayload } from "./ai-estimator-knowledge-validation.js";
import {
  generateModeDescription,
  MAX_MODE_DESCRIPTION_LENGTH,
  syncModeDescription,
  type ModeDescriptionScope
} from "./knowledge-mode-description.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

interface DescriptionScope {
  applicability: "configured" | "not_configured" | "not_applicable";
  payload: Record<string, unknown>;
}

function readScope(value: unknown): DescriptionScope | null {
  if (!isRecord(value) || !isRecord(value.payload)) return null;
  const applicability = value.applicability;
  if (applicability !== "configured" && applicability !== "not_configured" && applicability !== "not_applicable") return null;
  return { applicability, payload: value.payload };
}

/** Missing namespaces can use Mode; malformed namespaces cannot. */
function namedScope(payload: Record<string, unknown>, name: string): DescriptionScope | null | undefined {
  if (!Object.hasOwn(payload, "tierConfigurations")) return undefined;
  if (!isRecord(payload.tierConfigurations)) return null;
  if (!Object.hasOwn(payload.tierConfigurations, name)) return undefined;
  return readScope(payload.tierConfigurations[name]);
}

/** Resolve display text independently of specifications, within one verified source section. */
export function projectEstimatorTierDescription(section: unknown, tier: KnowledgeModeTier, mainLineName: string): string | null {
  if (!isRecord(section) || section.sectionKey !== "advanced" || !isRecord(section.payload)) return null;
  const selected = tier === "signature" ? readScope(section) : namedScope(section.payload, tier);
  if (selected === null) return null;
  const description = selected ? projectScopeDescription(selected, mainLineName) : undefined;
  if (description !== undefined) return description;
  const mode = namedScope(section.payload, "default");
  return mode ? projectScopeDescription(mode, mainLineName) ?? null : null;
}

/** Undefined is ordinary absence; null is invalid or disabled retained content. */
function projectScopeDescription(scope: DescriptionScope, mainLineName: string): string | null | undefined {
  const { payload } = scope;
  // Only validate consumed description inputs. Unrelated price fields cannot hide a paragraph.
  const inputs = Object.fromEntries(["modeDescription", "modeConfigurations"]
    .filter(key => Object.hasOwn(payload, key)).map(key => [key, payload[key]]));
  if (validateKnowledgeSectionPayload("advanced", inputs).length) return null;
  const text = typeof inputs.modeDescription === "string" ? inputs.modeDescription : undefined;
  const rows = (inputs.modeConfigurations ?? []) as Array<Record<string, unknown>>;
  // Configuration puts legacy or unscoped rows into recovery, never into a primary scope.
  if (rows.some(row => Object.hasOwn(row, "modeId") ||
    (row.modeKind === "execution" && row.executionSource !== "sub_vendor" && row.executionSource !== "in_house"))) return null;
  if (!text && !rows.length) return undefined;
  if (scope.applicability !== "configured") return null;
  const pmc = rows.find(row => row.modeKind === "pmc") as ModeDescriptionScope | undefined;
  const inHouse = rows.find(row => row.modeKind === "execution" && row.executionSource === "in_house") as ModeDescriptionScope | undefined;
  if (!text && (typeof mainLineName !== "string" || !mainLineName.trim())) return null;
  const description = text !== undefined
    ? syncModeDescription(text, pmc, undefined, inHouse)
    : generateModeDescription(mainLineName, pmc, inHouse);
  return description.trim() && description.length <= MAX_MODE_DESCRIPTION_LENGTH ? description : null;
}
