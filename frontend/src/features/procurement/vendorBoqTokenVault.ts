const ROUTE = "/vendor-boq";
const TOKEN_PATTERN = /^#token=([A-Za-z0-9_-]{43})$/;

let pendingToken: string | null = null;
let claimedBy: symbol | null = null;
let claimedToken: string | null = null;

/** Remove the emailed bearer token from browser history before the router mounts. */
export function captureVendorBoqTokenBeforeRouterMount() {
  pendingToken = null;
  claimedBy = null;
  claimedToken = null;
  if (window.location.pathname !== ROUTE) return;
  const token = TOKEN_PATTERN.exec(window.location.hash)?.[1] ?? null;
  window.history.replaceState(window.history.state, "", ROUTE);
  pendingToken = token;
}

export function consumeVendorBoqToken(claimant: symbol) {
  if (claimedBy) return claimedBy === claimant ? claimedToken : null;
  if (!pendingToken) return null;
  claimedBy = claimant;
  claimedToken = pendingToken;
  pendingToken = null;
  return claimedToken;
}

export function releaseVendorBoqToken(claimant: symbol) {
  if (claimedBy === claimant) {
    claimedBy = null;
    claimedToken = null;
  }
}
