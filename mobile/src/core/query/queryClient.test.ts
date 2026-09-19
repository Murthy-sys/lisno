import { CleanupRegistry } from "../config/cleanupRegistry";
import { ApiError, ApiNetworkError } from "../http/apiClient";
import {
  createMobileQueryClient,
  isQueryRetryable,
  privateQueryKey,
  publicQueryKey,
  registerQueryCleanup
} from "./queryClient";

describe("mobile query scoping", () => {
  const remoteScope = {
    environmentId: "remote:https://api.example.test/api/v1",
    userId: "same-user-id"
  };
  const localScope = {
    environmentId: "local:http://10.0.2.2:3000/api/v1",
    userId: "same-user-id"
  };

  it("keeps identical entity and user IDs isolated by environment", () => {
    expect(privateQueryKey(remoteScope, "projects", "project-1")).toEqual([
      remoteScope.environmentId,
      remoteScope.userId,
      "projects",
      "project-1"
    ]);
    expect(privateQueryKey(localScope, "projects", "project-1")).not.toEqual(
      privateQueryKey(remoteScope, "projects", "project-1")
    );
    expect(publicQueryKey(remoteScope.environmentId, "health")).toEqual([
      remoteScope.environmentId,
      "public",
      "health"
    ]);
  });

  it("rejects private keys without an authenticated user", () => {
    expect(() =>
      privateQueryKey({ ...remoteScope, userId: null }, "projects")
    ).toThrow("authenticated user");
  });

  it("allows one bounded retry only for transient query failures", () => {
    expect(isQueryRetryable(0, new ApiNetworkError(new Error("offline")))).toBe(true);
    expect(isQueryRetryable(1, new ApiNetworkError(new Error("offline")))).toBe(false);
    expect(isQueryRetryable(0, new ApiError(503, "DOWN", "Unavailable"))).toBe(true);
    expect(isQueryRetryable(0, new ApiError(403, "DENIED", "Denied"))).toBe(false);
  });

  it("cancels and clears cached private data during coordinated cleanup", async () => {
    const queryClient = createMobileQueryClient();
    const cleanups = new CleanupRegistry();
    registerQueryCleanup(queryClient, cleanups);
    queryClient.setQueryData(
      privateQueryKey(remoteScope, "projects", "project-1"),
      { id: "project-1" }
    );

    await cleanups.run({
      reason: "logout",
      generation: 1,
      fromEnvironment: {
        profile: "remote",
        id: remoteScope.environmentId,
        apiBaseUrl: "https://api.example.test/api/v1",
        origin: "https://api.example.test",
        host: "api.example.test",
        isLocal: false
      }
    });

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
