import { afterEach, describe, expect, it } from "vitest";

import {
  capturePasswordResetTokenBeforeRouterMount,
  consumePasswordResetToken,
  releasePasswordResetToken
} from "./passwordResetTokenVault";

const TEST_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";

afterEach(() => {
  window.history.replaceState(null, "", "/");
  capturePasswordResetTokenBeforeRouterMount();
});

describe("passwordResetTokenVault", () => {
  it("captures only an exact fragment after synchronously scrubbing URL data", () => {
    const historyState = { marker: "preserved" };
    window.history.replaceState(
      historyState,
      "",
      `/reset-password?source=email#token=${TEST_TOKEN}`
    );

    capturePasswordResetTokenBeforeRouterMount();

    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe("/reset-password");
    expect(window.history.state).toEqual(historyState);
    const claimant = Symbol("page");
    expect(consumePasswordResetToken(claimant)).toBe(TEST_TOKEN);
    releasePasswordResetToken(claimant);
  });

  it.each([
    ["missing", ""],
    ["wrong key", `#reset=${TEST_TOKEN}`],
    ["short", `#token=${"A".repeat(42)}`],
    ["long", `#token=${"A".repeat(44)}`],
    ["padded", `#token=${"A".repeat(42)}=`],
    ["extra data", `#token=${TEST_TOKEN}&source=email`]
  ])("scrubs a %s fragment without making it consumable", (_case, hash) => {
    window.history.replaceState(null, "", `/reset-password${hash}`);

    capturePasswordResetTokenBeforeRouterMount();

    expect(window.location.href).not.toContain(TEST_TOKEN);
    expect(window.location.hash).toBe("");
    expect(consumePasswordResetToken(Symbol("page"))).toBeNull();
  });

  it("permits only the claiming page's StrictMode replay until commit", () => {
    window.history.replaceState(
      null,
      "",
      `/reset-password#token=${TEST_TOKEN}`
    );
    capturePasswordResetTokenBeforeRouterMount();
    const pageClaimant = Symbol("password-reset-page");

    expect(consumePasswordResetToken(pageClaimant)).toBe(TEST_TOKEN);
    expect(consumePasswordResetToken(pageClaimant)).toBe(TEST_TOKEN);
    expect(consumePasswordResetToken(Symbol("other-page"))).toBeNull();

    releasePasswordResetToken(pageClaimant);
    expect(consumePasswordResetToken(pageClaimant)).toBeNull();
  });

  it("invalidates an unconsumed token on the next navigation capture", () => {
    window.history.replaceState(
      null,
      "",
      `/reset-password#token=${TEST_TOKEN}`
    );
    capturePasswordResetTokenBeforeRouterMount();
    window.history.replaceState(null, "", "/login");

    capturePasswordResetTokenBeforeRouterMount();

    expect(consumePasswordResetToken(Symbol("late-page"))).toBeNull();
  });
});
