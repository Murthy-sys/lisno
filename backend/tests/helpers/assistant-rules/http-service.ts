import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

export const RULES_TEST_TOKEN = "synthetic-rules-integration-token-only";

function ready(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const req = request(`${url}/health/ready`, {headers: {authorization: `Bearer ${RULES_TEST_TOKEN}`}, timeout: 500}, res => {
      let body = "";
      res.on("data", chunk => {body += String(chunk);});
      res.on("end", () => {
        try {resolve(res.statusCode === 200 && JSON.parse(body).mode === "rules");} catch {resolve(false);}
      });
      res.on("error", () => resolve(false));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => req.destroy());
    req.end();
  });
}

/** Real, short-lived loopback HTTP service with synthetic credentials only. */
export async function startRulesService(interpreter: string) {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const url = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(interpreter, ["-m", "lisno_assistant.rules_main"], {
    env: {
      PATH: "/usr/bin:/bin", PYTHONPATH: fileURLToPath(new URL("../../../../assistant-service/src", import.meta.url)),
      PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONUNBUFFERED: "1",
      ASSISTANT_SERVICE_TOKEN: RULES_TEST_TOKEN, ASSISTANT_RULES_PORT: String(port)
    }, stdio: "ignore"
  });
  let spawnFailed = false;
  child.on("error", () => {spawnFailed = true;});
  let closed = false;
  const exit = new Promise<void>(resolve => child.once("close", () => {closed = true; resolve();}));
  const stop = async () => {
    if (closed) return;
    child.kill("SIGTERM");
    const kill = setTimeout(() => child.kill("SIGKILL"), 3000);
    try {await exit;} finally {clearTimeout(kill);}
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnFailed || closed) throw new Error("Rules test process did not start");
      if (await ready(url)) return {url, stop};
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Rules test readiness timed out");
  } catch (error) {await stop(); throw error;}
}
