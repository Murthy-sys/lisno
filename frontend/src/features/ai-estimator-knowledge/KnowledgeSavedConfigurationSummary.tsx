import { KnowledgeHierarchySummary } from "./KnowledgeHierarchySummary";
import { useKnowledgeSavedSummary, type KnowledgeSavedSummaryInput } from "./useKnowledgeSavedSummary";

export function KnowledgeSavedConfigurationSummary(props: KnowledgeSavedSummaryInput) {
  const groups = useKnowledgeSavedSummary(props);
  return <KnowledgeHierarchySummary item={props.item} groups={groups}
    sourceKey={JSON.stringify([props.item.mainLineId, props.revisionId, props.item.basketId])} />;
}
