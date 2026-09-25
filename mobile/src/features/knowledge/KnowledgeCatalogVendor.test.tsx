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
jest.mock("./KnowledgeVendorBaseline", () => ({ KnowledgeVendorBaseline: () => null }));
jest.mock("../../platform/files", () => ({ pickDocument: jest.fn(), releaseSelectedAsset: jest.fn(async () => undefined), TransferHttpError: class extends Error {} }));
const get = jest.fn(); const patch = jest.fn(); const post = jest.fn(); const upload = jest.fn(); const download = jest.fn();
const now = "2026-09-25T00:00:00.000Z";
const meta = { version: 3, createdAt: now, updatedAt: now, createdById: "admin", updatedById: "admin", description: null, displayOrder: 0, status: "active" as const };
const vendor: ProcurementVendorDetail = { ...meta, id: "vendor-a", masterType: "vendors", code: "V001", name: "Example Vendor", procurementSummary: { vendorType: "supplier", profileComplete: true, currentAddressVerifiedPhysically: false, mainBasket: { id: "basket-a", name: "Carpentry", status: "active" }, subBasket: { id: "sub-a", name: "Joinery" } }, geoTaggedPicture: null, msmeCertificate: null, procurementProfile: { vendorType: "supplier", organizationType: "firm", bankAccount: null, nameOfRepresentative: "Example Representative", position: "Owner", workProfile: "Materials", email: "vendor@example.test", phoneNumber: "9000000000", address: "Example address", aadhar: "123412341234", pan: "ABCDE1234F", currentAddress: "Example address", gstRegistered: false, gstNumber: null, msmeRegistered: false, supplier: true, executionType: null, currentAddressVerifiedPhysically: false, turnoverSelfDeclaredPaise: 100000, turnoverVerifiedPaise: null, mainBasketId: "basket-a", subBasketId: "sub-a", reference: "", physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null } };
const page = (items: readonly unknown[]) => ({ items, pagination: { total: items.length, limit: 100, offset: 0, hasMore: false } });
function context(overrides: Partial<KnowledgeMobileContext> = {}): KnowledgeMobileContext { return { api: createKnowledgeApi({ get, post, patch, delete: jest.fn(), put: jest.fn() }), key: (...parts) => ["test", "admin", "knowledge", ...parts], scopeKey: "test:admin:1:1", ready: true, canRead: true, canCreate: true, canUpdate: true, canLifecycle: true, canCreateQualityOptions: true, refresh: jest.fn(async () => undefined), ...overrides }; }
async function mount(overrides: Partial<KnowledgeMobileContext> = {}) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } }); const onSaved = jest.fn(); const view = await render(<QueryClientProvider client={client}><KnowledgeVendorEditor context={context(overrides)} existing={vendor} onClose={jest.fn()} onSaved={onSaved} /></QueryClientProvider>); await view.findByLabelText("Entity Name"); await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("sub-baskets"))); return { view, onSaved }; }
async function choose(view: Awaited<ReturnType<typeof render>>, label: string, value: string) { await fireEvent.press(view.getByRole("combobox", { name: label })); await fireEvent.press(view.getByRole("radio", { name: value })); }
beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation(async (path: string) => path.endsWith("/vendor-a") ? vendor : path.includes("upload-policy") ? { maxUploadBytes: 25 * 1024 * 1024, allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], uploadLifetimeSeconds: 3600 } : path.includes("sub-baskets") ? page([{ ...meta, id: "sub-a", basketId: "basket-a", name: "Joinery" }]) : page([{ ...meta, id: "basket-a", name: "Carpentry" }]));
  patch.mockResolvedValue({ ...vendor, version: 4 });
  post.mockResolvedValue({ ...vendor, version: 4 });
  upload.mockReturnValue({ result: Promise.resolve({ uploadId: "certificate-ready", expiresAt: "2099-01-01T00:00:00Z" }), cancel: jest.fn() });
  jest.mocked(useConfiguredRuntime).mockReturnValue({ runtime: { api: { authenticated: { get, post, patch, delete: jest.fn() } }, transfers: { upload, download } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
});

describe("Native Configuration vendor", () => {
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
