import { ApiError } from "./errors.js";

/** No waiting queue: active uploads retain a slot through import and cleanup. */
export function createWorkflowUploadAdmission(options: { total?: number; perActor?: number } = {}) {
  const total = options.total ?? 8;
  const perActor = options.perActor ?? 2;
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(perActor) || perActor <= 0) throw new Error("Invalid upload admission limits.");
  let active = 0;
  const actors = new Map<string, number>();
  return (actor: string) => {
    const owned = actors.get(actor) ?? 0;
    if (active >= total || owned >= perActor) {
      throw new ApiError(503, "WORKFLOW_UPLOAD_BUSY", "Evidence uploads are busy. Please try again shortly.", undefined, { "Retry-After": "5" });
    }
    active += 1; actors.set(actor, owned + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true; active -= 1;
      const remaining = (actors.get(actor) ?? 1) - 1;
      if (remaining) actors.set(actor, remaining); else actors.delete(actor);
    };
  };
}

export const admitWorkflowUpload = createWorkflowUploadAdmission();
