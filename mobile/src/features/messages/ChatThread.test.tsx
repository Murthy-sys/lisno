import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, AppState, BackHandler } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ChatThread } from "./ChatThread";
import type { PresentedMessage } from "./chatModel";
import { useChatThread, type ChatThreadState } from "./useChatThread";

const mockDismissTransientState = jest.fn(() => false);
const mockGroupDismissTransientState = jest.fn(() => false);
const mockGroupInfoProps = jest.fn();
const mockComposerReply = jest.fn();
const mockSetNavigationBlocked = jest.fn();
const mockNavigationGuard = { setBlocked: mockSetNavigationBlocked };
let mockBackInterceptor: (() => boolean) | undefined;
const mockSharedBack = jest.fn(() => mockBackInterceptor?.() ?? false);

jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  return { SafeAreaView: ({ children }: { readonly children: import("react").ReactNode }) => React.createElement(View, null, children) };
});
jest.mock("./useChatThread", () => ({ useChatThread: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => mockNavigationGuard }));
jest.mock("../../navigation/useScreenBack", () => {
  const React = jest.requireActual("react") as typeof import("react");
  return {
    useScreenBack: () => ({ onBack: mockSharedBack }),
    useBackInterceptor: (handler: () => boolean) => {
      React.useEffect(() => {
        mockBackInterceptor = handler;
        return () => { if (mockBackInterceptor === handler) mockBackInterceptor = undefined; };
      }, [handler]);
    }
  };
});
jest.mock("./ChatTimeline", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    ChatTimeline: ({
      messages,
      onOpenActions,
      onReply
    }: {
      readonly messages: readonly PresentedMessage[];
      readonly onOpenActions: (message: PresentedMessage, originHandle: number | null) => void;
      readonly onReply?: ((message: PresentedMessage) => void) | undefined;
    }) => React.createElement(
      React.Fragment,
      null,
      React.createElement(
        Pressable,
        { accessibilityRole: "button", onPress: () => onOpenActions(messages[0]!, 73) },
        React.createElement(Text, null, "Open first message")
      ),
      onReply
        ? React.createElement(
            Pressable,
            {
              accessibilityLabel: "Reply directly to first message",
              accessibilityRole: "button",
              onPress: () => onReply(messages[0]!)
            },
            React.createElement(Text, null, "Direct reply")
          )
        : null
    )
  };
});
jest.mock("./MessageActionSheet", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
  return { MessageActionSheet: ({ message, visible, canReply, onReply, onClose }: { readonly message: PresentedMessage | null; readonly visible: boolean; readonly canReply: boolean; readonly onReply: (message: PresentedMessage) => void; readonly onClose: () => void }) => visible && message && canReply ? React.createElement(Pressable, { accessibilityRole: "button", onPress: () => { onReply(message); onClose(); } }, React.createElement(Text, null, "Reply from sheet")) : null };
});
jest.mock("./ChatComposer", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    ChatComposer: React.forwardRef(function MockChatComposer(
      {
        compact,
        reply,
        onOverlayChange,
        onSendingChange
      }: {
        readonly compact?: boolean;
        readonly reply: PresentedMessage | null;
        readonly onOverlayChange?: (open: boolean) => void;
        readonly onSendingChange?: (sending: boolean) => void;
      },
      ref: import("react").ForwardedRef<{ hasTransientState(): boolean; dismissTransientState(): boolean }>
    ) {
      mockComposerReply(reply);
      React.useImperativeHandle(ref, () => ({
        hasTransientState: () => mockDismissTransientState(),
        dismissTransientState: () => mockDismissTransientState()
      }));
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(Text, null, reply ? `Composer replying to ${reply.author}` : "Composer ready"),
        React.createElement(Text, null, compact ? "Composer compact" : "Composer expanded"),
        React.createElement(Pressable, { accessibilityRole: "button", onPress: () => onSendingChange?.(true) }, React.createElement(Text, null, "Start pending send")),
        React.createElement(Pressable, { accessibilityRole: "button", onPress: () => onSendingChange?.(false) }, React.createElement(Text, null, "Finish pending send")),
        React.createElement(
          Pressable,
          {
            accessibilityLabel: "Open composer overlay",
            accessibilityRole: "button",
            onPress: () => onOverlayChange?.(true)
          },
          React.createElement(Text, null, "Open composer overlay")
        ),
        React.createElement(
          Pressable,
          {
            accessibilityLabel: "Close composer overlay",
            accessibilityRole: "button",
            onPress: () => onOverlayChange?.(false)
          },
          React.createElement(Text, null, "Close composer overlay")
        )
      );
    })
  };
});
jest.mock("./ChatGroupInfo", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Pressable, Text, View } = jest.requireActual("react-native") as typeof import("react-native");
  type MockProps = {
    readonly visible: boolean;
    readonly projectName: string;
    readonly participantCount: number;
    readonly canManage: boolean;
    readonly onRequestClose: () => void;
    readonly onDenied: () => void;
    readonly onParticipantsChanged: (page: { readonly items: readonly []; readonly setupWarnings: readonly [] }) => void;
    readonly onParticipantAdded: (name: string) => void;
    readonly onRestoreFocus?: (() => void) | undefined;
  };
  return {
    ChatGroupInfo: React.forwardRef(function MockChatGroupInfo(
      props: MockProps,
      ref: import("react").ForwardedRef<{ hasTransientState(): boolean; dismissTransientState(): boolean }>
    ) {
      const wasVisible = React.useRef(props.visible);
      React.useEffect(() => {
        if (wasVisible.current && !props.visible) props.onRestoreFocus?.();
        wasVisible.current = props.visible;
      }, [props.onRestoreFocus, props.visible]);
      React.useImperativeHandle(ref, () => ({
        hasTransientState: () => props.visible,
        dismissTransientState: () => {
          if (mockGroupDismissTransientState()) return true;
          if (!props.visible) return false;
          props.onRequestClose();
          return true;
        }
      }), [props]);
      mockGroupInfoProps(props);
      if (!props.visible) return null;
      return React.createElement(
        View,
        { accessibilityLabel: "Mock group info" },
        React.createElement(Text, null, `${props.projectName} group with ${props.participantCount} participants`),
        React.createElement(Text, null, props.canManage ? "Participant management enabled" : "Participant management unavailable"),
        React.createElement(Pressable, { accessibilityLabel: "Close mock group info", accessibilityRole: "button", onPress: props.onRequestClose }, React.createElement(Text, null, "Close group")),
        React.createElement(Pressable, { accessibilityLabel: "Mock participant refresh", accessibilityRole: "button", onPress: () => props.onParticipantsChanged({ items: [], setupWarnings: [] }) }, React.createElement(Text, null, "Refresh participants")),
        React.createElement(Pressable, { accessibilityLabel: "Mock participant added", accessibilityRole: "button", onPress: () => props.onParticipantAdded("Aditi Rao") }, React.createElement(Text, null, "Announce participant")),
        React.createElement(Pressable, { accessibilityLabel: "Mock participant denied", accessibilityRole: "button", onPress: props.onDenied }, React.createElement(Text, null, "Deny participants"))
      );
    })
  };
});

const useChatThreadMock = jest.mocked(useChatThread);
const session = {
  user: { id: "user-me", name: "Me", email: "me@example.test", role: "admin" },
  authorization: { role: "admin", policyVersion: "test", permissions: ["chat.send", "chat.issue"] }
} as AuthenticatedSession;
const message: PresentedMessage = {
  id: "message-a",
  projectId: "project-a",
  body: "Please review",
  author: "Aditi",
  authorId: "user-aditi",
  authorRole: "designer",
  authorIdentity: { id: "user-aditi", name: "Aditi", role: "designer" },
  createdAt: "2026-09-18T10:00:00.000Z",
  sequence: 1,
  clientMessageId: "client-a",
  priority: "normal",
  version: 1,
  issueStatus: null,
  replyTo: null,
  attachments: [],
  capabilities: { canRaise: true, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false }
};

function threadState(canManageParticipants: boolean, overrides: Partial<ChatThreadState> = {}): ChatThreadState {
  return {
    ownerKey: "remote\u00000\u0000user-me\u0000project-a",
    summary: {
      project: { id: "project-a", name: "Villa", status: "active" },
      counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 },
      participantCount: 3,
      cursor: "cursor",
      lastReadSequence: 1,
      latestMessageSequence: 1,
      capabilities: { canSend: true, canManageParticipants, canManageIssues: true },
      setupWarnings: []
    },
    messages: [message],
    loading: false,
    denied: false,
    error: null,
    refreshing: false,
    hasOlderHistory: false,
    loadingOlder: false,
    olderError: null,
    newMessagesAvailable: false,
    scrollToEndRequest: 0,
    readError: null,
    acknowledgingRead: false,
    refresh: jest.fn(async () => undefined),
    refreshParticipantContext: jest.fn(async () => undefined),
    loadOlder: jest.fn(async () => undefined),
    setNearBottom: jest.fn(),
    clearNewMessages: jest.fn(),
    acknowledgeVisible: jest.fn(),
    retryRead: jest.fn(),
    revokeAccess: jest.fn(async () => undefined),
    setReadActive: jest.fn(),
    ...overrides
  };
}

describe("ChatThread", () => {
  beforeEach(() => {
    mockDismissTransientState.mockReset();
    mockDismissTransientState.mockReturnValue(false);
    mockGroupDismissTransientState.mockReset();
    mockGroupDismissTransientState.mockReturnValue(false);
    mockGroupInfoProps.mockClear();
    mockComposerReply.mockClear();
    mockSetNavigationBlocked.mockClear();
    mockSharedBack.mockClear();
    mockBackInterceptor = undefined;
  });

  it.each([
    ["loading", { loading: true, summary: null }],
    ["denied", { denied: true, summary: null }],
    ["error", { error: "Offline", summary: null }]
  ] as const)("keeps one shared-dispatch phone Back control in the %s state", async (_state, overrides) => {
    useChatThreadMock.mockReturnValue(threadState(false, overrides));
    const onBack = jest.fn();
    const nativeListener = jest.spyOn(BackHandler, "addEventListener");
    const view = await render(<ChatThread projectId="project-a" session={session} compact onBack={onBack} />);

    const buttons = view.getAllByRole("button", { name: "Back to conversations" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(buttons[0]!);
    expect(mockSharedBack).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(nativeListener).not.toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));
    nativeListener.mockRestore();
    await view.unmount();
    expect(mockBackInterceptor).toBeUndefined();
  });

  it("keeps both shared Back paths locked during a send and releases them when sending completes", async () => {
    useChatThreadMock.mockReturnValue(threadState(false));
    const onBack = jest.fn();
    const onSendingChange = jest.fn();
    const view = await render(<ChatThread projectId="project-a" session={session} compact onBack={onBack} onSendingChange={onSendingChange} />);

    await fireEvent.press(view.getByRole("button", { name: "Start pending send" }));
    expect(view.getByRole("button", { name: "Back to conversations" })).toBeDisabled();
    expect(mockSetNavigationBlocked).toHaveBeenLastCalledWith(true);
    expect(onSendingChange).toHaveBeenLastCalledWith(true);
    await fireEvent.press(view.getByRole("button", { name: "Back to conversations" }));
    await act(async () => { expect(mockSharedBack()).toBe(true); });
    expect(onBack).not.toHaveBeenCalled();
    expect(mockDismissTransientState).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole("button", { name: "Finish pending send" }));
    expect(mockSetNavigationBlocked).toHaveBeenLastCalledWith(false);
    expect(view.getByRole("button", { name: "Back to conversations" })).toBeEnabled();
    await fireEvent.press(view.getByRole("button", { name: "Back to conversations" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("leaves message action dismissal to its guarded modal before handling reply or route Back", async () => {
    useChatThreadMock.mockReturnValue(threadState(false));
    const onBack = jest.fn();
    const view = await render(<ChatThread projectId="project-a" session={session} compact onBack={onBack} />);

    await fireEvent.press(view.getByRole("button", { name: "Open first message" }));
    await act(async () => { expect(mockSharedBack()).toBe(true); });
    expect(view.getByRole("button", { name: "Reply from sheet" })).toBeTruthy();
    expect(mockDismissTransientState).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole("button", { name: "Reply from sheet" }));
    await fireEvent.press(view.getByRole("button", { name: "Back to conversations" }));
    expect(view.getByText("Composer ready")).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("lets split-view shared route Back proceed only after local options and reply are dismissed", async () => {
    useChatThreadMock.mockReturnValue(threadState(false));
    const view = await render(<ChatThread projectId="project-a" session={session} compact={false} />);

    expect(view.queryByRole("button", { name: "Back to conversations" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Reply directly to first message" }));
    await fireEvent.press(view.getByRole("button", { name: "Open conversation options" }));
    await act(async () => { expect(mockSharedBack()).toBe(true); });
    expect(view.queryByText("Conversation options")).toBeNull();
    expect(view.getByText("Composer replying to Aditi")).toBeTruthy();
    await act(async () => { expect(mockSharedBack()).toBe(true); });
    expect(view.getByText("Composer ready")).toBeTruthy();
    await act(async () => { expect(mockSharedBack()).toBe(false); });
  });

  it("starts an exact direct reply without opening the message action sheet", async () => {
    useChatThreadMock.mockReturnValue(threadState(false));
    const view = await render(<ChatThread projectId="project-a" session={session} compact />);

    expect(view.queryByText("Reply from sheet")).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Reply directly to first message" }));

    expect(view.getByText("Composer replying to Aditi")).toBeTruthy();
    expect(view.queryByText("Reply from sheet")).toBeNull();
  });

  it("does not expose direct reply without both backend capability and chat.send permission", async () => {
    const capable = threadState(false);
    useChatThreadMock.mockReturnValue({
      ...capable,
      summary: capable.summary
        ? {
            ...capable.summary,
            capabilities: { ...capable.summary.capabilities, canSend: false }
          }
        : null
    });
    const capabilityView = await render(<ChatThread projectId="project-a" session={session} compact />);

    expect(capabilityView.queryByRole("button", { name: "Reply directly to first message" })).toBeNull();
    expect(capabilityView.getByText(/sending is unavailable/u)).toBeTruthy();
    await fireEvent.press(capabilityView.getByRole("button", { name: "Open first message" }));
    expect(capabilityView.queryByText("Reply from sheet")).toBeNull();
    await capabilityView.unmount();

    useChatThreadMock.mockReturnValue(threadState(false));
    const readOnlySession = {
      ...session,
      authorization: {
        ...session.authorization,
        permissions: session.authorization.permissions.filter((permission) => permission !== "chat.send")
      }
    } as AuthenticatedSession;
    const permissionView = await render(<ChatThread projectId="project-a" session={readOnlySession} compact />);

    expect(permissionView.queryByRole("button", { name: "Reply directly to first message" })).toBeNull();
    expect(permissionView.getByText(/sending is unavailable/u)).toBeTruthy();
  });

  it("clears a selected reply when effective send capability is withdrawn", async () => {
    let current = threadState(false);
    useChatThreadMock.mockImplementation(() => current);
    const element = () => <ChatThread projectId="project-a" session={session} compact />;
    const view = await render(element());

    await fireEvent.press(view.getByRole("button", { name: "Reply directly to first message" }));
    expect(view.getByText("Composer replying to Aditi")).toBeTruthy();

    current = {
      ...current,
      summary: current.summary
        ? {
            ...current.summary,
            capabilities: { ...current.summary.capabilities, canSend: false }
          }
        : null
    };
    await view.rerender(element());
    expect(view.getByText(/sending is unavailable/u)).toBeTruthy();

    current = {
      ...current,
      summary: current.summary
        ? {
            ...current.summary,
            capabilities: { ...current.summary.capabilities, canSend: true }
          }
        : null
    };
    await view.rerender(element());

    await waitFor(() => expect(view.getByText("Composer ready")).toBeTruthy());
  });

  it("closes reply state before using hardware Back to leave the thread", async () => {
    const originalAppState = AppState.currentState;
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    const setReadActive = jest.fn();
    const refresh = jest.fn(async () => undefined);
    const refreshParticipantContext = jest.fn(async () => undefined);
    useChatThreadMock.mockReturnValue({
      ownerKey: "remote\u00000\u0000user-me\u0000project-a",
      summary: {
        project: { id: "project-a", name: "Villa", status: "active" },
        counts: { openCritical: 1, openImportant: 0, unread: 0, unreadMentions: 0 },
        participantCount: 3,
        cursor: "cursor",
        lastReadSequence: 1,
        latestMessageSequence: 1,
        capabilities: { canSend: true, canManageParticipants: false, canManageIssues: true },
        setupWarnings: []
      },
      messages: [message],
      loading: false,
      denied: false,
      error: null,
      refreshing: false,
      hasOlderHistory: false,
      loadingOlder: false,
      olderError: null,
      newMessagesAvailable: false,
      scrollToEndRequest: 0,
      readError: null,
      acknowledgingRead: false,
      refresh,
      refreshParticipantContext,
      loadOlder: jest.fn(async () => undefined),
      setNearBottom: jest.fn(),
      clearNewMessages: jest.fn(),
      acknowledgeVisible: jest.fn(),
      retryRead: jest.fn(),
      revokeAccess: jest.fn(async () => undefined),
      setReadActive
    });
    const onBack = jest.fn();
    const restoreFocus = jest.spyOn(AccessibilityInfo, "setAccessibilityFocus").mockImplementation(() => undefined);
    const view = await render(<ChatThread projectId="project-a" session={session} compact onBack={onBack} />);

    const groupIdentity = view.getByRole("button", { name: "Open group info, Villa, 3 participants" });
    expect(groupIdentity).toHaveStyle({ minHeight: 48 });
    expect(view.getByText("Composer compact")).toBeTruthy();
    await waitFor(() => expect(setReadActive).toHaveBeenCalledWith(true));

    await fireEvent.press(groupIdentity);
    expect(view.getByText("Villa group with 3 participants")).toBeTruthy();
    expect(view.getByText("Participant management unavailable")).toBeTruthy();
    await waitFor(() => expect(setReadActive).toHaveBeenLastCalledWith(false));
    await fireEvent.press(view.getByRole("button", { name: "Mock participant refresh" }));
    expect(refreshParticipantContext).toHaveBeenCalledWith(0);
    await act(async () => {
      expect(mockSharedBack()).toBe(true);
    });
    await waitFor(() => expect(view.queryByLabelText("Mock group info")).toBeNull());
    await waitFor(() => expect(setReadActive).toHaveBeenLastCalledWith(true));

    await fireEvent.press(view.getByRole("button", { name: "Open composer overlay" }));
    await waitFor(() => expect(setReadActive).toHaveBeenLastCalledWith(false));
    await fireEvent.press(view.getByRole("button", { name: "Close composer overlay" }));
    await waitFor(() => expect(setReadActive).toHaveBeenLastCalledWith(true));
    await fireEvent.press(view.getByRole("button", { name: "Open first message" }));
    await waitFor(() => expect(setReadActive).toHaveBeenCalledWith(false));
    await fireEvent.press(view.getByRole("button", { name: "Reply from sheet" }));
    expect(view.getByText("Composer replying to Aditi")).toBeTruthy();
    await waitFor(() => expect(setReadActive).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(restoreFocus).toHaveBeenCalledWith(73));

    await act(async () => {
      expect(mockSharedBack()).toBe(true);
    });
    await waitFor(() => expect(view.getByText("Composer ready")).toBeTruthy());
    expect(onBack).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole("button", { name: "Open conversation options" }));
    await waitFor(() => expect(setReadActive).toHaveBeenLastCalledWith(false));
    await fireEvent.press(view.getByRole("button", { name: "Group info" }));
    expect(view.getByLabelText("Mock group info")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Close mock group info" }));
    await waitFor(() => expect(setReadActive).toHaveBeenLastCalledWith(true));

    await fireEvent.press(view.getByRole("button", { name: "Open conversation options" }));
    await fireEvent.press(view.getByRole("button", { name: "Refresh conversation" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(setReadActive).toHaveBeenLastCalledWith(true));

    await act(async () => {
      expect(mockSharedBack()).toBe(true);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    await view.unmount();
    Object.defineProperty(AppState, "currentState", { configurable: true, value: originalAppState });
  });

  it("dismisses composer state before leaving through Android hardware Back", async () => {
    useChatThreadMock.mockReturnValue({
      ownerKey: "remote\u00000\u0000user-me\u0000project-a",
      summary: {
        project: { id: "project-a", name: "Villa", status: "active" },
        counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 },
        participantCount: 2,
        cursor: "cursor",
        lastReadSequence: 1,
        latestMessageSequence: 1,
        capabilities: { canSend: true, canManageParticipants: false, canManageIssues: true },
        setupWarnings: []
      },
      messages: [message], loading: false, denied: false, error: null, refreshing: false,
      hasOlderHistory: false, loadingOlder: false, olderError: null, newMessagesAvailable: false,
      scrollToEndRequest: 0, readError: null, acknowledgingRead: false,
      refresh: jest.fn(async () => undefined), loadOlder: jest.fn(async () => undefined),
      refreshParticipantContext: jest.fn(async () => undefined),
      setNearBottom: jest.fn(), clearNewMessages: jest.fn(), acknowledgeVisible: jest.fn(), retryRead: jest.fn(),
      revokeAccess: jest.fn(async () => undefined), setReadActive: jest.fn()
    });
    const onBack = jest.fn();
    mockDismissTransientState.mockReturnValueOnce(true).mockReturnValue(false);
    const view = await render(<ChatThread projectId="project-a" session={session} compact onBack={onBack} />);

    await act(async () => {
      expect(mockSharedBack()).toBe(true);
    });
    expect(mockDismissTransientState).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      expect(mockSharedBack()).toBe(true);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("enables participant management only from capability plus permission and gives Group info first Back priority", async () => {
    const revokeAccess = jest.fn(async () => undefined);
    useChatThreadMock.mockReturnValue(threadState(true, { revokeAccess }));
    const managerSession = {
      ...session,
      authorization: {
        ...session.authorization,
        permissions: [...session.authorization.permissions, "chat.participants.manage"]
      }
    } as AuthenticatedSession;
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
    const onBack = jest.fn();
    const view = await render(<ChatThread projectId="project-a" session={managerSession} compact onBack={onBack} />);

    await fireEvent.press(view.getByRole("button", { name: "Open group info, Villa, 3 participants" }));
    expect(view.getByText("Participant management enabled")).toBeTruthy();

    mockGroupDismissTransientState.mockReturnValueOnce(true);
    await act(async () => {
      expect(mockSharedBack()).toBe(true);
    });
    expect(view.getByLabelText("Mock group info")).toBeTruthy();
    expect(mockDismissTransientState).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole("button", { name: "Mock participant added" }));
    expect(announce).toHaveBeenCalledWith("Aditi Rao was added to the conversation.");
    expect(view.getByText("Aditi Rao was added to the conversation.")).toBeTruthy();

    await fireEvent.press(view.getByRole("button", { name: "Mock participant denied" }));
    await waitFor(() => expect(view.queryByLabelText("Mock group info")).toBeNull());
    expect(revokeAccess).toHaveBeenCalledTimes(1);
    announce.mockRestore();
    await view.unmount();
  });

  it("does not infer participant management from a Super Admin role when the backend capability is absent", async () => {
    useChatThreadMock.mockReturnValue(threadState(false));
    const superAdminSession = {
      user: { ...session.user, role: "super_admin" },
      authorization: {
        role: "super_admin",
        policyVersion: "test",
        permissions: ["chat.send", "chat.issue", "chat.participants.manage"]
      }
    } as AuthenticatedSession;
    const view = await render(<ChatThread projectId="project-a" session={superAdminSession} compact />);

    await fireEvent.press(view.getByRole("button", { name: "Open group info, Villa, 3 participants" }));
    expect(view.getByText("Participant management unavailable")).toBeTruthy();
    const lastProps = mockGroupInfoProps.mock.calls.at(-1)?.[0] as { readonly canManage?: boolean } | undefined;
    expect(lastProps?.canManage).toBe(false);
    await view.unmount();
  });

  it("clears private thread UI when the runtime owner changes for the same user and project", async () => {
    const originalAppState = AppState.currentState;
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    const setReadActive = jest.fn();
    let current = threadState(false, { setReadActive });
    useChatThreadMock.mockImplementation(() => current);
    const element = () => <ChatThread projectId="project-a" session={session} compact />;
    const view = await render(element());

    await fireEvent.press(view.getByRole("button", { name: "Open first message" }));
    await fireEvent.press(view.getByRole("button", { name: "Reply from sheet" }));
    expect(view.getByText("Composer replying to Aditi")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Open group info, Villa, 3 participants" }));
    await fireEvent.press(view.getByRole("button", { name: "Mock participant added" }));
    expect(view.getByText("Aditi Rao was added to the conversation.")).toBeTruthy();

    current = {
      ...current,
      ownerKey: "local\u00001\u0000user-me\u0000project-a",
      messages: []
    };
    mockComposerReply.mockClear();
    await view.rerender(element());

    expect(mockComposerReply).not.toHaveBeenCalledWith(expect.objectContaining({ id: "message-a" }));
    await waitFor(() => expect(view.getByText("Composer ready")).toBeTruthy());
    expect(view.queryByLabelText("Mock group info")).toBeNull();
    expect(view.queryByText("Aditi Rao was added to the conversation.")).toBeNull();
    await waitFor(() => expect(setReadActive).toHaveBeenLastCalledWith(true));
    await view.unmount();
    Object.defineProperty(AppState, "currentState", { configurable: true, value: originalAppState });
  });
});
