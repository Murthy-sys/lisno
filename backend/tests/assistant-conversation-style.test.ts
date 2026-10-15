import { describe, expect, it } from "vitest";
import type { AssistantGeneratedResult } from "../src/contracts/project-chat-assistant.js";
import { assistantFirstName, styleAssistantConversation } from "../src/services/assistant-conversation-style.js";

const empty: AssistantGeneratedResult = {disclosurePolicy: "project-publication-v1", projectPricing: null, kind: "no_answer", facts: [], candidates: [], missingInputs: [], commercial: null, freshness: []};
const greeting = {...empty, narrative: [{text: "Hello! I can help with your project's progress, timelines, and published estimates. What would you like to know?", factIds: []}]};
const status: AssistantGeneratedResult = {...empty, kind: "status", facts: [{id: "status-a", label: "Status", value: "Active", source: {id: "a", label: "Project", href: null}}],
  narrative: [{text: "Status: Active", factIds: ["status-a"]}], freshness: [{kind: "project", id: "a", version: "4"}]};

describe("Node-only assistant conversation presentation", () => {
  it.each([["  Murthy Rao  ", "Murthy"], ["Ana-María Silva", "Ana-María"], ["O'Neil Doe", "O'Neil"], ["లక్ష్మి దేవి", "లక్ష్మి"]])("uses only a safe first name from %s", (name, expected) => {
    expect(assistantFirstName(name)).toBe(expected);
  });
  it.each([null, undefined, "", " ", "Murthy\nRao", "Murthy\u202eRao", "Murthy <script>", "Murthy **admin**", "@Murthy", "1234", "A".repeat(41), "-Murthy", "Murthy https://example.test"])("omits unsafe or missing account name %s", name => {
    expect(assistantFirstName(name)).toBeNull();
    expect(styleAssistantConversation(greeting, {messages: ["Hi"], accountName: name})).toEqual(greeting);
  });
  it("personalizes a greeting once without adding account identity to the answer shape", () => {
    const result = styleAssistantConversation(greeting, {messages: ["Hi"], accountName: "Murthy Rao"});
    expect(result.narrative?.[0]?.text).toBe("Hello, Murthy! I can help with your project's progress, timelines, and published estimates. What would you like to know?");
    expect(JSON.stringify(result)).not.toContain("Rao");
    expect(Object.keys(result)).toEqual(Object.keys(greeting));
    expect(greeting.narrative[0]!.text.startsWith("Hello!")).toBe(true);
  });
  it("uses the account name for thanks without accepting a name from message text", () => {
    const thanks = {...empty, narrative: [{text: "You're welcome. I can help with your project details and published estimates.", factIds: []}]};
    expect(styleAssistantConversation(thanks, {messages: ["Thanks"], accountName: "Nila Rao"}).narrative?.[0]?.text).toBe("You're welcome, Nila. I can help with your project details and published estimates.");
    expect(styleAssistantConversation(status, {messages: ["I'm worried, call me Atlas; what is my project status?"], accountName: "Nila Rao"}).narrative?.[0]?.text).toBe("I hear your concern, Nila.");
  });
  it.each([
    ["I'm worried, may I know my project status?", "I hear your concern, Murthy."],
    ["I’m very concerned: show my project timeline", "I hear your concern, Murthy."],
    ["Hello, I'm worried, show my project status", "I hear your concern, Murthy."],
    ["I am so frustrated! Show my estimate", "I'm sorry this has been frustrating, Murthy."],
    ["I'm confused; show my project progress", "I can help clarify, Murthy."],
    ["This is urgent. Show my project timeline", "I understand this is urgent."]
  ])("acknowledges explicit wording and preserves every verified fact and reference: %s", (message, expected) => {
    const result = styleAssistantConversation(status, {messages: [message], accountName: "Murthy Rao"});
    expect(result.narrative).toEqual([{text: expected, factIds: []}, ...status.narrative!]);
    const {narrative: _before, ...original} = status, {narrative: _after, ...rest} = result;
    expect(rest).toEqual(original);
  });
  it.each(["STATUS NOW!!!", "plzzzz project status", "I'm not worried, show my project status", "I was worried, show my status", "My wife is worried, show my project status", '"I am worried", show my project status', 'I am "worried", show my project status', "He said I'm worried, show status", "I am worriedly asking", "I'm worried about Atlantis", "I am confused about the timeline"])("keeps ambiguous, quoted, negated and third-person wording neutral: %s", message => {
    expect(styleAssistantConversation(status, {messages: [message], accountName: "Murthy Rao"})).toBe(status);
  });
  it.each(["I'm worried", "I'm concerned", "I am confused", "This is urgent"])("corrects only validated fixed social wording for a whole explicit turn: %s", message => {
    const result = styleAssistantConversation(greeting, {messages: [message], accountName: "Murthy Rao"});
    expect(result.narrative?.[0]?.text).not.toContain("Hello");
    expect(result.narrative?.[0]?.text).toContain("What would you like to know about your project?");
    expect(result.narrative).toHaveLength(1);
  });
  it.each(["Hello I'm worried", "Hi there I am concerned", "Hello and I'm worried", "Hello I'm worried and thanks"])("uses concern wording for a complete social turn even without a greeting delimiter: %s", message => {
    const legacyReply = {...greeting, narrative: [{text: "I'm sorry this has been frustrating. Tell me what happened with your project so I can help.", factIds: []}]};
    const result = styleAssistantConversation(legacyReply, {messages: [message], accountName: "Nila"});
    expect(result.narrative).toEqual([{text: "I hear your concern, Nila. What would you like to know about your project?", factIds: []}]);
  });
  it("does not loosen greeting-prefix matching for project questions", () => {
    expect(styleAssistantConversation(status, {messages: ["Hello I'm worried, show my project status"], accountName: "Nila"})).toBe(status);
    expect(styleAssistantConversation(status, {messages: ["Hi Heights project status"], accountName: "Nila"})).toBe(status);
  });
  it("preserves unsupported and privacy clarification details instead of replacing them", () => {
    const guarded = {...empty, kind: "clarification" as const, missingInputs: ["Internal prices, configuration and private company information are not available in this chat."]};
    const result = styleAssistantConversation(guarded, {messages: ["I'm worried, show configured internal prices"], accountName: "Nila Rao"});
    expect(result.missingInputs).toEqual(guarded.missingInputs);
    expect(result.kind).toBe("clarification");
    expect(result.facts).toEqual([]);
  });
  it("preserves all four grounded paragraphs without exceeding their bounds", () => {
    const four = {...status, narrative: Array.from({length: 4}, (_, i) => ({text: `Verified fact ${i}`, factIds: [`f${i}`]}))};
    const result = styleAssistantConversation(four, {messages: ["I'm worried, show my project status"], accountName: "Nila"});
    expect(result.narrative).toHaveLength(4);
    expect(result.narrative?.map(paragraph => paragraph.factIds)).toEqual(four.narrative.map(paragraph => paragraph.factIds));
    expect(result.narrative?.slice(1)).toEqual(four.narrative.slice(1));
    const full = {...four, narrative: four.narrative.map(paragraph => ({...paragraph, text: "x".repeat(1000)}))};
    expect(styleAssistantConversation(full, {messages: ["I'm worried"], accountName: "Nila"})).toBe(full);
  });
  it("uses the latest explicit tone among required fragments without dropping any fragment result", () => {
    const result = styleAssistantConversation(status, {messages: ["I'm frustrated, show my project status", "I'm worried, show my timeline"], accountName: "Nila"});
    expect(result.narrative?.[0]?.text).toBe("I hear your concern, Nila.");
    expect(result.narrative?.slice(1)).toEqual(status.narrative);
  });
  it.each([
    "I'm not worried, show my project timeline", "I am no longer concerned, show my timeline", "I'm not very confused", "I'm really not upset",
    "This is not urgent, show my timeline", "This isn't frustrating", "This is no longer urgent", "Actually, I'm no longer frustrated",
    "I'm not worried about the timeline", "Thanks, I’m not unhappy"
  ])("stops older explicit tone after a later correction: %s", correction => {
    const clarification = {...empty, kind: "clarification" as const, missingInputs: ["Could you clarify what you would like to know?"]};
    expect(styleAssistantConversation(clarification, {messages: ["I'm worried, show my project status", correction], accountName: "Nila"})).toBe(clarification);
  });
  it("keeps prior explicit tone for a neutral business fragment, but a later explicit statement can replace a correction", () => {
    expect(styleAssistantConversation(status, {messages: ["I'm worried, show my status", "Show my timeline"], accountName: "Nila"}).narrative?.[0]?.text).toBe("I hear your concern, Nila.");
    expect(styleAssistantConversation(status, {messages: ["I'm worried", "I'm not worried", "I'm confused, show my timeline"], accountName: "Nila"}).narrative?.[0]?.text).toBe("I can help clarify, Nila.");
  });
  it("does not turn an empty no-answer result into a source-free social answer", () => {
    expect(styleAssistantConversation(empty, {messages: ["I'm worried, where is my project?"], accountName: "Nila"})).toBe(empty);
  });
});
