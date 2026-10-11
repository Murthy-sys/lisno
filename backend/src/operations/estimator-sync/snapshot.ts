import { mongo } from "mongoose";
import { hash, safeInteger, snapshotDigest } from "./canonical.js";
import { SyncError, type CollectionSnapshot, type SyncDocument, type SyncSnapshot } from "./contracts.js";
import { REQUIRED_SOURCE_COLLECTIONS, SYNC_COLLECTIONS, SYNC_LIMITS, SYNC_METADATA_COLLECTIONS } from "./manifest.js";

const BSON_OPTIONS = { promoteValues: false, promoteLongs: false, promoteBuffers: false, bsonRegExp: true } as const;
const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

interface SnapshotOptions {
  role: "source" | "target";
  identity: string;
  session?: mongo.ClientSession;
  storageReferencesToCheck?: string[];
  storageExists?: (reference: string) => Promise<boolean>;
}

type Catalogue = Map<string, Omit<CollectionSnapshot, "documents">>;

function catalogueDigest(catalogue: Catalogue): string {
  return hash([...catalogue.values()].map(row => ({
    ...row,
    // Compound index field order is meaningful, unlike document property order.
    indexes: row.indexes.map(index => ({ ...index, key: Object.entries(index.key) }))
  })));
}

/** Native, write-free scanner. All document reads share one database snapshot. */
export async function readDatabaseSnapshot(
  client: mongo.MongoClient,
  databaseName: string,
  options: SnapshotOptions
): Promise<SyncSnapshot> {
  let ownedSession: mongo.ClientSession | undefined;
  try {
    if (!databaseName || !options.identity || !["source", "target"].includes(options.role)) throw new SyncError("SNAPSHOT_INVALID_OPTIONS");
    if (options.session && !options.session.inTransaction()) throw new SyncError("SNAPSHOT_TRANSACTION_REQUIRED");
    const beganAt = Date.now();
    let bytes = 0;
    let count = 0;
    const checkLimit = (value?: mongo.Document, document = false) => {
      if (value) bytes += mongo.BSON.calculateObjectSize(value);
      if (document) count += 1;
      if (bytes > SYNC_LIMITS.maxBytes || count > SYNC_LIMITS.maxDocuments) throw new SyncError("SNAPSHOT_RESOURCE_LIMIT");
      if (Date.now() - beganAt > SYNC_LIMITS.maxTimeMS) throw new SyncError("SNAPSHOT_TIME_LIMIT");
    };
    const db = client.db(databaseName);
    const hello = await db.admin().command({ hello: 1, maxTimeMS: SYNC_LIMITS.maxTimeMS });
    if ((!hello.setName && hello.msg !== "isdbgrid") || (safeInteger(hello.maxWireVersion) ?? 0) < 13) {
      throw new SyncError("SNAPSHOT_CONSISTENCY_UNSUPPORTED");
    }
    const names: string[] = [...SYNC_COLLECTIONS, ...(options.role === "target" ? [...SYNC_METADATA_COLLECTIONS, "users"] : [])];
    const readCatalogue = async (): Promise<Catalogue> => {
      checkLimit();
      let catalogueBytes = 0;
      const collect = async <T extends mongo.Document>(cursor: AsyncIterable<T> & { close: () => Promise<void> }, maximum: number): Promise<T[]> => {
        const rows: T[] = [];
        try {
          for await (const row of cursor) {
            checkLimit();
            catalogueBytes += mongo.BSON.calculateObjectSize(row);
            if (catalogueBytes > SYNC_LIMITS.maxBytes || rows.length >= maximum) throw new SyncError("SNAPSHOT_RESOURCE_LIMIT");
            rows.push(row);
          }
        } finally { await cursor.close(); }
        return rows;
      };
      // Catalogue commands are deliberately outside transaction/snapshot sessions.
      const entries = await collect(db.listCollections({ name: { $in: names } }, {
        nameOnly: false, authorizedCollections: false, batchSize: 1, maxTimeMS: SYNC_LIMITS.maxTimeMS, ...BSON_OPTIONS
      }), names.length);
      const byName = new Map(entries.map(entry => [entry.name, entry]));
      if (byName.size !== entries.length || entries.some(entry => !names.includes(entry.name))) throw new SyncError("SNAPSHOT_INVALID_CATALOGUE");
      const result: Catalogue = new Map();
      for (const name of names) {
        checkLimit();
        const entry = byName.get(name);
        if (!entry) {
          result.set(name, { name, exists: false, uuid: null, options: {}, indexes: [] });
          continue;
        }
        if (entry.type !== "collection" || !("info" in entry) || !entry.info?.uuid) throw new SyncError("SNAPSHOT_UNSUPPORTED_COLLECTION");
        const indexes = await collect(db.collection(name).listIndexes({ maxTimeMS: SYNC_LIMITS.maxTimeMS, ...BSON_OPTIONS }), 64);
        if (indexes.some(index => typeof index.name !== "string" || !index.key || typeof index.key !== "object")) throw new SyncError("SNAPSHOT_INVALID_INDEX");
        indexes.sort((left, right) => compareText(left.name, right.name));
        result.set(name, { name, exists: true, uuid: entry.info.uuid, options: entry.options ?? {}, indexes });
      }
      return result;
    };
    const before = await readCatalogue();
    for (const row of before.values()) checkLimit(row);
    if (options.role === "source" && REQUIRED_SOURCE_COLLECTIONS.some(name => !before.get(name)?.exists)) throw new SyncError("SNAPSHOT_SOURCE_COLLECTION_MISSING");
    const session = options.session ?? (ownedSession = client.startSession({ snapshot: true, causalConsistency: false }));
    const scan = async (name: string, idsOnly = false): Promise<CollectionSnapshot> => {
      const catalogue = before.get(name)!;
      const documents: SyncDocument[] = [];
      // Read absent namespaces too: a collection appearing after the catalogue read
      // must never be mistaken for an intentionally empty optional collection.
      const cursor = db.collection<SyncDocument>(name).find({}, {
        session, ...BSON_OPTIONS, maxTimeMS: SYNC_LIMITS.maxTimeMS,
        sort: { _id: 1 }, collation: { locale: "simple" }, limit: SYNC_LIMITS.maxDocuments + 1,
        ...(idsOnly ? { projection: { _id: 1 } } : {})
      });
      try {
        for await (const document of cursor) {
          checkLimit(document, true);
          if (typeof document._id !== "string" || !document._id || document._id.includes("\0")) throw new SyncError("SNAPSHOT_INVALID_ID");
          if (documents.length && Buffer.compare(Buffer.from(documents[documents.length - 1]._id), Buffer.from(document._id)) >= 0) throw new SyncError("SNAPSHOT_INVALID_ORDER");
          documents.push(document);
        }
      } finally {
        await cursor.close();
      }
      if (!catalogue.exists && documents.length) throw new SyncError("SNAPSHOT_CATALOGUE_CHANGED");
      return { ...catalogue, documents };
    };
    const collections: CollectionSnapshot[] = [];
    for (const name of SYNC_COLLECTIONS) collections.push(await scan(name));
    if (options.role === "source" && !collections.some(row => row.documents.length > 0)) throw new SyncError("SNAPSHOT_SOURCE_EMPTY");
    const metadataCollections: CollectionSnapshot[] = [];
    const actorIds: string[] = [];
    const availableStorageReferences: string[] = [];
    if (options.role === "target") {
      for (const name of SYNC_METADATA_COLLECTIONS) metadataCollections.push(await scan(name));
      actorIds.push(...(await scan("users", true)).documents.map(document => document._id));
      const references = new Set(options.storageReferencesToCheck ?? []);
      const vendors = collections.find(row => row.name === "aiEstimatorKnowledgeVendors")!;
      for (const vendor of vendors.documents) {
        for (const field of ["geoTaggedPicture", "msmeCertificate"]) {
          const reference = vendor[field]?.storageReference;
          if (typeof reference === "string") references.add(reference);
        }
      }
      if (references.size > SYNC_LIMITS.maxDocuments) throw new SyncError("SNAPSHOT_RESOURCE_LIMIT");
      for (const reference of [...references].sort(compareText)) {
        checkLimit();
        if (typeof reference !== "string" || !reference || reference.length > 4096 || reference.includes("\0")) throw new SyncError("SNAPSHOT_INVALID_STORAGE_REFERENCE");
        if (options.storageExists && await options.storageExists(reference)) availableStorageReferences.push(reference);
      }
    }
    if (catalogueDigest(before) !== catalogueDigest(await readCatalogue())) throw new SyncError("SNAPSHOT_CATALOGUE_CHANGED");
    const snapshot: SyncSnapshot = {
      formatVersion: 1, role: options.role, identity: options.identity, databaseName,
      collections, metadataCollections, dependencies: { actorIds, availableStorageReferences }, contentDigest: ""
    };
    if (mongo.BSON.calculateObjectSize(snapshot) > SYNC_LIMITS.maxBytes) throw new SyncError("SNAPSHOT_RESOURCE_LIMIT");
    snapshot.contentDigest = snapshotDigest(snapshot);
    return snapshot;
  } catch (error) {
    if (error instanceof SyncError) throw error;
    // Driver errors can contain connection strings or user document values.
    throw new SyncError("SNAPSHOT_READ_FAILED");
  } finally {
    if (ownedSession) {
      try { await ownedSession.endSession(); }
      catch { throw new SyncError("SNAPSHOT_SESSION_CLOSE_FAILED"); }
    }
  }
}
