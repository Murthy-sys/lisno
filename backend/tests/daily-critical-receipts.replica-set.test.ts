import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {DailyCriticalTaskReceiptModel} from "../src/models/DailyCriticalTaskReceipt.js";
import {DailyCriticalScheduleStateModel} from "../src/models/DailyCriticalScheduleState.js";
import {createMongoProjectChatRepository} from "../src/repositories/project-chat-mongo.js";
import {startMongoReplicaSet} from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("daily-critical-receipts"); await Promise.all([DailyCriticalTaskReceiptModel.syncIndexes(), DailyCriticalScheduleStateModel.syncIndexes()]); }, 120_000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica?.stop(); });

describe("daily critical receipt persistence", () => {
  it("deduplicates concurrent instances and keeps the first acknowledgment across restart", async () => {
    const first = createMongoProjectChatRepository();
    const second = createMongoProjectChatRepository();
    const date = "2026-09-16", at = "2026-09-16T11:30:00.000Z";
    const created = await Promise.all([first, second, first, second].map(repo => repo.mutate(tx => tx.ensureDigestReceipt("worker-a", date, at))));
    expect(created.filter(Boolean)).toHaveLength(1);
    expect(await DailyCriticalTaskReceiptModel.countDocuments()).toBe(1);
    const acknowledged = await Promise.all([first, second].map(repo => repo.mutate(tx => tx.acknowledgeDigestReceipt("worker-a", date, "2026-09-16T12:00:00.000Z"))));
    expect(acknowledged[0]?.acknowledgedAt).toBe("2026-09-16T12:00:00.000Z");
    expect(acknowledged[1]?.acknowledgedAt).toBe(acknowledged[0]?.acknowledgedAt);
    const restarted = createMongoProjectChatRepository();
    expect((await restarted.snapshot(tx => tx.digestReceipts("worker-a", date)))[0]?.acknowledgedAt).toBe(acknowledged[0]?.acknowledgedAt);
    expect(await restarted.snapshot(tx => tx.digestReceipts("worker-b", date))).toEqual([]);
  });

  it("persists the first eligible schedule date through a later process restart", async () => {
    const first = createMongoProjectChatRepository(), second = createMongoProjectChatRepository();
    expect(await first.mutate(tx => tx.ensureDigestScheduleStart("2026-09-16", "2026-09-16T10:00:00.000Z"))).toBe("2026-09-16");
    expect(await second.mutate(tx => tx.ensureDigestScheduleStart("2026-09-17", "2026-09-17T10:00:00.000Z"))).toBe("2026-09-16");
    expect(await DailyCriticalScheduleStateModel.countDocuments()).toBe(1);
  });
});
