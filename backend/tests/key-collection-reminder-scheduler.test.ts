import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyCollectionAppointment } from "../src/domain/design-workflow-state.js";
import { createKeyCollectionReminderScheduler, type KeyCollectionReminderStore } from "../src/services/key-collection-reminder-scheduler.js";

const start = Date.parse("2026-11-26T10:00:00Z");
const appointment: KeyCollectionAppointment = {
  mode: "within_48_hours", confirmedById: "client", confirmedAt: new Date(start).toISOString(),
  deadlineAt: new Date(start + 48 * 3_600_000).toISOString(), originalDeadlineAt: new Date(start + 48 * 3_600_000).toISOString(),
  assignmentRevision: "revision", designerId: "designer", assignmentRequestId: "request", estimateId: "estimate", estimateVersion: 1, approvalReviewRoundId: "round"
};
const recorded = () => ({ recorded: 2, deduplicated: 0, skippedInvalid: 0, missingRecipients: 0 });
function setup(extra: Partial<Parameters<typeof createKeyCollectionReminderScheduler>[0]> = {}) {
  const store: KeyCollectionReminderStore = { candidates: vi.fn(async () => [{ projectId: "project-a", appointment, finished: false }]), record: vi.fn(async () => recorded()) };
  const scheduler = createKeyCollectionReminderScheduler({ audit: { appendInMongoTransaction: vi.fn() }, now: () => new Date(start + 24 * 3_600_000), store, ...extra });
  return { scheduler, store };
}
afterEach(() => vi.useRealTimers());

describe("Key collection scheduler runtime", () => {
  it("does no work on construction or when explicitly disabled", async () => {
    const { scheduler, store } = setup({ enabled: false });
    expect(store.candidates).not.toHaveBeenCalled();
    scheduler.start();
    expect((await scheduler.tick()).scanned).toBe(0);
    await scheduler.stop();
    expect(store.candidates).not.toHaveBeenCalled();
    expect(store.record).not.toHaveBeenCalled();
  });

  it("starts immediately once, repeats on cadence, and stops cleanly", async () => {
    vi.useFakeTimers();
    const { scheduler, store } = setup();
    scheduler.start(); scheduler.start();
    await scheduler.tick();
    expect(store.record).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.record).toHaveBeenCalledTimes(2);
    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.record).toHaveBeenCalledTimes(2);
    expect(scheduler.health()).toMatchObject({ enabled: true, running: false, failureCode: null });
  });

  it("shares an in-flight tick and shutdown waits for the transaction", async () => {
    let release!: () => void;
    const { scheduler, store } = setup();
    vi.mocked(store.record).mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve; }); return recorded(); });
    const first = scheduler.tick(); const second = scheduler.tick();
    expect(second).toBe(first);
    await Promise.resolve(); await Promise.resolve();
    let stopped = false;
    const stop = scheduler.stop().then(() => { stopped = true; });
    await Promise.resolve(); expect(stopped).toBe(false);
    release(); await Promise.all([first, stop]);
    expect(store.record).toHaveBeenCalledTimes(1);
    expect(stopped).toBe(true);
  });

  it("advances a bounded keyset sweep and returns to the start after the end", async () => {
    const store: KeyCollectionReminderStore = {
      candidates: vi.fn(async (after) => after === null ? [{ projectId: "a", appointment, finished: false }] : after === "a" ? [{ projectId: "b", appointment, finished: false }] : []),
      record: vi.fn(async () => recorded())
    };
    const { scheduler } = setup({ store, batchSize: 1, maxBatchesPerTick: 1 });
    await scheduler.tick(); await scheduler.tick(); await scheduler.tick(); await scheduler.tick();
    expect(vi.mocked(store.candidates).mock.calls.map(call => call[0])).toEqual([null, "a", "b", null]);
    expect(vi.mocked(store.record).mock.calls.map(call => call[0])).toEqual(["a", "b", "a"]);
  });

  it("keeps processing other projects after a failure and reports only a safe code", async () => {
    const { scheduler, store } = setup();
    vi.mocked(store.candidates).mockResolvedValue([{ projectId: "bad", appointment, finished: false }, { projectId: "good", appointment, finished: false }]);
    vi.mocked(store.record).mockRejectedValueOnce(new Error("private data must not escape"));
    const report = await scheduler.tick();
    expect(report).toMatchObject({ scanned: 2, recorded: 2, failed: 1, failureCode: "KEY_COLLECTION_PROJECT_FAILED" });
    expect(JSON.stringify(scheduler.health())).not.toContain("private data");
  });

  it("retries a failed page without advancing its cursor", async () => {
    const { scheduler, store } = setup();
    vi.mocked(store.candidates).mockRejectedValueOnce(new Error("connection unavailable"));
    expect(await scheduler.tick()).toMatchObject({ failureCode: "KEY_COLLECTION_SCAN_FAILED", failed: 1 });
    expect(await scheduler.tick()).toMatchObject({ failureCode: null, recorded: 2 });
    expect(vi.mocked(store.candidates).mock.calls.map(call => call[0])).toEqual([null, null]);
  });

  it("does not write before a warning is due or after receipt", async () => {
    const { scheduler, store } = setup({ now: () => new Date(start + 3_600_000) });
    await scheduler.tick();
    expect(store.record).not.toHaveBeenCalled();
    vi.mocked(store.candidates).mockResolvedValue([{ projectId: "received", appointment, finished: true }]);
    await scheduler.tick();
    expect(store.record).not.toHaveBeenCalled();
  });
});
