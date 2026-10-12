import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PermissionCode, Role } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { ProcurementVendorDraftProvider, useProcurementVendorDraft, type RetainedVendorDraft } from "./ProcurementVendorDraftProvider";
import { completeVendor } from "./vendorProfile.fixtures";
import { vendorDraft } from "./vendorProfileDraft";
let actor: string | null;
let role: Role;
let session: string;
let permissions: PermissionCode[];
const all: PermissionCode[] = ["procurement.vendor_directory.read", "procurement.vendor_directory.create", "procurement.vendor_directory.update"];
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: actor ? { id: actor, role } : null, reviewSession: { id: session }, authorization: actor ? authorizationFor(role, permissions) : null }) }));
function draft(existing = true): RetainedVendorDraft {
  const photo = new File(["photo"], "site.png", { type: "image/png" });
  const certificate = new File(["certificate"], "msme.pdf", { type: "application/pdf" });
  return { base: existing ? { ...completeVendor, version: 4 } : undefined, draft: { ...vendorDraft(existing ? completeVendor : undefined), name: "Unsaved vendor" }, photo, removePhoto: true, confirmAddress: true, certificate: { file: certificate, uploadError: "Unconfirmed upload", command: { file: certificate, key: "original-command", target: existing ? `${completeVendor.id}:4` : "new", result: { uploadId: "saved-upload", originalFilename: certificate.name, mimeType: "application/pdf", byteSize: certificate.size, expiresAt: "2099-01-01T00:00:00Z" } } } };
}
function setup() { return renderHook(() => useProcurementVendorDraft(), { wrapper: ProcurementVendorDraftProvider }); }
beforeEach(() => { actor = "procurement-one"; role = "procurement"; session = "session-one"; permissions = [...all]; });
it.each([true, false])("retains original version, exact file references and staged certificate in session memory (existing=%s)", existing => {
  const local = vi.spyOn(Storage.prototype, "setItem"); const view = setup(); const saved = draft(existing);
  act(() => view.result.current.retain(saved)); view.rerender();
  expect(view.result.current.retained).toBe(saved);
  expect(view.result.current.retained?.base).toBe(saved.base);
  expect(view.result.current.retained?.base?.version).toBe(existing ? 4 : undefined);
  expect(view.result.current.retained?.photo).toBe(saved.photo);
  expect(view.result.current.retained?.certificate.file).toBe(saved.certificate.file);
  expect(view.result.current.retained?.certificate.command).toBe(saved.certificate.command);
  expect(view.result.current.retained?.draft.name).toBe("Unsaved vendor");
  expect(local).not.toHaveBeenCalled(); local.mockRestore();
  act(() => view.result.current.clear()); expect(view.result.current.retained).toBeNull();
});
it.each(["identity", "review session", "logout", "role", "read permission", "create permission", "update permission"])("clears retained data after %s changes and does not restore it when access returns", boundary => {
  const view = setup(); act(() => view.result.current.retain(draft()));
  if (boundary === "identity") actor = "procurement-two";
  if (boundary === "review session") session = "session-two";
  if (boundary === "logout") actor = null;
  if (boundary === "role") role = "super_admin";
  if (boundary === "read permission") permissions = all.filter(value => value !== "procurement.vendor_directory.read");
  if (boundary === "create permission") permissions = all.filter(value => value !== "procurement.vendor_directory.create");
  if (boundary === "update permission") permissions = all.filter(value => value !== "procurement.vendor_directory.update");
  view.rerender(); expect(view.result.current.retained).toBeNull();
  actor = "procurement-one"; session = "session-one"; role = "procurement"; permissions = [...all]; view.rerender();
  expect(view.result.current.retained).toBeNull();
});
it("requires the corresponding create or update permission when retaining a draft", () => {
  permissions = ["procurement.vendor_directory.read", "procurement.vendor_directory.create"];
  const view = setup(); act(() => view.result.current.retain(draft(true))); expect(view.result.current.retained).toBeNull();
  const newDraft = draft(false); act(() => view.result.current.retain(newDraft)); expect(view.result.current.retained).toBe(newDraft);
  permissions = ["procurement.vendor_directory.read", "procurement.vendor_directory.update"]; view.rerender();
  act(() => view.result.current.retain(draft(false))); expect(view.result.current.retained).toBeNull();
  const existing = draft(); act(() => view.result.current.retain(existing)); expect(view.result.current.retained).toBe(existing);
});
it("does not persist retained data after the provider is unmounted", () => {
  const view = setup(); act(() => view.result.current.retain(draft())); view.unmount();
  expect(setup().result.current.retained).toBeNull();
});
