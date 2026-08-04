import { readFileSync } from "node:fs";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const clientDashboardStyles = readFileSync("src/styles/client-dashboard.css", "utf8");

const client = {
  id: "client-1",
  name: "Aurora Homes",
  email: "client@lisno.example",
  role: "client" as const
};

const summaries = [
  {
    id: "project-villa",
    name: "Aurora Villa",
    status: "active",
    location: "Bengaluru",
    plannedStartAt: "2026-06-01T00:00:00.000Z",
    plannedEndAt: "2026-09-30T00:00:00.000Z",
    actualStartAt: null,
    actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    progress: 64,
    floorCount: 3
  },
  {
    id: "project-loft",
    name: "Cedar Loft",
    status: "planning",
    location: "Mysuru",
    plannedStartAt: "2026-07-01T00:00:00.000Z",
    plannedEndAt: "2026-10-30T00:00:00.000Z",
    actualStartAt: null,
    actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    progress: 0,
    floorCount: 1
  }
];

function installClientDashboardApi() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/auth/me")) {
      return Response.json({ data: client });
    }
    if (url.includes("/api/v1/client/project-summaries?")) {
      return Response.json({
        data: {
          items: summaries,
          pagination: { limit: 100, offset: 0, total: 2, hasMore: false }
        }
      });
    }
    if (url.endsWith("/api/v1/client/latest-approved-versions")) {
      return Response.json({
        data: [{
          id: "version-villa",
          projectId: "project-villa",
          floorId: "floor-1",
          stageId: "stage-1",
          taskId: null,
          versionNumber: 2,
          originalFilename: "Villa floor plan.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1200,
          uploadedAt: "2026-07-12T00:00:00.000Z",
          approvalStatus: "approved",
          approvedAt: "2026-07-14T00:00:00.000Z",
          clientVisible: true,
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z"
        }]
      });
    }
    if (url.endsWith("/api/v1/client/estimates")) {
      return Response.json({ data: [] });
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

function parsedStyleRules(source: string) {
  const style = document.createElement("style");
  style.textContent = source;
  document.head.append(style);
  const rules = Array.from(style.sheet?.cssRules ?? []);
  style.remove();
  return rules;
}

function findStyleRule(rules: CSSRule[], expectedSelectors: string[]) {
  return rules.find((rule): rule is CSSStyleRule => {
    if (!("selectorText" in rule) || typeof rule.selectorText !== "string") return false;
    const selectors = rule.selectorText.split(",").map((selector) => selector.trim());
    return expectedSelectors.every((selector) => selectors.includes(selector));
  });
}

describe("collapsible client project cards", () => {
  it("gives each project expansion toggle a 44 by 44 pixel minimum target", () => {
    const toggleRule = findStyleRule(parsedStyleRules(clientDashboardStyles), [
      ".client-dashboard .client-project-card__toggle"
    ]);

    expect(toggleRule?.style.getPropertyValue("min-inline-size")).toBe("44px");
    expect(toggleRule?.style.getPropertyValue("min-block-size")).toBe("44px");
  });

  it("stacks each project card header and its controls below 720 pixels", () => {
    const rules = parsedStyleRules(clientDashboardStyles);
    const narrowRule = rules.find(
      (rule) => rule.cssText.startsWith("@media (max-width: 720px)") && "cssRules" in rule
    ) as CSSMediaRule | undefined;
    const stackedRule = findStyleRule(Array.from(narrowRule?.cssRules ?? []), [
      ".client-dashboard .client-project-card__header",
      ".client-dashboard .client-project-card__toggle",
      ".client-dashboard .client-project-card__summary"
    ]);

    expect(stackedRule?.style.getPropertyValue("align-items")).toBe("flex-start");
    expect(stackedRule?.style.getPropertyValue("flex-direction")).toBe("column");
  });

  it("starts collapsed and toggles projects independently", async () => {
    tokenStorage.set("client-token");
    installClientDashboardApi();
    const user = userEvent.setup();

    renderApp(["/client"]);

    const villaToggle = await screen.findByRole("button", {
      name: /Aurora Villa/
    });
    const loftToggle = screen.getByRole("button", { name: /Cedar Loft/ });
    const villaHeading = screen.getByRole("heading", {
      name: "Aurora Villa",
      level: 2
    });

    expect(villaToggle).toHaveAttribute("aria-expanded", "false");
    expect(villaToggle).toHaveAttribute(
      "aria-controls",
      "client-project-project-villa-details"
    );
    expect(villaToggle).not.toContainElement(villaHeading);
    expect(loftToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Villa floor plan.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open project" })).not.toBeInTheDocument();

    await user.click(villaToggle);

    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(loftToggle).toHaveAttribute("aria-expanded", "false");
    const villaPanel = document.getElementById(
      "client-project-project-villa-details"
    )!;
    expect(villaPanel).toBeVisible();
    expect(within(villaPanel).getByText("Villa floor plan.pdf")).toBeVisible();
    expect(within(villaPanel).getByRole("link", {
      name: "Open project"
    })).toHaveAttribute("href", "/client/projects/project-villa");

    await user.click(loftToggle);
    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(loftToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(villaToggle);
    expect(villaToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Villa floor plan.pdf")).not.toBeInTheDocument();
  });
});
