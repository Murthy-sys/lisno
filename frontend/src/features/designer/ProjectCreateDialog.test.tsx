import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Project, PublicUser } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { ProjectCreateDialog } from "./ProjectCreateDialog";

const designer: PublicUser = {
  id: "user-designer-ananya",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer"
};

function DialogHarness() {
  const [open, setOpen] = useState(true);
  return open ? (
    <ProjectCreateDialog
      user={designer}
      onClose={() => setOpen(false)}
      onCreated={(_project: Project) => undefined}
    />
  ) : null;
}

describe("ProjectCreateDialog", () => {
  it("uses the first Escape to close manager options and a later Escape to close the dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/v1/organization/managers?")) {
        return Response.json({
          data: {
            items: [{
              id: "user-manager-aarav",
              name: "Aarav Mehta",
              email: "aarav@lisno.example",
              mobile: "+91 98765 00001"
            }],
            pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
          }
        });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();
    renderWithQuery(<DialogHarness />);

    const dialog = screen.getByRole("dialog", { name: "Create project" });
    const manager = within(dialog).getByRole("combobox", { name: "Project manager" });
    await user.click(manager);
    expect(manager).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Create project" })).toBeVisible();
    expect(manager).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Create project" })).not.toBeInTheDocument();
  });
});
