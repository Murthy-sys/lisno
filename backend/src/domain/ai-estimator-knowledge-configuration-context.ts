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
  // PMC remains the shared source for PMC/Sub-Vendor. In-house owns an independent
  // scope so editing it cannot change the established PMC/Sub-Vendor wording.
  const inHouseScope = modeKind === "execution" && executionSource === "in_house";
  const scopeRows = Array.isArray(advanced.modeConfigurations)
    ? advanced.modeConfigurations.map(asRow).filter((row) => row?.active !== false && (
      inHouseScope
        ? row?.modeKind === "execution" && row.executionSource === "in_house"
        : row?.modeKind === "pmc"
    ))
    : [];
  if (scopeRows.length > 1) {
    context.issues.push({ code: "AMBIGUOUS_SHARED_SCOPE", scope: null });
  } else if (scopeRows[0]) {
    const scope = scopeRows[0];
    const scopeRow = { id: scope.id, modeKind: inHouseScope ? "execution" : "pmc",
      ...(inHouseScope ? { executionSource: "in_house" } : {}), fields: [],
      ...(Object.hasOwn(scope, "inclusions") ? { inclusions: scope.inclusions } : {}),
      ...(Object.hasOwn(scope, "exclusions") ? { exclusions: scope.exclusions } : {}) };
    const scopeIssues = validateKnowledgeSectionPayload("advanced", { modeConfigurations: [scopeRow] });
    if (scopeIssues.some(({ code }) => code !== "CONFLICTING_SCOPE_SELECTION")) {
      context.issues.push({ code: "INVALID_SHARED_SCOPE", scope: null });
    } else {
      // Retain readable legacy values, while marking conflicting selections invalid for analysis.
      if (scopeIssues.length) context.issues.push({ code: "CONFLICTING_SCOPE_SELECTION", scope: null });
      context.shared.scopeConfigurationId = scope.id as string;
      for (const list of ["inclusions", "exclusions"] as const) {
        context.shared[list] = Array.isArray(scope[list]) ? scope[list].map(asRow)
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
