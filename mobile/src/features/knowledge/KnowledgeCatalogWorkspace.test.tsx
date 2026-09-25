import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import type { ReactNode } from "react";
import { createKnowledgeApi } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeBasket } from "../../../../shared/knowledge/knowledgeTypes";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { KnowledgeCatalogWorkspace, KnowledgeCreateItem } from "./KnowledgeCatalogWorkspace";
import { KnowledgeBasketEditor, KnowledgeCatalogManagement } from "./KnowledgeCatalogManagement";
import { KnowledgeReusableEditor } from "./KnowledgeReusableValues";
import { useKnowledgeContext, type KnowledgeMobileContext } from "./knowledgeRuntime";

jest.mock("../../navigation/useScreenBack", () => ({ useScreenBack: () => ({ onBack: jest.fn(), visible: true, disabled: false }) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("./KnowledgeVendorEditor", () => ({ KnowledgeVendorEditor: () => null }));
jest.mock("./knowledgeRuntime", () => ({ ...jest.requireActual("./knowledgeRuntime"), useKnowledgeContext: jest.fn() }));
jest.mock("./KnowledgeItemWorkspace", () => ({ KnowledgeItemWorkspace: () => null }), { virtual: true });
jest.mock("react-native", () => {
  const native = jest.requireActual("react-native");
  const React = jest.requireActual("react");
  const Pressable = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(300, 280, 44, 44), focus: jest.fn() }));
    return React.createElement(native.Pressable, props);
  });
  return new Proxy(native, { get: (target, key) => key === "Pressable" ? Pressable : Reflect.get(target, key) });
});
const get = jest.fn();
const post = jest.fn();
const patch = jest.fn();
const del = jest.fn();
const refresh = jest.fn(async () => undefined);
const basket = { id: "basket-a", name: "Carpentry", description: null, displayOrder: 0, status: "active", version: 3, createdAt: "2026-09-25T00:00:00Z", updatedAt: "2026-09-25T00:00:00Z", createdById: "user-a", updatedById: "user-a" } satisfies KnowledgeBasket;
const otherBasket = { ...basket, id: "basket-b", name: "Painting", version: 11 };
const session = { user: { id: "user-a", role: "super_admin" }, authorization: { permissions: [] } } as unknown as AuthenticatedSession;
function page(items: readonly unknown[], offset = 0, hasMore = false) { return { items, pagination: { total: hasMore ? items.length + 1 : items.length, limit: 100, offset, hasMore } }; }
function context(overrides: Partial<KnowledgeMobileContext> = {}): KnowledgeMobileContext {
  return { api: createKnowledgeApi({ get, post, patch, delete: del, put: jest.fn() }), key: (...parts) => ["test", "user-a", "knowledge", ...parts], scopeKey: "test:user-a:1:1", ready: true, canRead: true, canCreate: true, canUpdate: true, canLifecycle: true, canCreateQualityOptions: true, refresh, ...overrides };
}
async function mount(element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation(async (path: string) => path.includes("sub-baskets") ? page([]) : path.includes("/baskets?") ? page([basket]) : page([]));
  post.mockResolvedValue({ mainLineId: "new-item" });
  patch.mockResolvedValue({ ...basket, version: 4 });
  del.mockResolvedValue({ deleted: true });
  jest.mocked(useKnowledgeContext).mockReturnValue(context());
});

async function chooseMenu(view: Awaited<ReturnType<typeof mount>>, label: string) {
  const dismissed = view.getByTestId("configuration-context-menu").props.onDismiss;
  await fireEvent.press(view.getByRole("menuitem", { name: label }));
  if (Platform.OS === "ios") await act(async () => dismissed());
}

describe("Native Configuration catalog", () => {
  it("starts with the first basket expanded and edits the chosen basket by its own ID and version", async () => {
    get.mockImplementation(async (path: string) => path.includes("/baskets?") ? page([basket, otherBasket]) : page([]));
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await view.findByRole("button", { name: "Collapse Carpentry" });
    expect(view.getByRole("button", { name: "Expand Painting" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Actions for Painting" }));
    expect(view.getAllByRole("menuitem").map(node => node.props.accessibilityLabel)).toEqual(["Edit main line", "Add estimation item", "Add temporary item", "Delete main line"]);
    await chooseMenu(view, "Edit main line");
    expect(view.getByLabelText("Name").props.value).toBe("Painting");
    await fireEvent.changeText(view.getByLabelText("Name"), "Wall painting");
    await fireEvent.press(view.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket-b", expect.objectContaining({ name: "Wall painting", expectedVersion: 11 })));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it.each([["Add estimation item", "main_line"], ["Add temporary item", "temporary"]])("preselects the selected main basket for %s", async (label, itemType) => {
    get.mockImplementation(async (path: string) => path.includes("/baskets?") ? page([basket, otherBasket]) : page([]));
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Actions for Painting" }));
    await chooseMenu(view, label);
    await waitFor(() => expect(view.getByRole("combobox", { name: "Main basket" }).props.accessibilityValue.text).toBe("Painting"));
    expect(post).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText("Item name"), "Primer finish");
    await waitFor(() => expect(view.getByRole("button", { name: "Create item" })).not.toBeDisabled());
    await fireEvent.press(view.getByRole("button", { name: "Create item" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket-b/main-lines", expect.objectContaining({ name: "Primer finish", itemType })));
  });

  it("opens deletion impact from the basket menu and requires confirmation before deleting that basket", async () => {
    get.mockImplementation(async (path: string) => path.includes("/basket-b/deletion-impact") ? { basketId: "basket-b", basketName: "Painting", version: 13, mainLineCount: 2, subBasketCount: 1, historicalReferenceCount: 3, vendorReferenceCount: 0 } : path.includes("/baskets?") ? page([basket, otherBasket]) : page([]));
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Actions for Painting" }));
    await chooseMenu(view, "Delete main line");
    await view.findByText("Deletion impact");
    expect(del).not.toHaveBeenCalled();
    expect(view.getByRole("button", { name: "Permanently delete" })).toBeDisabled();
    await fireEvent.changeText(view.getByLabelText("Type Painting to confirm"), "Carpentry");
    await fireEvent.changeText(view.getByLabelText("Reason for deletion"), "Unused category");
    expect(view.getByRole("button", { name: "Permanently delete" })).toBeDisabled();
    await fireEvent.changeText(view.getByLabelText("Type Painting to confirm"), "Painting");
    await fireEvent.press(view.getByRole("button", { name: "Permanently delete" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket-b", { expectedVersion: 13, confirmationName: "Painting", reason: "Unused category" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("keeps contextual actions scoped to permissions and active basket status", async () => {
    jest.mocked(useKnowledgeContext).mockReturnValue(context({ canUpdate: false, canLifecycle: false }));
    get.mockImplementation(async (path: string) => path.includes("/baskets?") ? page([basket, { ...otherBasket, status: "inactive" }]) : page([]));
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await view.findByRole("button", { name: "Actions for Carpentry" });
    expect(view.queryByRole("button", { name: "Actions for Painting" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Actions for Carpentry" }));
    expect(view.getAllByRole("menuitem").map(node => node.props.accessibilityLabel)).toEqual(["Add estimation item", "Add temporary item"]);
    expect(patch).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("recovers to an available page when a refreshed later page no longer exists", async () => {
    const catalogItem = { ...basket, mainLineId: "line-a", mainLineName: "Cabinet", basketId: basket.id, basketName: basket.name, itemType: "main_line", completionRequired: false, status: "draft", uomId: null, priorityId: null, completeness: { percentage: 0, sections: [], blockers: [], warnings: [] } };
    get.mockImplementation(async (path: string) => {
      if (path.includes("/baskets?")) return page([basket]);
      if (!path.includes("/items?")) return page([]);
      if (path.includes("offset=20")) return { items: [], pagination: { total: 1, limit: 20, offset: 20, hasMore: false } };
      return { items: [catalogItem], pagination: { total: 21, limit: 20, offset: 0, hasMore: true } };
    });
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await waitFor(() => expect(view.getByRole("button", { name: "Next page" })).not.toBeDisabled());
    await fireEvent.press(view.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/items\?.*offset=20/)));
    await waitFor(() => expect(view.getByRole("button", { name: "Previous page" })).toBeDisabled());
    expect(view.getByRole("button", { name: "Open Cabinet" })).toBeTruthy();
  });

  it("opens the existing creation form from Actions while preserving the basket list", async () => {
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await view.findByRole("button", { name: "Collapse Carpentry" });
    expect(view.queryByRole("button", { name: "Add main basket" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Actions" }));
    const dismissed = view.getByTestId("configuration-actions-modal").props.onDismiss;
    await fireEvent.press(view.getByRole("button", { name: "Add main basket" }));
    if (Platform.OS === "ios") await act(async () => dismissed());
    expect(view.getByLabelText("Name")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Close Actions" })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("submits the compact search field through the original catalog query", async () => {
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await view.findByRole("button", { name: "Collapse Carpentry" });
    await fireEvent.changeText(view.getByLabelText("Search by basket or main line name"), "  ceiling  ");
    await fireEvent.press(view.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("search=ceiling")));
  });

  it("creates a temporary item directly in its main basket without requiring a sub-basket", async () => {
    const saved = jest.fn();
    const view = await mount(<KnowledgeCreateItem context={context()} itemType="temporary" initialBasketId={basket.id} onClose={jest.fn()} onCreated={saved} />);
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("/basket-a/sub-baskets?")));
    await fireEvent.changeText(view.getByLabelText("Item name"), "Temporary joinery");
    await fireEvent.press(view.getByRole("button", { name: "Create item" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket-a/main-lines", { itemType: "temporary", name: "Temporary joinery", description: null }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith("new-item"));
  });

  it("loads later main-basket pages before allowing a stable-ID selection", async () => {
    get.mockImplementation(async (path: string) => path.includes("sub-baskets") ? page([]) : path.includes("offset=100") ? page([{ ...basket, id: "basket-b", name: "Ceilings" }], 100) : page([basket], 0, true));
    const view = await mount(<KnowledgeCreateItem context={context()} itemType="main_line" onClose={jest.fn()} onCreated={jest.fn()} />);
    await waitFor(() => expect(view.getByRole("combobox", { name: "Main basket" }).props.accessibilityState.disabled).toBe(false));
    expect(get).toHaveBeenCalledWith(expect.stringContaining("offset=100"));
    await fireEvent.press(view.getByRole("combobox", { name: "Main basket" }));
    await fireEvent.press(view.getByRole("radio", { name: "Ceilings" }));
    await fireEvent.changeText(view.getByLabelText("Item name"), "Ceiling finish");
    await waitFor(() => expect(view.getByRole("button", { name: "Create item" }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(view.getByRole("button", { name: "Create item" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.stringContaining("baskets/basket-b/main-lines"), expect.objectContaining({ name: "Ceiling finish" })));
  });

  it("does not expose a partial catalog as editable after a later page fails", async () => {
    get.mockImplementation(async (path: string) => { if (path.includes("offset=100")) throw new Error("Second page unavailable"); return page([basket], 0, true); });
    const view = await mount(<KnowledgeCreateItem context={context()} itemType="main_line" initialBasketId={basket.id} onClose={jest.fn()} onCreated={jest.fn()} />);
    await view.findByText("Main baskets unavailable");
    await fireEvent.changeText(view.getByLabelText("Item name"), "Ceiling finish");
    expect(view.getByRole("button", { name: "Create item" }).props.accessibilityState.disabled).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps create controls hidden for read-only users and sends stable filter IDs", async () => {
    jest.mocked(useKnowledgeContext).mockReturnValue(context({ canCreate: false, canUpdate: false, canLifecycle: false }));
    get.mockImplementation(async (path: string) => path.includes("/baskets?") ? page([basket]) : path.includes("/uoms?") ? page([{ id: "uom-area", name: "Square feet", code: "SQFT", status: "active" }]) : page([]));
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("/uoms?")));
    await fireEvent.press(view.getByRole("button", { name: "Actions" }));
    expect(view.getByRole("button", { name: "Manage reusable values" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Add main basket" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Close Actions" }));
    await fireEvent.press(view.getByRole("button", { name: "Filters" }));
    await fireEvent.press(view.getByRole("combobox", { name: "UOM" }));
    await fireEvent.press(view.getByRole("radio", { name: "Square feet" }));
    await fireEvent.press(view.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("uomId=uom-area")));
  });

  it("makes no catalog requests when configuration read access is absent", async () => {
    jest.mocked(useKnowledgeContext).mockReturnValue(context({ canRead: false }));
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    expect(view.getByText("Configuration access required")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("preserves edits and blocks stale basket resubmission after a version conflict", async () => {
    patch.mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Changed"));
    const view = await mount(<KnowledgeBasketEditor context={context()} basket={basket} onClose={jest.fn()} onSaved={jest.fn()} />);
    await fireEvent.changeText(view.getByLabelText("Name"), "Updated carpentry");
    await fireEvent.press(view.getByRole("button", { name: "Save changes" }));
    await view.findByText(/This record changed elsewhere/);
    expect(patch).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket-a", expect.objectContaining({ expectedVersion: 3, name: "Updated carpentry" }));
    expect(view.getByLabelText("Name").props.value).toBe("Updated carpentry");
    expect(view.getByRole("button", { name: "Save changes" }).props.accessibilityState.disabled).toBe(true);
  });

  it("requires name, reason and the server impact token before deleting a sub-basket", async () => {
    get.mockImplementation(async (path: string) => path.includes("deletion-impact") ? { basketId: basket.id, subBasketId: "sub-a", subBasketName: "Joinery", version: 7, mainLineCount: 2, referenceCount: 4, vendorReferenceCount: 1, impactToken: "impact-token" } : path.includes("sub-baskets") ? page([{ ...basket, basketId: basket.id, id: "sub-a", name: "Joinery", version: 6 }]) : page([basket]));
    const view = await mount(<KnowledgeCatalogManagement context={context()} initialBasketId={basket.id} onClose={jest.fn()} />);
    await fireEvent.press(await view.findByRole("button", { name: "Delete sub-basket Joinery" }));
    await view.findByText("Deletion impact");
    expect(view.getByRole("button", { name: "Permanently delete" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(view.getByLabelText("Type Joinery to confirm"), "Joinery");
    await fireEvent.changeText(view.getByLabelText("Reason for deletion"), "Obsolete classification");
    await fireEvent.press(view.getByRole("button", { name: "Permanently delete" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket-a/sub-baskets/sub-a", { expectedVersion: 7, confirmationName: "Joinery", reason: "Obsolete classification", impactToken: "impact-token" }));
  });

  it("creates UOM decimal precision through the shared typed contract", async () => {
    const view = await mount(<KnowledgeReusableEditor context={context()} type="uoms" onClose={jest.fn()} onSaved={jest.fn()} />);
    await fireEvent.changeText(view.getByLabelText("Code"), "SQFT");
    await fireEvent.changeText(view.getByLabelText("Name"), "Square feet");
    await fireEvent.press(view.getByRole("combobox", { name: "Quantity decimal places" }));
    await fireEvent.press(view.getByRole("radio", { name: "2" }));
    await fireEvent.press(view.getByRole("button", { name: "Add UOM" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/uoms", { code: "SQFT", name: "Square feet", description: null, decimalScale: 2 }));
  });
});
