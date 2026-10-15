import { describe, expect, it, vi } from "vitest";
import { createGeminiAssistantProvider } from "../src/services/project-assistant-gemini.js";

describe("retired cloud assistant boundary", () => {
  it("cannot construct a cloud provider even with legacy settings and an injected transport", () => {
    const transport = vi.fn<typeof fetch>();
    expect(() => createGeminiAssistantProvider({apiKey: "synthetic-retired-key", model: "retired-model", fetch: transport}))
      .toThrow("ASSISTANT_CLOUD_PROVIDER_DISABLED");
    expect(transport).not.toHaveBeenCalled();
  });
});
