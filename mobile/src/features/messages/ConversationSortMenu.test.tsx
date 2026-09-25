import { fireEvent, render } from "@testing-library/react-native";

import type { PresentedConversation } from "./chatModel";
import { ConversationSortMenu, sortConversations } from "./ConversationSortMenu";

function item(id: string, unread: number): PresentedConversation {
  return {
    project: { id, name: id, status: "active" },
    counts: { openCritical: 0, openImportant: 0, unread, unreadMentions: 0 },
    participantCount: 1,
    cursor: "",
    lastReadSequence: 0,
    latestMessageSequence: 0,
    capabilities: { canSend: true, canManageParticipants: false, canManageIssues: false },
    setupWarnings: [],
    lastMessageAt: null
  };
}

describe("ConversationSortMenu", () => {
  it("keeps server order for recent activity and stably moves unread first", () => {
    const items = [item("a", 0), item("b", 3), item("c", 0), item("d", 1), item("e", 5)];
    expect(sortConversations(items, "recent")).toBe(items);
    expect(sortConversations(items, "unread-first").map((value) => value.project.id)).toEqual(["b", "d", "e", "a", "c"]);
    expect(items.map((value) => value.project.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("offers both options as radios and reports the choice before closing", async () => {
    const onChange = jest.fn();
    const onRequestClose = jest.fn();
    const view = await render(<ConversationSortMenu onChange={onChange} onRequestClose={onRequestClose} value="recent" visible />);
    expect(view.getByRole("radio", { name: "Recent activity" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(view.getByRole("radio", { name: "Unread first" }));
    expect(onChange).toHaveBeenCalledWith("unread-first");
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole("button", { name: "Close sort options", includeHiddenElements: true }));
    expect(onRequestClose).toHaveBeenCalledTimes(2);
  });
});
