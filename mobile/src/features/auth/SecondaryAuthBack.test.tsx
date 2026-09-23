import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";

import { ApiError } from "../../core/http/apiClient";
import { useScreenBack } from "../../navigation/useScreenBack";
import { useConfiguredRuntime, useRuntime } from "../../runtime/RuntimeProvider";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";
import { SignInScreen } from "./SignInScreen";
import { TokenPasswordScreen } from "./TokenPasswordScreen";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn()
}));
jest.mock("../../navigation/useScreenBack", () => ({ useScreenBack: jest.fn() }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn(), useRuntime: jest.fn() }));
jest.mock("../../ui/brand", () => ({ LisnoWordmark: () => null }));
jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { SafeAreaView: ({ children }: { readonly children: import("react").ReactNode }) => React.createElement(View, null, children) };
});

const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);
const useRuntimeMock = jest.mocked(useRuntime);
const useScreenBackMock = jest.mocked(useScreenBack);
const useLocalSearchParamsMock = jest.mocked(useLocalSearchParams);
const post = jest.fn();
const onBack = jest.fn();
const returnToParent = jest.fn();

function deferred() {
  let resolve!: (value?: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  post.mockReset();
  post.mockResolvedValue({});
  useConfiguredRuntimeMock.mockReturnValue({ runtime: { api: { public: { post } } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
  useLocalSearchParamsMock.mockReturnValue({ token: "test-only-secure-link" });
  useScreenBackMock.mockImplementation(({ blocked } = {}) => ({ visible: true, disabled: blocked === true, onBack, returnToParent }));
});

describe("secondary auth shared Back", () => {
  it("keeps sign-in free of Back controls and navigation-policy hooks", async () => {
    useRuntimeMock.mockReturnValue({ configured: true, runtime: { session: { login: jest.fn() } } } as unknown as ReturnType<typeof useRuntime>);
    const view = await render(<SignInScreen />);

    expect(view.getByRole("header", { name: "Welcome back" })).toBeTruthy();
    expect(view.queryByRole("button", { name: /Back/ })).toBeNull();
    expect(useScreenBackMock).not.toHaveBeenCalled();
  });

  it("offers one accessible Back on direct-entry recovery without requesting email", async () => {
    const view = await render(<ForgotPasswordScreen />);
    const back = view.getByRole("button", { name: "Back to sign in" });

    expect(view.getAllByRole("button", { name: "Back to sign in" })).toHaveLength(1);
    expect(view.getByText("Back")).toBeTruthy();
    expect(back).toHaveStyle({ minHeight: 48 });
    expect(back.props.accessibilityHint).toBe("Returns to the sign-in screen.");
    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    expect(useScreenBackMock).toHaveBeenLastCalledWith({ blocked: false });
  });

  it("keeps recovery Back available after local email validation fails", async () => {
    const view = await render(<ForgotPasswordScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Send reset instructions" }));
    expect(view.getByText("Enter a valid email address.")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  });

  it("blocks recovery Back during a request and restores one Back on success", async () => {
    const pending = deferred();
    post.mockReturnValueOnce(pending.promise);
    const view = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(view.getByLabelText("Email address"), "person@example.invalid");
    await fireEvent.press(view.getByRole("button", { name: "Send reset instructions" }));

    expect(useScreenBackMock).toHaveBeenLastCalledWith({ blocked: true });
    expect(view.getByRole("button", { name: "Back to sign in" })).toBeDisabled();
    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);

    await act(async () => { pending.resolve({}); await pending.promise; });
    expect(view.getByRole("header", { name: "Request received" })).toBeTruthy();
    expect(view.getAllByRole("button", { name: "Back to sign in" })).toHaveLength(1);
    expect(view.getByRole("button", { name: "Back to sign in" })).toBeEnabled();
    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("restores recovery Back after a failed request without retrying it", async () => {
    post.mockRejectedValueOnce(new ApiError(503, "PASSWORD_RESET_DELIVERY_UNAVAILABLE", "Unavailable"));
    const view = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(view.getByLabelText("Email address"), "person@example.invalid");
    await fireEvent.press(view.getByRole("button", { name: "Send reset instructions" }));
    await waitFor(() => expect(view.getByText("Password reset email is temporarily unavailable. Try again later.")).toBeTruthy());

    expect(view.getByRole("button", { name: "Back to sign in" })).toBeEnabled();
    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(useScreenBackMock).toHaveBeenLastCalledWith({ blocked: false });
  });
});

describe.each([
  { flow: "reset" as const, inspect: "/auth/password-reset/inspect", complete: "/auth/password-reset/complete", label: "Reset password", success: "Your password has been reset." },
  { flow: "invitation" as const, inspect: "/auth/user-invitations/inspect", complete: "/auth/user-invitations/accept", label: "Accept invitation", success: "Your invitation has been accepted." }
])("$flow secure-link Back", ({ flow, inspect, complete, label, success }) => {
  it("allows Back during inspection without completing the account operation", async () => {
    const pending = deferred();
    post.mockReturnValueOnce(pending.promise);
    const view = await render(<TokenPasswordScreen flow={flow} />);
    expect(view.getByText("Checking secure link…")).toBeTruthy();
    expect(view.getAllByRole("button", { name: "Back to sign in" })).toHaveLength(1);
    expect(view.getByRole("button", { name: "Back to sign in" })).toBeEnabled();

    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(inspect, { token: "test-only-secure-link" });
    expect(useScreenBackMock).toHaveBeenLastCalledWith({ blocked: false });
    await view.unmount();
    await act(async () => { pending.resolve({}); await pending.promise; });
  });

  it("offers Back when a direct link has no token", async () => {
    useLocalSearchParamsMock.mockReturnValue({});
    const view = await render(<TokenPasswordScreen flow={flow} />);
    expect(view.getByText("This secure link is invalid, expired, or already used.")).toBeTruthy();
    expect(view.getAllByRole("button", { name: "Back to sign in" })).toHaveLength(1);
    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  });

  it("offers Back after an invalid or expired link inspection", async () => {
    post.mockRejectedValueOnce(new ApiError(410, "EXPIRED_TOKEN", "Expired"));
    const view = await render(<TokenPasswordScreen flow={flow} />);
    await waitFor(() => expect(view.getByText("This secure link is invalid, expired, or already used.")).toBeTruthy());
    expect(view.getAllByRole("button", { name: "Back to sign in" })).toHaveLength(1);
    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("leaves a ready form without submitting its password", async () => {
    const view = await render(<TokenPasswordScreen flow={flow} />);
    const input = await view.findByLabelText("New password");
    await fireEvent.changeText(input, "UnsubmittedPassword1!");
    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(inspect, { token: "test-only-secure-link" });
  });

  it("blocks Back while saving and sends successful Continue through the same safe return", async () => {
    const pending = deferred();
    post.mockResolvedValueOnce({}).mockReturnValueOnce(pending.promise);
    const view = await render(<TokenPasswordScreen flow={flow} />);
    await fireEvent.changeText(await view.findByLabelText("New password"), "NewPassword123!");
    await fireEvent.changeText(view.getByLabelText("Confirm new password"), "NewPassword123!");
    await fireEvent.press(view.getByRole("button", { name: label }));

    expect(useScreenBackMock).toHaveBeenLastCalledWith({ blocked: true });
    expect(view.getByRole("button", { name: "Back to sign in" })).toBeDisabled();
    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith(complete, { token: "test-only-secure-link", password: "NewPassword123!", passwordConfirmation: "NewPassword123!" });

    await act(async () => { pending.resolve({}); await pending.promise; });
    expect(view.getByText(success)).toBeTruthy();
    expect(view.getAllByRole("button", { name: "Back to sign in" })).toHaveLength(1);
    expect(view.getByRole("button", { name: "Back to sign in" })).toBeEnabled();
    expect(view.queryByLabelText("New password")).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Continue to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(useScreenBackMock).toHaveBeenLastCalledWith({ blocked: false });
  });

  it("restores Back after a failed save without another account mutation", async () => {
    post.mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Unavailable"));
    const view = await render(<TokenPasswordScreen flow={flow} />);
    await fireEvent.changeText(await view.findByLabelText("New password"), "NewPassword123!");
    await fireEvent.changeText(view.getByLabelText("Confirm new password"), "NewPassword123!");
    await fireEvent.press(view.getByRole("button", { name: label }));
    await waitFor(() => expect(view.getByText("The account could not be updated. Try again.")).toBeTruthy());

    expect(view.getByRole("button", { name: "Back to sign in" })).toBeEnabled();
    await fireEvent.press(view.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
  });
});
