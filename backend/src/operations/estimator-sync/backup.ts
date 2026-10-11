import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { mongo } from "mongoose";
import { assertSnapshotDigest, safeInteger } from "./canonical.js";
import { SyncError, type SyncSnapshot, type VerifiedBackup } from "./contracts.js";
import { SYNC_COLLECTIONS, SYNC_LIMITS, SYNC_METADATA_COLLECTIONS } from "./manifest.js";

const PAYLOAD = "snapshot.bson";
const MANIFEST = "manifest.json";
const DIGEST = /^[a-f0-9]{64}$/u;
const bytesDigest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function fail(): never { throw new SyncError("BACKUP_INVALID"); }
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

interface BackupManifest {
  formatVersion: 1;
  payload: typeof PAYLOAD;
  payloadBytes: number;
  payloadSha256: string;
  targetSnapshotDigest: string;
  collections: string[];
  metadataCollections: string[];
  collectionCount: number;
  documentCount: number;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) fail();
}

function validateSnapshot(value: unknown): asserts value is SyncSnapshot {
  if (!isRecord(value)) fail();
  exactKeys(value, ["formatVersion", "role", "identity", "databaseName", "collections", "metadataCollections", "dependencies", "contentDigest"]);
  if (value.formatVersion !== 1 || value.role !== "target" || typeof value.identity !== "string" || !value.identity || typeof value.databaseName !== "string" || !value.databaseName || typeof value.contentDigest !== "string" || !DIGEST.test(value.contentDigest)) fail();
  let documentCount = 0;
  const checkCollections = (rows: unknown, names: readonly string[]) => {
    if (!Array.isArray(rows) || rows.length !== names.length) fail();
    for (const [position, row] of (rows as unknown[]).entries()) {
      if (!isRecord(row)) fail();
      exactKeys(row, ["name", "exists", "uuid", "options", "indexes", "documents"]);
      if (row.name !== names[position] || typeof row.exists !== "boolean" || !isRecord(row.options) || !Array.isArray(row.indexes) || !Array.isArray(row.documents)) fail();
      const indexes = row.indexes as unknown[];
      const documents = row.documents as unknown[];
      if (!row.exists && (row.uuid !== null || Object.keys(row.options as object).length || indexes.length || documents.length)) fail();
      if (row.exists && (row.uuid === null || row.uuid === undefined)) fail();
      const indexNames = new Set<string>();
      for (const index of indexes) {
        if (!isRecord(index) || typeof index.name !== "string" || !isRecord(index.key) || Object.keys(index.key).length === 0 || indexNames.has(index.name)) fail();
        indexNames.add(index.name as string);
      }
      const ids = new Set<string>();
      for (const document of documents) {
        if (!isRecord(document) || typeof document._id !== "string" || !document._id || document._id.includes("\0") || ids.has(document._id)) fail();
        ids.add(document._id as string);
        documentCount += 1;
        if (documentCount > SYNC_LIMITS.maxDocuments) throw new SyncError("BACKUP_RESOURCE_LIMIT");
      }
    }
  };
  checkCollections(value.collections, SYNC_COLLECTIONS);
  checkCollections(value.metadataCollections, SYNC_METADATA_COLLECTIONS);
  if (!isRecord(value.dependencies)) fail();
  exactKeys(value.dependencies, ["actorIds", "availableStorageReferences"]);
  for (const name of ["actorIds", "availableStorageReferences"]) {
    const items = value.dependencies[name];
    if (!Array.isArray(items) || items.length > SYNC_LIMITS.maxDocuments || items.some(item => typeof item !== "string" || !item || item.includes("\0")) || new Set(items).size !== items.length) fail();
  }
  assertSnapshotDigest(value as unknown as SyncSnapshot);
}

/** Reject traversal and symbolic links, including symlinked ancestors. */
async function checkedPath(input: string, allowMissingFinal = false): Promise<string> {
  if (!path.isAbsolute(input) || input.includes("\0") || input.split(path.sep).some(part => part === ".." || part === ".")) throw new SyncError("BACKUP_UNSAFE_PATH");
  const normalized = path.normalize(input);
  let current = path.parse(normalized).root;
  const pieces = normalized.slice(current.length).split(path.sep).filter(Boolean);
  for (const [index, piece] of pieces.entries()) {
    current = path.join(current, piece);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new SyncError("BACKUP_UNSAFE_PATH");
    } catch (error) {
      if (allowMissingFinal && index === pieces.length - 1 && (error as NodeJS.ErrnoException).code === "ENOENT") return normalized;
      throw error;
    }
  }
  if (await realpath(normalized) !== normalized) throw new SyncError("BACKUP_UNSAFE_PATH");
  return normalized;
}

function privateOwner(stat: { uid: number; mode: number }): boolean {
  return (process.getuid === undefined || stat.uid === process.getuid()) && (stat.mode & 0o077) === 0;
}

async function checkedPrivateDirectory(directory: string): Promise<string> {
  const resolved = await checkedPath(directory);
  if (!privateOwner(await lstat(resolved))) throw new SyncError("BACKUP_INSECURE_PERMISSIONS");
  return resolved;
}

async function readPrivateFile(file: string, maximum: number): Promise<Buffer> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || !privateOwner(before) || before.nlink !== 1) throw new SyncError("BACKUP_UNSAFE_FILE");
    if (before.size < 1 || before.size > maximum) throw new SyncError("BACKUP_RESOURCE_LIMIT");
    const bytes = Buffer.alloc(before.size);
    let position = 0;
    while (position < bytes.length) {
      const read = await handle.read(bytes, position, bytes.length - position, position);
      if (!read.bytesRead) fail();
      position += read.bytesRead;
    }
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail();
    return bytes;
  } finally {
    await handle.close();
  }
}

async function writePrivateFile(file: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

const counts = (snapshot: SyncSnapshot) => {
  const rows = [...snapshot.collections, ...snapshot.metadataCollections];
  return { collectionCount: rows.filter(row => row.exists).length, documentCount: rows.reduce((sum, row) => sum + row.documents.length, 0) };
};

async function readBackup(directory: string, expectedDigest?: string): Promise<{ snapshot: SyncSnapshot; verified: VerifiedBackup }> {
  const resolved = await checkedPrivateDirectory(directory);
  const files = (await readdir(resolved)).sort();
  if (files.length !== 2 || files[0] !== MANIFEST || files[1] !== PAYLOAD) fail();
  const manifestBytes = await readPrivateFile(path.join(resolved, MANIFEST), 8192);
  const manifest: unknown = JSON.parse(manifestBytes.toString("utf8"));
  if (!isRecord(manifest)) fail();
  exactKeys(manifest, ["formatVersion", "payload", "payloadBytes", "payloadSha256", "targetSnapshotDigest", "collections", "metadataCollections", "collectionCount", "documentCount"]);
  if (manifest.formatVersion !== 1 || manifest.payload !== PAYLOAD || !Number.isSafeInteger(manifest.payloadBytes) || (manifest.payloadBytes as number) < 1 || (manifest.payloadBytes as number) > SYNC_LIMITS.maxBytes || typeof manifest.payloadSha256 !== "string" || !DIGEST.test(manifest.payloadSha256) || typeof manifest.targetSnapshotDigest !== "string" || !DIGEST.test(manifest.targetSnapshotDigest)) fail();
  if (JSON.stringify(manifest.collections) !== JSON.stringify(SYNC_COLLECTIONS) || JSON.stringify(manifest.metadataCollections) !== JSON.stringify(SYNC_METADATA_COLLECTIONS)) fail();
  if (expectedDigest !== undefined && (!DIGEST.test(expectedDigest) || manifest.targetSnapshotDigest !== expectedDigest)) throw new SyncError("BACKUP_TARGET_MISMATCH");
  const payload = await readPrivateFile(path.join(resolved, PAYLOAD), SYNC_LIMITS.maxBytes);
  if (payload.length !== manifest.payloadBytes || bytesDigest(payload) !== manifest.payloadSha256) fail();
  const decoded = mongo.BSON.deserialize(payload, { promoteValues: false, promoteLongs: false, promoteBuffers: false, bsonRegExp: true });
  // The container version is structural. Preserve all document, option, UUID,
  // and index BSON values exactly as read, including compound index key order.
  decoded.formatVersion = safeInteger(decoded.formatVersion);
  validateSnapshot(decoded);
  const measured = counts(decoded);
  if (decoded.contentDigest !== manifest.targetSnapshotDigest || measured.collectionCount !== manifest.collectionCount || measured.documentCount !== manifest.documentCount) fail();
  return {
    snapshot: decoded,
    verified: { directory: resolved, manifestDigest: bytesDigest(manifestBytes), targetSnapshotDigest: decoded.contentDigest, ...measured }
  };
}

function safeBackupError(error: unknown): never {
  if (error instanceof SyncError) throw error;
  throw new SyncError("BACKUP_IO_FAILED");
}

/** Back up only an exact, validated target snapshot; never overwrite a prior run. */
export async function writeTargetBackup(snapshot: SyncSnapshot, privateRoot: string): Promise<VerifiedBackup> {
  try {
    validateSnapshot(snapshot);
    const payload = mongo.BSON.serialize(snapshot);
    if (payload.length > SYNC_LIMITS.maxBytes) throw new SyncError("BACKUP_RESOURCE_LIMIT");
    const root = await checkedPath(privateRoot, true);
    await mkdir(root, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
    await checkedPrivateDirectory(root);
    const directory = await mkdtemp(path.join(root, "estimator-target-"));
    const manifest: BackupManifest = {
      formatVersion: 1, payload: PAYLOAD, payloadBytes: payload.length, payloadSha256: bytesDigest(payload),
      targetSnapshotDigest: snapshot.contentDigest, collections: [...SYNC_COLLECTIONS], metadataCollections: [...SYNC_METADATA_COLLECTIONS], ...counts(snapshot)
    };
    await writePrivateFile(path.join(directory, PAYLOAD), payload);
    // Writing the manifest last ensures an incomplete backup never verifies.
    await writePrivateFile(path.join(directory, MANIFEST), Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8"));
    const directoryHandle = await open(directory, constants.O_RDONLY);
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    return (await readBackup(directory, snapshot.contentDigest)).verified;
  } catch (error) { return safeBackupError(error); }
}

export async function verifyTargetBackup(directory: string, expectedTargetSnapshotDigest: string): Promise<VerifiedBackup> {
  try { return (await readBackup(directory, expectedTargetSnapshotDigest)).verified; }
  catch (error) { return safeBackupError(error); }
}

export async function readVerifiedTargetBackup(directory: string): Promise<SyncSnapshot> {
  try { return (await readBackup(directory)).snapshot; }
  catch (error) { return safeBackupError(error); }
}
