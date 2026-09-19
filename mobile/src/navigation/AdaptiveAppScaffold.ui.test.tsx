import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../contracts/authorization";
import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { AdaptiveAppScaffold, useScaffoldNavigationGuard } from "./AdaptiveAppScaffold";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({ router: { replace: (...args: readonly unknown[]) => mockReplace(...args), push: jest.fn() } }));
jest.mock("../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../ui/brand", () => ({ LisnoWordmark: () => null }));
jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { SafeAreaView: ({ children }: { readonly children: import("react").ReactNode }) => React.createElement(View, null, children) };
});

const useRuntimeMock = jest.mocked(useConfiguredRuntime);

function PendingSendControl() {
  const guard = useScaffoldNavigationGuard();
  return (
    <Pressable accessibilityLabel="Start pending send" accessibilityRole="button" onPress={() => guard?.setBlocked(true)}>
      <Text>Start pending send</Text>
    </Pressable>
  );
}

describe("AdaptiveAppScaffold navigation guard", () => {
  it("disables scaffold navigation while a child reports an in-flight send", async () => {
    useRuntimeMock.mockReturnValue({
      session: {
        status: "authenticated",
        session: {
          user: { id: "user-1", name: "Aditi Rao", email: "aditi@example.test", role: "super_admin" },
          authorization: {
            role: "super_admin",
            policyVersion: AUTHORIZATION_POLICY_VERSION,
            permissions: ["admin.dashboard.read", "projects.list", "chat.read"]
          }
        }
      }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const view = await render(
      <AdaptiveAppScaffold activeFeature="messages" navigationRailBreakpoint={2000}>
        <PendingSendControl />
      </AdaptiveAppScaffold>
    );

    expect(view.getAllByRole("tab").every((tab) => tab.props.accessibilityState.disabled === false)).toBe(true);
    await fireEvent.press(view.getByRole("button", { name: "Start pending send" }));
    await waitFor(() => expect(view.getAllByRole("tab").every((tab) => tab.props.accessibilityState.disabled === true)).toBe(true));
    expect(view.getByRole("button", { name: "Open notifications" }).props.accessibilityState.disabled).toBe(true);
  });
});
