import { loginSchema, newPasswordSchema } from "./validation";

describe("authentication validation", () => {
  it("normalizes a valid sign-in email without weakening passwords", () => {
    expect(loginSchema.parse({ email: "  user@example.com ", password: "secret" })).toEqual({
      email: "user@example.com",
      password: "secret"
    });
  });

  it("requires long matching replacement passwords", () => {
    expect(newPasswordSchema.safeParse({ password: "too-short", passwordConfirmation: "too-short" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "a secure passphrase", passwordConfirmation: "different pass" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "a secure passphrase", passwordConfirmation: "a secure passphrase" }).success).toBe(true);
  });
});
