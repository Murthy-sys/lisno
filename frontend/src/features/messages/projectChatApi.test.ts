import { afterEach, describe, expect, it, vi } from "vitest";
import { tokenStorage } from "../../api/client";
import { requestActivity } from "../../api/requestActivity";
import { projectChatApi } from "./projectChatApi";
import { chatTestMessage, chatTestPage, chatTestSummary } from "./projectChatFixtures";

afterEach(() => vi.unstubAllGlobals());

describe("project chat HTTP contract", () => {
  it("stages a file with the agreed multipart field, upload identity, byte count and local progress", async () => {
    const request = { open: vi.fn(), setRequestHeader: vi.fn(), send: vi.fn(), abort: vi.fn(), upload: { onprogress: null as null | ((event: ProgressEvent) => void) }, onload: null as null | (() => void), status: 201, responseText: JSON.stringify({ data: { clientUploadId: "upload-a" } }), timeout: 0 };
    vi.stubGlobal("XMLHttpRequest", class { constructor() { return request; } });
    tokenStorage.set("synthetic-attachment-session");
    const file = new File(["synthetic"], "plan.pdf", { type: "application/pdf" });
    const progress = vi.fn();
    const controller = new AbortController();
    const result = projectChatApi.uploadAttachment("project/a", "upload-a", file, progress, controller.signal);
    expect(request.open).toHaveBeenCalledWith("POST", "/api/v1/projects/project%2Fa/chat/attachments?uploadId=upload-a&sizeBytes=9");
    expect((request.send.mock.calls[0][0] as FormData).get("file")).toBe(file);
    expect(request.setRequestHeader).toHaveBeenCalledWith("authorization", "Bearer synthetic-attachment-session");
    expect(request.timeout).toBe(180_000);
    expect(requestActivity.getSnapshot()).toBe(0);
    request.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 } as ProgressEvent);
    expect(progress).toHaveBeenCalledWith(50);
    request.onload?.();
    await expect(result).resolves.toEqual({ clientUploadId: "upload-a" });
  });
  it("uses authenticated content/preview reads and DELETE for explicit staged discard", async () => {
    tokenStorage.set("synthetic-attachment-session");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("bytes", { headers: { "Content-Type": "image/png", "Content-Length": "5" } }));
    const controller = new AbortController();
    const progress = vi.fn();
    const result = await projectChatApi.attachmentBlob("project-a", "file/a", "preview", controller.signal, 5, progress);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/projects/project-a/chat/attachments/file%2Fa/preview");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "GET", signal: controller.signal });
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer synthetic-attachment-session");
    expect(result.blob.size).toBe(5);
    expect(progress).toHaveBeenCalledWith({ loadedBytes: 5, totalBytes: 5 });
    fetch.mockResolvedValueOnce(Response.json({ data: { id: "file/a", discarded: true } }));
    await projectChatApi.discardAttachment("project-a", "file/a", controller.signal);
    expect(fetch.mock.calls[1][0]).toBe("/api/v1/projects/project-a/chat/attachments/file%2Fa");
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "DELETE", signal: controller.signal });
    expect(requestActivity.getSnapshot()).toBe(0);
  });
  it("acknowledges read state with authenticated PUT, the exact payload, and an abort signal", async () => {
    tokenStorage.set("synthetic-api-test-session");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { lastReadSequence: 3, counts: chatTestSummary().counts } }));
    const controller = new AbortController();
    await projectChatApi.read("project-a", { messageId: "message-a", sequence: 3 }, controller.signal);
    expect(fetch).toHaveBeenCalledWith("/api/v1/projects/project-a/chat/read", expect.objectContaining({ method: "PUT", body: JSON.stringify({ messageId: "message-a", sequence: 3 }), signal: controller.signal }));
    const headers = fetch.mock.calls[0][1]!.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer synthetic-api-test-session");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
  it("uses the canonical summary, cursor history, issue PATCH and participant POST paths", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: chatTestSummary() }));
    await projectChatApi.summary("project-a");
    expect(fetch.mock.calls.at(-1)![0]).toBe("/api/v1/projects/project-a/chat");
    fetch.mockResolvedValueOnce(Response.json({ data: chatTestPage() }));
    await projectChatApi.messages("project-a", { filter: "critical", before: "opaque:a/b", limit: 40 });
    expect(fetch.mock.calls.at(-1)![0]).toBe("/api/v1/projects/project-a/chat/messages?limit=40&filter=critical&before=opaque%3Aa%2Fb");
    fetch.mockResolvedValueOnce(Response.json({ data: chatTestMessage() }));
    await projectChatApi.issue("project-a", "message-a", { action: "resolve", expectedVersion: 1, idempotencyKey: "attempt-issue", note: "Complete" });
    expect(fetch.mock.calls.at(-1)![0]).toBe("/api/v1/projects/project-a/chat/messages/message-a/issue");
    expect(fetch.mock.calls.at(-1)![1]!.method).toBe("PATCH");
    await projectChatApi.revokeParticipant("project-a", "selection-a", { expectedVersion: 2, reason: "Reassigned", idempotencyKey: "attempt-revoke" });
    expect(fetch.mock.calls.at(-1)![0]).toBe("/api/v1/projects/project-a/chat/participants/selection-a/revoke");
    expect(fetch.mock.calls.at(-1)![1]!.method).toBe("POST");
  });
});
