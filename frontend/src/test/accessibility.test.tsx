import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { StrictMode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../api/client";
import {
  OPERATIONAL_ROLES,
  ROLE_CODES,
  type PermissionCode,
  type Role
} from "../api/authorization-contract";
import type {
  UserInvitationItem,
  UserInvitationPage
} from "../api/types";
import { AuthProvider } from "../auth/AuthProvider";
import { InvitationAcceptancePage } from "../auth/InvitationAcceptancePage";
import { FeedbackProvider } from "../components/feedback/FeedbackProvider";
import { authorizationFor } from "./authFixtures";
import { renderApp } from "./render";
import { renderWithQuery } from "./render";
import { server } from "./server";
import { UserInvitationsPanel } from "../features/admin/UserInvitationsPanel";
import { DesignUploadsWorkspace } from "../features/designer/DesignUploadsWorkspace";
import { DesignSectionReview } from "../features/client/DesignSectionReview";

const userFor = (role: Role) => ({ id: `${role}-1`, name: "Accessible Person", email: `${role}@lisno.example`, role });

const accessibleProject = {
  id: "project-a11y",
  name: "Accessible residence",
  clientId: "client-1",
  initiatingDesignerId: "designer-1",
  assignedEstimatorId: null,
  assignedDesignerIds: ["designer-1"],
  managerId: "manager-1",
  status: "active",
  location: "Bengaluru",
  plannedStartAt: "2026-07-01T00:00:00.000Z",
  plannedEndAt: "2026-08-01T00:00:00.000Z",
  actualStartAt: null,
  actualEndAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  floors: [{
    id: "floor-a11y",
    projectId: "project-a11y",
    name: "Accessible floor",
    number: "G",
    order: 1,
    progress: 50,
    plannedStartAt: "2026-07-01T00:00:00.000Z",
    plannedEndAt: "2026-08-01T00:00:00.000Z",
    actualStartAt: null,
    actualEndAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    stages: [{
      id: "stage-a11y",
      projectId: "project-a11y",
      floorId: "floor-a11y",
      name: "Accessible planning",
      type: "floor_plan",
      order: 1,
      dependencyStageIds: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      tasks: [{
        id: "task-a11y",
        projectId: "project-a11y",
        floorId: "floor-a11y",
        stageId: "stage-a11y",
        title: "Accessible task",
        description: "A task with an explicit textual risk signal.",
        order: 1,
        ownerId: "designer-1",
        plannedStartAt: "2026-07-01T00:00:00.000Z",
        originalDeadlineAt: "2026-08-01T00:00:00.000Z",
        currentDeadlineAt: "2026-08-01T00:00:00.000Z",
        plannedEffort: 8,
        progress: 50,
        status: "in_progress",
        completedAt: null,
        latestUpdateAt: "2026-07-01T00:00:00.000Z",
        version: 1,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        risk: { level: "red", reason: "Deadline needs attention", elapsedRatio: 1, progressRatio: 0.5 }
      }]
    }]
  }]
};

const invitationToken = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const invitationExpiry = "2026-08-25T10:00:00.000Z";

const accessibleInvitation: UserInvitationItem = {
  id: "invitation-accessible",
  name: "Accessible Invitee",
  email: "invitee@lisno.example",
  role: "designer",
  mobile: "+91 98765 43210",
  status: "pending",
  currentLinkAvailable: true,
  availableActions: ["resend", "revoke"],
  invitedBy: {
    id: "super-admin-accessible",
    name: "Accessible Super Admin",
    email: "super-admin@lisno.example",
    role: "super_admin"
  },
  issuedAt: "2026-08-23T10:00:00.000Z",
  expiresAt: invitationExpiry,
  deliveryStatus: "sent",
  deliveryAttemptedAt: "2026-08-23T10:00:01.000Z",
  sentAt: "2026-08-23T10:00:01.000Z",
  version: 2,
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:00:01.000Z"
};

function invitationPage(): UserInvitationPage {
  return {
    items: [
      accessibleInvitation,
      {
        ...accessibleInvitation,
        id: "invitation-delivery-failed",
        name: "Delivery Failed Invitee",
        email: "failed@lisno.example",
        status: "delivery_failed",
        deliveryStatus: "failed",
        sentAt: null,
        availableActions: []
      }
    ],
    pagination: { limit: 20, offset: 0, total: 2, hasMore: false },
    invitableRoles: ["site_manager", "finance_head", "designer"]
  };
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function renderInvitationAcceptance(hash = `#token=${invitationToken}`) {
  window.history.replaceState(
    { marker: "accessibility-invitation" },
    "",
    `/accept-invitation${hash}`
  );
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <AuthProvider>
          <StrictMode>
            <BrowserRouter>
              <Routes>
                <Route
                  path="/accept-invitation"
                  element={<InvitationAcceptancePage />}
                />
              </Routes>
            </BrowserRouter>
          </StrictMode>
        </AuthProvider>
      </FeedbackProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

function fixtureFetch(
  user: ReturnType<typeof userFor>,
  permissions?: readonly PermissionCode[]
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return Response.json({ data: user });
    if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(user.role, permissions) });
    if (url.startsWith("/api/v1/projects?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url === "/api/v1/projects/project-a11y") return Response.json({ data: accessibleProject });
    if (url.startsWith("/api/v1/tasks/task-a11y/events?")) return Response.json({ data: { items: [], pagination: { limit: 1, offset: 0, total: 0, hasMore: false } } });
    if (url === "/api/v1/client/latest-approved-versions") return Response.json({ data: [] });
    if (url.startsWith("/api/v1/client/project-summaries?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url.startsWith("/api/v1/organization/team?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url.startsWith("/api/v1/organization/tree?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url.startsWith("/api/v1/organization/managers?")) return Response.json({ data: { items: [{ id: "manager-a11y", name: "Aarav Mehta", email: "aarav@lisno.example", mobile: "+91 90000 00001" }], pagination: { limit: 20, offset: 0, total: 1, hasMore: false } } });
    if (url.startsWith("/api/v1/leads?")) return Response.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } });
    if (url === "/api/v1/estimates") return Response.json({ data: [] });
    if (url.startsWith("/api/v1/kpis/users/") && url.includes("/tasks?")) return Response.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } });
    if (url.startsWith("/api/v1/kpis/users/")) return Response.json({ data: { userId: user.id, periodStartAt: "2000-01-01T00:00:00.000Z", periodEndAt: "2100-01-01T00:00:00.000Z", score: 0, components: [], aggregates: { taskCounts: { total: 0, completed: 0, active: 0 }, riskCounts: { gray: 0, green: 0, yellow: 0, red: 0 }, effort: { planned: 0, completed: 0, remaining: 0, workloadPercentage: 0 }, projects: [], recentActivity: [] }, tasks: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } } });
    if (url === "/api/v1/admin/users?limit=20&offset=0") return Response.json({ data: {
      items: [{
        id: "user-designer-accessible",
        name: "Accessible Designer",
        email: "designer-accessible@lisno.example",
        role: "designer",
        active: true,
        version: 2,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }],
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
      manageableRoles: user.role === "super_admin" ? ROLE_CODES : OPERATIONAL_ROLES
    } });
    if (url === "/api/v1/admin/projects?limit=20&offset=0") return Response.json({ data: {
      items: [{
        id: "project-admin-a11y",
        name: "Accessible Admin residence",
        status: "planning",
        location: "Pune",
        client: { name: "Asha Shah", email: "asha@example.com", mobile: "+91 90000 00000" },
        propertyType: "3BHK",
        budgetMin: 800000,
        budgetMax: 1200000,
        estimator: { id: "estimator-a11y", name: "Accessible Estimator", email: "estimator@lisno.example" },
        lead: { id: "lead-a11y", stage: "new_lead", nextAction: "Schedule site visit", nextActionAt: "2026-08-25T05:00:00.000Z" },
        estimate: null,
        createdAt: "2026-08-23T10:00:00.000Z"
      }],
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
    } });
    if (url.startsWith("/api/v1/admin/estimators?")) return Response.json({ data: {
      items: [{ id: "estimator-a11y", name: "Accessible Estimator", email: "estimator@lisno.example", title: "Senior Estimator" }],
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
    } });
    if (url === "/api/v1/admin/projects") return Response.json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        fields: { clientEmail: "This email belongs to an internal account." }
      }
    }, { status: 400 });
    if (url === "/api/v1/access-requests/mine?limit=20&offset=0") return Response.json({ data: {
      items: [{
        id: "request-a11y-own",
        projectId: "project-a11y-opaque",
        module: "design",
        reason: "Need design access",
        status: "pending",
        decisionReason: null,
        reviewedAt: null,
        version: 2,
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z"
      }],
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
    } });
    if (url === "/api/v1/access-requests/review?limit=20&offset=0") return Response.json({ data: {
      items: [{
        id: "request-a11y-pending",
        projectId: "project-a11y-review",
        module: "design",
        reason: "Need project access",
        status: "pending",
        decisionReason: null,
        reviewedAt: null,
        version: 2,
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z",
        requester: { id: "designer-a11y", name: "Accessible Designer", email: "designer-a11y@lisno.example", role: "designer", active: true },
        project: { id: "project-a11y-review", resolved: true, name: "Accessible residence" },
        reviewerId: null,
        activeGrant: null
      }, {
        id: "request-a11y-approved",
        projectId: "project-a11y-review",
        module: "design",
        reason: "Need project access",
        status: "approved",
        decisionReason: null,
        reviewedAt: "2026-08-17T11:00:00.000Z",
        version: 3,
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T11:00:00.000Z",
        requester: { id: "designer-a11y", name: "Accessible Designer", email: "designer-a11y@lisno.example", role: "designer", active: true },
        project: { id: "project-a11y-review", resolved: true, name: "Accessible residence" },
        reviewerId: "super_admin-1",
        activeGrant: { id: "grant-a11y", version: 1, grantedAt: "2026-08-17T11:00:00.000Z" }
      }],
      pagination: { limit: 20, offset: 0, total: 2, hasMore: false }
    } });
    throw new Error(`Unhandled request: ${url}`);
  });
}

async function expectNoAxeViolations() {
  const context = {
    canvas: document.createElement("canvas"),
    clearRect: () => undefined,
    fillText: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    measureText: (text: string) => ({ width: Math.max(text.length, 1) * 10 })
  } as unknown as CanvasRenderingContext2D;
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context);

  try {
    const results = await axe.run(document.body);
    expect(results.violations).toEqual([]);
  } finally {
    getContext.mockRestore();
  }
}

describe("accessibility smoke coverage", () => {
  it("associates rejection errors and keeps the review dialog keyboard accessible", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/client/projects/project-review/design-sections") {
        return Response.json({ data: {
          projectId: "project-review",
          progress: { approved: 0, rejected: 0, awaitingReview: 1, total: 1 },
          sections: [{
            id: "section-review", designVersionId: "version-review", sourcePageId: "page-review",
            label: "North elevation", active: true, source: "ocr", ocrConfidence: .9,
            createdAt: "now", updatedAt: "now", versionNumber: 1,
            revision: {
              id: "revision-review", sectionId: "section-review", revisionNumber: 1,
              sourcePageId: "page-review", crop: { x: 0, y: 0, width: 100, height: 100 },
              label: "North elevation", reviewStatus: "submitted", submittedAt: "now",
              reviewerId: null, reviewedAt: null, rejectionComment: null, createdAt: "now",
              imageReference: "/revision-review.png"
            },
            history: []
          }]
        } });
      }
      if (url === "/revision-review.png") return new Response(new Blob(["image"], { type: "image/png" }));
      throw new Error(`Unhandled request: ${url}`);
    });
    renderWithQuery(<DesignSectionReview projectId="project-review" mode="client" />);
    await user.click(await screen.findByRole("button", { name: "Request changes for North elevation" }));
    const dialog = screen.getByRole("dialog", { name: "Request changes for North elevation" });
    await waitFor(() => expect(within(dialog).getByLabelText("Modification comment")).toHaveFocus());
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(within(dialog).getByLabelText("Modification comment")).toHaveAccessibleDescription("Explain what the designer should modify.");
    await expectNoAxeViolations();
  });

  it("keeps the focused read-only review surface navigable without decision actions", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/client/projects/project-review/design-sections") {
        return Response.json({ data: {
          projectId: "project-review",
          progress: { approved: 0, rejected: 0, awaitingReview: 2, total: 2 },
          sections: ["North elevation", "Site plan"].map((label, index) => ({
            id: `section-review-${index}`, designVersionId: `version-review-${index}`, sourcePageId: `page-review-${index}`,
            label, active: true, source: "ocr", ocrConfidence: .9,
            createdAt: "now", updatedAt: "now", versionNumber: 1,
            revision: {
              id: `revision-review-${index}`, sectionId: `section-review-${index}`, revisionNumber: 1,
              sourcePageId: `page-review-${index}`, crop: { x: 0, y: 0, width: 100, height: 100 },
              label, reviewStatus: "submitted", submittedAt: "now", reviewerId: null,
              reviewedAt: null, rejectionComment: null, createdAt: "now", imageReference: `/revision-review-${index}.png`
            }, history: []
          }))
        } });
      }
      if (url.startsWith("/revision-review-")) return new Response(new Blob(["image"], { type: "image/png" }));
      throw new Error(`Unhandled request: ${url}`);
    });
    renderWithQuery(<DesignSectionReview projectId="project-review" mode="read-only" />);

    expect(await screen.findAllByRole("article", { name: /review$/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Previous plan" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next plan: Site plan" })).toBeVisible();
    expect(screen.getByRole("group", { name: "0 approved, 0 rejected, 2 awaiting review, 2 total" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Approve|Request changes|Reject/ })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("gives OCR crop controls accessible names and keyboard operation", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/v1/projects/project-crop/design-versions?")) {
        return Response.json({ data: { items: [{
          id: "version-crop", projectId: "project-crop", floorId: "floor-1",
          stageId: "stage-1", taskId: "task-1", versionNumber: 1,
          originalFilename: "plan.png", mimeType: "image/png", sizeBytes: 100,
          uploaderId: "designer-1", uploadedAt: "2026-07-27T00:00:00.000Z",
          approvalStatus: "draft", reviewerId: null, approvedAt: null,
          clientVisible: false, extractionStatus: "designer_review",
          createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z"
        }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false } } });
      }
      if (url === "/api/v1/design-versions/version-crop/sections") {
        return Response.json({ data: {
          extractionStatus: "designer_review",
          pages: [{ id: "page-crop", designVersionId: "version-crop", pageNumber: 1, width: 500, height: 400, imageUrl: "/page.png", createdAt: "now" }],
          sections: [{ id: "section-crop", designVersionId: "version-crop", sourcePageId: "page-crop", label: "Elevation", active: true, source: "ocr", ocrConfidence: .9, createdAt: "now", updatedAt: "now", revision: { id: "revision-crop", sectionId: "section-crop", revisionNumber: 1, sourcePageId: "page-crop", crop: { x: 0, y: 0, width: 100, height: 100 }, label: "Elevation", reviewStatus: "draft", submittedAt: null, reviewerId: null, reviewedAt: null, rejectionComment: null, createdAt: "now", imageReference: "/crop.png" } }]
        } });
      }
      return new Response(new Blob(["image"], { type: "image/png" }));
    });
    renderWithQuery(<DesignUploadsWorkspace projectId="project-crop" />);
    const crop = await screen.findByRole("group", { name: "Elevation crop boundaries" });
    within(crop).getByLabelText("Crop x coordinate").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(within(crop).getByLabelText("Crop x coordinate")).toHaveValue(1);
    await expectNoAxeViolations();
  });
  it("keeps login fields labeled and password visibility keyboard-operable", async () => {
    renderApp(["/login"]);
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    const toggle = screen.getByRole("button", { name: "Show password" });
    toggle.focus();
    expect(toggle).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expectNoAxeViolations();
  });

  it("keeps signup controls labelled, visible by keyboard, and free of accessibility violations", async () => {
    renderApp(["/signup"]);
    expect(screen.getByLabelText("Full name")).toBeVisible();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    const toggle = screen.getAllByRole("button", { name: "Show password" })[0];
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expectNoAxeViolations();
  });

  it("keeps project manager selection labelled and keyboard-accessible", async () => {
    const user = userEvent.setup();
    tokenStorage.set("designer-token");
    fixtureFetch(userFor("designer"));
    renderApp(["/designer"]);
    await user.click(await screen.findByRole("button", { name: "Create project" }));
    const dialog = screen.getByRole("dialog", { name: "Create project" });
    const manager = within(dialog).getByRole("combobox", { name: "Project manager" });
    expect(manager).not.toHaveAttribute("aria-controls");
    await user.click(manager);
    const option = await within(dialog).findByRole("option", { name: /Aarav Mehta/i });
    expect(option).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(manager).toHaveValue("Aarav Mehta");
    await expectNoAxeViolations();
  });

  it.each([
    ["designer", "/designer", "Good morning, Accessible.", "Workspace"],
    ["design_manager", "/manager", "Team delivery pulse", "Team"],
    ["design_head", "/head", "Organization delivery health", "Organization"],
    ["estimator_sales", "/estimator-sales", "Lead workspace", "Leads & estimates"],
    ["client", "/client", "Your design plans", "My projects"]
  ] as const)("renders an accessible %s home", async (role, path, heading, navigationLabel) => {
    tokenStorage.set(`${role}-token`);
    fixtureFetch(userFor(role));
    renderApp([path]);
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(navigation).toBeVisible();
    expect(within(navigation).getByRole("link", { name: navigationLabel })).toBeVisible();
    expect(document.querySelectorAll("main#main-content")).toHaveLength(1);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expectNoAxeViolations();
  });

  it("keeps a workspace disclosure, upload dialog, mobile navigation, and textual risk status keyboard-accessible", async () => {
    const user = userEvent.setup();
    tokenStorage.set("designer-token");
    fixtureFetch(userFor("designer"));
    renderApp(["/designer/projects/project-a11y"]);

    await screen.findByRole("heading", { name: "Accessible residence" });
    const floor = screen.getByRole("button", { name: /Floor G Accessible floor/i });
    floor.focus();
    await user.keyboard("{Enter}");
    expect(floor).toHaveAttribute("aria-expanded", "true");
    const stage = screen.getByRole("button", { name: /Accessible planning/i });
    await user.click(stage);
    expect(stage).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Red risk")).toBeVisible();
    expect(screen.getAllByText(/Deadline needs attention/)).toHaveLength(2);
    await expectNoAxeViolations();

    const upload = screen.getByRole("button", { name: "Upload design for Accessible task" });
    await user.click(upload);
    const dialog = screen.getByRole("dialog", { name: "Upload design" });
    expect(dialog).toBeVisible();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Close Upload design" })).toHaveFocus());
    await expectNoAxeViolations();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Upload design" })).not.toBeInTheDocument();
    expect(upload).toHaveFocus();

    const menu = screen.getByRole("button", { name: "Open navigation" });
    await user.click(menu);
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await expectNoAxeViolations();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
    expect(menu).toHaveFocus();

    await expectNoAxeViolations();
  });

  it("keeps Access Denied generic, keyboard-visible, and free of axe violations", async () => {
    tokenStorage.set("designer-denied-token");
    fixtureFetch(userFor("designer"), ["identity.self.read"]);
    renderApp(["/designer"]);

    const heading = await screen.findByRole("heading", { name: "Access denied" });
    heading.focus();
    expect(heading).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Request access" })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("keeps neutral Home and both registered navigation surfaces accessible", async () => {
    tokenStorage.set("worker-token");
    fixtureFetch(userFor("worker_electrician"));
    renderApp(["/home"]);

    expect(
      await screen.findByRole("heading", { name: "Electrician workspace" })
    ).toBeVisible();
    const desktopHome = within(
      screen.getByRole("navigation", { name: "Primary navigation" })
    ).getByRole("link", { name: "Home" });
    desktopHome.focus();
    expect(desktopHome).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    const mobileHome = within(drawer).getByRole("link", { name: "Home" });
    mobileHome.focus();
    expect(mobileHome).toHaveFocus();
    await expectNoAxeViolations();
  });

  it("keeps My Projects and initiation keyboard accessible with estimator selection and error focus", async () => {
    const user = userEvent.setup();
    tokenStorage.set("admin-accessibility-token");
    fixtureFetch(userFor("admin"), [
      "identity.self.read",
      "identity.authorization.read",
      "projects.list",
      "projects.read",
      "projects.initiate",
      "organization.estimators.read"
    ]);
    renderApp(["/admin/projects"]);

    const trigger = await screen.findByRole("button", { name: "Initiate project" });
    await expectNoAxeViolations();

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Initiate project" });
    const estimator = within(dialog).getByRole("combobox", { name: "Estimator/Sales" });
    await user.click(estimator);
    expect(await within(dialog).findByRole("option", { name: /Accessible Estimator/ })).toBeVisible();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(estimator).toHaveValue("Accessible Estimator");
    await expectNoAxeViolations();

    const values = {
      clientName: "Asha Shah",
      clientEmail: "asha@example.com",
      clientMobile: "+91 90000 00000",
      projectName: "Asha home",
      location: "Pune",
      propertyType: "3BHK",
      budgetMin: "800000",
      budgetMax: "1200000",
      nextAction: "Schedule site visit",
      nextActionAt: "2026-08-25T10:30"
    };
    fireEvent.change(within(dialog).getByLabelText(/^Client name/), { target: { value: values.clientName } });
    fireEvent.change(within(dialog).getByLabelText(/^Client email/), { target: { value: values.clientEmail } });
    fireEvent.change(within(dialog).getByLabelText(/^Mobile/), { target: { value: values.clientMobile } });
    fireEvent.change(within(dialog).getByLabelText(/^Project \/ property name/), { target: { value: values.projectName } });
    fireEvent.change(within(dialog).getByLabelText(/^Location/), { target: { value: values.location } });
    fireEvent.change(within(dialog).getByLabelText(/^Property type/), { target: { value: values.propertyType } });
    fireEvent.change(within(dialog).getByLabelText(/^Minimum budget/), { target: { value: values.budgetMin } });
    fireEvent.change(within(dialog).getByLabelText(/^Maximum budget/), { target: { value: values.budgetMax } });
    fireEvent.change(within(dialog).getByLabelText(/^Next action\*/), { target: { value: values.nextAction } });
    fireEvent.change(within(dialog).getByLabelText(/^Next action date/), { target: { value: values.nextActionAt } });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Initiate project" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Initiate project" }));
    const email = within(dialog).getByRole("textbox", { name: "Client email" });
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAccessibleDescription("This email belongs to an internal account.");
    await expectNoAxeViolations();
  });

  it("keeps the Super Admin user directory and mutation dialog keyboard accessible", async () => {
    const user = userEvent.setup();
    tokenStorage.set("super-admin-accessibility-token");
    fixtureFetch(userFor("super_admin"), [
      "identity.self.read",
      "identity.authorization.read",
      "identity.users.read",
      "identity.users.update"
    ]);
    renderApp(["/admin/users"]);

    const trigger = await screen.findByRole("button", { name: "Manage Accessible Designer" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Manage Accessible Designer" });
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Role" })).toHaveFocus());
    await expectNoAxeViolations();
  });

  it("keeps the Super Admin invitation panel and create, resend, and revoke dialogs accessible", async () => {
    const revokeGate = deferredResponse();
    server.use(
      http.get("/api/v1/admin/user-invitations", () =>
        HttpResponse.json({ data: invitationPage() })
      ),
      http.post(
        "/api/v1/admin/user-invitations/invitation-accessible/revoke",
        () => revokeGate.promise
      )
    );
    const user = userEvent.setup();
    renderWithQuery(
      <UserInvitationsPanel
        actorRole="super_admin"
        permissions={[
          "identity.user_invitations.read",
          "identity.user_invitations.create",
          "identity.user_invitations.resend",
          "identity.user_invitations.revoke"
        ]}
      />
    );

    const panelHeading = await screen.findByRole("heading", {
      name: "Pending invitations"
    });
    const pendingRow = await screen.findByRole("row", { name: /Accessible Invitee/ });
    expect(within(pendingRow).getByText("Pending")).toBeVisible();
    expect(within(pendingRow).getByText("Email sent")).toBeVisible();
    const failedRow = screen.getByRole("row", { name: /Delivery Failed Invitee/ });
    expect(within(failedRow).getByText("Delivery Failed")).toBeVisible();
    expect(within(failedRow).getByText("Email delivery failed")).toBeVisible();
    await expectNoAxeViolations();

    const inviteTrigger = screen.getByRole("button", { name: "Invite user" });
    await user.click(inviteTrigger);
    let dialog = screen.getByRole("dialog", { name: "Invite user" });
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveFocus()
    );
    await expectNoAxeViolations();
    const createClose = within(dialog).getByRole("button", {
      name: "Close Invite user"
    });
    createClose.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByRole("button", { name: "Send invitation" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(createClose).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Invite user" })).not.toBeInTheDocument();
    expect(inviteTrigger).toHaveFocus();

    await user.click(inviteTrigger);
    dialog = screen.getByRole("dialog", { name: "Invite user" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(inviteTrigger).toHaveFocus();

    const resendTrigger = screen.getByRole("button", {
      name: "Resend Accessible Invitee"
    });
    await user.click(resendTrigger);
    dialog = screen.getByRole("dialog", {
      name: "Resend invitation for Accessible Invitee"
    });
    const resendConfirm = within(dialog).getByRole("button", {
      name: "Confirm resend"
    });
    await waitFor(() =>
      expect(resendConfirm).toHaveFocus()
    );
    fireEvent.keyDown(document, { key: "Tab" });
    expect(
      within(dialog).getByRole("button", {
        name: "Close Resend invitation for Accessible Invitee"
      })
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(resendConfirm).toHaveFocus();
    await expectNoAxeViolations();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(resendTrigger).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: "Revoke Accessible Invitee" })
    );
    dialog = screen.getByRole("dialog", {
      name: "Revoke invitation for Accessible Invitee"
    });
    const revokeConfirm = within(dialog).getByRole("button", {
      name: "Confirm revoke"
    });
    const revokeClose = within(dialog).getByRole("button", {
      name: "Close Revoke invitation for Accessible Invitee"
    });
    await waitFor(() =>
      expect(revokeConfirm).toHaveFocus()
    );
    revokeClose.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(revokeConfirm).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(revokeClose).toHaveFocus();
    await expectNoAxeViolations();
    await user.click(revokeConfirm);
    await waitFor(() =>
      expect(within(dialog).getByText("Revoking invitation. Please wait.")).toBeVisible()
    );
    expect(
      within(dialog).getByRole("button", {
        name: "Close Revoke invitation for Accessible Invitee"
      })
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    await expectNoAxeViolations();

    revokeGate.resolve(
      HttpResponse.json({
        data: {
          ...accessibleInvitation,
          status: "revoked",
          currentLinkAvailable: false,
          availableActions: [],
          version: 3
        }
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(panelHeading).toHaveFocus());
  });

  it("keeps invitation acceptance loading, valid, pending, and success states accessible", async () => {
    const inspectGate = deferredResponse();
    const acceptGate = deferredResponse();
    server.use(
      http.post("/api/v1/auth/user-invitations/inspect", () => inspectGate.promise),
      http.post("/api/v1/auth/user-invitations/accept", () => acceptGate.promise)
    );
    const user = userEvent.setup();
    renderInvitationAcceptance();

    expect(
      await screen.findByRole("heading", { name: "Checking your invitation" })
    ).toBeVisible();
    await expectNoAxeViolations();

    inspectGate.resolve(
      HttpResponse.json({
        data: {
          name: "Accessible Invitee",
          email: "invitee@lisno.example",
          role: "designer",
          expiresAt: invitationExpiry
        }
      })
    );
    expect(
      await screen.findByRole("heading", { name: "Accept your invitation" })
    ).toBeVisible();
    await expectNoAxeViolations();

    const password = screen.getByLabelText("Password");
    const confirmation = screen.getByLabelText("Confirm password");
    const showPassword = screen.getByRole("button", { name: "Show password" });
    showPassword.focus();
    await user.keyboard("{Enter}");
    expect(password).toHaveAttribute("type", "text");
    expect(showPassword).toHaveAttribute("aria-pressed", "true");
    const showConfirmation = screen.getByRole("button", {
      name: "Show confirmation password"
    });
    showConfirmation.focus();
    await user.keyboard(" ");
    expect(confirmation).toHaveAttribute("type", "text");
    expect(showConfirmation).toHaveAttribute("aria-pressed", "true");

    await user.type(password, "StrongPassword123!");
    await user.type(confirmation, "StrongPassword123!");
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    const pendingSubmit = await screen.findByRole("button", {
      name: "Accepting invitation…"
    });
    expect(pendingSubmit).toBeDisabled();
    expect(pendingSubmit).toHaveAttribute("aria-busy", "true");
    await expectNoAxeViolations();

    acceptGate.resolve(
      HttpResponse.json({ data: { accepted: true } }, { status: 201 })
    );
    expect(
      await screen.findByRole("heading", { name: "Invitation accepted" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue to sign in" })).toBeVisible();
    await expectNoAxeViolations();
  });

  it("keeps the generic unavailable invitation state accessible", async () => {
    renderInvitationAcceptance("#token=invalid");

    expect(
      await screen.findByRole("heading", { name: "Invitation unavailable" })
    ).toBeVisible();
    expect(
      screen.getByText(
        "This invitation is unavailable. Ask an administrator to send a new invitation."
      )
    ).toBeVisible();
    await expectNoAxeViolations();
  });

  it("keeps the own access-request dialog trapped, dismissible, and associated", async () => {
    const user = userEvent.setup();
    tokenStorage.set("designer-access-request-a11y-token");
    fixtureFetch(userFor("designer"), [
      "identity.self.read",
      "identity.authorization.read",
      "access_request.self.read",
      "access_request.create",
      "access_request.self.cancel"
    ]);
    renderApp(["/access-requests/mine"]);

    const trigger = await screen.findByRole("button", { name: "Create request" });
    await user.click(trigger);
    let dialog = screen.getByRole("dialog", { name: "Request project access" });
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Project ID" })).toHaveFocus());
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Close Request project access" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Create request" })).toHaveFocus();
    await expectNoAxeViolations();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Request project access" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    dialog = screen.getByRole("dialog", { name: "Request project access" });
    await user.click(within(dialog).getByRole("button", { name: "Create request" }));
    expect(within(dialog).getByRole("textbox", { name: "Project ID" })).toHaveAccessibleDescription(/opaque project ID/i);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
  });

  it("keeps decision and revocation dialogs keyboard accessible without mutating", async () => {
    const user = userEvent.setup();
    tokenStorage.set("super-admin-access-request-a11y-token");
    fixtureFetch(userFor("super_admin"), [
      "identity.self.read",
      "identity.authorization.read",
      "access_request.review.read",
      "access_request.review.decide",
      "project_access_grant.revoke"
    ]);
    renderApp(["/admin/access-requests"]);

    const approve = await screen.findByRole("button", { name: "Approve request request-a11y-pending" });
    await user.click(approve);
    let dialog = screen.getByRole("dialog", { name: "Approve access request" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus());
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Close Approve access request" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Approve request" })).toHaveFocus();
    await expectNoAxeViolations();
    await user.keyboard("{Escape}");
    expect(approve).toHaveFocus();
    await user.click(approve);
    dialog = screen.getByRole("dialog", { name: "Approve access request" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(approve).toHaveFocus();

    const reject = screen.getByRole("button", { name: "Reject request request-a11y-pending" });
    await user.click(reject);
    dialog = screen.getByRole("dialog", { name: "Reject access request" });
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveFocus());
    await expectNoAxeViolations();
    await user.keyboard("{Escape}");
    expect(reject).toHaveFocus();

    const revoke = screen.getByRole("button", { name: "Revoke grant grant-a11y" });
    await user.click(revoke);
    dialog = screen.getByRole("dialog", { name: "Revoke project access" });
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveFocus());
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Close Revoke project access" })).toHaveFocus();
    await expectNoAxeViolations();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(revoke).toHaveFocus();
  });
});
