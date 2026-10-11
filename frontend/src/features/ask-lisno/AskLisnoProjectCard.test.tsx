import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AssistantFact } from "../messages/projectChatAssistantTypes";
import { AskLisnoProjectCard } from "./AskLisnoProjectCard";
import type { AskLisnoResponse } from "./askLisnoApi";

function fact(id: string, label: string, value: string, sourceId = "project-a"): AssistantFact {
  return { id, label, value, source: { id: sourceId, label: "Project information", href: "/projects/project-a" } };
}

function response(): AskLisnoResponse {
  return {
    projectId: "project-a",
    resolution: { state: "resolved", project: { id: "project-a", name: "Garden home" }, question: null, choices: [] },
    checkedAt: "2026-10-11T08:20:00Z",
    answer: {
      kind: "status",
      facts: [fact("project-status", "Status", "In progress"), fact("project-stage", "Current stage", "Execution")],
      candidates: [], missingInputs: [], commercial: null
    }
  };
}

describe("Ask Lisno project card", () => {
  it("names the returned project and preserves its matching fact labels and values", () => {
    render(<AskLisnoProjectCard response={response()} />);
    const card = screen.getByRole("region", { name: "Garden home" });
    expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent("Garden home");
    expect(within(card).getAllByRole("term").map(term => term.textContent)).toEqual(["Current stage", "Status"]);
    expect(within(card).getAllByRole("definition").map(value => value.textContent)).toEqual(["Execution", "In progress"]);
    expect(card.querySelector(".ask-lisno-project-card__art")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("adapts to one available fact and retains its qualification without invented metrics", () => {
    const input = response();
    input.answer.facts = [fact("project-stage", "Stage", "Execution, awaiting team confirmation")];
    render(<AskLisnoProjectCard response={input} />);
    expect(screen.getAllByRole("definition")).toHaveLength(1);
    expect(screen.getByText("Execution, awaiting team confirmation")).toBeVisible();
    expect(screen.queryByText(/60%|24 items|team members|Oct 12|Rajesh/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
  });

  it("excludes another project's facts, unrecognized metrics and narrative-derived status", () => {
    const input = response();
    input.answer.facts = [
      fact("project-stage", "Stage", "Other project's execution", "project-b"),
      fact("project-status", "Status", "Awaiting approval"),
      fact("vendor-progress", "Vendor progress", "60%, vendor reported")
    ];
    input.answer.narrative = [{ text: "The work is 60% complete", factIds: ["vendor-progress"] }];
    render(<AskLisnoProjectCard response={input} />);
    expect(screen.getAllByRole("definition")).toHaveLength(1);
    expect(screen.getByText("Awaiting approval")).toBeVisible();
    expect(screen.queryByText(/Other project|60%/)).not.toBeInTheDocument();
  });

  it.each(["catalogue", "price", "clarification", "handoff", "no_answer"] as const)("omits the card for a %s answer", kind => {
    const input = response(); input.answer.kind = kind;
    const { container } = render(<AskLisnoProjectCard response={input} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(["account", "clarification"] as const)("omits the card for %s resolution even with project-shaped data", state => {
    const input = response(); input.resolution!.state = state;
    const { container } = render(<AskLisnoProjectCard response={input} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("requires resolution metadata and matching stable project IDs, not the project name", () => {
    const input = response();
    input.resolution!.project!.id = "project-b";
    const { container, rerender } = render(<AskLisnoProjectCard response={input} />);
    expect(container).toBeEmptyDOMElement();
    delete input.resolution;
    rerender(<AskLisnoProjectCard response={input} />);
    expect(container).toBeEmptyDOMElement();
    const unscoped = response(); unscoped.projectId = null;
    rerender(<AskLisnoProjectCard response={unscoped} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("omits empty or unsupported fact sets and a missing project identity", () => {
    const input = response();
    input.answer.facts = [fact("project-stage", "Stage", "  "), fact("project-status", " ", "In progress"), fact("other", "Progress", "60%")];
    const { container, rerender } = render(<AskLisnoProjectCard response={input} />);
    expect(container).toBeEmptyDOMElement();
    input.answer.facts = [];
    rerender(<AskLisnoProjectCard response={input} />);
    expect(container).toBeEmptyDOMElement();
    const noProject = response(); noProject.resolution!.project = null;
    rerender(<AskLisnoProjectCard response={noProject} />);
    expect(container).toBeEmptyDOMElement();
  });
});
