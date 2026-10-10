import { describe, expect, it } from "vitest";
import { isProjectListRequest, orderedProjectList, projectListPage } from "../src/services/ask-lisno-project-list.js";

describe("Ask Lisno project directory intent and pages", () => {
  it.each(["show all projects", "Show my projects", "list my projects", "which projects do I have?", "What projects are available to me?", "Could you please show me all my projects?", "Hello Lisno, list all projects please!", "I would like to see all my projects", "Show projects", "List the projects I have", "Please can you show all of my projects?", "Can I see my projects please?", "Could you show me a list of my projects?"])("recognizes a direct list: %s", message => {
    expect(isProjectListRequest(message)).toBe(true);
  });
  it.each(["get all my projects", "Get my projects please", "Can I get all my projects?", "hi, cn i get all my projects", "Hello Lisno, could I get all of my projects?", "Please cn you get all my projects?", "Could you please get me all my projects?", "I want to get my projects", "Let me get all my projects", "Can I have all my projects?", "Could I please get my projects?"])("recognizes a conversational get request: %s", message => {
    expect(isProjectListRequest(message)).toBe(true);
  });
  it.each(["Show progress for Project a", "Show Project a", "List my projects and compare budgets", "Change all projects to approved", "Show my projects' budget", "Which projects are over budget?", "Thanks for showing my projects", "No, show my project finish date", "Show all projects for client b"])("does not replace another intent: %s", message => {
    expect(isProjectListRequest(message)).toBe(false);
  });
  it.each(["Can I get the budget for all my projects?", "Get all my projects and delete them", "Get all my projects for client b", "Can I get Project a's timeline?", "hi, cn i get all my projects approved", "I cannot get all my projects", "Don't get all my projects"])("keeps non-directory get requests out of the shortcut: %s", message => {
    expect(isProjectListRequest(message)).toBe(false);
  });
  it("sorts independently of repository order, deduplicates IDs and keeps duplicate names", () => {
    const a = {id: "a", name: "Same", detail: "North"}, b = {id: "b", name: "Same", detail: "South"};
    expect(orderedProjectList([b, a, b])).toEqual([a, b]);
    expect(orderedProjectList([a, b])).toEqual(orderedProjectList([b, a]));
  });
  it("binds freshness to actor, session and allowlisted roster metadata", () => {
    const actor = {id: "client-a", sessionVersion: 1}, projects = [{id: "a", name: "Same", detail: "North"}];
    const page = projectListPage(actor, projects);
    expect(page.version).toMatch(/^[a-f0-9]{64}$/);
    for (const current of [projectListPage({...actor, id: "client-b"}, projects), projectListPage({...actor, sessionVersion: 2}, projects), projectListPage(actor, [{...projects[0]!, detail: "South"}]), projectListPage(actor, [{...projects[0]!, name: "Renamed"}])]) expect(current.version).not.toBe(page.version);
    expect(() => projectListPage(actor, projects, {offset: 20, version: page.version})).toThrowError(expect.objectContaining({code: "ASK_LISNO_PROJECT_LIST_CHANGED"}));
  });
});
