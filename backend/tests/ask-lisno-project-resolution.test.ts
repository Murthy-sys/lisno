import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isSocialMessage, resolveProjectName } from "../src/services/ask-lisno-project-resolution.js";
import type { AssistantStepRequest, AssistantStepResponse } from "../src/contracts/assistant-step.js";
const pythonDirectFixtures = JSON.parse(readFileSync(new URL("../../assistant-service/evaluation/direct-fixtures.json", import.meta.url), "utf8")) as Array<{ name: string; request: AssistantStepRequest; response: AssistantStepResponse }>;
const pythonSocialFixtures = pythonDirectFixtures.filter(row => row.response.result.type === "final" && row.response.result.kind === "no_answer" && row.response.result.narrative.length > 0);
const projects = [{id: "cedar", name: "Cedar House", detail: "North"}, {id: "loft", name: "City Loft", detail: "South"}];
const resolve = (message: string, extras: Partial<Parameters<typeof resolveProjectName>[0]> = {}) => resolveProjectName({message, projects, complete: true, contextProjectId: "loft", ...extras});
describe("Ask Lisno project name resolution", () => {
  it.each(["Hello!", "Hi Lisno", "Good morning", "Hello, how are you?", "Thanks for your help", "Okay, thanks", "Thank you, that helps", "I'm upset", "I'm really worried", "Namaste", "Namaskaram", "I am unhappy", "Thanks Lisno", "Good morning Lisno", "GoodmorningLisno"])("keeps a pure social turn outside project selection: %s", message => {
    expect(resolve(message)).toMatchObject({state: "account", project: null, choices: []});
  });
  it.each(pythonSocialFixtures)("matches Python's actual social response without project selection: $name", fixture => {
    const required = new Set(fixture.request.requiredMessageIds ?? [fixture.request.messages.at(-1)!.id]);
    const message = fixture.request.messages.filter(row => required.has(row.id)).map(row => row.body).join("\n");
    expect(isSocialMessage(message)).toBe(true);
    expect(resolve(message, { contextProjectId: null })).toMatchObject({ state: "account", project: null, choices: [] });
  });
  it.each(["Namaste", "Namaskaram", "I am unhappy", "Thanks Lisno", "Good morning Lisno", "GoodmorningLisno"])("retains business intent after the social phrase: %s", phrase => {
    const message = `${phrase}, what is the price of Cedar House?`;
    expect(isSocialMessage(message)).toBe(false);
    expect(resolve(message)).toMatchObject({ state: "resolved", project: { id: "cedar" } });
  });
  it.each(["Hello, how is my project doing?", "I'm really upset. Why is my project still delayed?", "I keep asking. What is the latest update?"])("retains authorized context when emotion accompanies a project question: %s", message => {
    expect(resolve(message)).toMatchObject({state: "resolved", project: {id: "loft"}});
  });
  it.each(["Hi, status of Atlantis?", "Thanks, when will Atlantis finish?", "I'm really upset. Why is Atlantis delayed?"])("does not treat a mixed social message as permission to fall back: %s", message => {
    expect(resolve(message)).toMatchObject({state: "clarification", project: null});
  });
  it.each(["How is CEDAR   House doing?", "Show Cedar House progress", "When will Cedar House finish?", "Add a ceiling to Cedar House"])("prioritizes an explicit full name: %s", message => {
    expect(resolve(message)).toMatchObject({state: "resolved", project: {id: "cedar"}});
  });
  it.each(["When will my project finish?", "What is the progress of my project?", "How is my project?", "How is my project doing?", "What about the painting?", "Project status?", "And when will it finish?", "Can you add POP ceiling to my project?", 'What is the price for "POP ceiling"?', "Current verified status?"])("uses the previous project for an ordinary follow-up: %s", message => {
    expect(resolve(message)).toMatchObject({state: "resolved", project: {id: "loft"}});
  });
  it.each(["What is the progress of project Atlantis?", "What about Atlantis?", "How is Atlantis coming?", "How is Atlantis?", "Atlantis progress?", "When will Atlantis finish?", 'Check "Atlantis"', "Is Atlantis running late?", "Can I get an update on Atlantis?", "Add a ceiling to Atlantis"])("never falls back on an unknown explicit name: %s", message => {
    expect(resolve(message, {modelName: null})).toMatchObject({state: "clarification", project: null, choices: []});
  });
  it("does not treat an owned name as a match for a longer explicit project name", () => {
    expect(resolve("What is the progress of Cedar House Annex?")).toMatchObject({state: "clarification", project: null});
    expect(resolve("Cedar House Annex")).toMatchObject({state: "clarification", project: null});
    expect(resolve("Cedar House Annex", {modelName: "Cedar House"})).toMatchObject({state: "clarification", project: null});
    expect(resolve("What is the progress of Cedar House?")).toMatchObject({state: "resolved", project: {id: "cedar"}});
  });
  it("requires confirmation for partial names and accepts a choice only among those matches", () => {
    expect(resolve("Progress of Cedar?")).toMatchObject({state: "clarification", choices: [{id: "cedar"}]});
    expect(resolve("Progress of Cedar?", {choiceProjectId: "cedar"})).toMatchObject({state: "resolved", project: {id: "cedar"}});
    expect(resolve("Progress of Cedar?", {choiceProjectId: "loft"})).toMatchObject({state: "clarification"});
  });
  it("asks for duplicate and multiple names instead of merging facts", () => {
    expect(resolve("Cedar House and City Loft progress")).toMatchObject({state: "clarification", choices: [{id: "cedar"}, {id: "loft"}]});
    expect(resolve("Cedar House and City Loft progress", {choiceProjectId: "loft"})).toMatchObject({state: "resolved", project: {id: "loft"}});
    const duplicate = [...projects, {id: "cedar-2", name: "Cedar House", detail: "West"}];
    expect(resolve("Cedar House progress", {projects: duplicate})).toMatchObject({state: "clarification", choices: [{id: "cedar"}, {id: "cedar-2"}]});
    expect(resolve("Cedar House progress", {projects: duplicate, choiceProjectId: "cedar-2"})).toMatchObject({state: "resolved", project: {id: "cedar-2"}});
  });
  it("does not accept a model-invented name absent from the current question", () => {
    expect(resolve("Project progress?", {modelName: "Cedar House"})).toMatchObject({project: {id: "loft"}});
  });
  it("uses one project only when discovery is complete and supports account questions", () => {
    expect(resolve("Project progress?", {projects: [projects[0]!], contextProjectId: null})).toMatchObject({project: {id: "cedar"}});
    expect(resolve("Project progress?", {projects: [projects[0]!], complete: false, contextProjectId: null})).toMatchObject({state: "clarification"});
    expect(resolve("What is my account email?")).toMatchObject({state: "account", project: null});
    expect(resolve("Hello", {projects: [], contextProjectId: null})).toMatchObject({state: "account"});
  });
  it("resolves the polite project-status question using only authorized current context or a deliberate choice", () => {
    const message = "may i know my project status";
    expect(resolve(message)).toMatchObject({state: "resolved", project: {id: "loft"}});
    expect(resolve(message, {contextProjectId: null, pageProjectId: "cedar"})).toMatchObject({state: "resolved", project: {id: "cedar"}});
    expect(resolve(message, {contextProjectId: null, choiceProjectId: "cedar"})).toMatchObject({state: "resolved", project: {id: "cedar"}});
    expect(resolve(message, {contextProjectId: null})).toMatchObject({state: "clarification", project: null});
    expect(resolve(message, {contextProjectId: "foreign", choiceProjectId: "foreign"})).toMatchObject({state: "clarification", project: null});
    expect(resolve(message, {projects: [projects[0]!], contextProjectId: null})).toMatchObject({state: "resolved", project: {id: "cedar"}});
    expect(resolve(message, {projects: [projects[0]!], contextProjectId: null, complete: false})).toMatchObject({state: "clarification", project: null});
  });
  it.each(["May I know project Atlantis status?", "May I know Atlantis status?", "May I know Cedar House Annex status?", "May I know my project status for Atlantis?"])("does not let a polite prefix hide an unknown named subject: %s", message => {
    expect(resolve(message, {choiceProjectId: "loft"})).toMatchObject({state: "clarification", project: null});
  });
  it.each(["May I know Cedar House status?", "May I know project Cedar House status?"])("preserves an explicit full project name after a polite prefix: %s", message => {
    expect(resolve(message)).toMatchObject({state: "resolved", project: {id: "cedar"}});
  });
  it.each(["I'm concerned", "I'm very confused", "I’m worried", "I‘m upset", "This is urgent", "This is frustrating"])("keeps an explicit whole tone turn outside project selection: %s", message => {
    expect(isSocialMessage(message)).toBe(true);
    expect(resolve(message, {contextProjectId: null})).toMatchObject({state: "account", project: null});
  });
  it.each(['"I\'m worried"', "‘I am worried’", "`I'm worried`", 'I am "worried"', "I am 'worried'", "My manager is worried", "I'm not worried", "You said I'm worried", "I'm worried about Atlantis"])("does not classify quoted, third-person or ambiguous mood wording as a social turn: %s", message => {
    expect(isSocialMessage(message)).toBe(false);
  });
  it.each([
    "I'm worried, may I know my project status?", "I’m concerned. Show my project timeline", "I‘m confused: show my estimate",
    "I am very frustrated! Show my project progress", "I'm upset; show my project status", "I'm unhappy, show my estimate",
    "This is urgent, show my project timeline", "This is frustrating. Show my project status", "Thanks, may I know my project status?",
    "Thank you, show my estimate", "Hi Lisno, I'm worried, may I know my project status?",
  ])("preserves authorized context for a bounded tone prefix plus business question: %s", message => {
    expect(isSocialMessage(message)).toBe(false);
    expect(resolve(message)).toMatchObject({state: "resolved", project: {id: "loft"}});
    expect(resolve(message, {contextProjectId: null})).toMatchObject({state: "clarification", project: null});
  });
  it.each([
    "I'm worried, may I know project Atlantis status?", "I'm concerned, show Atlantis progress", "This is urgent, show progress for Atlantis",
    "I'm worried, show Cedar House Annex progress", "Thanks, may I know my project status for Atlantis?", "I'm worried about Atlantis, show my project status",
  ])("never uses a tone prefix to fall back from an unknown named subject: %s", message => {
    expect(resolve(message, {choiceProjectId: "loft"})).toMatchObject({state: "clarification", project: null});
  });
  it("preserves full and duplicate named-project selection after tone normalization", () => {
    expect(resolve("I'm concerned, show Cedar House progress")).toMatchObject({state: "resolved", project: {id: "cedar"}});
    const duplicate = [...projects, {id: "cedar-2", name: "Cedar House", detail: "West"}];
    expect(resolve("I'm concerned, show Cedar House progress", {projects: duplicate})).toMatchObject({state: "clarification", choices: [{id: "cedar"}, {id: "cedar-2"}]});
    expect(resolve("I'm concerned, show Cedar House progress", {projects: duplicate, choiceProjectId: "cedar-2"})).toMatchObject({state: "resolved", project: {id: "cedar-2"}});
  });
  it.each(["Hi Heights", "Thanks Residence"])("does not strip words from a full project name that starts with a greeting: %s", name => {
    const named = [...projects, {id: "greeting-name", name, detail: null}];
    expect(resolve(`${name} status`, {projects: named})).toMatchObject({state: "resolved", project: {id: "greeting-name"}});
  });
});
