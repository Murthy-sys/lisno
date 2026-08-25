import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import type { AdminProjectSummary, DesignPlanTask } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { DesignAssignmentPanel } from "./DesignAssignmentPanel";

const project: AdminProjectSummary = {
  id: "project-1",
  name: "Aurora Villa",
  status: "planning",
  location: "Pune",
  client: {
    name: "Priya Shah",
    email: "priya@example.com",
    mobile: "+91 90000 00000"
  },
  propertyType: "3BHK",
  budgetMin: 800000,
  budgetMax: 1200000,
  estimator: null,
  lead: null,
  estimate: {
    id: "estimate-1",
    status: "client_approved",
    total: 975000,
    designPlanStatus: "pending_assignment",
    designPlanVersion: 0,
    designPlanDesigner: null
  },
  createdAt: "2026-08-23T10:00:00.000Z"
};

const assignedTask: DesignPlanTask = {
  id: "design-task-1",
  estimateId: "estimate-1",
  projectId: project.id,
  projectName: project.name,
  clientName: project.client.name,
  status: "assigned",
  designPlanVersion: 0,
  rooms: [],
  scopes: [],
  lineItems: []
};

describe("DesignAssignmentPanel", () => {
  it("posts the selected Designer for an approved estimate", async () => {
    let submittedBody: unknown;
    server.use(
      http.get("/api/v1/admin/designers", () =>
        HttpResponse.json({
          data: [
            {
              id: "designer-1",
              name: "Ananya Rao",
              email: "ananya@lisno.example"
            }
          ]
        })
      ),
      http.post(
        "/api/v1/admin/projects/project-1/design-assignment",
        async ({ request }) => {
          submittedBody = await request.json();
          return HttpResponse.json({ data: assignedTask });
        }
      )
    );
    const user = userEvent.setup();

    renderWithQuery(<DesignAssignmentPanel project={project} />);

    await screen.findByRole("option", { name: "Ananya Rao · ananya@lisno.example" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Assigned Designer" }),
      "designer-1"
    );
    await user.click(screen.getByRole("button", { name: "Assign Designer" }));

    await waitFor(() =>
      expect(submittedBody).toEqual({ designerId: "designer-1" })
    );
    expect(
      await screen.findByText("Designer assigned. The design-plan task is open.")
    ).toHaveAttribute("role", "status");
  });
});
