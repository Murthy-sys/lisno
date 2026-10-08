import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type {
  FinanceLedgerEntry,
  ProcurementProject
} from "../../api/types";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { qaEmptyModeGroups } from "../../test/fixtures/enterpriseProcurementData";
import { procurementKeys } from "./procurementApi";
import {
  procurementProjectsIntegrityError,
  procurementReceiptError,
  rupeesToPaise
} from "./procurementPresentation";

const receiptDocument = {
  id: "document-one",
  originalFilename: "carpentry-receipt.png",
  mimeType: "image/png" as const,
  sizeBytes: 1_240,
  createdAt: "2026-08-26T10:00:00.000Z"
};

const postedExpense: FinanceLedgerEntry = {
  id: "entry-one",
  bucketId: "bucket-one",
  projectId: "project-one",
  type: "direct_spend",
  expenseClass: "procurement",
  category: "Carpentry",
  amountPaise: 125_000,
  incurredAt: "2026-08-25T00:00:00.000Z",
  description: "Living room wardrobe plywood",
  vendor: "Timber House",
  reference: "INV-125",
  sourceSectionId: "CA",
  sourceLineItemKey: "living-room:CA01",
  sourceSectionLabel: "Carpentry",
  sourceLineItemLabel: "Wardrobe plywood and laminate · Living Room",
  supportingDocument: receiptDocument,
  idempotencyKey: "purchase-one",
  status: "posted",
  version: 1,
  createdById: "procurement-user",
  voidedAt: null,
  voidedById: null,
  voidReason: null,
  createdAt: "2026-08-26T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z"
};

const procurementProject: ProcurementProject = {
  taskId: "task-one",
  taskVersion: 2,
  taskStatus: "in_progress",
  taskProgress: 40,
  openedAt: "2026-08-24T09:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z",
  projectId: "project-one",
  projectName: "Aurora Villa",
  estimateId: "estimate-one",
  estimateVersion: 4,
  sections: [
    {
      id: "CA",
      label: "Carpentry",
      estimatedAmountPaise: 300_000,
      actualSpendPaise: 125_000,
      items: [
        {
          key: "living-room:CA01",
          catalogueId: "CA01",
          roomName: "Living Room",
          specification: "Wardrobe plywood and laminate",
          unit: "sq ft",
          quantity: 80,
          estimatedAmountPaise: 250_000,
          actualSpendPaise: 125_000,
          expenses: [postedExpense]
        },
        {
          key: "bedroom:CA02",
          catalogueId: "CA02",
          roomName: "Bedroom",
          specification: "Bedside table",
          unit: "nos",
          quantity: 2,
          estimatedAmountPaise: 50_000,
          actualSpendPaise: 0,
          expenses: []
        },
        {
          key: "living-room:CA00",
          catalogueId: "CA00",
          roomName: "Living Room",
          specification: "Zero-value provisional allowance",
          unit: "lot",
          quantity: 1,
          estimatedAmountPaise: 0,
          actualSpendPaise: 0,
          expenses: []
        }
      ]
    },
    {
      id: "EL",
      label: "Electrical",
      estimatedAmountPaise: 75_000,
      actualSpendPaise: 0,
      items: [
        {
          key: "living-room:EL01",
          catalogueId: "EL01",
          roomName: "Living Room",
          specification: "Modular switch set",
          unit: "set",
          quantity: 3,
          estimatedAmountPaise: 75_000,
          actualSpendPaise: 0,
          expenses: []
        }
      ]
    },
    {
      id: "PA",
      label: "Painting",
      estimatedAmountPaise: 0,
      actualSpendPaise: 0,
      items: [
        {
          key: "bedroom:PA01",
          catalogueId: "PA01",
          roomName: "Bedroom",
          specification: "Zero-value paint allowance",
          unit: "lot",
          quantity: 1,
          estimatedAmountPaise: 0,
          actualSpendPaise: 0,
          expenses: []
        }
      ]
    }
  ]
};

function installProcurementSession(projects: ProcurementProject[] = [procurementProject]) {
  tokenStorage.set("procurement-token");
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({
      data: {
        id: "procurement-user",
        name: "Priya Procurement",
        email: "procurement@lisno.example",
        role: "procurement"
      }
    })),
    http.get("/api/v1/auth/authorization", () => HttpResponse.json({
      data: {
        role: "procurement",
        policyVersion: AUTHORIZATION_POLICY_VERSION,
        permissions: [
          "identity.self.read",
          "identity.authorization.read",
          "workflow.tasks.read",
          "workflow.tasks.update",
          "procurement.workspace.read",
          "procurement.items.read",
          "procurement.items.manage",
          "procurement.vendors.read",
          "procurement.vendors.create",
          "procurement.expense.create",
          "procurement.document.read"
        ]
      }
    })),
    http.get("/api/v1/procurement/projects", () => HttpResponse.json({ data: projects })),
    http.get("/api/v1/procurement/projects/:projectId/items", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: {
      projectId: "project-one", estimateSource: { estimateId: "estimate-one", estimateVersion: 4, estimateReviewRoundId: null },
      baskets: [], modeGroups: qaEmptyModeGroups()
    } })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-requests", () => HttpResponse.json({ data: { items: [], total: 0, limit: 50, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/purchase-orders", () => HttpResponse.json({ data: { items: [], total: 0, limit: 50, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-commitments", () => HttpResponse.json({ data: {
      approvedEstimatePaise: 375_000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 375_000
    } })),
    http.get("/api/v1/procurement/vendors", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })),
    http.get("/api/v1/daily-critical-tasks", () => HttpResponse.json({ data: {
      timezone: "Asia/Kolkata", localDate: "2026-10-08", scheduledAt: "2026-10-08T09:00:00.000Z",
      acknowledgedAt: "2026-10-08T09:00:00.000Z", items: []
    } })),
    http.get("/api/v1/chat/availability", () => HttpResponse.json({ data: { available: false, reason: "Synthetic test" } })),
    http.get("/api/v1/workflow-tasks", () => HttpResponse.json({ data: [] })),
    http.get("/api/v1/kpis/users/:userId", () => HttpResponse.json({
      error: { code: "KPI_UNAVAILABLE", message: "KPI unavailable" }
    }, { status: 503 }))
  );
}

async function expectNoAxeViolations() {
  const context = {
    canvas: document.createElement("canvas"),
    clearRect: () => undefined,
    fillText: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    measureText: (text: string) => ({ width: Math.max(text.length, 1) * 10 })
  } as unknown as CanvasRenderingContext2D;
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context);
  try {
    const results = await axe.run(document.body);
    expect(results.violations).toEqual([]);
  } finally {
    getContext.mockRestore();
  }
}

describe("ProcurementWorkspace", () => {
  it("lists Design-approved projects as cards that open the project page", async () => {
    installProcurementSession();
    const user = userEvent.setup();

    const { router } = renderApp(["/home"]);

    const workspace = await screen.findByRole("region", { name: "Procurement" });
    const list = await within(workspace).findByRole("list", { name: "Design-approved projects" });
    const row = within(list).getByRole("article", { name: "Aurora Villa" });
    expect(within(row).getByRole("heading", { name: "Aurora Villa" })).toBeVisible();
    expect(within(row).getByText("2 selected Estimate sections")).toBeVisible();
    expect(within(row).getByText("Design approved")).toBeVisible();
    expect(within(row).getByLabelText("Aurora Villa procurement totals"))
      .toHaveTextContent("₹3,750.00");
    expect(within(workspace).queryByRole("button", { name: /Carpentry/i }))
      .not.toBeInTheDocument();
    await expectNoAxeViolations();

    await user.click(within(row).getByRole("link", {
      name: "View procurement items for Aurora Villa"
    }));

    expect(router.state.location.pathname).toBe("/procurement/projects/project-one");
    expect(await screen.findByRole("heading", { level: 1, name: "Aurora Villa" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Procurement" }))
      .not.toBeInTheDocument();
  });

  it("blocks cross-project or unreconciled purchase data before rendering financial actions", async () => {
    const mismatched: ProcurementProject = {
      ...procurementProject,
      sections: procurementProject.sections.map((section) => section.id === "CA"
        ? {
            ...section,
            items: section.items.map((item) => item.key === "living-room:CA01"
              ? { ...item, expenses: [{ ...postedExpense, projectId: "project-other" }] }
              : item)
          }
        : section)
    };
    installProcurementSession([mismatched]);

    renderApp(["/home"]);

    expect(await screen.findByText(/does not match this project, section, or Estimate item/i)).toBeVisible();
    expect(screen.queryByRole("link", { name: /View procurement items for/ })).not.toBeInTheDocument();
  });

  it("renders empty and retryable error states without exposing stale projects", async () => {
    installProcurementSession([]);
    const { unmount } = renderApp(["/home"]);
    expect(await screen.findByText(/automatically after their Design plan is approved/i)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Procurement items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    unmount();

    installProcurementSession();
    server.use(http.get("/api/v1/procurement/projects", () => HttpResponse.json({
      error: { code: "PROCUREMENT_UNAVAILABLE", message: "Procurement is temporarily unavailable." }
    }, { status: 503 })));
    renderApp(["/home"]);
    expect(await screen.findByText("Procurement is temporarily unavailable.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Aurora Villa" })).not.toBeInTheDocument();
  });
});

describe("ProcurementProjectPage", () => {
  it("hides retained project details if access is revoked during refresh", async () => {
    installProcurementSession();
    const { queryClient } = renderApp(["/procurement/projects/project-one"]);
    expect(await screen.findByRole("heading", { name: "Aurora Villa" })).toBeVisible();
    expect(await screen.findByRole("region", { name: "Project baskets" })).toBeVisible();

    server.use(http.get("/api/v1/procurement/projects", () => HttpResponse.json({
      error: { code: "FORBIDDEN", message: "Project access was revoked." }
    }, { status: 403 })));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: procurementKeys.projects }); });

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Aurora Villa" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Project procurement" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Project baskets" })).not.toBeInTheDocument();
  });

  it("shows the Main Basket workspace without the two removed sections", async () => {
    installProcurementSession();
    const user = userEvent.setup();
    renderApp(["/procurement/projects/project-one"]);

    expect(await screen.findByRole("heading", { name: "Main baskets" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Project baskets" })).toBeVisible();
    expect(screen.queryByText("History and open purchase requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Existing vendor work progress")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Estimate items and modes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Earlier procurement work" })).not.toBeInTheDocument();
    await expectNoAxeViolations();

    await user.click(screen.getByRole("link", { name: "Back to projects" }));
    await user.click(await screen.findByRole("link", { name: "View procurement items for Aurora Villa" }));
    expect(await screen.findByRole("heading", { name: "Main baskets" })).toBeVisible();
    expect(screen.queryByText("History and open purchase requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Existing vendor work progress")).not.toBeInTheDocument();
  });

  it("reports a project that is not available for procurement", async () => {
    installProcurementSession();
    renderApp(["/procurement/projects/project-missing"]);
    expect(await screen.findByText(/not available for procurement/i)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Procurement items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
  });
});

describe("procurement financial and file validation", () => {
  it("converts rupees to integer paise without floating-point drift", () => {
    expect(rupeesToPaise("1250")).toBe(125_000);
    expect(rupeesToPaise("0.01")).toBe(1);
    expect(rupeesToPaise("12.345")).toBeNull();
    expect(rupeesToPaise("0")).toBeNull();
    expect(rupeesToPaise("90071992547410.00")).toBeNull();
  });

  it("rejects empty, unsupported, and extension-mismatched receipts while deferring size policy to the server", () => {
    expect(procurementReceiptError(null)).toMatch(/Choose/);
    expect(procurementReceiptError({
      name: "empty.pdf",
      type: "application/pdf",
      size: 0
    } as File)).toMatch(/empty/);
    expect(procurementReceiptError({
      name: "large.pdf",
      type: "application/pdf",
      size: 100 * 1024 * 1024
    } as File)).toBe("");
    expect(procurementReceiptError(new File(["x"], "receipt.txt", { type: "text/plain" }))).toMatch(/PDF, JPEG, PNG, or WebP/);
    expect(procurementReceiptError(new File(["x"], "receipt.pdf", { type: "image/png" }))).toMatch(/matching file extension/);
    expect(procurementReceiptError(new File(["x"], "receipt.webp", { type: "image/webp" }))).toBe("");
  });

  it("rejects unsafe and unreconciled paise fields", () => {
    const unsafe = {
      ...procurementProject,
      sections: [{
        ...procurementProject.sections[0]!,
        actualSpendPaise: Number.MAX_SAFE_INTEGER + 1
      }]
    };
    expect(procurementProjectsIntegrityError([unsafe])).toMatch(/amounts do not reconcile/i);

    const unreconciled = {
      ...procurementProject,
      sections: procurementProject.sections.map((section) => section.id === "CA"
        ? { ...section, actualSpendPaise: section.actualSpendPaise + 1 }
        : section)
    };
    expect(procurementProjectsIntegrityError([unreconciled])).toMatch(/amounts do not reconcile/i);
  });

  it("fails closed when zero-valued items or sections contain financial activity", () => {
    const zeroItemExpense: FinanceLedgerEntry = {
      ...postedExpense,
      id: "entry-zero-item",
      sourceLineItemKey: "living-room:CA00"
    };
    const spentZeroItem: ProcurementProject = {
      ...procurementProject,
      sections: procurementProject.sections.map((section) => section.id === "CA"
        ? {
            ...section,
            actualSpendPaise: 250_000,
            items: section.items.map((item) => item.key === "living-room:CA00"
              ? {
                  ...item,
                  actualSpendPaise: 125_000,
                  expenses: [zeroItemExpense]
                }
              : item)
          }
        : section)
    };
    expect(procurementProjectsIntegrityError([spentZeroItem]))
      .toMatch(/amounts do not reconcile/i);

    const zeroSectionExpense: FinanceLedgerEntry = {
      ...postedExpense,
      id: "entry-zero-section",
      sourceSectionId: "PA",
      sourceLineItemKey: "bedroom:PA01"
    };
    const spentZeroSection: ProcurementProject = {
      ...procurementProject,
      sections: procurementProject.sections.map((section) => section.id === "PA"
        ? {
            ...section,
            actualSpendPaise: 125_000,
            items: section.items.map((item) => ({
              ...item,
              actualSpendPaise: 125_000,
              expenses: [zeroSectionExpense]
            }))
          }
        : section)
    };
    expect(procurementProjectsIntegrityError([spentZeroSection]))
      .toMatch(/amounts do not reconcile/i);
  });
});
