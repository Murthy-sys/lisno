const RESET_ROUTE = "/reset-password";
const TOKEN_FRAGMENT_PATTERN = /^#token=([A-Za-z0-9_-]{43})$/;

interface TokenLease {
  claimant: symbol;
  token: string;
}

let pendingToken: string | null = null;
let activeLease: TokenLease | null = null;

/**
 * Runs at the application bootstrap boundary, before React or BrowserRouter mount.
 * Every invocation invalidates an older handoff so tokens cannot cross navigations
 * or test mounts. Only an exact reset-route fragment is retained after the browser
 * URL has been synchronously scrubbed.
 */
export function capturePasswordResetTokenBeforeRouterMount(): void {
  pendingToken = null;
  activeLease = null;

  if (window.location.pathname !== RESET_ROUTE) return;

  const token = TOKEN_FRAGMENT_PATTERN.exec(window.location.hash)?.[1] ?? null;
  window.history.replaceState(window.history.state, "", RESET_ROUTE);

  if (token) pendingToken = token;
}

/**
 * Claims the bootstrap handoff for one page. React StrictMode may replay the
 * initial render before committing it, so the same module-local claimant can read
 * its lease again until the committed page releases the vault. Other claimants
 * cannot observe it.
 */
export function consumePasswordResetToken(claimant: symbol): string | null {
  if (activeLease) {
    return activeLease.claimant === claimant ? activeLease.token : null;
  }
  if (!pendingToken) return null;

  const token = pendingToken;
  pendingToken = null;
  activeLease = { claimant, token };
  return token;
}

export function releasePasswordResetToken(claimant: symbol): void {
  if (activeLease?.claimant === claimant) activeLease = null;
}
