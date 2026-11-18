/** Display only: stored selling rates and line amounts remain exclusive of GST. */
export function estimatePriceIncludingGst(netPaise: number | null | undefined): number | null {
  if (typeof netPaise !== "number" || !Number.isSafeInteger(netPaise) || netPaise < 0) return null;
  const net = BigInt(netPaise);
  const gross = net + (net * 18n + 50n) / 100n;
  return gross <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(gross) : null;
}
