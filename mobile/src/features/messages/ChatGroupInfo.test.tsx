import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef, type Ref, type RefObject } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import * as ReactNative from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import {
  ChatGroupInfo,
  type ChatGroupInfoHandle,
  type ChatGroupInfoProps
} from "./ChatGroupInfo";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

const useRuntimeMock = jest.mocked(useConfiguredRuntime);
const session = {
  user: { id: "user-me", name: "Me", email: "me@example.test", role: "admin" },
  authorization: {
    role: "admin",
    policyVersion: "test",
    permissions: ["chat.read", "chat.participants.manage"]
  }
} as AuthenticatedSession;

const readerPage = {
  items: [
    { id: "user-client", name: "Ananya Rao", role: "client", sources: [], selection: null },
    { id: "user-designer", name: "Aditi Rao", role: "designer", sources: [], selection: null }
  ],
  setupWarnings: []
};

const managerPage = {
  items: [
    ...readerPage.items,
    {
      id: "user-manager",
      name: "Mira Shah",
      role: "design_manager",
      sources: [{ kind: "project_assignment", id: "project-a" }],
      selection: { id: "selection-a", version: 2 }
    }
  ],
  setupWarnings: ["One project assignment needs review."]
};

const optionPage = {
  items: [
    { id: "user-option-a", name: "Asha Rao", role: "designer" },
    { id: "user-option-b", name: "Dev Shah", role: "site_manager" }
  ],
  hasMore: true
};

let environmentId = "remote:https://api.example.test";
let apiGet = jest.fn();
let apiPost = jest.fn();
const clients: QueryClient[] = [];

function runtimeValue() {
  return {
    environment: {
      environment: { id: environmentId, profile: "remote" },
      generation: 1,
      status: "ready"
    },
    runtime: { api: { authenticated: { get: apiGet, post: apiPost } } }
  } as unknown as ReturnType<typeof useConfiguredRuntime>;
}

function defaultProps(overrides: Partial<ChatGroupInfoProps> = {}): ChatGroupInfoProps {
  return {
    visible: true,
    compact: true,
    projectId: "project-a",
    projectName: "Villa",
    participantCount: 2,
    session,
    canManage: false,
    onRequestClose: jest.fn(),
    onDenied: jest.fn(),
    onParticipantsChanged: jest.fn(),
    onParticipantAdded: jest.fn(),
    ...overrides
  };
}

async function groupHarness(overrides: Partial<ChatGroupInfoProps> = {}, ref?: Ref<ChatGroupInfoHandle>) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity }
    }
  });
  clients.push(client);
  const props = defaultProps(overrides);
  const element = (next = props) => (
    <QueryClientProvider client={client}>
      <ChatGroupInfo {...next} ref={ref} />
    </QueryClientProvider>
  );
  const view = await render(element());
  return { client, element, props, view };
}

async function openAdd(view: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(await view.findByRole("button", { name: "Add participant" }));
  await waitFor(() => expect(view.getByLabelText("Search eligible people")).toBeTruthy());
}

async function chooseAshaAndReason(view: Awaited<ReturnType<typeof render>>, reason = "Coordinate design review") {
  await waitFor(() => expect(view.getByRole("radio", { name: "Asha Rao, Designer" })).toBeTruthy());
  await fireEvent.press(view.getByRole("radio", { name: "Asha Rao, Designer" }));
  await fireEvent.changeText(view.getByLabelText("Reason for access"), reason);
}

async function dismissGroup(ref: RefObject<ChatGroupInfoHandle | null>): Promise<boolean> {
  let dismissed = false;
  await act(async () => {
    dismissed = ref.current?.dismissTransientState() ?? false;
  });
  return dismissed;
}

beforeEach(() => {
  environmentId = "remote:https://api.example.test";
  apiGet = jest.fn(async (path: string) => path.includes("participant-options") ? optionPage : readerPage);
  apiPost = jest.fn(async () => managerPage);
  useRuntimeMock.mockImplementation(runtimeValue);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  jest.restoreAllMocks();
});

describe("ChatGroupInfo", () => {
  it("shows a reader the real roster, canonical roles, initials, count, and history notice without management metadata", async () => {
    const { view } = await groupHarness();

    await waitFor(() => expect(view.getByLabelText("Ananya Rao, Client")).toBeTruthy());
    expect(view.getByLabelText("Villa, 2 participants")).toBeTruthy();
    expect(view.getByLabelText("Aditi Rao, Designer")).toBeTruthy();
    expect(view.getAllByText("AR", { includeHiddenElements: true })).toHaveLength(2);
    expect(view.getByText(/New participants can read the conversation history/)).toBeTruthy();
    expect(view.queryByRole("button", { name: "Add participant" })).toBeNull();
    expect(view.queryByText(/project assignment/i)).toBeNull();
    expect(view.queryByText(/remove/i)).toBeNull();
  });

  it("uses only the canManage input to expose Add, renders warnings, and never exposes removal", async () => {
    apiGet.mockImplementation(async (path: string) => path.includes("participant-options") ? optionPage : managerPage);
    const clientSession = {
      ...session,
      user: { ...session.user, role: "client" as const },
      authorization: { ...session.authorization, role: "client" as const }
    };
    const { view } = await groupHarness({ canManage: true, session: clientSession });

    await waitFor(() => expect(view.getByRole("button", { name: "Add participant" })).toBeTruthy());
    await waitFor(() => expect(view.getByText("One project assignment needs review.")).toBeTruthy());
    expect(view.getByLabelText("Mira Shah, Design Manager")).toBeTruthy();
    expect(view.queryByText(/remove/i)).toBeNull();
  });

  it("debounces and encodes search, selects by stable ID, shows hasMore, and completes an audited add", async () => {
    let added = false;
    apiGet.mockImplementation(async (path: string) => {
      if (path.includes("participant-options")) return optionPage;
      return added ? managerPage : readerPage;
    });
    apiPost.mockImplementation(async () => {
      added = true;
      return managerPage;
    });
    const onParticipantsChanged = jest.fn(async () => undefined);
    const onParticipantAdded = jest.fn(async () => undefined);
    const { view } = await groupHarness({ canManage: true, onParticipantsChanged, onParticipantAdded });
    await openAdd(view);

    await fireEvent.changeText(view.getByLabelText("Search eligible people"), "  Asha & Rao  ");
    expect(apiGet.mock.calls.some(([path]) => String(path).includes("search=Asha"))).toBe(false);
    await waitFor(
      () => expect(apiGet.mock.calls.some(([path]) => String(path).includes("search=Asha+%26+Rao&limit=30"))).toBe(true),
      { timeout: 1_500 }
    );
    await waitFor(() => expect(view.getByText("More people match. Refine your search.")).toBeTruthy());

    await chooseAshaAndReason(view, "  Coordinate design review  ");
    const optionCallsBeforeAdd = apiGet.mock.calls.filter(([path]) => String(path).includes("participant-options")).length;
    await fireEvent.press(view.getByRole("button", { name: "Add participant" }));

    await waitFor(() => expect(onParticipantsChanged).toHaveBeenCalledTimes(1));
    expect(apiGet.mock.calls.filter(([path]) => String(path).includes("participant-options")).length).toBeGreaterThan(optionCallsBeforeAdd);
    expect(apiPost).toHaveBeenCalledWith(
      "/projects/project-a/chat/participants",
      {
        userId: "user-option-a",
        reason: "Coordinate design review",
        idempotencyKey: expect.any(String)
      },
      { signal: expect.any(AbortSignal) }
    );
    expect(onParticipantsChanged).toHaveBeenCalledWith(managerPage);
    expect(onParticipantAdded).toHaveBeenCalledWith("Asha Rao");
    expect(view.getByText("Asha Rao was added to the conversation.")).toBeTruthy();
    expect(view.queryByLabelText("Reason for access")).toBeNull();
  });

  it("shows a truthful empty result and enforces the trimmed, bounded reason", async () => {
    apiGet.mockImplementation(async (path: string) => path.includes("participant-options")
      ? { items: [], hasMore: false }
      : readerPage);
    const { view } = await groupHarness({ canManage: true });
    await openAdd(view);

    expect(await view.findByText("No eligible active project participants match this search.")).toBeTruthy();
    const reason = view.getByLabelText("Reason for access");
    expect(reason.props.maxLength).toBe(1_000);
    await fireEvent.changeText(reason, "   ");
    expect(view.getByRole("button", { name: "Add participant" })).toBeDisabled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("locks rapid submit and Back while pending", async () => {
    let resolvePost: ((value: typeof managerPage) => void) | null = null;
    apiPost.mockImplementation(() => new Promise<typeof managerPage>((resolve) => { resolvePost = resolve; }));
    const ref = createRef<ChatGroupInfoHandle>();
    const onRequestClose = jest.fn();
    const { view } = await groupHarness({ canManage: true, onRequestClose }, ref);
    await openAdd(view);
    await chooseAshaAndReason(view);

    const submit = view.getByRole("button", { name: "Add participant" });
    await fireEvent.press(submit);
    await fireEvent.press(submit);
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(await dismissGroup(ref)).toBe(true);
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(view.getByLabelText("Reason for access")).toBeTruthy();

    await act(async () => resolvePost?.(managerPage));
    await waitFor(() => expect(view.queryByLabelText("Reason for access")).toBeNull());
  });

  it("reuses one idempotency key for an unchanged retry and renews it after input changes", async () => {
    apiPost.mockRejectedValue(new Error("offline"));
    const { view } = await groupHarness({ canManage: true });
    await openAdd(view);
    await chooseAshaAndReason(view);

    await fireEvent.press(view.getByRole("button", { name: "Add participant" }));
    await waitFor(() => expect(view.getByText(/ready to retry/i)).toBeTruthy());
    await fireEvent.press(view.getByRole("button", { name: "Add participant" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
    const firstKey = apiPost.mock.calls[0]?.[1].idempotencyKey;
    const retryKey = apiPost.mock.calls[1]?.[1].idempotencyKey;
    expect(retryKey).toBe(firstKey);

    await fireEvent.changeText(view.getByLabelText("Reason for access"), "A changed access reason");
    await fireEvent.press(view.getByRole("button", { name: "Add participant" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(3));
    expect(apiPost.mock.calls[2]?.[1].idempotencyKey).not.toBe(firstKey);
    expect(view.getByLabelText("Reason for access").props.value).toBe("A changed access reason");
  });

  it("keeps the form open on 409 and refreshes participants and eligible options", async () => {
    apiPost.mockRejectedValue(new ApiError(409, "CHAT_PARTICIPANT_CONFLICT", "Sensitive conflict"));
    const { view } = await groupHarness({ canManage: true });
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(
      "/projects/project-a/chat/participants",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    ));
    await openAdd(view);
    await chooseAshaAndReason(view);
    const participantCallsBefore = apiGet.mock.calls.filter(([path]) => String(path).endsWith("/participants")).length;
    const optionCallsBefore = apiGet.mock.calls.filter(([path]) => String(path).includes("participant-options")).length;

    await fireEvent.press(view.getByRole("button", { name: "Add participant" }));
    await waitFor(() => expect(view.getByText(/Participant access changed/)).toBeTruthy());
    expect(apiGet.mock.calls.filter(([path]) => String(path).endsWith("/participants")).length).toBeGreaterThan(participantCallsBefore);
    expect(apiGet.mock.calls.filter(([path]) => String(path).includes("participant-options")).length).toBeGreaterThan(optionCallsBefore);
    expect(view.getByLabelText("Reason for access").props.value).toBe("Coordinate design review");
    expect(view.queryByText("Sensitive conflict")).toBeNull();
  });

  it("purges protected participant state and reports a non-disclosing denial", async () => {
    apiPost.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Sensitive policy detail"));
    const onDenied = jest.fn(async () => undefined);
    const { client, view } = await groupHarness({ canManage: true, onDenied });
    await openAdd(view);
    await chooseAshaAndReason(view);
    await fireEvent.press(view.getByRole("button", { name: "Add participant" }));

    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(view.getByText("This item is unavailable or your access has changed.")).toBeTruthy();
    expect(view.queryByText("Sensitive policy detail")).toBeNull();
    expect(client.getQueryData([environmentId, "user-me", "chat", "project", "project-a", "participants"])).toBeUndefined();
  });

  it("cancels an in-flight option request when nested Add closes", async () => {
    let optionSignal: AbortSignal | null = null;
    apiGet.mockImplementation(async (path: string, options?: { signal?: AbortSignal }) => {
      if (!path.includes("participant-options")) return readerPage;
      optionSignal = options?.signal ?? null;
      return await new Promise((_resolve, reject) => {
        optionSignal?.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })), { once: true });
      });
    });
    const ref = createRef<ChatGroupInfoHandle>();
    const { view } = await groupHarness({ canManage: true }, ref);
    await openAdd(view);
    await waitFor(() => expect(optionSignal).not.toBeNull());

    expect(await dismissGroup(ref)).toBe(true);
    await waitFor(() => expect(optionSignal?.aborted).toBe(true));
    expect(view.queryByLabelText("Search eligible people")).toBeNull();
  });

  it("fences a stale add response after the project changes", async () => {
    let resolvePost: ((value: typeof managerPage) => void) | null = null;
    let postSignal: AbortSignal | null = null;
    apiPost.mockImplementation((_path, _body, options?: { signal?: AbortSignal }) => {
      postSignal = options?.signal ?? null;
      return new Promise<typeof managerPage>((resolve) => { resolvePost = resolve; });
    });
    const onParticipantsChanged = jest.fn();
    const onParticipantAdded = jest.fn();
    const ref = createRef<ChatGroupInfoHandle>();
    const harness = await groupHarness({ canManage: true, onParticipantsChanged, onParticipantAdded }, ref);
    await openAdd(harness.view);
    await chooseAshaAndReason(harness.view);
    await fireEvent.press(harness.view.getByRole("button", { name: "Add participant" }));

    await harness.view.rerender(harness.element({
      ...harness.props,
      projectId: "project-b",
      projectName: "Townhouse"
    }));
    await waitFor(() => expect(postSignal?.aborted).toBe(true));
    await act(async () => resolvePost?.(managerPage));
    await act(async () => Promise.resolve());
    expect(onParticipantsChanged).not.toHaveBeenCalled();
    expect(onParticipantAdded).not.toHaveBeenCalled();
    expect(harness.view.queryByText(/was added/)).toBeNull();
  });

  it("requests controlled closure when the environment owner changes, but not on initial mount", async () => {
    const onRequestClose = jest.fn();
    const harness = await groupHarness({ onRequestClose });
    await waitFor(() => expect(harness.view.getByLabelText("Ananya Rao, Client")).toBeTruthy());
    expect(onRequestClose).not.toHaveBeenCalled();

    environmentId = "local:http://10.0.2.2:3000";
    await harness.view.rerender(harness.element(harness.props));
    await waitFor(() => expect(onRequestClose).toHaveBeenCalledTimes(1));
  });

  it("implements nested Back ordering, restores focus, and uses phone versus expanded composition", async () => {
    const ref = createRef<ChatGroupInfoHandle>();
    const onRequestClose = jest.fn();
    const onRestoreFocus = jest.fn();
    const nodeHandle = jest.spyOn(ReactNative, "findNodeHandle").mockReturnValue(42);
    const focus = jest.spyOn(AccessibilityInfo, "setAccessibilityFocus").mockImplementation(() => undefined);
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };

    try {
      const harness = await groupHarness({ canManage: true, onRequestClose, onRestoreFocus }, ref);
      const modals = harness.view.container.queryAll((instance) => instance.type === "Modal");
      expect(modals).toHaveLength(1);
      expect(modals[0]?.props.presentationStyle).toBe("fullScreen");
      modals[0]?.props.onShow();
      expect(focus).toHaveBeenCalled();

      await openAdd(harness.view);
      expect(ref.current?.hasTransientState()).toBe(true);
      expect(await dismissGroup(ref)).toBe(true);
      await waitFor(() => expect(harness.view.queryByLabelText("Search eligible people")).toBeNull());
      expect(onRequestClose).not.toHaveBeenCalled();
      expect(await dismissGroup(ref)).toBe(true);
      expect(onRequestClose).toHaveBeenCalledTimes(1);

      await harness.view.rerender(harness.element({ ...harness.props, visible: false }));
      expect(onRestoreFocus).toHaveBeenCalledTimes(1);
      await harness.view.rerender(harness.element({ ...harness.props, compact: false }));
      expect(harness.view.container.queryAll((instance) => instance.type === "Modal")).toHaveLength(0);
      expect(harness.view.getByTestId("chat-group-info-expanded")).toHaveStyle({
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        maxWidth: 800
      });
    } finally {
      global.requestAnimationFrame = originalRequestAnimationFrame;
      nodeHandle.mockRestore();
      focus.mockRestore();
    }
  });
});
