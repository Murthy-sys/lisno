import { act, renderHook } from "@testing-library/react";
import { StrictMode, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutomaticKnowledgeCalculation } from "./useAutomaticKnowledgeCalculation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function advance(ms = 300) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

describe("automatic knowledge calculation lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits 300ms on opening, ignores callback rerenders, and coalesces rapid edits", async () => {
    const calculate = vi.fn(async (_signal: AbortSignal) => 100);
    const view = renderHook(({ key }) => useAutomaticKnowledgeCalculation({ inputKey: key, enabled: true, calculate: (signal) => calculate(signal) }), { initialProps: { key: "1" } });
    await advance(299);
    expect(calculate).not.toHaveBeenCalled();
    view.rerender({ key: "1" });
    await advance(1);
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(view.result.current.result).toBe(100);
    view.rerender({ key: "1" });
    await advance(600);
    expect(calculate).toHaveBeenCalledTimes(1);
    act(() => view.result.current.invalidate());
    view.rerender({ key: "12" });
    await advance(150);
    act(() => view.result.current.invalidate());
    view.rerender({ key: "123" });
    await advance(299);
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(view.result.current.result).toBeUndefined();
    await advance(1);
    expect(calculate).toHaveBeenCalledTimes(2);
  });

  it("settles invalid input without a request, aborts immediately, and resumes on correction", async () => {
    const pending = deferred<number>();
    const calculate = vi.fn((_signal: AbortSignal) => pending.promise);
    const view = renderHook(({ key, enabled }) => useAutomaticKnowledgeCalculation({ inputKey: key, enabled, calculate }), { initialProps: { key: "1", enabled: true } });
    await advance();
    const signal = calculate.mock.calls[0]![0];
    act(() => view.result.current.invalidate());
    expect(signal.aborted).toBe(true);
    view.rerender({ key: "", enabled: false });
    await advance(299);
    expect(view.result.current.settled).toBe(false);
    await advance(1);
    expect(view.result.current.settled).toBe(true);
    expect(calculate).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(100));
    expect(view.result.current.result).toBeUndefined();
    calculate.mockResolvedValue(200);
    view.rerender({ key: "2", enabled: true });
    await advance();
    expect(view.result.current.result).toBe(200);
  });

  it.each(["success", "failure"] as const)("ignores an obsolete %s without changing a newer result or external summary", async (outcome) => {
    const old = deferred<number>();
    const calculate = vi.fn((_signal: AbortSignal) => old.promise).mockImplementationOnce(() => old.promise).mockResolvedValueOnce(250);
    const onResult = vi.fn();
    const view = renderHook(({ key }) => useAutomaticKnowledgeCalculation({ inputKey: key, enabled: true, calculate, onResult }), { initialProps: { key: "max" } });
    await advance();
    view.rerender({ key: "min" });
    await advance();
    expect(view.result.current.result).toBe(250);
    await act(async () => outcome === "success" ? old.resolve(900) : old.reject(new Error("Old failure")));
    expect(view.result.current.result).toBe(250);
    expect(view.result.current.error).toBeUndefined();
    expect(onResult).toHaveBeenLastCalledWith(250);
  });

  it("never clears a newer loading state when an old request finishes", async () => {
    const old = deferred<number>(), next = deferred<number>();
    const calculate = vi.fn((_signal: AbortSignal) => old.promise).mockImplementationOnce(() => old.promise).mockImplementationOnce(() => next.promise);
    const view = renderHook(({ key }) => useAutomaticKnowledgeCalculation({ inputKey: key, enabled: true, calculate }), { initialProps: { key: "one" } });
    await advance();
    view.rerender({ key: "two" });
    await advance();
    await act(async () => old.resolve(10));
    expect(view.result.current.phase).toBe("calculating");
    await act(async () => next.resolve(20));
    expect(view.result.current.result).toBe(20);
  });

  it("retries a current failure only when requested and uses current inputs", async () => {
    const calculate = vi.fn(async (_signal: AbortSignal) => 42).mockRejectedValueOnce(new Error("Offline"));
    const view = renderHook(() => useAutomaticKnowledgeCalculation({ inputKey: "quantity:7", enabled: true, calculate }));
    await advance();
    expect(view.result.current.error).toBe("Offline");
    await advance(3000);
    expect(calculate).toHaveBeenCalledTimes(1);
    act(() => view.result.current.retry());
    expect(view.result.current.error).toBeUndefined();
    await advance();
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(view.result.current.result).toBe(42);
  });

  it("cancels closing timers and late responses without clearing an accepted external summary", async () => {
    const calculate = vi.fn(async (_signal: AbortSignal) => 123);
    const onResult = vi.fn();
    const early = renderHook(() => useAutomaticKnowledgeCalculation({ inputKey: "one", enabled: true, calculate, onResult }));
    early.unmount();
    await advance();
    expect(calculate).not.toHaveBeenCalled();
    const accepted = renderHook(() => useAutomaticKnowledgeCalculation({ inputKey: "two", enabled: true, calculate, onResult }));
    await advance();
    onResult.mockClear();
    accepted.unmount();
    expect(onResult).not.toHaveBeenCalled();
    const pending = deferred<number>();
    calculate.mockImplementationOnce(() => pending.promise);
    const late = renderHook(() => useAutomaticKnowledgeCalculation({ inputKey: "three", enabled: true, calculate, onResult }));
    await advance();
    const signal = calculate.mock.calls.at(-1)![0];
    late.unmount();
    onResult.mockClear();
    await act(async () => pending.resolve(456));
    expect(signal.aborted).toBe(true);
    expect(onResult).not.toHaveBeenCalled();
  });

  it("starts only one request under Strict Mode and invalidates equal-key edits", async () => {
    const calculate = vi.fn(async (_signal: AbortSignal) => 5);
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const view = renderHook(() => useAutomaticKnowledgeCalculation({ inputKey: "same", enabled: true, calculate }), { wrapper });
    await advance();
    expect(calculate).toHaveBeenCalledTimes(1);
    act(() => view.result.current.invalidate());
    expect(view.result.current.result).toBeUndefined();
    await advance();
    expect(calculate).toHaveBeenCalledTimes(2);
  });
});
