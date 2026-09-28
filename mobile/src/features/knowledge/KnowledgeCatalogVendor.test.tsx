import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { createKnowledgeApi } from "../../../../shared/knowledge/knowledgeApi";
import type { ProcurementVendorDetail } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import { pickDocument, releaseSelectedAsset } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { KnowledgeVendorEditor } from "./KnowledgeVendorEditor";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("./KnowledgeVendorBaseline", () => ({ KnowledgeVendorBaseline: ({ onAccessLost }: { onAccessLost: () => void }) => {
  const NativePressable = require("react-native").Pressable;
  const NativeText = require("react-native").Text;
  return <NativePressable accessibilityRole="button" accessibilityLabel="Simulate baseline access loss" onPress={onAccessLost}><NativeText>Simulate baseline access loss</NativeText></NativePressable>;
} }));
jest.mock("../../platform/files", () => ({ pickDocument: jest.fn(), releaseSelectedAsset: jest.fn(async () => undefined), TransferHttpError: class extends Error {} }));
const get = jest.fn(); const patch = jest.fn(); const post = jest.fn(); const upload = jest.fn(); const download = jest.fn();
const now = "2026-09-25T00:00:00.000Z";
const meta = { version: 3, createdAt: now, updatedAt: now, createdById: "admin", updatedById: "admin", description: null, displayOrder: 0, status: "active" as const };
const vendor: ProcurementVendorDetail = { ...meta, id: "vendor-a", masterType: "vendors", code: "V001", name: "Example Vendor", procurementSummary: { vendorType: "supplier", profileComplete: true, currentAddressVerifiedPhysically: false, mainBaskets: [{ id: "basket-a", name: "Carpentry", status: "active" }], subBaskets: [{ id: "sub-a", basketId: "basket-a", name: "Joinery" }], mainBasket: { id: "basket-a", name: "Carpentry", status: "active" }, subBasket: { id: "sub-a", name: "Joinery" } }, geoTaggedPicture: null, msmeCertificate: null, procurementProfile: { vendorType: "supplier", organizationType: "firm", bankAccount: null, nameOfRepresentative: "Example Representative", position: "Owner", workProfile: "Materials", email: "vendor@example.test", phoneNumber: "9000000000", address: "Example address", aadhar: "123412341234", pan: "ABCDE1234F", currentAddress: "Example address", gstRegistered: false, gstNumber: null, msmeRegistered: false, supplier: true, executionType: null, currentAddressVerifiedPhysically: false, turnoverSelfDeclaredPaise: 100000, turnoverVerifiedPaise: null, mainBasketIds: ["basket-a"], subBasketIds: ["sub-a"], mainBasketId: "basket-a", subBasketId: "sub-a", reference: "", physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null } };
const basketA = { ...meta, id: "basket-a", name: "Carpentry" };
const basketB = { ...meta, id: "basket-b", name: "Masonry" };
const subA = { ...meta, id: "sub-a", basketId: "basket-a", name: "Joinery" };
const subA2 = { ...meta, id: "sub-a2", basketId: "basket-a", name: "Cabinetry" };
const subB = { ...meta, id: "sub-b", basketId: "basket-b", name: "Stonework" };
const multiVendor: ProcurementVendorDetail = {
  ...vendor,
  procurementSummary: { ...vendor.procurementSummary, mainBaskets: [{ id: "basket-a", name: "Carpentry", status: "active" }, { id: "basket-b", name: "Masonry", status: "active" }], subBaskets: [{ id: "sub-a", basketId: "basket-a", name: "Joinery" }, { id: "sub-b", basketId: "basket-b", name: "Stonework" }] },
  procurementProfile: { ...vendor.procurementProfile!, mainBasketIds: ["basket-a", "basket-b"], subBasketIds: ["sub-a", "sub-b"] }
};
const page = (items: readonly unknown[]) => ({ items, pagination: { total: items.length, limit: 100, offset: 0, hasMore: false } });
function context(overrides: Partial<KnowledgeMobileContext> = {}): KnowledgeMobileContext { return { api: createKnowledgeApi({ get, post, patch, delete: jest.fn(), put: jest.fn() }), key: (...parts) => ["test", "admin", "knowledge", ...parts], scopeKey: "test:admin:1:1", ready: true, canRead: true, canCreate: true, canUpdate: true, canLifecycle: true, canCreateClassification: true, canCorrectBaseline: true, canCreateQualityOptions: true, refresh: jest.fn(async () => undefined), ...overrides }; }
async function mount(overrides: Partial<KnowledgeMobileContext> = {}) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } }); const onSaved = jest.fn(); const view = await render(<QueryClientProvider client={client}><KnowledgeVendorEditor context={context(overrides)} existing={vendor} onClose={jest.fn()} onSaved={onSaved} /></QueryClientProvider>); await view.findByLabelText("Entity Name"); await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("sub-baskets"))); return { view, onSaved }; }
async function mountNew() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } }); const onSaved = jest.fn(); const view = await render(<QueryClientProvider client={client}><KnowledgeVendorEditor context={context()} onClose={jest.fn()} onSaved={onSaved} /></QueryClientProvider>); await view.findByLabelText("Entity Name"); return { view, onSaved }; }
async function choose(view: Awaited<ReturnType<typeof render>>, label: string, value: string) { await fireEvent.press(view.getByRole("combobox", { name: label })); await fireEvent.press(view.getByRole("radio", { name: value })); }
function useCatalog(detail: ProcurementVendorDetail = vendor) {
  get.mockImplementation(async (path: string) => path.endsWith("/vendor-a") ? detail : path.includes("upload-policy") ? { maxUploadBytes: 25 * 1024 * 1024, allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], uploadLifetimeSeconds: 3600 } : path.includes("/baskets/basket-a/sub-baskets") ? page([subA, subA2]) : path.includes("/baskets/basket-b/sub-baskets") ? page([subB]) : page([basketA, basketB]));
}
async function closeChoices(view: Awaited<ReturnType<typeof render>>) { await fireEvent.press(view.getByRole("button", { name: "Done" })); }
beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation(async (path: string) => path.endsWith("/vendor-a") ? vendor : path.includes("upload-policy") ? { maxUploadBytes: 25 * 1024 * 1024, allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], uploadLifetimeSeconds: 3600 } : path.includes("sub-baskets") ? page([{ ...meta, id: "sub-a", basketId: "basket-a", name: "Joinery" }]) : page([{ ...meta, id: "basket-a", name: "Carpentry" }]));
  patch.mockResolvedValue({ ...vendor, version: 4 });
  post.mockResolvedValue({ ...vendor, version: 4 });
  upload.mockReturnValue({ result: Promise.resolve({ uploadId: "certificate-ready", expiresAt: "2099-01-01T00:00:00Z" }), cancel: jest.fn() });
  jest.mocked(useConfiguredRuntime).mockReturnValue({ runtime: { api: { authenticated: { get, post, patch, delete: jest.fn() } }, transfers: { upload, download } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
});

describe("Native Configuration vendor", () => {
  it("creates a vendor with multiple classifications from the Add vendor form", async () => {
    useCatalog();
    const { view, onSaved } = await mountNew();
    const fields = [
      ["Entity Name", "Example Vendor"], ["Name of Representative", "Example Representative"], ["Position", "Owner"], ["Work Profile", "Materials"],
      ["Email", "vendor@example.test"], ["Phone Number", "9000000000"], ["Address", "Example address"], ["AADHAR", "123412341234"],
      ["PAN", "ABCDE1234F"], ["Current Address", "Example address"], ["Turnover (Self Declared) (INR)", "1000.00"]
    ] as const;
    for (const [label, value] of fields) await fireEvent.changeText(view.getByLabelText(label), value);
    await choose(view, "Vendor Organization Type", "Firm");
    await choose(view, "Vendor Type", "Supplier");
    await choose(view, "GST Registered", "No");
    await choose(view, "MSME Registered", "No");
    await choose(view, "Current Address Verified Physically", "No");
    await waitFor(() => expect(view.getByRole("combobox", { name: "Main Baskets" }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(view.getByRole("combobox", { name: "Main Baskets" }));
    await fireEvent.press(view.getByRole("checkbox", { name: "Carpentry" }));
    await fireEvent.press(view.getByRole("checkbox", { name: "Masonry" }));
    await closeChoices(view);
    await waitFor(() => expect(view.getByRole("combobox", { name: "Sub Baskets" }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(view.getByRole("combobox", { name: "Sub Baskets" }));
    await fireEvent.press(view.getByRole("checkbox", { name: "Carpentry, Joinery" }));
    await fireEvent.press(view.getByRole("checkbox", { name: "Masonry, Stonework" }));
    await closeChoices(view);
    await fireEvent.press(view.getByRole("button", { name: "Save vendor" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/vendors", expect.objectContaining({ procurementProfile: expect.objectContaining({ mainBasketIds: ["basket-a", "basket-b"], subBasketIds: ["sub-a", "sub-b"] }) }), expect.any(Object)));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("selects multiple parents and children with accessible checked states and saves canonical arrays", async () => {
    useCatalog();
    const { view } = await mount();
    const mainField = view.getByRole("combobox", { name: "Main Baskets" });
    expect(mainField.props.accessibilityState.expanded).toBe(false);
    expect(mainField.props.accessibilityValue.text).toContain("1 selected");
    await fireEvent.press(mainField);
    expect(view.getByRole("combobox", { name: "Main Baskets" }).props.accessibilityState.expanded).toBe(true);
    await fireEvent.changeText(view.getByLabelText("Search Main Baskets"), "Masonry");
    expect(view.queryByRole("checkbox", { name: "Carpentry" })).toBeNull();
    const masonry = view.getByRole("checkbox", { name: "Masonry" });
    expect(masonry.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(masonry);
    expect(view.getByRole("checkbox", { name: "Masonry" }).props.accessibilityState.checked).toBe(true);
    await closeChoices(view);
    expect(view.getByRole("combobox", { name: "Main Baskets" }).props.accessibilityState.expanded).toBe(false);
    expect(view.getByRole("combobox", { name: "Main Baskets" }).props.accessibilityValue.text).toContain("2 selected");
    await fireEvent.press(view.getByRole("combobox", { name: "Main Baskets" }));
    const closeButtons = view.getAllByRole("button", { name: "Close" });
    await fireEvent.press(closeButtons[closeButtons.length - 1]!);
    expect(view.getByRole("combobox", { name: "Main Baskets" }).props.accessibilityState.expanded).toBe(false);
    await waitFor(() => expect(view.getByRole("combobox", { name: "Sub Baskets" }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(view.getByRole("combobox", { name: "Sub Baskets" }));
    await fireEvent.press(view.getByRole("checkbox", { name: "Carpentry, Cabinetry" }));
    await fireEvent.press(view.getByRole("checkbox", { name: "Masonry, Stonework" }));
    await closeChoices(view);
    expect(view.getByText("Sub Baskets: 3 selected")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ procurementProfile: expect.objectContaining({ mainBasketIds: ["basket-a", "basket-b"], subBasketIds: ["sub-a", "sub-a2", "sub-b"] }) }), expect.any(Object)));
  });

  it("reopens a saved multi-classification detail and retains other choices after one edit", async () => {
    useCatalog();
    const returned: ProcurementVendorDetail = {
      ...multiVendor,
      version: 4,
      procurementProfile: { ...multiVendor.procurementProfile!, subBasketIds: ["sub-a", "sub-a2", "sub-b"] },
      procurementSummary: { ...multiVendor.procurementSummary, subBaskets: [
        { id: "sub-a", basketId: "basket-a", name: "Joinery" },
        { id: "sub-a2", basketId: "basket-a", name: "Cabinetry" },
        { id: "sub-b", basketId: "basket-b", name: "Stonework" }
      ] }
    };
    let serverDetail = vendor;
    const catalogGet = get.getMockImplementation()!;
    get.mockImplementation(async (path: string) => path.endsWith("/vendor-a") ? serverDetail : catalogGet(path));
    patch.mockImplementation(async () => { serverDetail = returned; return returned; });

    const first = await mount();
    await fireEvent.press(first.view.getByRole("combobox", { name: "Main Baskets" }));
    await fireEvent.press(first.view.getByRole("checkbox", { name: "Masonry" }));
    await closeChoices(first.view);
    await waitFor(() => expect(first.view.getByRole("combobox", { name: "Sub Baskets" }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(first.view.getByRole("combobox", { name: "Sub Baskets" }));
    await fireEvent.press(first.view.getByRole("checkbox", { name: "Carpentry, Cabinetry" }));
    await fireEvent.press(first.view.getByRole("checkbox", { name: "Masonry, Stonework" }));
    await closeChoices(first.view);
    await fireEvent.press(first.view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ procurementProfile: expect.objectContaining({ mainBasketIds: ["basket-a", "basket-b"], subBasketIds: ["sub-a", "sub-a2", "sub-b"] }) }), expect.any(Object)));
    await waitFor(() => expect(first.onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 4, procurementProfile: expect.objectContaining({ subBasketIds: ["sub-a", "sub-a2", "sub-b"] }) })));
    await first.view.unmount();

    const reopened = await mount();
    expect(reopened.view.getByText("Main Baskets: 2 selected")).toBeTruthy();
    expect(reopened.view.getByText("Sub Baskets: 3 selected")).toBeTruthy();
    expect(reopened.view.queryByText("Carpentry · Joinery")).toBeNull();
    await fireEvent.press(reopened.view.getByRole("combobox", { name: "Sub Baskets" }));
    expect(reopened.view.getByRole("checkbox", { name: "Carpentry, Joinery" }).props.accessibilityState.checked).toBe(true);
    expect(reopened.view.getByRole("checkbox", { name: "Carpentry, Cabinetry" }).props.accessibilityState.checked).toBe(true);
    expect(reopened.view.getByRole("checkbox", { name: "Masonry, Stonework" }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(reopened.view.getByRole("checkbox", { name: "Carpentry, Cabinetry" }));
    await closeChoices(reopened.view);
    await fireEvent.press(reopened.view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ expectedVersion: 4, procurementProfile: expect.objectContaining({ mainBasketIds: ["basket-a", "basket-b"], subBasketIds: ["sub-a", "sub-b"] }) }));
  });

  it("prunes only the removed parent's children and allows a selected parent without a child", async () => {
    useCatalog(multiVendor);
    const { view } = await mount();
    await fireEvent.press(view.getByRole("combobox", { name: "Main Baskets" }));
    await fireEvent.press(view.getByRole("checkbox", { name: "Masonry" }));
    await closeChoices(view);
    expect(view.getByText("1 selected Sub Basket was removed with its Main Basket. Review before saving.")).toBeTruthy();
    expect(view.getByRole("combobox", { name: "Sub Baskets" }).props.accessibilityValue.text).toContain("Carpentry · Joinery");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ procurementProfile: expect.objectContaining({ mainBasketIds: ["basket-a"], subBasketIds: ["sub-a"] }) }), expect.any(Object)));
    await view.unmount();

    useCatalog(multiVendor);
    const second = await mount();
    await fireEvent.press(second.view.getByRole("combobox", { name: "Sub Baskets" }));
    await fireEvent.press(second.view.getByRole("checkbox", { name: "Masonry, Stonework" }));
    await closeChoices(second.view);
    await fireEvent.press(second.view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ procurementProfile: expect.objectContaining({ mainBasketIds: ["basket-a", "basket-b"], subBasketIds: ["sub-a"] }) }), expect.any(Object)));
  });

  it("shows both required classification errors after all parents and their children are removed", async () => {
    useCatalog();
    const { view } = await mount();
    await fireEvent.press(view.getByRole("combobox", { name: "Main Baskets" }));
    await fireEvent.press(view.getByRole("checkbox", { name: "Carpentry" }));
    await closeChoices(view);
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    expect(view.getByText("Choose at least one Main Basket.")).toBeTruthy();
    expect(view.getByText("Choose at least one Sub Basket.")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });

  it("retains unavailable saved selections through a failed catalog load and retry", async () => {
    const unavailable: ProcurementVendorDetail = { ...vendor, procurementProfile: { ...vendor.procurementProfile!, mainBasketIds: ["basket-a", "basket-missing"], subBasketIds: ["sub-a", "sub-missing"] }, procurementSummary: { ...vendor.procurementSummary, mainBaskets: [...vendor.procurementSummary.mainBaskets, { id: "basket-missing", name: "Old Trade", status: "unavailable" }], subBaskets: [...vendor.procurementSummary.subBaskets, { id: "sub-missing", basketId: null, name: "Old Work" }] } };
    useCatalog(unavailable);
    const normalGet = get.getMockImplementation()!;
    let first = true;
    get.mockImplementation(async (path: string) => {
      if (path.includes("/baskets/basket-a/sub-baskets") && first) { first = false; throw new Error("Catalog unavailable"); }
      return normalGet(path);
    });
    const { view } = await mount();
    expect(view.getByRole("combobox", { name: "Main Baskets" }).props.accessibilityValue.text).toContain("Old Trade (unavailable)");
    expect(view.getByRole("combobox", { name: "Sub Baskets" }).props.accessibilityValue.text).toContain("Old Work (unavailable)");
    await view.findByRole("button", { name: "Retry classification" });
    await fireEvent.press(view.getByRole("button", { name: "Retry classification" }));
    await waitFor(() => expect(view.getByRole("combobox", { name: "Sub Baskets" }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.changeText(view.getByLabelText("Entity Name"), "Updated Vendor");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ procurementProfile: expect.objectContaining({ mainBasketIds: ["basket-a", "basket-missing"], subBasketIds: ["sub-a", "sub-missing"] }) }), expect.any(Object)));
  });

  it("prunes an unavailable saved child when its known unavailable parent is removed", async () => {
    const unavailable: ProcurementVendorDetail = { ...vendor, procurementProfile: { ...vendor.procurementProfile!, mainBasketIds: ["basket-a", "basket-missing"], subBasketIds: ["sub-a", "sub-missing"] }, procurementSummary: { ...vendor.procurementSummary, mainBaskets: [...vendor.procurementSummary.mainBaskets, { id: "basket-missing", name: "Old Trade", status: "unavailable" }], subBaskets: [...vendor.procurementSummary.subBaskets, { id: "sub-missing", basketId: "basket-missing", name: "Old Work" }] } };
    useCatalog(unavailable);
    const { view } = await mount();
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining("basket-missing/sub-baskets"));
    await fireEvent.press(view.getByRole("combobox", { name: "Main Baskets" }));
    await fireEvent.press(view.getByRole("checkbox", { name: "Old Trade (unavailable)" }));
    await closeChoices(view);
    expect(view.getByText("1 selected Sub Basket was removed with its Main Basket. Review before saving.")).toBeTruthy();
    expect(view.getByRole("combobox", { name: "Sub Baskets" }).props.accessibilityValue.text).not.toContain("Old Work");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ procurementProfile: expect.objectContaining({ mainBasketIds: ["basket-a"], subBasketIds: ["sub-a"] }) }), expect.any(Object)));
  });

  it("displays every classification without mutation controls for a read-only vendor", async () => {
    useCatalog(multiVendor);
    const { view } = await mount({ canUpdate: false });
    expect(view.getByText("Main Baskets: 2 selected")).toBeTruthy();
    expect(view.getByText("Carpentry · Joinery")).toBeTruthy();
    expect(view.getByText("Masonry · Stonework")).toBeTruthy();
    expect(view.getByRole("combobox", { name: "Main Baskets" }).props.accessibilityState.disabled).toBe(true);
    expect(view.getByRole("combobox", { name: "Sub Baskets" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByRole("combobox", { name: "Main Baskets" }));
    expect(view.queryByRole("button", { name: "Done" })).toBeNull();
    expect(view.queryByRole("button", { name: "Add sub-basket" })).toBeNull();
  });

  it("adds a parent and a child to existing choices using a specific selected parent", async () => {
    useCatalog();
    let createdMain = false;
    let createdSub = false;
    const newBasket = { ...meta, id: "basket-c", name: "Metalwork" };
    const newSub = { ...meta, id: "sub-c", basketId: "basket-c", name: "Welding" };
    const normalGet = get.getMockImplementation()!;
    get.mockImplementation(async (path: string) => path.includes("/baskets/basket-c/sub-baskets") ? page(createdSub ? [newSub] : []) : path.includes("/baskets?") ? page([...([basketA, basketB]), ...(createdMain ? [newBasket] : [])]) : normalGet(path));
    post.mockImplementation(async (path: string) => {
      if (path.includes("/baskets/basket-c/sub-baskets")) { createdSub = true; return newSub; }
      if (path.endsWith("/baskets")) { createdMain = true; return newBasket; }
      return vendor;
    });
    const { view } = await mount();
    await fireEvent.press(view.getByRole("button", { name: "Add main basket" }));
    await fireEvent.changeText(view.getByLabelText("Name"), "Metalwork");
    await fireEvent.press(view.getAllByRole("button", { name: "Add main basket" }).at(-1)!);
    await view.findByText("Main Baskets: 2 selected");
    await waitFor(() => expect(view.getByRole("button", { name: "Add sub-basket" }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(view.getByRole("button", { name: "Add sub-basket" }));
    expect(view.getByText("Main basket: Metalwork")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Name"), "Welding");
    await fireEvent.press(view.getAllByRole("button", { name: "Add sub-basket" }).at(-1)!);
    await view.findByText("Sub Baskets: 2 selected");
    expect(view.getByRole("combobox", { name: "Sub Baskets" }).props.accessibilityValue.text).toContain("Metalwork · Welding");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ procurementProfile: expect.objectContaining({ mainBasketIds: ["basket-a", "basket-c"], subBasketIds: ["sub-a", "sub-c"] }) }), expect.any(Object)));
  });

  it("keeps a created basket selected when the broader catalog refresh fails", async () => {
    useCatalog();
    const created = { ...meta, id: "basket-c", name: "Metalwork" };
    let wasCreated = false;
    const normalGet = get.getMockImplementation()!;
    get.mockImplementation(async (path: string) => path.includes("/baskets/basket-c/sub-baskets") ? page([]) : path.includes("/baskets?") ? page([...([basketA, basketB]), ...(wasCreated ? [created] : [])]) : normalGet(path));
    post.mockImplementation(async (path: string) => {
      if (path.endsWith("/baskets")) { wasCreated = true; return created; }
      return vendor;
    });
    const refresh = jest.fn().mockRejectedValueOnce(new Error("Refresh unavailable")).mockResolvedValue(undefined);
    const { view } = await mount({ refresh });
    await fireEvent.press(view.getByRole("button", { name: "Add main basket" }));
    await fireEvent.changeText(view.getByLabelText("Name"), "Metalwork");
    await fireEvent.press(view.getAllByRole("button", { name: "Add main basket" }).at(-1)!);
    await view.findByText("Main Baskets: 2 selected");
    await view.findByText("Basket created and selected. Other vendor lists could not refresh.");
    expect(post).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole("button", { name: "Retry catalog refresh" }));
    await waitFor(() => expect(view.queryByText("Basket created and selected. Other vendor lists could not refresh.")).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("uses the full organization dropdown and preserves bank account leading zeros", async () => {
    const { view, onSaved } = await mount();
    await choose(view, "Vendor Organization Type", "HUF");
    await fireEvent.changeText(view.getByLabelText("Account Holder Name"), "Example Vendor");
    await fireEvent.changeText(view.getByLabelText("Bank Name"), "Example Bank");
    await fireEvent.changeText(view.getByLabelText("Account Number"), "000123456789");
    await fireEvent.changeText(view.getByLabelText("IFSC Code"), "abcd0123456");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/vendors/vendor-a", expect.objectContaining({ expectedVersion: 3, procurementProfile: expect.objectContaining({ organizationType: "huf", bankAccount: { accountHolderName: "Example Vendor", bankName: "Example Bank", accountNumber: "000123456789", ifscCode: "ABCD0123456", branchName: null }, supplier: true, executionType: null }) }), expect.any(Object)));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("requires GST number when Yes is selected and preserves field entries on validation failure", async () => {
    const { view } = await mount();
    await choose(view, "GST Registered", "Yes");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await view.findByText("Enter a valid 15-character GST Number.");
    expect(patch).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText("GST Number"), "27ABCDE1234F1Z5");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ procurementProfile: expect.objectContaining({ gstNumber: "27ABCDE1234F1Z5", gstRegistered: true }) }), expect.any(Object)));
  });

  it("requires and stages an MSME certificate against the saved version before linking it", async () => {
    const { view } = await mount();
    await choose(view, "MSME Registered", "Yes");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await view.findByText("Upload an MSME Certificate.");
    expect(patch).not.toHaveBeenCalled();
    jest.mocked(pickDocument).mockResolvedValue({ status: "selected", asset: { uri: "file:///synthetic/certificate.pdf", name: "certificate.pdf", mimeType: "application/pdf", size: 200 } });
    await fireEvent.press(view.getByRole("button", { name: "Upload MSME certificate" }));
    await view.findByText("Selected: certificate.pdf");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.objectContaining({ path: "/admin/ai-estimator-knowledge/vendors/vendor-a/msme-certificate-uploads", fieldName: "certificate", parameters: expect.objectContaining({ expectedVersion: "3", idempotencyKey: expect.any(String) }) })));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ msmeCertificateUploadId: "certificate-ready", procurementProfile: expect.objectContaining({ msmeRegistered: true }) }), expect.any(Object)));
  });

  it("freezes and retries exactly the same uncertain profile command", async () => {
    patch.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "The save result was not received."));
    const { view } = await mount();
    await fireEvent.changeText(view.getByLabelText("Entity Name"), "Updated Vendor");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await view.findByText("The result is not fully confirmed. Retry the same operation before changing these entries.");
    expect(view.getByLabelText("Entity Name").props.editable).toBe(false);
    const first = patch.mock.calls[0];
    await fireEvent.press(view.getByRole("button", { name: "Retry same vendor save" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1]?.[0]).toEqual(first?.[0]);
    expect(patch.mock.calls[1]?.[1]).toEqual(first?.[1]);
  });

  it("retains profile data while preventing stale-version writes and read-only mutation", async () => {
    patch.mockRejectedValue(new ApiError(409, "VERSION_CONFLICT", "Vendor changed"));
    const { view } = await mount();
    await fireEvent.changeText(view.getByLabelText("Entity Name"), "Changed locally");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await view.findByRole("button", { name: "Reload latest and replace entries" });
    expect(view.getByLabelText("Entity Name").props.value).toBe("Changed locally");
    expect(view.getByRole("button", { name: "Save vendor changes" }).props.accessibilityState.disabled).toBe(true);
    await view.unmount();
    const readonly = await mount({ canUpdate: false });
    expect(readonly.view.queryByRole("button", { name: "Save vendor changes" })).toBeNull();
    expect(readonly.view.getByLabelText("Entity Name").props.editable).toBe(false);
  });

  it("requires classification permission for inline baskets independently of vendor create permission", async () => {
    const restricted = await mount({ canCreateClassification: false, canCreate: true });
    expect(restricted.view.queryByRole("button", { name: "Add main basket" })).toBeNull();
    await restricted.view.unmount();
    const allowed = await mount({ canCreateClassification: true, canCreate: false, canUpdate: true });
    expect(allowed.view.getByRole("button", { name: "Add main basket" })).toBeTruthy();
  });

  it("removes private vendor detail and write controls after a forbidden save", async () => {
    patch.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Access removed"));
    const { view } = await mount();
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await view.findByText("Vendor access required");
    expect(view.queryByLabelText("Entity Name")).toBeNull();
    expect(view.queryByRole("button", { name: "Save vendor changes" })).toBeNull();
  });

  it("removes parent vendor detail after a forbidden inline basket creation", async () => {
    post.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Access removed"));
    const { view } = await mount();
    await fireEvent.press(view.getByRole("button", { name: "Add main basket" }));
    await fireEvent.changeText(view.getByLabelText("Name"), "Blocked basket");
    await fireEvent.press(view.getAllByRole("button", { name: "Add main basket" }).at(-1)!);
    await view.findByText("Vendor access required");
    expect(view.queryByLabelText("Entity Name")).toBeNull();
    expect(view.queryByText("Blocked basket")).toBeNull();
  });

  it("removes parent vendor detail when historical correction loses access", async () => {
    const { view } = await mount();
    await fireEvent.press(view.getByRole("button", { name: "Review missing historical allocations" }));
    await fireEvent.press(view.getByRole("button", { name: "Simulate baseline access loss" }));
    await view.findByText("Vendor access required");
    expect(view.queryByLabelText("Entity Name")).toBeNull();
  });

  it("retries a picture failure without submitting the already-saved profile twice", async () => {
    let detailReads = 0;
    const defaultGet = get.getMockImplementation()!;
    get.mockImplementation(async (path: string, options: unknown) => path.endsWith("/vendor-a") ? { ...vendor, version: ++detailReads === 1 ? 3 : 4 } : defaultGet(path, options));
    upload.mockReset();
    upload.mockImplementationOnce(() => ({ result: Promise.reject(new ApiError(503, "UNAVAILABLE", "Picture result unavailable")), cancel: jest.fn() })).mockImplementationOnce(() => ({ result: Promise.resolve({ vendorId: "vendor-a", version: 5, geoTaggedPicture: { id: "photo-a", url: "/private/photo-a", mimeType: "image/jpeg", byteSize: 200, uploadedAt: now } }), cancel: jest.fn() }));
    const { view, onSaved } = await mount();
    jest.mocked(pickDocument).mockResolvedValue({ status: "selected", asset: { uri: "file:///synthetic/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg", size: 200 } });
    await fireEvent.press(view.getByRole("button", { name: "Choose vendor picture" }));
    await view.findByText("Selected: photo.jpg");
    await fireEvent.press(view.getByRole("button", { name: "Save vendor changes" }));
    await view.findByRole("button", { name: "Retry same vendor save" });
    expect(patch).toHaveBeenCalledTimes(1);
    const first = upload.mock.calls[0]?.[0];
    await fireEvent.press(view.getByRole("button", { name: "Retry same vendor save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 5 })));
    expect(patch).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[1]?.[0]).toMatchObject({ path: first.path, method: "PUT", fieldName: "photo", parameters: first.parameters });
    expect(first.parameters.expectedVersion).toBe("4");
  });

  it("releases an asset returned by a picker after the form has unmounted", async () => {
    const { view } = await mount();
    let resolvePicker!: (value: Awaited<ReturnType<typeof pickDocument>>) => void;
    jest.mocked(pickDocument).mockReturnValue(new Promise(resolve => { resolvePicker = resolve; }));
    await fireEvent.press(view.getByRole("button", { name: "Choose vendor picture" }));
    await view.unmount();
    const asset = { uri: "file:///synthetic/late.jpg", name: "late.jpg", mimeType: "image/jpeg", size: 200 };
    await act(async () => resolvePicker({ status: "selected", asset }));
    await waitFor(() => expect(releaseSelectedAsset).toHaveBeenCalledWith(asset));
    expect(upload).not.toHaveBeenCalled();
  });

});
