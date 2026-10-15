import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { AUTHORIZATION_POLICY_VERSION, PERMISSION_CODES, type PermissionCode, type Role } from "../contracts/authorization";
import type { AuthenticatedSession } from "../contracts/session";
import { ProcurementNavigation } from "./ProcurementNavigation";

function session(permissions: readonly PermissionCode[] = PERMISSION_CODES, role: Role = "procurement"): AuthenticatedSession {
  return { user: { id: "procurement-one", name: "Procurement", email: "qa@example.invalid", role },
    authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions } };
}

describe("Procurement drawer and rail menu", () => {
  it("opens the active group and navigates using the canonical destination", async () => {
    const navigate = jest.fn();
    const view = await render(<ProcurementNavigation session={session()} activeFeature="my-requests" onNavigate={navigate} />);
    expect(view.getByRole("button", { name: "Procurement" }).props.accessibilityState).toMatchObject({ expanded: true, selected: true });
    expect(view.getByRole("button", { name: "Procurement All my requests" }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(view.getByRole("button", { name: "Procurement Projects" }));
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ id: "procurement", path: "/feature/procurement" }));
    await fireEvent.press(view.getByRole("button", { name: "Procurement" }));
    expect(view.queryByRole("button", { name: "Procurement Projects" })).toBeNull();
    expect(view.getByRole("button", { name: "Procurement" }).props.accessibilityState.selected).toBe(true);
  });

  it("starts collapsed away from procurement and opens on an active descendant change", async () => {
    const props = { session: session(), onNavigate: jest.fn() };
    const view = await render(<ProcurementNavigation {...props} activeFeature="work" />);
    expect(view.getByRole("button", { name: "Home" }).props.accessibilityState.selected).toBe(true);
    expect(view.queryByRole("button", { name: "Procurement Vendors" })).toBeNull();
    await view.rerender(<ProcurementNavigation {...props} activeFeature="procurement-vendors" />);
    expect(view.getByRole("button", { name: "Procurement Vendors" }).props.accessibilityState.selected).toBe(true);
  });

  it("disables all navigation and expansion while a parent guard is active", async () => {
    const navigate = jest.fn();
    const view = await render(<ProcurementNavigation session={session()} activeFeature="procurement" disabled onNavigate={navigate} />);
    for (const button of view.getAllByRole("button")) {
      expect(button.props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(button);
    }
    expect(navigate).not.toHaveBeenCalled();
    expect(view.getByRole("button", { name: "Procurement" }).props.accessibilityState.expanded).toBe(true);
  });

  it("removes revoked permissions immediately and does not render for other roles", async () => {
    const view = await render(<ProcurementNavigation session={session()} activeFeature="procurement" onNavigate={jest.fn()} />);
    await view.rerender(<ProcurementNavigation session={session(["workflow.tasks.read"])} activeFeature="procurement" onNavigate={jest.fn()} />);
    expect(view.getAllByRole("button")).toHaveLength(1);
    expect(view.getByRole("button", { name: "Home" })).toBeTruthy();
    await view.rerender(<ProcurementNavigation session={session(PERMISSION_CODES, "designer")} onNavigate={jest.fn()} />);
    expect(view.queryByTestId("procurement-navigation")).toBeNull();
  });

  it("allows complete long labels to wrap and retains at least 48 point touch controls", async () => {
    const view = await render(<ProcurementNavigation session={session()} activeFeature="procurement" onNavigate={jest.fn()} />);
    for (const label of ["Work order approvals", "My access requests", "All my requests"]) {
      const text = view.getByText(label);
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.adjustsFontSizeToFit).not.toBe(true);
      expect(StyleSheet.flatten(text.props.style).flexShrink).toBe(1);
      expect(StyleSheet.flatten(view.getByRole("button", { name: label === "All my requests" ? `Procurement ${label}` : label }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
  });
});
