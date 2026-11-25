import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import type { AdminProjectSummary } from "../../api/types";
import { ProjectClientPersona } from "./ProjectClientPersona";

const project: AdminProjectSummary = {
  id: "project-one", name: "Residence one", status: "planning", location: "Pune",
  client: { name: "Client One", email: "client-one@example.test", mobile: "9000000001" },
  propertyType: "3BHK", budgetMin: 800000, budgetMax: 1200000,
  estimator: null, lead: null, estimate: null, createdAt: "2026-11-24T00:00:00Z",
  nativePlace: "Mysuru", preferredLanguage: "kannada", languagesKnown: ["kannada", "english"],
  category: "self_use", tentativeBudget: "Around 10 lakh, subject to scope", closureTentativeDate: "2026-11-24"
};

function expectField(label: string, value: string) {
  const region = screen.getByRole("region", { name: "Client persona" });
  expect(within(region).getByText(label, { selector: "dt" }).nextElementSibling).toHaveTextContent(value);
}

describe("ProjectClientPersona", () => {
  it("shows captured intake facts with semantic labels and no inferred persona information", async () => {
    const view = render(<main><h1>Project</h1><ProjectClientPersona project={project} /></main>);
    for (const [label, value] of [
      ["Client name", "Client One"], ["Email", "client-one@example.test"], ["Mobile", "9000000001"],
      ["Native place", "Mysuru"], ["Preferred language", "Kannada"], ["Languages known", "Kannada, English"],
      ["Purpose", "Self use"], ["Tentative budget", "Around 10 lakh, subject to scope"],
      ["Tentative closure date", "24 Nov 2026"]
    ]) expectField(label, value);
    expect(screen.getByText("24 Nov 2026")).toHaveAttribute("datetime", "2026-11-24");
    expect(screen.queryByText(/expected completion|handover|design preferences|personality/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("uses explicit empty states for absent historical metadata and empty contact fields", () => {
    render(<ProjectClientPersona project={{
      ...project, client: { name: " ", email: "", mobile: "" }, nativePlace: undefined,
      preferredLanguage: null, languagesKnown: [], category: undefined, tentativeBudget: "  ", closureTentativeDate: null
    }} />);
    expect(within(screen.getByRole("region", { name: "Client persona" })).getAllByText("Not captured")).toHaveLength(9);
  });

  it("does not turn unknown legacy language or purpose codes into invented labels", () => {
    const legacy = { ...project };
    Reflect.set(legacy, "preferredLanguage", "unknown-language");
    Reflect.set(legacy, "languagesKnown", ["unknown-language"]);
    Reflect.set(legacy, "category", "unknown-purpose");
    render(<ProjectClientPersona project={legacy} />);
    expectField("Preferred language", "Not captured");
    expectField("Languages known", "Not captured");
    expectField("Purpose", "Not captured");
    expect(screen.queryByText(/unknown-language|unknown-purpose/)).not.toBeInTheDocument();
  });

  it.each(["2026-02-29", "2026-13-01", "2026-11-24T12:00:00Z", "not-a-date"])("handles invalid calendar date %s without guessing", closureTentativeDate => {
    render(<ProjectClientPersona project={{ ...project, closureTentativeDate }} />);
    expectField("Tentative closure date", "Not captured");
    expect(document.querySelector("time")).toBeNull();
  });

  it("keeps leap-day calendar dates on the captured day", () => {
    render(<ProjectClientPersona project={{ ...project, closureTentativeDate: "2024-02-29" }} />);
    expectField("Tentative closure date", "29 Feb 2024");
    expect(screen.getByText("29 Feb 2024")).toHaveAttribute("datetime", "2024-02-29");
  });

  it("preserves long captured text and immediately replaces it when the project changes", () => {
    const longBudget = "Please include the existing furniture and allow for staged purchases after the initial rooms are finished.";
    const view = render(<ProjectClientPersona project={{ ...project, tentativeBudget: longBudget }} />);
    expectField("Tentative budget", longBudget);
    view.rerender(<ProjectClientPersona project={{
      ...project, id: "project-two", name: "Residence two", category: "rental", nativePlace: "Kochi",
      client: { name: "Client Two", email: "client-two@example.test", mobile: "9000000002" },
      languagesKnown: ["malayalam"], preferredLanguage: "malayalam", tentativeBudget: null, closureTentativeDate: null
    }} />);
    expectField("Client name", "Client Two");
    expectField("Purpose", "Rental");
    expectField("Preferred language", "Malayalam");
    expectField("Languages known", "Malayalam");
    expectField("Tentative budget", "Not captured");
    expect(screen.queryByText("Client One")).not.toBeInTheDocument();
    expect(screen.queryByText("client-one@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText(longBudget)).not.toBeInTheDocument();
    expect(screen.queryByText("24 Nov 2026")).not.toBeInTheDocument();
  });
});
