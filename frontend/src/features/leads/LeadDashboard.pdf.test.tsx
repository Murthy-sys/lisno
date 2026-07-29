import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const salesUser = {
  id: "sales-1",
  name: "Priya Sharma",
  email: "sales@lisno.example",
  role: "estimator_sales" as const
};

const savedEstimates = [
  {
    id: "estimate-draft",
    leadId: "lead-draft",
    propertyType: "3BHK",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: 100000,
    gst: 18000,
    total: 118000,
    status: "draft",
    approvalRequired: true,
    assignedDesignerId: null,
    projectId: null,
    updatedAt: "2026-07-29T10:00:00.000Z",
    lead: {
      id: "lead-draft",
      clientName: "Aurora Homes",
      clientEmail: "aurora@example.com",
      clientMobile: "9000000001",
      projectName: "Aurora Villa",
      propertyType: "3BHK",
      location: "Bengaluru"
    }
  },
  {
    id: "estimate-sent",
    leadId: "lead-sent",
    propertyType: "2BHK",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: 200000,
    gst: 36000,
    total: 236000,
    status: "sent_to_client",
    approvalRequired: true,
    assignedDesignerId: "designer-1",
    projectId: "project-1",
    updatedAt: "2026-07-29T11:00:00.000Z",
    lead: {
      id: "lead-sent",
      clientName: "Cedar Homes",
      clientEmail: "cedar@example.com",
      clientMobile: "9000000002",
      projectName: "Cedar Loft",
      propertyType: "2BHK",
      location: "Mysuru"
    }
  }
];

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function installSalesApi(
  pdfResponse: (url: string, init: RequestInit | undefined) => Promise<Response> | Response
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return Response.json({ data: salesUser });
    if (url.startsWith("/api/v1/leads?")) {
      return Response.json({
        data: {
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
        }
      });
    }
    if (url === "/api/v1/estimates") {
      return Response.json({ data: savedEstimates });
    }
    if (url.endsWith("/pdf")) return pdfResponse(url, init);
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("LeadDashboard estimate PDF export", () => {
  it("exports every saved estimate independently without navigating", async () => {
    tokenStorage.set("sales-token");
    const pending = deferredResponse();
    installSalesApi((url) => {
      if (url === "/api/v1/estimates/estimate-draft/pdf") return pending.promise;
      throw new Error(`Unexpected PDF request: ${url}`);
    });
    const user = userEvent.setup();

    const { router } = renderApp(["/estimator-sales"]);

    const draftCard = (await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    })).closest("article")!;
    const sentCard = screen.getByRole("heading", {
      name: "Cedar Loft",
      level: 3
    }).closest("article")!;
    const draftHeader = draftCard.querySelector<HTMLElement>(".saved-estimate-card__top")!;
    const sentHeader = sentCard.querySelector<HTMLElement>(".saved-estimate-card__top")!;
    const draftExport = within(draftHeader).getByRole("button", {
      name: "Export as PDF"
    });
    const sentExport = within(sentHeader).getByRole("button", {
      name: "Export as PDF"
    });

    await user.click(draftExport);

    expect(router.state.location.pathname).toBe("/estimator-sales");
    expect(within(draftCard).getByRole("button", {
      name: "Preparing PDF..."
    })).toBeDisabled();
    expect(sentExport).toBeEnabled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/estimates/estimate-draft/pdf",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers)
      })
    );
    const pdfRequest = vi.mocked(globalThis.fetch).mock.calls.find(
      ([input]) => String(input) === "/api/v1/estimates/estimate-draft/pdf"
    );
    expect((pdfRequest?.[1]?.headers as Headers).get("Authorization")).toBe(
      "Bearer sales-token"
    );
  });

  it("shows a failed export only on the affected saved estimate", async () => {
    tokenStorage.set("sales-token");
    installSalesApi((url) => {
      if (url === "/api/v1/estimates/estimate-draft/pdf") {
        return Response.json(
          { error: { code: "PDF_FAILED", message: "PDF failed" } },
          { status: 500 }
        );
      }
      throw new Error(`Unexpected PDF request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp(["/estimator-sales"]);

    const draftCard = (await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    })).closest("article")!;
    const sentCard = screen.getByRole("heading", {
      name: "Cedar Loft",
      level: 3
    }).closest("article")!;

    await user.click(within(draftCard).getByRole("button", {
      name: "Export as PDF"
    }));

    expect(await within(draftCard).findByRole("alert")).toHaveTextContent(
      "PDF export failed for Aurora Villa. Try again."
    );
    expect(within(sentCard).queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(within(draftCard).getByRole("button", {
      name: "Export as PDF"
    })).toBeEnabled());
    expect(within(sentCard).getByRole("button", {
      name: "Export as PDF"
    })).toBeEnabled();
  });
});
