import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTHORIZATION_POLICY_VERSION } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type {
  FinanceLedgerEntry,
  ProcurementProject
} from "../../api/types";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import {
  procurementProjectsIntegrityError,
  procurementReceiptError,
  rupeesToPaise
} from "./procurementPresentation";

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  method = "";
  url = "";
  sentBody: XMLHttpRequestBodyInit | Document | null = null;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader() {}

  send(body: XMLHttpRequestBodyInit | Document | null) {
    this.sentBody = body;
  }
}

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
          "procurement.expense.create",
          "procurement.document.read"
        ]
      }
    })),
    http.get("/api/v1/procurement/projects", () => HttpResponse.json({ data: projects })),
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProcurementWorkspace", () => {
  it("lists Design-approved projects as rows that open the project page", async () => {
    installProcurementSession();
    const user = userEvent.setup();

    const { router } = renderApp(["/home"]);

    const workspace = await screen.findByRole("region", { name: "Procurement purchases" });
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
    expect(screen.queryByRole("region", { name: "Procurement purchases" }))
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
  it("shows positive Estimate sections collapsed, expands them independently, and resets on reopen", async () => {
    installProcurementSession();
    const user = userEvent.setup();

    renderApp(["/procurement/projects/project-one"]);

    const detail = await screen.findByRole("article", { name: "Aurora Villa procurement detail" });
    expect(within(detail).getByText("2 selected Estimate sections")).toBeVisible();
    expect(within(detail).getByLabelText("Aurora Villa procurement totals"))
      .toHaveTextContent("₹3,750.00");

    const carpentryDisclosure = within(detail).getByRole("button", {
      name: /Carpentry/i
    });
    const electricalDisclosure = within(detail).getByRole("button", {
      name: /Electrical/i
    });
    expect(carpentryDisclosure).toHaveAttribute("aria-expanded", "false");
    expect(electricalDisclosure).toHaveAttribute("aria-expanded", "false");
    expect(within(detail).queryByRole("button", { name: /Painting/i }))
      .not.toBeInTheDocument();
    expect(within(detail).queryByText("Zero-value provisional allowance"))
      .not.toBeInTheDocument();
    expect(within(detail).queryByText("Zero-value paint allowance"))
      .not.toBeInTheDocument();
    expect(within(detail).queryByRole("article", {
      name: "Wardrobe plywood and laminate in Living Room"
    })).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /Record purchase for/ }))
      .not.toBeInTheDocument();

    await user.click(carpentryDisclosure);
    expect(carpentryDisclosure).toHaveFocus();
    expect(carpentryDisclosure).toHaveAttribute("aria-expanded", "true");
    expect(electricalDisclosure).toHaveAttribute("aria-expanded", "false");
    const wardrobe = within(detail).getByRole("article", {
      name: "Wardrobe plywood and laminate in Living Room"
    });
    expect(wardrobe).toHaveTextContent("80 sq ft");
    expect(wardrobe).toHaveTextContent("₹2,500.00");
    expect(wardrobe).toHaveTextContent("₹1,250.00");
    expect(within(wardrobe).getByText("Living room wardrobe plywood")).toBeVisible();
    expect(within(wardrobe).getByText("carpentry-receipt.png")).toBeVisible();
    expect(within(wardrobe).getByRole("button", {
      name: "Preview receipt carpentry-receipt.png"
    })).toBeEnabled();
    expect(within(detail).getAllByRole("button", { name: /Record purchase for/ })).toHaveLength(2);
    expect(within(detail).queryByRole("article", {
      name: "Modular switch set in Living Room"
    })).not.toBeInTheDocument();

    await user.click(electricalDisclosure);
    expect(electricalDisclosure).toHaveFocus();
    expect(electricalDisclosure).toHaveAttribute("aria-expanded", "true");
    expect(carpentryDisclosure).toHaveAttribute("aria-expanded", "true");
    expect(within(detail).getByRole("article", {
      name: "Modular switch set in Living Room"
    })).toBeVisible();
    expect(within(detail).getAllByRole("button", { name: /Record purchase for/ })).toHaveLength(3);

    await user.click(carpentryDisclosure);
    expect(carpentryDisclosure).toHaveAttribute("aria-expanded", "false");
    expect(electricalDisclosure).toHaveAttribute("aria-expanded", "true");
    expect(within(detail).queryByRole("article", {
      name: "Wardrobe plywood and laminate in Living Room"
    })).not.toBeInTheDocument();
    expect(within(detail).getByRole("article", {
      name: "Modular switch set in Living Room"
    })).toBeVisible();

    await user.click(screen.getByRole("link", { name: "Back to approved projects" }));
    await user.click(await screen.findByRole("link", {
      name: "View procurement items for Aurora Villa"
    }));

    const reopened = await screen.findByRole("article", { name: "Aurora Villa procurement detail" });
    expect(within(reopened).getByRole("button", { name: /Carpentry/i }))
      .toHaveAttribute("aria-expanded", "false");
    expect(within(reopened).getByRole("button", { name: /Electrical/i }))
      .toHaveAttribute("aria-expanded", "false");
    expect(within(reopened).queryByRole("button", { name: /Record purchase for/ }))
      .not.toBeInTheDocument();
  });

  it("keeps collapsed and expanded section states free of automated accessibility violations", async () => {
    installProcurementSession();
    const user = userEvent.setup();
    renderApp(["/procurement/projects/project-one"]);
    const carpentryDisclosure = await screen.findByRole("button", {
      name: /Carpentry/i
    });
    expect(carpentryDisclosure).toHaveAttribute("aria-expanded", "false");
    await expectNoAxeViolations();

    await user.click(carpentryDisclosure);
    expect(carpentryDisclosure).toHaveFocus();
    expect(carpentryDisclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("article", {
      name: "Wardrobe plywood and laminate in Living Room"
    })).toBeVisible();
    await expectNoAxeViolations();
  });

  it("reports a project that is not available for procurement", async () => {
    installProcurementSession();

    renderApp(["/procurement/projects/project-missing"]);

    expect(await screen.findByText(/not available for procurement/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Carpentry/i })).not.toBeInTheDocument();
  });

  it("validates the purchase, reuses idempotency on an unchanged network retry, and refreshes the workspace after success", async () => {
    installProcurementSession();
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const user = userEvent.setup({ applyAccept: false });

    renderApp(["/procurement/projects/project-one"]);
    await user.click(await screen.findByRole("button", {
      name: /Carpentry/i
    }));
    await user.click(await screen.findByRole("button", {
      name: "Record purchase for Bedside table in Bedroom"
    }));

    const dialog = screen.getByRole("dialog", { name: "Record purchase for Bedside table" });
    expect(within(dialog).getByRole("button", { name: "Cancel" }))
      .toHaveClass("ui-button--destructive-outline");
    expect(within(dialog).getByRole("button", { name: "Record purchase" }))
      .toHaveClass("ui-button--success");
    const amountField = within(dialog).getByLabelText(/Actual price/);
    expect(amountField).toHaveAttribute("type", "text");
    expect(amountField).toHaveAttribute("inputmode", "decimal");
    await user.type(amountField, "12.345");
    await user.click(within(dialog).getByRole("button", { name: "Record purchase" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("no more than two decimal places");

    const amount = within(dialog).getByLabelText(/Actual price/);
    await user.clear(amount);
    await user.type(amount, "1250");
    await user.type(within(dialog).getByLabelText(/Description/), "Two bedside tables");
    const fileInput = within(dialog).getByLabelText(/Receipt or supporting document/);
    await user.upload(fileInput, new File(["notes"], "notes.txt", { type: "text/plain" }));
    await user.click(within(dialog).getByRole("button", { name: "Record purchase" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("PDF, JPEG, PNG, or WebP");

    await user.upload(fileInput, new File(["image"], "receipt.png", { type: "image/png" }));
    await user.type(within(dialog).getByLabelText(/Vendor/), "Wood Studio");
    await user.type(within(dialog).getByLabelText(/Invoice/), "WS-22");
    await user.click(within(dialog).getByRole("button", { name: "Record purchase" }));

    const first = FakeXMLHttpRequest.instances[0]!;
    expect(first.method).toBe("POST");
    expect(first.url).toBe("/api/v1/procurement/projects/project-one/expenses");
    expect(first.sentBody).toBeInstanceOf(FormData);
    const firstBody = first.sentBody as FormData;
    expect(firstBody.get("sourceLineItemKey")).toBe("bedroom:CA02");
    expect(firstBody.get("amountPaise")).toBe("125000");
    expect(firstBody.get("description")).toBe("Two bedside tables");
    expect(firstBody.get("vendor")).toBe("Wood Studio");
    expect(firstBody.get("reference")).toBe("WS-22");
    expect(firstBody.get("receipt")).toBeInstanceOf(File);
    const idempotencyKey = firstBody.get("idempotencyKey");
    first.upload.onprogress?.({
      lengthComputable: true,
      loaded: 50,
      total: 100
    } as ProgressEvent);
    expect(await within(dialog).findByRole("progressbar", {
      name: "Receipt upload progress"
    })).toHaveAttribute("aria-valuenow", "50");

    first.onerror?.();
    expect(await within(dialog).findByRole("button", { name: "Retry purchase" })).toBeEnabled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("request could not be completed");
    await user.click(within(dialog).getByRole("button", { name: "Retry purchase" }));

    const retry = FakeXMLHttpRequest.instances[1]!;
    expect((retry.sentBody as FormData).get("idempotencyKey")).toBe(idempotencyKey);
    retry.status = 201;
    retry.responseText = JSON.stringify({
      data: {
        entry: {
          ...postedExpense,
          id: "entry-two",
          amountPaise: 125_000,
          sourceLineItemKey: "bedroom:CA02"
        },
        bucket: {},
        replayed: false
      }
    });
    retry.onload?.();

    expect(await screen.findByText("Purchase recorded")).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Record purchase for Bedside table" })).not.toBeInTheDocument();
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
