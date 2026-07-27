import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

describe("ManagementProjectWorkspace", () => {
  it("loads every design-version and project-activity page", async () => {
    tokenStorage.set("manager-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") {
        return Response.json({
          data: {
            id: "manager-1",
            name: "Aarav Shah",
            email: "aarav@lisno.example",
            role: "design_manager"
          }
        });
      }
      if (url === "/api/v1/projects/project-1") {
        return Response.json({
          data: {
            id: "project-1",
            name: "Aurora Villa",
            status: "active",
            location: "Bengaluru",
            floors: [
              {
                id: "floor-1",
                projectId: "project-1",
                name: "Ground floor",
                number: "G",
                order: 1,
                progress: 80,
                plannedStartAt: "2026-07-01T09:00:00.000Z",
                plannedEndAt: "2026-09-01T17:00:00.000Z",
                actualStartAt: null,
                actualEndAt: null,
                createdAt: "2026-07-01T09:00:00.000Z",
                updatedAt: "2026-07-22T09:15:00.000Z",
                stages: [
                  {
                    id: "stage-1",
                    projectId: "project-1",
                    floorId: "floor-1",
                    name: "Floor plan",
                    type: "floor_plan",
                    order: 1,
                    dependencyStageIds: [],
                    createdAt: "2026-07-01T09:00:00.000Z",
                    updatedAt: "2026-07-22T09:15:00.000Z",
                    tasks: [
                      {
                        id: "task-1",
                        projectId: "project-1",
                        floorId: "floor-1",
                        stageId: "stage-1",
                        title: "Draft furniture layout",
                        description: "",
                        order: 1,
                        ownerId: "user-designer-ananya",
                        plannedStartAt: "2026-07-01T09:00:00.000Z",
                        originalDeadlineAt: "2026-07-20T17:00:00.000Z",
                        currentDeadlineAt: "2026-08-03T17:00:00.000Z",
                        plannedEffort: 8,
                        progress: 80,
                        dependencyTaskIds: [],
                        latestUpdateAt: "2026-07-22T09:15:00.000Z",
                        status: "in_progress",
                        completedAt: null,
                        version: 2,
                        createdAt: "2026-07-01T09:00:00.000Z",
                        updatedAt: "2026-07-22T09:15:00.000Z",
                        risk: {
                          level: "green",
                          reason: "Task is on track.",
                          elapsedRatio: 0.4,
                          progressRatio: 0.8
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        });
      }
      if (
        url ===
        "/api/v1/projects/project-1/design-versions?limit=100&offset=0"
      ) {
        return Response.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 101, hasMore: true }
          }
        });
      }
      if (
        url ===
        "/api/v1/projects/project-1/design-versions?limit=100&offset=100"
      ) {
        return Response.json({
          data: {
            items: [
              {
                id: "version-page-two",
                projectId: "project-1",
                floorId: "floor-1",
                stageId: "stage-1",
                taskId: "task-1",
                versionNumber: 101,
                originalFilename: "Second page.pdf",
                mimeType: "application/pdf",
                sizeBytes: 2048,
                uploaderId: "user-designer-ananya",
                uploadedAt: "2026-07-20T10:00:00.000Z",
                approvalStatus: "approved",
                reviewerId: "user-manager-aarav",
                approvedAt: "2026-07-21T11:30:00.000Z",
                clientVisible: true,
                createdAt: "2026-07-20T10:00:00.000Z",
                updatedAt: "2026-07-21T11:30:00.000Z"
              }
            ],
            pagination: {
              limit: 100,
              offset: 100,
              total: 101,
              hasMore: false
            }
          }
        });
      }
      if (
        url === "/api/v1/projects/project-1/activity?limit=100&offset=0"
      ) {
        return Response.json({
          data: {
            items: [],
            pagination: { limit: 100, offset: 0, total: 101, hasMore: true }
          }
        });
      }
      if (
        url === "/api/v1/projects/project-1/activity?limit=100&offset=100"
      ) {
        return Response.json({
          data: {
            items: [
              {
                id: "activity-page-two",
                actorId: "user-manager-aarav",
                action: "task_deadline_revised",
                entityType: "task",
                entityId: "task-1",
                occurredAt: "2026-07-22T09:15:00.000Z",
                oldValues: {
                  currentDeadlineAt: "2026-07-20T17:00:00.000Z"
                },
                newValues: {
                  currentDeadlineAt: "2026-08-03T17:00:00.000Z"
                },
                reason: "Client requested coordination time",
                createdAt: "2026-07-22T09:15:00.000Z"
              }
            ],
            pagination: {
              limit: 100,
              offset: 100,
              total: 101,
              hasMore: false
            }
          }
        });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/manager/projects/project-1"]);

    expect(
      await screen.findByRole("heading", { name: "Aurora Villa" })
    ).toBeVisible();
    expect(await screen.findByText(/Second page.pdf/)).toBeVisible();
    expect(screen.getByText("Original deadline: 20 Jul 2026")).toBeVisible();
    expect(screen.getByText("Current deadline: 03 Aug 2026")).toBeVisible();
    expect(
      screen.getByText(
        "Uploaded 20 Jul 2026, 10:00 by user-designer-ananya"
      )
    ).toBeVisible();
    expect(
      screen.getByText(
        "approved · Approved 21 Jul 2026, 11:30 by user-manager-aarav · client visible"
      )
    ).toBeVisible();
    const activity = (await screen.findByText("task_deadline_revised")).closest(
      "li"
    )!;
    expect(
      within(activity).getByText("Task: Draft furniture layout (task-1)")
    ).toBeVisible();
    expect(
      within(activity).getByText(
        "Actor: user-manager-aarav · 22 Jul 2026, 09:15"
      )
    ).toBeVisible();
    expect(
      within(activity).getByText(
        "Changes: currentDeadlineAt: 20 Jul 2026, 17:00 → 03 Aug 2026, 17:00"
      )
    ).toBeVisible();
    expect(
      within(activity).getByText(
        "Reason: Client requested coordination time"
      )
    ).toBeVisible();
  });
});
