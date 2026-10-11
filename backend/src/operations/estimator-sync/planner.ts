import { assertSnapshotDigest, clone, hash, opaqueReference, safeInteger } from "./canonical.js";
import type { BaselineEntry, InitializationReview, PlannedWrite, SyncConflict, SyncDocument, SyncPlan, SyncSnapshot, SyncState } from "./contracts.js";
import { SyncError } from "./contracts.js";
import { isSyncCollection, REQUIRED_SOURCE_COLLECTIONS, SEQUENCE_COLLECTION, SYNC_COLLECTIONS, SYNC_LIMITS, type SyncCollection } from "./manifest.js";
import { validatePlannedIntegrity } from "./integrity.js";
import { assertPlanSize, readState } from "./metadata.js";

const key = (collection: string, id: string) => JSON.stringify([collection, id]);
function snapshotRows(snapshot: SyncSnapshot): Map<string, SyncDocument> {
  const result = new Map<string, SyncDocument>();
  if (snapshot.collections.length !== SYNC_COLLECTIONS.length || new Set(snapshot.collections.map(row => row.name)).size !== SYNC_COLLECTIONS.length) throw new SyncError("SNAPSHOT_COLLECTIONS_INVALID");
  for (const collection of snapshot.collections) {
    if (!isSyncCollection(collection.name) || !Array.isArray(collection.documents) || (!collection.exists && collection.documents.length)) throw new SyncError("SNAPSHOT_COLLECTIONS_INVALID");
    for (const document of collection.documents) {
      if (!document || typeof document._id !== "string" || !document._id || result.has(key(collection.name, document._id))) throw new SyncError("SNAPSHOT_DOCUMENT_INVALID");
      result.set(key(collection.name, document._id), document);
    }
  }
  return result;
}

function graphIdentity(document: SyncDocument | undefined): Pick<BaselineEntry, "mainLineId" | "revisionId" | "basketId"> {
  if (!document) return {};
  return Object.fromEntries(["mainLineId", "revisionId", "basketId"].flatMap(field => typeof document[field] === "string" ? [[field, document[field]]] : []));
}

function sequenceMaximum(id: string, documents: Map<string, SyncDocument>): number {
  const masters: Record<string, SyncCollection> = { uoms: "aiEstimatorKnowledgeUoms", vendors: "aiEstimatorKnowledgeVendors", taxes: "aiEstimatorKnowledgeTaxRules", priorities: "aiEstimatorKnowledgePriorities", surfaces: "aiEstimatorKnowledgeSurfaces", modes: "aiEstimatorKnowledgeModes" };
  let maximum = 0;
  for (const [recordKey, document] of documents) {
    const [collection] = JSON.parse(recordKey) as [SyncCollection, string];
    const matches = id === "baskets" ? collection === "aiEstimatorKnowledgeBaskets" : id.startsWith("main-lines:") ? collection === "aiEstimatorKnowledgeMainLines" && document.basketId === id.slice(11) : id.startsWith("sub-baskets:") ? collection === "aiEstimatorKnowledgeSubBaskets" && document.basketId === id.slice(12) : collection === masters[id.slice(8)] && id.startsWith("masters:");
    if (matches) maximum = Math.max(maximum, safeInteger(document.displayOrder) ?? 0);
  }
  return maximum;
}

/** Business writes are candidates only; any conflict prevents application of the entire plan. */
export function buildSyncPlan(input: { source: SyncSnapshot; target: SyncSnapshot; initialization?: InitializationReview }): SyncPlan {
  const { source, target, initialization } = input;
  assertSnapshotDigest(source);
  assertSnapshotDigest(target);
  if (![source.identity, target.identity].every(value => /^[a-f0-9]{64}$/u.test(value))) throw new SyncError("SNAPSHOT_IDENTITY_INVALID");
  if (source.role !== "source" || target.role !== "target") throw new SyncError("SNAPSHOT_ROLE_INVALID");
  const sourceRows = snapshotRows(source);
  const targetRows = snapshotRows(target);
  if (REQUIRED_SOURCE_COLLECTIONS.some(name => !source.collections.find(row => row.name === name)?.exists)) throw new SyncError("SOURCE_REQUIRED_COLLECTION_MISSING");
  if (!sourceRows.size) throw new SyncError("SOURCE_UNEXPECTEDLY_EMPTY");
  const baseline = readState(target);
  if (baseline && baseline.sourceIdentity !== source.identity) throw new SyncError("BASELINE_SOURCE_MISMATCH");
  if (baseline && initialization) throw new SyncError("BASELINE_RESET_FORBIDDEN");
  const entries = new Map((baseline?.entries ?? []).map(row => [key(row.collection, row.id), { ...row }]));
  const observed = new Map((baseline?.observedSourceIds ?? []).map(row => [key(row.collection, row.id), row]));
  const reviewed = new Set<string>();
  const ambiguities = new Set([...sourceRows].filter(([id, document]) => !targetRows.has(id) || hash(document) !== hash(targetRows.get(id))).map(([id]) => id));
  if (initialization) {
    if (safeInteger(initialization.formatVersion) !== 1 || initialization.sourceDigest !== source.contentDigest || initialization.targetDigest !== target.contentDigest || !Array.isArray(initialization.decisions)) throw new SyncError("INITIALIZATION_REVIEW_STALE");
    for (const decision of initialization.decisions) {
      if (!decision || typeof decision !== "object" || Object.keys(decision).some(field => !["collection", "id", "action"].includes(field))) throw new SyncError("INITIALIZATION_REVIEW_INVALID");
      const id = key(decision.collection, decision.id);
      if (decision.action !== "protect" || !isSyncCollection(decision.collection) || !ambiguities.has(id) || reviewed.has(id)) throw new SyncError("INITIALIZATION_REVIEW_INVALID");
      reviewed.add(id);
    }
    if (reviewed.size !== ambiguities.size) throw new SyncError("INITIALIZATION_REVIEW_INCOMPLETE");
  }
  const conflicts: SyncConflict[] = [];
  const addConflict = (code: string, collection: SyncCollection, id: string) => conflicts.push({ code, collection, reference: opaqueReference(collection, id) });
  const writes: PlannedWrite[] = [];
  const counts: SyncPlan["counts"] = { inserted: 0, updated: 0, unchanged: 0, preservedLocal: 0, protectedDeletions: 0, initializationAmbiguities: 0 };
  const allIds = [...new Set([...sourceRows.keys(), ...targetRows.keys(), ...entries.keys()])].sort();
  for (const idKey of allIds) {
    const [collection, id] = JSON.parse(idKey) as [SyncCollection, string];
    const incoming = sourceRows.get(idKey);
    const local = targetRows.get(idKey);
    const sourceHash = incoming ? hash(incoming) : null;
    const localHash = local ? hash(local) : null;
    let entry = entries.get(idKey);
    if (!baseline) {
      if (incoming && local && sourceHash === localHash) {
        entries.set(idKey, { collection, id, sourceHash, appliedHash: localHash, protection: "none", ...graphIdentity(local) });
        counts.unchanged++;
      } else {
        if (incoming && !reviewed.has(idKey)) { counts.initializationAmbiguities++; addConflict("INITIALIZATION_AMBIGUITY", collection, id); }
        entries.set(idKey, { collection, id, sourceHash, appliedHash: localHash, protection: local ? "local" : "deleted", ...graphIdentity(local ?? incoming) });
        if (local) counts.preservedLocal++; else counts.protectedDeletions++;
      }
    } else {
      if (!entry && local) {
        entry = { collection, id, sourceHash: null, appliedHash: localHash, protection: "local", ...graphIdentity(local) };
      } else if (!entry && incoming && observed.has(idKey)) {
        // Missing metadata cannot prove this ID safe to import.
        entry = { collection, id, sourceHash: null, appliedHash: null, protection: "deleted", ...graphIdentity(incoming) };
      }
      if (entry && entry.protection === "none" && localHash !== entry.appliedHash) entry = { ...entry, protection: local ? "local" : "deleted" };
      if (entry && entry.protection !== "none") {
        // A deleted local-only record remains deleted even if its former ID appears upstream.
        if (!local) entry = { ...entry, protection: "deleted" };
        entries.set(idKey, entry);
        if (incoming && sourceHash !== entry.sourceHash && sourceHash !== localHash) addConflict("PROTECTED_LOCAL_DIVERGENCE", collection, id);
        if (local) counts.preservedLocal++; else counts.protectedDeletions++;
      } else if (!incoming) {
        if (local) counts.preservedLocal++;
      } else if (entry && sourceHash === entry.sourceHash) {
        counts.unchanged++;
      } else if (entry && localHash === sourceHash) {
        entries.set(idKey, { ...entry, sourceHash, appliedHash: localHash });
        counts.unchanged++;
      } else {
        const document = clone(incoming);
        if (local && collection !== SEQUENCE_COLLECTION && "version" in document) {
          const sourceVersion = safeInteger(document.version);
          const localVersion = safeInteger(local.version);
          if (sourceVersion === null || localVersion === null || Math.max(sourceVersion, localVersion) >= Number.MAX_SAFE_INTEGER) addConflict("VERSION_INVALID_OR_EXHAUSTED", collection, id);
          else document.version = Math.max(sourceVersion, localVersion) + 1;
        }
        if (local && ("dependencyEpoch" in document || "dependencyEpoch" in local)) {
          const sourceEpoch = safeInteger(document.dependencyEpoch ?? 0);
          const localEpoch = safeInteger(local.dependencyEpoch ?? 0);
          if (sourceEpoch === null || localEpoch === null || Math.max(sourceEpoch, localEpoch) >= Number.MAX_SAFE_INTEGER) addConflict("DEPENDENCY_EPOCH_INVALID_OR_EXHAUSTED", collection, id);
          else document.dependencyEpoch = Math.max(sourceEpoch, localEpoch) + 1;
        }
        writes.push({ collection, id, beforeHash: localHash, document });
        entries.set(idKey, { collection, id, sourceHash, appliedHash: hash(document), protection: "none", ...graphIdentity(document) });
        if (local) counts.updated++; else counts.inserted++;
      }
    }
    if (incoming) observed.set(idKey, { collection, id });
  }
  // Reconcile only eligible sequence writes. Protected counters themselves remain byte-for-byte local.
  const proposed = new Map(targetRows);
  for (const write of writes) proposed.set(key(write.collection, write.id), write.document);
  for (const write of writes.filter(row => row.collection === SEQUENCE_COLLECTION)) {
    const incoming = safeInteger(write.document.highWaterOrder);
    const local = safeInteger(targetRows.get(key(write.collection, write.id))?.highWaterOrder ?? 0);
    if (incoming === null || local === null || incoming < 0 || local < 0) addConflict("SEQUENCE_INVALID", write.collection, write.id);
    else write.document.highWaterOrder = Math.max(incoming, local, sequenceMaximum(write.id, proposed));
    const entry = entries.get(key(write.collection, write.id));
    if (entry) entry.appliedHash = hash(write.document);
  }
  const integrity = validatePlannedIntegrity(source, target, writes, [...entries.values()].filter(row => row.protection !== "none"));
  conflicts.push(...integrity.conflicts);
  const orderedEntries = [...entries.values()].sort((a, b) => key(a.collection, a.id).localeCompare(key(b.collection, b.id)));
  const orderedObserved = [...observed.values()].sort((a, b) => key(a.collection, a.id).localeCompare(key(b.collection, b.id)));
  const changed = !baseline || hash(orderedEntries) !== hash([...baseline.entries].sort((a, b) => key(a.collection, a.id).localeCompare(key(b.collection, b.id)))) || hash(orderedObserved) !== hash([...baseline.observedSourceIds].sort((a, b) => key(a.collection, a.id).localeCompare(key(b.collection, b.id))));
  if (changed && baseline?.generation === Number.MAX_SAFE_INTEGER) throw new SyncError("BASELINE_GENERATION_EXHAUSTED");
  const nextState: SyncState = { _id: "baseline", formatVersion: 1, sourceIdentity: source.identity, generation: (baseline?.generation ?? 0) + (changed ? 1 : 0), lastPlanDigest: baseline?.lastPlanDigest ?? "", entries: orderedEntries, observedSourceIds: orderedObserved };
  const uniqueConflicts = [...new Map(conflicts.map(row => [hash(row), row])).values()];
  const plan: SyncPlan = { formatVersion: 1, sourceDigest: source.contentDigest, targetDigest: target.contentDigest, sourceIdentity: source.identity, writes, nextState, warnings: integrity.warnings.slice(0, SYNC_LIMITS.maxConflicts), conflicts: uniqueConflicts.slice(0, SYNC_LIMITS.maxConflicts), additionalConflictCount: Math.max(0, uniqueConflicts.length - SYNC_LIMITS.maxConflicts), counts, digest: "" };
  plan.digest = hash({ ...plan, digest: undefined, nextState: { ...nextState, lastPlanDigest: "" } });
  if (changed) nextState.lastPlanDigest = plan.digest;
  assertPlanSize(plan);
  return plan;
}
