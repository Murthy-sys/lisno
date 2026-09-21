import { render } from "@testing-library/react-native";

import { useRuntime } from "../../runtime/RuntimeProvider";
import { SignInScreen } from "./SignInScreen";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() }
}));

jest.mock("../../runtime/RuntimeProvider", () => ({
  useRuntime: jest.fn()
}));

jest.mock("./AuthFrame", () => ({
  AuthFrame: ({ children, title }: { readonly children: import("react").ReactNode; readonly title: string }) => {
    const React = jest.requireActual("react") as typeof import("react");
    const { Text, View } = jest.requireActual("react-native") as typeof import("react-native");
    return React.createElement(View, null, React.createElement(Text, null, title), children);
  }
}));

const useRuntimeMock = jest.mocked(useRuntime);

function runtimeContext(isLocal: boolean) {
  const apiBaseUrl = isLocal
    ? "http://10.0.2.2:3000/api/v1"
    : "https://api.example.test/api/v1";
  return {
    configured: true as const,
    booted: true,
    runtime: { session: { login: jest.fn() } },
    environment: {
      environment: {
        profile: isLocal ? "local" : "remote",
        id: `${isLocal ? "local" : "remote"}:${apiBaseUrl}`,
        apiBaseUrl,
        origin: new URL(apiBaseUrl).origin,
        host: new URL(apiBaseUrl).host,
        isLocal
      },
      generation: 0,
      status: "ready" as const
    },
    session: { status: "anonymous" as const, generation: 0 },
    initializationError: null,
    retryRestore: jest.fn()
  };
}

describe("SignInScreen backend presentation", () => {
  it("does not expose backend controls or the selected Remote host", async () => {
    useRuntimeMock.mockReturnValue(runtimeContext(false) as unknown as ReturnType<typeof useRuntime>);

    const view = await render(<SignInScreen />);

    expect(view.queryByText("Backend connection")).toBeNull();
    expect(view.queryByText("api.example.test")).toBeNull();
    expect(view.queryByLabelText("Using local backend services")).toBeNull();
    expect(view.getByRole("link", { name: "Forgot password?" })).toBeTruthy();
  });

  it("does not expose the selected Local environment", async () => {
    useRuntimeMock.mockReturnValue(runtimeContext(true) as unknown as ReturnType<typeof useRuntime>);

    const view = await render(<SignInScreen />);

    expect(view.queryByLabelText("Using local backend services")).toBeNull();
    expect(view.queryByText("LOCAL")).toBeNull();
    expect(view.queryByText("10.0.2.2:3000")).toBeNull();
    expect(view.queryByText("Backend connection")).toBeNull();
  });
});
