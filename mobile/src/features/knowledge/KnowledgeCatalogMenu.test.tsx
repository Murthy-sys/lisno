import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { KnowledgeCatalogMenu } from "./KnowledgeCatalogMenu";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) }));
const onClose = jest.fn();
const onPress = jest.fn();
const actions = [{ id: "edit", label: "Edit main line", icon: "edit" as const, onPress }];
const props = { name: "POP / Gypsum", anchor: { x: 340, y: 80, width: 44, height: 44 }, actions, onClose };
beforeEach(() => { jest.clearAllMocks(); jest.replaceProperty(Platform, "OS", "android"); });
afterEach(() => jest.restoreAllMocks());

it("selects only the requested action and dismisses the contextual menu", async () => {
  await render(<KnowledgeCatalogMenu {...props} />);
  await fireEvent.press(screen.getByRole("menuitem", { name: "Edit main line" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onPress).toHaveBeenCalledTimes(1);
});

it.each(["outside", "native Back"])("dismisses by %s without invoking a command", async method => {
  await render(<KnowledgeCatalogMenu {...props} />);
  if (method === "outside") await fireEvent.press(screen.getByRole("button", { name: "Dismiss actions for POP / Gypsum" }));
  else await act(async () => screen.getByTestId("configuration-context-menu").props.onRequestClose());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onPress).not.toHaveBeenCalled();
});

it("waits for iOS dismissal and cannot dispatch an action twice", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  await render(<KnowledgeCatalogMenu {...props} />);
  const dismissed = screen.getByTestId("configuration-context-menu").props.onDismiss;
  await fireEvent.press(screen.getByRole("menuitem", { name: "Edit main line" }));
  expect(onPress).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => dismissed());
  await act(async () => dismissed());
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("does not run a queued command after its permission was removed", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  const view = await render(<KnowledgeCatalogMenu {...props} />);
  const dismissed = screen.getByTestId("configuration-context-menu").props.onDismiss;
  await fireEvent.press(screen.getByRole("menuitem", { name: "Edit main line" }));
  await view.rerender(<KnowledgeCatalogMenu {...props} actions={[]} />);
  await act(async () => dismissed());
  expect(onPress).not.toHaveBeenCalled();
});

it("cancels queued commands when the owning workspace unmounts", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  const view = await render(<KnowledgeCatalogMenu {...props} />);
  const dismissed = screen.getByTestId("configuration-context-menu").props.onDismiss;
  await fireEvent.press(screen.getByRole("menuitem", { name: "Edit main line" }));
  await view.unmount();
  await act(async () => dismissed());
  expect(onPress).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
