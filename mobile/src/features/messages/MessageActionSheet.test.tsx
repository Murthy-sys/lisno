import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import type { PresentedMessage } from "./chatModel";
import { issueActionNeedsNote, MessageActionSheet, messageIssueActions } from "./MessageActionSheet";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

const useRuntimeMock = jest.mocked(useConfiguredRuntime);
const session = {
  user: { id: "user-me", name: "Me", email: "me@example.test", role: "admin" },
  authorization: { role: "admin", policyVersion: "test", permissions: ["chat.send", "chat.issue"] }
} as AuthenticatedSession;

function sessionWithPermissions(permissions: AuthenticatedSession["authorization"]["permissions"]): AuthenticatedSession {
  return {
    ...session,
    authorization: { ...session.authorization, permissions }
  };
}

function message(overrides: Partial<PresentedMessage> = {}): PresentedMessage {
  return {
    id: "message-a",
    projectId: "project-a",
    body: "Review this",
    author: "Aditi",
    authorId: "user-a",
    authorRole: "designer",
    authorIdentity: { id: "user-a", name: "Aditi", role: "designer" },
    createdAt: "2026-09-18T10:00:00.000Z",
    sequence: 1,
    clientMessageId: "client-a",
    priority: "normal",
    version: 1,
    issueStatus: null,
    replyTo: null,
    attachments: [],
    capabilities: { canRaise: true, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false },
    ...overrides
  };
}

describe("message issue actions", () => {
  it("derives only valid transitions from authoritative message capabilities and state", () => {
    expect(messageIssueActions(message()).map((item) => item.action)).toEqual(["raise"]);
    expect(messageIssueActions(message({
      priority: "critical",
      issueStatus: "open",
      capabilities: { canRaise: false, canResolve: true, canReopen: false, canAssign: false, canAssignSelf: false }
    })).map((item) => item.action)).toEqual(["resolve", "lower", "clear"]);
    expect(messageIssueActions(message({
      priority: "important",
      issueStatus: "resolved",
      capabilities: { canRaise: false, canResolve: false, canReopen: true, canAssign: false, canAssignSelf: false }
    })).map((item) => item.action)).toEqual(["reopen"]);
  });

  it("requires backend-mandated notes and leaves raise/escalate immediate", () => {
    expect((["resolve", "reopen", "lower", "clear"] as const).every(issueActionNeedsNote)).toBe(true);
    expect(issueActionNeedsNote("raise")).toBe(false);
    expect(issueActionNeedsNote("escalate")).toBe(false);
  });

  it("keeps a 409 sheet open, refreshes, and removes a transition that became invalid", async () => {
    const patch = jest.fn(async () => {
      throw new ApiError(409, "CHAT_CONFLICT", "Conversation changed");
    });
    useRuntimeMock.mockReturnValue({
      environment: { environment: { id: "remote:https://api.example.test" } },
      runtime: { api: { authenticated: { patch } } }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const refresh = jest.fn(async () => undefined);
    const close = jest.fn();
    const component = (value: PresentedMessage) => (
      <QueryClientProvider client={client}>
        <MessageActionSheet
          canReply
          message={value}
          onClose={close}
          onDenied={jest.fn()}
          onRefresh={refresh}
          onReply={jest.fn()}
          projectId="project-a"
          session={session}
          visible
        />
      </QueryClientProvider>
    );
    const view = await render(component(message()));

    await fireEvent.press(view.getByText("Raise an issue"));
    await fireEvent.press(view.getByText("Save update"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(close).not.toHaveBeenCalled();
    expect(view.getByText(/latest state has been refreshed/i)).toBeTruthy();
    expect(patch).toHaveBeenCalledWith(
      "/projects/project-a/chat/messages/message-a/issue",
      expect.objectContaining({ action: "raise", expectedVersion: 1, priority: "important", idempotencyKey: expect.any(String) })
    );

    await view.rerender(component(message({
      priority: "important",
      issueStatus: "resolved",
      version: 2,
      capabilities: { canRaise: false, canResolve: false, canReopen: false, canAssign: false, canAssignSelf: false }
    })));
    await waitFor(() => expect(view.getByText("Message actions")).toBeTruthy());
    expect(view.queryByText("Save update")).toBeNull();
    expect(view.getByText(/latest state has been refreshed/i)).toBeTruthy();
    await view.unmount();
    client.clear();
  });

  it("revokes access without disclosing backend details when an issue mutation is denied", async () => {
    const patch = jest.fn(async () => {
      throw new ApiError(403, "FORBIDDEN", "Sensitive policy detail");
    });
    useRuntimeMock.mockReturnValue({
      environment: { environment: { id: "remote:https://api.example.test" } },
      runtime: { api: { authenticated: { patch } } }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const onDenied = jest.fn(async () => undefined);
    const view = await render(
      <QueryClientProvider client={client}>
        <MessageActionSheet
          canReply
          message={message()}
          onClose={jest.fn()}
          onDenied={onDenied}
          onRefresh={jest.fn()}
          onReply={jest.fn()}
          projectId="project-a"
          session={session}
          visible
        />
      </QueryClientProvider>
    );

    await fireEvent.press(view.getByText("Raise an issue"));
    await fireEvent.press(view.getByText("Save update"));
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(view.queryByText("Sensitive policy detail")).toBeNull();
    await view.unmount();
    client.clear();
  });
});

describe("MessageActionSheet reply authorization", () => {
  beforeEach(() => {
    useRuntimeMock.mockReturnValue({
      environment: { environment: { id: "remote:https://api.example.test" } },
      runtime: { api: { authenticated: { patch: jest.fn() } } }
    } as unknown as ReturnType<typeof useConfiguredRuntime>);
  });

  async function renderReplySheet({
    canReply,
    sessionValue = session,
    onReply = jest.fn(),
    onClose = jest.fn()
  }: {
    readonly canReply: boolean;
    readonly sessionValue?: AuthenticatedSession;
    readonly onReply?: jest.Mock;
    readonly onClose?: jest.Mock;
  }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const value = message();
    const view = await render(
      <QueryClientProvider client={client}>
        <MessageActionSheet
          canReply={canReply}
          message={value}
          onClose={onClose}
          onDenied={jest.fn()}
          onRefresh={jest.fn()}
          onReply={onReply}
          projectId="project-a"
          session={sessionValue}
          visible
        />
      </QueryClientProvider>
    );
    return { client, onClose, onReply, value, view };
  }

  it("hides Reply when the thread capability is false despite global permission", async () => {
    const result = await renderReplySheet({ canReply: false });

    expect(result.view.queryByRole("button", { name: "Reply" })).toBeNull();

    await result.view.unmount();
    result.client.clear();
  });

  it("hides Reply when the thread allows sending but global permission is missing", async () => {
    const result = await renderReplySheet({
      canReply: true,
      sessionValue: sessionWithPermissions(["chat.issue"])
    });

    expect(result.view.queryByRole("button", { name: "Reply" })).toBeNull();

    await result.view.unmount();
    result.client.clear();
  });

  it("allows Reply only when both thread capability and global permission are present", async () => {
    const result = await renderReplySheet({ canReply: true });

    await fireEvent.press(result.view.getByRole("button", { name: "Reply" }));

    expect(result.onReply).toHaveBeenCalledTimes(1);
    expect(result.onReply).toHaveBeenCalledWith(result.value);
    expect(result.onClose).toHaveBeenCalledTimes(1);

    await result.view.unmount();
    result.client.clear();
  });
});
