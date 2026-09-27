import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { clientEstimateListKey } from "./clientReviewApi";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { resolveAuthorizedFeature } from "../../navigation/registry";
import type { ProtectedDocumentViewerProps } from "../documents/ProtectedDocumentViewer";
import { FeatureWorkspace } from "../workspace/FeatureWorkspace";
import { ClientEstimateReviewScreen } from "./ClientEstimateReviewScreen";

const mockPush = jest.fn();
const mockDocumentViewer = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("../documents/ProtectedDocumentViewer", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Modal: NativeModal, Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    ProtectedDocumentViewer: (props: ProtectedDocumentViewerProps) => {
      mockDocumentViewer(props);
      return React.createElement(NativeModal, { visible: props.visible, onRequestClose: props.onClose },
        React.createElement(Pressable, { accessibilityLabel: "Close document viewer", accessibilityRole: "button", onPress: props.onClose },
          React.createElement(Text, null, "Close")));
    }
  };
});
jest.mock("../messages/MessagesWorkspace", () => ({ MessagesWorkspace: () => null }));
jest.mock("../dashboard/SuperAdminMobileDashboard", () => ({ SuperAdminMobileDashboard: () => null }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { ScaffoldContentBack: () => React.createElement(View, { testID: "estimate-back" }) };
});
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

const runtimeMock = jest.mocked(useConfiguredRuntime);
const permissions = [
  "estimation.client_estimate.list",
  "estimation.client_estimate.decision",
  "estimation.client_estimate_pdf.download",
  "projects.client_summary.read",
  "projects.read"
] as const;

function session(grants: readonly string[] = permissions, role: AuthenticatedSession["user"]["role"] = "client"): AuthenticatedSession {
  return {
    user: { id: "user-client", name: "Client", email: "client@example.invalid", role },
    authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: [...grants] }
  } as AuthenticatedSession;
}

function estimate(id: string, projectId: string | null, total: number, status: string = "sent_to_client") {
  return {
    id, projectId, status, designPlanStatus: null, total, subtotal: total - 1000, gst: 1000,
    lineItems: [
      { id: `${id}-included`, roomName: id === "estimate-one" ? "Bedroom" : "Kitchen", specification: "Cabinets", unit: "set", quantity: 1, rate: total - 1000, amount: total - 1000, included: true },
      { id: `${id}-excluded`, roomName: "Excluded room", unit: "set", quantity: 1, rate: 5_000, amount: 0, included: false }
    ],
    lead: { projectName: id === "estimate-one" ? "Lakeside Villa" : "Harbour Loft", location: "Kochi", clientName: "Client" }
  };
}

function setup(rows: readonly unknown[] = [estimate("estimate-one", null, 101_000), estimate("estimate-two", "project-two", 951_000)]) {
  const get = jest.fn(async () => rows);
  const post = jest.fn(async (): Promise<{ id: string; status: string; projectId: string | null }> => ({ id: "estimate-one", status: "client_approved", projectId: "project-one" }));
  const share = jest.fn(async () => undefined);
  const download = jest.fn(() => ({ result: Promise.resolve({ share }) }));
  runtimeMock.mockReturnValue({
    runtime: { api: { authenticated: { get, post } }, transfers: { download } },
    environment: { status: "ready", environment: { id: "env-test" } },
    session: { status: "authenticated", session: session() }
  } as never);
  return { get, post, download, share };
}

async function mount(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const view = await render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { view, queryClient };
}

describe("ClientEstimateReviewScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("opens each published estimate from the Client list by its own ID", async () => {
    const { get } = setup();
    const client = session();
    const destination = resolveAuthorizedFeature("estimates", client.user.role, client.authorization)!;
    await mount(<FeatureWorkspace destination={destination} session={client} />);
    const first = await screen.findByRole("button", { name: "Lakeside Villa, Awaiting your decision, ₹1,01,000" });
    const second = screen.getByRole("button", { name: "Harbour Loft, Awaiting your decision, ₹9,51,000" });
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).toBeNull();
    await fireEvent.press(second);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/estimate/[estimateId]", params: { estimateId: "estimate-two" } });
    expect(get).toHaveBeenCalledWith("/client/estimates", expect.objectContaining({ signal: expect.any(Object) }));
  });

  it("selects by exact estimate ID, shows server amounts and included lines, and keeps a pre-project estimate accessible", async () => {
    const { get } = setup();
    await mount(<ClientEstimateReviewScreen estimateId="estimate-one" session={session()} />);
    await waitFor(() => expect(screen.getByTestId("estimate-total").props.children).toBe("₹1,01,000"));
    expect(get).toHaveBeenCalledWith("/client/estimates", expect.objectContaining({ signal: expect.any(Object) }));
    expect(screen.getByText("Lakeside Villa · Kochi")).toBeTruthy();
    expect(screen.getByText("Bedroom")).toBeTruthy();
    expect(screen.getByText("₹1,00,000")).toBeTruthy();
    expect(screen.queryByText("Kitchen")).toBeNull();
    expect(screen.queryByText("Excluded room")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open project designs" })).toBeNull();
    expect(screen.getByRole("button", { name: "Approve estimate" })).toBeTruthy();
  });

  it("confirms approval before mutation and links only to the returned project ID", async () => {
    const { post, get } = setup();
    await mount(<ClientEstimateReviewScreen estimateId="estimate-one" session={session()} />);
    await screen.findByRole("button", { name: "Approve estimate" });
    await fireEvent.press(screen.getByRole("button", { name: "Approve estimate" }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("header", { name: "Confirm estimate approval" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/client/estimates/estimate-one/decision", { decision: "approve", note: "" }));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
    await screen.findByText("Your approval was recorded.");
    expect(screen.queryByRole("button", { name: "Approve estimate" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Open project designs" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "projects", recordId: "project-one", tab: "designs" } });
  });

  it("requires a meaningful change note and leaves commercial controls read-only after a request", async () => {
    const { post } = setup([estimate("estimate-one", null, 101_000)]);
    post.mockResolvedValueOnce({ id: "estimate-one", status: "client_changes_requested", projectId: null });
    await mount(<ClientEstimateReviewScreen estimateId="estimate-one" session={session()} />);
    await fireEvent.press(await screen.findByRole("button", { name: "Request changes" }));
    expect(screen.getByRole("button", { name: "Send change request" }).props.accessibilityState.disabled).toBe(true);
    expect(post).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Requested changes"), "  Please revise the cabinets.  ");
    await fireEvent.press(screen.getByRole("button", { name: "Send change request" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/client/estimates/estimate-one/decision", { decision: "request_changes", note: "Please revise the cabinets." }));
    await screen.findByText("Your change request was recorded.");
    expect(screen.queryByRole("button", { name: "Request changes" })).toBeNull();
  });

  it("keeps a stale 409 decision visible for refresh without assuming approval", async () => {
    const { post } = setup([estimate("estimate-one", null, 101_000)]);
    post.mockRejectedValueOnce(new ApiError(409, "ESTIMATE_STALE", "Changed"));
    await mount(<ClientEstimateReviewScreen estimateId="estimate-one" session={session()} />);
    await fireEvent.press(await screen.findByRole("button", { name: "Approve estimate" }));
    await fireEvent.press(screen.getByRole("button", { name: "Confirm approval" }));
    await screen.findByText("This estimate has changed. Refresh it before sending a decision again.");
    expect(screen.getByTestId("estimate-status").props.children).toBe("Awaiting your decision");
    expect(screen.getByRole("button", { name: "Refresh estimate" })).toBeTruthy();
    expect(screen.queryByText("Your approval was recorded.")).toBeNull();
  });

  it("hides cached estimate details if access is revoked on refresh", async () => {
    const { get } = setup([estimate("estimate-one", null, 101_000)]);
    const { queryClient } = await mount(<ClientEstimateReviewScreen estimateId="estimate-one" session={session()} />);
    await screen.findByTestId("estimate-total");
    get.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Forbidden"));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: clientEstimateListKey({ environmentId: "env-test", userId: "user-client" }) });
    });
    await screen.findByRole("header", { name: "Estimate review unavailable" });
    expect(screen.queryByTestId("estimate-total")).toBeNull();
    expect(screen.queryByText("Lakeside Villa · Kochi")).toBeNull();
  });

  it("opens the exact Client PDF in one in-app modal without sharing and keeps decided estimates read-only", async () => {
    const { download, share } = setup([estimate("estimate-one", null, 101_000, "client_changes_requested")]);
    const { view } = await mount(<ClientEstimateReviewScreen estimateId="estimate-one" session={session()} />);
    await fireEvent.press(await screen.findByRole("button", { name: "Open estimate PDF" }));
    expect((mockDocumentViewer.mock.calls.at(-1)?.[0] as ProtectedDocumentViewerProps)).toEqual(expect.objectContaining({
      visible: true,
      source: {
        path: "/client/estimates/estimate-one/pdf",
        fileName: "lisno-estimate-estimate-one.pdf",
        mimeType: "application/pdf",
        kind: "estimate-pdf"
      }
    }));
    expect(view.container.queryAll((instance) => instance.type === "Modal")).toHaveLength(1);
    expect(download).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Request changes" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Close document viewer" }));
    expect((mockDocumentViewer.mock.calls.at(-1)?.[0] as ProtectedDocumentViewerProps)).toEqual(expect.objectContaining({ visible: false, source: null }));
    expect(screen.getByRole("button", { name: "Open estimate PDF" })).toBeTruthy();
  });

  it("does not stack PDF modals on repeated taps and closes on Android Back", async () => {
    const { download, share } = setup([estimate("estimate-one", null, 101_000, "client_changes_requested")]);
    const { view } = await mount(<ClientEstimateReviewScreen estimateId="estimate-one" session={session()} />);
    const open = await screen.findByRole("button", { name: "Open estimate PDF" });
    await fireEvent.press(open);
    await fireEvent.press(open);
    expect(view.container.queryAll((instance) => instance.type === "Modal")).toHaveLength(1);
    expect(mockDocumentViewer.mock.calls.filter(([props]) => (props as ProtectedDocumentViewerProps).visible)).toHaveLength(1);
    expect(download).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    await act(async () => { view.container.queryAll((instance) => instance.type === "Modal")[0]?.props.onRequestClose(); });
    expect((mockDocumentViewer.mock.calls.at(-1)?.[0] as ProtectedDocumentViewerProps).visible).toBe(false);
    expect(screen.getByRole("button", { name: "Open estimate PDF" })).toBeTruthy();
  });

  it("closes the preview when the review switches to a different estimate", async () => {
    const { download, share } = setup();
    const client = session();
    const { view, queryClient } = await mount(<ClientEstimateReviewScreen estimateId="estimate-one" session={client} />);
    await fireEvent.press(await screen.findByRole("button", { name: "Open estimate PDF" }));
    expect((mockDocumentViewer.mock.calls.at(-1)?.[0] as ProtectedDocumentViewerProps).source?.path).toBe("/client/estimates/estimate-one/pdf");

    await view.rerender(<QueryClientProvider client={queryClient}><ClientEstimateReviewScreen estimateId="estimate-two" session={client} /></QueryClientProvider>);
    expect((mockDocumentViewer.mock.calls.at(-1)?.[0] as ProtectedDocumentViewerProps)).toEqual(expect.objectContaining({ visible: false, source: null }));
    expect(screen.getByText("Harbour Loft · Kochi")).toBeTruthy();
    expect(download).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it("gates each operation and returns a non-disclosing state for an unrelated estimate", async () => {
    setup([estimate("estimate-one", null, 101_000)]);
    const limited = session(["estimation.client_estimate.list"]);
    const { view, queryClient } = await mount(<ClientEstimateReviewScreen estimateId="estimate-one" session={limited} />);
    await screen.findByTestId("estimate-total");
    expect(screen.queryByRole("button", { name: "Open estimate PDF" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).toBeNull();
    await view.rerender(<QueryClientProvider client={queryClient}><ClientEstimateReviewScreen estimateId="estimate-unknown" session={limited} /></QueryClientProvider>);
    await screen.findByRole("header", { name: "Estimate unavailable" });
    expect(screen.queryByText("Lakeside Villa")).toBeNull();
  });
});
