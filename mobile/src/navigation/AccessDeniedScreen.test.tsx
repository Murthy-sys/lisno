import { fireEvent, render, waitFor } from "@testing-library/react-native";

import AccessDeniedScreen from "../app/access-denied";

const mockLogout = jest.fn();
const mockDispatch = jest.fn();
const mockBack = jest.fn();
let mockHasReturn = false;
jest.mock("expo-router", () => ({ useNavigation: () => ({ dispatch: mockDispatch }) }));
jest.mock("../runtime/RuntimeProvider", () => ({ useRuntime: () => ({ configured: true, session: { status: "authenticated" }, runtime: { session: { logout: mockLogout } } }) }));
jest.mock("../navigation/useScreenBack", () => ({ useScreenBack: ({ blocked }: { blocked: boolean }) => ({ visible: mockHasReturn, disabled: blocked, onBack: mockBack }) }));
jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { SafeAreaView: ({ children }: { readonly children: import("react").ReactNode }) => React.createElement(View, null, children) };
});

describe("unavailable mobile workspace recovery", () => {
  beforeEach(() => { jest.clearAllMocks(); mockHasReturn = false; mockLogout.mockResolvedValue(undefined); });

  it("offers sign-out when no authorized landing exists without a home redirect loop", async () => {
    const view = await render(<AccessDeniedScreen />);
    expect(view.queryByText("Return home")).toBeNull();
    expect(view.queryByRole("button", { name: "Back" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith({ type: "RESET", payload: { index: 0, routes: [{ name: "sign-in" }] } }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("keeps authorized Back separate from sign-out", async () => {
    mockHasReturn = true;
    const view = await render(<AccessDeniedScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("retains recovery after a sign-out failure", async () => {
    mockLogout.mockRejectedValueOnce(new Error("unavailable"));
    const view = await render(<AccessDeniedScreen />);
    await fireEvent.press(view.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(view.getByText("Could not sign out. Try again.")).toBeTruthy());
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(view.getByRole("button", { name: "Sign out" })).not.toBeDisabled();
  });
});
