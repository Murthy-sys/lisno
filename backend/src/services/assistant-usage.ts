import { createHash } from "node:crypto";
import { ASSISTANT_DEFAULTS as limits, AssistantFailure } from "../domain/project-chat-assistant.js";
import type { AssistantTransactions } from "../repositories/project-assistant.js";

// Both entry points consume the same process slots and durable quota buckets.
let activeCalls = 0;
export function acquireAssistantSlot(): (() => void) | null {
  if (activeCalls >= limits.concurrency) return null;
  activeCalls++;
  let released = false;
  return () => { if (!released) { released = true; activeCalls--; } };
}
export async function admitAssistant(a: AssistantTransactions, input: {clientId: string; projectId: string | null; now: string; clientPerHour?: number; projectPerHour?: number; deploymentPerDay?: number}): Promise<boolean> {
  const buckets = [
    {id: `admission:client:${input.clientId}:${input.now.slice(0,13)}`, limit: input.clientPerHour ?? limits.clientPerHour},
    ...(input.projectId ? [{id: `admission:project:${input.projectId}:${input.now.slice(0,13)}`, limit: input.projectPerHour ?? limits.projectPerHour}] : []),
    {id: `admission:deployment:${input.now.slice(0,10)}`, limit: input.deploymentPerDay ?? limits.deploymentPerDay}
  ];
  const counters = [];
  for (const bucket of buckets) counters.push({...bucket, value: (await a.counter(bucket.id))?.value ?? 0});
  if (counters.some(bucket => bucket.value >= bucket.limit)) return false;
  for (const bucket of counters) await a.saveCounter({id: bucket.id, value: bucket.value + 1, updatedAt: input.now});
  return true;
}
/** Late project resolution adds only the project bucket; Client/deployment admission already happened. */
export async function admitAssistantProject(a: AssistantTransactions, input: {projectId: string; now: string; projectPerHour?: number}): Promise<boolean> {
  const id = `admission:project:${input.projectId}:${input.now.slice(0,13)}`;
  const value = (await a.counter(id))?.value ?? 0;
  if (value >= (input.projectPerHour ?? limits.projectPerHour)) return false;
  await a.saveCounter({id, value: value + 1, updatedAt: input.now});
  return true;
}
export async function reserveAssistantTokens(a: AssistantTransactions, input: {requestId: string; attempt: number; projectId: string | null; bytes: number; now: string; tokensPerDay?: number}): Promise<string> {
  if (!Number.isSafeInteger(input.bytes) || input.bytes < 0 || input.bytes > limits.maxPayloadBytes) throw new AssistantFailure("ASSISTANT_CONTEXT_LIMIT");
  const bucket = `tokens:${input.now.slice(0,10)}`, counter = await a.counter(bucket), amount = input.bytes + limits.maxOutputTokens;
  if ((counter?.value ?? 0) + amount > (input.tokensPerDay ?? limits.tokensPerDay)) throw new AssistantFailure("ASSISTANT_TOKEN_LIMIT");
  const id = createHash("sha256").update(JSON.stringify(["usage", input.requestId, input.attempt])).digest("hex");
  const previous = await a.receipt(id);
  if (previous) return id;
  await a.saveCounter({id: bucket, value: (counter?.value ?? 0) + amount, updatedAt: input.now});
  await a.saveReceipt({id, kind: "usage", projectId: input.projectId, runId: input.requestId, createdAt: input.now, fingerprint: bucket, amount, settled: false});
  return id;
}
export async function settleAssistantTokens(a: AssistantTransactions, id: string, usage: {inputTokens: number; outputTokens: number} | null, now: string): Promise<void> {
  const receipt = await a.receipt(id);
  if (!receipt || receipt.kind !== "usage" || receipt.settled || !usage) return;
  const total = usage.inputTokens + usage.outputTokens;
  if (!Number.isSafeInteger(total) || total < 0) return;
  const counter = await a.counter(receipt.fingerprint); if (!counter) return;
  await a.saveCounter({...counter, value: Math.max(0, counter.value - receipt.amount + total), updatedAt: now});
  await a.saveReceipt({...receipt, amount: total, settled: true});
}
