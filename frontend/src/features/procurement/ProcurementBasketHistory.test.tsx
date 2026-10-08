import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProcurementBasketHistory } from "./ProcurementBasketHistory";

const base = "/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/history";
const boqLine = { id: "line-one", sourceLineItemKey: "room-one:paint-one", roomId: "room-one", roomName: "Living Room",
  subBasketId: "sub-one", subBasketName: "Paint", mainLineId: "main-one", mainLineName: "Primer coat", approvedQuantity: "2",
  approvedUnit: "sq-ft", uomId: "uom-one", uomCode: "sq-ft", uomDecimalScale: 2, description: "Primer coat",
  quantityMilliUnits: 2000, scopeType: "execution", targetDate: "2026-11-30", deliveryLocation: "Site" };
const bidLine = { boqLineId: "line-one", description: "Primer coat", quantityMilliUnits: 2000, uomCode: "sq-ft",
  unitPricePaise: 25000, gstBasisPoints: 0, netPaise: 50000, gstPaise: 0, totalPaise: 50000 };

describe("prior basket BOQ history", () => {
  it("pages frozen revisions and shows bids and counteroffers without an award action", async () => {
    const listCursors: Array<string | null> = [];
    server.use(
      http.get(base, ({ request }) => {
        const before = new URL(request.url).searchParams.get("beforeRevision");
        listCursors.push(before);
        const revisions = before === "2" ? [{ id: "boq-one", revision: 1, sentAt: "2026-09-01T00:00:00Z",
          boqDigest: "a".repeat(64), lineCount: 1, bidCount: 0, counterofferCount: 0 }] : [
          { id: "boq-three", revision: 3, sentAt: "2026-10-01T00:00:00Z", boqDigest: "c".repeat(64), lineCount: 1, bidCount: 1, counterofferCount: 1 },
          { id: "boq-two", revision: 2, sentAt: "2026-09-15T00:00:00Z", boqDigest: "b".repeat(64), lineCount: 1, bidCount: 0, counterofferCount: 0 }
        ];
        return HttpResponse.json({ data: { enquiryId: "enquiry-one", currentBoqRevisionId: "boq-four",
          revisions, nextBeforeRevision: before === "2" ? null : 2 } });
      }),
      http.get(`${base}/boq-three`, () => HttpResponse.json({ data: { enquiryId: "enquiry-one", canAward: false,
        boq: { id: "boq-three", revision: 3, sentAt: "2026-10-01T00:00:00Z", digest: "c".repeat(64), lines: [boqLine] },
        bids: [{ bidId: "bid-old", vendorId: "vendor-one", vendorName: "Sharma Interiors", revision: 1,
          submittedAt: "2026-10-02T00:00:00Z", totals: { netPaise: 50000, gstPaise: 0, totalPaise: 50000 }, lines: [bidLine] }],
        bidTotal: 1, counteroffers: [{ id: "counter-old", vendorId: "vendor-one", vendorName: "Sharma Interiors",
          priorBidId: "bid-old", reason: "Please review the revised scope.", targetNetPaise: 45000,
          requestedById: "buyer-one", requestedAt: "2026-10-03T00:00:00Z", invitationStatus: "sent", answeredBidId: null }],
        counterofferTotal: 1 } }))
    );
    const user = userEvent.setup();
    const view = renderWithQuery(<ProcurementBasketHistory projectId="project-one" basketId="basket-one" enquiryId="enquiry-one" />);
    await user.click(screen.getByText("Prior BOQ revisions"));
    await user.click(await screen.findByRole("button", { name: "View revision 3" }));
    const detail = await screen.findByRole("region", { name: "BOQ revision 3" });
    expect(within(detail).getAllByText("Primer coat").length).toBeGreaterThan(0);
    expect(within(detail).getByText("Please review the revised scope.")).toBeVisible();
    await user.click(within(detail).getByText(/Sharma Interiors · Bid 1/u));
    expect(within(detail).getAllByText("₹500.00").length).toBeGreaterThan(0);
    expect(within(detail).queryByRole("button", { name: /award/i })).not.toBeInTheDocument();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Older revisions" }));
    expect(await screen.findByRole("button", { name: "View revision 1" })).toBeVisible();
    await waitFor(() => expect(listCursors).toEqual([null, "2"]));
  });
});
