import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChatTypingActivity } from "./chatTypingActivity";
import { chatTypingLabel } from "./ChatTypingIndicator";
import type { ChatTypingInput } from "./projectChatTypes";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-16T10:00:00Z")); });
afterEach(() => vi.useRealTimers());
function fixture() {
  let sequence = 0;
  const publish = vi.fn(async (input: ChatTypingInput, _signal: AbortSignal) => ({ sequence: input.sequence, typing: input.typing, expiresAt: input.typing ? new Date(Date.now() + 8000).toISOString() : null }));
  const activity = createChatTypingActivity({ composerId: "composer-synthetic-a", nextSequence: () => ++sequence, publish });
  return { publish, ...activity };
}
describe("transient typing activity", () => {
  it("sends immediately, coalesces edits and stops after the last edit without refreshing an idle draft", async () => {
    const activity = fixture();
    activity.edit("H");
    expect(activity.publish).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); activity.edit("Hi");
    await vi.advanceTimersByTimeAsync(1000); activity.edit("Hi team");
    expect(activity.publish).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(activity.publish.mock.calls.map(call => call[0].typing)).toEqual([true, true]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(activity.publish.mock.calls.map(call => call[0])).toEqual([
      { composerId: "composer-synthetic-a", sequence: 1, typing: true },
      { composerId: "composer-synthetic-a", sequence: 2, typing: true },
      { composerId: "composer-synthetic-a", sequence: 3, typing: false }
    ]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(activity.publish).toHaveBeenCalledTimes(3);
    activity.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it("clears and restarts immediately with a higher sequence, without duplicate stops", async () => {
    const activity = fixture();
    activity.edit("Hello"); activity.edit("  "); activity.stop(); activity.edit("🙂");
    expect(activity.publish.mock.calls.map(call => [call[0].sequence, call[0].typing])).toEqual([[1, true], [2, false], [3, true]]);
    activity.dispose(); activity.edit("No activity after leaving");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(activity.publish.mock.calls.map(call => call[0].typing)).toEqual([true, false, true, false]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps no activity for a restored draft unless an explicit edit occurs", async () => {
    const activity = fixture();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(activity.publish).not.toHaveBeenCalled();
    activity.stop(); activity.dispose();
    expect(activity.publish).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts superseded updates and bounds a lost final stop", async () => {
    let sequence = 0;
    const requests: AbortSignal[] = [];
    const activity = createChatTypingActivity({ composerId: "composer-synthetic-b", nextSequence: () => ++sequence, publish: (_input, signal) => {
      requests.push(signal);
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    } });
    activity.edit("Hello"); activity.dispose();
    expect(requests).toHaveLength(2); expect(requests[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(requests[1].aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it("formats simultaneous names without losing correct counts", () => {
    const people = ["Priya", "Rahul", "Maya", "Sam"].map(name => ({ userId: name, name }));
    expect(chatTypingLabel([])).toBe("");
    expect(chatTypingLabel(people.slice(0, 1))).toBe("Priya is typing…");
    expect(chatTypingLabel(people.slice(0, 2))).toBe("Priya and Rahul are typing…");
    expect(chatTypingLabel(people.slice(0, 3))).toBe("Priya, Rahul and 1 other are typing…");
    expect(chatTypingLabel(people)).toBe("Priya, Rahul and 2 others are typing…");
  });
});
