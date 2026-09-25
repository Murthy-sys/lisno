import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeVendorBaseline } from "./KnowledgeVendorBaseline";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));
const row = { itemId: "item/one", projectId: "project-1", projectName: "Synthetic project", itemName: "Panel", brand: "Brand", version: 5 };
const page = { items: [row], total: 1, limit: 20, offset: 0 };
const result = { itemId: row.itemId, projectId: row.projectId, vendorId: "vendor/one", allocatedWorkPaise: 123456, version: 6, recordedAt: "2026-09-25T10:00:00Z" };
const mockRuntime = jest.mocked(useConfiguredRuntime);
const mockInvalidate = jest.mocked(useInvalidateEvent);
const clients: QueryClient[] = [];
afterEach(async () => { for (const client of clients.splice(0)) { await client.cancelQueries(); client.clear(); } });

function setup(options: { canRead?: boolean; canUpdate?: boolean; refreshFails?: boolean } = {}) {
  const get = jest.fn().mockResolvedValue(page);
  const post = jest.fn().mockResolvedValue(result);
  const invalidate = jest.fn().mockResolvedValue(undefined);
  const refresh = jest.fn();
  if (options.refreshFails) refresh.mockRejectedValue(new Error("Cache refresh failed")); else refresh.mockResolvedValue(undefined);
  mockRuntime.mockReturnValue({ runtime: { api: { authenticated: { get, post } } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
  mockInvalidate.mockReturnValue(invalidate);
  const context = { scopeKey: "environment:user", ready: true, canRead: options.canRead ?? true, canUpdate: options.canUpdate ?? true,
    key: (...parts: readonly unknown[]) => ["environment", "user", "knowledge", ...parts], refresh
  } as unknown as KnowledgeMobileContext;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const onClose = jest.fn();
  const element = (current = context) => <QueryClientProvider client={client}><KnowledgeVendorBaseline context={current} vendorId="vendor/one" canUpdate={options.canUpdate ?? true} onClose={onClose} /></QueryClientProvider>;
  return { get, post, invalidate, refresh, context, client, onClose, element };
}
async function enterCorrection() {
  await fireEvent.press(await screen.findByRole("button", { name: "Record historical amount for Panel" }));
  await fireEvent.changeText(screen.getByLabelText("Historical allocated work (INR)"), "1234.56");
  await fireEvent.changeText(screen.getByLabelText("Historical correction reason"), "  Missing original allocation  ");
}

describe("native vendor historical allocations", () => {
  beforeEach(() => jest.clearAllMocks());
  it("uses authenticated scoped queries and posts versioned integer paise then invalidates related views", async () => {
    const test = setup(); await render(test.element()); await enterCorrection();
    test.get.mockResolvedValue({ ...page, items: [], total: 0 });
    await fireEvent.press(screen.getByRole("button", { name: "Record historical amount" }));
    await screen.findByText("Historical allocation recorded. This correction does not create new work.");
    expect(test.get.mock.calls[0]?.[0]).toBe("/admin/ai-estimator-knowledge/vendors/vendor%2Fone/allocation-baseline?limit=20&offset=0");
    expect(test.post).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/vendors/vendor%2Fone/allocation-baseline/item%2Fone", { expectedVersion: 5, allocatedWorkPaise: 123456, reason: "Missing original allocation", idempotencyKey: expect.stringMatching(/^mobile-/) });
    expect(test.refresh).toHaveBeenCalledTimes(1);
    expect(test.invalidate).toHaveBeenCalledWith("procurement-changed");
    expect(test.client.getQueryCache().findAll()[0]?.queryKey).toEqual(["environment", "user", "knowledge", "vendor-baseline", "vendor/one", 0]);
  });

  it("retries the exact frozen command after an uncertain response and locks dismissal and inputs", async () => {
    const test = setup(); test.post.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Try again")).mockResolvedValueOnce(result);
    await render(test.element()); await enterCorrection();
    await fireEvent.press(screen.getByRole("button", { name: "Record historical amount" }));
    await screen.findByRole("button", { name: "Retry same correction" });
    expect(screen.getByLabelText("Historical allocated work (INR)")).toHaveProp("editable", false);
    expect(screen.getByRole("button", { name: "Cancel correction" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Retry same correction" }));
    await waitFor(() => expect(test.post).toHaveBeenCalledTimes(2));
    expect(test.post.mock.calls[1]).toEqual(test.post.mock.calls[0]);
    await screen.findByText("Historical allocation recorded. This correction does not create new work.");
  });

  it("requires a fresh selection after a version conflict and rejects partial decimal input locally", async () => {
    const test = setup(); test.post.mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere"));
    await render(test.element()); await enterCorrection();
    await fireEvent.changeText(screen.getByLabelText("Historical allocated work (INR)"), "12.");
    await fireEvent.press(screen.getByRole("button", { name: "Record historical amount" }));
    expect(test.post).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Historical allocated work (INR)"), "1234.56");
    await fireEvent.press(screen.getByRole("button", { name: "Record historical amount" }));
    await screen.findByRole("button", { name: "Reload eligible historical items" });
    expect(screen.getByRole("button", { name: "Record historical amount" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Reload eligible historical items" }));
    expect(screen.queryByLabelText("Historical allocated work (INR)")).toBeNull();
  });

  it("does not expose cached rows without read access and does not offer writes to read-only users", async () => {
    const denied = setup({ canRead: false });
    const view = await render(denied.element());
    expect(denied.get).not.toHaveBeenCalled();
    expect(screen.getByText("Your current access does not allow historical allocations.")).toBeTruthy();
    await view.unmount();
    const readOnly = setup({ canUpdate: false }); await render(readOnly.element());
    await screen.findByText("Synthetic project: Panel");
    expect(screen.queryByRole("button", { name: "Record historical amount for Panel" })).toBeNull();
  });

  it("keeps a committed correction successful if cache refresh fails", async () => {
    const test = setup({ refreshFails: true }); await render(test.element()); await enterCorrection();
    await fireEvent.press(screen.getByRole("button", { name: "Record historical amount" }));
    await screen.findByText("Historical allocation recorded. Some views could not refresh; reload them to see the correction.");
    expect(screen.getByRole("button", { name: "Close" })).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry same correction" })).toBeNull();
  });

  it("drops the old correction draft and data when the user/environment scope changes", async () => {
    const test = setup(); const view = await render(test.element()); await enterCorrection();
    test.get.mockReturnValue(new Promise(() => undefined));
    await view.rerender(test.element({ ...test.context, scopeKey: "second:user", key: (...parts: readonly unknown[]) => ["second", "user", "knowledge", ...parts] } as unknown as KnowledgeMobileContext));
    expect(screen.queryByLabelText("Historical allocated work (INR)")).toBeNull();
    expect(screen.queryByText("Synthetic project: Panel")).toBeNull();
  });
});
