import { render } from "@testing-library/react-native";

import { useConfiguredRuntime, useRuntime } from "../../runtime/RuntimeProvider";
import StartupRouter from "../../app/index";
import StartupRecoveryScreen from "../../app/startup-recovery";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    Redirect: ({ href }: { readonly href: string }) => <Text>{href}</Text>,
    router: { push: jest.fn(), replace: jest.fn() }
  };
});

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: jest.fn(),
  useRuntime: jest.fn()
}));

const useRuntimeMock = jest.mocked(useRuntime);
const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);

describe("startup backend presentation", () => {
  it("shows resolver detail with neutral outside-app configuration guidance", async () => {
    useRuntimeMock.mockReturnValue({
      configured: false,
      message: "EXPO_PUBLIC_LOCAL_API_URL is required when EXPO_PUBLIC_API_ENV=local."
    });

    const view = await render(<StartupRouter />);

    expect(view.getByRole("header", { name: "Backend setup required" })).toBeTruthy();
    expect(view.getByText(/EXPO_PUBLIC_LOCAL_API_URL/)).toBeTruthy();
    expect(view.getByText(/Update the selected backend in the app environment/)).toBeTruthy();
    expect(view.queryByText(/Configure EXPO_PUBLIC_REMOTE_API_URL/)).toBeNull();
  });

  it("offers recovery actions without an alternate backend action", async () => {
    useConfiguredRuntimeMock.mockReturnValue({
      configured: true,
      booted: true,
      runtime: { session: { logout: jest.fn(async () => undefined) } },
      environment: {} as ReturnType<typeof useConfiguredRuntime>["environment"],
      session: { status: "transient_error", generation: 1, message: "offline" },
      initializationError: "Lisno could not restore this session.",
      retryRestore: jest.fn(async () => undefined)
    } as unknown as ReturnType<typeof useConfiguredRuntime>);

    const view = await render(<StartupRecoveryScreen />);

    expect(view.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Sign in again" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Backend connection" })).toBeNull();
    expect(view.queryByText(/another configured connection/)).toBeNull();
  });
});
