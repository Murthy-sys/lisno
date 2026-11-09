import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { getEstimateTierComparison, type EstimateTierComparison, type EstimateTierComparisonRequest } from "../estimates/estimateTierComparisonApi";
import { useEstimateTierSuggestions, type EstimateTierSuggestionGroup } from "./useEstimateTierSuggestions";

vi.mock("../estimates/estimateTierComparisonApi", () => ({ getEstimateTierComparison: vi.fn() }));
const read = vi.mocked(getEstimateTierComparison);
const request = (id = "lead-a", quantity = 2, kind: "lead" | "project" = "lead"): EstimateTierComparisonRequest => ({ target: { kind, id }, input: {
  expectedVersion: 7, roomId: "living", mainBasketId: "finishes", subBasketId: "walls", lines: [{
    mainLineId: "finish-a", lineItemId: "saved-a", revisionId: "revision-a", itemVersion: 2, revisionVersion: 3,
    uomId: "sqft", quantity, pricingMode: "sub_vendor", modeTier: "signature", rateSource: "manual", manualRateChanged: true
  }]
} });
const group = (input = request()): EstimateTierSuggestionGroup => ({ key: "living-finishes-walls", request: input });
const response = (input: EstimateTierComparisonRequest, rate = 2500): EstimateTierComparison => ({
  roomId: input.input.roomId, mainBasketId: input.input.mainBasketId, subBasketId: input.input.subBasketId,
  roomName: "Living", mainBasketName: "Finishes", subBasketName: "Walls", estimateVersion: input.input.expectedVersion ?? null,
  tiers: (["current", "signature", "premium", "functional"] as const).map(modeTier => ({ modeTier, label: modeTier,
    available: true, subtotalPaise: input.input.lines.reduce((sum, line) => sum + rate * line.quantity, 0),
    lines: input.input.lines.map(line => ({ mainLineId: line.mainLineId, name: "Wall finish", quantity: line.quantity,
      uomName: "sq ft", ratePaise: rate, amountPaise: rate * line.quantity, unavailableReason: null }))
  }))
});
const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { read.mockReset(); });

describe("Main Line tier suggestion reads", () => {
  it("batches a group's unequal lines in one read and retains zero and component-only amounts", async () => {
    const input = request(); input.input.lines.push({ ...input.input.lines[0]!, mainLineId: "finish-b", lineItemId: "saved-b", quantity: 1.25 });
    const expected = response(input, 0);
    expected.tiers[2]!.lines[1] = { ...expected.tiers[2]!.lines[1]!, ratePaise: null, amountPaise: 12345 };
    read.mockResolvedValue(expected);
    const { result, rerender } = renderHook(({ groups }) => useEstimateTierSuggestions("actor-a/session-a", groups),
      { initialProps: { groups: [group(input)] }, wrapper: wrapper() });
    expect(result.current.get(group().key)?.status).toBe("loading");
    expect(read).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    const state = result.current.get(group().key)!;
    expect(state.status === "ready" && state.comparison).toEqual(expected);
    expect(read).toHaveBeenCalledTimes(1);
    rerender({ groups: [group({ ...input, input: { ...input.input, lines: [...input.input.lines].reverse() } })] });
    expect(result.current.get(group().key)?.status).toBe("ready");
    expect(read).toHaveBeenCalledTimes(1);
    expect(input.input.lines[0]?.rateSource).toBe("manual");
  });

  it("immediately hides old prices, debounces quick edits, and ignores a late old response", async () => {
    const old = deferred<EstimateTierComparison>();
    read.mockReturnValueOnce(old.promise).mockImplementation(async input => response(input));
    const { result, rerender } = renderHook(({ quantity }) => useEstimateTierSuggestions("actor-a/session-a", [group(request("lead-a", quantity))]),
      { initialProps: { quantity: 2 }, wrapper: wrapper() });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    const firstSignal = read.mock.calls[0]![1]!;
    rerender({ quantity: 3 });
    expect(result.current.get(group().key)?.status).toBe("loading");
    expect(firstSignal.aborted).toBe(true);
    rerender({ quantity: 4 });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1]![0].input.lines[0]?.quantity).toBe(4);
    await act(async () => old.resolve(response(request("lead-a", 2), 9000)));
    const state = result.current.get(group().key)!;
    expect(state.status === "ready" && state.comparison.tiers[1]?.lines[0]?.amountPaise).toBe(10000);
    rerender({ quantity: 5 });
    expect(result.current.get(group().key)?.status).toBe("loading");
  });

  it("isolates different targets and actor sessions even when group and line IDs match", async () => {
    read.mockImplementation(async input => response(input, input.target.id === "lead-a" ? 1200 : 7700));
    const { result, rerender } = renderHook(({ target, context }) => useEstimateTierSuggestions(context, [group(request(target, 2, target.startsWith("project") ? "project" : "lead"))]),
      { initialProps: { target: "lead-a", context: "actor-a/session-a" }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    rerender({ target: "project-b", context: "actor-b/session-b" });
    expect(result.current.get(group().key)?.status).toBe("loading");
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    const state = result.current.get(group().key)!;
    expect(state.status === "ready" && state.comparison.tiers[1]?.lines[0]?.amountPaise).toBe(15400);
    rerender({ target: "project-b", context: "actor-b/new-session" });
    expect(result.current.get(group().key)?.status).toBe("loading");
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  });

  it("invalidates on changed source/version, mode, dimensions, and components", async () => {
    read.mockImplementation(async input => response(input));
    const initial = request();
    const { result, rerender } = renderHook(({ input }) => useEstimateTierSuggestions("actor-a", [group(input)]),
      { initialProps: { input: initial }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    const next = { ...initial, input: { ...initial.input, expectedVersion: 8, lines: [{ ...initial.input.lines[0]!,
      revisionVersion: 4, pricingMode: "in_house" as const, modeTier: "premium" as const,
      dimensions: { length: "2", width: "3", height: "4" }, selectedInHouseComponentIds: ["component-b"] }] } };
    rerender({ input: next });
    expect(result.current.get(group().key)?.status).toBe("loading");
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    expect(read).toHaveBeenLastCalledWith(next, expect.any(AbortSignal));
  });

  it.each(["scope", "version", "tier", "line", "quantity", "money"] as const)("rejects a response with mismatched or malformed %s", async kind => {
    const value = response(request());
    if (kind === "scope") value.roomId = "other-room";
    if (kind === "version") value.estimateVersion = 8;
    if (kind === "tier") value.tiers.pop();
    if (kind === "line") value.tiers[1]!.lines[0]!.mainLineId = "other-line";
    if (kind === "quantity") value.tiers[1]!.lines[0]!.quantity = 3;
    if (kind === "money") value.tiers[1]!.lines[0]!.amountPaise = Number.MAX_SAFE_INTEGER + 1;
    read.mockResolvedValue(value);
    const { result } = renderHook(() => useEstimateTierSuggestions("actor-a", [group()]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("error"));
    expect(result.current.get(group().key)).not.toHaveProperty("comparison");
  });

  it.each([403, 404])("keeps a %s response non-disclosing and retries the same current request", async status => {
    read.mockRejectedValueOnce(new ApiError(status, "DENIED", "Private project name and link"))
      .mockResolvedValueOnce(response(request()));
    const { result } = renderHook(() => useEstimateTierSuggestions("actor-a", [group()]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("error"));
    const error = result.current.get(group().key)!;
    expect(error).toMatchObject({ message: "Tier prices are unavailable for this estimate." });
    act(() => { if (error.status === "error") error.retry(); });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    expect(read.mock.calls[0]![0]).toEqual(read.mock.calls[1]![0]);
  });

  it.each([401, 403, 404, 409])("blocks tier selection after %s and throughout retry until success", async status => {
    const retry = deferred<EstimateTierComparison>();
    read.mockRejectedValueOnce(new ApiError(status, "UNVERIFIED", "Access or Configuration changed."))
      .mockReturnValueOnce(retry.promise);
    const { result } = renderHook(() => useEstimateTierSuggestions("actor-a", [group()]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("error"));
    expect(result.current.get(group().key)?.selectionBlocked).toBe(true);
    expect(result.current.get(group().key)).not.toHaveProperty("comparison");
    const state = result.current.get(group().key)!;
    act(() => { if (state.status === "error") state.retry(); });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("loading"));
    expect(result.current.get(group().key)?.selectionBlocked).toBe(true);
    expect(result.current.get(group().key)).not.toHaveProperty("comparison");
    await act(async () => retry.resolve(response(request())));
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    expect(result.current.get(group().key)?.selectionBlocked).toBe(false);
  });

  it("does not block selection for an initial network failure or carry another identity's denial", async () => {
    read.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Network unavailable."))
      .mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed."))
      .mockResolvedValueOnce(response(request("lead-b"), 7700));
    const { result, rerender } = renderHook(({ context, target }) => useEstimateTierSuggestions(context, [group(request(target))]),
      { initialProps: { context: "actor-a", target: "lead-a" }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("error"));
    expect(result.current.get(group().key)?.selectionBlocked).toBe(false);
    const state = result.current.get(group().key)!;
    act(() => { if (state.status === "error") state.retry(); });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    rerender({ context: "actor-b", target: "lead-b" });
    expect(result.current.get(group().key)?.status).toBe("loading");
    expect(result.current.get(group().key)?.selectionBlocked).toBe(false);
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    expect(result.current.get(group().key)?.selectionBlocked).toBe(false);
  });

  it("keeps a known stale source blocked if retry only encounters a network failure", async () => {
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed."))
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Network unavailable."));
    const { result } = renderHook(() => useEstimateTierSuggestions("actor-a", [group()]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    const state = result.current.get(group().key)!;
    act(() => { if (state.status === "error") state.retry(); });
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({
      status: "error", message: "Tier prices could not be loaded. Try again.", selectionBlocked: true
    }));
    expect(result.current.get(group().key)).not.toHaveProperty("comparison");
  });

  it("preserves a stale-source block across quantity/version edits until the current read succeeds", async () => {
    const pending = deferred<EstimateTierComparison>();
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed.")).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ input }) => useEstimateTierSuggestions("actor-a", [group(input)]),
      { initialProps: { input: request() }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    const changed = request("lead-a", 3);
    changed.input.expectedVersion = 8;
    changed.input.lines[0]!.revisionVersion = 4;
    rerender({ input: changed });
    expect(result.current.get(group().key)).toMatchObject({ status: "loading", selectionBlocked: true });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(result.current.get(group().key)).toMatchObject({ status: "loading", selectionBlocked: true });
    await act(async () => pending.resolve(response(changed)));
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: false }));
  });

  it("retains the block while a group is hidden and after it is reopened", async () => {
    const pending = deferred<EstimateTierComparison>();
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed.")).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ groups }) => useEstimateTierSuggestions("actor-a", groups),
      { initialProps: { groups: [group()] }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    rerender({ groups: [] });
    expect(result.current.get(group().key)).toMatchObject({ status: "unavailable", selectionBlocked: true });
    expect(result.current.get(group().key)).not.toHaveProperty("comparison");
    expect(result.current.get(group().key)).not.toHaveProperty("retry");
    rerender({ groups: [group()] });
    expect(result.current.get(group().key)?.selectionBlocked).toBe(true);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(result.current.get(group().key)).toMatchObject({ status: "loading", selectionBlocked: true });
    await act(async () => pending.resolve(response(request())));
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: false }));
  });

  it("performs no reads while initially closed and exposes no inactive prices after cancellation", async () => {
    const pending = deferred<EstimateTierComparison>(); read.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ groups }) => useEstimateTierSuggestions("actor-a/session-a/lead-a", groups),
      { initialProps: { groups: [] as EstimateTierSuggestionGroup[] }, wrapper: wrapper() });
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 300)); });
    expect(read).not.toHaveBeenCalled(); expect(result.current.size).toBe(0);
    rerender({ groups: [group()] });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    const signal = read.mock.calls[0]![1]!;
    rerender({ groups: [] });
    expect(signal.aborted).toBe(true); expect(result.current.size).toBe(0);
    await act(async () => pending.resolve(response(request())));
    expect(result.current.size).toBe(0);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("retains closed-scope guards while another group opens and through edited-quantity recovery", async () => {
    const other = request(); other.input.subBasketId = "ceilings";
    const otherGroup = { key: "living-finishes-ceilings", request: other };
    const changed = request("lead-a", 3);
    const retry = deferred<EstimateTierComparison>();
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed."))
      .mockResolvedValueOnce(response(other)).mockRejectedValueOnce(new ApiError(503, "NETWORK", "Read unavailable."))
      .mockReturnValueOnce(retry.promise);
    const { result, rerender } = renderHook(({ groups }) => useEstimateTierSuggestions("actor-a/session-a/lead-a", groups),
      { initialProps: { groups: [group()] }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    rerender({ groups: [] });
    expect(result.current.get(group().key)).toMatchObject({ status: "unavailable", selectionBlocked: true });
    expect(result.current.get(group().key)).not.toHaveProperty("comparison");
    expect(result.current.get(group().key)).not.toHaveProperty("retry");
    rerender({ groups: [otherGroup] });
    expect(result.current.get(group().key)?.selectionBlocked).toBe(true);
    await waitFor(() => expect(result.current.get(otherGroup.key)?.status).toBe("ready"));
    expect(result.current.get(group().key)).toMatchObject({ status: "unavailable", selectionBlocked: true });
    rerender({ groups: [group(changed)] });
    expect(result.current.get(group().key)).toMatchObject({ status: "loading", selectionBlocked: true });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("error"));
    expect(result.current.get(group().key)?.selectionBlocked).toBe(true);
    const failed = result.current.get(group().key)!;
    act(() => { if (failed.status === "error") failed.retry(); });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("loading"));
    expect(result.current.get(group().key)?.selectionBlocked).toBe(true);
    await act(async () => retry.resolve(response(changed)));
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: false }));
    rerender({ groups: [] });
    expect(result.current.size).toBe(0);
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("retains omitted failed Main Lines after a fresh subset read until all affected lines recover", async () => {
    const full = request();
    full.input.lines.push({ ...full.input.lines[0]!, mainLineId: "finish-b", lineItemId: "saved-b", quantity: 3 });
    const onlyB = { ...full, input: { ...full.input, lines: [full.input.lines[1]!] } };
    const pending = deferred<EstimateTierComparison>();
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed."))
      .mockResolvedValueOnce(response(onlyB, 7700)).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ groups }) => useEstimateTierSuggestions("actor-a/session-a/lead-a", groups),
      { initialProps: { groups: [group(full)] }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    rerender({ groups: [] });
    expect(result.current.get(group().key)).toMatchObject({ status: "unavailable", selectionBlocked: true });
    // A is invalid in the editor, so only eligible B is included in this read.
    rerender({ groups: [group(onlyB)] });
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: true }));
    const subset = result.current.get(group().key)!;
    expect(subset.status === "ready" && subset.comparison.tiers[1]?.lines).toEqual([
      expect.objectContaining({ mainLineId: "finish-b", amountPaise: 23100 })
    ]);
    rerender({ groups: [] });
    expect(result.current.get(group().key)).toMatchObject({ status: "unavailable", selectionBlocked: true });
    expect(result.current.get(group().key)).not.toHaveProperty("comparison");
    expect(result.current.get(group().key)).not.toHaveProperty("retry");
    rerender({ groups: [group(full)] });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(result.current.get(group().key)).toMatchObject({ status: "loading", selectionBlocked: true });
    await act(async () => pending.resolve(response(full)));
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: false }));
    rerender({ groups: [] });
    expect(result.current.size).toBe(0);
  });

  it("unions affected Main Line IDs from later failures rather than replacing earlier unresolved IDs", async () => {
    const onlyA = request();
    const onlyB = request(); onlyB.input.lines[0] = { ...onlyB.input.lines[0]!, mainLineId: "finish-b", lineItemId: "saved-b" };
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "First source changed."))
      .mockRejectedValueOnce(new ApiError(409, "CHANGED", "Second source changed."))
      .mockResolvedValueOnce(response(onlyB)).mockResolvedValueOnce(response(onlyA));
    const { result, rerender } = renderHook(({ input }) => useEstimateTierSuggestions("actor-a", [group(input)]),
      { initialProps: { input: onlyA }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("error"));
    rerender({ input: onlyB });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("error"));
    const failure = result.current.get(group().key)!;
    act(() => { if (failure.status === "error") failure.retry(); });
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: true }));
    rerender({ input: onlyA });
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: false }));
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("distinguishes an invalid omitted line from explicit removal using the full included-ID scope", async () => {
    const full = request();
    full.input.lines.push({ ...full.input.lines[0]!, mainLineId: "finish-b", lineItemId: "saved-b", quantity: 3 });
    const onlyB = { ...full, input: { ...full.input, lines: [full.input.lines[1]!] } };
    const recovered = deferred<EstimateTierComparison>();
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed."))
      .mockResolvedValueOnce(response(onlyB)).mockReturnValueOnce(recovered.promise);
    const withScope = (input: EstimateTierComparisonRequest, scopeMainLineIds: string[]) => ({ ...group(input), scopeMainLineIds });
    const { result, rerender } = renderHook(({ groups }) => useEstimateTierSuggestions("actor-a", groups), {
      initialProps: { groups: [withScope(full, ["finish-a", "finish-b"])] }, wrapper: wrapper()
    });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    // A remains included but has invalid input, so successful B cannot release it.
    rerender({ groups: [withScope(onlyB, ["finish-a", "finish-b"])] });
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: true }));
    // A is now actually removed. A new current read must still validate retained B.
    rerender({ groups: [withScope(onlyB, ["finish-b"])] });
    expect(result.current.get(group().key)).toMatchObject({ status: "loading", selectionBlocked: true });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(result.current.get(group().key)).toMatchObject({ status: "loading", selectionBlocked: true });
    await act(async () => recovered.resolve(response(onlyB)));
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: false }));
    rerender({ groups: [] });
    expect(result.current.size).toBe(0);
  });

  it("refuses contradictory included-ID metadata rather than releasing unverified lines", async () => {
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed."));
    const { result, rerender } = renderHook(({ groups }) => useEstimateTierSuggestions("actor-a", groups), {
      initialProps: { groups: [group()] as EstimateTierSuggestionGroup[] }, wrapper: wrapper()
    });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    rerender({ groups: [{ ...group(), scopeMainLineIds: ["other-line"] }] });
    expect(result.current.get(group().key)).toMatchObject({ status: "unavailable", selectionBlocked: true });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each(["actor", "target"])("does not expose a retained guard during a closed %s-context switch", async change => {
    read.mockRejectedValueOnce(new ApiError(403, "DENIED", "Private estimate."));
    const initialContext = "actor-a/session-a/lead-a";
    const { result, rerender } = renderHook(({ context, groups }) => useEstimateTierSuggestions(context, groups),
      { initialProps: { context: initialContext, groups: [group()] }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    rerender({ context: initialContext, groups: [] });
    expect(result.current.get(group().key)?.selectionBlocked).toBe(true);
    rerender({ context: change === "actor" ? "actor-b/session-b/lead-a" : "actor-a/session-a/lead-b", groups: [] });
    expect(result.current.size).toBe(0);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("filters retained guards immediately when the active target changes", async () => {
    read.mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed."))
      .mockResolvedValueOnce(response(request("lead-b")));
    const { result, rerender } = renderHook(({ groups }) => useEstimateTierSuggestions("actor-a", groups),
      { initialProps: { groups: [group()] }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    const next = { key: "next-target-group", request: request("lead-b") };
    rerender({ groups: [next] });
    expect(result.current.has(group().key)).toBe(false);
    expect(result.current.get(next.key)?.selectionBlocked).toBe(false);
    await waitFor(() => expect(result.current.get(next.key)?.status).toBe("ready"));
  });

  it("does not clear a newer conflict from an older cached successful request identity", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const pending = deferred<EstimateTierComparison>();
    read.mockResolvedValueOnce(response(request())).mockRejectedValueOnce(new ApiError(409, "CHANGED", "Configuration changed."))
      .mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ input }) => useEstimateTierSuggestions("actor-a", [group(input)]), {
      initialProps: { input: request() },
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    const oldKey = ["estimate-tier-suggestions", "actor-a", group().key, request()];
    const oldSuccess = client.getQueryData(oldKey);
    expect(oldSuccess).toBeDefined();
    rerender({ input: request("lead-a", 3) });
    await waitFor(() => expect(result.current.get(group().key)?.selectionBlocked).toBe(true));
    act(() => { client.setQueryData(oldKey, oldSuccess); });
    rerender({ input: request() });
    expect(result.current.get(group().key)).toMatchObject({ status: "loading", selectionBlocked: true });
    expect(result.current.get(group().key)).not.toHaveProperty("comparison");
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(result.current.get(group().key)).toMatchObject({ status: "loading", selectionBlocked: true });
    await act(async () => pending.resolve(response(request(), 4200)));
    await waitFor(() => expect(result.current.get(group().key)).toMatchObject({ status: "ready", selectionBlocked: false }));
  });

  it("never reads empty, invalid, duplicate-key groups and cancels removed groups", async () => {
    const pending = deferred<EstimateTierComparison>(); read.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(({ groups }) => useEstimateTierSuggestions("actor-a", groups),
      { initialProps: { groups: [] as EstimateTierSuggestionGroup[] }, wrapper: wrapper() });
    expect(result.current.size).toBe(0); expect(read).not.toHaveBeenCalled();
    rerender({ groups: [group(request("lead-a", 0))] });
    expect(result.current.get(group().key)?.status).toBe("unavailable");
    rerender({ groups: [group(), group()] });
    expect(result.current.get(group().key)?.status).toBe("unavailable");
    rerender({ groups: [group()] });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    const signal = read.mock.calls[0]![1]!;
    rerender({ groups: [] });
    expect(signal.aborted).toBe(true); expect(result.current.size).toBe(0);
    await act(async () => pending.resolve(response(request())));
    expect(result.current.size).toBe(0);
  });

  it("splits oversized groups at the API limit and merges only returned cells", async () => {
    const input = request();
    input.input.lines = Array.from({ length: 1001 }, (_, index) => ({ ...input.input.lines[0]!, mainLineId: `line-${index}`, quantity: 1 }));
    read.mockImplementation(async value => response(value, 100));
    const { result } = renderHook(() => useEstimateTierSuggestions("actor-a", [group(input)]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.get(group().key)?.status).toBe("ready"));
    expect(read.mock.calls.map(([value]) => value.input.lines.length)).toEqual([1000, 1]);
    const state = result.current.get(group().key)!;
    expect(state.status === "ready" && state.comparison.tiers[1]?.lines).toHaveLength(1001);
    expect(state.status === "ready" && state.comparison.tiers[1]?.subtotalPaise).toBe(100100);
  });

  it("limits concurrent reads and does not start cancelled queued groups", async () => {
    const pending: Array<{ input: EstimateTierComparisonRequest; value: ReturnType<typeof deferred<EstimateTierComparison>> }> = [];
    read.mockImplementation(input => { const value = deferred<EstimateTierComparison>(); pending.push({ input, value }); return value.promise; });
    const groups = Array.from({ length: 6 }, (_, index) => ({ key: `group-${index}`, request: request(`lead-${index}`) }));
    const { rerender, unmount } = renderHook(({ included }) => useEstimateTierSuggestions("actor-a", included),
      { initialProps: { included: groups }, wrapper: wrapper() });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(4));
    rerender({ included: groups.slice(0, 4) });
    await act(async () => { for (const entry of pending) entry.value.resolve(response(entry.input)); });
    expect(read).toHaveBeenCalledTimes(4);
    unmount();
  });
});
