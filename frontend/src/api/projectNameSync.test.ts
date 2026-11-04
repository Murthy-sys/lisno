import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateProjectNameQueries } from "./projectNameSync";

describe("canonical project name and number synchronization", () => {
  it("marks live project presentations stale without rewriting records or unrelated detail", async () => {
    const client = new QueryClient();
    const affected = [
      ["admin-projects", "page", { limit: 20, offset: 0 }],
      ["admin-projects", "detail", "courtyard"],
      ["super-admin-dashboard", "projects", 30],
      ["client", "projects"],
      ["designer", "projects", "courtyard"],
      ["assigned-projects", "list", "procurement-one", "procurement"],
      ["assigned-projects", "list", "manager-two", "site_manager"],
      ["assigned-projects", "detail", "courtyard", "procurement-one", "procurement"],
      ["assigned-projects", "detail", "courtyard", "manager-two", "site_manager"],
      ["project-finance", "projects"],
      ["project-finance", "bucket", "courtyard"],
      ["project-workflow", "design-workflow", "courtyard"],
      ["management", "project", "courtyard"],
      ["access-requests", "review"],
      ["quotation", "courtyard", "detail"],
      ["estimate-tiers", "courtyard"],
      ["procurement", "projects"],
      ["procurement", "suggestion-projects", { q: "", offset: 0 }],
      ["procurement", "vendor-suggestions", "courtyard"],
      ["project-manager", "pm-a", "/project-manager/projects?status=current"],
      ["project-manager", "pm-a", "/projects/courtyard/pm/overview"],
      ["project-manager", "estimations", "pm-a", "courtyard", "view"],
      ["execution", "projects", {}],
      ["execution", "project", "courtyard", {}],
      ["execution", "mine", {}],
      ["project-chat", "session-a", "project", "courtyard", "summary"],
      ["project-chat", "session-a", "conversations"]
    ];
    const unaffected = [
      ["admin-projects", "detail", "garden"],
      ["assigned-projects", "detail", "garden", "procurement-one", "procurement"],
      ["assigned-projects", "detail", "garden", "manager-two", "site_manager"],
      ["project-finance", "bucket", "garden"],
      ["project-finance", "entries", "courtyard"],
      ["leads", "lead-a", "estimate"],
      ["project-chat", "another-session", "courtyard"],
      ["quotation", "garden", "detail"],
      ["quotation", "courtyard", "items", "", 0],
      ["project-chat", "session-a", "project", "courtyard", "messages", "all"],
      ["project-chat", "session-a", "project", "garden", "summary"],
      ["project-manager", "estimations", "pm-a", "garden", "view"],
      ["project-manager", "pm-a", "/projects/garden/pm/overview"],
      ["execution", "project", "garden", {}],
      ["execution", "history", "work-courtyard", {}]
    ];
    for (const key of [...affected, ...unaffected]) client.setQueryData(key, { name: "Recorded name" });
    await invalidateProjectNameQueries(client, "courtyard");
    for (const key of affected) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of unaffected) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    for (const key of [...affected, ...unaffected]) expect(client.getQueryData(key)).toEqual({ name: "Recorded name" });
    client.clear();
  });
});
