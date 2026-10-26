import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/client";
import { configuredLineAmountPaise } from "./configuredEstimate";
import { componentDraftFixture, componentPricingFixture } from "./estimateComponentPricing.testFixtures";
import { useEstimateInHousePricing } from "./useEstimateInHousePricing";

const wrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
afterEach(() => vi.restoreAllMocks());

describe("quantity-aware component previews", () => {
  it("never uses a late response for an earlier quantity", async () => {
    let first!: (value: unknown) => void;
    const draft = componentDraftFixture();
    vi.spyOn(apiClient, "post").mockImplementationOnce(() => new Promise(resolve => { first = resolve; }))
      .mockResolvedValueOnce({ lines: [{ key: draft.key, state: "ready", componentPricing: componentPricingFixture("line-a", 3, 90000), issues: [] }] });
    const { result, rerender } = renderHook(({ quantity }) => useEstimateInHousePricing("lead-a", [{ ...draft, quantity }], true), { initialProps: { quantity: 2 }, wrapper: wrapper() });
    expect(configuredLineAmountPaise(result.current[0]!)).toBeNull();
    rerender({ quantity: 3 });
    await waitFor(() => expect(configuredLineAmountPaise(result.current[0]!)).toBe(90000));
    await act(async () => first({ lines: [{ key: draft.key, state: "ready", componentPricing: componentPricingFixture(), issues: [] }] }));
    expect(configuredLineAmountPaise(result.current[0]!)).toBe(90000);
  });
  it("preserves failed inputs and retries with the same current quantity", async () => {
    const draft = componentDraftFixture();
    vi.spyOn(apiClient, "post").mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce({ lines: [{ key: draft.key, state: "ready", componentPricing: componentPricingFixture(), issues: [] }] });
    const { result } = renderHook(() => useEstimateInHousePricing("lead-a", [draft], true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current[0]?.componentPricingState).toBe("error"));
    expect(result.current[0]?.quantity).toBe(2);
    expect(configuredLineAmountPaise(result.current[0]!)).toBeNull();
    act(() => result.current[0]?.componentPricingRetry?.());
    await waitFor(() => expect(configuredLineAmountPaise(result.current[0]!)).toBe(78333));
  });
  it("invalidates a live amount when Configuration changes and rejects obsolete evidence", async () => {
    const draft = componentDraftFixture();
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ lines: [{ key: draft.key, state: "ready", componentPricing: componentPricingFixture(), issues: [] }] });
    const { result, rerender } = renderHook(({ revisionVersion }) => useEstimateInHousePricing("lead-a", [{ ...draft, revisionVersion }], true),
      { initialProps: { revisionVersion: 3 }, wrapper: wrapper() });
    await waitFor(() => expect(configuredLineAmountPaise(result.current[0]!)).toBe(78333));
    rerender({ revisionVersion: 4 });
    expect(configuredLineAmountPaise(result.current[0]!)).toBeNull();
    await waitFor(() => expect(result.current[0]?.componentPricingState).toBe("incomplete"));
    expect(post).toHaveBeenLastCalledWith("/leads/lead-a/estimate/in-house-preview", { lines: [expect.objectContaining({ revisionVersion: 4 })] }, expect.objectContaining({ showGlobalLoader: false }));
    expect(result.current[0]?.quantity).toBe(2);
  });
  it("keeps incomplete or conflicted server evidence out of totals", async () => {
    const draft = componentDraftFixture();
    vi.spyOn(apiClient, "post").mockResolvedValue({ lines: [{ key: draft.key, state: "conflict", componentPricing: componentPricingFixture(), issues: [{ code: "STALE", message: "Configuration changed. Refresh available items." }] }] });
    const { result } = renderHook(() => useEstimateInHousePricing("lead-a", [draft], true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current[0]?.componentPricingState).toBe("incomplete"));
    expect(configuredLineAmountPaise(result.current[0]!)).toBeNull();
    expect(result.current[0]?.componentPricingIssue).toBe("Configuration changed. Refresh available items.");
  });
  it("does not preview manual, excluded, other-mode or historical read-only lines", () => {
    const post = vi.spyOn(apiClient, "post");
    const draft = componentDraftFixture();
    const { result } = renderHook(() => useEstimateInHousePricing("lead-a", [draft], false), { wrapper: wrapper() });
    expect(configuredLineAmountPaise(result.current[0]!)).toBe(78333);
    renderHook(() => useEstimateInHousePricing("lead-a", [{ ...draft, included: false }, { ...draft, pricingMode: "pmc" }, { ...draft, rateSource: "manual" }], true), { wrapper: wrapper() });
    expect(post).not.toHaveBeenCalled();
  });
});
