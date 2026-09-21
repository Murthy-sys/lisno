import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { ApiError } from "../../core/http/apiClient";
import {
  InvalidAuthorizationSnapshotError,
  InvalidSessionPayloadError
} from "../../core/session/authorization";
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

function runtimeContext(isLocal: boolean, login = jest.fn()) {
  const apiBaseUrl = isLocal
    ? "http://10.0.2.2:3000/api/v1"
    : "https://api.example.test/api/v1";
  return {
    configured: true as const,
    booted: true,
    runtime: { session: { login } },
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

async function submitSignIn(
  loginError: Error,
  isLocal = true
) {
  const login = jest.fn().mockRejectedValue(loginError);
  useRuntimeMock.mockReturnValue(
    runtimeContext(isLocal, login) as unknown as ReturnType<typeof useRuntime>
  );

  const view = await render(<SignInScreen />);
  const emailField = view.queryByLabelText("Email address");
  const passwordField = view.queryByLabelText("Password");
  expect(emailField).toBeTruthy();
  expect(passwordField).toBeTruthy();
  await fireEvent.changeText(emailField!, "super-admin@lisno.example");
  await fireEvent.changeText(passwordField!, "test-password");
  await fireEvent.press(view.getByRole("button", { name: "Sign in" }));

  await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
  return view;
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

describe("SignInScreen login errors", () => {
  it("keeps invalid credentials generic and clears the password", async () => {
    const view = await submitSignIn(
      new ApiError(401, "INVALID_CREDENTIALS", "The supplied credentials did not match.")
    );

    expect(await view.findByText("Email or password is incorrect.")).toBeTruthy();
    expect(view.queryByText("The supplied credentials did not match.")).toBeNull();
    expect(view.queryByLabelText("Password")?.props.value).toBe("");
  });

  it.each([
    ["authorization snapshot", new InvalidAuthorizationSnapshotError()],
    ["session payload", new InvalidSessionPayloadError()]
  ])("shows a safe compatibility message for an invalid %s", async (_label, error) => {
    const view = await submitSignIn(error);

    expect(
      await view.findByText(
        "This app is out of sync with the Lisno service. Update or reload the app and try again."
      )
    ).toBeTruthy();
    expect(view.queryByText("Email or password is incorrect.")).toBeNull();
    expect(view.queryByText(error.message)).toBeNull();
    expect(view.queryByText(error.code)).toBeNull();
    expect(view.queryByLabelText("Password")?.props.value).toBe("");
  });
});
