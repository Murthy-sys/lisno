import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import type { EstimationCatalogue } from "./catalogueTypes";
import { buildConfiguredLines, configuredLineKey } from "./configuredEstimate";
import { buildRoomRecommendations, partitionRoomRecommendationSources, recommendationLines, recommendationSourceIdentity, type RecommendationLine } from "./roomRecommendations";
import { getStaffRecommendations, staffEstimateQueueKey } from "./staffEstimateApi";
import type { StaffEstimateForm } from "./staffEstimateModel";
import { EstimateSection, EstimateText, estimateStyles as styles } from "./EstimateUI";

export function EstimateRecommendations({ form, catalogue, roomId, session, disabled, onChange }: { readonly form: StaffEstimateForm; readonly catalogue: EstimationCatalogue; readonly roomId: string; readonly session: AuthenticatedSession; readonly disabled: boolean; readonly onChange: (form: StaffEstimateForm) => void }) {
  const context = useConfiguredRuntime();
  const partition = partitionRoomRecommendationSources({ catalogue, lines: form.lines, roomId });
  const sourceIds = [...new Set(partition.current.map((line) => line.mainLineId))].sort();
  const allowed = canPerformOperation(session, "GET /estimation/catalogue/recommendations");
  const query = useQuery({ queryKey: [...staffEstimateQueueKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "recommendations"), roomId, sourceIds, partition.current.map(recommendationSourceIdentity)], queryFn: ({ signal }) => getStaffRecommendations(context.runtime, sourceIds, signal), enabled: allowed && sourceIds.length > 0 });
  if (!sourceIds.length && !partition.historical.length) return null;
  if (!allowed) return null;
  const view = query.data ? buildRoomRecommendations({ catalogue, lines: form.lines, roomId, recommendations: query.data }) : null;
  function add(line: RecommendationLine) {
    if (!view || view.stale || disabled) return;
    const ids = [...new Set([...form.selectedMainBasketIds, line.target.basketId])];
    const lines = buildConfiguredLines(catalogue, form.rooms, new Set(ids), form.lines).map((item) => item.key === configuredLineKey(roomId, line.target.mainLineId)
      ? { ...item, included: true, recommendationSourceMainLineIds: [...new Set([...(item.recommendationSourceMainLineIds ?? []), ...line.reasons.map((reason) => reason.sourceId)])] } : item);
    onChange({ ...form, selectedMainBasketIds: ids, lines });
  }
  return <EstimateSection title="Related items and guidance">
    {query.isPending ? <EstimateText>Checking current Configuration recommendations…</EstimateText> : null}
    {query.isError || view?.stale ? <><EstimateText error>Recommendations could not be verified against current Configuration.</EstimateText><Button label="Refresh recommendations" variant="secondary" onPress={() => void query.refetch()} /></> : null}
    {view?.historicalSources.length ? <EstimateText>Recommendations for historical or unavailable sources require Configuration review.</EstimateText> : null}
    {view?.decisions.filter((item) => !item.available).map((item) => <EstimateText key={item.key}>{item.requirement === "must" ? "Required" : "Suggested"}: {item.name}. Source is unavailable.</EstimateText>)}
    {view ? recommendationLines(view.decisions).map((line) => <View key={line.key} style={styles.stack}>
      <EstimateText>{line.requirement === "must" ? "Required related item" : "Suggested item"}: {line.name}{line.selected ? " · Selected" : ""}</EstimateText>
      {line.reasons.map((reason) => <EstimateText key={`${reason.sourceId}:${reason.ruleId}`}>{reason.sourceName}: {reason.reason}</EstimateText>)}
      {!line.selected ? <Button label={`Add related ${line.name}`} variant="secondary" disabled={disabled || view.stale || query.isFetching || query.isError} onPress={() => add(line)} /> : null}
    </View>) : null}
    {view?.guidance.map((item) => <EstimateText key={`${item.sourceId}:${item.id}`}>{item.name}: {item.reason}</EstimateText>)}
  </EstimateSection>;
}
