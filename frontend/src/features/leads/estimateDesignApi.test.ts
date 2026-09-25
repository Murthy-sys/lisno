import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { uploadEstimatePlanRequestReplacement } from "./estimateDesignApi";

describe("estimate design request replacement API", () => {
  it("posts the file, request version, and idempotency key to the request-scoped route", async () => {
    const onProgress = vi.fn();
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ id: "upload-1" } as never);
    const file = new File(["%PDF-1.7"], "revised.pdf", { type: "application/pdf" });

    await uploadEstimatePlanRequestReplacement("request/one", {
      version: 4,
      idempotencyKey: "request-upload-attempt-1",
      file,
      onProgress
    });

    expect(upload).toHaveBeenCalledOnce();
    const [path, body, progress, options] = upload.mock.calls[0]!;
    expect(path).toBe("/estimate-plan-change-requests/request%2Fone/replacement-upload");
    expect(body.get("version")).toBe("4");
    expect(body.get("idempotencyKey")).toBe("request-upload-attempt-1");
    expect(body.get("file")).toBe(file);
    expect(progress).toBe(onProgress);
    expect(options).toEqual({ showGlobalLoader: false });
  });
});
