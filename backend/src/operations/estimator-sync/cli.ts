import { constants } from "node:fs";
import { open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mongo } from "mongoose";
import { parse } from "dotenv";
import { createLocalStorage } from "../../storage/local-storage.js";
import { connectionIdentity, createTargetClient } from "./authority.js";
import { applySyncPlan, sourceStorageReferences } from "./apply.js";
import { hash } from "./canonical.js";
import { SyncError, type InitializationReview, type SyncPlan, type SyncSnapshot } from "./contracts.js";
import { MAINTENANCE_CONFIRMATION, SYNC_LIMITS } from "./manifest.js";
import { buildSyncPlan } from "./planner.js";
import { readDatabaseSnapshot } from "./snapshot.js";
import { readState } from "./metadata.js";

export interface SyncArguments {
  apply: boolean;
  planDigest?: string;
  initializationPath?: string;
  writeInitializationPath?: string;
  backupRoot?: string;
  maintenance?: string;
}

export function parseArguments(args: string[]): SyncArguments {
  const result: SyncArguments = {apply: false};
  const seen = new Set<string>();
  const fields = new Map<string, keyof Omit<SyncArguments, "apply">>([
    ["--plan-digest", "planDigest"], ["--initialization", "initializationPath"],
    ["--write-initialization", "writeInitializationPath"], ["--backup-root", "backupRoot"],
    ["--maintenance-confirmation", "maintenance"]
  ]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new SyncError("INVALID_ARGUMENTS");
    seen.add(flag);
    if (flag === "--apply") result.apply = true;
    else if (flag !== "--dry-run") {
      const field = fields.get(flag), value = args[++index];
      if (!field || !value || value.startsWith("--")) throw new SyncError("INVALID_ARGUMENTS");
      result[field] = value;
    }
  }
  if ((result.apply && seen.has("--dry-run")) || (result.initializationPath && result.writeInitializationPath) ||
    (result.planDigest !== undefined && !/^[a-f0-9]{64}$/.test(result.planDigest)) ||
    (result.apply && (!result.planDigest || !result.backupRoot || result.maintenance !== MAINTENANCE_CONFIRMATION || result.writeInitializationPath)) ||
    (!result.apply && (result.backupRoot || result.maintenance || result.planDigest))) throw new SyncError("INVALID_ARGUMENTS");
  return result;
}

/** A private, snapshot-bound review file can only protect ambiguous records. */
export function initializationTemplate(source: SyncSnapshot, target: SyncSnapshot): InitializationReview {
  const decisions: InitializationReview["decisions"] = [];
  for (const collection of source.collections) {
    const local = new Map(target.collections.find(row => row.name === collection.name)?.documents.map(row => [row._id, row]) ?? []);
    for (const row of collection.documents) {
      if (!local.has(row._id) || hash(local.get(row._id)) !== hash(row)) decisions.push({collection: collection.name as InitializationReview["decisions"][number]["collection"], id: row._id, action: "protect"});
    }
  }
  return {formatVersion: 1, sourceDigest: source.contentDigest, targetDigest: target.contentDigest, decisions};
}

export function safePlanReport(plan: SyncPlan): Record<string, unknown> {
  return {status: "preview", planDigest: plan.digest, ready: !plan.conflicts.length && !plan.additionalConflictCount,
    counts: plan.counts, conflicts: plan.conflicts, warnings: plan.warnings,
    additionalConflictCount: plan.additionalConflictCount, policy: "local-additions-edits-and-deletions-preserved"};
}

async function readInitialization(file: string): Promise<InitializationReview> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > SYNC_LIMITS.maxWriteBytes) throw new SyncError("INITIALIZATION_TOO_LARGE");
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const {bytesRead} = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new SyncError("INITIALIZATION_READ_FAILED");
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new SyncError("INITIALIZATION_READ_FAILED");
    return JSON.parse(bytes.toString("utf8")) as InitializationReview;
  } finally { await handle.close(); }
}

export async function runSyncCommand(args: string[], environment: NodeJS.ProcessEnv = process.env): Promise<{report: Record<string, unknown>; exitCode: number}> {
  let sourceClient: mongo.MongoClient | undefined;
  let targetClient: mongo.MongoClient | undefined;
  try {
    const options = parseArguments(args);
    const backendRoot = fileURLToPath(new URL("../../..", import.meta.url));
    let local: Record<string, string> = {};
    try { local = parse(await readFile(path.join(backendRoot, ".env"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new SyncError("LOCAL_CONFIGURATION_UNREADABLE"); }
    const sourceUri = environment.LISNO_SYNC_SOURCE_URI;
    if (!sourceUri) throw new SyncError("SOURCE_CREDENTIAL_MISSING");
    const targetUri = environment.LISNO_SYNC_TARGET_URI ?? local.MONGODB_URI ?? "mongodb://127.0.0.1:27017/lisno_demo";
    const sourceIdentity = connectionIdentity(sourceUri), targetIdentity = connectionIdentity(targetUri);
    if (sourceIdentity === targetIdentity) throw new SyncError("SOURCE_TARGET_MATCH");
    targetClient = createTargetClient(targetUri);
    sourceClient = new mongo.MongoClient(sourceUri, {readPreference: "primary", appName: "lisno-estimator-sync-read-only", serverSelectionTimeoutMS: 10_000});
    if (!sourceClient.options.dbName || sourceClient.options.dbName === "test") throw new SyncError("SOURCE_DATABASE_REQUIRED");
    if (sourceClient.options.dbName === "lisno_demo") throw new SyncError("SOURCE_TARGET_MATCH");
    await sourceClient.connect();
    await targetClient.connect();
    const source = await readDatabaseSnapshot(sourceClient, sourceClient.options.dbName, {role: "source", identity: sourceIdentity});
    const storage = createLocalStorage(path.resolve(backendRoot, environment.UPLOADS_DIR ?? local.UPLOADS_DIR ?? "uploads"));
    const storageExists = async (reference: string) => {
      try { const stream = await storage.open(reference); stream.on("error", () => {}); stream.destroy(); return true; }
      catch { return false; }
    };
    const target = await readDatabaseSnapshot(targetClient, "lisno_demo", {role: "target", identity: targetIdentity,
      storageReferencesToCheck: sourceStorageReferences(source), storageExists});
    let initialization: InitializationReview | undefined;
    if (options.initializationPath) {
      initialization = await readInitialization(options.initializationPath);
    }
    const plan = buildSyncPlan({source, target, initialization});
    if (options.writeInitializationPath) {
      if (readState(target)) throw new SyncError("BASELINE_RESET_FORBIDDEN");
      await writeFile(options.writeInitializationPath, JSON.stringify(initializationTemplate(source, target), null, 2) + "\n", {flag: "wx", mode: 0o600});
    }
    if (!options.apply) return {report: safePlanReport(plan), exitCode: plan.conflicts.length || plan.additionalConflictCount ? 2 : 0};
    if (options.planDigest !== plan.digest) throw new SyncError("PLAN_CHANGED");
    const result = await applySyncPlan({client: targetClient, source, target, plan, initialization,
      backupRoot: options.backupRoot!, maintenanceConfirmation: options.maintenance!, storageExists});
    return {report: {status: result.status, planDigest: result.planDigest, written: result.written,
      backupDirectory: result.backup?.directory ?? null}, exitCode: 0};
  } catch (error) {
    return {report: {status: "failed", code: error instanceof SyncError ? error.code : "SYNC_FAILED"}, exitCode: 1};
  } finally {
    await sourceClient?.close().catch(() => {});
    await targetClient?.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runSyncCommand(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result.report) + "\n");
  process.exitCode = result.exitCode;
}
