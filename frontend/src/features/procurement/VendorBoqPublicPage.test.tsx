import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { VendorBoqPublicPage } from "./VendorBoqPublicPage";
import { captureVendorBoqTokenBeforeRouterMount } from "./vendorBoqTokenVault";

const token = "A".repeat(43);

describe("public vendor BOQ", () => {
  it("removes the bearer fragment and submits only complete vendor prices", async () => {
    const inspections: unknown[] = []; const submissions: unknown[] = [];
    window.history.replaceState(null, "", `/vendor-boq#token=${token}`);
    captureVendorBoqTokenBeforeRouterMount();
    expect(window.location.hash).toBe("");
    server.use(
      http.post("/api/v1/vendor-boq/inspect", async ({ request }) => { inspections.push(await request.json()); return HttpResponse.json({ data: {
        projectName: "Aurora Villa", basketName: "Painting", expiresAt: "2099-01-01T00:00:00Z",
        lines: [{ id: "boq-line-one", description: "Primer coat", quantityMilliUnits: 2000, approvedQuantity: "2", approvedUnit: "Rft", approvedQuoteAmountPaise: 30_000, uomCode: "sq-ft" }]
      } }); }),
      http.post("/api/v1/vendor-boq/submit", async ({ request }) => { submissions.push(await request.json()); return HttpResponse.json({ data: { bidId: "bid-one", submittedAt: "2026-10-05T00:00:00Z", totals: { netPaise: 24000, gstPaise: 4320, totalPaise: 28320 } } }); })
    );
    const user = userEvent.setup(); const view = renderWithQuery(<VendorBoqPublicPage />);
    expect(await screen.findByRole("heading", { name: "Primer coat" })).toBeVisible();
    expect(inspections).toEqual([{ token }]);
    expect(screen.getByText("Our quoted amount (before GST)")).toBeVisible();
    expect(screen.getByText("₹300.00")).toBeVisible();
    expect(screen.getByText("For approved quantity 2 Rft")).toBeVisible();
    expect(screen.queryByText(/Due 2026|Site|execution/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Our quoted amount/u })).not.toBeInTheDocument();
    expect(screen.queryByText(/configured base|KPI/u)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit quotation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid unit rate");
    await user.type(screen.getByLabelText("Unit rate · ₹"), "120");
    await user.type(screen.getByLabelText("GST · %"), "18");
    const report = await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } });
    expect(report.violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Submit quotation" }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toMatchObject({ token, lines: [{ boqLineId: "boq-line-one", unitPricePaise: 12000, gstBasisPoints: 1800 }] });
    expect(await screen.findByRole("heading", { name: "Quotation submitted" })).toBeVisible();
    expect(screen.getByText(/₹283.2/u)).toBeVisible();
  });

  it("shows an unavailable state when the invitation has expired", async () => {
    window.history.replaceState(null, "", `/vendor-boq#token=${token}`);
    captureVendorBoqTokenBeforeRouterMount();
    server.use(http.post("/api/v1/vendor-boq/inspect", () => HttpResponse.json({ error: { code: "LINK_EXPIRED", message: "Expired" } }, { status: 410 })));
    renderWithQuery(<VendorBoqPublicPage />);
    expect(await screen.findByText(/This BOQ link is unavailable/u)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit quotation" })).not.toBeInTheDocument();
  });

  it("labels an older BOQ quote snapshot as unavailable without filling it from current pricing", async () => {
    window.history.replaceState(null, "", `/vendor-boq#token=${token}`);
    captureVendorBoqTokenBeforeRouterMount();
    server.use(http.post("/api/v1/vendor-boq/inspect", () => HttpResponse.json({ data: {
      projectName: "Aurora Villa", basketName: "Painting", expiresAt: "2099-01-01T00:00:00Z",
      lines: [{ id: "old-line", description: "Older primer", quantityMilliUnits: 1000, approvedQuantity: "1", approvedUnit: null, approvedQuoteAmountPaise: null,
        uomCode: "sq-ft", scopeType: "execution", targetDate: "2026-11-30", deliveryLocation: "Site" }]
    } })));
    renderWithQuery(<VendorBoqPublicPage />);
    expect(await screen.findByText("Quoted amount unavailable")).toBeVisible();
    expect(screen.getByText("For approved quantity 1 (unit unavailable)")).toBeVisible();
  });
});
