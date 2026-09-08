import type {
  KnowledgeCalculationScope,
  KnowledgeConfigurationContext,
  KnowledgeModeCalculationSettings
} from "../contracts/ai-estimator-knowledge.js";
import type { KnowledgeExecutionSource, KnowledgeModeKind } from "./ai-estimator-knowledge.js";
import { parseScaledDecimal } from "./ai-estimator-knowledge-calculation.js";
import { KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS } from "./ai-estimator-knowledge-mode-calculation.js";
import { validateKnowledgeSectionPayload } from "./ai-estimator-knowledge-validation.js";

type Row = Record<string, unknown>;

/** Never infer a mode from a name or substitute another cost when a scoped value is absent. */
export function buildKnowledgeConfigurationContext(input: {
  advanced: Row;
  uom: KnowledgeConfigurationContext["uom"];
  modeKind?: KnowledgeModeKind;
  executionSource?: KnowledgeExecutionSource;
  quantity?: string;
}): KnowledgeConfigurationContext {
  const { advanced, uom, modeKind, executionSource } = input;
  const context: KnowledgeConfigurationContext = {
    formulaVersion: "mode-markup-v1",
    moneyUnit: "paise",
    percentageUnit: "basis_points",
    selection: { modeKind: modeKind ?? null, executionSource: executionSource ?? null },
    uom,
    shared: { paragraph: null, scopeConfigurationId: null, inclusions: [], exclusions: [] },
    state: "ready",
    issues: [],
    calculations: []
  };
  if (typeof advanced.modeDescription === "string") context.shared.paragraph = advanced.modeDescription;
  // These lists are intentionally shared by the Main Line UI; retain that identity before mode filtering.
  const pmcRows = Array.isArray(advanced.modeConfigurations)
    ? advanced.modeConfigurations.map(asRow).filter((row) => row?.modeKind === "pmc" && row.active !== false)
    : [];
  if (pmcRows.length > 1) {
    context.issues.push({ code: "AMBIGUOUS_SHARED_SCOPE", scope: null });
  } else if (pmcRows[0]) {
    const pmc = pmcRows[0];
    const scopeRow = { id: pmc.id, modeKind: "pmc", fields: [],
      ...(Object.hasOwn(pmc, "inclusions") ? { inclusions: pmc.inclusions } : {}),
      ...(Object.hasOwn(pmc, "exclusions") ? { exclusions: pmc.exclusions } : {}) };
    if (validateKnowledgeSectionPayload("advanced", { modeConfigurations: [scopeRow] }).length) {
      context.issues.push({ code: "INVALID_SHARED_SCOPE", scope: null });
    } else {
      context.shared.scopeConfigurationId = pmc.id as string;
      for (const list of ["inclusions", "exclusions"] as const) {
        context.shared[list] = Array.isArray(pmc[list]) ? pmc[list].map(asRow)
          .filter((row): row is Row => row !== null && row.selected === true)
          .map((row) => ({ id: row.id as string, name: row.name as string })) : [];
      }
    }
  }

  const scopes: KnowledgeCalculationScope[] = modeKind === "pmc" ? ["pmc"]
    : modeKind === "execution" && executionSource === "sub_vendor" ? ["sub_vendor"]
      : modeKind === "execution" && executionSource === "in_house" ? ["in_house_labor", "in_house_material"] : [];
  if (!scopes.length) {
    context.state = "selection_required";
    context.issues.push({ code: modeKind === "execution" ? "EXECUTION_SOURCE_REQUIRED" : "CANONICAL_MODE_REQUIRED", scope: null });
    return context;
  }
  if (!uom) context.issues.push({ code: "UOM_REQUIRED", scope: null });
  if (uom && input.quantity !== undefined) {
    try { parseScaledDecimal(input.quantity, uom.decimalScale); }
    catch { context.issues.push({ code: "INVALID_QUANTITY_PRECISION", scope: null }); }
  }

  for (const scope of scopes) {
    const resolved = resolveSettings(advanced, scope);
    const entry: KnowledgeConfigurationContext["calculations"][number] = {
      scope, source: resolved.source, settings: null, maximumDiscountBps: null
    };
    context.calculations.push(entry);
    if (resolved.value == null) {
      context.issues.push({ code: "CALCULATION_NOT_CONFIGURED", scope });
      continue;
    }
    if (validateKnowledgeSectionPayload("advanced", { modeCalculation: resolved.value }).length) {
      context.issues.push({ code: "INVALID_CALCULATION_SETTINGS", scope });
      continue;
    }
    const settings = resolved.value as KnowledgeModeCalculationSettings;
    if (uom) {
      try { parseScaledDecimal(settings.lowQuantityLimit, uom.decimalScale); }
      catch {
        context.issues.push({ code: "INVALID_LOW_QUANTITY_PRECISION", scope });
        continue;
      }
    }
    // Explicit projection: no vendor notes, arbitrary payload properties or component answers.
    entry.settings = {
      baseRatePaise: settings.baseRatePaise,
      lowQuantityLimit: settings.lowQuantityLimit,
      impactBps: settings.impactBps ?? KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS,
      minimumMarkupBps: settings.minimumMarkupBps,
      startingMarkupBps: settings.startingMarkupBps
    };
    entry.maximumDiscountBps = settings.startingMarkupBps - settings.minimumMarkupBps;
  }
  context.state = context.issues.some(({ code }) => code !== "CALCULATION_NOT_CONFIGURED" && code !== "UOM_REQUIRED")
    ? "invalid" : context.issues.length ? "not_configured" : "ready";
  return context;
}

function resolveSettings(payload: Row, scope: KnowledgeCalculationScope): {
  value: unknown;
  source: KnowledgeConfigurationContext["calculations"][number]["source"];
} {
  if (!Object.hasOwn(payload, "modeCalculations")) {
    return { value: payload.modeCalculation ?? null, source: payload.modeCalculation == null ? null : "legacy_shared" };
  }
  const map = asRow(payload.modeCalculations);
  if (!map) return { value: {}, source: null };
  const inHouse = scope === "in_house_labor" || scope === "in_house_material";
  const split = Object.hasOwn(map, "in_house_labor") || Object.hasOwn(map, "in_house_material");
  if (inHouse && !split) return { value: map.in_house ?? null, source: "legacy_in_house" };
  return { value: map[scope] ?? null, source: "scoped" };
}

function asRow(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}
