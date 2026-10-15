import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { AUTHORIZATION_POLICY_VERSION, type PermissionCode, type Role } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ProcurementSubnavigation } from "./ProcurementSubnavigation";

const mockPush = jest.fn();
let mockBlocked = false;
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationBlocked: () => mockBlocked }));

function session(permissions: readonly PermissionCode[], role: Role = "procurement"): AuthenticatedSession {
  return {
    user: { id: "procurement-user", name: "Procurement", email: "p@example.invalid", role },
    authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions }
  };
}
const all = ["procurement.workspace.read", "procurement.vendor_directory.read"] as const;

describe("compact Procurement subnavigation", () => {
  beforeEach(() => { jest.clearAllMocks(); mockBlocked = false; });

  it("shows flat Projects, Vendors and All my requests tabs with exact selected state", async () => {
    const view = await render(<ProcurementSubnavigation session={session(all)} active="dashboard" railBreakpoint={2000} />);
    expect(view.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual(["Projects", "Vendors", "All my requests"]);
    expect(view.getByRole("tab", { name: "Projects" }).props.accessibilityState.selected).toBe(true);
    expect(view.getByRole("tab", { name: "Vendors" }).props.accessibilityState.selected).toBe(false);
    await fireEvent.press(view.getByRole("tab", { name: "Projects" }));
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("tab", { name: "Vendors" }));
    expect(mockPush).toHaveBeenLastCalledWith("/feature/procurement-vendors");
    await fireEvent.press(view.getByRole("tab", { name: "All my requests" }));
    expect(mockPush).toHaveBeenLastCalledWith("/feature/my-requests");
    await view.rerender(<ProcurementSubnavigation session={session(all)} active="requests" railBreakpoint={2000} />);
    expect(view.getByRole("tab", { name: "All my requests" }).props.accessibilityState.selected).toBe(true);
  });

  it("shows independently authorized children and hides its compact copy at the rail breakpoint", async () => {
    const view = await render(<ProcurementSubnavigation session={session(["procurement.vendor_directory.read"])} active="vendors" railBreakpoint={2000} />);
    expect(view.getByRole("tab", { name: "Vendors" }).props.accessibilityState.selected).toBe(true);
    expect(view.queryByRole("tab", { name: "Projects" })).toBeNull();
    expect(view.getByRole("tab", { name: "All my requests" })).toBeTruthy();
    await view.rerender(<ProcurementSubnavigation session={session(all)} active="vendors" railBreakpoint={1} />);
    expect(view.queryByRole("tablist", { name: "Procurement sections" })).toBeNull();
  });

  it("respects aggregated scaffold navigation guards", async () => {
    mockBlocked = true;
    const view = await render(<ProcurementSubnavigation session={session(all)} active="dashboard" railBreakpoint={2000} />);
    for (const tab of view.getAllByRole("tab")) {
      expect(tab.props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(tab);
    }
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("hides unauthorized and non-procurement sessions", async () => {
    const view = await render(<ProcurementSubnavigation session={session([])} active="dashboard" railBreakpoint={2000} />);
    expect(view.queryByRole("tablist")).toBeNull();
    await view.rerender(<ProcurementSubnavigation session={session(all, "super_admin")} active="dashboard" railBreakpoint={2000} />);
    expect(view.queryByRole("tablist")).toBeNull();
  });

  it("keeps request labels readable without a fixed height or truncation", async () => {
    const view = await render(<ProcurementSubnavigation session={session(all)} active="requests" railBreakpoint={2000} />);
    const tab = view.getByRole("tab", { name: "All my requests" });
    expect(StyleSheet.flatten(tab.props.style)).toMatchObject({ minHeight: 48 });
    expect(StyleSheet.flatten(tab.props.style).height).toBeUndefined();
    expect(view.getByText("All my requests").props.numberOfLines).toBeUndefined();
  });
});
