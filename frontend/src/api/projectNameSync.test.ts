import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateProjectNameQueries } from "./projectNameSync";

describe("canonical project name synchronization", () => {
  it("marks live project presentations stale without rewriting records or unrelated detail", async () => {
    const client = new QueryClient();
    const affected = [
      ["admin-projects", "page", { limit: 20, offset: 0 }],
      ["admin-projects", "detail", "courtyard"],
      ["super-admin-dashboard", "projects", 30],
      ["client", "projects"],
      ["designer", "projects", "courtyard"],
      ["project-finance", "projects"],
      ["project-finance", "bucket", "courtyard"],
      ["project-workflow", "design-workflow", "courtyard"],
      ["management", "project", "courtyard"],
      ["access-requests", "review"]
    ];
    const unaffected = [
      ["admin-projects", "detail", "garden"],
      ["project-finance", "bucket", "garden"],
      ["project-finance", "entries", "courtyard"],
      ["leads", "lead-a", "estimate"],
      ["project-chat", "another-session", "courtyard"]
    ];
    for (const key of [...affected, ...unaffected]) client.setQueryData(key, { name: "Recorded name" });
    await invalidateProjectNameQueries(client, "courtyard");
    for (const key of affected) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of unaffected) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    for (const key of [...affected, ...unaffected]) expect(client.getQueryData(key)).toEqual({ name: "Recorded name" });
    client.clear();
  });
});
