import { screen } from "@testing-library/react";
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
            floors: []
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
                versionNumber: 101,
                originalFilename: "Second page.pdf",
                approvalStatus: "in_review",
                clientVisible: false
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
                action: "task_deadline_revised",
                occurredAt: "2026-09-01T00:00:00.000Z"
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
    expect(await screen.findByText("task_deadline_revised")).toBeVisible();
  });
});
