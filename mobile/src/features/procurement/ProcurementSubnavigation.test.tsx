import { fireEvent, render } from "@testing-library/react-native";

import { AUTHORIZATION_POLICY_VERSION, type PermissionCode } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ProcurementSubnavigation } from "./ProcurementSubnavigation";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

function session(permissions: readonly PermissionCode[]): AuthenticatedSession {
  return {
    user: { id: "procurement-user", name: "Procurement", email: "p@example.test", role: "procurement" },
    authorization: { role: "procurement", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions }
  };
}

describe("compact Procurement subnavigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("expands Dashboard and Vendors with selected state, then navigates to Vendors", async () => {
    const view = await render(<ProcurementSubnavigation session={session(["procurement.workspace.read", "procurement.vendor_directory.read"])} active="dashboard" railBreakpoint={2000} />);
    expect(view.getByRole("button", { name: "Procurement sections" }).props.accessibilityState.expanded).toBe(true);
    expect(view.getByRole("button", { name: "Procurement Dashboard" }).props.accessibilityState.selected).toBe(true);
    expect(view.getByRole("button", { name: "Procurement Vendors" }).props.accessibilityState.selected).toBe(false);
    await fireEvent.press(view.getByRole("button", { name: "Procurement Vendors" }));
    expect(mockPush).toHaveBeenCalledWith("/feature/procurement-vendors");
    await fireEvent.press(view.getByRole("button", { name: "Procurement sections" }));
    expect(view.getByRole("button", { name: "Procurement sections" }).props.accessibilityState.expanded).toBe(false);
    expect(view.queryByRole("button", { name: "Procurement Vendors" })).toBeNull();
  });

  it("shows only independently authorized children and hides its compact copy on tablet", async () => {
    const vendorOnly = await render(<ProcurementSubnavigation session={session(["procurement.vendor_directory.read"])} active="vendors" railBreakpoint={2000} />);
    expect(vendorOnly.getByRole("button", { name: "Procurement Vendors" }).props.accessibilityState.selected).toBe(true);
    expect(vendorOnly.queryByRole("button", { name: "Procurement Dashboard" })).toBeNull();
    await vendorOnly.rerender(<ProcurementSubnavigation session={session(["procurement.vendor_directory.read"])} active="vendors" railBreakpoint={1} />);
    expect(vendorOnly.queryByRole("button", { name: "Procurement sections" })).toBeNull();
  });
});
