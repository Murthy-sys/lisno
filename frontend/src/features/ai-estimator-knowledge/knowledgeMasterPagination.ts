import type { KnowledgeReferenceListParams } from "./knowledgeApi";
import type {
  KnowledgeMaster,
  KnowledgeMasterListResponse
} from "./knowledgeTypes";

const KNOWLEDGE_MASTER_PAGE_LIMIT = 100;

type KnowledgeMasterPage<TMaster extends KnowledgeMaster> = Omit<
  KnowledgeMasterListResponse,
  "items"
> & {
  readonly items: readonly TMaster[];
};

export async function collectAllKnowledgeMasterPages<TMaster extends KnowledgeMaster = KnowledgeMaster>(
  loadPage: (
    params: Pick<KnowledgeReferenceListParams, "limit" | "offset">
  ) => Promise<KnowledgeMasterPage<TMaster>>,
  catalogLabel = "Reusable value"
): Promise<KnowledgeMasterPage<TMaster>> {
  const items: TMaster[] = [];
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
      throw new Error(`${catalogLabel} list pagination did not advance.`);
    }
    offset = nextOffset;
  }
}
