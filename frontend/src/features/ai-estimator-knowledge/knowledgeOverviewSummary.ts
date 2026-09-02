import type {
  KnowledgeBasket,
  KnowledgeCompleteness,
  KnowledgeCompletenessFinding,
  KnowledgeCompletenessState,
  KnowledgeItemListItem,
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeSectionKey
} from "./knowledgeTypes";
import {
  KNOWLEDGE_MODE_OPTIONS,
  parseKnowledgeModeConfigurations,
  partitionKnowledgeModeConfigurations,
  projectKnowledgeModeConfigurationFieldSummaries,
  projectKnowledgeModeFieldSummaries,
  type KnowledgeModeFieldSummary
} from "./knowledgeModeConfiguration";

export const KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL = "Unavailable value";

export type KnowledgeOverviewReferenceState = "available" | "unavailable";
export type KnowledgeOverviewSourceState = "available" | "partial" | "unavailable";
export type KnowledgeOverviewCardKey =
  | "mode"
  | "scope"
  | "recommendations"
  | "quality"
  | "execution"
  | "advanced";

export interface KnowledgeOverviewReference {
  readonly id: string;
  readonly label: string;
  readonly state: KnowledgeOverviewReferenceState;
}

export interface KnowledgeOverviewCount {
  readonly label: string;
  readonly value: number;
}

export interface KnowledgeOverviewHighlight {
  readonly label: string;
  readonly value: string | null;
  readonly state: KnowledgeOverviewReferenceState;
}

export interface KnowledgeOverviewSectionCompleteness {
  readonly sectionKey: KnowledgeSectionKey;
  readonly state: KnowledgeCompletenessState;
}

export interface KnowledgeOverviewSectionCard {
  readonly key: KnowledgeOverviewCardKey;
  readonly label: string;
  readonly sourceSectionKeys: readonly KnowledgeSectionKey[];
  readonly sourceState: KnowledgeOverviewSourceState;
  readonly hasConfiguredContent: boolean;
  readonly counts: readonly KnowledgeOverviewCount[];
  readonly highlights: readonly KnowledgeOverviewHighlight[];
  readonly completeness: readonly KnowledgeOverviewSectionCompleteness[];
  readonly blockers: readonly KnowledgeCompletenessFinding[];
  readonly warnings: readonly KnowledgeCompletenessFinding[];
}

export interface KnowledgeOverviewPriceDetail {
  readonly id: string;
  readonly operation: "append" | "reference" | "unavailable";
  readonly resolved: boolean;
  readonly priceVersionId: string | null;
  readonly versionNumber: number | null;
  readonly specification: KnowledgeOverviewReference | null;
  readonly mode: KnowledgeOverviewReference | null;
  readonly vendor: KnowledgeOverviewReference | null;
  readonly uom: KnowledgeOverviewReference | null;
  readonly tax: KnowledgeOverviewReference | null;
  readonly taxVersion: KnowledgeOverviewReference | null;
  readonly inputAmountPaise: number | null;
  readonly baseAmountPaise: number | null;
  readonly taxAmountPaise: number | null;
  readonly totalAmountPaise: number | null;
  readonly treatment: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly status: string | null;
  readonly reviewRequired: boolean | null;
}

export interface KnowledgeOverviewSpecificationDetail {
  readonly option: KnowledgeOverviewReference;
  readonly description: string | null;
}

export interface KnowledgeOverviewRecommendationDetail {
  readonly option: KnowledgeOverviewReference;
  readonly targetBasket: KnowledgeOverviewReference;
  readonly targetMainLine: KnowledgeOverviewReference;
  readonly type: string | null;
  readonly priority: KnowledgeOverviewReference | null;
  readonly reason: string | null;
  readonly quantityRelationship: string | null;
  readonly quantityValue: string | null;
  readonly dependency: boolean | null;
  readonly active: boolean | null;
}

export interface KnowledgeOverviewQualityDetail {
  readonly id: string;
  readonly label: string;
  readonly labelState: KnowledgeOverviewReferenceState;
  readonly type: string | null;
  readonly unit: string | null;
  readonly allowedValues: readonly string[];
  readonly minimum: string | null;
  readonly maximum: string | null;
  readonly defaultValue: KnowledgeJsonValue | undefined;
  readonly required: boolean | null;
  readonly category: string | null;
  readonly active: boolean | null;
}

export interface KnowledgeOverviewModeOverrideDetail {
  readonly id: string;
  readonly description: string | null;
  readonly active: boolean | null;
}

export interface KnowledgeOverviewModeDetail {
  readonly option: KnowledgeOverviewReference;
  readonly configured: boolean;
  readonly referencedByOverview: boolean;
  readonly referencedByScope: boolean;
  readonly prices: readonly KnowledgeOverviewPriceDetail[];
  readonly overrides: readonly KnowledgeOverviewModeOverrideDetail[];
  readonly dynamicFields: readonly KnowledgeModeFieldSummary[];
  readonly executionSources: readonly KnowledgeOverviewExecutionSourceDetail[];
  readonly hasAssociatedRecords: boolean;
}

export interface KnowledgeOverviewExecutionSourceDetail {
  readonly source: "sub_vendor" | "in_house";
  readonly label: "Sub-Vendor" | "In-house";
  readonly dynamicFields: readonly KnowledgeModeFieldSummary[];
}

export interface KnowledgeOverviewModeRecoveryDetail {
  readonly key: string;
  readonly label: string;
  readonly state: "unavailable" | "collision";
  readonly dynamicFields: readonly KnowledgeModeFieldSummary[];
}

export interface KnowledgeOverviewQuantitySlabDetail {
  readonly id: string;
  readonly minimumQuantity: string | null;
  readonly maximumQuantity: string | null;
  readonly adjustmentBps: number | null;
}

/**
 * Calculation settings shared by every Mode. Keep this object separate from
 * `modeDetails`: the persisted contract does not attribute these values to a
 * Mode, including PMC markup.
 */
export interface KnowledgeOverviewSharedQuantityMargin {
  readonly gapBehavior: string | null;
  readonly startMarginBps: number | null;
  readonly bottomMarginBps: number | null;
  readonly pmcMarkupBps: number | null;
  readonly wastageBps: number | null;
  readonly quantitySlabs: readonly KnowledgeOverviewQuantitySlabDetail[];
  readonly slabRateCount: number;
}

export interface KnowledgeOverviewSummary {
  readonly sectionCards: readonly KnowledgeOverviewSectionCard[];
  readonly priceDetails: readonly KnowledgeOverviewPriceDetail[];
  readonly specificationOptions: readonly KnowledgeOverviewReference[];
  readonly specificationDetails: readonly KnowledgeOverviewSpecificationDetail[];
  readonly recommendationOptions: readonly KnowledgeOverviewReference[];
  readonly recommendationDetails: readonly KnowledgeOverviewRecommendationDetail[];
  readonly qualityDetails: readonly KnowledgeOverviewQualityDetail[];
  readonly modeOptions: readonly KnowledgeOverviewReference[];
  readonly modeDetails: readonly KnowledgeOverviewModeDetail[];
  readonly modeRecoveryDetails: readonly KnowledgeOverviewModeRecoveryDetail[];
  readonly legacyModeMappingRequired: boolean;
  readonly sharedQuantityMargin: KnowledgeOverviewSharedQuantityMargin;
  readonly hasSharedQuantityMargin: boolean;
}

export interface KnowledgeOverviewMasterReference
  extends Pick<KnowledgeMaster, "id" | "name" | "displayOrder" | "status"> {
  readonly code?: string;
  readonly taxVersions?: KnowledgeMaster["taxVersions"];
}

export interface KnowledgeOverviewSummaryInput {
  readonly sections: Readonly<
    Partial<Record<KnowledgeSectionKey, KnowledgeJsonObject | null | undefined>>
  >;
  readonly masters?: Readonly<
    Partial<Record<KnowledgeMasterType, readonly KnowledgeOverviewMasterReference[]>>
  >;
  readonly baskets?: readonly Pick<KnowledgeBasket, "id" | "name">[];
  readonly items?: readonly Pick<
    KnowledgeItemListItem,
    "mainLineId" | "mainLineName"
  >[];
  readonly completeness?: KnowledgeCompleteness | null;
}

interface ProjectionContext {
  readonly masters: Readonly<
    Partial<Record<KnowledgeMasterType, readonly KnowledgeOverviewMasterReference[]>>
  >;
  readonly masterMaps: Readonly<
    Partial<Record<KnowledgeMasterType, ReadonlyMap<string, KnowledgeOverviewMasterReference>>>
  >;
  readonly specifications: readonly KnowledgeJsonObject[];
  readonly specificationMap: ReadonlyMap<string, KnowledgeJsonObject>;
  readonly baskets: ReadonlyMap<string, Pick<KnowledgeBasket, "id" | "name">>;
  readonly items: ReadonlyMap<
    string,
    Pick<KnowledgeItemListItem, "mainLineId" | "mainLineName">
  >;
}

export function projectKnowledgeOverviewSummary(
  input: KnowledgeOverviewSummaryInput
): KnowledgeOverviewSummary {
  const overview = sectionPayload(input.sections, "overview");
  const pricing = sectionPayload(input.sections, "pricing");
  const quantityMargin = sectionPayload(input.sections, "quantity-margin");
  const scope = sectionPayload(input.sections, "scope");
  const recommendations = sectionPayload(input.sections, "recommendations");
  const quality = sectionPayload(input.sections, "quality");
  const execution = sectionPayload(input.sections, "execution");
  const advanced = sectionPayload(input.sections, "advanced");
  const masters = input.masters ?? {};
  const specifications = stableObjectRows(pricing?.specifications);
  const context: ProjectionContext = {
    masters,
    masterMaps: Object.fromEntries(
      Object.entries(masters).map(([type, values]) => [
        type,
        new Map(values?.map((value) => [value.id, value]) ?? [])
      ])
    ),
    specifications,
    specificationMap: new Map(
      specifications.map((value) => [requiredStableId(value.id)!, value])
    ),
    baskets: new Map((input.baskets ?? []).map((value) => [value.id, value])),
    items: new Map((input.items ?? []).map((value) => [value.mainLineId, value]))
  };

  const prices = stablePriceRows(pricing?.priceEntries).map((row) =>
    projectPrice(row, context)
  );
  const specificationDetails = specifications.map((specification) => {
    const id = requiredStableId(specification.id)!;
    return {
      option: directReference(id, optionalText(specification.name)),
      description: optionalText(specification.description)
    };
  });
  const recommendationDetails = stableObjectRows(
    recommendations?.recommendations
  ).map((recommendation) => projectRecommendation(recommendation, context));
  const qualityDetails = stableObjectRows(quality?.parameters).map(projectQuality);
  const modeConfigurations = parseKnowledgeModeConfigurations(
    advanced?.modeConfigurations,
    masters.modes ?? []
  ).configurations;
  const partitionedModeConfigurations = partitionKnowledgeModeConfigurations(
    modeConfigurations
  );
  const modeIds = referencedModeIds(
    overview,
    scope,
    prices,
    advanced
  );
  const pmcFields = projectKnowledgeModeFieldSummaries(
    modeConfigurations,
    "pmc"
  );
  const executionSources = ([
    ["sub_vendor", "Sub-Vendor"],
    ["in_house", "In-house"]
  ] as const).flatMap(([source, label]) => {
    const dynamicFields = projectKnowledgeModeFieldSummaries(
      modeConfigurations,
      "execution",
      source
    );
    return dynamicFields.length ? [{ source, label, dynamicFields }] : [];
  });
  const modeDetails: KnowledgeOverviewModeDetail[] = [
    ...(pmcFields.length ? [{
      option: directReference("pmc", "PMC"),
      configured: true,
      referencedByOverview: false,
      referencedByScope: false,
      prices: [],
      overrides: [],
      dynamicFields: pmcFields,
      executionSources: [],
      hasAssociatedRecords: true
    }] : []),
    ...(executionSources.length ? [{
      option: directReference("execution", "Execution"),
      configured: true,
      referencedByOverview: false,
      referencedByScope: false,
      prices: [],
      overrides: [],
      dynamicFields: [],
      executionSources,
      hasAssociatedRecords: true
    }] : [])
  ];
  const modeOptions = modeDetails.map(({ option }) => option);
  const modeRecoveryDetails = partitionedModeConfigurations.recovery.map(
    (recovery, index) => ({
      key: recovery.configuration.id,
      label: recovery.modeKind === null
        ? `Saved Mode configuration ${index + 1}`
        : `Saved ${KNOWLEDGE_MODE_OPTIONS.find(({ modeKind }) => modeKind === recovery.modeKind)!.label} configuration`,
      state: recovery.reason === "collision" ? "collision" as const : "unavailable" as const,
      dynamicFields: projectKnowledgeModeConfigurationFieldSummaries(
        recovery.configuration
      )
    })
  );
  const legacyModeMappingRequired = partitionedModeConfigurations.recovery.some(
    ({ reason }) => reason === "unresolved"
  );
  const sharedQuantityMargin = projectSharedQuantityMargin(quantityMargin);
  const hasSharedQuantityMargin =
    sharedQuantityMargin.gapBehavior !== null ||
    sharedQuantityMargin.startMarginBps !== null ||
    sharedQuantityMargin.bottomMarginBps !== null ||
    sharedQuantityMargin.pmcMarkupBps !== null ||
    sharedQuantityMargin.wastageBps !== null ||
    sharedQuantityMargin.quantitySlabs.length > 0 ||
    sharedQuantityMargin.slabRateCount > 0;

  return {
    sectionCards: projectSectionCards({
      sections: input.sections,
      completeness: input.completeness,
      context,
      configuredModeReferences: [
        ...modeOptions,
        ...modeIds.map((id) => resolveMaster("modes", id, context))
      ],
      specifications,
      prices,
      sharedQuantityMargin,
      scope,
      recommendationDetails,
      qualityDetails,
      execution,
      advanced
    }),
    priceDetails: prices,
    specificationOptions: specificationDetails.map(({ option }) => option),
    specificationDetails,
    recommendationOptions: recommendationDetails.map(({ option }) => option),
    recommendationDetails,
    qualityDetails,
    modeOptions,
    modeDetails,
    modeRecoveryDetails,
    legacyModeMappingRequired,
    sharedQuantityMargin,
    hasSharedQuantityMargin
  };
}

export function hasMeaningfulKnowledgeValue(
  value: KnowledgeJsonValue | undefined
): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulKnowledgeValue);
  return Object.values(value).some(hasMeaningfulKnowledgeValue);
}

function projectPrice(
  row: KnowledgeJsonObject,
  context: ProjectionContext
): KnowledgeOverviewPriceDetail {
  const operation =
    row.operation === "append"
      ? "append"
      : row.operation === "reference"
        ? "reference"
        : "unavailable";
  const resolvedVersion =
    operation === "reference" && isObject(row.priceVersion)
      ? row.priceVersion
      : null;
  const values = resolvedVersion ?? row;
  const specificationId = optionalStableId(values.specificationId);
  const modeId = optionalStableId(values.modeId);
  const taxRuleId = optionalStableId(values.taxRuleId);
  const taxVersionId = optionalStableId(values.taxVersionId);

  return {
    id: requiredStableId(row.priceEntryId)!,
    operation,
    resolved: operation === "append" || resolvedVersion !== null,
    priceVersionId: optionalStableId(row.priceVersionId),
    versionNumber: optionalNumber(values.versionNumber),
    specification: specificationId
      ? resolveSpecification(specificationId, context)
      : null,
    mode: modeId ? resolveMaster("modes", modeId, context) : null,
    vendor: referenceFromOptionalMasterId("vendors", values.vendorId, context),
    uom: referenceFromOptionalMasterId("uoms", values.uomId, context),
    tax: taxRuleId ? resolveMaster("taxes", taxRuleId, context) : null,
    taxVersion: taxVersionId
      ? resolveTaxVersion(taxRuleId, taxVersionId, context)
      : null,
    inputAmountPaise: optionalNumber(values.inputAmountPaise),
    baseAmountPaise: optionalNumber(values.baseAmountPaise),
    taxAmountPaise: optionalNumber(values.taxAmountPaise),
    totalAmountPaise: optionalNumber(values.totalAmountPaise),
    treatment: optionalText(values.treatment),
    effectiveFrom: optionalText(values.effectiveFrom),
    effectiveTo: optionalText(values.effectiveTo),
    status: optionalText(values.status),
    reviewRequired: optionalBoolean(values.reviewRequired)
  };
}

function projectRecommendation(
  recommendation: KnowledgeJsonObject,
  context: ProjectionContext
): KnowledgeOverviewRecommendationDetail {
  const id = requiredStableId(recommendation.id)!;
  const targetBasketId = optionalStableId(recommendation.targetBasketId);
  const targetMainLineId = optionalStableId(recommendation.targetMainLineId);
  const targetBasket = targetBasketId
    ? resolveNamedEntity(targetBasketId, context.baskets.get(targetBasketId)?.name)
    : unavailableReference("");
  const targetMainLine = targetMainLineId
    ? resolveNamedEntity(
        targetMainLineId,
        context.items.get(targetMainLineId)?.mainLineName
      )
    : unavailableReference("");
  const priorityId = optionalStableId(recommendation.priorityId);

  return {
    option: {
      id,
      label: targetMainLine.label,
      state: targetMainLine.state
    },
    targetBasket,
    targetMainLine,
    type: optionalText(recommendation.type),
    priority: priorityId ? resolveMaster("priorities", priorityId, context) : null,
    reason: optionalText(recommendation.reason),
    quantityRelationship: optionalText(recommendation.quantityRelationship),
    quantityValue: optionalText(recommendation.quantityValue),
    dependency: optionalBoolean(recommendation.dependency),
    active: optionalBoolean(recommendation.active)
  };
}

function projectQuality(
  parameter: KnowledgeJsonObject
): KnowledgeOverviewQualityDetail {
  const label = optionalText(parameter.label);
  return {
    id: requiredStableId(parameter.id)!,
    label: label ?? KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL,
    labelState: label ? "available" : "unavailable",
    type: optionalText(parameter.type),
    unit: optionalText(parameter.unit),
    allowedValues: stringArray(parameter.allowedValues),
    minimum: optionalText(parameter.minimum),
    maximum: optionalText(parameter.maximum),
    defaultValue: parameter.defaultValue,
    required: optionalBoolean(parameter.required),
    category: optionalText(parameter.category),
    active: optionalBoolean(parameter.active)
  };
}

function projectSharedQuantityMargin(
  payload: KnowledgeJsonObject | undefined
): KnowledgeOverviewSharedQuantityMargin {
  return {
    gapBehavior: optionalText(payload?.gapBehavior),
    startMarginBps: optionalNumber(payload?.startMarginBps),
    bottomMarginBps: optionalNumber(payload?.bottomMarginBps),
    pmcMarkupBps: optionalNumber(payload?.pmcMarkupBps),
    wastageBps: optionalNumber(payload?.wastageBps),
    quantitySlabs: stableObjectRows(payload?.quantitySlabs).map((slab) => ({
      id: requiredStableId(slab.id)!,
      minimumQuantity: optionalText(slab.minimumQuantity),
      maximumQuantity: optionalText(slab.maximumQuantity),
      adjustmentBps: optionalNumber(slab.adjustmentBps)
    })),
    slabRateCount: stableObjectRows(payload?.slabRates).length
  };
}

function referencedModeIds(
  overview: KnowledgeJsonObject | undefined,
  scope: KnowledgeJsonObject | undefined,
  prices: readonly KnowledgeOverviewPriceDetail[],
  advanced: KnowledgeJsonObject | undefined
): readonly string[] {
  return uniqueStrings([
    ...stringArray(overview?.modeIds),
    ...stringArray(scope?.modeIds),
    ...prices.flatMap((price) => (price.mode ? [price.mode.id] : [])),
    ...objectRows(advanced?.modeOverrides).flatMap((override) => {
      const modeId = optionalStableId(override.modeId);
      return modeId ? [modeId] : [];
    })
  ]);
}

function projectSectionCards(input: {
  readonly sections: KnowledgeOverviewSummaryInput["sections"];
  readonly completeness: KnowledgeCompleteness | null | undefined;
  readonly context: ProjectionContext;
  readonly configuredModeReferences: readonly KnowledgeOverviewReference[];
  readonly specifications: readonly KnowledgeJsonObject[];
  readonly prices: readonly KnowledgeOverviewPriceDetail[];
  readonly sharedQuantityMargin: KnowledgeOverviewSharedQuantityMargin;
  readonly scope: KnowledgeJsonObject | undefined;
  readonly recommendationDetails: readonly KnowledgeOverviewRecommendationDetail[];
  readonly qualityDetails: readonly KnowledgeOverviewQualityDetail[];
  readonly execution: KnowledgeJsonObject | undefined;
  readonly advanced: KnowledgeJsonObject | undefined;
}): readonly KnowledgeOverviewSectionCard[] {
  const cards: readonly Omit<
    KnowledgeOverviewSectionCard,
    | "sourceState"
    | "hasConfiguredContent"
    | "completeness"
    | "blockers"
    | "warnings"
  >[] = [
    {
      key: "mode",
      label: "Mode",
      sourceSectionKeys: ["pricing", "quantity-margin"],
      counts: [
        { label: "Specifications", value: input.specifications.length },
        { label: "Price versions", value: input.prices.length },
        {
          label: "Quantity slabs",
          value: input.sharedQuantityMargin.quantitySlabs.length
            + input.sharedQuantityMargin.slabRateCount
        }
      ],
      highlights: [referenceListHighlight("Modes", input.configuredModeReferences)]
    },
    {
      key: "scope",
      label: "Scope",
      sourceSectionKeys: ["scope"],
      counts: [
        { label: "Modes", value: stringArray(input.scope?.modeIds).length },
        { label: "Surfaces", value: stringArray(input.scope?.surfaceIds).length },
        { label: "Exclusions", value: objectRows(input.scope?.exclusions).length }
      ],
      highlights: [
        referenceListHighlight(
          "Modes",
          stringArray(input.scope?.modeIds).map((id) =>
            resolveMaster("modes", id, input.context)
          )
        ),
        referenceListHighlight(
          "Surfaces",
          stringArray(input.scope?.surfaceIds).map((id) =>
            resolveMaster("surfaces", id, input.context)
          )
        )
      ]
    },
    {
      key: "recommendations",
      label: "Recommendations",
      sourceSectionKeys: ["recommendations"],
      counts: [
        { label: "Recommendations", value: input.recommendationDetails.length }
      ],
      highlights: [
        referenceListHighlight(
          "Targets",
          input.recommendationDetails.map(({ targetMainLine }) => targetMainLine)
        )
      ]
    },
    {
      key: "quality",
      label: "Quality",
      sourceSectionKeys: ["quality"],
      counts: [
        { label: "Parameters", value: input.qualityDetails.length },
        {
          label: "Required",
          value: input.qualityDetails.filter(({ required }) => required === true).length
        }
      ],
      highlights: [
        directLabelListHighlight(
          "Parameters",
          input.qualityDetails.map(({ label, labelState }) => ({ label, state: labelState }))
        )
      ]
    },
    {
      key: "execution",
      label: "Execution",
      sourceSectionKeys: ["execution"],
      counts: [
        { label: "Steps", value: objectRows(input.execution?.steps).length },
        {
          label: "Productivity rules",
          value: objectRows(input.execution?.productivity).length
        }
      ],
      highlights: [
        directLabelListHighlight(
          "Steps",
          objectRows(input.execution?.steps).map((step) => {
            const label = optionalText(step.name);
            return {
              label: label ?? KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL,
              state: label ? "available" : "unavailable"
            };
          })
        )
      ]
    },
    {
      key: "advanced",
      label: "Advanced",
      sourceSectionKeys: ["advanced"],
      counts: [
        { label: "Dependencies", value: objectRows(input.advanced?.dependencies).length },
        { label: "Mode overrides", value: objectRows(input.advanced?.modeOverrides).length }
      ],
      highlights: [
        referenceListHighlight(
          "Override Modes",
          objectRows(input.advanced?.modeOverrides).flatMap((override) => {
            const id = optionalStableId(override.modeId);
            return id ? [resolveMaster("modes", id, input.context)] : [];
          })
        )
      ]
    }
  ];

  return cards.map((card) => {
    const completeness = card.sourceSectionKeys.flatMap((sectionKey) => {
      const section = input.completeness?.sections.find(
        (candidate) => candidate.sectionKey === sectionKey
      );
      return section ? [{ sectionKey, state: section.state }] : [];
    });
    const sourceFindings = (findings: readonly KnowledgeCompletenessFinding[]) =>
      findings.filter((finding) => card.sourceSectionKeys.includes(finding.sectionKey));
    return {
      ...card,
      counts: card.counts.filter(({ value }) => value > 0),
      highlights: card.highlights.filter(({ value }) => value !== null),
      sourceState: sourceState(input.sections, card.sourceSectionKeys),
      hasConfiguredContent: card.sourceSectionKeys.some((sectionKey) =>
        hasMeaningfulKnowledgeValue(sectionPayload(input.sections, sectionKey))
      ),
      completeness,
      blockers: sourceFindings(input.completeness?.blockers ?? []),
      warnings: sourceFindings(input.completeness?.warnings ?? [])
    };
  });
}

function resolveSpecification(
  id: string,
  context: ProjectionContext
): KnowledgeOverviewReference {
  return resolveNamedEntity(
    id,
    optionalText(context.specificationMap.get(id)?.name) ?? undefined
  );
}

function resolveMaster(
  type: KnowledgeMasterType,
  id: string,
  context: ProjectionContext
): KnowledgeOverviewReference {
  return resolveNamedEntity(id, context.masterMaps[type]?.get(id)?.name);
}

function referenceFromOptionalMasterId(
  type: KnowledgeMasterType,
  value: KnowledgeJsonValue | undefined,
  context: ProjectionContext
): KnowledgeOverviewReference | null {
  const id = optionalStableId(value);
  return id ? resolveMaster(type, id, context) : null;
}

function resolveTaxVersion(
  taxRuleId: string | null,
  taxVersionId: string,
  context: ProjectionContext
): KnowledgeOverviewReference {
  const taxRule = taxRuleId
    ? context.masterMaps.taxes?.get(taxRuleId)
    : undefined;
  const version = taxRule?.taxVersions?.find(({ id }) => id === taxVersionId);
  return resolveNamedEntity(
    taxVersionId,
    version ? `Version ${version.versionNumber}` : undefined
  );
}

function directReference(id: string, label: string | null): KnowledgeOverviewReference {
  return resolveNamedEntity(id, label ?? undefined);
}

function resolveNamedEntity(
  id: string,
  label: string | undefined
): KnowledgeOverviewReference {
  const normalized = label?.trim();
  return normalized
    ? { id, label: normalized, state: "available" }
    : unavailableReference(id);
}

function unavailableReference(id: string): KnowledgeOverviewReference {
  return { id, label: KNOWLEDGE_OVERVIEW_UNAVAILABLE_LABEL, state: "unavailable" };
}

function referenceListHighlight(
  label: string,
  references: readonly KnowledgeOverviewReference[]
): KnowledgeOverviewHighlight {
  return directLabelListHighlight(label, references);
}

function directLabelListHighlight(
  label: string,
  values: readonly { readonly label: string; readonly state: KnowledgeOverviewReferenceState }[]
): KnowledgeOverviewHighlight {
  return {
    label,
    value: values.length ? values.map((value) => value.label).join(", ") : null,
    state: values.some(({ state }) => state === "unavailable")
      ? "unavailable"
      : "available"
  };
}

function sourceState(
  sections: KnowledgeOverviewSummaryInput["sections"],
  keys: readonly KnowledgeSectionKey[]
): KnowledgeOverviewSourceState {
  const available = keys.filter((key) => sectionPayload(sections, key) !== undefined).length;
  if (available === 0) return "unavailable";
  return available === keys.length ? "available" : "partial";
}

function sectionPayload(
  sections: KnowledgeOverviewSummaryInput["sections"],
  key: KnowledgeSectionKey
): KnowledgeJsonObject | undefined {
  const value = sections[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function stablePriceRows(
  value: KnowledgeJsonValue | undefined
): readonly KnowledgeJsonObject[] {
  return objectRows(value).filter((row) => requiredStableId(row.priceEntryId) !== null);
}

function stableObjectRows(
  value: KnowledgeJsonValue | undefined
): readonly KnowledgeJsonObject[] {
  return objectRows(value).filter((row) => requiredStableId(row.id) !== null);
}

function objectRows(
  value: KnowledgeJsonValue | undefined
): readonly KnowledgeJsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function isObject(value: KnowledgeJsonValue): value is KnowledgeJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: KnowledgeJsonValue | undefined): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function requiredStableId(value: KnowledgeJsonValue | undefined): string | null {
  return optionalStableId(value);
}

function optionalStableId(value: KnowledgeJsonValue | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function optionalText(value: KnowledgeJsonValue | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function optionalNumber(value: KnowledgeJsonValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function optionalBoolean(value: KnowledgeJsonValue | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
