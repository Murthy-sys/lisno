import { describe, expect, it } from "vitest";
import { newPasswordError, PASSWORD_TOO_LONG } from "./passwordPolicy";

describe("new password policy", () => {
  it.each(["a".repeat(12), "a".repeat(72), "é".repeat(36), "🙂".repeat(18), "\ud800".repeat(24)])("accepts the character/UTF-8 boundary %j", password => {
    expect(newPasswordError(password)).toBeUndefined();
  });
  it.each(["a".repeat(73), "é".repeat(37), "🙂".repeat(19), "\ud800".repeat(25)])("rejects oversized UTF-8 passwords %j", password => {
    expect(newPasswordError(password)).toBe(PASSWORD_TOO_LONG);
  });
  it("retains the minimum character count", () => {
    expect(newPasswordError("a".repeat(11))).toBe("Password must be at least 12 characters.");
  });
});
