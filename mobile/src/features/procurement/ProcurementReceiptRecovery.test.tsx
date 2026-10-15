import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { AUTHORIZATION_POLICY_VERSION, PERMISSION_CODES } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { pickDocument, releaseSelectedAsset, TransferHttpError, type SelectedAsset } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProcurementProject } from "./ProcurementProject";

jest.mock("../../platform/files", () => ({ ...jest.requireActual("../../platform/files"), pickDocument: jest.fn(), releaseSelectedAsset: jest.fn(async () => undefined) }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: jest.fn() }));
const session = { user: { id: "procurement-a", role: "procurement" }, authorization: { role: "procurement", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: PERMISSION_CODES } } as unknown as AuthenticatedSession;
const first: SelectedAsset = { uri: "file:///tmp/synthetic-receipt-a.png", name: "receipt-a.png", mimeType: "image/png", size: 120 };
const second: SelectedAsset = { ...first, uri: "file:///tmp/synthetic-receipt-b.png", name: "receipt-b.png" };
const upload = jest.fn(); const refresh = jest.fn(async () => undefined);
const records = [{ id: "source-a", name: "Wardrobe", sourceLineItemKey: "stable-line/one" }];
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(releaseSelectedAsset).mockResolvedValue(undefined);
  jest.mocked(useInvalidateEvent).mockReturnValue(refresh);
  jest.mocked(useConfiguredRuntime).mockReturnValue({ environment: { environment: { id: "test" }, status: "ready", generation: 1 }, session: { generation: 1 }, runtime: { api: { authenticated: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() } }, transfers: { upload } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
});
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = await render(<QueryClientProvider client={client}><ProcurementProject projectId="project-a" session={session} data={records} onRefresh={jest.fn()} /></QueryClientProvider>);
  await fireEvent.press(view.getByRole("radio", { name: "Wardrobe" }));
  return view;
}
async function ready() {
  jest.mocked(pickDocument).mockResolvedValue({ status: "selected", asset: first });
  const view = await mount();
  await fireEvent.changeText(view.getByLabelText("Amount (INR)"), "129.35");
  await fireEvent.changeText(view.getByLabelText("Description"), "Materials received");
  await fireEvent.changeText(view.getByLabelText("Incurred date (YYYY-MM-DD)"), "2026-10-14");
  await fireEvent.press(view.getByRole("button", { name: "Choose receipt" }));
  await view.findByRole("button", { name: "Receipt: receipt-a.png" });
  return view;
}

it("keeps the receipt and exact upload request after malformed 201, then releases it after recovery", async () => {
  upload.mockImplementationOnce(() => ({ result: Promise.reject(new TransferHttpError(201, "INVALID_RESPONSE", "Malformed reply")) })).mockImplementationOnce(() => ({ result: Promise.resolve({}) }));
  const view = await ready();
  await fireEvent.press(view.getByRole("button", { name: "Record cost" }));
  await view.findByRole("button", { name: "Retry same request" });
  expect(view.getByLabelText("Amount (INR)").props.editable).toBe(false);
  expect(view.getByRole("button", { name: "Cancel cost entry" })).toBeDisabled();
  expect(releaseSelectedAsset).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole("button", { name: "Record cost" }));
  expect(upload).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  expect(upload.mock.calls[1]![0]).toBe(upload.mock.calls[0]![0]);
  expect(upload.mock.calls[0]![0].parameters).toMatchObject({ amountPaise: "12935", sourceLineItemKey: "stable-line/one", idempotencyKey: expect.any(String) });
  await waitFor(() => expect(releaseSelectedAsset).toHaveBeenCalledWith(first));
  await view.unmount(); expect(releaseSelectedAsset).toHaveBeenCalledTimes(1);
});

it.each([403, 409])("treats an upload %s as a confirmed rejection rather than an unknown result", async status => {
  upload.mockImplementation(() => ({ result: Promise.reject(new TransferHttpError(status, "REJECTED", "Request rejected")) }));
  const view = await ready();
  await fireEvent.press(view.getByRole("button", { name: "Record cost" }));
  if (status === 403) {
    await view.findByText("Procurement access changed"); expect(view.queryByLabelText("Amount (INR)")).toBeNull();
    await waitFor(() => expect(releaseSelectedAsset).toHaveBeenCalledWith(first));
  } else {
    await view.findByRole("button", { name: "Reload current data" }); expect(view.getByRole("button", { name: "Record cost" })).toBeDisabled();
    expect(releaseSelectedAsset).not.toHaveBeenCalled();
  }
  expect(view.queryByRole("button", { name: "Retry same request" })).toBeNull(); expect(upload).toHaveBeenCalledTimes(1);
});

it("releases replaced and discarded receipts once, and clears fields before another entry", async () => {
  const view = await ready();
  jest.mocked(pickDocument).mockResolvedValue({ status: "selected", asset: second });
  await fireEvent.press(view.getByRole("button", { name: "Receipt: receipt-a.png" }));
  await view.findByRole("button", { name: "Receipt: receipt-b.png" });
  expect(releaseSelectedAsset).toHaveBeenCalledWith(first);
  const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.find(button => button.style === "destructive")?.onPress?.());
  await fireEvent.press(view.getByRole("button", { name: "Cancel cost entry" }));
  expect(releaseSelectedAsset).toHaveBeenCalledWith(second);
  await fireEvent.press(view.getByRole("radio", { name: "Wardrobe" }));
  expect(view.getByLabelText("Amount (INR)").props.value).toBe(""); expect(view.getByRole("button", { name: "Choose receipt" })).toBeTruthy();
  await view.unmount(); expect(releaseSelectedAsset).toHaveBeenCalledTimes(2); alert.mockRestore();
});

it("releases an idle selection on unmount", async () => {
  const view = await ready(); await view.unmount();
  expect(releaseSelectedAsset).toHaveBeenCalledTimes(1); expect(releaseSelectedAsset).toHaveBeenCalledWith(first);
});

it.each(["unmount", "discard"] as const)("releases a late picker result after %s", async action => {
  const selection = deferred<Awaited<ReturnType<typeof pickDocument>>>(); jest.mocked(pickDocument).mockReturnValue(selection.promise);
  const view = await mount();
  await fireEvent.press(view.getByRole("button", { name: "Choose receipt" }));
  const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.find(button => button.style === "destructive")?.onPress?.());
  if (action === "unmount") await view.unmount();
  else await fireEvent.press(view.getByRole("button", { name: "Cancel cost entry" }));
  await act(async () => { selection.resolve({ status: "selected", asset: first }); });
  expect(releaseSelectedAsset).toHaveBeenCalledTimes(1); expect(releaseSelectedAsset).toHaveBeenCalledWith(first);
  alert.mockRestore();
});

it("defers receipt cleanup on forced unmount until the active native upload settles", async () => {
  const transfer = deferred<unknown>(); upload.mockImplementation(() => ({ result: transfer.promise }));
  const view = await ready();
  await fireEvent.press(view.getByRole("button", { name: "Record cost" }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  await view.unmount(); expect(releaseSelectedAsset).not.toHaveBeenCalled();
  await act(async () => { transfer.reject(new TransferHttpError(201, "INVALID_RESPONSE", "Malformed reply")); });
  expect(releaseSelectedAsset).toHaveBeenCalledTimes(1); expect(releaseSelectedAsset).toHaveBeenCalledWith(first);
});
