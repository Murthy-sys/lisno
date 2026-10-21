import { render } from "@testing-library/react-native";
import { Text } from "react-native";

import { useStartupPresentation } from "../core/startup/StartupPresentation";
import { useRuntime } from "../runtime/RuntimeProvider";
import { StartupRouteGate } from "./StartupRouteGate";

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return { Redirect: ({ href }: { href: string }) => React.createElement(Text, { testID: "redirect" }, href) };
});
jest.mock("../runtime/RuntimeProvider", () => ({ useRuntime: jest.fn() }));
jest.mock("../core/startup/StartupPresentation", () => ({ useStartupPresentation: jest.fn() }));
jest.mock("../ui/StartupBrand", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return { StartupBrand: () => React.createElement(Text, null, "Preparing your workspace") };
});

const childMount = jest.fn();
const retainedParams = { featureId: "projects", recordId: "project-one", tab: "documents", message: "message-one" };

function Destination({ params }: { params: typeof retainedParams }) {
  childMount(params);
  return <Text>Requested destination</Text>;
}

function runtime(overrides: Record<string, unknown> = {}) {
  return { configured: true, booted: true, initializationError: null, session: { status: "authenticated" }, ...overrides } as ReturnType<typeof useRuntime>;
}

function presentation(readyForNavigation: boolean) {
  jest.mocked(useStartupPresentation).mockReturnValue({ phase: readyForNavigation ? "settled" : "playing", readyForNavigation, complete: jest.fn() });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useRuntime).mockReturnValue(runtime());
  presentation(true);
});

it("keeps a fast-restored destination unmounted until the intro releases it with the original props", async () => {
  presentation(false);
  const route = () => <StartupRouteGate><Destination params={retainedParams} /></StartupRouteGate>;
  const view = await render(route());
  expect(view.getByText("Preparing your workspace")).toBeTruthy();
  expect(view.queryByTestId("redirect")).toBeNull();
  expect(childMount).not.toHaveBeenCalled();

  presentation(true);
  await view.rerender(route());
  expect(view.getByText("Requested destination")).toBeTruthy();
  expect(childMount).toHaveBeenCalledTimes(1);
  expect(childMount.mock.calls[0]![0]).toBe(retainedParams);
});

it.each([
  { booted: false, session: { status: "authenticated" } },
  { booted: true, session: { status: "booting" } },
  { booted: true, session: { status: "restoring" } }
])("keeps the entry pending after the intro when runtime is not ready: %j", async pending => {
  jest.mocked(useRuntime).mockReturnValue(runtime(pending));
  const route = () => <StartupRouteGate><Destination params={retainedParams} /></StartupRouteGate>;
  const view = await render(route());
  expect(childMount).not.toHaveBeenCalled();
  expect(view.queryByTestId("redirect")).toBeNull();

  jest.mocked(useRuntime).mockReturnValue(runtime());
  await view.rerender(route());
  expect(childMount.mock.calls[0]![0]).toBe(retainedParams);
});

it.each([
  [{ configured: false, message: "Configuration unavailable" }, "/"],
  [{ booted: false, initializationError: "Startup failed" }, "/startup-recovery"],
  [{ booted: false, session: { status: "transient_error" } }, "/startup-recovery"]
])("bypasses the held intro for a runtime error: %j", async (overrides, destination) => {
  presentation(false);
  jest.mocked(useRuntime).mockReturnValue(runtime(overrides as Record<string, unknown>));
  const view = await render(<StartupRouteGate><Destination params={retainedParams} /></StartupRouteGate>);
  expect(view.getByTestId("redirect").props.children).toBe(destination);
  expect(view.queryByText("Preparing your workspace")).toBeNull();
  expect(childMount).not.toHaveBeenCalled();
});
