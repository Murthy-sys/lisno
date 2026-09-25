import { render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { colors } from "../../ui/tokens";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import type { PresentedConversation, PresentedLastMessage } from "./chatModel";
import {
  ConversationRow,
  conversationAvatarTone,
  formatConversationActivity,
  unreadBadgeText
} from "./ConversationRow";

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: jest.fn()
}));

const download = jest.fn();
const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);

function lastMessage(overrides: Partial<PresentedLastMessage> = {}): PresentedLastMessage {
  return {
    id: "message-last",
    author: { id: "user-ramesh", name: "Ramesh", role: "designer" },
    excerpt: "Hi team, the design for the lobby is ready",
    createdAt: new Date(2026, 8, 18, 10, 24).toISOString(),
    attachments: [],
    attachmentCount: 0,
    ...overrides
  };
}

function conversation(overrides: Partial<PresentedConversation> = {}): PresentedConversation {
  return {
    project: { id: "project-a", name: "Villa North", status: "active" },
    counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 },
    participantCount: 5,
    cursor: "cursor-a",
    lastReadSequence: 3,
    latestMessageSequence: 11,
    capabilities: { canSend: true, canManageParticipants: false, canManageIssues: true },
    setupWarnings: [],
    lastMessageAt: new Date(2026, 8, 18, 10, 24).toISOString(),
    ...overrides
  };
}

const now = new Date(2026, 8, 18, 12, 0);

beforeEach(() => {
  jest.clearAllMocks();
  download.mockImplementation(({ path }: { readonly path: string }) => ({
    result: Promise.resolve({ uri: `file:///cache/${path.split("/").at(-2)}.webp`, release: jest.fn(async () => undefined) }),
    cancel: jest.fn()
  }));
  useConfiguredRuntimeMock.mockReturnValue({
    runtime: { transfers: { download } }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
});

describe("formatConversationActivity", () => {
  it("formats today, yesterday, this year, and older activity", () => {
    expect(formatConversationActivity(new Date(2026, 8, 18, 10, 24).toISOString(), now)).toBe("10:24 AM");
    expect(formatConversationActivity(new Date(2026, 8, 18, 0, 5).toISOString(), now)).toBe("12:05 AM");
    expect(formatConversationActivity(new Date(2026, 8, 18, 15, 7).toISOString(), now)).toBe("3:07 PM");
    expect(formatConversationActivity(new Date(2026, 8, 17, 23, 0).toISOString(), now)).toBe("Yesterday");
    expect(formatConversationActivity(new Date(2026, 8, 16, 9, 0).toISOString(), now)).toBe("Sep 16");
    expect(formatConversationActivity(new Date(2025, 8, 16, 9, 0).toISOString(), now)).toBe("Sep 16, 2025");
    expect(formatConversationActivity(null, now)).toBeNull();
  });

  it("formats yesterday across a month boundary", () => {
    expect(formatConversationActivity(new Date(2026, 8, 30, 20, 0).toISOString(), new Date(2026, 9, 1, 8, 0))).toBe("Yesterday");
  });
});

describe("ConversationRow", () => {
  it("caps the unread badge and shows it only when unread", async () => {
    expect(unreadBadgeText(7)).toBe("7");
    expect(unreadBadgeText(99)).toBe("99");
    expect(unreadBadgeText(100)).toBe("99+");
    const view = await render(
      <ConversationRow
        conversation={conversation({ counts: { openCritical: 0, openImportant: 1, unread: 140, unreadMentions: 0 }, lastMessage: lastMessage() })}
        now={now}
        onPress={jest.fn()}
      />
    );
    const badge = view.getByTestId("conversation-unread-project-a", { includeHiddenElements: true });
    expect(StyleSheet.flatten(badge.props.style).backgroundColor).toBe(colors.danger);
    expect(view.getByText("99+", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId("conversation-priority-important", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByRole("button").props.accessibilityLabel).toBe(
      "Villa North, 140 unread messages, 1 open important issue, last message from Ramesh: Hi team, the design for the lobby is ready, 10:24 AM"
    );

    await view.rerender(<ConversationRow conversation={conversation({ lastMessage: lastMessage() })} now={now} onPress={jest.fn()} />);
    expect(view.queryByTestId("conversation-unread-project-a", { includeHiddenElements: true })).toBeNull();
    expect(view.queryByTestId(/conversation-priority/, { includeHiddenElements: true })).toBeNull();
  });

  it("uses You for the session user's own last message", async () => {
    const view = await render(
      <ConversationRow conversation={conversation({ lastMessage: lastMessage() })} currentUserId="user-ramesh" now={now} onPress={jest.fn()} />
    );
    expect(view.getByText("You: Hi team, the design for the lobby is ready", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByRole("button").props.accessibilityLabel).toContain("last message from You:");
  });

  it("shows No messages yet only for an explicit null preview", async () => {
    const empty = await render(<ConversationRow conversation={conversation({ lastMessage: null, lastMessageAt: null })} onPress={jest.fn()} />);
    expect(empty.getByText("No messages yet", { includeHiddenElements: true })).toBeTruthy();

    const legacy = await render(<ConversationRow conversation={conversation({ lastMessageAt: null })} onPress={jest.fn()} />);
    expect(legacy.queryByText("No messages yet", { includeHiddenElements: true })).toBeNull();
    expect(legacy.getByRole("button").props.accessibilityLabel).toBe("Villa North");
  });

  it("shows a paperclip filename line for non-image attachments", async () => {
    const view = await render(
      <ConversationRow
        conversation={conversation({
          lastMessage: lastMessage({
            attachments: [{ id: "doc-a", kind: "document", filename: "BOQ-revision-3.pdf", hasPreview: false }],
            attachmentCount: 3
          })
        })}
        now={now}
        onPress={jest.fn()}
      />
    );
    expect(view.getByText("BOQ-revision-3.pdf", { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText("+2", { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId("conversation-thumbnails", { includeHiddenElements: true })).toBeNull();
    expect(download).not.toHaveBeenCalled();
    expect(view.getByRole("button").props.accessibilityLabel).toContain("3 attachments");
  });

  it("loads up to two image thumbnails through the authenticated preview operation", async () => {
    const view = await render(
      <ConversationRow
        conversation={conversation({
          project: { id: "project/a", name: "Villa North", status: "active" },
          lastMessage: lastMessage({
            attachments: [
              { id: "img-1", kind: "image", filename: "one.jpg", hasPreview: true },
              { id: "img-2", kind: "image", filename: "two.jpg", hasPreview: true },
              { id: "img-3", kind: "image", filename: "three.jpg", hasPreview: true }
            ],
            attachmentCount: 5
          })
        })}
        now={now}
        onPress={jest.fn()}
      />
    );

    expect(download).toHaveBeenCalledTimes(2);
    expect(download.mock.calls.map(([request]) => request.path)).toEqual([
      "/projects/project%2Fa/chat/attachments/img-1/preview",
      "/projects/project%2Fa/chat/attachments/img-2/preview"
    ]);
    const thumbnails = view.getByTestId("conversation-thumbnails", { includeHiddenElements: true });
    expect(thumbnails.props.accessibilityElementsHidden).toBe(true);
    expect(thumbnails.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(view.getByText("+3", { includeHiddenElements: true })).toBeTruthy();
    await waitFor(() => expect(view.getAllByTestId(/conversation-thumbnail-image-/, { includeHiddenElements: true })
      .map((image) => image.props.source.uri)).toEqual([
      "file:///cache/img-1.webp",
      "file:///cache/img-2.webp"
    ]));
  });

  it("keeps a placeholder when a thumbnail fails to load", async () => {
    download.mockReturnValue({ result: Promise.reject(new Error("offline")), cancel: jest.fn() });
    const view = await render(
      <ConversationRow
        conversation={conversation({
          lastMessage: lastMessage({
            attachments: [{ id: "img-1", kind: "image", filename: "one.jpg", hasPreview: true }],
            attachmentCount: 1
          })
        })}
        now={now}
        onPress={jest.fn()}
      />
    );
    const thumbnail = view.getByTestId("conversation-thumbnail-img-1", { includeHiddenElements: true });
    expect(thumbnail.children).toHaveLength(0);
  });

  it("chooses a stable avatar tone from the project ID and keeps selected/disabled states", async () => {
    expect(conversationAvatarTone("project-a")).toBe(conversationAvatarTone("project-a"));
    const tones = new Set(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((id) => conversationAvatarTone(id).fill));
    expect(tones.size).toBeGreaterThan(1);
    const view = await render(<ConversationRow conversation={conversation()} disabled onPress={jest.fn()} selected />);
    const avatar = view.getByTestId("conversation-avatar-project-a", { includeHiddenElements: true });
    expect(StyleSheet.flatten(avatar.props.style).backgroundColor).toBe(conversationAvatarTone("project-a").fill);
    expect(view.getByRole("button").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true, selected: true }));
    expect(StyleSheet.flatten(view.getByRole("button").props.style).backgroundColor).toBe(colors.primarySoft);
  });
});
