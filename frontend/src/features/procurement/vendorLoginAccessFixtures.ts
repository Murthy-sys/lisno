import type { VendorLoginAccess, VendorOrderAccess, VendorOrderAccessPage } from "./vendorLoginAccessApi";

export const vendorLoginAccessFixture: VendorLoginAccess = {
  vendorId: "vendor-one", vendorName: "Oak Works", vendorVersion: 4,
  recipient: { name: "Vendor Contact", email: "vendor@example.test" }, access: "unknown", invitation: null,
  readiness: { state: "ready", reasonCode: null, lastProcessedAt: "2026-10-09T08:00:00Z" },
  delivery: { state: "not_requested", failureCode: null, sentAt: null, updatedAt: null, cooldownUntil: null },
  availableActions: ["send_invitation"], blockedReasonCode: null
};
export const vendorOrderAccessFixture: VendorOrderAccess = {
  ...vendorLoginAccessFixture.delivery, id: null, version: null, projectId: "project-one", vendorId: "vendor-one",
  vendorName: "Oak Works", vendorVersion: 4, orderId: "order-one", orderLabel: "PO-ONE", orderVersion: 5,
  revision: 2, access: "unknown", invitation: null, readiness: vendorLoginAccessFixture.readiness,
  availableActions: ["send_invitation"], blockedReasonCode: null, attempts: 0, canRetry: false
};
export const vendorOrderAccessPageFixture = (items: VendorOrderAccess[] = [vendorOrderAccessFixture]): VendorOrderAccessPage => ({
  items, total: items.length, readiness: vendorLoginAccessFixture.readiness
});
