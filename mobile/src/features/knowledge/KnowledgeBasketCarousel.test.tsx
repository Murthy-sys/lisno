import { fireEvent, render } from "@testing-library/react-native";
import type { KnowledgeItemListItem, KnowledgeMaster } from "../../../../shared/knowledge/knowledgeTypes";
import { KnowledgeBasketCarousel } from "./KnowledgeBasketCarousel";

jest.mock("react-native", () => {
  const native = jest.requireActual("react-native");
  const React = jest.requireActual("react");
  const Pressable = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(120, 260, 44, 44), focus: jest.fn() }));
    return React.createElement(native.Pressable, props);
  });
  return new Proxy(native, { get: (target, key) => key === "Pressable" ? Pressable : Reflect.get(target, key) });
});

const actor = { id: "record-a", version: 1, createdById: "actor", updatedById: "actor", createdAt: "2026-09-25T10:00:00Z", updatedAt: "2026-09-25T10:00:00Z" };
const item: KnowledgeItemListItem = {
  ...actor, mainLineId: "line-a", mainLineName: "Plain False Ceiling", basketId: "basket-a", basketName: "POP / Gypsum", subBasketId: "sub-a", subBasketName: "sub1", itemType: "main_line", description: null, completionRequired: false, status: "draft", activeRevisionId: null, draftRevisionId: "revision-a", revisionNumber: 1, uomId: null, priorityId: "priority-a", modeIds: [], surfaceIds: [], vendorIds: [], allowedActions: [],
  completeness: { percentage: 33, sections: ["overview", "pricing", "quantity-margin", "scope", "recommendations", "quality"].map((sectionKey, index) => ({ sectionKey, state: index < 2 ? "complete" : "not_configured", findings: [] })) as KnowledgeItemListItem["completeness"]["sections"], blockers: [], warnings: [] }
};
const priority: KnowledgeMaster = { ...actor, id: "priority-a", masterType: "priorities", code: "HIGH", name: "High priority", description: null, displayOrder: 0, status: "active", semanticTier: "high" };
const props = { basketId: "basket-a", name: "POP / Gypsum", items: [item], expanded: true, onToggle: jest.fn(), onOpenItem: jest.fn(), onItemMenu: jest.fn(), onBasketMenu: jest.fn(), uoms: [], priorities: [priority], catalogState: "ready" as const };
beforeEach(() => jest.clearAllMocks());

it("uses a controlled accordion and keeps item identity distinct from its display name", async () => {
  const view = await render(<KnowledgeBasketCarousel {...props} expanded={false} />);
  expect(view.queryByRole("button", { name: "Open Plain False Ceiling" })).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Expand POP / Gypsum" }));
  expect(props.onToggle).toHaveBeenCalledTimes(1);
  await view.rerender(<KnowledgeBasketCarousel {...props} />);
  await fireEvent.press(view.getByRole("button", { name: "Open Plain False Ceiling" }));
  expect(props.onOpenItem).toHaveBeenCalledWith("line-a");
  expect(view.getByRole("button", { name: "Collapse POP / Gypsum" }).props.accessibilityState.expanded).toBe(true);
  expect(view.getByText("1 item")).toBeTruthy();
});

it("shows server completeness, applicable section counts and catalog values without inventing metadata", async () => {
  const view = await render(<KnowledgeBasketCarousel {...props} />);
  expect(view.getByText("33%")).toBeTruthy();
  expect(view.getByText("2/6 · No unit")).toBeTruthy();
  expect(view.getByText("draft · sub1")).toBeTruthy();
  expect(view.getByRole("button", { name: "Open Plain False Ceiling" }).props.accessibilityHint).toContain("High priority");
  expect(view.getByRole("button", { name: "Collapse POP / Gypsum" }).props.accessibilityHint).toBe("1 item on this page");
});

it("opens measured item and basket menus independently from opening or collapsing the item", async () => {
  const view = await render(<KnowledgeBasketCarousel {...props} />);
  await fireEvent.press(view.getByRole("button", { name: "Actions for Plain False Ceiling" }));
  expect(props.onItemMenu).toHaveBeenCalledWith(item, expect.objectContaining({ x: 120, y: 260, width: 44, height: 44, trigger: expect.anything() }));
  await fireEvent.press(view.getByRole("button", { name: "Actions for POP / Gypsum" }));
  expect(props.onBasketMenu).toHaveBeenCalledWith(expect.objectContaining({ x: 120, y: 260, width: 44, height: 44 }));
  expect(props.onOpenItem).not.toHaveBeenCalled();
  expect(props.onToggle).not.toHaveBeenCalled();
});

it("represents temporary items and unavailable catalogs truthfully", async () => {
  const view = await render(<KnowledgeBasketCarousel {...props} catalogState="error" priorities={[]} items={[{ ...item, itemType: "temporary", completionRequired: true, uomId: "missing-uom" }]} />);
  expect(view.getByText("Temporary")).toBeTruthy();
  expect(view.getByText("2/6 · Unit unavailable")).toBeTruthy();
  const hint = view.getByRole("button", { name: "Open Plain False Ceiling" }).props.accessibilityHint;
  expect(hint).toContain("Temporary item, must be completed");
  expect(hint).toContain("Priority unavailable");
});

it("tracks real scroll positions, navigation edges and resizing instead of hardcoded pages", async () => {
  const items = [0, 1, 2, 3].map(index => ({ ...item, mainLineId: `line-${index}`, mainLineName: `Item ${index}` }));
  const view = await render(<KnowledgeBasketCarousel {...props} items={items} />);
  const track = view.getByTestId("basket-carousel-basket-a");
  await fireEvent(track, "layout", { nativeEvent: { layout: { width: 200, height: 138, x: 0, y: 0 } } });
  expect(view.getByLabelText("POP / Gypsum, carousel position 1 of 4")).toBeTruthy();
  expect(view.getByRole("button", { name: "Previous items in POP / Gypsum" })).toBeDisabled();
  for (let index = 0; index < 3; index++) await fireEvent.press(view.getByRole("button", { name: "Next items in POP / Gypsum" }));
  expect(view.getByLabelText("POP / Gypsum, carousel position 4 of 4")).toBeTruthy();
  expect(view.getByRole("button", { name: "Next items in POP / Gypsum" })).toBeDisabled();
  await fireEvent.scroll(track, { nativeEvent: { contentOffset: { x: 106, y: 0 }, contentSize: { width: 458, height: 138 }, layoutMeasurement: { width: 200, height: 138 } } });
  expect(view.getByLabelText("POP / Gypsum, carousel position 2 of 4")).toBeTruthy();
  await fireEvent(track, "layout", { nativeEvent: { layout: { width: 600, height: 138, x: 0, y: 0 } } });
  expect(view.getByLabelText("POP / Gypsum, carousel position 1 of 1")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Next items in POP / Gypsum" })).toBeNull();
});

it("clamps the carousel when a filter reduces the item list", async () => {
  const items = [0, 1, 2, 3].map(index => ({ ...item, mainLineId: `line-${index}`, mainLineName: `Item ${index}` }));
  const view = await render(<KnowledgeBasketCarousel {...props} items={items} />);
  await fireEvent(view.getByTestId("basket-carousel-basket-a"), "layout", { nativeEvent: { layout: { width: 200, height: 138, x: 0, y: 0 } } });
  await fireEvent.press(view.getByRole("button", { name: "Next items in POP / Gypsum" }));
  await view.rerender(<KnowledgeBasketCarousel {...props} />);
  expect(view.getByLabelText("POP / Gypsum, carousel position 1 of 1")).toBeTruthy();
});

it("keeps loading and empty baskets compact and can omit unavailable basket actions", async () => {
  const { onBasketMenu: _onBasketMenu, ...readOnlyProps } = props;
  const view = await render(<KnowledgeBasketCarousel {...readOnlyProps} items={[]} isLoading />);
  expect(view.getByText("Loading items…")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Actions for POP / Gypsum" })).toBeNull();
  await view.rerender(<KnowledgeBasketCarousel {...props} items={[]} />);
  expect(view.getByText("No items on this page.")).toBeTruthy();
  expect(view.queryByTestId("basket-carousel-basket-a")).toBeNull();
});
