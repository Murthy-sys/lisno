import { useQuery } from "@tanstack/react-query";
import { fireEvent, render, within } from "@testing-library/react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProcurementDashboard } from "./ProcurementDashboard";

const mockPush = jest.fn();
const mockRefetch = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: jest.fn() }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("./ProcurementSubnavigation", () => ({ ProcurementSubnavigation: () => null }));

const session: AuthenticatedSession = {
  user: { id: "procurement-user", name: "Procurement", email: "p@example.test", role: "procurement" },
  authorization: { role: "procurement", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["procurement.workspace.read"] }
};

function project(projectId: string, projectName: string, estimate: number, spend: number) {
  return {
    projectId, projectName, estimateId: `estimate-${projectId}`, estimateVersion: 4,
    sections: [{ id: `section-${projectId}`, estimatedAmountPaise: estimate, actualSpendPaise: spend,
      items: [{ key: `line-${projectId}`, estimatedAmountPaise: estimate, actualSpendPaise: spend,
        expenses: spend ? [{ id: `expense-${projectId}`, projectId, sourceSectionId: `section-${projectId}`,
          sourceLineItemKey: `line-${projectId}`, type: "direct_spend", expenseClass: "procurement",
          status: "posted", amountPaise: spend }] : [] }] }]
  };
}

const projects = [
  project("p-first", "First Project", 20_000_000, 5_000_000),
  project("p-second", "Second Project", 12_500_000, 1_500_000)
];

function query(overrides: Record<string, unknown> = {}) {
  return { data: projects, error: null, isPending: false, isError: false, isRefetching: false,
    isRefetchError: false, refetch: mockRefetch, ...overrides } as never;
}

describe("Procurement Dashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useConfiguredRuntime).mockReturnValue({
      environment: { environment: { id: "qa" }, status: "ready" },
      runtime: { api: { authenticated: { get: jest.fn() } } }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    jest.mocked(useQuery).mockReturnValue(query());
  });

  it("renders real INR totals for two unequal projects and opens the stable project route", async () => {
    const view = await render(<ProcurementDashboard session={session} />);
    expect(view.getByRole("header", { name: "Procurement" })).toBeTruthy();
    const first = within(view.getByTestId("procurement-project-p-first"));
    const second = within(view.getByTestId("procurement-project-p-second"));
    expect(first.getByText("First Project")).toBeTruthy();
    expect(first.getByText("₹2,00,000.00")).toBeTruthy();
    expect(first.getByText("₹50,000.00")).toBeTruthy();
    expect(first.getByText("₹1,50,000.00")).toBeTruthy();
    expect(second.getByText("Second Project")).toBeTruthy();
    expect(second.getByText("₹1,25,000.00")).toBeTruthy();
    expect(second.getByText("₹15,000.00")).toBeTruthy();
    expect(second.getByText("₹1,10,000.00")).toBeTruthy();
    await fireEvent.press(view.getByTestId("procurement-project-p-second"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "procurement", recordId: "p-second" } });
  });

  it("hides cached projects on permission loss or 403", async () => {
    const deniedSession = { ...session, authorization: { ...session.authorization, permissions: [] } };
    const view = await render(<ProcurementDashboard session={deniedSession} />);
    expect(view.getByText("Procurement unavailable")).toBeTruthy();
    expect(view.queryByText("First Project")).toBeNull();
    jest.mocked(useQuery).mockReturnValue(query({ isError: true, error: new ApiError(403, "FORBIDDEN", "Denied") }));
    await view.rerender(<ProcurementDashboard session={session} />);
    expect(view.queryByText("First Project")).toBeNull();
  });

  it("shows loading, retry, and an integrity error without displaying false totals", async () => {
    jest.mocked(useQuery).mockReturnValue(query({ data: undefined, isPending: true }));
    const view = await render(<ProcurementDashboard session={session} />);
    expect(view.getByText("Loading procurement projects")).toBeTruthy();
    jest.mocked(useQuery).mockReturnValue(query({ data: undefined, isError: true, error: new Error("offline") }));
    await view.rerender(<ProcurementDashboard session={session} />);
    expect(view.getByText("Procurement projects could not be loaded")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    jest.mocked(useQuery).mockReturnValue(query({ data: [projects[0], projects[0]] }));
    await view.rerender(<ProcurementDashboard session={session} />);
    expect(view.getByText("Procurement amounts need review")).toBeTruthy();
    expect(view.queryByText("First Project")).toBeNull();
  });
});
