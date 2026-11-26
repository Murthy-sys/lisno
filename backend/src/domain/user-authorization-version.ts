/** Profile-only writes still advance CAS without revoking previously issued authority. */
export function userAuthorizationVersion(user: { version?: number; profileVersionOffset?: number }): number {
  const version = user.version ?? 1;
  const offset = user.profileVersionOffset ?? 0;
  if (!Number.isSafeInteger(version) || version < 1 || !Number.isSafeInteger(offset) || offset < 0 || offset >= version) {
    throw new Error("User authorization version is invalid.");
  }
  return version - offset;
}
