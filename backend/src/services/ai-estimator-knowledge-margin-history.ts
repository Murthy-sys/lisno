import type { ClientSession } from "mongoose";
import type { KnowledgeSubBasketMarginRange, MarginComponent, MarginScope } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { asRow, marginScopeKey, samePairs, validMarginChange, type PendingMarginEdit, type SubBasketMarginLine } from "../domain/ai-estimator-knowledge-margin-matrix.js";
import { scopeMarginDeltas } from "../domain/ai-estimator-knowledge-pending-margins.js";
import { isKnowledgeModeTier } from "../domain/ai-estimator-knowledge-mode-tiers.js";
import { SUB_BASKET_MARGIN_MODES } from "../domain/ai-estimator-knowledge-sub-basket-margins.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { AuditEventModel } from "../models/AuditEvent.js";

type Row = Record<string, unknown>;
type History = Map<string, Map<string, PendingMarginEdit>>;

function readRanges(value: unknown): KnowledgeSubBasketMarginRange[] | undefined {
  if (!Array.isArray(value)) return;
  const ranges: KnowledgeSubBasketMarginRange[] = [];
  for (const entry of value) {
    const row = asRow(entry);
    if (!row || !["margin", "labor", "material"].includes(String(row.key)) ||
        ![row.minimumBps, row.maximumBps].every(bps => bps === null || Number.isSafeInteger(bps))) return;
    let component: MarginComponent | undefined;
    if (row.component !== undefined) {
      const identity = asRow(row.component);
      if (!identity || typeof identity.basketId !== "string" || (identity.subBasketId !== null && typeof identity.subBasketId !== "string")) return;
      component = { basketId: identity.basketId, subBasketId: identity.subBasketId };
    }
    ranges.push({ key: row.key as KnowledgeSubBasketMarginRange["key"], minimumBps: row.minimumBps as number | null,
      maximumBps: row.maximumBps as number | null, ...(component ? { component } : {}) });
  }
  return ranges;
}

function applySectionAudit(history: History, event: Row, owner: MarginComponent) {
  const old = asRow(event.oldValues), data = asRow(event.newValues);
  const edits = history.get(String(old?.mainLineId));
  if (!old || !data || !edits || !isKnowledgeModeTier(data.modeTier) || typeof old.revisionId !== "string"
    || typeof data.sectionVersion !== "number" || typeof event.actorId !== "string") return;
  const restore = asRow(data.marginDefaults);
  if (restore?.mode && Array.isArray(restore.ranges)) {
    for (const range of readRanges(restore.ranges) ?? []) edits.delete(marginScopeKey({ tier: data.modeTier,
      mode: restore.mode as MarginScope["mode"], ...(restore.mode === "in_house" ? { component: range.component ?? owner } : {}) }));
  }
  if (data.basketId !== owner.basketId || data.subBasketId !== owner.subBasketId || !Array.isArray(data.manualMarginChanges)) return;
  for (const raw of data.manualMarginChanges) {
    const change = asRow(raw);
    if (!change || !SUB_BASKET_MARGIN_MODES.some(mode => mode === change.mode)) continue;
    const before = readRanges(change.before), after = readRanges(change.after);
    if (!before || !after) continue;
    for (const delta of scopeMarginDeltas(data.modeTier, change.mode as MarginScope["mode"], owner, before, after)) {
      const key = marginScopeKey(delta.scope);
      edits.delete(key);
      if (delta.manual) edits.set(key, { ...delta.scope, ranges: delta.ranges, actorId: event.actorId,
        revisionId: old.revisionId, sectionVersion: data.sectionVersion });
    }
  }
}

function applyDecisionAudit(history: History, values: Row | null) {
  if (!Array.isArray(values?.impacts)) return;
  for (const value of values.impacts) {
    const impact = asRow(value);
    if (!impact || !isKnowledgeModeTier(impact.tier) || !SUB_BASKET_MARGIN_MODES.some(mode => mode === impact.mode)) continue;
    const scope = impact as unknown as MarginScope;
    const rows = readRanges(impact.ranges);
    const ranges = rows?.flatMap(({ key, minimumBps, maximumBps }) =>
      minimumBps !== null && maximumBps !== null ? [{ key, minimumBps, maximumBps }] : []);
    const shared = values.inHouseScope === "sub_basket" && scope.mode === "in_house" && !scope.component;
    if (!ranges || !validMarginChange({ ...scope, ranges }, shared ? "sub_basket" : undefined)) continue;
    if (shared) {
      // A Main Line can contain both a resolved component and an excluded component.
      // Replay the exact component outcomes recorded by the shared command.
      if (!Array.isArray(impact.componentChanges)) continue;
      const applied = new Set<string>();
      const excluded = new Set<string>();
      const scopeOnLine = (lineId: unknown, component: unknown) => JSON.stringify([lineId,
        asRow(component)?.basketId, asRow(component)?.subBasketId]);
      for (const raw of impact.componentChanges) {
        const row = asRow(raw);
        if (row?.component) applied.add(scopeOnLine(row.mainLineId, row.component));
      }
      for (const raw of Array.isArray(impact.excluded) ? impact.excluded : []) {
        const row = asRow(raw);
        if (row) excluded.add(scopeOnLine(row.mainLineId, row.component));
      }
      for (const [lineId, edits] of history) {
        for (const [key, edit] of edits) {
          if (edit.tier !== scope.tier || edit.mode !== "in_house") continue;
          const component = scopeOnLine(lineId, edit.component);
          if (applied.has(component) || (!excluded.has(component) && !excluded.has(scopeOnLine(lineId, undefined)) && samePairs(edit.ranges, ranges))) {
            edits.delete(key);
          }
        }
      }
      continue;
    }
    const key = marginScopeKey(scope);
    const patched = new Set(Array.isArray(impact.affected) ? impact.affected.map(line => asRow(line)?.mainLineId) : []);
    for (const [lineId, edits] of history) {
      const pending = edits.get(key);
      if (pending && (patched.has(lineId) || samePairs(pending.ranges, ranges))) edits.delete(key);
    }
  }
}

/** Called only for pre-feature Main Lines. Reconstruct provable edits from indexed, scoped history without writing on read. */
export async function loadPendingMarginEdits(lines: SubBasketMarginLine[], owner: MarginComponent, session: ClientSession): Promise<void> {
  const legacy = lines.filter(entry => {
    entry.pending = Array.isArray(entry.line.pendingMarginEdits) ? entry.line.pendingMarginEdits as PendingMarginEdit[] : [];
    return entry.line.pendingMarginEdits === undefined && entry.section && entry.revision;
  });
  if (!legacy.length) return;
  const history: History = new Map(legacy.map(({ line }) => [String(line._id), new Map()]));
  const ancestry = new Map(legacy.map(({ revision }) => [String(revision!._id), String(revision!.mainLineId)]));
  const advancedSectionIds = legacy.map(({ section }) => String(section!._id));
  if (legacy.some(({ revision }) => revision?.sourceRevisionId)) {
    const revisions = await AiEstimatorKnowledgeRevisionModel.find({ mainLineId: { $in: [...history.keys()] } })
      .select({ sourceRevisionId: 1, mainLineId: 1 }).session(session).lean().exec() as Row[];
    const byId = new Map(revisions.map(row => [String(row._id), row]));
    const ancestors: string[] = [];
    for (const { revision, line } of legacy) {
      let parent = revision?.sourceRevisionId;
      while (typeof parent === "string" && !ancestry.has(parent)) {
        const record = byId.get(parent);
        if (!record || record.mainLineId !== line._id) break;
        ancestry.set(parent, String(line._id));
        ancestors.push(parent);
        parent = record.sourceRevisionId;
      }
    }
    if (ancestors.length) {
      const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: ancestors }, sectionKey: "advanced" })
        .select({ _id: 1 }).session(session).lean().exec();
      advancedSectionIds.push(...sections.map(row => String(row._id)));
    }
  }
  const events = await AuditEventModel.find({ $or: [
    { entityType: "ai_estimator_knowledge_section", entityId: { $in: advancedSectionIds }, action: "ai_estimator_knowledge_section_updated",
      $or: [{ "newValues.manualMarginChanges": { $exists: true } }, { "newValues.marginDefaults": { $exists: true } }] },
    { entityType: "ai_estimator_knowledge_sub_basket", entityId: owner.subBasketId,
      action: { $in: ["ai_estimator_knowledge_sub_basket_margins_updated", "ai_estimator_knowledge_sub_basket_margin_exception_approved"] } }
  ] }).select({ action: 1, entityType: 1, actorId: 1, oldValues: 1, newValues: 1, occurredAt: 1 })
    .sort({ occurredAt: 1 }).session(session).lean().exec() as Row[];
  // Section versions order equal-timestamp edits. A tied approval closes ambiguous evidence.
  events.sort((a, b) => Number(a.occurredAt) - Number(b.occurredAt)
    || Number(a.entityType === "ai_estimator_knowledge_sub_basket") - Number(b.entityType === "ai_estimator_knowledge_sub_basket")
    || Number(asRow(a.newValues)?.aggregateVersion ?? 0) - Number(asRow(b.newValues)?.aggregateVersion ?? 0));
  for (const event of events) {
    if (event.entityType === "ai_estimator_knowledge_section") {
      const old = asRow(event.oldValues);
      if (old && ancestry.get(String(old.revisionId)) === old.mainLineId) applySectionAudit(history, event, owner);
    } else applyDecisionAudit(history, asRow(event.newValues));
  }
  for (const entry of legacy) entry.pending = [...history.get(String(entry.line._id))!.values()];
}
