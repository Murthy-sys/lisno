import { QueryClient, QueryClientProvider, focusManager, useQuery, useQueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useQuotationRevision } from "./useQuotationRevision";
import { quotationKeys } from "../client/quotationApi";

const remote = vi.hoisted(() => ({ version: 1, reads: vi.fn() }));
vi.mock("../client/quotationApi", () => ({
  quotationKeys: { revision: (id: string) => ["quotation", id, "revision"] },
  getQuotationRevision: async () => {
    remote.reads();
    return { estimateId: "estimate-one", estimateVersion: remote.version, pricedRevision: remote.version, status: "draft", phase: "pre" };
  }
}));

function Session({ name }: { name: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["leads", "estimate", "estimate-one"], queryFn: async () => ({ version: remote.version }) });
  useQuotationRevision("project-one", true, query.data?.version);
  return <div><output aria-label={`${name} revision`}>{query.data?.version}</output>
    <button onClick={() => { remote.version += 1; void client.invalidateQueries({ queryKey: ["leads"] }); }}>Save from {name}</button></div>;
}

afterEach(() => { focusManager.setFocused(undefined); vi.useRealTimers(); });
describe("Cross-session quotation revision", () => {
  it("refreshes a separate query client within five seconds and pauses requests in a hidden tab", async () => {
    vi.useFakeTimers(); remote.version = 1; remote.reads.mockClear(); focusManager.setFocused(true);
    const staff = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<><QueryClientProvider client={staff}><Session name="staff" /></QueryClientProvider><QueryClientProvider client={client}><Session name="client" /></QueryClientProvider></>);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByRole("status", { name: "staff revision" })).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Save from client" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByRole("status", { name: "client revision" })).toHaveTextContent("2");
    expect(screen.getByRole("status", { name: "staff revision" })).toHaveTextContent("1");
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(screen.getByRole("status", { name: "staff revision" })).toHaveTextContent("2");
    focusManager.setFocused(false);
    const reads = remote.reads.mock.calls.length;
    remote.version = 3;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(remote.reads).toHaveBeenCalledTimes(reads);
    await act(async () => { focusManager.setFocused(true); await vi.advanceTimersByTimeAsync(20); });
    expect(staff.getQueryData(quotationKeys.revision("project-one"))).toMatchObject({ estimateVersion: 3 });
    expect(screen.getByRole("status", { name: "staff revision" })).toHaveTextContent("3");
    view.unmount(); staff.clear(); client.clear();
  });
});
