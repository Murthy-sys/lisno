import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import type { ReactNode } from "react";
import { createKnowledgeApi } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeItemListItem, KnowledgeSubBasket } from "../../../../shared/knowledge/knowledgeTypes";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { KnowledgeCatalogWorkspace, KnowledgeCreateItem } from "./KnowledgeCatalogWorkspace";
import { KnowledgeBasketEditor, KnowledgeCatalogManagement } from "./KnowledgeCatalogManagement";
import { KnowledgeReusableEditor } from "./KnowledgeReusableValues";
import { useKnowledgeContext, type KnowledgeMobileContext } from "./knowledgeRuntime";

jest.mock("../../navigation/useScreenBack", () => ({ useScreenBack: () => ({ onBack: jest.fn(), visible: true, disabled: false }), useBackInterceptor: jest.fn() }));
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
const subBasket = { ...basket, basketId: basket.id, id: "sub-a", name: "Finishes", version: 7 } satisfies KnowledgeSubBasket;
const catalogItem = {
  ...basket, id: "line-record-a", mainLineId: "line-a", mainLineName: "Wall finish", basketId: basket.id, basketName: basket.name,
  subBasketId: subBasket.id, subBasketName: subBasket.name, itemType: "main_line", completionRequired: false,
  status: "draft", activeRevisionId: null, draftRevisionId: "revision-a", revisionNumber: 1, uomId: null, priorityId: null,
  modeIds: [], surfaceIds: [], vendorIds: [], allowedActions: [], completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }
} satisfies KnowledgeItemListItem;
const itemDetail = { ...catalogItem, version: 17, activeRevision: null, draftRevision: null, blockers: [], warnings: [] } satisfies KnowledgeItemDetail;
const session = { user: { id: "user-a", role: "super_admin" }, authorization: { permissions: [] } } as unknown as AuthenticatedSession;
function page(items: readonly unknown[], offset = 0, hasMore = false) { return { items, pagination: { total: hasMore ? items.length + 1 : items.length, limit: 100, offset, hasMore } }; }
function serveCatalog({ baskets = [basket], subBaskets = [subBasket], items = [catalogItem], detail = itemDetail }: { baskets?: KnowledgeBasket[]; subBaskets?: KnowledgeSubBasket[]; items?: KnowledgeItemListItem[]; detail?: KnowledgeItemDetail } = {}) {
  get.mockImplementation(async (path: string) => {
    if (path.includes("/main-lines/")) return detail;
    if (path.includes("/items?")) return page(items);
    if (path.includes("/baskets?")) return page(baskets);
    if (path.includes("/sub-baskets?")) {
      const parentId = path.match(/\/baskets\/([^/]+)\/sub-baskets\?/)?.[1];
      return page(subBaskets.filter(value => value.basketId === parentId));
    }
    return page([]);
  });
}
function context(overrides: Partial<KnowledgeMobileContext> = {}): KnowledgeMobileContext {
  return { api: createKnowledgeApi({ get, post, patch, delete: del, put: jest.fn() }), key: (...parts) => ["test", "user-a", "knowledge", ...parts], scopeKey: "test:user-a:1:1", ready: true, canRead: true, canCreate: true, canUpdate: true, canLifecycle: true, canCreateClassification: true, canCorrectBaseline: true, canCreateQualityOptions: true, refresh, ...overrides };
}
async function mount(element: ReactNode, onClient?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  onClient?.(client);
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  refresh.mockImplementation(async () => undefined);
  get.mockImplementation(async (path: string) => path.includes("sub-baskets") ? page([]) : path.includes("/baskets?") ? page([basket]) : page([]));
  post.mockResolvedValue({ mainLineId: "new-item" });
  patch.mockResolvedValue({ ...basket, version: 4 });
  del.mockResolvedValue({ deleted: true });
  jest.mocked(useKnowledgeContext).mockReturnValue(context());
});
afterEach(() => jest.restoreAllMocks());

async function chooseMenu(view: Awaited<ReturnType<typeof mount>>, label: string) {
  const dismissed = view.getByTestId("configuration-context-menu").props.onDismiss;
  await fireEvent.press(view.getByRole("menuitem", { name: label }));
  if (Platform.OS === "ios") await act(async () => dismissed());
}

describe("Native Configuration catalog", () => {
  it("renames an empty Sub-Basket from its own heading and retains its expanded state", async () => {
    const empty = { ...subBasket, id: "sub-empty", name: "Empty group", version: 9 };
    serveCatalog({ subBaskets: [subBasket, empty] });
    patch.mockResolvedValue({ ...empty, name: "Prepared group", version: 10 });
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Expand Sub-Basket Empty group" }));
    expect(view.getByText("No items on this page.")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Edit Sub-Basket name: Empty group in Carpentry" }));
    expect(view.getByLabelText("Name").props.value).toBe("Empty group");
    expect(view.getByText("Main basket: Carpentry")).toBeTruthy();
    expect(view.getByRole("button", { name: "Save name" })).toBeDisabled();
    await fireEvent.changeText(view.getByLabelText("Name"), "  Prepared group  ");
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket-a/sub-baskets/sub-empty", { expectedVersion: 9, name: "Prepared group", managementContext: "configuration" }));
    expect(await view.findByRole("button", { name: "Collapse Sub-Basket Prepared group" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Edit Sub-Basket name: Prepared group in Carpentry" })).toBeTruthy();
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("keeps a committed empty Sub-Basket visible if its actual catalog refetch fails", async () => {
    let current = { ...subBasket, id: "sub-empty", name: "Empty group", version: 9 };
    let failSubBasketLoad = false;
    get.mockImplementation(async (path: string) => {
      if (path.includes("/sub-baskets?")) {
        if (failSubBasketLoad) throw new Error("Sub-Basket reload failed");
        return page([current]);
      }
      if (path.includes("/baskets?")) return page([basket]);
      return page([]);
    });
    patch.mockImplementation(async () => {
      current = { ...current, name: "Prepared group", version: 10 };
      failSubBasketLoad = true;
      return current;
    });
    let client!: QueryClient;
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />, value => { client = value; });
    refresh.mockImplementation(async () => {
      await client.invalidateQueries({ queryKey: ["test", "user-a", "knowledge", "sub-baskets", basket.id, "catalog-index"] });
    });
    await fireEvent.press(await view.findByRole("button", { name: "Expand Sub-Basket Empty group" }));
    await fireEvent.press(view.getByRole("button", { name: "Edit Sub-Basket name: Empty group in Carpentry" }));
    await fireEvent.changeText(view.getByLabelText("Name"), "Prepared group");
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    expect(await view.findByRole("button", { name: "Collapse Sub-Basket Prepared group" })).toBeTruthy();
    expect(await view.findByRole("button", { name: "Retry Sub-Baskets in Carpentry" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Edit Sub-Basket name: Prepared group in Carpentry" })).toBeNull();
    expect(await view.findByText("Name saved")).toBeTruthy();
    failSubBasketLoad = false;
    await fireEvent.press(view.getByRole("button", { name: "Retry Sub-Baskets in Carpentry" }));
    expect(await view.findByRole("button", { name: "Edit Sub-Basket name: Prepared group in Carpentry" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Collapse Sub-Basket Prepared group" })).toBeTruthy();
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("uses the selected parent ID for same-named Sub-Baskets and permits an inactive parent", async () => {
    const inactiveParent = { ...otherBasket, status: "inactive" as const };
    const sameName = { ...subBasket, id: "sub-b", basketId: inactiveParent.id, version: 21 };
    serveCatalog({ baskets: [basket, inactiveParent], subBaskets: [subBasket, sameName], items: [] });
    patch.mockResolvedValue({ ...sameName, name: "Fine painting", version: 22 });
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Expand Painting" }));
    await fireEvent.press(await view.findByRole("button", { name: "Edit Sub-Basket name: Finishes in Painting" }));
    expect(view.getByText("Main basket: Painting")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Name"), "Fine painting");
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/baskets/basket-b/sub-baskets/sub-b", { expectedVersion: 21, name: "Fine painting", managementContext: "configuration" }));
  });

  it("hides Sub-Basket rename without a verified record, on archived parents, or without update permission", async () => {
    serveCatalog({ baskets: [{ ...basket, status: "archived" }] });
    let view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await view.findByRole("button", { name: "Expand Sub-Basket Finishes" });
    expect(view.queryByRole("button", { name: "Edit Sub-Basket name: Finishes in Carpentry" })).toBeNull();
    await view.unmount();

    jest.mocked(useKnowledgeContext).mockReturnValue(context({ canUpdate: false }));
    serveCatalog();
    view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await view.findByRole("button", { name: "Expand Sub-Basket Finishes" });
    expect(view.queryByRole("button", { name: "Edit Sub-Basket name: Finishes in Carpentry" })).toBeNull();
    await view.unmount();

    jest.mocked(useKnowledgeContext).mockReturnValue(context());
    serveCatalog();
    get.mockImplementation(async (path: string) => path.includes("/sub-baskets?") ? Promise.reject(new Error("Catalog offline")) : path.includes("/baskets?") ? page([basket]) : path.includes("/items?") ? page([catalogItem]) : page([]));
    view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await view.findByRole("button", { name: "Retry Sub-Baskets in Carpentry" });
    expect(view.queryByRole("button", { name: "Edit Sub-Basket name: Finishes in Carpentry" })).toBeNull();
    expect(patch).not.toHaveBeenCalled();
  });

  it.each([["main_line", "draft"], ["main_line", "active"], ["temporary", "draft"]] as const)("renames a %s item in %s status from its pen using current detail", async (itemType, status) => {
    const row = { ...catalogItem, itemType, status };
    const detail = { ...itemDetail, itemType, status };
    serveCatalog({ items: [row], detail });
    patch.mockResolvedValue({ ...detail, mainLineName: "Updated finish", version: 18 });
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Expand Sub-Basket Finishes" }));
    await fireEvent.press(view.getByRole("button", { name: "Edit Main Line name: Wall finish in Carpentry" }));
    expect((await view.findByLabelText("Name")).props.value).toBe("Wall finish");
    expect(get).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/main-lines/line-a");
    expect(view.getByRole("button", { name: "Save name" })).toBeDisabled();
    await fireEvent.changeText(view.getByLabelText("Name"), "Updated finish");
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/main-lines/line-a", { expectedVersion: 17, name: "Updated finish" }));
    expect(await view.findByRole("button", { name: "Open Updated finish" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Collapse Sub-Basket Finishes" })).toBeTruthy();
  });

  it("keeps the saved name visible and offers refresh if reloading fails after the PATCH", async () => {
    serveCatalog();
    patch.mockResolvedValue({ ...itemDetail, mainLineName: "Updated finish", version: 18 });
    refresh.mockRejectedValueOnce(new Error("Offline"));
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Expand Sub-Basket Finishes" }));
    await fireEvent.press(view.getByRole("button", { name: "Edit Main Line name: Wall finish in Carpentry" }));
    await fireEvent.changeText(await view.findByLabelText("Name"), "Updated finish");
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    expect(await view.findByRole("button", { name: "Open Updated finish" })).toBeTruthy();
    expect(await view.findByText("Name saved")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Refresh Configuration" }));
    await waitFor(() => expect(view.queryByText("Name saved")).toBeNull());
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("retains a Main Line draft across duplicate and version errors, then requires current-version review", async () => {
    serveCatalog();
    patch.mockRejectedValueOnce(new ApiError(409, "DUPLICATE_IDENTITY", "Name already exists"))
      .mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere"))
      .mockResolvedValueOnce({ ...itemDetail, mainLineName: "Existing finish", version: 24 });
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Expand Sub-Basket Finishes" }));
    await fireEvent.press(view.getByRole("button", { name: "Edit Main Line name: Wall finish in Carpentry" }));
    await fireEvent.changeText(await view.findByLabelText("Name"), "Existing finish");
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    expect(await view.findByText("Name already exists")).toBeTruthy();
    expect(view.getByLabelText("Name").props.value).toBe("Existing finish");
    expect(view.getByRole("button", { name: "Save name" })).not.toBeDisabled();
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    expect(await view.findByText(/This record changed elsewhere/)).toBeTruthy();
    expect(view.getByRole("button", { name: "Save name" })).toBeDisabled();
    expect(patch).toHaveBeenCalledTimes(2);
    get.mockImplementation(async (path: string) => path.includes("/main-lines/line-a") ? { ...itemDetail, mainLineName: "Other saved finish", version: 23 } : path.includes("/items?") ? page([catalogItem]) : path.includes("/baskets?") ? page([basket]) : path.includes("/sub-baskets?") ? page([subBasket]) : page([]));
    await fireEvent.press(view.getByRole("button", { name: "Load current" }));
    expect(await view.findByText("Current saved name: Other saved finish")).toBeTruthy();
    expect(view.getByText("Current version: 23")).toBeTruthy();
    expect(view.getByLabelText("Name").props.value).toBe("Existing finish");
    expect(view.getByRole("button", { name: "Save name" })).toBeDisabled();
    expect(patch).toHaveBeenCalledTimes(2);
    await fireEvent.press(view.getByRole("button", { name: "Use current version" }));
    expect(view.getByRole("button", { name: "Save name" })).not.toBeDisabled();
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith("/admin/ai-estimator-knowledge/main-lines/line-a", { expectedVersion: 23, name: "Existing finish" }));
    expect(patch).toHaveBeenCalledTimes(3);
  });

  it("recovers a Sub-Basket version conflict by loading its exact parent-scoped record", async () => {
    serveCatalog();
    patch.mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere"))
      .mockResolvedValueOnce({ ...subBasket, name: "My finishes", version: 13 });
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Edit Sub-Basket name: Finishes in Carpentry" }));
    await fireEvent.changeText(view.getByLabelText("Name"), "My finishes");
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    expect(await view.findByText(/This record changed elsewhere/)).toBeTruthy();
    expect(view.getByRole("button", { name: "Save name" })).toBeDisabled();
    expect(patch).toHaveBeenCalledTimes(1);
    let currentUnavailable = true;
    get.mockImplementation(async (path: string) => {
      if (path.includes("/sub-baskets?")) {
        if (currentUnavailable) throw new Error("Sub-Basket catalog offline");
        return page([{ ...subBasket, name: "Someone else's finishes", version: 12 }]);
      }
      if (path.includes("/items?")) return page([catalogItem]);
      if (path.includes("/baskets?")) return page([basket]);
      return page([]);
    });
    await fireEvent.press(view.getByRole("button", { name: "Load current" }));
    expect(await view.findByText("Sub-Basket catalog offline")).toBeTruthy();
    expect(view.getByRole("button", { name: "Save name" })).toBeDisabled();
    expect(patch).toHaveBeenCalledTimes(1);
    currentUnavailable = false;
    await fireEvent.press(view.getByRole("button", { name: "Load current" }));
    expect(await view.findByText("Current saved name: Someone else's finishes")).toBeTruthy();
    expect(view.getByText("Current version: 12")).toBeTruthy();
    expect(view.getByLabelText("Name").props.value).toBe("My finishes");
    expect(view.getByRole("button", { name: "Save name" })).toBeDisabled();
    await fireEvent.press(view.getByRole("button", { name: "Use current version" }));
    await fireEvent.press(view.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith("/admin/ai-estimator-knowledge/baskets/basket-a/sub-baskets/sub-a", { expectedVersion: 12, name: "My finishes", managementContext: "configuration" }));
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it("requires authoritative Main Line detail and hides archived item rename", async () => {
    serveCatalog({ items: [{ ...catalogItem, status: "archived" }] });
    let view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Expand Sub-Basket Finishes" }));
    expect(view.queryByRole("button", { name: "Edit Main Line name: Wall finish in Carpentry" })).toBeNull();
    expect(view.getByRole("button", { name: "Open Wall finish" })).toBeTruthy();
    await view.unmount();

    serveCatalog();
    let detailFails = true;
    get.mockImplementation(async (path: string) => {
      if (path.includes("/main-lines/")) { if (detailFails) throw new Error("Detail offline"); return itemDetail; }
      if (path.includes("/items?")) return page([catalogItem]);
      if (path.includes("/baskets?")) return page([basket]);
      if (path.includes("/sub-baskets?")) return page([subBasket]);
      return page([]);
    });
    view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await fireEvent.press(await view.findByRole("button", { name: "Expand Sub-Basket Finishes" }));
    await fireEvent.press(view.getByRole("button", { name: "Edit Main Line name: Wall finish in Carpentry" }));
    expect(await view.findByText("Item unavailable")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
    detailFails = false;
    await fireEvent.press(view.getByRole("button", { name: "Retry item" }));
    expect((await view.findByLabelText("Name")).props.value).toBe("Wall finish");
  });

  it("starts with the first basket expanded and edits the chosen basket by its own ID and version", async () => {
    get.mockImplementation(async (path: string) => path.includes("/baskets?") ? page([basket, otherBasket]) : page([]));
    const view = await mount(<KnowledgeCatalogWorkspace session={session} />);
    await view.findByRole("button", { name: "Collapse Carpentry" });
    expect(view.getByRole("button", { name: "Expand Painting" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Actions for Painting" }));
    expect(view.getAllByRole("menuitem").map(node => node.props.accessibilityLabel)).toEqual(["Edit main basket", "Add estimation item", "Add temporary item", "Delete main basket"]);
    await chooseMenu(view, "Edit main basket");
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
    await chooseMenu(view, "Delete main basket");
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
    expect(view.queryByLabelText("Code")).toBeNull();
    await fireEvent.changeText(view.getByLabelText("Name"), "Square feet");
    await fireEvent.press(view.getByRole("combobox", { name: "Quantity decimal places" }));
    await fireEvent.press(view.getByRole("radio", { name: "2" }));
    await fireEvent.press(view.getByRole("button", { name: "Add UOM" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/uoms", { name: "Square feet", description: null, decimalScale: 2 }));
  });
});
