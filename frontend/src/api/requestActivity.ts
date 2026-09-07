let pendingRequests = 0;
const listeners = new Set<() => void>();

export const requestActivity = {
  getSnapshot: () => pendingRequests,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }
};

/** One release per operation, including its response-body parsing. */
export function beginApiRequest(): () => void {
  pendingRequests += 1;
  for (const listener of listeners) listener();
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pendingRequests -= 1;
    for (const listener of listeners) listener();
  };
}
