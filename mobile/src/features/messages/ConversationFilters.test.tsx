import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { colors } from "../../ui/tokens";
import { ConversationFilters } from "./ConversationFilters";

describe("ConversationFilters", () => {
  it("renders All, Unread, Critical, Important as tabs with counts only above zero", async () => {
    const view = await render(
      <ConversationFilters onChange={jest.fn()} totals={{ unread: 0, critical: 150, important: 2 }} value="unread" />
    );
    expect(view.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual([
      "All", "Unread", "Critical, 150", "Important, 2"
    ]);
    expect(view.getByText("99+")).toBeTruthy();
    expect(view.getByRole("tab", { name: "Unread" }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(StyleSheet.flatten(view.getByRole("tab", { name: "Unread" }).props.style).backgroundColor).toBe(colors.primarySoft);
    expect(StyleSheet.flatten(view.getByRole("tab", { name: "All" }).props.style).backgroundColor).toBe(colors.surfaceMuted);
  });

  it("reports a new filter and ignores re-selecting the current one", async () => {
    const onChange = jest.fn();
    const view = await render(<ConversationFilters onChange={onChange} value="all" />);
    await fireEvent.press(view.getByRole("tab", { name: "All" }));
    await fireEvent.press(view.getByRole("tab", { name: "Important" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("important");
  });
});
