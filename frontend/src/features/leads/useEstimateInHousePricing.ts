import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { ESTIMATE_COMPONENT_PRICING_BASIS, estimateComponentPricingMatchesLine, readEstimateComponentPricing,
  type EstimateInHousePreviewLine, type EstimateInHousePreviewResult } from "../../../../shared/estimation/estimateComponentPricing";
import { estimateAggregatePricingMatchesLine, readEstimateAggregatePricing } from "../../../../shared/estimation/estimateAggregatePricing";
import { configuredInHouseGoverned, configuredDimensionsIssue, configuredInHouseSelectionIssue, configuredQuantityUnits, configuredUsesComponentPricing, type ConfiguredLineDraft } from "./configuredEstimate";

export function estimateInHousePreviewInput(line: ConfiguredLineDraft): EstimateInHousePreviewLine | null {
  if (!line.included || !configuredUsesComponentPricing(line) || line.sourceMissing || line.uomNeedsQuantityReview || line.configurationPricingChanged ||
      configuredDimensionsIssue(line) || configuredInHouseSelectionIssue(line) ||
      configuredQuantityUnits(line.quantity, line.uomDecimalScale, true) === null) return null;
  const itemVersion = line.itemVersion ?? line.sourceItemVersion;
  const revisionVersion = line.revisionVersion ?? line.sourceRevisionVersion;
  if (!itemVersion || !revisionVersion) return null;
  return { key: line.key, mainLineId: line.mainLineId, roomId: line.roomId, pricingMode: "in_house", rateSource: "configuration",
    modeTier: line.modeTier ?? "signature", ...(configuredInHouseGoverned(line) ? {} : { selectedInHouseComponentIds: [...(line.selectedInHouseComponentIds ?? [])].sort() }),
    quantity: line.quantity, revisionId: line.revisionId, itemVersion, revisionVersion, uomId: line.uomId,
    ...(line.dimensions ? { dimensions: line.dimensions, ...(line.dimensionsMandatory && line.dimensionRule ? { expectedDimensionRule: line.dimensionRule } : {}) } : {}) };
}

/** The query key owns readiness; a response for old inputs can never price the current draft. */
export function useEstimateInHousePricing(leadId: string, lines: ConfiguredLineDraft[], enabled: boolean, onRefreshPrice?: (key: string) => void): ConfiguredLineDraft[] {
  const requests = enabled ? lines.flatMap(line => { const request = estimateInHousePreviewInput(line); return request ? [request] : []; }) : [];
  const query = useQuery({
    queryKey: ["estimate-in-house-pricing", leadId, requests, lines.map(line => [line.key, line.inHouseUsage, line.inHousePricingState])], enabled: enabled && requests.length > 0,
    queryFn: async ({ signal }) => {
      const results: EstimateInHousePreviewResult[] = [];
      for (let offset = 0; offset < requests.length; offset += 100) {
        const response = await apiClient.post<{ lines: EstimateInHousePreviewResult[] }>(`/leads/${encodeURIComponent(leadId)}/estimate/in-house-preview`,
          { lines: requests.slice(offset, offset + 100) }, { signal, showGlobalLoader: false });
        if (!response || !Array.isArray(response.lines)) throw new Error("Component pricing response unavailable.");
        results.push(...response.lines);
      }
      if (results.length !== requests.length || new Set(results.map(result => result.key)).size !== results.length) throw new Error("Component pricing response incomplete.");
      return results;
    }, retry: false, staleTime: 0, refetchOnWindowFocus: true
  });
  return useMemo(() => {
  if (!enabled) return lines;
  const byKey = new Map(query.data?.map(result => [result.key, result]));
  const requested = new Set(requests.map(line => line.key));
  return lines.map<ConfiguredLineDraft>(line => {
    if (!configuredUsesComponentPricing(line) || !line.included) return line;
    const governed = configuredInHouseGoverned(line);
    if (line.configurationPricingChanged) return { ...line, ...(governed ? { componentPricing: undefined, selectedInHouseComponentIds: undefined } : {}),
      componentPricingState: "incomplete", componentPricingIssue: line.configurationPricingIssue ?? "Configuration changed. Refresh price.",
      componentPricingRefresh: onRefreshPrice ? () => onRefreshPrice(line.key) : undefined };
    const result = byKey.get(line.key);
    const pricing = governed ? null : readEstimateComponentPricing(result?.componentPricing);
    const aggregate = governed ? readEstimateAggregatePricing(result?.aggregatePricing) : null;
    const next = { ...line, pricingBasis: ESTIMATE_COMPONENT_PRICING_BASIS, componentPricing: pricing ?? undefined, aggregatePricing: aggregate ?? undefined,
      ...(governed ? { selectedInHouseComponentIds: undefined, inHouseComponents: undefined } : {}) };
    const matches = governed ? aggregate && estimateAggregatePricingMatchesLine({ ...next, source: "configuration" })
      : pricing && estimateComponentPricingMatchesLine({ ...next, source: "configuration" });
    const ready = requested.has(line.key) && !query.isFetching && !query.isError && result?.state === "ready" && matches;
    return { ...next, componentPricing: ready && pricing ? pricing : undefined, aggregatePricing: ready && aggregate ? aggregate : undefined, componentPricingRetry: () => { void query.refetch(); },
      componentPricingState: ready ? "ready" : query.isError ? "error" : requested.has(line.key) && query.isFetching ? "loading" : "incomplete",
      componentPricingIssue: ready ? undefined : configuredInHouseSelectionIssue(line) ?? configuredDimensionsIssue(line) ??
        (query.isError ? "Component amounts could not be calculated. Your inputs are preserved." : query.isFetching && requested.has(line.key)
          ? "Calculating component amounts…" : result?.issues?.[0]?.message ?? "Refresh the current configuration to calculate component amounts.") };
  });
  }, [lines, enabled, query.data, query.isFetching, query.isError, query.refetch, onRefreshPrice]);
}
