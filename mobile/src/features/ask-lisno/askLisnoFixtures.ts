import type { AskLisnoResponse } from "./askLisnoApi";

/** Synthetic examples shared only by the feature's regression tests. */
export function answerFixture(projectId: string | null = "project-a"): AskLisnoResponse {
  return {
    projectId, checkedAt: "2026-10-15T08:00:00.000Z",
    resolution: { state: projectId ? "resolved" : "account", project: projectId ? { id: projectId, name: "Lake House" } : null, question: null, choices: [] },
    answer: { disclosurePolicy: "project-publication-v1", kind: "status", narrative: [{ text: "Your design is in progress.", factIds: ["fact-stage"] }], facts: [{ id: "fact-stage", label: "Stage", value: "Design", source: { id: projectId ?? "account", label: "Project status", href: null } }], candidates: [], missingInputs: [], commercial: null }
  };
}
export function directoryFixture(offset = 0): AskLisnoResponse {
  return { ...answerFixture(null), projectList: { offset, nextOffset: offset === 0 ? 20 : null, version: "a".repeat(64), items: [{ id: offset ? "project-b" : "project-a", name: offset ? "Courtyard" : "Lake House", detail: null }] } };
}
export function summaryFixture(projectId: string) {
  return { project: { id: projectId, name: "Lake House", status: "active" }, counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 }, participantCount: 2, cursor: "cursor", lastReadSequence: 0, latestMessageSequence: 0, capabilities: { canSend: true, canManageParticipants: false, canManageIssues: false }, setupWarnings: [] };
}
