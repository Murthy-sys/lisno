import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createChatFixture } from "./helpers/project-chat.js";

describe("assistant application wiring", () => {
  it("gracefully disables AI when no injectable provider is available", async () => {
    const f = createChatFixture();
    const app = createApp({repository: f.repository, chatRepository: f.chatRepository, clock: f.clock,
      auth: {jwtSecret: "synthetic-assistant-test-secret-at-least-32-characters", jwtExpiresInSeconds: 3600},
      projectChatAssistant: {enabled: true}});
    expect(await app.projectChatAssistantHealth()).toMatchObject({enabled: false, active: 0});
    expect(await app.runProjectChatAssistantOnce()).toBe(false);
    await app.closeProjectChat();
  });
  it("starts and drains the injected worker through the existing chat lifecycle", async () => {
    const f = createChatFixture(), provider = {generate: vi.fn()};
    const app = createApp({repository: f.repository, chatRepository: f.chatRepository, clock: f.clock,
      auth: {jwtSecret: "synthetic-assistant-test-secret-at-least-32-characters", jwtExpiresInSeconds: 3600},
      projectChatAssistant: {enabled: true, provider}});
    app.startNotificationDelivery();
    expect(await app.projectChatAssistantHealth()).toMatchObject({enabled: true});
    await app.closeProjectChat();
    expect(await app.runProjectChatAssistantOnce()).toBe(false); expect(provider.generate).not.toHaveBeenCalled();
  });
});
