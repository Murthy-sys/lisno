import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "expo-router";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProcurementVendorsWorkspace } from "./ProcurementVendorsWorkspace";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: jest.fn() }));
jest.mock("./ProcurementSubnavigation", () => ({ ProcurementSubnavigation: () => null }));
jest.mock("../knowledge/KnowledgeVendorEditor", () => ({ KnowledgeVendorEditor: ({ existing }: { existing?: { name: string } }) => {
  const NativeText = require("react-native").Text;
  return <NativeText>Vendor editor: {existing?.name ?? "new"}</NativeText>;
} }));

const get = jest.fn();
const del = jest.fn();
const invalidate = jest.fn(async () => undefined);
const vendor = { id: "vendor-one", masterType: "vendors", name: "Carpentry Co", code: "V001", status: "active", version: 7, procurementSummary: { vendorType: "supplier", mainBaskets: [{ id: "basket-one", name: "Carpentry", status: "active" }] } };
const second = { ...vendor, id: "vendor-two", name: "Masonry Co", code: "V002", version: 3 };
const page = (items: readonly unknown[], total = items.length, offset = 0, hasMore = false) => ({ items, pagination: { total, limit: 10, offset, hasMore } });
const allPermissions = ["procurement.vendor_directory.read", "procurement.vendor_directory.create", "procurement.vendor_directory.update", "procurement.vendor_directory.lifecycle", "procurement.vendor_classification.create", "procurement.vendor_allocation_baseline.correct"] as const;
function session(permissions: readonly string[] = allPermissions, role = "procurement"): AuthenticatedSession {
  return { user: { id: "procurement-one", role }, authorization: { permissions } } as unknown as AuthenticatedSession;
}
function setup() {
  get.mockImplementation(async (path: string) => {
    if (path.includes("includeDirectoryOverview")) return { ...page([vendor]), directoryOverview: { totalVendors: 21, activeVendors: 14, underReviewVendors: 5 } };
    if (path.includes("/baskets?")) return page([{ id: "basket-one", name: "Carpentry", status: "active" }]);
    if (path.includes("sub-baskets")) return page([]);
    if (path.includes("/vendors?")) return path.includes("offset=10") ? page([second], 11, 10) : page([vendor], 11, 0, true);
    throw new Error(`Unexpected request: ${path}`);
  });
  del.mockResolvedValue({ ...vendor, status: "archived", version: 8 });
  jest.mocked(useConfiguredRuntime).mockReturnValue({
    environment: { environment: { id: "environment-one" }, status: "ready", generation: 1 },
    session: { status: "authenticated", session: session(), generation: 1 },
    runtime: { api: { authenticated: { get, delete: del, post: jest.fn(), patch: jest.fn(), put: jest.fn() } } }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
  jest.mocked(useInvalidateEvent).mockReturnValue(invalidate);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const renderWorkspace = (current = session()) => render(<QueryClientProvider client={client}><ProcurementVendorsWorkspace session={current} /></QueryClientProvider>);
  return { client, renderWorkspace };
}
beforeEach(() => { jest.clearAllMocks(); setup(); });

describe("Procurement Vendors workspace", () => {
  it("shows server overview, vendor summaries, and pages by stable vendor ID", async () => {
    const { renderWorkspace } = setup();
    const view = await renderWorkspace();
    await view.findByText("Carpentry Co");
    expect(view.getByText("21")).toBeTruthy();
    expect(view.getByText("14")).toBeTruthy();
    expect(view.getByText("5")).toBeTruthy();
    expect(view.getByText("Showing 1–1 of 11")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Next vendor page" }));
    await view.findByText("Masonry Co");
    expect(get).toHaveBeenCalledWith(expect.stringContaining("offset=10"));
    expect(view.queryByText("Carpentry Co")).toBeNull();
    expect(view.getByText("Showing 11–11 of 11")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Edit Masonry Co" }));
    expect(view.getByText("Vendor editor: Masonry Co")).toBeTruthy();
    await fireEvent.press(view.getByRole("link", { name: "Open Masonry Co KPI" }));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/vendor/[vendorId]", params: { vendorId: "vendor-two", from: "procurement-vendors" } });
  });

  it("applies search and basket filters to the shared vendor endpoint", async () => {
    const { renderWorkspace } = setup();
    const view = await renderWorkspace();
    await view.findByText("Carpentry Co");
    await fireEvent.changeText(view.getByLabelText("Search vendors"), " Masonry ");
    await fireEvent.press(view.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("search=Masonry")));
    await fireEvent.press(view.getByRole("combobox", { name: "Main Basket" }));
    await fireEvent.press(view.getByRole("radio", { name: "Carpentry" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("mainBasketId=basket-one")));
    await fireEvent.press(view.getByRole("button", { name: "Reset filters" }));
    expect(view.getByLabelText("Search vendors").props.value).toBe("");
  });

  it("gates add and archive separately, and archives with the selected vendor version and reason", async () => {
    const { renderWorkspace } = setup();
    const limited = await renderWorkspace(session(["procurement.vendor_directory.read", "procurement.vendor_directory.lifecycle"]));
    await limited.findByText("Carpentry Co");
    expect(limited.queryByRole("button", { name: "Add vendor" })).toBeNull();
    expect(limited.getByRole("button", { name: "Archive Carpentry Co" })).toBeTruthy();
    await fireEvent.press(limited.getByRole("button", { name: "Archive Carpentry Co" }));
    expect(limited.getByRole("button", { name: "Archive vendor" })).toBeDisabled();
    await fireEvent.changeText(limited.getByLabelText("Reason for archiving"), "Duplicate registry entry");
    await fireEvent.press(limited.getByRole("button", { name: "Archive vendor" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/vendors/vendor-one", { expectedVersion: 7, reason: "Duplicate registry entry" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith("knowledge-changed"));
    await limited.unmount();
    const full = await renderWorkspace();
    await full.findByRole("button", { name: "Add vendor" });
    await fireEvent.press(full.getByRole("button", { name: "Add vendor" }));
    expect(full.getByText("Vendor editor: new")).toBeTruthy();
  });

  it("hides cached vendor data after permission loss and denies other roles", async () => {
    const { client, renderWorkspace } = setup();
    const view = await renderWorkspace();
    await view.findByText("Carpentry Co");
    await view.rerender(<QueryClientProvider client={client}><ProcurementVendorsWorkspace session={session([], "procurement")} /></QueryClientProvider>);
    expect(view.queryByText("Carpentry Co")).toBeNull();
    expect(view.getByText("Vendors unavailable")).toBeTruthy();
    await view.unmount();
    get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access removed"));
    get.mockClear();
    const deniedView = await renderWorkspace(session(allPermissions, "admin"));
    expect(deniedView.getByText("Vendors unavailable")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("removes displayed vendor rows when a refresh returns 403", async () => {
    const { renderWorkspace } = setup();
    const view = await renderWorkspace();
    await view.findByText("Carpentry Co");
    get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access removed"));
    let scroll = view.getByText("Vendors").parent;
    while (scroll && !scroll.props.refreshControl) scroll = scroll.parent;
    const refreshControl = scroll?.props.refreshControl as { props: { onRefresh: () => void } };
    await act(async () => { refreshControl.props.onRefresh(); });
    await view.findByText("Vendors unavailable");
    expect(view.queryByText("Carpentry Co")).toBeNull();
    expect(view.queryByRole("button", { name: "Add vendor" })).toBeNull();
  });
});
