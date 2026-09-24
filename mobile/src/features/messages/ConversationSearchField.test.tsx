import { act, fireEvent, render, renderHook } from "@testing-library/react-native";

import { CONVERSATION_SEARCH_DEBOUNCE_MS, ConversationSearchField, useDebouncedSearch } from "./ConversationSearchField";

describe("ConversationSearchField", () => {
  afterEach(() => jest.useRealTimers());

  it("debounces typed values by 300 ms and applies clearing immediately", async () => {
    jest.useFakeTimers();
    expect(CONVERSATION_SEARCH_DEBOUNCE_MS).toBe(300);
    const hook = await renderHook(({ value }: { readonly value: string }) => useDebouncedSearch(value), { initialProps: { value: "" } });
    await hook.rerender({ value: "Vil" });
    await hook.rerender({ value: "Villa" });
    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(hook.result.current).toBe("");
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(hook.result.current).toBe("Villa");
    await hook.rerender({ value: "" });
    expect(hook.result.current).toBe("");
  });

  it("exposes accessible labels, a 100-character limit, and a clear action only with text", async () => {
    const onClear = jest.fn();
    const onChangeText = jest.fn();
    const view = await render(<ConversationSearchField onChangeText={onChangeText} onClear={onClear} value="" />);
    const input = view.getByPlaceholderText("Search messages");
    expect(input.props.accessibilityLabel).toBe("Search messages");
    expect(input.props.maxLength).toBe(100);
    expect(view.queryByRole("button", { name: "Clear search" })).toBeNull();
    await fireEvent.changeText(input, "Villa");
    expect(onChangeText).toHaveBeenCalledWith("Villa");

    await view.rerender(<ConversationSearchField onChangeText={onChangeText} onClear={onClear} value="Villa" />);
    await fireEvent.press(view.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
