import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ProcurementVendorCertificateUploadPolicy, ProcurementVendorCertificateUploadResult } from "../ai-estimator-knowledge/knowledgeTypes";
import { getVendorCertificateUploadPolicy, stageVendorMsmeCertificate } from "./vendorProfileApi";
import { useVendorMsmeCertificate, type VendorCertificateDraft } from "./useVendorMsmeCertificate";
vi.mock("./vendorProfileApi", () => ({ getVendorCertificateUploadPolicy: vi.fn(), stageVendorMsmeCertificate: vi.fn() }));
const policy: ProcurementVendorCertificateUploadPolicy = { maxUploadBytes: 1048576, allowedMimeTypes: ["application/pdf", "image/png"], uploadLifetimeSeconds: 3600 };
const file = new File(["synthetic certificate"], "msme.pdf", { type: "application/pdf" });
const upload: ProcurementVendorCertificateUploadResult = { uploadId: "upload-one", originalFilename: file.name, mimeType: "application/pdf", byteSize: file.size, expiresAt: "2099-01-01T00:00:00Z" };
function setup(initial?: VendorCertificateDraft) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useVendorMsmeCertificate(true, initial), { wrapper });
}
async function loaded(view: ReturnType<typeof setup>) { await waitFor(() => expect(view.result.current.policy.isSuccess).toBe(true)); }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getVendorCertificateUploadPolicy).mockResolvedValue(policy); vi.mocked(stageVendorMsmeCertificate).mockResolvedValue(upload); });
it("restores the original staged result and does not upload the same certificate twice", async () => {
  const first = setup(); await loaded(first); act(() => first.result.current.select(file));
  await act(async () => { expect(await first.result.current.stage({ id: "vendor-one", expectedVersion: 7 })).toBe("upload-one"); });
  const snapshot = first.result.current.getSnapshot(); expect(snapshot.file).toBe(file); expect(snapshot.command?.file).toBe(file); first.unmount();
  const restored = setup(snapshot); await loaded(restored);
  await act(async () => { expect(await restored.result.current.stage({ id: "vendor-one", expectedVersion: 7 })).toBe("upload-one"); });
  expect(restored.result.current.file).toBe(file); expect(restored.result.current.getSnapshot().command).toBe(snapshot.command);
  expect(stageVendorMsmeCertificate).toHaveBeenCalledTimes(1);
});
it("restores an uncertain upload with the same idempotency key and original vendor version", async () => {
  vi.mocked(stageVendorMsmeCertificate).mockRejectedValueOnce(new Error("Response lost"));
  const first = setup(); await loaded(first); act(() => first.result.current.select(file));
  await act(async () => { await expect(first.result.current.stage({ id: "vendor-one", expectedVersion: 3 })).rejects.toThrow("Response lost"); });
  const snapshot = first.result.current.getSnapshot(); expect(snapshot.command?.result).toBeUndefined(); expect(snapshot.uploadError).toContain("not confirmed"); first.unmount();
  const restored = setup(snapshot); await loaded(restored); expect(restored.result.current.uploadError).toBe(snapshot.uploadError);
  await act(async () => { await restored.result.current.stage({ id: "vendor-one", expectedVersion: 3 }); });
  expect(stageVendorMsmeCertificate).toHaveBeenNthCalledWith(2, file, snapshot.command?.key, { id: "vendor-one", expectedVersion: 3 });
  expect(restored.result.current.uploadError).toBe("");
});
it("restages an expired saved upload with a new command instead of reusing its upload ID", async () => {
  const snapshot: VendorCertificateDraft = { file, uploadError: "", command: { file, key: "expired-command", target: "new", result: { ...upload, uploadId: "expired-upload", expiresAt: "2000-01-01T00:00:00Z" } } };
  const restored = setup(snapshot); await loaded(restored);
  await act(async () => { expect(await restored.result.current.stage()).toBe("upload-one"); });
  expect(stageVendorMsmeCertificate).toHaveBeenCalledTimes(1);
  expect(restored.result.current.getSnapshot().command?.key).not.toBe("expired-command");
  expect(snapshot.command?.result?.uploadId).toBe("expired-upload");
});
it("uses a fresh upload command when the saved target version changes", async () => {
  const snapshot: VendorCertificateDraft = { file, uploadError: "", command: { file, key: "old-target-command", target: "vendor-one:2", result: upload } };
  const restored = setup(snapshot); await loaded(restored);
  await act(async () => { await restored.result.current.stage({ id: "vendor-one", expectedVersion: 3 }); });
  expect(stageVendorMsmeCertificate).toHaveBeenCalledWith(file, expect.not.stringContaining("old-target-command"), { id: "vendor-one", expectedVersion: 3 });
});
it("revalidates the restored file against current policy before reusing a staged result", async () => {
  vi.mocked(getVendorCertificateUploadPolicy).mockResolvedValue({ ...policy, maxUploadBytes: 1 });
  const snapshot: VendorCertificateDraft = { file, uploadError: "", command: { file, key: "original", target: "new", result: upload } };
  const restored = setup(snapshot); await loaded(restored);
  await act(async () => { await expect(restored.result.current.stage()).rejects.toThrow("1 bytes or smaller"); });
  expect(stageVendorMsmeCertificate).not.toHaveBeenCalled(); expect(restored.result.current.file).toBe(file);
});
it("clears the retained upload command when the selected certificate is removed", async () => {
  const snapshot: VendorCertificateDraft = { file, uploadError: "Unconfirmed", command: { file, key: "original", target: "new", result: upload } };
  const restored = setup(snapshot); await loaded(restored); act(() => restored.result.current.select(null));
  expect(restored.result.current.getSnapshot()).toEqual({ file: null, uploadError: "", command: null });
  await act(async () => { expect(await restored.result.current.stage()).toBeUndefined(); }); expect(stageVendorMsmeCertificate).not.toHaveBeenCalled();
});
