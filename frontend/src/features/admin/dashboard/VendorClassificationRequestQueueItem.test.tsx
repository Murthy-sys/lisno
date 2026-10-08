import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../../api/client";
import { vendorBasketRequestKeys } from "../../procurement/vendorBasketRequestApi";
import { VendorClassificationRequestQueueItem } from "./VendorClassificationRequestQueueItem";

const pendingPage = (total: number) => ({ items: [], pagination: { total, limit: 1, offset: 0, hasMore: total > 1 } });

function start() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter><ul><VendorClassificationRequestQueueItem /></ul></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

afterEach(() => { cleanup(); focusManager.setFocused(undefined); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Vendor classification request queue", () => {
  it("uses the server total rather than page length and links directly to pending review", async () => {
    const read = vi.spyOn(apiClient, "get").mockResolvedValue(pendingPage(37));
    start();
    expect(await screen.findByLabelText("37 pending vendor classification requests")).toHaveTextContent("37");
    expect(read).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/basket-requests?limit=1&offset=0&status=pending");
    expect(screen.getByRole("link", { name: /Vendor classification requests/ })).toHaveAttribute("href", "/admin/configuration/estimation?basketRequests=pending");
  });

  it("shows loading and unavailable counts without inventing zero, and retries", async () => {
    let fail!: (error: Error) => void;
    const waiting = new Promise<never>((_, reject) => { fail = reject; });
    const read = vi.spyOn(apiClient, "get").mockReturnValueOnce(waiting).mockResolvedValue(pendingPage(0));
    start();
    expect(screen.getByLabelText("Loading count…")).toHaveTextContent("—");
    await act(async () => { fail(new Error("offline")); });
    expect(await screen.findByLabelText("Count unavailable")).toHaveTextContent("—");
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry request count" }));
    expect(await screen.findByLabelText("0 pending vendor classification requests")).toHaveTextContent("0");
    expect(screen.getByText(/No pending requests/)).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("marks cached data stale after refresh failure and updates on focus in a separate session", async () => {
    let total = 2;
    const read = vi.spyOn(apiClient, "get").mockImplementation(async () => pendingPage(total) as never);
    start();
    await screen.findByLabelText("2 pending vendor classification requests");
    read.mockRejectedValueOnce(new Error("offline"));
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh request count" }));
    expect(await screen.findByText(/Previous count; refresh failed/)).toBeVisible();
    expect(screen.getByLabelText("2 pending vendor classification requests")).toHaveTextContent("2");
    total = 5;
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
    expect(await screen.findByLabelText("5 pending vendor classification requests")).toHaveTextContent("5");
    expect(screen.queryByText(/refresh failed/)).not.toBeInTheDocument();
  });

  it("refreshes after a decision invalidates the review prefix", async () => {
    const read = vi.spyOn(apiClient, "get").mockResolvedValueOnce(pendingPage(4)).mockResolvedValue(pendingPage(3));
    const { client } = start();
    await screen.findByLabelText("4 pending vendor classification requests");
    await act(async () => { await client.invalidateQueries({ queryKey: vendorBasketRequestKeys.review }); });
    expect(await screen.findByLabelText("3 pending vendor classification requests")).toHaveTextContent("3");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("polls while visible, pauses while hidden, and cleans up after unmount", async () => {
    const read = vi.spyOn(apiClient, "get").mockResolvedValue(pendingPage(1));
    const view = start();
    await screen.findByLabelText("1 pending vendor classification requests");
    vi.useFakeTimers();
    // Remount an observer so its interval uses the fake clock.
    view.unmount();
    const mounted = start();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const initialCalls = read.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(read.mock.calls.length).toBeGreaterThan(initialCalls);
    act(() => focusManager.setFocused(false));
    const visibleCalls = read.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(read).toHaveBeenCalledTimes(visibleCalls);
    mounted.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(read).toHaveBeenCalledTimes(visibleCalls);
  });
});
