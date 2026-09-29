import { vendorDisplayStatus } from "./vendorDisplayStatus";

const gates = { inductionApproved: true, vendorSelfKpiComplete: true, procurementKpiComplete: true, profileComplete: true, physicalAddressVerified: true };

it("uses backend activation, never local address verification, for Active", () => {
  expect(vendorDisplayStatus({ status: "active" })).toBe("Under Review");
  expect(vendorDisplayStatus({ status: "active", vendorActivation: { lifecycleStatus: "active", effectiveStatus: "under_review", gates } })).toBe("Under Review");
  expect(vendorDisplayStatus({ status: "active", vendorActivation: { lifecycleStatus: "active", effectiveStatus: "active", gates } })).toBe("Active");
  expect(vendorDisplayStatus({ status: "inactive", vendorActivation: { lifecycleStatus: "inactive", effectiveStatus: "active", gates } })).toBe("Inactive");
  expect(vendorDisplayStatus({ status: "archived", vendorActivation: { lifecycleStatus: "archived", effectiveStatus: "active", gates } })).toBe("Archived");
});
