import {
  CHAT_PARTICIPANT_SOURCE_KINDS,
  buildMessageTimeline,
  conversationAccessibilitySummary,
  conversationActivityInput,
  conversationProject,
  createClientMessageId,
  createClientUploadId,
  mergeConversationPages,
  mergeMessagePages,
  messageAccessibilitySummary,
  presentChatParticipantOptions,
  presentChatParticipantPage,
  presentChatSummary,
  presentConversationPage,
  presentMessagePage,
  presentMessages,
  projectInitials,
  selectSafelyReadableMessage,
  type PresentedConversation,
  type PresentedMessage
} from "./chatModel";
import { ROLE_CODES } from "../../contracts/authorization";

const person = (id: string, name = "Asha Rao", role = "admin") => ({ id, name, role });

function rawSummary(projectId = "project-a") {
  return {
    project: { id: projectId, name: "Courtyard residence", status: "active" },
    counts: { openCritical: 2, openImportant: 1, unread: 4, unreadMentions: 3 },
    participantCount: 5,
    cursor: "summary-cursor",
    lastReadSequence: 2,
    latestMessageSequence: 11,
    capabilities: { canSend: true, canManageParticipants: false, canManageIssues: true },
    setupWarnings: ["One assignment needs review"]
  };
}

function rawMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "message-a",
    projectId: "project-a",
    author: person("user-a"),
    body: "Ready for review",
    attachments: [],
    createdAt: "2026-09-16T10:00:00.000Z",
    sequence: 3,
    clientMessageId: "client-a",
    replyTo: null,
    priority: "normal",
    issueStatus: null,
    version: 1,
    capabilities: {
      canRaise: true,
      canResolve: false,
      canReopen: false,
      canAssign: false,
      canAssignSelf: false
    },
    ...overrides
  };
}

function message(overrides: Record<string, unknown> = {}): PresentedMessage {
  const result = presentMessages({ items: [rawMessage(overrides)] })[0];
  if (!result) throw new Error("Fixture did not present a message");
  return result;
}

function conversation(projectId: string, overrides: Record<string, unknown> = {}): PresentedConversation {
  const page = presentConversationPage({
    items: [{ ...rawSummary(projectId), lastMessageAt: null, ...overrides }],
    pagination: { limit: 30, offset: 0, total: 1, hasMore: false }
  });
  if (!page?.items[0]) throw new Error("Fixture did not present a conversation");
  return page.items[0];
}

describe("mobile chat presenters", () => {
  it("uses the nested stable project identity from a conversation", () => {
    expect(conversationProject({ project: { id: "p1", name: "Courtyard" } })).toEqual({ id: "p1", name: "Courtyard" });
  });

  it("presents the authoritative summary contract and rejects malformed counts", () => {
    expect(presentChatSummary(rawSummary())).toEqual(rawSummary());
    expect(presentChatSummary(rawSummary("project-b"), "project-a")).toBeNull();
    expect(presentChatSummary({ ...rawSummary(), counts: { ...rawSummary().counts, unread: -1 } })).toBeNull();
    expect(presentChatSummary({ ...rawSummary(), capabilities: { canSend: true } })).toBeNull();
  });

  it("presents conversation counts, capabilities, pagination, and a missing activity date", () => {
    const result = presentConversationPage({
      items: [{ ...rawSummary(), lastMessageAt: null }],
      pagination: { limit: 30, offset: 0, total: 42, hasMore: true }
    });

    expect(result).toEqual({
      items: [{ ...rawSummary(), lastMessageAt: null }],
      pagination: { limit: 30, offset: 0, total: 42, hasMore: true }
    });
  });

  it("drops malformed conversation records and rejects malformed page metadata", () => {
    const result = presentConversationPage({
      items: [{ ...rawSummary(), lastMessageAt: null }, { project: { id: "missing-contract" } }],
      pagination: { limit: 30, offset: 0, total: 2, hasMore: false }
    });
    expect(result?.items.map((item) => item.project.id)).toEqual(["project-a"]);
    expect(presentConversationPage({ items: [], pagination: { limit: 0, offset: 0, total: 0, hasMore: false } })).toBeNull();
    expect(presentConversationPage({ items: [] })).toBeNull();
  });

  it("preserves stable author and reply identities, roles, action metadata, and attachment data", () => {
    const result = presentMessages({
      items: [
        rawMessage({
          priority: "critical",
          version: 2,
          issueStatus: "open",
          capabilities: {
            canRaise: false,
            canResolve: true,
            canReopen: false,
            canAssign: false,
            canAssignSelf: false
          },
          replyTo: {
            id: "message-parent",
            author: person("user-parent", "Asha Rao", "project_manager"),
            body: "Original",
            attachmentSummary: { count: 1, kind: "document", filename: "brief.pdf" }
          },
          attachments: [{
            id: "attachment-a",
            filename: "plan.pdf",
            mimeType: "application/pdf",
            byteSize: 8,
            kind: "document",
            preview: null
          }]
        })
      ]
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "message-a",
      projectId: "project-a",
      author: "Asha Rao",
      authorId: "user-a",
      authorRole: "admin",
      authorIdentity: person("user-a"),
      priority: "critical",
      version: 2,
      issueStatus: "open",
      replyTo: {
        id: "message-parent",
        author: "Asha Rao",
        authorId: "user-parent",
        authorRole: "project_manager",
        body: "Original",
        attachmentSummary: { count: 1, kind: "document", filename: "brief.pdf" }
      },
      attachments: [{
        id: "attachment-a",
        filename: "plan.pdf",
        mimeType: "application/pdf",
        byteSize: 8,
        kind: "document",
        preview: null
      }],
      capabilities: {
        canRaise: false,
        canResolve: true,
        canReopen: false,
        canAssign: false,
        canAssignSelf: false
      }
    });
  });

  it("rejects a complete message collection when a message or attachment is malformed", () => {
    expect(presentMessages({ items: [
      rawMessage({ author: { name: "No identity" } }),
      rawMessage({ id: "message-good", attachments: [{ filename: "missing-id.pdf" }] })
    ] })).toEqual([]);

    const metadata = {
      olderCursor: null,
      newerCursor: null,
      snapshotCursor: "snapshot",
      latestMessageSequence: 8
    };
    expect(presentMessagePage({
      items: [rawMessage({ id: "valid" }), { body: "bad" }],
      ...metadata
    }, "project-a")).toBeNull();
    expect(presentMessagePage({
      items: [rawMessage({ attachments: [{ filename: "missing-id.pdf" }] })],
      ...metadata
    }, "project-a")).toBeNull();
  });

  it("presents cursor metadata with messages and rejects incomplete cursor pages", () => {
    const page = presentMessagePage({
      items: [rawMessage()],
      olderCursor: "older",
      newerCursor: null,
      snapshotCursor: "snapshot",
      latestMessageSequence: 8
    });
    expect(page).toMatchObject({
      items: [expect.objectContaining({ id: "message-a", authorId: "user-a" })],
      olderCursor: "older",
      newerCursor: null,
      snapshotCursor: "snapshot",
      latestMessageSequence: 8
    });
    expect(presentMessagePage({
      items: [rawMessage({ projectId: "project-b" })],
      olderCursor: null,
      newerCursor: null,
      snapshotCursor: "snapshot",
      latestMessageSequence: 8
    }, "project-a")).toBeNull();
    expect(presentMessagePage({ items: [], olderCursor: null, newerCursor: null })).toBeNull();
  });
});

describe("mobile chat participant presenters", () => {
  const managerParticipant = {
    id: "user-a",
    name: "Asha Rao",
    role: "admin",
    sources: CHAT_PARTICIPANT_SOURCE_KINDS.map((kind, index) => ({ kind, id: `source-${index}` })),
    selection: { id: "selection-a", version: 3 }
  };

  it("preserves manager metadata for every canonical membership source", () => {
    expect(presentChatParticipantPage({
      items: [managerParticipant],
      setupWarnings: ["An assignment needs review"]
    })).toEqual({
      items: [managerParticipant],
      setupWarnings: ["An assignment needs review"]
    });
  });

  it("accepts the backend's redacted ordinary-reader participant page", () => {
    const reader = {
      id: "user-reader",
      name: "Reader Name",
      role: "client",
      sources: [],
      selection: null
    };
    expect(presentChatParticipantPage({ items: [reader], setupWarnings: [] })).toEqual({
      items: [reader],
      setupWarnings: []
    });
  });

  it("accepts every canonical role in participant options", () => {
    const items = ROLE_CODES.map((role, index) => ({ id: `user-${index}`, name: `Person ${index}`, role }));
    expect(presentChatParticipantOptions({ items, hasMore: true })).toEqual({ items, hasMore: true });
  });

  it.each([
    ["missing participant id", { ...managerParticipant, id: " " }],
    ["missing participant name", { ...managerParticipant, name: "" }],
    ["non-canonical role", { ...managerParticipant, role: "project_manager" }],
    ["missing sources", { ...managerParticipant, sources: undefined }],
    ["unknown source kind", { ...managerParticipant, sources: [{ kind: "manual", id: "source-a" }] }],
    ["missing source id", { ...managerParticipant, sources: [{ kind: "selection", id: "" }] }],
    ["missing selection", { ...managerParticipant, selection: undefined }],
    ["missing selection id", { ...managerParticipant, selection: { id: "", version: 1 } }],
    ["zero selection version", { ...managerParticipant, selection: { id: "selection-a", version: 0 } }],
    ["fractional selection version", { ...managerParticipant, selection: { id: "selection-a", version: 1.5 } }]
  ])("rejects %s", (_label, participant) => {
    expect(presentChatParticipantPage({ items: [participant], setupWarnings: [] })).toBeNull();
  });

  it("rejects malformed page warnings and option shapes", () => {
    expect(presentChatParticipantPage({ items: [], setupWarnings: [""] })).toBeNull();
    expect(presentChatParticipantPage({ items: [], setupWarnings: [7] })).toBeNull();
    expect(presentChatParticipantOptions({ items: [], hasMore: "yes" })).toBeNull();
    expect(presentChatParticipantOptions({
      items: [{ id: "option-a", name: "Option", role: "unknown" }],
      hasMore: false
    })).toBeNull();
  });
});

describe("mobile chat page merging", () => {
  it("merges duplicate offset pages by stable project ID while preserving first server position", () => {
    const first = conversation("project-a");
    const second = conversation("project-b");
    const updated = conversation("project-a", {
      counts: { ...rawSummary().counts, unread: 9 },
      lastMessageAt: "2026-09-18T10:00:00.000Z"
    });

    const merged = mergeConversationPages([
      { items: [first, second], pagination: { limit: 2, offset: 0, total: 2, hasMore: true } },
      { items: [updated], pagination: { limit: 2, offset: 2, total: 2, hasMore: false } }
    ]);

    expect(merged.map((item) => item.project.id)).toEqual(["project-a", "project-b"]);
    expect(merged[0]).toMatchObject({ counts: { unread: 9 }, lastMessageAt: "2026-09-18T10:00:00.000Z" });
  });

  it("deduplicates cursor pages, retains the newest version, and sorts by authoritative sequence", () => {
    const old = message({ id: "same", sequence: 8, version: 1, body: "Old" });
    const newer = message({ id: "same", sequence: 8, version: 3, body: "Updated" });
    const earlier = message({ id: "earlier", sequence: 2, version: 1 });

    expect(mergeMessagePages([{ items: [old] }, { items: [newer, earlier] }])).toEqual([earlier, newer]);
    expect(mergeMessagePages([{ items: [newer] }, { items: [old] }])).toEqual([newer]);
  });
});

describe("mobile chat grouping and safe reads", () => {
  it("uses stable author IDs when equal display names belong to different people", () => {
    const first = message({ id: "first", author: person("user-a", "Alex"), sequence: 1 });
    const second = message({
      id: "second",
      author: person("user-b", "Alex"),
      sequence: 2,
      createdAt: "2026-09-16T10:01:00.000Z"
    });
    const timeline = buildMessageTimeline([first, second], { currentUserId: "user-b", lastReadSequence: 0 });

    expect(timeline.map((item) => ({
      id: item.message.id,
      own: item.own,
      startsGroup: item.startsGroup,
      showAuthor: item.showAuthor
    }))).toEqual([
      { id: "first", own: false, startsGroup: true, showAuthor: true },
      { id: "second", own: true, startsGroup: true, showAuthor: false }
    ]);
  });

  it("starts new groups at local day and unread boundaries", () => {
    const firstDate = new Date(2026, 8, 16, 23, 59, 0);
    const secondDate = new Date(2026, 8, 17, 0, 1, 0);
    const first = message({ id: "first", sequence: 1, createdAt: firstDate.toISOString() });
    const second = message({ id: "second", sequence: 2, createdAt: secondDate.toISOString() });
    const third = message({
      id: "third",
      sequence: 3,
      createdAt: new Date(2026, 8, 17, 0, 2, 0).toISOString()
    });

    const timeline = buildMessageTimeline([first, second, third], {
      currentUserId: "different-user",
      lastReadSequence: 1
    });

    expect(timeline.map((item) => ({
      id: item.message.id,
      date: item.showDateSeparator,
      unread: item.showUnreadSeparator,
      group: item.startsGroup
    }))).toEqual([
      { id: "first", date: true, unread: false, group: true },
      { id: "second", date: true, unread: true, group: true },
      { id: "third", date: false, unread: false, group: false }
    ]);
  });

  it("allows legitimate sequence gaps after loaded history overlaps the read watermark", () => {
    const read = message({ id: "read", sequence: 2 });
    const gapA = message({ id: "gap-a", sequence: 5 });
    const gapB = message({ id: "gap-b", sequence: 9 });
    expect(selectSafelyReadableMessage({
      messages: [read, gapA, gapB],
      visibleMessageIds: new Set(["gap-a", "gap-b"]),
      lastReadSequence: 2,
      hasOlderHistory: true
    })).toEqual(gapB);
  });

  it("refuses to skip unloaded unread history or an unviewed loaded message", () => {
    const firstLoaded = message({ id: "first-loaded", sequence: 5 });
    const latest = message({ id: "latest", sequence: 9 });
    expect(selectSafelyReadableMessage({
      messages: [firstLoaded, latest],
      visibleMessageIds: new Set(["first-loaded", "latest"]),
      lastReadSequence: 2,
      hasOlderHistory: true
    })).toBeNull();

    const overlap = message({ id: "overlap", sequence: 2 });
    expect(selectSafelyReadableMessage({
      messages: [overlap, firstLoaded, latest],
      visibleMessageIds: new Set(["latest"]),
      lastReadSequence: 2,
      hasOlderHistory: true
    })).toBeNull();
  });

  it("does not acknowledge filtered or inactive timelines", () => {
    const unread = message({ sequence: 3 });
    const input = {
      messages: [unread],
      visibleMessageIds: new Set([unread.id]),
      lastReadSequence: 0,
      hasOlderHistory: false
    };
    expect(selectSafelyReadableMessage({ ...input, filtered: true })).toBeNull();
    expect(selectSafelyReadableMessage({ ...input, active: false })).toBeNull();
  });

  it("does not acknowledge a timeline containing a message from another project", () => {
    const local = message({ id: "local", sequence: 3 });
    const mismatched = message({ id: "foreign", projectId: "project-b", sequence: 4 });
    expect(selectSafelyReadableMessage({
      messages: [local, mismatched],
      visibleMessageIds: new Set(["local", "foreign"]),
      lastReadSequence: 2,
      hasOlderHistory: false,
      projectId: "project-a"
    })).toBeNull();
  });
});

describe("mobile chat display helpers", () => {
  it("derives deterministic project initials and safe activity formatting inputs", () => {
    expect(projectInitials("Courtyard residence")).toBe("CR");
    expect(projectInitials("Villa")).toBe("VI");
    expect(projectInitials("  ")).toBe("");
    const now = new Date(2026, 8, 18, 12, 0, 0);
    expect(conversationActivityInput(new Date(2026, 8, 18, 9, 0, 0).toISOString(), now)?.kind).toBe("time");
    expect(conversationActivityInput(new Date(2026, 8, 17, 23, 0, 0).toISOString(), now)?.kind).toBe("date");
    expect(conversationActivityInput(null, now)).toBeNull();
    expect(conversationActivityInput("not-a-date", now)).toBeNull();
  });

  it("summarizes real conversation counts and omits zero-value badges", () => {
    expect(conversationAccessibilitySummary(conversation("project-a"), "10:30 AM")).toBe(
      "Courtyard residence, active, 5 participants, 4 unread messages, 3 unread mentions, 2 open critical issues, Last activity 10:30 AM"
    );
    expect(conversationAccessibilitySummary(conversation("project-a", {
      counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 },
      participantCount: 1
    }))).toBe("Courtyard residence, active, 1 participant");
  });

  it("summarizes message content, attachment names, issue state, and timestamp", () => {
    const value = message({
      body: "",
      priority: "critical",
      issueStatus: "resolved",
      attachments: [{
        id: "attachment-a",
        filename: "site-photo.jpg",
        mimeType: "image/jpeg",
        byteSize: 120,
        kind: "image",
        preview: null
      }]
    });
    expect(messageAccessibilitySummary(value, "4:10 PM")).toBe(
      "Message from Asha Rao, admin, 1 attachment, site-photo.jpg, critical priority, resolved issue, 4:10 PM"
    );
  });

  it("retains compatible opaque client and upload identities", () => {
    expect(createClientMessageId(1_700_000_000_000, 0.4)).toMatch(/^android-[a-z0-9]+-[a-z0-9]{8,}$/);
    expect(createClientUploadId(1_700_000_000_000, 0.4)).toMatch(/^upload-[a-z0-9]+-[a-z0-9]{8,}$/);
  });
});
