import type { KnowledgeReferenceListParams } from "./knowledgeApi";
import type {
  KnowledgeMaster,
  KnowledgeMasterListResponse
} from "./knowledgeTypes";

const KNOWLEDGE_MASTER_PAGE_LIMIT = 100;

export async function collectAllKnowledgeMasterPages(
  loadPage: (
    params: Pick<KnowledgeReferenceListParams, "limit" | "offset">
  ) => Promise<KnowledgeMasterListResponse>
): Promise<KnowledgeMasterListResponse> {
  const items: KnowledgeMaster[] = [];
  let offset = 0;

  while (true) {
    const page = await loadPage({
      limit: KNOWLEDGE_MASTER_PAGE_LIMIT,
      offset
    });
    items.push(...page.items);

    if (!page.pagination.hasMore) {
      return {
        items,
        pagination: {
          limit: KNOWLEDGE_MASTER_PAGE_LIMIT,
          offset: 0,
          total: items.length,
          hasMore: false
        }
      };
    }

    const nextOffset = page.pagination.offset + page.items.length;
    if (nextOffset <= offset) {
      throw new Error("Mode list pagination did not advance.");
    }
    offset = nextOffset;
  }
}
