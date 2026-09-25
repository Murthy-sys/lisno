import { partialMatchKey } from "@tanstack/react-query";

import { chatQueryKeys, normalizeConversationSearch } from "./chatQueryKeys";

const remote = { environmentId: "remote", userId: "user-a" };
const local = { environmentId: "local", userId: "user-a" };

describe("mobile chat query keys", () => {
  it("scopes every private family by environment, user, and stable project ID", () => {
    expect(chatQueryKeys.conversations(remote)).toEqual(["remote", "user-a", "chat", "conversations"]);
    expect(chatQueryKeys.project(remote, "project-a")).toEqual(["remote", "user-a", "chat", "project", "project-a"]);
    expect(chatQueryKeys.summary(remote, "project-a")).toEqual([
      "remote", "user-a", "chat", "project", "project-a", "summary"
    ]);
    expect(chatQueryKeys.messages(remote, "project-a")).toEqual([
      "remote", "user-a", "chat", "project", "project-a", "messages"
    ]);
    expect(chatQueryKeys.participants(remote, "project-a")).toEqual([
      "remote", "user-a", "chat", "project", "project-a", "participants"
    ]);
    expect(chatQueryKeys.participantOptions(remote, "project-a", "  Asha & team  ")).toEqual([
      "remote", "user-a", "chat", "project", "project-a", "participant-options", "Asha & team"
    ]);
  });

  it("isolates different environments and users", () => {
    expect(chatQueryKeys.messages(local, "project-a")).not.toEqual(chatQueryKeys.messages(remote, "project-a"));
    expect(chatQueryKeys.messages({ ...remote, userId: "user-b" }, "project-a")).not.toEqual(
      chatQueryKeys.messages(remote, "project-a")
    );
    expect(chatQueryKeys.participants(local, "project-a")).not.toEqual(
      chatQueryKeys.participants(remote, "project-a")
    );
    expect(chatQueryKeys.participantOptions({ ...remote, userId: "user-b" }, "project-a", "asha")).not.toEqual(
      chatQueryKeys.participantOptions(remote, "project-a", "asha")
    );
    expect(chatQueryKeys.participants(remote, "project-b")).not.toEqual(
      chatQueryKeys.participants(remote, "project-a")
    );
    expect(chatQueryKeys.participantOptions(remote, "project-a", "asha")).not.toEqual(
      chatQueryKeys.participantOptions(remote, "project-a", "dev")
    );
  });

  it("provides project and family prefixes for targeted invalidation", () => {
    expect(chatQueryKeys.all(remote)).toEqual(["remote", "user-a", "chat"]);
    expect(chatQueryKeys.project(remote, "project-a")).toEqual(
      chatQueryKeys.summary(remote, "project-a").slice(0, -1)
    );
    expect(chatQueryKeys.project(remote, "project-a")).toEqual(
      chatQueryKeys.participants(remote, "project-a").slice(0, -1)
    );
    expect(chatQueryKeys.project(remote, "project-a")).toEqual(
      chatQueryKeys.participantOptions(remote, "project-a", "Asha").slice(0, -2)
    );
  });

  it("keys each filtered and searched conversation list under the invalidation prefix", () => {
    const unread = chatQueryKeys.conversations(remote, { filter: "unread", search: "  Villa  " });
    expect(unread).toEqual(["remote", "user-a", "chat", "conversations", "unread", "Villa"]);
    expect(chatQueryKeys.conversations(remote, { filter: "all", search: "" })).toEqual([
      "remote", "user-a", "chat", "conversations", "all", ""
    ]);
    expect(unread).not.toEqual(chatQueryKeys.conversations(remote, { filter: "critical", search: "Villa" }));
    expect(unread).not.toEqual(chatQueryKeys.conversations(remote, { filter: "unread", search: "Court" }));
    expect(partialMatchKey(unread, chatQueryKeys.conversations(remote))).toBe(true);
    expect(partialMatchKey(unread, chatQueryKeys.all(remote))).toBe(true);
    expect(partialMatchKey(unread, chatQueryKeys.conversations(local))).toBe(false);
  });

  it("bounds conversation search to the server limit", () => {
    expect(normalizeConversationSearch(`  ${"a".repeat(120)}  `)).toHaveLength(100);
    expect(normalizeConversationSearch("   ")).toBe("");
  });

  it("rejects unauthenticated private keys", () => {
    expect(() => chatQueryKeys.conversations({ environmentId: "remote", userId: null })).toThrow(
      "Private query keys require an authenticated user."
    );
  });
});
