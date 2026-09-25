let sequence = 0;

/** Stable client row identity only; never used for credentials or authorization. */
export function knowledgeRowId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  sequence += 1;
  return `row-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
