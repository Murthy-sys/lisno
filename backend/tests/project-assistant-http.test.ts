import { createServer, type Server, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantDirectFetch } from "../src/services/project-assistant-http.js";

const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {server.closeAllConnections(); server.close(() => resolve());})));
});
async function fixture(handler: RequestListener) {
  const server = createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/v1/assistant/step`;
}
describe("assistant dedicated private HTTP transport", () => {
  it("bypasses global fetch and proxy environment settings", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Global dispatcher must not be used"));
    vi.stubEnv("NODE_USE_ENV_PROXY", "1"); vi.stubEnv("HTTP_PROXY", "http://127.0.0.1:1"); vi.stubEnv("NO_PROXY", "");
    const url = await fixture((_request, response) => response.end('{"ok":true}'));
    const result = await assistantDirectFetch(url, {method: "POST", body: "{}", signal: AbortSignal.timeout(1_000)});
    expect(await result.json()).toEqual({ok: true}); expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds response bytes and never follows redirects", async () => {
    const large = await fixture((_request, response) => response.end("x".repeat(32_769)));
    await expect(assistantDirectFetch(large, {method: "POST", body: "{}"})).rejects.toMatchObject({code: "ASSISTANT_INVALID_OUTPUT"});
    const redirect = await fixture((_request, response) => {response.writeHead(302, {location: "http://127.0.0.1:1"}); response.end();});
    expect((await assistantDirectFetch(redirect, {method: "POST", body: "{}"})).status).toBe(302);
  });
  it("aborts a stalled response and frees its socket", async () => {
    const url = await fixture(() => {});
    await expect(assistantDirectFetch(url, {method: "POST", body: "{}", signal: AbortSignal.timeout(20)})).rejects.toMatchObject({name: "AbortError"});
  });
});
