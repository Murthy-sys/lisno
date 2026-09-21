import { render } from "@testing-library/react-native";

import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { MoreScreen } from "./MoreScreen";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() }
}));

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: jest.fn()
}));

jest.mock("../../navigation/AdaptiveAppScaffold", () => ({
  AdaptiveAppScaffold: ({ children }: { readonly children: import("react").ReactNode }) => {
    const React = jest.requireActual("react") as typeof import("react");
    const { View } = jest.requireActual("react-native") as typeof import("react-native");
    return React.createElement(View, null, children);
  }
}));

jest.mock("../../navigation/registry", () => ({
  destinationsForAuthorization: jest.fn(() => []),
  rootTabsForAuthorization: jest.fn(() => [])
}));

const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);

describe("MoreScreen backend presentation", () => {
  it("keeps account actions without exposing a connection section or host", async () => {
    useConfiguredRuntimeMock.mockReturnValue({
      configured: true,
      booted: true,
      runtime: { session: { logout: jest.fn(async () => undefined) } },
      environment: {
        environment: {
          profile: "local",
          id: "local:http://10.0.2.2:3000/api/v1",
          apiBaseUrl: "http://10.0.2.2:3000/api/v1",
          origin: "http://10.0.2.2:3000",
          host: "10.0.2.2:3000",
          isLocal: true
        },
        generation: 0,
        status: "ready"
      },
      session: {
        status: "authenticated",
        generation: 1,
        session: {
          user: {
            id: "user-1",
            name: "Asha Rao",
            email: "asha@example.test",
            role: "designer"
          },
          authorization: {
            role: "designer",
            policyVersion: "test-policy",
            permissions: []
          }
        }
      },
      initializationError: null,
      retryRestore: jest.fn()
    } as unknown as ReturnType<typeof useConfiguredRuntime>);

    const view = await render(<MoreScreen />);

    expect(view.getByText("Asha Rao")).toBeTruthy();
    expect(view.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(view.queryByText("Connection")).toBeNull();
    expect(view.queryByText("Backend connection")).toBeNull();
    expect(view.queryByText(/10\.0\.2\.2/)).toBeNull();
  });
});
