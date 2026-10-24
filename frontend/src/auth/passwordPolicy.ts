export const PASSWORD_HINT = "Use at least 12 characters and at most 72 UTF-8 bytes (up to 72 ASCII characters; fewer with accents or emoji).";
export const PASSWORD_TOO_LONG = "Password must be at most 72 UTF-8 bytes. Accented characters and emoji use more than one byte.";

export function newPasswordError(password: string): string | undefined {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (new TextEncoder().encode(password).byteLength > 72) return PASSWORD_TOO_LONG;
  return undefined;
}
