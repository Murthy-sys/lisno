import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { KnowledgeCatalogHeader } from "./KnowledgeCatalogHeader";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
const props = { search: "", onSearchChange: jest.fn(), onSearch: jest.fn(), onFilters: jest.fn(), filterCount: 0, canCreate: true, onAction: jest.fn(), onBack: jest.fn(), backVisible: true };
beforeEach(() => { jest.clearAllMocks(); jest.replaceProperty(Platform, "OS", "android"); });
afterEach(() => jest.restoreAllMocks());

it.each([
  ["Manage reusable values", "values"], ["Manage baskets", "baskets"], ["Add main basket", "basket"], ["Add estimation item", "item"], ["Add temporary item", "temporary"]
])("reveals %s only through Actions and closes the sheet before selecting it", async (label, action) => {
  await render(<KnowledgeCatalogHeader {...props} />);
  expect(screen.queryByRole("button", { name: label })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  expect(screen.getByRole("button", { name: "Actions" }).props.accessibilityState.expanded).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: label }));
  expect(props.onAction).toHaveBeenCalledWith(action);
  expect(screen.queryByRole("button", { name: "Close Actions" })).toBeNull();
});

it("dismisses Actions through close, backdrop and native Back without selecting an action", async () => {
  await render(<KnowledgeCatalogHeader {...props} />);
  for (const label of ["Close Actions", "Dismiss Actions"]) {
    await fireEvent.press(screen.getByRole("button", { name: "Actions" }));
    await fireEvent.press(screen.getByRole("button", { name: label, includeHiddenElements: true }));
    expect(screen.queryByRole("button", { name: "Manage baskets" })).toBeNull();
  }
  await fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  await act(async () => screen.getByTestId("configuration-actions-modal").props.onRequestClose());
  expect(props.onAction).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Actions" }).props.accessibilityState.expanded).toBe(false);
});

it("waits for the iOS sheet to dismiss before opening the destination modal", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  await render(<KnowledgeCatalogHeader {...props} />);
  await fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  const dismissed = screen.getByTestId("configuration-actions-modal").props.onDismiss;
  await fireEvent.press(screen.getByRole("button", { name: "Add main basket" }));
  expect(props.onAction).not.toHaveBeenCalled();
  await act(async () => dismissed());
  expect(props.onAction).toHaveBeenCalledWith("basket");
  await act(async () => dismissed());
  expect(props.onAction).toHaveBeenCalledTimes(1);
});

it("keeps search icons, keyboard submit, active filters and Back wired to existing actions", async () => {
  await render(<KnowledgeCatalogHeader {...props} filterCount={2} />);
  const search = screen.getByLabelText("Search by basket or main line name");
  await fireEvent.changeText(search, "Ceiling");
  expect(props.onSearchChange).toHaveBeenCalledWith("Ceiling");
  await fireEvent(search, "submitEditing");
  await fireEvent.press(screen.getByRole("button", { name: "Search" }));
  expect(props.onSearch).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByRole("button", { name: "Filters (2)" }));
  expect(props.onFilters).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(props.onBack).toHaveBeenCalledTimes(1);
});

it("preserves read-only permissions and hides Back when unavailable", async () => {
  await render(<KnowledgeCatalogHeader {...props} canCreate={false} backVisible={false} />);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Actions" }));
  expect(screen.getByRole("button", { name: "Manage baskets" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add estimation item" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add main basket" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add temporary item" })).toBeNull();
});
