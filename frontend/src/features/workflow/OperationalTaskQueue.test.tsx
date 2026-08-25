import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import type { ProjectWorkflowTask } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { OperationalTaskQueue } from "./OperationalTaskQueue";

const carpenterTask: ProjectWorkflowTask = {
  id: "workflow-task-1",
  projectId: "project-1",
  projectName: "Aurora Villa",
  estimateId: "estimate-1",
  kind: "trade_execution",
  title: "Carpentry · Living Room",
  description: "Execute the approved wardrobe estimate section.",
  assigneeRole: "worker_carpenter",
  sourceSectionId: "CA",
  roomName: "Living Room",
  status: "open",
  openedAt: "2026-08-25T08:15:00.000Z"
};

describe("OperationalTaskQueue", () => {
  it("renders the approved-design role queue with trade and room context", async () => {
    server.use(
      http.get("/api/v1/workflow-tasks", () =>
        HttpResponse.json({ data: [carpenterTask] })
      )
    );

    renderWithQuery(<OperationalTaskQueue />);

    await screen.findByRole("heading", { name: "Carpentry · Living Room" });
    const queue = screen.getByRole("region", { name: "Your project tasks" });
    expect(within(queue).getByText("1 open")).toBeVisible();
    expect(within(queue).getByRole("heading", { name: "Carpentry · Living Room" })).toBeVisible();
    expect(within(queue).getByText("Aurora Villa")).toBeVisible();
    expect(within(queue).getByText("Carpenter")).toBeVisible();
    expect(within(queue).getByText("Living Room")).toBeVisible();
    expect(within(queue).getByText("25 Aug 2026, 08:15")).toBeVisible();
  });
});
