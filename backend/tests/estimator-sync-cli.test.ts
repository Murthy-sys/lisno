import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lstat, mkdtemp, open, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mongo } from "mongoose";
import { initializationTemplate, parseArguments, runSyncCommand, safePlanReport } from "../src/operations/estimator-sync/cli.js";
import * as applyModule from "../src/operations/estimator-sync/apply.js";
import * as snapshotModule from "../src/operations/estimator-sync/snapshot.js";
import { hash, snapshotDigest } from "../src/operations/estimator-sync/canonical.js";
import { buildSyncPlan } from "../src/operations/estimator-sync/planner.js";
import type { SyncDocument, SyncSnapshot } from "../src/operations/estimator-sync/contracts.js";
import { MAINTENANCE_CONFIRMATION, STATE_COLLECTION, SYNC_COLLECTIONS, SYNC_LIMITS, SYNC_METADATA_COLLECTIONS } from "../src/operations/estimator-sync/manifest.js";

// The CLI loads a repository-local .env. Synthetic tests must neither inspect it
// nor connect to any user database; all database boundaries are intercepted below.
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(async (...args: Parameters<typeof actual.readFile>) => {
    if (String(args[0]).endsWith(`${path.sep}.env`)) throw Object.assign(new Error("fixture absent"), { code: "ENOENT" });
    return (actual.readFile as (...values: unknown[]) => Promise<unknown>)(...args);
  }) };
});

const VENDORS = "aiEstimatorKnowledgeVendors";
const PLAN_DIGEST = "a".repeat(64);
const applyArgs = (digest = PLAN_DIGEST) => ["--apply", "--plan-digest", digest, "--backup-root", "/private/tmp/private-fixture-backups", "--maintenance-confirmation", MAINTENANCE_CONFIRMATION];
const environment = {
  LISNO_SYNC_SOURCE_URI: "mongodb://fixture-user:fixture-password@source.invalid:27017/source_fixture",
  LISNO_SYNC_TARGET_URI: "mongodb://127.0.0.1:27017/lisno_demo",
  UPLOADS_DIR: "/private/tmp/unused-fixture-uploads"
};

function vendor(id: string, overrides: Record<string, unknown> = {}): SyncDocument {
  return { _id: id, code: id, codeNormalized: id, name: id, nameNormalized: id, description: null,
    displayOrder: 1, status: "active", version: 1, dependencyEpoch: 0, kpiRubricGeneration: 0,
    createdById: "actor", updatedById: "actor", createdAt: new Date("2026-10-10T00:00:00Z"), updatedAt: new Date("2026-10-10T00:00:00Z"),
    archivedAt: null, archivedById: null, ...overrides };
}
function snapshot(role: "source" | "target", documents: SyncDocument[]): SyncSnapshot {
  const value: SyncSnapshot = { formatVersion: 1, role, identity: hash(role), databaseName: role === "target" ? "lisno_demo" : "source_fixture",
    collections: SYNC_COLLECTIONS.map(name => ({ name, exists: true, uuid: `fixture:${name}`, options: {}, indexes: [{ name: "_id_", key: { _id: 1 } }], documents: name === VENDORS ? documents : [] })),
    metadataCollections: role === "target" ? SYNC_METADATA_COLLECTIONS.map(name => ({ name, exists: false, uuid: null, options: {}, indexes: [], documents: [] })) : [],
    dependencies: { actorIds: ["actor"], availableStorageReferences: [] }, contentDigest: "" };
  value.contentDigest = snapshotDigest(value);
  return value;
}

describe("estimator sync command arguments", () => {
  it("defaults to preview and accepts an explicit guarded apply", () => {
    expect(parseArguments([])).toEqual({ apply: false });
    expect(parseArguments(["--dry-run"])).toEqual({ apply: false });
    expect(parseArguments(["--write-initialization", "/private/tmp/review.json"])).toEqual({ apply: false, writeInitializationPath: "/private/tmp/review.json" });
    expect(parseArguments(applyArgs())).toEqual({ apply: true, planDigest: PLAN_DIGEST, backupRoot: "/private/tmp/private-fixture-backups", maintenance: MAINTENANCE_CONFIRMATION });
  });

  it.each([
    ["--unknown"], ["--dry-run", "--dry-run"], ["--apply", "--dry-run"], ["--apply"],
    ["--initialization"], ["--initialization", "--dry-run"], ["--initialization", "a", "--initialization", "b"],
    ["--initialization", "a", "--write-initialization", "b"], ["--backup-root", "/private/tmp/backup"],
    ["--plan-digest", PLAN_DIGEST], ["--maintenance-confirmation", MAINTENANCE_CONFIRMATION],
    [...applyArgs(), "--write-initialization", "review.json"], applyArgs("A".repeat(64)),
    [...applyArgs().slice(0, -1), "not-confirmed"]
  ])("rejects ambiguous or incomplete arguments: %j", (...args: string[]) => {
    expect(() => parseArguments(args)).toThrow("INVALID_ARGUMENTS");
  });
});

describe("protect-only initialization and redacted reports", () => {
  it("classifies source-only and divergent records as protected, leaving matching/local-only records untouched", () => {
    const source = snapshot("source", [vendor("matching"), vendor("changed", { description: "production" }), vendor("source-only")]);
    const target = snapshot("target", [vendor("matching"), vendor("changed", { description: "local" }), vendor("test-pop"), vendor("test-painting")]);
    const template = initializationTemplate(source, target);
    expect(template).toEqual({ formatVersion: 1, sourceDigest: source.contentDigest, targetDigest: target.contentDigest, decisions: [
      { collection: VENDORS, id: "changed", action: "protect" }, { collection: VENDORS, id: "source-only", action: "protect" }
    ] });
    const plan = buildSyncPlan({ source, target, initialization: template });
    expect(plan.conflicts).toEqual([]);
    expect(plan.writes).toEqual([]);
    expect(plan.nextState.entries.find(entry => entry.id === "source-only")?.protection).toBe("deleted");
    expect(plan.nextState.entries.find(entry => entry.id === "changed")?.protection).toBe("local");
    expect(() => buildSyncPlan({ source, target, initialization: { ...template, sourceDigest: "b".repeat(64) } })).toThrow("INITIALIZATION_REVIEW_STALE");
  });

  it("excludes raw records, IDs, storage references, and baseline entries from safe reports", () => {
    const secret = "fixture-private-profile-value";
    const source = snapshot("source", [vendor("fixture-private-id", { description: secret })]);
    const target = snapshot("target", []);
    const plan = buildSyncPlan({ source, target });
    const report = safePlanReport(plan);
    expect(report).toMatchObject({ status: "preview", ready: false, policy: "local-additions-edits-and-deletions-preserved" });
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain("fixture-private-id");
    expect(report).not.toHaveProperty("writes");
    expect(report).not.toHaveProperty("nextState");
    expect(plan.conflicts[0].reference).toMatch(/^[a-f0-9]{24}$/);
    expect(safePlanReport({ ...plan, conflicts: [], additionalConflictCount: 1 }).ready).toBe(false);
  });
});

describe("CLI orchestration with synthetic IO boundaries", () => {
  let directory: string;
  beforeAll(async () => { directory = await mkdtemp(path.join(await realpath(tmpdir()), "lisno-sync-cli-test-")); });
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
  beforeEach(() => {
    vi.spyOn(mongo.MongoClient.prototype, "connect").mockImplementation(async function () { return this; });
    vi.spyOn(mongo.MongoClient.prototype, "close").mockResolvedValue();
    vi.spyOn(applyModule, "applySyncPlan").mockResolvedValue({ status: "applied", planDigest: PLAN_DIGEST, backup: null, written: 0 });
    vi.spyOn(snapshotModule, "readDatabaseSnapshot").mockImplementation(async (_client, _databaseName, options) => snapshot(options.role, [vendor("matching")]));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each([
    [{}, "SOURCE_CREDENTIAL_MISSING"],
    [{ ...environment, LISNO_SYNC_SOURCE_URI: "invalid://fixture-password" }, "INVALID_CONNECTION_CONFIGURATION"],
    [{ ...environment, LISNO_SYNC_TARGET_URI: "mongodb://remote.invalid/lisno_demo" }, "TARGET_NOT_ALLOWED"],
    [{ ...environment, LISNO_SYNC_TARGET_URI: "mongodb://127.0.0.1/production" }, "TARGET_NOT_ALLOWED"],
    [{ ...environment, LISNO_SYNC_SOURCE_URI: environment.LISNO_SYNC_TARGET_URI }, "SOURCE_TARGET_MATCH"],
    [{ ...environment, LISNO_SYNC_SOURCE_URI: "mongodb://localhost/lisno_demo" }, "SOURCE_TARGET_MATCH"],
    [{ ...environment, LISNO_SYNC_SOURCE_URI: "mongodb://source.invalid/lisno_demo" }, "SOURCE_TARGET_MATCH"],
    [{ ...environment, LISNO_SYNC_SOURCE_URI: "mongodb://source.invalid" }, "SOURCE_DATABASE_REQUIRED"]
  ])("fails before connections for unsafe configuration: %j", async (config, code) => {
    expect(await runSyncCommand([], config)).toEqual({ report: { status: "failed", code }, exitCode: 1 });
    expect(mongo.MongoClient.prototype.connect).not.toHaveBeenCalled();
    expect(applyModule.applySyncPlan).not.toHaveBeenCalled();
  });

  it("returns preview without invoking apply and closes both read connections", async () => {
    const result = await runSyncCommand([], environment);
    expect(result.exitCode).toBe(0);
    expect(result.report).toMatchObject({ status: "preview", ready: true });
    expect(applyModule.applySyncPlan).not.toHaveBeenCalled();
    expect(snapshotModule.readDatabaseSnapshot).toHaveBeenCalledTimes(2);
    expect(mongo.MongoClient.prototype.close).toHaveBeenCalledTimes(2);
  });

  it("returns a conflict exit code without writing and creates exclusive private initialization files", async () => {
    vi.mocked(snapshotModule.readDatabaseSnapshot).mockImplementation(async (_client, _databaseName, options) => snapshot(options.role, options.role === "source" ? [vendor("source-only")] : [vendor("test-pop")]));
    const initializationPath = path.join(directory, "review.json");
    const result = await runSyncCommand(["--write-initialization", initializationPath], environment);
    expect(result.exitCode).toBe(2);
    expect(result.report.ready).toBe(false);
    expect(applyModule.applySyncPlan).not.toHaveBeenCalled();
    expect((await lstat(initializationPath)).mode & 0o777).toBe(0o600);
    const original = await readFile(initializationPath, "utf8");
    expect(JSON.parse(original).decisions).toEqual([{ collection: VENDORS, id: "source-only", action: "protect" }]);
    expect((await runSyncCommand(["--write-initialization", initializationPath], environment)).exitCode).toBe(1);
    expect(await readFile(initializationPath, "utf8")).toBe(original);
    const protectedPreview = await runSyncCommand(["--initialization", initializationPath], environment);
    expect(protectedPreview.report).toMatchObject({ status: "preview", ready: true });
    expect(protectedPreview.exitCode).toBe(0);
    expect(applyModule.applySyncPlan).not.toHaveBeenCalled();
  });

  it("rejects a changed reviewed plan before apply", async () => {
    const result = await runSyncCommand(applyArgs(), environment);
    expect(result).toEqual({ report: { status: "failed", code: "PLAN_CHANGED" }, exitCode: 1 });
    expect(applyModule.applySyncPlan).not.toHaveBeenCalled();
  });

  it("hands off only the matching reviewed digest and maintenance confirmation to apply", async () => {
    const source = snapshot("source", [vendor("matching")]);
    const target = snapshot("target", [vendor("matching")]);
    const plan = buildSyncPlan({ source, target });
    vi.mocked(applyModule.applySyncPlan).mockResolvedValue({ status: "applied", planDigest: plan.digest, backup: null, written: 0 });
    const result = await runSyncCommand(applyArgs(plan.digest), environment);
    expect(result).toEqual({ report: { status: "applied", planDigest: plan.digest, written: 0, backupDirectory: null }, exitCode: 0 });
    expect(applyModule.applySyncPlan).toHaveBeenCalledOnce();
    expect(vi.mocked(applyModule.applySyncPlan).mock.calls[0][0]).toMatchObject({ plan: { digest: plan.digest }, maintenanceConfirmation: MAINTENANCE_CONFIRMATION, backupRoot: "/private/tmp/private-fixture-backups" });
  });

  it("rejects an initialization file that asks to overwrite or import an ambiguous record", async () => {
    const source = snapshot("source", [vendor("source-only")]);
    const target = snapshot("target", []);
    vi.mocked(snapshotModule.readDatabaseSnapshot).mockImplementation(async (_client, _databaseName, options) => options.role === "source" ? source : target);
    const overwrite = path.join(directory, "overwrite-review.json");
    const template = initializationTemplate(source, target);
    await writeFile(overwrite, JSON.stringify({ ...template, decisions: template.decisions.map(row => ({ ...row, action: "import" })) }), { mode: 0o600 });
    const result = await runSyncCommand(["--initialization", overwrite], environment);
    expect(result).toEqual({ report: { status: "failed", code: "INITIALIZATION_REVIEW_INVALID" }, exitCode: 1 });
    expect(applyModule.applySyncPlan).not.toHaveBeenCalled();
  });

  it("rejects symlinked and oversized initialization files before parsing", async () => {
    const oversized = path.join(directory, "oversized.json");
    const handle = await open(oversized, "wx", 0o600);
    try { await handle.truncate(SYNC_LIMITS.maxWriteBytes + 1); }
    finally { await handle.close(); }
    expect(await runSyncCommand(["--initialization", oversized], environment)).toEqual({ report: { status: "failed", code: "INITIALIZATION_TOO_LARGE" }, exitCode: 1 });
    const linked = path.join(directory, "linked.json");
    await symlink(oversized, linked);
    expect(await runSyncCommand(["--initialization", linked], environment)).toEqual({ report: { status: "failed", code: "SYNC_FAILED" }, exitCode: 1 });
    expect(applyModule.applySyncPlan).not.toHaveBeenCalled();
  });

  it("does not generate a reset template for an already initialized target", async () => {
    const source = snapshot("source", [vendor("matching")]);
    const target = snapshot("target", [vendor("matching")]);
    const initial = buildSyncPlan({ source, target });
    const metadata = target.metadataCollections.find(row => row.name === STATE_COLLECTION)!;
    metadata.exists = true;
    metadata.uuid = "fixture-baseline";
    metadata.documents = [initial.nextState];
    target.contentDigest = snapshotDigest(target);
    vi.mocked(snapshotModule.readDatabaseSnapshot).mockImplementation(async (_client, _databaseName, options) => options.role === "source" ? source : target);
    const output = path.join(directory, "reset.json");
    expect(await runSyncCommand(["--write-initialization", output], environment)).toEqual({ report: { status: "failed", code: "BASELINE_RESET_FORBIDDEN" }, exitCode: 1 });
    await expect(lstat(output)).rejects.toMatchObject({ code: "ENOENT" });
    expect(applyModule.applySyncPlan).not.toHaveBeenCalled();
  });

  it("does not expose driver errors, credentials, or raw malformed initialization content", async () => {
    vi.mocked(mongo.MongoClient.prototype.connect).mockRejectedValueOnce(new Error(`${environment.LISNO_SYNC_SOURCE_URI} private-data`));
    const networkFailure = await runSyncCommand([], environment);
    expect(networkFailure).toEqual({ report: { status: "failed", code: "SYNC_FAILED" }, exitCode: 1 });
    expect(JSON.stringify(networkFailure)).not.toContain("fixture-password");
    const invalid = path.join(directory, "invalid.json");
    await writeFile(invalid, "private-malformed-content", { mode: 0o600 });
    const inputFailure = await runSyncCommand(["--initialization", invalid], environment);
    expect(inputFailure).toEqual({ report: { status: "failed", code: "SYNC_FAILED" }, exitCode: 1 });
    expect(JSON.stringify(inputFailure)).not.toContain("private-malformed-content");
  });
});
