import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { AssistantFailure, ASSISTANT_DEFAULTS } from "../domain/project-chat-assistant.js";

/** Dedicated core agents bypass global fetch dispatchers and environment proxies. */
export const assistantDirectFetch: typeof globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (!["http:", "https:"].includes(url.protocol) || init?.method !== "POST" || typeof init.body !== "string") throw new AssistantFailure("ASSISTANT_UNAVAILABLE");
  const body = init.body;
  if (Buffer.byteLength(body) > ASSISTANT_DEFAULTS.maxPayloadBytes) throw new AssistantFailure("ASSISTANT_CONTEXT_LIMIT");
  const agent = url.protocol === "https:" ? new HttpsAgent({keepAlive: false, maxCachedSessions: 0, rejectUnauthorized: true}) : new HttpAgent({keepAlive: false});
  try {
    return await new Promise<Response>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        method: "POST", agent, signal: init.signal ?? undefined, maxHeaderSize: 8_192,
        headers: {...Object.fromEntries(new Headers(init.headers)), "content-length": Buffer.byteLength(body), "accept-encoding": "identity"}
      }, response => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("error", reject);
        if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
          response.destroy(new AssistantFailure("ASSISTANT_INVALID_OUTPUT")); return;
        }
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > ASSISTANT_DEFAULTS.maxPayloadBytes) { response.destroy(new AssistantFailure("ASSISTANT_INVALID_OUTPUT")); return; }
          chunks.push(chunk);
        });
        response.on("end", () => {
          try {
            const status = response.statusCode ?? 502;
            resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {status, headers: {"content-type": "application/json"}}));
          } catch (error) { reject(error); }
        });
      });
      request.on("error", reject);
      request.end(body);
    });
  } finally { agent.destroy(); }
};
