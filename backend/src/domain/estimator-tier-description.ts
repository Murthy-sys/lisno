import type { KnowledgeModeTier } from "./ai-estimator-knowledge-mode-tiers.js";
import { validateKnowledgeSectionPayload } from "./ai-estimator-knowledge-validation.js";
import { MAX_MODE_DESCRIPTION_LENGTH } from "./knowledge-mode-description.js";

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

/** A missing or malformed namespace has no selected-tier description. */
function namedScope(payload: Record<string, unknown>, name: string): DescriptionScope | null | undefined {
  if (!Object.hasOwn(payload, "tierConfigurations")) return undefined;
  if (!isRecord(payload.tierConfigurations)) return null;
  if (!Object.hasOwn(payload.tierConfigurations, name)) return undefined;
  return readScope(payload.tierConfigurations[name]);
}

/** Read only the selected tier's saved wording, within one verified source section. */
export function projectEstimatorTierDescription(section: unknown, tier: KnowledgeModeTier, _mainLineName: string): string | null {
  if (!isRecord(section) || section.sectionKey !== "advanced" || !isRecord(section.payload)) return null;
  const selected = tier === "signature" ? readScope(section) : namedScope(section.payload, tier);
  return selected ? projectScopeDescription(selected) : null;
}

function projectScopeDescription(scope: DescriptionScope): string | null {
  const { payload } = scope;
  if (scope.applicability !== "configured") return null;
  // Only validate consumed description inputs. Unrelated price fields cannot hide a paragraph.
  const inputs = Object.fromEntries(["modeDescription", "modeConfigurations"]
    .filter(key => Object.hasOwn(payload, key)).map(key => [key, payload[key]]));
  if (validateKnowledgeSectionPayload("advanced", inputs).length) return null;
  const text = typeof inputs.modeDescription === "string" ? inputs.modeDescription : undefined;
  const rows = (inputs.modeConfigurations ?? []) as Array<Record<string, unknown>>;
  // Configuration puts legacy or unscoped rows into recovery, never into a primary scope.
  if (rows.some(row => Object.hasOwn(row, "modeId") ||
    (row.modeKind === "execution" && row.executionSource !== "sub_vendor" && row.executionSource !== "in_house"))) return null;
  // Checklists do not generate, replace, or append to the saved Description.
  return text?.trim() && text.length <= MAX_MODE_DESCRIPTION_LENGTH ? text : null;
}
