import type { AssistantCounter, AssistantReceipt, AssistantRun, AssistantStoredResult, AssistantTransactions } from "./project-assistant.js";
export interface MemoryAssistantState {
  runs: AssistantRun[]; results: AssistantStoredResult[]; receipts: AssistantReceipt[]; counters: AssistantCounter[];
}
export const createMemoryAssistantState = (): MemoryAssistantState => ({runs: [], results: [], receipts: [], counters: []});
const copy = <T>(value: T): T => structuredClone(value);
export function createMemoryAssistantOperations(state: MemoryAssistantState): AssistantTransactions {
  const put = <T extends {id: string}>(rows: T[], row: T) => { const i = rows.findIndex(r => r.id === row.id); if (i < 0) rows.push(copy(row)); else rows[i] = copy(row); };
  return {
    async run(id) { return copy(state.runs.find(r => r.id === id) ?? null); },
    async latestRun(projectId, messageId) { return copy(state.runs.filter(r => r.projectId === projectId && r.messageId === messageId).sort((a,b) => b.generation - a.generation)[0] ?? null); },
    async projectRuns(projectId) { return copy(state.runs.filter(r => r.projectId === projectId && ["ready", "waiting_for_human", "leased"].includes(r.status))); },
    async dueRuns(now, limit) { return copy(state.runs.filter(r => (["ready", "waiting_for_human"].includes(r.status) && r.eligibleAt <= now) || (r.status === "leased" && r.leaseUntil! <= now)).sort((a,b) => a.eligibleAt.localeCompare(b.eligibleAt) || a.id.localeCompare(b.id)).slice(0, limit)); },
    async waitingRuns(limit) { return copy(state.runs.filter(r => r.status === "waiting_for_human").sort((a,b) => a.eligibleAt.localeCompare(b.eligibleAt) || a.id.localeCompare(b.id)).slice(0, limit)); },
    async saveRun(row) { put(state.runs, row); },
    async result(projectId, id) { return copy(state.results.find(r => r.projectId === projectId && r.id === id) ?? null); },
    async saveResult(row) { if (state.results.some(r => r.id === row.id || r.runId === row.runId)) throw new Error("ASSISTANT_RESULT_CONFLICT"); state.results.push(copy(row)); },
    async receipt(id) { return copy(state.receipts.find(r => r.id === id) ?? null); },
    async saveReceipt(row) { put(state.receipts, row); },
    async counter(id) { return copy(state.counters.find(r => r.id === id) ?? null); },
    async saveCounter(row) { put(state.counters, row); }
  };
}
