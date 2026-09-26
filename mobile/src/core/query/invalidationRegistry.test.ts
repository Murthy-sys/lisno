import { QueryClient } from "@tanstack/react-query";

import {
  invalidationFamilies,
  invalidationPrefixes,
  purgeFamilies,
  scopedQueryPrefix
} from "./invalidationRegistry";
import { applyInvalidationEvent } from "./applyInvalidation";

const scope = {
  environmentId: "remote:https://api.example.test/api/v1",
  userId: "user-1"
};

describe("cross-feature invalidation registry", () => {
  it("scopes every key to environment and user", () => {
    expect(scopedQueryPrefix(scope, "projects")).toEqual([
      scope.environmentId,
      scope.userId,
      "projects"
    ]);
    expect(() => scopedQueryPrefix({ ...scope, userId: null }, "projects")).toThrow(
      "authenticated user"
    );
  });

  it("refreshes finance and project views after operational work", () => {
    expect(invalidationFamilies("operational-task-changed")).toEqual(
      expect.arrayContaining([
        "operations",
        "tasks",
        "projects",
        "finance-buckets",
        "finance-portfolio",
        "dashboard"
      ])
    );
  });

  it("refreshes project design documents after a plan review decision", () => {
    expect(invalidationFamilies("plan-review-changed")).toEqual(
      expect.arrayContaining(["plan-review", "design", "estimates", "workflow", "projects"])
    );
  });

  it("classifies access-sensitive feature data for removal", () => {
    expect(invalidationFamilies("access-changed")).toEqual(
      expect.arrayContaining([
        "access-self",
        "access-review",
        "projects",
        "workflow",
        "design",
        "procurement",
        "finance-buckets",
        "chat"
      ])
    );
    expect(invalidationPrefixes(scope, "access-changed")[0]?.slice(0, 2)).toEqual([
      scope.environmentId,
      scope.userId
    ]);
    expect(purgeFamilies("access-changed")).toEqual(
      expect.arrayContaining(["projects", "workflow", "design", "finance-ledger", "chat", "notifications"])
    );
    expect(purgeFamilies("access-changed")).not.toContain("access-self");
  });

  it("cancels and removes protected cache data on access changes", async () => {
    const client = new QueryClient();
    const projectKey = [...scopedQueryPrefix(scope, "projects"), "detail", "project-1"];
    const chatKey = [...scopedQueryPrefix(scope, "chat"), "project-1"];
    const accessKey = [...scopedQueryPrefix(scope, "access-self"), "list"];
    client.setQueryData(projectKey, { private: "project" });
    client.setQueryData(chatKey, { private: "chat" });
    client.setQueryData(accessKey, { status: "approved" });

    await applyInvalidationEvent(client, scope, "access-changed");

    expect(client.getQueryData(projectKey)).toBeUndefined();
    expect(client.getQueryData(chatKey)).toBeUndefined();
    expect(client.getQueryData(accessKey)).toEqual({ status: "approved" });
    expect(client.getQueryState(accessKey)?.isInvalidated).toBe(true);
    client.clear();
  });

  it("keeps knowledge and procurement consumers coherent", () => {
    expect(invalidationFamilies("knowledge-changed")).toEqual([
      "knowledge",
      "knowledge-context",
      "procurement",
      "vendors",
      "vendor-suggestions"
    ]);
  });
});
