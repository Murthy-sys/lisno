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
  updatedAt: "2026-07-18T12:00:00.000Z",
  risk: {
    level: "yellow",
    reason: "Forecast completion crosses the deadline.",
    elapsedRatio: 0.72,
    progressRatio: 0.55,
    forecastCompletion: "2026-07-28T10:00:00.000Z"
  }
};

const teammateTask = {
  ...task,
  id: "task-teammate",
  title: "Teammate lighting plan",
  order: 3,
  ownerId: "user-designer-kabir",
  risk: {
    level: "red",
    reason: "Deadline passed while work is incomplete.",
    elapsedRatio: 1.1,
    progressRatio: 0.55
  }
};

const completedTask = {
  ...task,
  id: "task-completed",
  title: "Approved concept",
  order: 4,
  status: "completed",
  progress: 100,
  completedAt: "2026-07-18T12:00:00.000Z",
  risk: {
    level: "green",
    reason: "Completed on or before the current deadline.",
    elapsedRatio: 1,
    progressRatio: 1
  }
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
          tasks: [task, teammateTask, completedTask]
        }
      ]
    }
  ]
};

function response(data: unknown, init?: ResponseInit) {
  return Response.json({ data }, init);
}

function installWorkspaceApi(options?: {
  conflict?: boolean;
  mutationError?: boolean;
  holdUpload?: boolean;
  uploadError?: boolean;
}) {
  let currentTask = structuredClone(task);
  let projectReads = 0;
  const patchBodies: unknown[] = [];
  let uploadBody: FormData | undefined;
  const structureRequests: Array<{ path: string; body: unknown }> = [];
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
      hierarchy.floors[0]!.stages[0]!.tasks = [
        structuredClone(currentTask),
        structuredClone(teammateTask),
        structuredClone(completedTask)
      ];
      return response(hierarchy);
    }
    if (
      url === `/api/v1/projects/${project.id}/floors` &&
      init?.method === "POST"
    ) {
      structureRequests.push({
        path: url,
        body: JSON.parse(String(init.body))
      });
      return response({
        ...project.floors[0],
        id: "floor-terrace",
        name: "Terrace",
        number: "T",
        order: 2,
        progress: 0
      }, { status: 201 });
    }
    if (
      url === `/api/v1/floors/floor-ground/stages` &&
      init?.method === "POST"
    ) {
      structureRequests.push({
        path: url,
        body: JSON.parse(String(init.body))
      });
      return response({
        ...project.floors[0]!.stages[0],
        id: "stage-terrace",
        name: "Terrace concept",
        type: "concept_mood_board",
        order: 2,
        dependencyStageIds: []
      }, { status: 201 });
    }
    if (
      url === `/api/v1/stages/stage-plan/tasks` &&
      init?.method === "POST"
    ) {
      structureRequests.push({
        path: url,
        body: JSON.parse(String(init.body))
      });
      return response({
        ...task,
        id: "task-terrace",
        title: "Draft terrace concept",
        status: "not_started",
        progress: 0,
        version: 1
      }, { status: 201 });
    }
    if (url.includes("/kpis/")) {
      throw new Error("The project workspace must not request personal KPI pages.");
    }
    if (url.startsWith("/api/v1/tasks/") && url.includes("/events?")) {
      expect(url).toMatch(/sort=desc&limit=1&offset=0$/);
      const taskId = url.split("/tasks/")[1]!.split("/events")[0]!;
      return response({
        items: taskId === task.id ? [{
          id: "event-progress-newest",
          taskId,
          actorId: designer.id,
          type: "progress_changed",
          occurredAt: "2026-07-26T12:00:00.000Z",
          from: { progress: 54 },
          to: { progress: 55 },
          note: "Newest of more than twenty updates.",
          createdAt: "2026-07-26T12:00:00.000Z"
        }] : [],
        pagination: {
          limit: 1,
          offset: 0,
          total: taskId === task.id ? 25 : 0,
          hasMore: taskId === task.id
        }
      });
    }
    if (url === `/api/v1/tasks/${task.id}` && init?.method === "PATCH") {
      const inputBody = JSON.parse(String(init.body)) as {
        status: string;
        progress: number;
      };
      patchBodies.push(inputBody);
      if (options?.mutationError) {
        return Response.json(
          { error: { code: "REQUEST_FAILED", message: "Update unavailable." } },
          { status: 503 }
        );
      }
      if (options?.conflict && patchBodies.length === 1) {
        currentTask = {
          ...currentTask,
          status: "in_review",
          progress: 70,
          latestUpdateAt: "2026-07-26T08:00:00.000Z",
          version: 4,
          updatedAt: "2026-07-26T08:00:00.000Z"
        };
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
        status: inputBody.status,
        progress: inputBody.progress,
        latestUpdateAt: "2026-07-26T08:00:00.000Z",
        version: currentTask.version + 1,
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
    getPatchBodies: () => patchBodies,
    getUploadBody: () => uploadBody,
    getProjectReads: () => projectReads,
    getStructureRequests: () => structureRequests,
    releaseUpload
  };
}

async function expandTask() {
  await userEvent.click(await screen.findByRole("button", { name: /Ground Floor/ }));
  await userEvent.click(screen.getByRole("button", { name: /Floor plan/ }));
}

describe("ProjectWorkspace", () => {
  it("creates floors, stages, and tasks through labeled accessible controls", async () => {
    tokenStorage.set("valid-token");
    const api = installWorkspaceApi();
    const user = userEvent.setup();
    renderApp([`/designer/projects/${project.id}`]);

    await screen.findByRole("heading", { name: "Aurora Villa" });
    await user.click(screen.getByRole("button", { name: "Add floor" }));
    const floorDialog = screen.getByRole("dialog", { name: "Add floor" });
    await user.type(within(floorDialog).getByLabelText("Floor name"), "Terrace");
    await user.type(within(floorDialog).getByLabelText("Floor number"), "T");
    await user.clear(within(floorDialog).getByLabelText("Floor order"));
    await user.type(within(floorDialog).getByLabelText("Floor order"), "2");
    await user.type(
      within(floorDialog).getByLabelText("Planned start"),
      "2026-08-01T09:00"
    );
    await user.type(
      within(floorDialog).getByLabelText("Planned end"),
      "2026-08-31T17:00"
    );
    await user.click(
      within(floorDialog).getByRole("button", { name: "Create floor" })
    );

    await user.click(await screen.findByRole("button", { name: /Ground Floor/ }));
    await user.click(screen.getByRole("button", { name: "Add stage to Ground Floor" }));
    const stageDialog = screen.getByRole("dialog", { name: "Add stage" });
    await user.type(
      within(stageDialog).getByLabelText("Stage name"),
      "Terrace concept"
    );
    await user.selectOptions(
      within(stageDialog).getByLabelText("Stage type"),
      "concept_mood_board"
    );
    await user.clear(within(stageDialog).getByLabelText("Stage order"));
    await user.type(within(stageDialog).getByLabelText("Stage order"), "2");
    await user.click(
      within(stageDialog).getByRole("button", { name: "Create stage" })
    );

    await user.click(await screen.findByRole("button", { name: /Floor plan/ }));
    await user.click(screen.getByRole("button", { name: "Add task to Floor plan" }));
    const taskDialog = screen.getByRole("dialog", { name: "Add task" });
    await user.type(
      within(taskDialog).getByLabelText("Task title"),
      "Draft terrace concept"
    );
    await user.selectOptions(
      within(taskDialog).getByLabelText("Task owner"),
      designer.id
    );
    await user.clear(within(taskDialog).getByLabelText("Task order"));
    await user.type(within(taskDialog).getByLabelText("Task order"), "5");
    await user.type(
      within(taskDialog).getByLabelText("Planned start"),
      "2026-08-01T09:00"
    );
    await user.type(
      within(taskDialog).getByLabelText("Original deadline"),
      "2026-08-15T17:00"
    );
    await user.type(
      within(taskDialog).getByLabelText("Planned effort"),
      "12"
    );
    await user.click(
      within(taskDialog).getByRole("button", { name: "Create task" })
    );

    await waitFor(() => expect(api.getStructureRequests()).toHaveLength(3));
    expect(api.getStructureRequests()).toEqual([
      {
        path: `/api/v1/projects/${project.id}/floors`,
        body: {
          name: "Terrace",
          number: "T",
          order: 2,
          plannedStartAt: new Date("2026-08-01T09:00").toISOString(),
          plannedEndAt: new Date("2026-08-31T17:00").toISOString()
        }
      },
      {
        path: "/api/v1/floors/floor-ground/stages",
        body: {
          name: "Terrace concept",
          type: "concept_mood_board",
          order: 2
        }
      },
      {
        path: "/api/v1/stages/stage-plan/tasks",
        body: {
          title: "Draft terrace concept",
          order: 5,
          ownerId: designer.id,
          plannedStartAt: new Date("2026-08-01T09:00").toISOString(),
          originalDeadlineAt: new Date("2026-08-15T17:00").toISOString(),
          plannedEffort: 12
        }
      }
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Draft terrace concept was added."
    );
  });

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
    expect(
      await within(row).findByText("Newest of more than twenty updates.")
    ).toBeVisible();
  });

  it("allows mutations only for owned incomplete tasks and explains read-only rows", async () => {
    tokenStorage.set("valid-token");
    installWorkspaceApi();
    renderApp([`/designer/projects/${project.id}`]);
    await expandTask();

    const owned = screen.getByRole("article", { name: task.title });
    expect(within(owned).getByRole("button", {
      name: `Update ${task.title}`
    })).toBeEnabled();
    expect(within(owned).getByRole("button", {
      name: `Upload design for ${task.title}`
    })).toBeEnabled();

    const teammate = screen.getByRole("article", { name: teammateTask.title });
    expect(within(teammate).getByText("Red risk")).toBeVisible();
    expect(
      within(teammate).getByText("Deadline passed while work is incomplete.")
    ).toBeVisible();
    expect(within(teammate).getByText("Assigned to teammate")).toBeVisible();
    expect(within(teammate).queryByRole("button", { name: /Update/ }))
      .not.toBeInTheDocument();
    expect(within(teammate).queryByRole("button", { name: /Upload design/ }))
      .not.toBeInTheDocument();

    const completed = screen.getByRole("article", { name: completedTask.title });
    expect(within(completed).getByText("Completed")).toBeVisible();
    expect(within(completed).queryByRole("button", { name: /Update/ }))
      .not.toBeInTheDocument();
    expect(within(completed).queryByRole("button", { name: /Upload design/ }))
      .not.toBeInTheDocument();
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
    expect(api.getPatchBodies()).toEqual([{
      version: 3,
      status: "blocked",
      progress: 60,
      note: "Waiting for structural confirmation."
    }]);
    expect(screen.queryByRole("dialog", { name: "Update task" }))
      .not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByText("Blocked")).toBeVisible();
    expect(screen.getByText("60% complete")).toBeVisible();
  });

  it("requires review of refreshed values before resubmitting after a version conflict", async () => {
    tokenStorage.set("valid-token");
    const api = installWorkspaceApi({ conflict: true });
    const user = userEvent.setup();
    renderApp([`/designer/projects/${project.id}`]);
    await expandTask();

    await user.click(screen.getByRole("button", {
      name: "Update Circulation planning"
    }));
    const dialog = screen.getByRole("dialog", { name: "Update task" });
    await user.selectOptions(within(dialog).getByLabelText("Status"), "blocked");
    await user.clear(within(dialog).getByLabelText("Progress"));
    await user.type(within(dialog).getByLabelText("Progress"), "60");
    await user.type(
      within(dialog).getByLabelText(/^Note/),
      "This stale note must be discarded."
    );
    await user.click(within(dialog).getByRole("button", { name: "Save update" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This task changed on the server"
    );
    await waitFor(() => expect(api.getProjectReads()).toBeGreaterThan(1));
    expect(within(dialog).getByLabelText("Status")).toHaveValue("in_review");
    expect(within(dialog).getByLabelText("Progress")).toHaveValue(70);
    expect(within(dialog).getByLabelText(/^Note/)).toHaveValue("");
    const save = within(dialog).getByRole("button", { name: "Save update" });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(api.getPatchBodies()).toHaveLength(1);

    await user.click(
      within(dialog).getByRole("button", { name: "Review refreshed values" })
    );
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(api.getPatchBodies()).toHaveLength(2));
    expect(api.getPatchBodies()[1]).toEqual({
      version: 4,
      status: "in_review",
      progress: 70
    });
  });

  it("does not refetch or invalidate project data after a failed task update", async () => {
    tokenStorage.set("valid-token");
    const api = installWorkspaceApi({ mutationError: true });
    const user = userEvent.setup();
    renderApp([`/designer/projects/${project.id}`]);
    await expandTask();

    await user.click(screen.getByRole("button", {
      name: "Update Circulation planning"
    }));
    await user.clear(screen.getByLabelText("Progress"));
    await user.type(screen.getByLabelText("Progress"), "60");
    await user.click(screen.getByRole("button", { name: "Save update" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Update unavailable."
    );
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(api.getProjectReads()).toBe(1);
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
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Upload design" })).toBeVisible();
    api.releaseUpload();
    await waitFor(() => expect(api.getProjectReads()).toBeGreaterThan(1));
    expect(api.getUploadBody()?.get("file")).toEqual(file);
    expect(screen.getByRole("status")).toHaveTextContent(
      "circulation.pdf uploaded as version 2."
    );
  });

  it("keeps the upload dialog open and explains a server file error", async () => {
    tokenStorage.set("valid-token");
    const api = installWorkspaceApi({ uploadError: true });
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
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(api.getProjectReads()).toBe(1);
  });

  it("accepts only backend-supported upload MIME types and formats kilobytes", async () => {
    tokenStorage.set("valid-token");
    const api = installWorkspaceApi();
    const user = userEvent.setup();
    renderApp([`/designer/projects/${project.id}`]);
    await expandTask();

    await user.click(screen.getByRole("button", {
      name: "Upload design for Circulation planning"
    }));
    const dialog = screen.getByRole("dialog", { name: "Upload design" });
    const input = within(dialog).getByLabelText("Design file");
    expect(input).toHaveAttribute(
      "accept",
      "application/pdf,image/png,image/jpeg,image/webp"
    );

    const png = new File([new Uint8Array(2048)], "plan.png", {
      type: "image/png"
    });
    await user.upload(input, png);
    expect(within(dialog).getByText("plan.png · 2.0 KB")).toBeVisible();

    const emptyMimePdf = new File(["%PDF-1.7\n%%EOF"], "Software data R1.pdf", {
      type: ""
    });
    fireEvent.change(input, { target: { files: [emptyMimePdf] } });
    await user.click(within(dialog).getByRole("button", { name: "Upload file" }));
    await waitFor(() => expect(api.getUploadBody()?.get("file")).toEqual(emptyMimePdf));

    await user.click(screen.getByRole("button", {
      name: "Upload design for Circulation planning"
    }));
    const genericMimeDialog = screen.getByRole("dialog", { name: "Upload design" });
    const genericMimePdf = new File(["%PDF-1.7\n%%EOF"], "plan.pdf", {
      type: "application/octet-stream"
    });
    fireEvent.change(within(genericMimeDialog).getByLabelText("Design file"), {
      target: { files: [genericMimePdf] }
    });
    await user.click(
      within(genericMimeDialog).getByRole("button", { name: "Upload file" })
    );
    await waitFor(() => expect(api.getUploadBody()?.get("file")).toEqual(genericMimePdf));

    await user.click(screen.getByRole("button", {
      name: "Upload design for Circulation planning"
    }));
    const invalidDialog = screen.getByRole("dialog", { name: "Upload design" });
    const invalidInput = within(invalidDialog).getByLabelText("Design file");

    fireEvent.change(invalidInput, {
      target: {
        files: [new File(["notes"], "notes.txt", { type: "" })]
      }
    });
    await user.click(within(invalidDialog).getByRole("button", { name: "Upload file" }));
    expect(within(invalidDialog).getByRole("alert")).toHaveTextContent(
      "Only PDF, PNG, JPEG, and WebP files are supported."
    );

    fireEvent.change(invalidInput, {
      target: {
        files: [new File(["MZ"], "plan.exe", { type: "application/octet-stream" })]
      }
    });
    await user.click(within(invalidDialog).getByRole("button", { name: "Upload file" }));
    expect(within(invalidDialog).getByRole("alert")).toHaveTextContent(
      "Only PDF, PNG, JPEG, and WebP files are supported."
    );
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
