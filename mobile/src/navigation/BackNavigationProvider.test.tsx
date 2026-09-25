import { act, fireEvent, render, type RenderResult } from "@testing-library/react-native";
import { createContext, useLayoutEffect } from "react";
import { BackHandler, Keyboard, Pressable, Text, type HardwareBackPressEvent } from "react-native";

import { AUTHORIZATION_POLICY_VERSION, PERMISSION_CODES, type PermissionCode, type Role } from "../contracts/authorization";
import type { AuthenticatedSession } from "../contracts/session";
import type { RuntimeContextValue } from "../runtime/RuntimeProvider";
import { BackNavigationProvider } from "./BackNavigationProvider";
import type { NavigationEntry, NavigationTree } from "./backNavigationPolicy";
import { useBackInterceptor, useScreenBack } from "./useScreenBack";

type ReadyRuntime = Extract<RuntimeContextValue, { configured: true }>;
type ScreenBack = ReturnType<typeof useScreenBack>;
type NativeBackHandler = (event: HardwareBackPressEvent) => boolean | null | undefined;
type EventName = "state" | "ready";

const mockRouteContext = createContext({ key: "unmounted", focused: false });
const mockReplace = jest.fn();
const mockDispatch = jest.fn();
const mockListeners = new Map<EventName, Set<() => void>>();
let mockReady = true;
let mockRootState: NavigationTree;
let mockRuntime: ReadyRuntime;
const mockNavigation = {
  isReady: () => mockReady,
  getRootState: () => mockRootState,
  dispatch: mockDispatch,
  addListener: (event: EventName, listener: () => void) => {
    const listeners = mockListeners.get(event) ?? new Set<() => void>();
    mockListeners.set(event, listeners);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }
};

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  return {
    router: { replace: (...args: readonly unknown[]) => mockReplace(...args) },
    useNavigationContainerRef: () => mockNavigation,
    useRoute: () => React.useContext(mockRouteContext),
    useFocusEffect: (effect: () => void | (() => void)) => {
      const { focused } = React.useContext(mockRouteContext);
      React.useEffect(() => focused ? effect() : undefined, [effect, focused]);
    }
  };
});
jest.mock("../runtime/RuntimeProvider", () => ({ useRuntime: () => mockRuntime }));

const capturedScreens = new Map<string, ScreenBack>();
const nativeBackHandlers = new Set<NativeBackHandler>();

interface ScreenProps {
  readonly routeKey: string;
  readonly focused?: boolean;
  readonly blocked?: boolean;
  readonly intercept?: (back: ScreenBack) => boolean;
}

function LocalHandler({ back, intercept }: { readonly back: ScreenBack; readonly intercept: (back: ScreenBack) => boolean }) {
  useBackInterceptor(() => intercept(back));
  return null;
}

function ScreenProbe({ routeKey, blocked, intercept }: ScreenProps) {
  const back = useScreenBack(blocked === undefined ? {} : { blocked });
  useLayoutEffect(() => {
    capturedScreens.set(routeKey, back);
    return () => { capturedScreens.delete(routeKey); };
  }, [back, routeKey]);
  return (
    <>
      {intercept ? <LocalHandler back={back} intercept={intercept} /> : null}
      {back.visible ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Back ${routeKey}`} accessibilityState={{ disabled: back.disabled }} disabled={back.disabled} onPress={back.onBack}>
          <Text>Back</Text>
        </Pressable>
      ) : null}
    </>
  );
}

function TestApp({ screens }: { readonly screens: readonly ScreenProps[] }) {
  return (
    <BackNavigationProvider>
      {screens.map((screen) => (
        <mockRouteContext.Provider key={screen.routeKey} value={{ key: screen.routeKey, focused: screen.focused ?? true }}>
          <ScreenProbe {...screen} />
        </mockRouteContext.Provider>
      ))}
    </BackNavigationProvider>
  );
}

function session(role: Role = "designer", permissions: readonly PermissionCode[] = PERMISSION_CODES): AuthenticatedSession {
  return {
    user: { id: "user-a", name: "Test User", email: "test@example.invalid", role },
    authorization: { role, permissions, policyVersion: AUTHORIZATION_POLICY_VERSION }
  };
}

function runtime(): ReadyRuntime {
  return {
    configured: true,
    booted: true,
    runtime: {} as ReadyRuntime["runtime"],
    environment: {
      environment: { id: "qa-environment-a", profile: "remote", apiBaseUrl: "https://example.invalid/api/v1", origin: "https://example.invalid", host: "example.invalid", isLocal: false },
      generation: 1,
      status: "ready"
    },
    session: { session: session(), status: "authenticated", generation: 1, failure: null },
    initializationError: null,
    retryRestore: jest.fn(async () => undefined)
  };
}

function feature(featureId: string, key = `feature-${featureId}`): NavigationEntry {
  return { key, name: "feature/[featureId]", params: { featureId } };
}

function record(featureId: string, key = `record-${featureId}`): NavigationEntry {
  return { key, name: "record/[featureId]/[recordId]", params: { featureId, recordId: "record-a" } };
}

function rootState(routes: readonly NavigationEntry[], index = routes.length - 1): NavigationTree {
  return {
    key: "expo-root",
    index: 1,
    routes: [
      { key: "inactive-layout", name: "inactive-layout", state: { key: "inactive-stack", routes: [feature("finance")] } },
      { key: "app-wrapper", name: "__root", state: { key: "app-stack", index, routes } }
    ]
  };
}

async function move(view: RenderResult, routes: readonly NavigationEntry[], screens: readonly ScreenProps[] = [{ routeKey: routes.at(-1)!.key! }]) {
  mockRootState = rootState(routes);
  await act(async () => { mockListeners.get("state")?.forEach((listener) => listener()); });
  await view.rerender(<TestApp screens={screens} />);
}

async function pressNativeBack(): Promise<boolean | null | undefined> {
  expect(nativeBackHandlers.size).toBe(1);
  let consumed: boolean | null | undefined;
  await act(async () => { consumed = [...nativeBackHandlers][0]!({ type: "hardwareBackPress", timeStamp: 0 }); });
  return consumed;
}

beforeEach(() => {
  mockRuntime = runtime();
  mockReady = true;
  mockRootState = rootState([feature("projects")]);
  mockListeners.clear();
  capturedScreens.clear();
  nativeBackHandlers.clear();
  mockReplace.mockClear();
  mockDispatch.mockClear();
  jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);
  jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    nativeBackHandlers.add(handler);
    return { remove: () => { nativeBackHandlers.delete(handler); } };
  });
});

afterEach(() => { jest.restoreAllMocks(); });

describe("BackNavigationProvider rendered integration", () => {
  it("uses the app stack rather than the Expo wrapper and gives native and visible Back the same targeted pop", async () => {
    const list = feature("messages");
    const thread = record("messages");
    mockRootState = rootState([list]);
    const view = await render(<TestApp screens={[{ routeKey: list.key! }]} />);
    await move(view, [list, thread]);

    await fireEvent.press(view.getByRole("button", { name: `Back ${thread.key}` }));
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: "POP", payload: { count: 1 }, target: "app-stack", source: thread.key });
    const visibleAction = mockDispatch.mock.calls[0]?.[0];
    mockDispatch.mockClear();

    expect(await pressNativeBack()).toBe(true);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(visibleAction);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("replaces a cold-linked record with its feature, then stops on home without a loop", async () => {
    const detail = record("projects");
    mockRootState = rootState([detail]);
    const view = await render(<TestApp screens={[{ routeKey: detail.key! }]} />);
    await fireEvent.press(view.getByRole("button", { name: `Back ${detail.key}` }));
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
    expect(mockDispatch).not.toHaveBeenCalled();

    await move(view, [feature("projects")]);
    expect(view.queryByRole("button")).toBeNull();
    expect(await pressNativeBack()).toBe(false);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it("does not treat restored native predecessors as observed session history", async () => {
    const current = feature("messages");
    mockRootState = rootState([feature("design-plans"), current]);
    const view = await render(<TestApp screens={[{ routeKey: current.key! }]} />);
    await fireEvent.press(view.getByRole("button", { name: `Back ${current.key}` }));
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("runs a local interceptor before a pending guard and consults their current values", async () => {
    const current = feature("messages");
    mockRootState = rootState([current]);
    const intercept = jest.fn(() => true);
    const view = await render(<TestApp screens={[{ routeKey: current.key!, blocked: true, intercept }]} />);
    expect(view.getByRole("button")).toBeDisabled();
    expect(await pressNativeBack()).toBe(true);
    expect(intercept).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    const nextInterceptor = jest.fn(() => false);
    await view.rerender(<TestApp screens={[{ routeKey: current.key!, blocked: true, intercept: nextInterceptor }]} />);
    expect(await pressNativeBack()).toBe(true);
    expect(nextInterceptor).toHaveBeenCalledTimes(1);
    expect(intercept).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    await view.rerender(<TestApp screens={[{ routeKey: current.key!, blocked: false, intercept: nextInterceptor }]} />);
    await fireEvent.press(view.getByRole("button"));
    expect(nextInterceptor).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
  });

  it("lets a thread return to its explicit authorized parent once without re-entering its interceptor", async () => {
    const list = feature("messages");
    const thread = record("messages");
    mockRootState = rootState([list]);
    const intercept = jest.fn((back: ScreenBack) => back.returnToParent("/feature/messages"));
    const view = await render(<TestApp screens={[{ routeKey: list.key! }]} />);
    await move(view, [list, thread], [{ routeKey: thread.key!, intercept }]);

    await fireEvent.press(view.getByRole("button"));
    expect(intercept).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "POP", payload: { count: 1 }, target: "app-stack", source: thread.key });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("keeps explicit parent returns guarded and rejects unrelated destinations", async () => {
    const thread = record("messages");
    mockRootState = rootState([thread]);
    const view = await render(<TestApp screens={[{ routeKey: thread.key!, blocked: true }]} />);
    await act(async () => { expect(capturedScreens.get(thread.key!)!.returnToParent("/feature/messages")).toBe(true); });
    expect(mockReplace).not.toHaveBeenCalled();
    await view.rerender(<TestApp screens={[{ routeKey: thread.key!, blocked: false }]} />);
    await act(async () => { expect(capturedScreens.get(thread.key!)!.returnToParent("/feature/projects")).toBe(false); });
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => { expect(capturedScreens.get(thread.key!)!.returnToParent("/feature/messages")).toBe(true); });
    expect(mockReplace).toHaveBeenCalledWith("/feature/messages");
  });

  it("removes local interception and guards on blur and removes every root listener on unmount", async () => {
    const current = feature("messages");
    mockRootState = rootState([current]);
    const intercept = jest.fn(() => true);
    const view = await render(<TestApp screens={[{ routeKey: current.key!, blocked: true, intercept }]} />);
    expect(await pressNativeBack()).toBe(true);
    expect(intercept).toHaveBeenCalledTimes(1);
    await view.rerender(<TestApp screens={[{ routeKey: current.key!, focused: false, blocked: true, intercept }]} />);

    expect(await pressNativeBack()).toBe(true);
    expect(intercept).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
    await view.unmount();
    expect(nativeBackHandlers.size).toBe(0);
    expect(mockListeners.get("state")?.size).toBe(0);
    expect(mockListeners.get("ready")?.size).toBe(0);
  });

  it("cleans up a local handler on unmount while its route remains active", async () => {
    const current = feature("messages");
    mockRootState = rootState([current]);
    const intercept = jest.fn(() => true);
    const view = await render(<TestApp screens={[{ routeKey: current.key!, intercept }]} />);
    expect(await pressNativeBack()).toBe(true);
    await view.rerender(<TestApp screens={[{ routeKey: current.key! }]} />);
    expect(await pressNativeBack()).toBe(true);
    expect(intercept).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
  });

  it("ignores retained-screen callbacks and handlers when another route is focused", async () => {
    const list = feature("messages");
    const thread = record("messages");
    mockRootState = rootState([list]);
    const oldInterceptor = jest.fn(() => true);
    const view = await render(<TestApp screens={[{ routeKey: list.key!, intercept: oldInterceptor }]} />);
    const staleBack = capturedScreens.get(list.key!)!.onBack;
    await move(view, [list, thread], [
      { routeKey: list.key!, focused: false, intercept: oldInterceptor },
      { routeKey: thread.key! }
    ]);

    expect(view.getAllByRole("button")).toHaveLength(1);
    await act(async () => { expect(staleBack()).toBe(false); });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(oldInterceptor).not.toHaveBeenCalled();
    expect(await pressNativeBack()).toBe(true);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(oldInterceptor).not.toHaveBeenCalled();
  });

  it("rechecks authorization at dispatch time after an owned predecessor loses permission", async () => {
    const previous = feature("design-plans");
    const current = feature("messages");
    mockRootState = rootState([previous]);
    const view = await render(<TestApp screens={[{ routeKey: previous.key! }]} />);
    await move(view, [previous, current]);
    mockRuntime = { ...mockRuntime, session: { ...mockRuntime.session, session: session("designer", ["projects.list", "chat.read"]) } };
    await view.rerender(<TestApp screens={[{ routeKey: current.key! }]} />);

    await fireEvent.press(view.getByRole("button"));
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
  });

  it("lets a denied phone thread return home when its explicit conversation parent loses permission", async () => {
    const thread = record("messages");
    mockRootState = rootState([thread]);
    const intercept = jest.fn((back: ScreenBack) => {
      back.returnToParent("/feature/messages");
      return true;
    });
    const view = await render(<TestApp screens={[{ routeKey: thread.key!, intercept }]} />);
    mockRuntime = { ...mockRuntime, session: { ...mockRuntime.session, session: session("designer", ["projects.list"]) } };
    await view.rerender(<TestApp screens={[{ routeKey: thread.key!, intercept }]} />);

    await fireEvent.press(view.getByRole("button"));
    expect(intercept).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
  });

  it("consumes native Back at terminal denial without returning to retained history when no home is authorized", async () => {
    const previous = feature("messages");
    const denied = { key: "denied", name: "access-denied" };
    mockRuntime = { ...mockRuntime, session: { ...mockRuntime.session, session: session("designer", ["chat.read"]) } };
    mockRootState = rootState([previous]);
    const view = await render(<TestApp screens={[{ routeKey: previous.key! }]} />);
    await move(view, [previous, denied]);

    expect(view.queryByRole("button")).toBeNull();
    expect(await pressNativeBack()).toBe(true);
    expect(await pressNativeBack()).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each(["user", "role", "environment", "environment generation", "session generation"])("invalidates retained native keys after the %s changes", async (change) => {
    const list = feature("messages");
    const detail = record("projects");
    mockRootState = rootState([list]);
    const view = await render(<TestApp screens={[{ routeKey: list.key! }]} />);
    await move(view, [list, detail]);
    const currentSession = mockRuntime.session.session!;
    switch (change) {
      case "user":
        mockRuntime = { ...mockRuntime, session: { ...mockRuntime.session, session: { ...currentSession, user: { ...currentSession.user, id: "user-b" } } } };
        break;
      case "role":
        mockRuntime = { ...mockRuntime, session: { ...mockRuntime.session, session: session("client") } };
        break;
      case "environment":
        mockRuntime = { ...mockRuntime, environment: { ...mockRuntime.environment, environment: { ...mockRuntime.environment.environment, id: "qa-environment-b" } } };
        break;
      case "environment generation":
        mockRuntime = { ...mockRuntime, environment: { ...mockRuntime.environment, generation: 2 } };
        break;
      case "session generation":
        mockRuntime = { ...mockRuntime, session: { ...mockRuntime.session, generation: 2 } };
        break;
    }
    await view.rerender(<TestApp screens={[{ routeKey: detail.key! }]} />);
    // Revisit the retained predecessor; it must not become owned by the new session.
    await move(view, [list]);
    await move(view, [list, detail]);
    await fireEvent.press(view.getByRole("button"));
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");

    // Fresh entries can establish history without admitting the excluded keys.
    const freshList = feature("messages", "fresh-messages");
    const freshDetail = record("messages", "fresh-thread");
    await move(view, [list, detail, freshList]);
    await move(view, [list, detail, freshList, freshDetail]);
    mockReplace.mockClear();
    await fireEvent.press(view.getByRole("button"));
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: "POP", payload: { count: 1 }, target: "app-stack", source: freshDetail.key });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not navigate authenticated history during sign-out or reuse it after another sign-in", async () => {
    const list = feature("messages");
    const detail = record("projects");
    mockRootState = rootState([list]);
    const view = await render(<TestApp screens={[{ routeKey: list.key! }]} />);
    await move(view, [list, detail]);
    mockRuntime = { ...mockRuntime, session: { session: null, status: "unauthenticated", generation: 2, failure: null } };
    await view.rerender(<TestApp screens={[{ routeKey: detail.key! }]} />);
    expect(view.queryByRole("button")).toBeNull();
    expect(await pressNativeBack()).toBe(false);
    mockRuntime = { ...mockRuntime, session: { session: session(), status: "authenticated", generation: 3, failure: null } };
    await view.rerender(<TestApp screens={[{ routeKey: detail.key! }]} />);
    expect(await pressNativeBack()).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
  });

  it.each(["forgot-password", "reset-password", "accept-invitation"])("resets the app stack to sign-in from %s, removing prior account links", async (name) => {
    const current = { name, key: "account-link" };
    mockRuntime = { ...mockRuntime, session: { session: null, status: "unauthenticated", generation: 1, failure: null } };
    mockRootState = rootState([{ key: "earlier-account-link", name: "reset-password" }, current]);
    const view = await render(<TestApp screens={[{ routeKey: current.key }]} />);
    await fireEvent.press(view.getByRole("button"));
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "RESET", payload: { index: 0, routes: [{ name: "sign-in" }] }, target: "app-stack" });
    expect(mockReplace).not.toHaveBeenCalled();
    await move(view, [{ name: "sign-in", key: "sign-in" }]);
    expect(view.queryByRole("button")).toBeNull();
    expect(await pressNativeBack()).toBe(false);
  });

  it("dismisses the keyboard before local interception or route Back", async () => {
    const current = feature("messages");
    mockRootState = rootState([current]);
    const intercept = jest.fn(() => false);
    await render(<TestApp screens={[{ routeKey: current.key!, intercept }]} />);
    jest.mocked(Keyboard.isVisible).mockReturnValue(true);
    expect(await pressNativeBack()).toBe(true);
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(intercept).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    jest.mocked(Keyboard.isVisible).mockReturnValue(false);
    expect(await pressNativeBack()).toBe(true);
    expect(intercept).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/feature/projects");
  });

  it("waits for the public ready event and keeps home hardware Back with the platform", async () => {
    mockReady = false;
    const current = feature("messages");
    mockRootState = rootState([current]);
    const view = await render(<TestApp screens={[{ routeKey: current.key! }]} />);
    expect(view.queryByRole("button")).toBeNull();
    expect(await pressNativeBack()).toBe(false);
    mockReady = true;
    await act(async () => { mockListeners.get("ready")?.forEach((listener) => listener()); });
    expect(view.getByRole("button")).toBeTruthy();
    await move(view, [feature("projects")]);
    expect(view.queryByRole("button")).toBeNull();
    expect(await pressNativeBack()).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
