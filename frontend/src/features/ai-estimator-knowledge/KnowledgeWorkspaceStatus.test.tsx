import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KnowledgeWorkspaceStatus } from "./KnowledgeWorkspaceStatus";
import type { KnowledgeItemDetail, KnowledgeSectionKey } from "./knowledgeTypes";

const sectionKeys: readonly KnowledgeSectionKey[] = [
  "overview", "advanced", "pricing", "recommendations", "quality", "quantity-margin"
];

function item(configured: readonly KnowledgeSectionKey[], percentage: number): Pick<KnowledgeItemDetail, "completeness"> {
  return {
    completeness: {
      percentage,
      sections: sectionKeys.map((sectionKey) => ({
        sectionKey,
        state: configured.includes(sectionKey) ? "complete" as const : "not_configured" as const,
        findings: []
      })),
      blockers: [],
      warnings: []
    }
  };
}

describe("KnowledgeWorkspaceStatus", () => {
  it.each([
    [[], 0, "0 of 4 tabs configured"],
    [["overview"], 25, "1 of 4 tabs configured"],
    [["overview", "pricing", "recommendations"], 75, "3 of 4 tabs configured"],
    [["overview", "advanced", "recommendations", "quality"], 100, "4 of 4 tabs configured"]
  ] as const)("presents saved tab progress for %s", (configured, percentage, count) => {
    render(<KnowledgeWorkspaceStatus item={item(configured, percentage)} />);

    const status = screen.getByRole("region", { name: "Workspace status" });
    expect(within(status).getByText(`${percentage}%`)).toBeVisible();
    expect(within(status).getByText(count)).toBeVisible();
    expect(within(status).getByRole("progressbar", { name: "Configuration completeness" }))
      .toHaveAttribute("aria-valuetext", `${percentage}% complete, ${count}`);
  });

  it("updates the count and accessible meter when the saved item changes", async () => {
    const view = render(<KnowledgeWorkspaceStatus item={item(["overview", "advanced", "recommendations"], 75)} />);
    const status = screen.getByRole("region", { name: "Workspace status" });
    expect(within(status).getByText("3 of 4 tabs configured")).toBeVisible();

    view.rerender(<KnowledgeWorkspaceStatus item={item(["overview", "advanced", "recommendations", "quality"], 100)} />);
    expect(within(status).getByText("4 of 4 tabs configured")).toBeVisible();
    expect(within(status).queryByText("3 of 4 tabs configured")).not.toBeInTheDocument();
    const meter = within(status).getByRole("progressbar", { name: "Configuration completeness" });
    expect(meter).toHaveAttribute("aria-valuenow", "100");
    expect(meter).toHaveAttribute("aria-valuetext", "100% complete, 4 of 4 tabs configured");
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps only the pinned Save reachable after the inline action scrolls away", () => {
    const command = { sectionLabel: "Overview", editable: true, dirty: true, saving: false,
      saveError: null, lastSavedAt: null, onSave: () => {} };
    const view = render(<KnowledgeWorkspaceStatus item={item(["overview"], 25)} command={command} pinnedSaveActive />);
    const inline = view.container.querySelector<HTMLButtonElement>(".knowledge-workspace-status__save");
    expect(inline).toHaveStyle({ visibility: "hidden" });
    expect(inline).toHaveAttribute("aria-hidden", "true");
    expect(inline).toHaveAttribute("tabindex", "-1");
    expect(inline).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save Overview" })).not.toBeInTheDocument();

    view.rerender(<KnowledgeWorkspaceStatus item={item(["overview"], 25)} command={command} />);
    expect(screen.getByRole("button", { name: "Save Overview" })).toBeVisible();
  });
});
