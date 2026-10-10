import { describe, expect, it } from "vitest";
import type { AssistantFact } from "../src/contracts/project-chat-assistant.js";
import { validateAssistantNarrative } from "../src/services/project-assistant-narrative.js";

const fact = (id: string, value: string, label = "Latest update"): AssistantFact => ({id, label, value, source: {id: "synthetic-project", label: "Project", href: null}});
const paragraph = (text: string, factIds = ["status"]) => [{text, factIds}];

describe("grounded conversational assistant narrative", () => {
  it.each([
    "Hello! How can I help with your project?",
    "Hello! How can I help you today?",
    "Hi! How can I help you with your project today?",
    "You're welcome!",
    "I'm sorry this has been frustrating. What would you most like to get clarity on?",
    "Could you tell me what you'd like to confirm?",
    "Thanks for clarifying. Let me answer the question you meant."
  ])("allows source-free social wording without manufacturing a project fact: %s", text => {
    expect(validateAssistantNarrative(paragraph(text, []), [])).toEqual(paragraph(text, []));
  });
  it("renders important values from the verified source within natural wording", () => {
    const result = validateAssistantNarrative(paragraph("Your project is moving through {{fact:status}}. Would you like an update on the current work too?"), [fact("status", "Design review")]);
    expect(result).toEqual(paragraph("Your project is moving through Design review. Would you like an update on the current work too?"));
  });

  it.each([
    ["a missing date", "I don't have a confirmed finish date to share yet. {{fact:status}}", "A confirmed finish date is not available."],
    ["a blocker", "The latest work update needs attention: {{fact:status}}", "Vendor reported a blocker; team follow-up is required."],
    ["reported progress", "The vendor's latest update is {{fact:status}}", "60% reported; this is not a Client acceptance."],
    ["a proposed schedule", "The proposed dates are {{fact:status}}", "2026-10-09 to 2026-10-13; awaiting confirmation."],
    ["confirmed work dates", "The current work schedule is {{fact:status}}", "2026-10-09 to 2026-10-13; confirmed work dates, not a project handover commitment."],
    ["private account help", "You can find your profile under {{fact:status}}", "Account settings"]
  ])("allows useful natural wording for %s", (_label, text, value) => {
    expect(validateAssistantNarrative(paragraph(text), [fact("status", value)])?.[0].text).toContain(value);
  });

  it("allows helpful catalogue, price and clarification wording without invented facts", () => {
    expect(validateAssistantNarrative(paragraph("You can compare the matching options below. Which room would you like to add this to?", []), [])?.[0].text).toContain("Which room");
    expect(validateAssistantNarrative(paragraph("The approximate addition is shown below for your review. Any optional additions remain your choice.", []), [])).toHaveLength(1);
  });

  it.each([
    ["unknown evidence", "Your project is {{fact:foreign}}.", ["status"], "Active", "ASSISTANT_UNKNOWN_SOURCE"],
    ["unselected evidence", "The latest update is ready.", ["foreign"], "Active", "ASSISTANT_UNKNOWN_SOURCE"],
    ["made-up percentage", "The vendor reports 90% progress.", ["status"], "60% reported; this is not a Client acceptance.", "ASSISTANT_INVALID_OUTPUT"],
    ["invented date", "Your work ends on 2026-10-20.", ["status"], "2026-10-09 to 2026-10-13; awaiting confirmation.", "ASSISTANT_INVALID_OUTPUT"],
    ["invented relative date", "Your work ends tomorrow.", ["status"], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["social today followed by an unsupported project date", "Hello! How can I help you today? Your project finishes today.", ["status"], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["greeting does not exempt factual today", "Hello! Your project finishes today.", ["status"], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["invented written duration", "It will finish in five days.", ["status"], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["money copied from Client text", "The total is ₹500.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["money without currency", "The price is five thousand.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["a disguised invented amount", "It will be five thousand.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["HTML injection", "<img src=x onerror=alert(1)> Active", ["status"], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["external instructions", "Visit https://attacker.invalid to continue.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["false alert receipt", "I've notified your project manager.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["unsupported reassurance", "I'll make sure it finishes on time.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["unsupported guarantee", "I promise everything will be fine.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["empathy turned into a delay claim", "I'm sorry your project is delayed.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["yes turned into approval", "Your estimate is approved.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["unavailable becoming completed", "All work has finished.", ["status"], "Execution details are not available.", "ASSISTANT_INVALID_OUTPUT"],
    ["proposal becoming confirmed", "The dates are confirmed.", ["status"], "2026-10-09 to 2026-10-13; awaiting confirmation.", "ASSISTANT_INVALID_OUTPUT"],
    ["report becoming verification", "Completion is verified at 60%.", ["status"], "60% reported; this is not a Client acceptance.", "ASSISTANT_INVALID_OUTPUT"],
    ["handover promise from work dates", "Your handover is on 2026-10-13.", ["status"], "2026-10-09 to 2026-10-13; confirmed work dates, not a project handover commitment.", "ASSISTANT_INVALID_OUTPUT"],
    ["unsupported named owner", "The project is managed by Mallory.", ["status"], "Responsible: Synthetic Manager (Site Manager).", "ASSISTANT_INVALID_OUTPUT"],
    ["unsupported project claim", "Your project is completed.", [], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["contradictory status", "Your project is completed.", ["status"], "Active", "ASSISTANT_INVALID_OUTPUT"],
    ["misleading report qualification", "The vendor reported progress and completion is verified.", ["status"], "60% reported; this is not a Client acceptance.", "ASSISTANT_INVALID_OUTPUT"],
    ["misleading proposal qualification", "The proposed dates are confirmed.", ["status"], "2026-10-09 to 2026-10-13; awaiting confirmation.", "ASSISTANT_INVALID_OUTPUT"]
  ])("rejects %s", (_label, text, ids, value, code) => {
    expect(() => validateAssistantNarrative(paragraph(text, ids as string[]), [fact("status", value)])).toThrowError(expect.objectContaining({code}));
  });

  it("keeps legacy fact-only answers compatible and bounds rendered expansion", () => {
    expect(validateAssistantNarrative(undefined, [])).toBeUndefined();
    expect(() => validateAssistantNarrative(Array.from({length: 5}, () => ({text: "Which room?", factIds: []})), [])).toThrow();
    expect(() => validateAssistantNarrative(paragraph("{{fact:status}}"), [fact("status", "a".repeat(1_001))])).toThrow();
    expect(() => validateAssistantNarrative(Array.from({length: 3}, () => ({text: "{{fact:status}}", factIds: ["status"]})), [fact("status", "a".repeat(700))])).toThrow();
  });
});
