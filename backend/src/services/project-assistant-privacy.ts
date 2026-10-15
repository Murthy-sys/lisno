import type { AssistantFact, AssistantFactBundle } from "../contracts/project-chat-assistant.js";
import type { AssistantSafeToolResult } from "../contracts/assistant-step.js";
import { createProjectDesignWorkflow } from "../domain/design-workflow.js";

type SafeFact = Extract<AssistantSafeToolResult, { tool: "project_status" }>["result"]["facts"][number];
const stages = new Set([...createProjectDesignWorkflow("").map(stage => stage.name), "Estimate preparation", "Internal estimate review", "Estimate submission", "Estimate approval", "Initial-payment confirmation", "Project execution", "Purchase order", "Vendor work", "Client work review", "Site completion", "Site execution", "Client completion review", "Final project completion", "Project status", "Current stage unavailable."]);
const states = new Set(["active", "paused", "completed", "scheduled", "planning", "cancelled", "pending", "in_progress", "on_hold"]);
const workStates = new Set(["Client accepted.", "Client requested changes; work needs correction and Site Manager verification.", "Client completion review needs verification by the project team.", "Site verified; awaiting Client acceptance.", "Vendor submitted completion; Site Manager verification is pending.", "Vendor reported a blocker; team follow-up is required.", "Work has been issued; completion is not yet verified.", "Work source needs review by the project team.", "Execution sources need review by the project team.", "No current issued work details are available.", "Additional issued work exists; ask the project team for the complete execution view."]);
const iso = "\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z)?";
const schedule = new RegExp(`^(${iso}) to (${iso}); (awaiting confirmation\\.|confirmed work dates, not a project handover commitment\\.)$`, "u");
const validDate = (value: string) => Number.isFinite(new Date(value).getTime());
const privacyText = (value: string) => value.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\p{Cc}/gu, character => /\s/u.test(character) ? " " : "");

/** Every forwarded word comes from an enumerated state or validated percentage/date. */
export function projectAssistantSafeFacts(bundle: AssistantFactBundle, channel: "project_status" | "project_execution" | "client_profile", alias: () => string): { wire: SafeFact[]; facts: AssistantFact[] } {
  const wire: SafeFact[] = [], facts: AssistantFact[] = [];
  const add = (original: AssistantFact, kind: SafeFact["kind"], label: string, value: string) => {
    const id = alias(); wire.push({ id, kind, text: `${label}: ${value}` });
    facts.push({ id: original.id, label, value, source: { id: original.source.id, label: channel === "project_status" ? "Project status" : channel === "project_execution" ? "Project execution" : "Account help", href: null } });
  };
  for (const row of bundle.facts) {
    if (wire.length >= 20) break;
    if (channel === "project_status") {
      if (row.id === "project-status" && states.has(row.value)) add(row, "project_stage", "Project status", row.value);
      else if (row.id === "project-stage" && stages.has(row.value)) add(row, "project_stage", "Current stage", row.value);
      else if (row.id === "project-issue") add(row, "project_stage", "Status limitation", "Status needs review by the project team.");
      else if (row.id.startsWith("action-") && stages.has(row.label)) {
        const state = / Status: (pending|scheduled|blocked|unassigned)\. Responsible: /u.exec(row.value)?.[1];
        if (state) add(row, "task_state", row.label, `Action ${state}.`);
      } else if (/^(?:scheduled|deadline)-/u.test(row.id)) {
        const value = row.value.split(";")[0]!;
        if (new RegExp(`^${iso}$`, "u").test(value) && validDate(value)) add(row, "schedule", row.id.startsWith("deadline-") ? "Action deadline" : "Scheduled action", `${value}; not a final project handover promise.`);
      }
    } else if (channel === "project_execution") {
      if (workStates.has(row.value)) add(row, "task_state", "Work status", row.value);
      else if (/^(?:100|[0-9]{1,2})% reported; this is not a Client acceptance\.$/u.test(row.value)) add(row, "progress", "Vendor reported progress", row.value);
      else {
        const match = schedule.exec(row.value);
        if (match && validDate(match[1]!) && validDate(match[2]!)) add(row, "schedule", match[3]!.startsWith("awaiting") ? "Proposed schedule" : "Confirmed schedule", row.value);
      }
    } else if (["support-navigation", "account-navigation", "support:projects", "support:team", "support:select-project"].includes(row.id)) {
      add(row, "help", "Account help", row.id === "support:projects" ? "Open My projects to view projects linked to your account." : row.id === "support:select-project" ? "Choose a project to ask about its current details." : "Open your account profile to review your details, or contact the project team through Project messages.");
    }
  }
  return { wire, facts };
}

/** Unsupported sensitive/document content never enters the model channel. */
export function assistantMessageNeedsPrivacyStop(value: string): boolean {
  const pastedDocument = value.split(/\r?\n/u).length > 12;
  const variants = [privacyText(value), value.normalize("NFKC").replace(/[\p{Cf}\p{Cc}]/gu, "")];
  return pastedDocument || variants.some(value => /\b(?:password|passcode|secret|tokens?|api[ _-]?keys?|credentials?|private[ _-]?keys?|authorization|bearer|salary|salaries|payroll|profit|margins?|internal (?:notes?|costs?|prices?|pricing|margins?|configuration|company)|(?:vendor|supplier|procurement) (?:rates?|costs?|prices?|contact)|configured (?:prices?|rates?)|configuration|database|bank|account number|routing number|ifsc|aadhaar|aadhar|pan number|credit card|debit card|home address|postal address|street address|my address|my name is|full name|named|mr\.?|mrs\.?|ms\.?)\b/iu.test(value)
    || /\b(?:my|the|our)\s+(?:address|ssn|pin)\s+(?:is|:)\b/iu.test(value)
    || /\b(?:select\s+.+\s+from|insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+table)\b/isu.test(value)
    || /```|[{}]|-----BEGIN|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u.test(value));
}

/** Data minimization for untrusted Client text. This is not a general-purpose PII detector. */
export function redactAssistantMessage(value: string, sensitiveAliases: readonly string[] = []): string {
  let result = privacyText(value);
  for (const name of [...sensitiveAliases].map(privacyText).filter(name => name.trim().length > 1).sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu"), "[private name]");
  }
  return result
    .replace(/\b(?:bearer\s+\S+|(?:api[_ -]?key|password|secret|token)\s*[:=]\s*\S+)/giu, "[private credential]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[private contact]")
    .replace(/(?:https?:\/\/|www\.)\S+/giu, "[private link]")
    .replace(/\b[0-9a-f]{24}\b|\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/giu, "[private identifier]")
    .replace(/(?:[₹$€£¥]\s*|\b(?:rs\.?|inr|usd|rupees?)\s*)\d[\d,.]*(?:\s*(?:lakh|crore|million|thousand|k|m))?/giu, "[private amount]")
    .replace(/\b\d[\d,.]*\s*(?:rupees?|paise|inr|usd|lakh|crore|lakhs|crores)\b/giu, "[private amount]")
    .replace(/(?<!\d)(?:\+\d[\d ()-]{8,}\d|\d{10,})(?!\d)/gu, "[private contact]")
    .replace(/\b\d+(?:[,.]\d+)*\b/gu, "[private value]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, " ").trim() || "[private message]";
}
