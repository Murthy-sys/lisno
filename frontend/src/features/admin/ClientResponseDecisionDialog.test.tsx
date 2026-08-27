import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  EstimateClientResponseDecisionResult,
  EstimateClientResponseTaskDetail
} from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { ClientResponseDecisionDialog } from "./ClientResponseDecisionDialog";

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = "";
  method = "";
  url = "";
  sentBody: XMLHttpRequestBodyInit | Document | null = null;
  headers = new Headers();

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  send(body: XMLHttpRequestBodyInit | Document | null) {
    this.sentBody = body;
  }

  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

const task: EstimateClientResponseTaskDetail = {
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
  createdAt: "2026-08-23T10:00:00.000Z",
  estimateSnapshot: {
    clientName: "Priya Shah",
    projectName: "Aurora Villa",
    location: "Bengaluru",
    propertyType: "Villa",
    lineItems: [],
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

const approvedResult: EstimateClientResponseDecisionResult = {
  estimate: {
    id: "estimate-1",
    status: "approved",
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
    status: "approved"
  }
};

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(file);
  });
}

function renderDialog(
  decision: "approve" | "request_changes",
  {
    onClose = vi.fn(),
    onSaved = vi.fn(),
    returnFocusRef = createRef<HTMLHeadingElement>()
  } = {}
) {
  return {
    onClose,
    onSaved,
    returnFocusRef,
    ...renderWithQuery(
      <>
        <h1 ref={returnFocusRef} tabIndex={-1}>Client response task</h1>
        <ClientResponseDecisionDialog
          task={task}
          decision={decision}
          onClose={onClose}
          onSaved={onSaved}
          returnFocusRef={returnFocusRef}
        />
      </>
    )
  };
}

afterEach(() => {
  FakeXMLHttpRequest.instances = [];
  vi.unstubAllGlobals();
});

describe("ClientResponseDecisionDialog", () => {
  it.each([
    ["approve", "Approve Client response", "Approve"],
    ["request_changes", "Reject Client response", "Reject"]
  ] as const)("presents the %s choice with Client-facing language", (decision, title, action) => {
    renderDialog(decision);
    const dialog = screen.getByRole("dialog", { name: title });
    expect(within(dialog).getByText("Priya Shah")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: action })).toBeVisible();
    expect(within(dialog).getByLabelText("Decision proof")).toHaveAttribute(
      "accept",
      ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
    );
  });

  it("requires proof for approval and focuses the proof control", async () => {
    const user = userEvent.setup();
    renderDialog("approve");
    const dialog = screen.getByRole("dialog", { name: "Approve Client response" });

    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    const proof = within(dialog).getByLabelText("Decision proof");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Upload proof of the Client's decision."
    );
    expect(proof).toHaveFocus();
    expect(FakeXMLHttpRequest.instances).toHaveLength(0);
  });

  it("requires a rejection reason, caps it at 1000 characters, and focuses it first", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const user = userEvent.setup();
    renderDialog("request_changes");
    const dialog = screen.getByRole("dialog", { name: "Reject Client response" });
    const reason = within(dialog).getByRole("textbox", { name: "Reason" });

    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(reason).toHaveFocus();
    expect(within(dialog).getByText("Explain what the Client wants changed.")).toBeVisible();
    expect(within(dialog).getByText("Upload proof of the Client's decision.")).toBeVisible();

    fireEvent.change(reason, { target: { value: "x".repeat(1001) } });
    await user.upload(
      within(dialog).getByLabelText("Decision proof"),
      new File(["proof"], "proof.pdf", { type: "application/pdf" })
    );
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(reason).toHaveFocus();
    expect(within(dialog).getByText("Keep the reason within 1000 characters.")).toBeVisible();
    expect(FakeXMLHttpRequest.instances).toHaveLength(0);
  });

  it("advises against a disallowed MIME or extension before upload", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const user = userEvent.setup();
    renderDialog("approve");
    const dialog = screen.getByRole("dialog", { name: "Approve Client response" });
    const proof = within(dialog).getByLabelText("Decision proof");

    fireEvent.change(proof, {
      target: {
        files: [
          new File(["not really a PDF"], "decision.exe", {
            type: "application/pdf"
          })
        ]
      }
    });
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Choose a PDF, JPG, PNG, or WebP proof file."
    );
    expect(proof).toHaveFocus();
    expect(FakeXMLHttpRequest.instances).toHaveLength(0);
  });

  it("sends exact ordered multipart content, exposes progress, disables controls, and completes once", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup();
    const { onClose, onSaved, returnFocusRef } = renderDialog("request_changes");
    const dialog = screen.getByRole("dialog", { name: "Reject Client response" });
    const proof = new File(["proof bytes"], "client-decision.jpeg", {
      type: "image/jpeg"
    });

    await user.type(
      within(dialog).getByRole("textbox", { name: "Reason" }),
      "  Please revise the finish.  "
    );
    await user.upload(within(dialog).getByLabelText("Decision proof"), proof);
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    const xhr = FakeXMLHttpRequest.instances[0]!;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe(
      "/api/v1/admin/estimate-client-response-tasks/round-1/decision"
    );
    expect(xhr.sentBody).toBeInstanceOf(FormData);
    const body = xhr.sentBody as FormData;
    expect([...body.keys()]).toEqual(["decision", "note", "version", "proof"]);
    expect(body.get("decision")).toBe("request_changes");
    expect(body.get("note")).toBe("Please revise the finish.");
    expect(body.get("version")).toBe("3");
    const proofPart = body.get("proof");
    expect(proofPart).toBeInstanceOf(File);
    expect(proofPart).toMatchObject({
      name: "client-decision.jpeg",
      type: "image/jpeg",
      size: proof.size
    });
    await expect(readFile(proofPart as File)).resolves.toBe("proof bytes");

    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 1,
      total: 4
    } as ProgressEvent);
    expect(await within(dialog).findByRole("progressbar", { name: "Decision proof upload" })).toHaveAttribute(
      "aria-valuenow",
      "25"
    );
    expect(within(dialog).getByRole("button", { name: "Recording decision…" })).toBeDisabled();
    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toBeDisabled();
    expect(within(dialog).getByLabelText("Decision proof")).toBeDisabled();

    xhr.respond(200, { data: approvedResult });

    expect(
      await screen.findByRole("status", { name: "Application announcements" })
    ).toHaveTextContent("Client response recorded.");
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["estimate-client-responses"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-projects"] });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["project-finance", "projects"]
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["project-finance", "bucket", "project-1"]
      });
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
      expect(returnFocusRef.current).toHaveFocus();
    });
    expect(FakeXMLHttpRequest.instances).toHaveLength(1);
  });

  it("keeps a 409 open, invalidates and refetches without replay", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup();
    const { onClose, onSaved } = renderDialog("approve");
    const dialog = screen.getByRole("dialog", { name: "Approve Client response" });
    await user.upload(
      within(dialog).getByLabelText("Decision proof"),
      new File(["proof"], "proof.webp", { type: "image/webp" })
    );
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    FakeXMLHttpRequest.instances[0]!.respond(409, {
      error: { code: "VERSION_CONFLICT", message: "The task changed elsewhere." }
    });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This Client response task changed. Review the refreshed task before deciding."
    );
    expect(dialog).toBeVisible();
    expect(FakeXMLHttpRequest.instances).toHaveLength(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["estimate-client-responses"] })
    );
  });
});
