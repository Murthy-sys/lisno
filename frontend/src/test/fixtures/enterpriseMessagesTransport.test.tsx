import { afterEach, describe, expect, it, vi } from "vitest";
import { tokenStorage } from "../../api/client";
import type { AuthorizationSnapshot, Role } from "../../api/authorization-contract";
import type { ChatActionTypes, ChatConversationPage, ChatMessagePage, ChatSummary } from "../../features/messages/projectChatTypes";
import { installEnterpriseTransport, type EnterpriseScenario } from "./enterpriseTransport";

let transport: ReturnType<typeof installEnterpriseTransport> | undefined;

afterEach(() => {
  transport?.restore();
  transport = undefined;
  vi.useRealTimers();
});

function install({ role = "super_admin", state = "populated", query = "qaMessages=ready" }: {
  role?: Role;
  state?: EnterpriseScenario["state"];
  query?: string;
} = {}) {
  transport = installEnterpriseTransport({ route: `/projects/qa-project-1/messages?${query}`, role, state });
  return transport;
}

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`);
  expect(response.status).toBe(200);
  return (await response.json()).data as T;
}

describe("opt-in enterprise messaging transport", () => {
  it("serves the second page and searches project names beyond the loaded first page", async () => {
    install();
    const first = await read<ChatConversationPage>("/project-messages?limit=30&offset=0");
    const second = await read<ChatConversationPage>("/project-messages?limit=30&offset=30");
    expect(first.pagination).toEqual({ limit: 30, offset: 0, total: 34, hasMore: true });
    expect(second.pagination).toEqual({ limit: 30, offset: 30, total: 34, hasMore: false });
    expect(first.items).toHaveLength(30);
    expect(second.items).toHaveLength(4);
    expect(new Set([...first.items, ...second.items].map(item => item.project.id)).size).toBe(34);
    expect(first.items.some(item => item.project.id === "qa-project-34")).toBe(false);

    const found = await read<ChatConversationPage>("/project-messages?search=%20ZiNnIa%20&filter=all");
    expect(found.items.map(item => item.project.id)).toEqual(["qa-project-34"]);
    expect(found.items[0]?.lastMessage).toMatchObject({ excerpt: expect.any(String), attachmentCount: expect.any(Number) });
    const noMessageBodySearch = await read<ChatConversationPage>("/project-messages?search=ceiling%20clearance");
    expect(noMessageBodySearch.items).toEqual([]);
    expect(noMessageBodySearch.pagination.total).toBe(0);
    expect(found.totals).toEqual(first.totals);
    expect(transport!.requests.filter(request => request.unexpected)).toEqual([]);
  });

  it("filters server results while preserving the different unread and open-issue count units", async () => {
    install();
    const all = await read<ChatConversationPage>("/project-messages?limit=50");
    expect(all.totals).toEqual({ unread: 23, critical: 33, important: 51 });
    const filters = [
      ["unread", "unread"], ["critical", "openCritical"], ["important", "openImportant"]
    ] as const;
    for (const [filter, count] of filters) {
      const response = await read<ChatConversationPage>(`/project-messages?filter=${filter}&limit=50`);
      expect(response.items.map(item => item.project.id)).toEqual(all.items.filter(item => item.counts[count] > 0).map(item => item.project.id));
      expect(response.pagination.total).toBe(response.items.length);
      expect(response.totals).toEqual(all.totals);
    }
    const combined = await read<ChatConversationPage>("/project-messages?search=Birch&filter=critical");
    expect(combined.items).toEqual([]);
    expect(combined.pagination.total).toBe(0);
    expect(combined.totals).toEqual(all.totals);
  });

  it.each(["/project-messages", "/projects/qa-project-1/chat", "/projects/qa-project-1/chat/messages"])(
    "keeps the loading scenario pending until %s is aborted", async path => {
      install({ state: "loading" });
      const controller = new AbortController();
      const pending = fetch(`/api/v1${path}`, { signal: controller.signal });
      let settled = false;
      void pending.then(() => { settled = true; }, () => { settled = true; });
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(transport!.requests).toContainEqual({ method: "GET", path, status: 0, unexpected: false });
      const aborted = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      controller.abort();
      await aborted;
      const authorization = await read<AuthorizationSnapshot>("/auth/authorization");
      expect(authorization.permissions).toContain("chat.read");
    }
  );

  it("honors an already-aborted loading request", async () => {
    install({ state: "loading" });
    const controller = new AbortController();
    controller.abort();
    await expect(fetch("/api/v1/project-messages", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each(["/project-messages", "/projects/qa-project-1/chat", "/projects/qa-project-1/chat/messages", "/projects/qa-project-1/status"])(
    "returns the selected 503 error state for %s", async path => {
      install({ state: "error" });
      const response = await fetch(`/api/v1${path}`);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "SYNTHETIC_UNAVAILABLE" } });
      expect(transport!.requests).toContainEqual({ method: "GET", path, status: 503, unexpected: false });
      expect((await read<AuthorizationSnapshot>("/auth/authorization")).permissions).toContain("chat.read");
    }
  );

  it("keeps denied identities out of messaging and denies direct fixture data requests", async () => {
    install({ role: "client", state: "denied" });
    const authorization = await read<AuthorizationSnapshot>("/auth/authorization");
    expect(authorization.permissions).toEqual(["identity.self.read", "identity.authorization.read"]);
    expect(authorization.permissions).not.toContain("chat.read");
    expect((await fetch("/api/v1/project-messages")).status).toBe(403);
    expect((await fetch("/api/v1/projects/qa-project-1/chat")).status).toBe(404);
    expect(transport!.requests.filter(request => request.unexpected)).toEqual([]);
  });

  it("does not grant retired Program Manager messaging access when the fixture is selected", async () => {
    install({ role: "program_manager" });
    const authorization = await read<AuthorizationSnapshot>("/auth/authorization");
    expect(authorization.role).toBe("program_manager");
    expect(authorization.permissions).not.toContain("chat.read");
  });

  it("only enables additional Client messaging permissions for the opted-in route", async () => {
    install({ role: "client", query: "" });
    expect((await read<AuthorizationSnapshot>("/auth/authorization")).permissions).not.toContain("chat.read");
    transport!.restore();
    install({ role: "client" });
    expect((await read<AuthorizationSnapshot>("/auth/authorization")).permissions).toContain("chat.read");
    const summary = await read<ChatSummary>("/projects/qa-project-1/chat");
    expect(summary.capabilities).toEqual({ canSend: true, canManageParticipants: false, canManageIssues: false, canRenameProject: false });
  });

  it("retains history but refuses message and issue writes during closed chat hours", async () => {
    install({ query: "qaMessages=ready&qaChatHours=closed" });
    const availability = await read<{ writable: boolean; nextOpenAt: string | null }>("/chat/availability");
    expect(availability.writable).toBe(false);
    expect(availability.nextOpenAt).not.toBeNull();
    const summary = await read<ChatSummary>("/projects/qa-project-1/chat");
    expect(Object.values(summary.capabilities).every(value => value === false)).toBe(true);
    const page = await read<ChatMessagePage>("/projects/qa-project-1/chat/messages");
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every(message => Object.values(message.capabilities).every(value => value === false))).toBe(true);
    expect((await read<ChatActionTypes>("/projects/qa-project-1/chat/action-types")).canCreate).toBe(false);
    for (const [method, path, body] of [
      ["POST", "/projects/qa-project-1/chat/messages", { body: "Synthetic retained draft", mentions: [], priority: "normal", clientMessageId: "closed-send-attempt" }],
      ["PATCH", "/projects/qa-project-1/chat/messages/qa-project-1-message-7/issue", { action: "resolve", expectedVersion: 2, idempotencyKey: "closed-issue-attempt", note: "Synthetic resolution." }]
    ] as const) {
      const response = await fetch(`/api/v1${path}`, { method, body: JSON.stringify(body) });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "CHAT_CLOSED" } });
    }
    expect((await read<ChatMessagePage>("/projects/qa-project-1/chat/messages")).items).toEqual(page.items);
    expect(transport!.requests.filter(request => request.unexpected)).toEqual([]);
  });

  it("preserves the intentional null daily-task result instead of falling through to other fixtures", async () => {
    install();
    expect(await read<null>("/daily-critical-tasks")).toBeNull();
    expect(transport!.requests).toEqual([{ method: "GET", path: "/daily-critical-tasks", status: 200, unexpected: false }]);
  });

  it("closes streams, removes their timers, and restores transport functions on disposal", async () => {
    vi.useFakeTimers();
    const originals = { fetch: window.fetch, get: tokenStorage.get, set: tokenStorage.set, clear: tokenStorage.clear, open: XMLHttpRequest.prototype.open, send: XMLHttpRequest.prototype.send };
    const beforeTimers = vi.getTimerCount();
    install();
    const responses = await Promise.all([fetch("/api/v1/projects/qa-project-1/chat/events"), fetch("/api/v1/notifications/events")]);
    const readers = responses.map(response => {
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      return response.body!.getReader();
    });
    for (const reader of readers) {
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain('data: {"status":"live"}');
    }
    expect(vi.getTimerCount()).toBe(beforeTimers + 2);
    const pendingReads = readers.map(reader => reader.read());
    transport!.restore();
    transport = undefined;
    expect(await Promise.all(pendingReads)).toEqual([{ value: undefined, done: true }, { value: undefined, done: true }]);
    expect(vi.getTimerCount()).toBe(beforeTimers);
    expect(window.fetch).toBe(originals.fetch);
    expect(tokenStorage.get).toBe(originals.get);
    expect(tokenStorage.set).toBe(originals.set);
    expect(tokenStorage.clear).toBe(originals.clear);
    expect(XMLHttpRequest.prototype.open).toBe(originals.open);
    expect(XMLHttpRequest.prototype.send).toBe(originals.send);
    expect(document.querySelector("[data-enterprise-transport-error]")).toBeNull();
    readers.forEach(reader => reader.releaseLock());
  });
});
