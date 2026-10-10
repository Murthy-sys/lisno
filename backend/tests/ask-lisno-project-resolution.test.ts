import { describe, expect, it } from "vitest";
import { resolveProjectName } from "../src/services/ask-lisno-project-resolution.js";
const projects = [{id: "cedar", name: "Cedar House", detail: "North"}, {id: "loft", name: "City Loft", detail: "South"}];
const resolve = (message: string, extras: Partial<Parameters<typeof resolveProjectName>[0]> = {}) => resolveProjectName({message, projects, complete: true, contextProjectId: "loft", ...extras});
describe("Ask Lisno project name resolution", () => {
  it.each(["Hello!", "Hi Lisno", "Good morning", "Hello, how are you?", "Thanks for your help", "Okay, thanks", "Thank you, that helps", "I'm upset", "I'm really worried"])("keeps a pure social turn outside project selection: %s", message => {
    expect(resolve(message)).toMatchObject({state: "account", project: null, choices: []});
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
});
