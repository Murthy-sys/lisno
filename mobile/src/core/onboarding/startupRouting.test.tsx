import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor } from "@testing-library/react-native";

import StartupRouter from "../../app/index";
import { useRuntime } from "../../runtime/RuntimeProvider";
import { ONBOARDING_COMPLETION_KEY } from "./onboardingCompletion";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    Redirect: ({ href }: { readonly href: string }) => <Text>{href}</Text>
  };
});

jest.mock("../../runtime/RuntimeProvider", () => ({
  useRuntime: jest.fn()
}));

jest.mock("../../navigation/registry", () => ({
  landingDestination: jest.fn(() => ({ id: "projects" }))
}));

const useRuntimeMock = jest.mocked(useRuntime);
const asyncStorageMock = jest.mocked(AsyncStorage);

function runtimeContext(
  status: "authenticated" | "unauthenticated" | "transient_error",
  overrides: Record<string, unknown> = {}
) {
  const authenticated = status === "authenticated";
  return {
    configured: true as const,
    booted: true,
    runtime: {},
    environment: {},
    session: {
      status,
      session: authenticated
        ? {
            user: { id: "user-1", name: "User", email: "user@example.test", role: "admin" },
            authorization: { role: "admin", policyVersion: "test", permissions: [] }
          }
        : null,
      failure: null,
      generation: 1
    },
    initializationError: null,
    retryRestore: jest.fn(async () => undefined),
    ...overrides
  } as unknown as ReturnType<typeof useRuntime>;
}

describe("startup onboarding routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes a first anonymous launch to welcome after resolving storage", async () => {
    let resolveRead!: (value: string | null) => void;
    asyncStorageMock.getItem.mockImplementation(
      async () => new Promise<string | null>((resolve) => {
        resolveRead = resolve;
      })
    );
    useRuntimeMock.mockReturnValue(runtimeContext("unauthenticated"));

    const view = await render(<StartupRouter />);

    expect(view.queryByText("/welcome")).toBeNull();
    expect(view.getByText("Preparing your workspace")).toBeTruthy();
    await act(async () => resolveRead(null));
    await waitFor(() => expect(view.getByText("/welcome")).toBeTruthy());
    expect(asyncStorageMock.getItem).toHaveBeenCalledWith(ONBOARDING_COMPLETION_KEY);
  });

  it("routes a completed anonymous launch directly to sign in", async () => {
    asyncStorageMock.getItem.mockResolvedValue("complete");
    useRuntimeMock.mockReturnValue(runtimeContext("unauthenticated"));

    const view = await render(<StartupRouter />);

    await waitFor(() => expect(view.getByText("/sign-in")).toBeTruthy());
  });

  it("routes to welcome when completion storage cannot be read", async () => {
    asyncStorageMock.getItem.mockRejectedValue(new Error("storage unavailable"));
    useRuntimeMock.mockReturnValue(runtimeContext("unauthenticated"));

    const view = await render(<StartupRouter />);

    await waitFor(() => expect(view.getByText("/welcome")).toBeTruthy());
  });

  it("bypasses onboarding storage for an authenticated session", async () => {
    useRuntimeMock.mockReturnValue(runtimeContext("authenticated"));

    const view = await render(<StartupRouter />);

    expect(view.getByText("/feature/projects")).toBeTruthy();
    expect(asyncStorageMock.getItem).not.toHaveBeenCalled();
  });

  it("preserves recovery precedence without reading onboarding storage", async () => {
    useRuntimeMock.mockReturnValue(runtimeContext("transient_error"));

    const view = await render(<StartupRouter />);

    expect(view.getByText("/startup-recovery")).toBeTruthy();
    expect(asyncStorageMock.getItem).not.toHaveBeenCalled();
  });

  it("preserves startup loading without reading onboarding storage", async () => {
    useRuntimeMock.mockReturnValue(
      runtimeContext("unauthenticated", { booted: false })
    );

    const view = await render(<StartupRouter />);

    expect(view.getByText("Preparing your workspace")).toBeTruthy();
    expect(view.queryByText("/welcome")).toBeNull();
    expect(asyncStorageMock.getItem).not.toHaveBeenCalled();
  });
});
