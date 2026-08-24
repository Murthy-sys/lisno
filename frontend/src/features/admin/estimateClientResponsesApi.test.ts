import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { apiClient, tokenStorage } from "../../api/client";
import type {
  EstimateClientResponseDecisionResult,
  EstimateClientResponseTaskDetail,
  EstimateClientResponseTaskListItem
} from "../../api/types";
import {
  decideEstimateClientResponse,
  downloadEstimateClientResponsePdf,
  downloadEstimateClientResponseProof,
  estimateClientResponseKeys,
  estimateClientResponsesPath,
  getEstimateClientResponse,
  getEstimateClientResponses
} from "./estimateClientResponsesApi";

const listItem: EstimateClientResponseTaskListItem = {
  id: "round-1",
  version: 3,
  sendGeneration: 2,
  project: { id: "project-1", name: "Aurora Villa" },
  client: { name: "Priya Shah", email: "priya@example.com" },
  estimate: { id: "estimate-1", version: 4, total: 1416 },
  assignedAdmin: { id: "admin-1", name: "Meera Admin" },
  deliveryStatus: "sent",
  deliveryAttemptCount: 1,
  deliveryAttemptedAt: "2026-08-23T10:00:01.000Z",
  deliveredAt: "2026-08-23T10:00:02.000Z",
  status: "pending",
  decision: null,
  proofAvailable: false,
  createdAt: "2026-08-23T10:00:00.000Z"
};

const detail: EstimateClientResponseTaskDetail = {
  ...listItem,
  estimateSnapshot: {
    clientName: "Priya Shah",
    projectName: "Aurora Villa",
    location: "Bengaluru",
    propertyType: "Villa",
    lineItems: [
      {
        catalogueId: "FC01",
        roomName: "Living Room",
        specification: "Premium finish",
        unit: "sqft",
        rate: 120,
        quantity: 10,
        included: true,
        amount: 1200
      }
    ],
    subtotal: 1200,
    gst: 216,
    total: 1416
  },
  pdf: {
    filename: "estimate-v4.pdf",
    mimeType: "application/pdf",
    byteSize: 2048,
    sha256: "a".repeat(64)
  },
  decisionSource: null,
  decisionNote: null,
  decidedAt: null
};

afterEach(() => vi.restoreAllMocks());

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(file);
  });
}

describe("estimate client response API contracts", () => {
  it("exposes only the safe list, detail, and decision DTO shapes", () => {
    expectTypeOf(listItem).toMatchTypeOf<EstimateClientResponseTaskListItem>();
    expectTypeOf(detail).toMatchTypeOf<EstimateClientResponseTaskDetail>();
    expectTypeOf<EstimateClientResponseDecisionResult>().toMatchTypeOf<{
      estimate: { id: string; status: string; version: number; projectId: string | null };
      clientReview: { id: string; status: "pending" | "approved" | "changes_requested" };
    }>();

    expect(JSON.stringify(detail)).not.toMatch(
      /recipientEmail|storageReference|deliveryFailureCode|decidedById/
    );
  });

  it("uses stable status-limit-offset query order and deterministic query keys", async () => {
    tokenStorage.set("client-response-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: {
          items: [listItem],
          pagination: { limit: 20, offset: 40, total: 41, hasMore: false }
        }
      })
    );

    await expect(
      getEstimateClientResponses("changes_requested", { limit: 20, offset: 40 })
    ).resolves.toMatchObject({ items: [{ id: "round-1" }] });

    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "/api/v1/admin/estimate-client-response-tasks?status=changes_requested&limit=20&offset=40"
    );
    expect(estimateClientResponsesPath(undefined, { limit: 20, offset: 0 })).toBe(
      "/admin/estimate-client-response-tasks?limit=20&offset=0"
    );
    expect(estimateClientResponseKeys.list(undefined, { limit: 20, offset: 0 })).toEqual([
      "estimate-client-responses",
      "list",
      "all",
      { limit: 20, offset: 0 }
    ]);
    expect(
      estimateClientResponseKeys.list("approved", { limit: 20, offset: 20 })
    ).toEqual([
      "estimate-client-responses",
      "list",
      "approved",
      { limit: 20, offset: 20 }
    ]);
  });

  it("encodes opaque round IDs in detail, exact-PDF, and proof paths", async () => {
    tokenStorage.set("client-response-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ data: detail }))
      .mockResolvedValueOnce(
        new Response(new Blob(["pdf"], { type: "application/pdf" }), {
          headers: { "Content-Disposition": 'attachment; filename="estimate-v4.pdf"' }
        })
      )
      .mockResolvedValueOnce(
        new Response(new Blob(["proof"], { type: "image/png" }), {
          headers: { "Content-Disposition": 'attachment; filename="client-proof.png"' }
        })
      );

    const roundId = "round/a b?";
    await expect(getEstimateClientResponse(roundId)).resolves.toMatchObject({ id: "round-1" });
    await expect(downloadEstimateClientResponsePdf(roundId)).resolves.toMatchObject({
      filename: "estimate-v4.pdf"
    });
    await expect(downloadEstimateClientResponseProof(roundId)).resolves.toMatchObject({
      filename: "client-proof.png"
    });

    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/v1/admin/estimate-client-response-tasks/round%2Fa%20b%3F",
      "/api/v1/admin/estimate-client-response-tasks/round%2Fa%20b%3F/pdf",
      "/api/v1/admin/estimate-client-response-tasks/round%2Fa%20b%3F/proof"
    ]);
    expect(estimateClientResponseKeys.detail(roundId)).toEqual([
      "estimate-client-responses",
      "detail",
      roundId
    ]);
  });

  it.each([
    ["approve", "   ", ["decision", "version", "proof"]],
    ["request_changes", "  Please revise the finish.  ", ["decision", "note", "version", "proof"]]
  ] as const)(
    "builds exact ordered multipart fields for %s",
    async (decision, note, expectedKeys) => {
      const proof = new File(["proof bytes"], "Client response proof.png", {
        type: "image/png"
      });
      const onProgress = vi.fn();
      const result: EstimateClientResponseDecisionResult = {
        estimate: {
          id: "estimate-1",
          status: decision === "approve" ? "approved" : "changes_requested",
          version: 5,
          projectId: "project-1"
        },
        clientReview: {
          id: "round-1",
          sendGeneration: 2,
          estimateVersion: 4,
          version: 4,
          deliveryStatus: "sent",
          deliveryAttemptCount: 1,
          deliveredAt: "2026-08-23T10:00:02.000Z",
          status: decision === "approve" ? "approved" : "changes_requested"
        }
      };
      const post = vi
        .spyOn(apiClient, "postMultipartWithProgress")
        .mockResolvedValue(result);

      await expect(
        decideEstimateClientResponse(
          "round/a b?",
          { decision, note, version: 3, proof },
          onProgress
        )
      ).resolves.toEqual(result);

      expect(post).toHaveBeenCalledOnce();
      const [path, body, progress] = post.mock.calls[0]!;
      expect(path).toBe(
        "/admin/estimate-client-response-tasks/round%2Fa%20b%3F/decision"
      );
      expect(progress).toBe(onProgress);
      expect([...body.keys()]).toEqual(expectedKeys);
      expect(body.get("decision")).toBe(decision);
      expect(body.get("note")).toBe(
        decision === "request_changes" ? "Please revise the finish." : null
      );
      expect(body.get("version")).toBe("3");
      const proofPart = body.get("proof");
      expect(proofPart).toBeInstanceOf(File);
      expect(proofPart).toMatchObject({
        name: "Client response proof.png",
        type: "image/png",
        size: proof.size
      });
      await expect(readFile(proofPart as File)).resolves.toBe("proof bytes");
    }
  );
});
