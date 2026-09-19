import { fireEvent, render } from "@testing-library/react-native";

import type { PresentedMessage } from "./chatModel";
import { ChatTimeline, nextTimelineScroll, type TimelineScrollState } from "./ChatTimeline";

jest.mock("../onboarding/useReducedMotion", () => ({ useReducedMotion: () => false }));
jest.mock("./MessageBubble", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    MessageBubble: ({
      item,
      onReply,
      reducedMotion
    }: {
      readonly item: { readonly message: PresentedMessage };
      readonly onReply?: (() => void) | undefined;
      readonly reducedMotion?: boolean | undefined;
    }) => React.createElement(
      React.Fragment,
      null,
      React.createElement(Text, null, `${item.message.body}${reducedMotion ? " reduced" : ""}`),
      onReply
        ? React.createElement(
            Pressable,
            {
              accessibilityLabel: `Reply to ${item.message.id}`,
              accessibilityRole: "button",
              onPress: onReply
            },
            React.createElement(Text, null, "Reply")
          )
        : null
    )
  };
});

function message(id: string, sequence: number): PresentedMessage {
  return {
    id,
    projectId: "project-a",
    body: `Message ${sequence}`,
    author: "Aditi",
    authorId: "user-aditi",
    authorRole: "designer",
    authorIdentity: { id: "user-aditi", name: "Aditi", role: "designer" },
    createdAt: `2026-09-18T10:${String(sequence).padStart(2, "0")}:00.000Z`,
    sequence,
    clientMessageId: `client-${id}`,
    priority: "normal",
    version: 1,
    issueStatus: null,
    replyTo: null,
    attachments: [],
    capabilities: { canRaise: true, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false }
  };
}

const callbacks = {
  onLoadOlder: jest.fn(),
  onOpenActions: jest.fn(),
  onNearBottomChange: jest.fn(),
  onClearNewMessages: jest.fn(),
  onVisibleMessagesChange: jest.fn(),
  onDenied: jest.fn()
};

describe("ChatTimeline scrolling and visibility", () => {
  it("consumes initial and explicit bottom-scroll requests exactly once", () => {
    let state: TimelineScrollState = { initialScrollComplete: false, handledRequest: 0 };
    const empty = nextTimelineScroll(state, { event: "content-size", hasContent: false, request: 0 });
    expect(empty.action).toBe("none");

    const initial = nextTimelineScroll(state, { event: "content-size", hasContent: true, request: 0 });
    expect(initial.action).toBe("initial");
    state = initial.state;
    expect(nextTimelineScroll(state, { event: "content-size", hasContent: true, request: 0 }).action).toBe("none");
    expect(nextTimelineScroll(state, { event: "request", hasContent: true, request: 0 }).action).toBe("none");

    const requested = nextTimelineScroll(state, { event: "request", hasContent: true, request: 1 });
    expect(requested.action).toBe("requested");
    state = requested.state;
    expect(nextTimelineScroll(state, { event: "content-size", hasContent: true, request: 1 }).action).toBe("none");
    expect(nextTimelineScroll(state, { event: "request", hasContent: true, request: 1 }).action).toBe("none");
  });

  it("scrolls to the newest message only on the initial content layout", async () => {
    const view = await render(
      <ChatTimeline
        {...callbacks}
        compact
        currentUserId="user-me"
        hasOlderHistory
        lastReadSequence={0}
        loadingOlder={false}
        messages={[message("message-2", 2)]}
        newMessagesAvailable={false}
        olderError={null}
        scrollToEndRequest={0}
      />
    );
    const list = view.getByTestId("chat-message-list");
    expect(list.props.viewabilityConfigCallbackPairs.map((pair: { readonly viewabilityConfig: unknown }) => pair.viewabilityConfig)).toEqual([
      { itemVisiblePercentThreshold: 60, minimumViewTime: 600 },
      { viewAreaCoveragePercentThreshold: 55, minimumViewTime: 600 }
    ]);

    list.props.onContentSizeChange();
    list.props.onContentSizeChange();

    expect(view.getByText("Message 2")).toBeTruthy();
  });

  it("targets the exact timeline message when direct reply is requested", async () => {
    const first = message("message-1", 1);
    const second = message("message-2", 2);
    const onReply = jest.fn();
    const view = await render(
      <ChatTimeline
        {...callbacks}
        compact
        currentUserId="user-me"
        hasOlderHistory={false}
        lastReadSequence={0}
        loadingOlder={false}
        messages={[first, second]}
        newMessagesAvailable={false}
        olderError={null}
        scrollToEndRequest={0}
        onReply={onReply}
      />
    );

    await fireEvent.press(view.getByRole("button", { name: "Reply to message-2" }));

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledWith(second);
    expect(onReply).not.toHaveBeenCalledWith(first);
  });
});
