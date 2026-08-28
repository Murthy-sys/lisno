import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import {
  completePasswordReset,
  inspectPasswordReset,
  requestPasswordReset
} from "./passwordResetApi";

const TEST_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const PUBLIC_OPTIONS = {
  cache: "no-store",
  referrerPolicy: "no-referrer"
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("passwordResetApi", () => {
  it("requests reset instructions through the isolated no-store public client", async () => {
    const postPublic = vi
      .spyOn(apiClient, "postPublic")
      .mockResolvedValue({ accepted: true });

    await expect(requestPasswordReset("person@example.com")).resolves.toEqual({
      accepted: true
    });
    expect(postPublic).toHaveBeenCalledWith(
      "/auth/password-reset/request",
      { email: "person@example.com" },
      PUBLIC_OPTIONS
    );
  });

  it("inspects a reset through the isolated no-store public client", async () => {
    const postPublic = vi
      .spyOn(apiClient, "postPublic")
      .mockResolvedValue({ available: true });

    await expect(inspectPasswordReset(TEST_TOKEN)).resolves.toEqual({
      available: true
    });
    expect(postPublic).toHaveBeenCalledWith(
      "/auth/password-reset/inspect",
      { token: TEST_TOKEN },
      PUBLIC_OPTIONS
    );
  });

  it("completes a reset without using the authenticated API path", async () => {
    const postPublic = vi
      .spyOn(apiClient, "postPublic")
      .mockResolvedValue({ reset: true });

    await expect(
      completePasswordReset({
        token: TEST_TOKEN,
        password: "StrongPassword123!",
        passwordConfirmation: "StrongPassword123!"
      })
    ).resolves.toEqual({ reset: true });
    expect(postPublic).toHaveBeenCalledWith(
      "/auth/password-reset/complete",
      {
        token: TEST_TOKEN,
        password: "StrongPassword123!",
        passwordConfirmation: "StrongPassword123!"
      },
      PUBLIC_OPTIONS
    );
  });
});
