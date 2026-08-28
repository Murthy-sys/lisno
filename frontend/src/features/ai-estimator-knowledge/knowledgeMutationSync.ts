import type { QueryClient } from "@tanstack/react-query";

import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type {
  KnowledgeItemDetail,
  KnowledgeMasterType,
  KnowledgeSectionEnvelope
} from "./knowledgeTypes";

export async function syncKnowledgeSectionMutation(
  queryClient: QueryClient,
  section: KnowledgeSectionEnvelope
): Promise<void> {
  queryClient.setQueryData(
    knowledgeQueryKeys.section(
      section.mainLineId,
      section.revisionId,
      section.sectionKey
    ),
    section
  );

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.item(section.mainLineId)
    }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.histories()
    }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.activationReviews()
    })
  ]);
}

export async function syncKnowledgeLifecycleMutation(
  queryClient: QueryClient,
  item: KnowledgeItemDetail
): Promise<void> {
  queryClient.setQueryData(knowledgeQueryKeys.item(item.mainLineId), item);

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.item(item.mainLineId)
    }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.histories()
    }),
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.activationReviews()
    }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() })
  ]);
}

export async function syncKnowledgeMasterMutation(
  queryClient: QueryClient,
  masterType: KnowledgeMasterType
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: knowledgeQueryKeys.masterLists(masterType)
    }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
    queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() })
  ]);
}
