import { apiClient, ApiError } from "../../api/client";
import { ChatSseParser } from "../messages/projectChatStream";

export type ExecutionConnection = "connecting" | "live" | "polling" | "offline" | "denied";
export const executionDenied = (error: unknown) => error instanceof ApiError && [401,403,404].includes(error.status);
const delay = (signal: AbortSignal, ms: number) => new Promise<void>(resolve => {
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort",done); resolve(); };
  const timer = setTimeout(done,ms); signal.addEventListener("abort",done,{once:true}); if(signal.aborted) done();
});

export async function runExecutionStream(options: {
  signal: AbortSignal; onChange: () => void; onStatus: (value: ExecutionConnection) => void; onDenied: () => void;
  connect?: typeof apiClient.stream;
}) {
  let failures = 0;
  while (!options.signal.aborted) {
    options.onStatus(failures ? "polling" : "connecting");
    const controller = new AbortController();
    const stop = () => controller.abort();
    options.signal.addEventListener("abort",stop,{once:true});
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let denied = false;
    const cancel = () => { void reader?.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort",cancel,{once:true});
    const started = Date.now();
    try {
      const response = await (options.connect ?? apiClient.stream)("/execution/events", {signal:controller.signal});
      if (controller.signal.aborted) { await response.body?.cancel(); break; }
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("Execution stream unavailable.");
      reader=response.body.getReader();
      const parser = new ChatSseParser(frame => {
        if(controller.signal.aborted) return;
        if(frame.event === "state") {
          const state=JSON.parse(frame.data) as {status?:string};
          if(state.status === "denied") { denied=true; stop(); }
        } else if(frame.event === "execution") {
          const payload=JSON.parse(frame.data) as {revision?:unknown};
          if(typeof payload.revision !== "string" || payload.revision.length > 512) throw new Error("Invalid execution event.");
          options.onStatus("live"); options.onChange();
        }
      });
      while(!controller.signal.aborted) {
        clearTimeout(watchdog); watchdog=setTimeout(stop,45_000);
        const part=await reader.read();
        if(part.done) { parser.finish(); break; }
        parser.push(part.value);
      }
    } catch(error) { if(executionDenied(error)) denied=true; }
    finally {
      clearTimeout(watchdog); options.signal.removeEventListener("abort",stop);
      controller.signal.removeEventListener("abort",cancel);
      await reader?.cancel().catch(() => {}); reader?.releaseLock(); stop();
    }
    if(options.signal.aborted) return;
    if(denied) { options.onStatus("denied"); options.onDenied(); return; }
    if(Date.now()-started >= 30_000) failures=0;
    failures++;
    options.onStatus("polling");
    await delay(options.signal,Math.min(30_000,1000*2**Math.min(failures-1,5)));
  }
}
