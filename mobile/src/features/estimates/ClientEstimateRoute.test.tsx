import { render, screen } from "@testing-library/react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import ClientEstimateRoute from "../../app/estimate/[estimateId]";

let mockParams: unknown = { estimateId: "estimate-one" };
let mockRuntime: unknown;

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    useLocalSearchParams: () => mockParams,
    Redirect: ({ href }: { readonly href: string }) => React.createElement(Text, { testID: "redirect" }, href)
  };
});
jest.mock("../../runtime/RuntimeProvider", () => ({ useRuntime: () => mockRuntime }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { AdaptiveAppScaffold: ({ children }: { readonly children: React.ReactNode }) => React.createElement(View, { testID: "estimate-scaffold" }, children) };
});
jest.mock("./ClientEstimateReviewScreen", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return { ClientEstimateReviewScreen: ({ estimateId }: { readonly estimateId: string }) => React.createElement(Text, { testID: "opened-estimate" }, estimateId) };
});

function configured(role: string, permissions: readonly string[]) {
  return {
    configured: true,
    session: {
      status: "authenticated",
      session: {
        user: { id: "user-one", role, name: "Client", email: "client@example.invalid" },
        authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions }
      }
    }
  };
}

describe("Client estimate route", () => {
  beforeEach(() => {
    mockParams = { estimateId: "estimate-one" };
    mockRuntime = configured("client", ["estimation.client_estimate.list"]);
  });

  it("opens a scalar estimate ID only for an authorized Client", async () => {
    await render(<ClientEstimateRoute />);
    expect(screen.getByTestId("estimate-scaffold")).toBeTruthy();
    expect(screen.getByTestId("opened-estimate").props.children).toBe("estimate-one");
  });

  it.each([{ estimateId: ["one", "two"] }, { estimateId: "nested%2Festimate" }, { estimateId: "" }])("rejects malformed route params %j", async (params) => {
    mockParams = params;
    await render(<ClientEstimateRoute />);
    expect(screen.getByTestId("redirect").props.children).toBe("/access-denied");
  });

  it("rejects another role and a Client without the list operation", async () => {
    mockRuntime = configured("designer", ["estimation.client_estimate.list"]);
    const view = await render(<ClientEstimateRoute />);
    expect(screen.getByTestId("redirect").props.children).toBe("/access-denied");
    mockRuntime = configured("client", ["projects.client_summary.read"]);
    await view.rerender(<ClientEstimateRoute />);
    expect(screen.getByTestId("redirect").props.children).toBe("/access-denied");
  });
});
