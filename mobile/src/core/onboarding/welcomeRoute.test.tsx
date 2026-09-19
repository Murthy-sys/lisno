import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import WelcomeRoute from "../../app/welcome";
import { useRuntime } from "../../runtime/RuntimeProvider";
import { ONBOARDING_COMPLETION_KEY } from "./onboardingCompletion";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    Redirect: ({ href }: { readonly href: string }) => <Text>{href}</Text>,
    router: { replace: jest.fn() }
  };
});

jest.mock("../../runtime/RuntimeProvider", () => ({
  useRuntime: jest.fn()
}));

jest.mock(
  "../../features/onboarding",
  () => {
    const React = jest.requireActual("react") as typeof import("react");
    const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
    return {
      OnboardingScreen: ({ onComplete }: { readonly onComplete: () => void | Promise<void> }) =>
        React.createElement(
          Pressable,
          { accessibilityRole: "button", onPress: () => void onComplete() },
          React.createElement(Text, null, "Sign in to Lisno")
        )
    };
  },
  { virtual: true }
);

const asyncStorageMock = jest.mocked(AsyncStorage);
const replaceMock = jest.mocked(router.replace);
const useRuntimeMock = jest.mocked(useRuntime);

function runtimeContext(status: "authenticated" | "unauthenticated") {
  return {
    configured: true as const,
    booted: true,
    runtime: {},
    environment: {},
    session: {
      status,
      session: status === "authenticated" ? { user: {}, authorization: {} } : null,
      failure: null,
      generation: 1
    },
    initializationError: null,
    retryRestore: jest.fn()
  } as unknown as ReturnType<typeof useRuntime>;
}

describe("welcome route completion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRuntimeMock.mockReturnValue(runtimeContext("unauthenticated"));
    asyncStorageMock.getItem.mockResolvedValue(null);
  });

  it("records completion before replacing the route with sign in", async () => {
    asyncStorageMock.setItem.mockResolvedValue(undefined);
    const view = await render(<WelcomeRoute />);

    await waitFor(() => expect(view.getByRole("button", { name: "Sign in to Lisno" })).toBeTruthy());
    fireEvent.press(view.getByRole("button", { name: "Sign in to Lisno" }));

    await waitFor(() => {
      expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
        ONBOARDING_COMPLETION_KEY,
        "complete"
      );
      expect(replaceMock).toHaveBeenCalledWith("/sign-in");
    });
  });

  it("still replaces the route when completion storage cannot write", async () => {
    asyncStorageMock.setItem.mockRejectedValue(new Error("storage unavailable"));
    const view = await render(<WelcomeRoute />);

    await waitFor(() => expect(view.getByRole("button", { name: "Sign in to Lisno" })).toBeTruthy());
    fireEvent.press(view.getByRole("button", { name: "Sign in to Lisno" }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/sign-in"));
  });

  it("redirects a completed direct welcome route to sign in", async () => {
    asyncStorageMock.getItem.mockResolvedValue("complete");
    const view = await render(<WelcomeRoute />);

    await waitFor(() => expect(view.getByText("/sign-in")).toBeTruthy());
    expect(view.queryByRole("button", { name: "Sign in to Lisno" })).toBeNull();
  });

  it("redirects an authenticated direct welcome route without reading completion", async () => {
    useRuntimeMock.mockReturnValue(runtimeContext("authenticated"));
    const view = await render(<WelcomeRoute />);

    expect(view.getByText("/")).toBeTruthy();
    expect(asyncStorageMock.getItem).not.toHaveBeenCalled();
  });
});
