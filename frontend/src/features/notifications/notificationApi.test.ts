import { describe, expect, it, vi } from "vitest";
import { tokenStorage } from "../../api/client";
import { notificationApi } from "./notificationApi";

describe("notification acknowledgement contract", () => {
  it.each([undefined, 7])("sends the displayed routing version %s without changing legacy reads", async version => {
    tokenStorage.set("synthetic-notification-contract-session");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { id: "notification/a" } }));
    const controller = new AbortController();
    await notificationApi.read("notification/a", version, controller.signal);
    expect(fetch).toHaveBeenCalledWith("/api/v1/notifications/notification%2Fa/read", expect.objectContaining({
      method: "PUT", body: JSON.stringify(version === undefined ? {} : { routingMessageVersion: version }), signal: controller.signal
    }));
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer synthetic-notification-contract-session");
  });
});
