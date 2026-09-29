const ROUTE = "/vendor-induction";
const TOKEN_PATTERN = /^#token=([A-Za-z0-9_-]{43})$/;

let pendingToken: string | null = null;
let claimedBy: symbol | null = null;
let claimedToken: string | null = null;

/** Capture and scrub the emailed fragment before the router and analytics mount. */
export function captureVendorInductionTokenBeforeRouterMount() {
  pendingToken = null;
  claimedBy = null;
  claimedToken = null;
  if (window.location.pathname !== ROUTE) return;
  const token = TOKEN_PATTERN.exec(window.location.hash)?.[1] ?? null;
  window.history.replaceState(window.history.state, "", ROUTE);
  pendingToken = token;
}

export function consumeVendorInductionToken(claimant: symbol) {
  if (claimedBy) return claimedBy === claimant ? claimedToken : null;
  if (!pendingToken) return null;
  claimedBy = claimant;
  claimedToken = pendingToken;
  pendingToken = null;
  return claimedToken;
}

export function releaseVendorInductionToken(claimant: symbol) {
  if (claimedBy === claimant) {
    claimedBy = null;
    claimedToken = null;
  }
}
