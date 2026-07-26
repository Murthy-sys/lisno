import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const designer = {
  id: "user-designer-ananya",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer" as const
};

const task = {
  id: "task-circulation",
  projectId: "project-aurora-villa",
  floorId: "floor-ground",
  stageId: "stage-plan",
  title: "Circulation planning",
  description: "Resolve primary movement paths.",
  order: 2,
  ownerId: designer.id,
  plannedStartAt: "2026-07-01T09:00:00.000Z",
  originalDeadlineAt: "2026-07-20T17:00:00.000Z",
  currentDeadlineAt: "2026-07-25T17:00:00.000Z",
  plannedEffort: 16,
  progress: 55,
  dependencyTaskIds: [],
  latestUpdateAt: "2026-07-18T12:00:00.000Z",
  status: "in_progress",
  completedAt: null,
  version: 3,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z"
};

const project = {
  id: "project-aurora-villa",
  name: "Aurora Villa",
  clientId: "user-client-aurora",
  initiatingDesignerId: designer.id,
  assignedDesignerIds: [designer.id],
  managerId: "user-manager-aarav",
  status: "active",
  location: "Bengaluru",
  plannedStartAt: "2026-06-01T09:00:00.000Z",
  plannedEndAt: "2026-09-30T17:00:00.000Z",
  actualStartAt: "2026-06-01T09:00:00.000Z",
  actualEndAt: null,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
  floors: [
    {
      id: "floor-ground",
      projectId: "project-aurora-villa",
      name: "Ground Floor",
      number: "G",
      order: 1,
      progress: 45,
      plannedStartAt: "2026-06-01T09:00:00.000Z",
      plannedEndAt: "2026-08-15T17:00:00.000Z",
      actualStartAt: "2026-06-01T09:00:00.000Z",
      actualEndAt: null,
      createdAt: "2026-06-01T08:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z",
      stages: [
        {
          id: "stage-plan",
          projectId: "project-aurora-villa",
          floorId: "floor-ground",
          name: "Floor plan",
          type: "floor_plan",
          order: 1,
          dependencyStageIds: [],
          createdAt: "2026-06-01T08:00:00.000Z",
          updatedAt: "2026-07-18T12:00:00.000Z",
          tasks: [task]
        }
      ]
    }
  ]
};

const riskTask = {
  id: task.id,
  projectId: task.projectId,
  title: task.title,
  status: task.status,
  progress: task.progress,
  currentDeadlineAt: task.currentDeadlineAt,
  plannedEffort: task.plannedEffort,
  risk: {
    level: "yellow",
    reason: "Forecast completion crosses the deadline.",
    elapsedRatio: 0.72,
    progressRatio: 0.55,
    forecastCompletion: "2026-07-28T10:00:00.000Z"
  },
  events: {
    items: [
      {
        id: "event-progress-1",
        taskId: task.id,
        actorId: designer.id,
        type: "progress_changed",
        occurredAt: "2026-07-18T12:00:00.000Z",
        from: { progress: 40 },
        to: { progress: 55 },
        note: "Paths aligned with furniture.",
        createdAt: "2026-07-18T12:00:00.000Z"
      }
    ],
    href: `/api/v1/tasks/${task.id}/events`,
    pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
  }
};

function response(data: unknown, init?: ResponseInit) {
  return Response.json({ data }, init);
}

function installWorkspaceApi(options?: {
  conflict?: boolean;
  holdUpload?: boolean;
  uploadError?: boolean;
}) {
  let currentTask = structuredClone(task);
  let projectReads = 0;
  let kpiReads = 0;
  let patchBody: unknown;
  let uploadBody: FormData | undefined;
  let releaseUpload: () => void = () => {};
  const uploadGate = options?.holdUpload
    ? new Promise<void>((resolve) => {
        releaseUpload = resolve;
      })
    : Promise.resolve();

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return response(designer);
    if (url === `/api/v1/projects/${project.id}`) {
      projectReads += 1;
      const hierarchy = structuredClone(project);
      hierarchy.floors[0]!.stages[0]!.tasks = [structuredClone(currentTask)];
      return response(hierarchy);
    }
    if (url.startsWith(`/api/v1/kpis/users/${designer.id}?`)) {
      kpiReads += 1;
      return response({
        userId: designer.id,
        periodStartAt: "2000-01-01T00:00:00.000Z",
        periodEndAt: "2100-01-01T00:00:00.000Z",
        score: 84,
        components: [],
        tasks: {
          items: [{ ...riskTask, status: currentTask.status, progress: currentTask.progress }],
          pagination: { limit: 100, offset: 0, total: 1, hasMore: false }
        }
      });
    }
    if (url === `/api/v1/tasks/${task.id}` && init?.method === "PATCH") {
      patchBody = JSON.parse(String(init.body));
      if (options?.conflict) {
        return Response.json(
          {
            error: {
              code: "VERSION_CONFLICT",
              message: "Task has version 4, expected 3."
            }
          },
          { status: 409 }
        );
      }
      currentTask = {
        ...currentTask,
        status: "blocked",
        progress: 60,
        latestUpdateAt: "2026-07-26T08:00:00.000Z",
        version: 4,
        updatedAt: "2026-07-26T08:00:00.000Z"
      };
      return response(currentTask);
    }
    if (
      url === `/api/v1/tasks/${task.id}/design-versions` &&
      init?.method === "POST"
    ) {
      uploadBody = init.body as FormData;
      await uploadGate;
      if (options?.uploadError) {
        return Response.json(
          {
            error: {
              code: "UNSUPPORTED_FILE_TYPE",
              message: "The uploaded file type is not supported."
            }
          },
          { status: 415 }
        );
      }
      return response({
        id: "version-2",
        projectId: project.id,
        floorId: task.floorId,
        stageId: task.stageId,
        taskId: task.id,
        versionNumber: 2,
        originalFilename: "circulation.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        uploaderId: designer.id,
        uploadedAt: "2026-07-26T08:00:00.000Z",
        approvalStatus: "draft",
        reviewerId: null,
        approvedAt: null,
        clientVisible: false,
        createdAt: "2026-07-26T08:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z"
      }, { status: 201 });
    }
    throw new Error(`Unhandled request: ${url}`);
  });

  return {
    getPatchBody: () => patchBody,
    getUploadBody: () => uploadBody,
    getProjectReads: () => projectReads,
    getKpiReads: () => kpiReads,
    releaseUpload
  };
}

async function expandTask() {
  await userEvent.click(await screen.findByRole("button", { name: /Ground Floor/ }));
  await userEvent.click(screen.getByRole("button", { name: /Floor plan/ }));
}

describe("ProjectWorkspace", () => {
  it("uses accessible floor and stage disclosures and shows ordered task details with server risk", async () => {
    tokenStorage.set("valid-token");
    installWorkspaceApi();
    renderApp([`/designer/projects/${project.id}`]);

    expect(await screen.findByRole("heading", { name: "Aurora Villa" })).toBeVisible();
    const floorButton = screen.getByRole("button", { name: /Ground Floor/ });
    expect(floorButton).toHaveAttribute("aria-expanded", "false");
    await expandTask();
    expect(floorButton).toHaveAttribute("aria-expanded", "true");

    const row = screen.getByRole("article", { name: "Circulation planning" });
    expect(within(row).getByText("In progress")).toBeVisible();
    expect(within(row).getByText("55% complete")).toBeVisible();
    expect(within(row).getByText("Yellow risk")).toBeVisible();
    expect(
      within(row).getByText("Forecast completion crosses the deadline.")
    ).toBeVisible();
    expect(within(row).getByText("Original: 20 Jul 2026")).toBeVisible();
    expect(within(row).getByText("Current: 25 Jul 2026")).toBeVisible();
    expect(within(row).getByText("16 hours")).toBeVisible();
    expect(within(row).getByText("Updated 18 Jul 2026")).toBeVisible();
    expect(within(row).getByText("Paths aligned with furniture.")).toBeVisible();
  });

  it("validates a blocked note, submits versioned updates, and refreshes project and KPI queries", async () => {
    tokenStorage.set("valid-token");
    const api = installWorkspaceApi();
    const user = userEvent.setup();
    renderApp([`/designer/projects/${project.id}`]);
    await expandTask();

    const trigger = screen.getByRole("button", {
      name: "Update Circulation planning"
    });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Update task" });
    expect(document.body.style.overflow).toBe("hidden");
    await user.selectOptions(within(dialog).getByLabelText("Status"), "blocked");
    await user.clear(within(dialog).getByLabelText("Progress"));
    await user.type(within(dialog).getByLabelText("Progress"), "60");
    await user.click(within(dialog).getByRole("button", { name: "Save update" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Add a note explaining what is blocking this task."
    );

    await user.type(
      within(dialog).getByLabelText(/^Note/),
      "Waiting for structural confirmation."
    );
    await user.click(within(dialog).getByRole("button", { name: "Save update" }));

    await waitFor(() => expect(api.getProjectReads()).toBeGreaterThan(1));
    await waitFor(() => expect(api.getKpiReads()).toBeGreaterThan(1));
    expect(api.getPatchBody()).toEqual({
      version: 3,
      status: "blocked",
      progress: 60,
      note: "Waiting for structural confirmation."
    });
    expect(screen.queryByRole("dialog", { name: "Update task" }))
      .not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByText("Blocked")).toBeVisible();
    expect(screen.getByText("60% complete")).toBeVisible();
  });

  it("keeps the update dialog open and refreshes stale data after an optimistic conflict", async () => {
    tokenStorage.set("valid-token");
    const api = installWorkspaceApi({ conflict: true });
    const user = userEvent.setup();
    renderApp([`/designer/projects/${project.id}`]);
    await expandTask();

    await user.click(screen.getByRole("button", {
      name: "Update Circulation planning"
    }));
    const dialog = screen.getByRole("dialog", { name: "Update task" });
    await user.clear(within(dialog).getByLabelText("Progress"));
    await user.type(within(dialog).getByLabelText("Progress"), "60");
    await user.click(within(dialog).getByRole("button", { name: "Save update" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This task changed on the server"
    );
    await waitFor(() => expect(api.getProjectReads()).toBeGreaterThan(1));
    await waitFor(() => expect(api.getKpiReads()).toBeGreaterThan(1));
  });

  it("uploads an accepted PDF and refreshes task data", async () => {
    tokenStorage.set("valid-token");
    const api = installWorkspaceApi({ holdUpload: true });
    const user = userEvent.setup();
    renderApp([`/designer/projects/${project.id}`]);
    await expandTask();

    await user.click(screen.getByRole("button", {
      name: "Upload design for Circulation planning"
    }));
    const dialog = screen.getByRole("dialog", { name: "Upload design" });
    const file = new File(["%PDF-1.7"], "circulation.pdf", {
      type: "application/pdf"
    });
    await user.upload(within(dialog).getByLabelText("Design file"), file);
    await user.click(within(dialog).getByRole("button", { name: "Upload file" }));

    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Uploading securely"
    );
    expect(within(dialog).getByRole("progressbar", { name: "Upload in progress" }))
      .not.toHaveAttribute("aria-valuenow");
    api.releaseUpload();
    await waitFor(() => expect(api.getProjectReads()).toBeGreaterThan(1));
    await waitFor(() => expect(api.getKpiReads()).toBeGreaterThan(1));
    expect(api.getUploadBody()?.get("file")).toEqual(file);
    expect(screen.getByRole("status")).toHaveTextContent(
      "circulation.pdf uploaded as version 2."
    );
  });

  it("keeps the upload dialog open and explains a server file error", async () => {
    tokenStorage.set("valid-token");
    installWorkspaceApi({ uploadError: true });
    const user = userEvent.setup();
    renderApp([`/designer/projects/${project.id}`]);
    await expandTask();

    await user.click(screen.getByRole("button", {
      name: "Upload design for Circulation planning"
    }));
    const dialog = screen.getByRole("dialog", { name: "Upload design" });
    await user.upload(
      within(dialog).getByLabelText("Design file"),
      new File(["%PDF-1.7"], "spoofed.pdf", { type: "application/pdf" })
    );
    await user.click(within(dialog).getByRole("button", { name: "Upload file" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The uploaded file type is not supported."
    );
    expect(screen.getByRole("dialog", { name: "Upload design" })).toBeVisible();
  });

  it("closes task dialogs with Escape and restores focus", async () => {
    tokenStorage.set("valid-token");
    installWorkspaceApi();
    const user = userEvent.setup();
    renderApp([`/designer/projects/${project.id}`]);
    await expandTask();

    const trigger = screen.getByRole("button", {
      name: "Update Circulation planning"
    });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Update task" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Update task" }))
      .not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
