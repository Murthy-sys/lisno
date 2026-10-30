import type {
  KnowledgeSpecificationItemNameListParams,
  KnowledgeSpecificationItemNameListResponse
} from "../contracts/ai-estimator-knowledge.js";
import { selectCurrentMainLineRevision } from "../domain/ai-estimator-knowledge-current-revision.js";
import {
  KNOWLEDGE_MODE_TIERS,
  knowledgeModeTierPayloads,
  projectKnowledgeModeTierSection
} from "../domain/ai-estimator-knowledge-mode-tiers.js";
import {
  collectSpecificationItemNames,
  matchSpecificationItemNames,
  normalizeSpecificationItemName,
  SPECIFICATION_ITEM_NAME_MAX_LENGTH
} from "../domain/knowledge-specification-item-names.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { aiEstimatorKnowledgeActorGuard, type AiEstimatorKnowledgeActorGuard } from "./ai-estimator-knowledge-actor.js";
import type { PublicUser } from "./auth.service.js";

type Row = Record<string, unknown>;
const record = (value: unknown): Row => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Row : {};

export interface AiEstimatorKnowledgeSpecificationItemNameService {
  list(actor: PublicUser, params?: KnowledgeSpecificationItemNameListParams): Promise<KnowledgeSpecificationItemNameListResponse>;
}

/** Names are derived labels; this reader never creates or changes a specification. */
export function createAiEstimatorKnowledgeSpecificationItemNameService(
  dependencies: { readonly actorGuard?: AiEstimatorKnowledgeActorGuard } = {}
): AiEstimatorKnowledgeSpecificationItemNameService {
  const actorGuard = dependencies.actorGuard ?? aiEstimatorKnowledgeActorGuard;
  return {
    async list(actor, params = {}) {
      await actorGuard.requireReadActor(actor);
      const { limit = 20, offset = 0, search, checkName } = params;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0
        || !validQueryName(search, true) || !validQueryName(checkName, false)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Enter a valid item-name search and page.");
      }

      const lines = await AiEstimatorKnowledgeMainLineModel.find({ status: { $in: ["active", "draft", "inactive"] } })
        .select({ _id: 1, status: 1, draftRevisionId: 1, activeRevisionId: 1 }).lean().exec();
      const selected = lines.flatMap(line => {
        const current = selectCurrentMainLineRevision(line);
        return current ? [{ mainLineId: String(line._id), ...current }] : [];
      });
      const revisionIds = selected.map(current => current.id);
      const [revisions, sections] = revisionIds.length ? await Promise.all([
        AiEstimatorKnowledgeRevisionModel.find({ _id: { $in: revisionIds } })
          .select({ _id: 1, mainLineId: 1, status: 1 }).lean().exec(),
        AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: revisionIds }, sectionKey: { $in: ["overview", "pricing"] } })
          .select({ mainLineId: 1, revisionId: 1, sectionKey: 1, applicability: 1,
            "payload.applicableTiers": 1, "payload.specifications.name": 1,
            "payload.tierConfigurations.premium.applicability": 1, "payload.tierConfigurations.premium.payload.specifications.name": 1,
            "payload.tierConfigurations.functional.applicability": 1, "payload.tierConfigurations.functional.payload.specifications.name": 1 })
          .lean().exec()
      ]) : [[], []];
      const revisionById = new Map(revisions.map(revision => [String(revision._id), revision]));
      const sectionsByRevision = new Map<string, Row[]>();
      for (const section of sections) {
        const key = String(section.revisionId);
        const rows = sectionsByRevision.get(key) ?? [];
        rows.push(section);
        sectionsByRevision.set(key, rows);
      }
      const rawNames: unknown[] = [];
      for (const current of selected) {
        const revision = revisionById.get(current.id);
        const rows = sectionsByRevision.get(current.id) ?? [];
        if (!revision || revision.mainLineId !== current.mainLineId || revision.status !== current.status
          || rows.some(section => section.mainLineId !== current.mainLineId)) {
          throw new ApiError(409, "KNOWLEDGE_ITEM_NAMES_UNAVAILABLE", "Current Configuration item names could not be verified. Refresh and try again.");
        }
        const overview = record(rows.find(section => section.sectionKey === "overview")?.payload);
        const applicableTiers = Object.hasOwn(overview, "applicableTiers")
          ? Array.isArray(overview.applicableTiers) ? overview.applicableTiers : []
          : ["signature"];
        const pricing = rows.find(section => section.sectionKey === "pricing");
        if (!pricing) continue;
        for (const { modeTier } of knowledgeModeTierPayloads(pricing.payload)) {
          if (!KNOWLEDGE_MODE_TIERS.includes(modeTier) || !applicableTiers.includes(modeTier)) continue;
          const projected = projectKnowledgeModeTierSection(pricing, modeTier);
          if (projected.applicability !== "configured") continue;
          const specifications = record(projected.payload).specifications;
          if (Array.isArray(specifications)) rawNames.push(...specifications.map(value => record(value).name));
        }
      }
      const catalog = collectSpecificationItemNames(rawNames);
      const normalizedSearch = search ? normalizeSpecificationItemName(search) : "";
      const matching = normalizedSearch ? catalog.filter(item => normalizeSpecificationItemName(item.name).includes(normalizedSearch)) : catalog;
      return {
        items: matching.slice(offset, offset + limit),
        pagination: { limit, offset, total: matching.length, hasMore: offset + limit < matching.length },
        ...(checkName ? matchSpecificationItemNames(catalog, checkName) : { exactMatch: null, similarItems: [] })
      };
    }
  };
}

function validQueryName(value: string | undefined, allowEmpty: boolean): boolean {
  return value === undefined || (typeof value === "string" && value.length <= SPECIFICATION_ITEM_NAME_MAX_LENGTH
    && (allowEmpty || normalizeSpecificationItemName(value).length > 0));
}
