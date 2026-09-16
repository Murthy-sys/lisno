/** One queue per chat session, shared by uploads and authenticated media reads. */
export class ChatTransferPool {
  private active = 0;
  private queue: Array<() => void> = [];
  private limit = 2;
  constructor(private readonly ceiling = 2) { this.limit = ceiling; }
  setLimit(value: number) { this.limit = Math.max(1, Math.min(this.ceiling, value)); this.flush(); }
  private flush() { while (this.active < this.limit && this.queue.length) this.queue.shift()!(); }
  run<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
      const cancel = () => { this.queue = this.queue.filter(item => item !== start); reject(new DOMException("Cancelled", "AbortError")); };
      const start = () => {
        signal.removeEventListener("abort", cancel);
        if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
        this.active += 1;
        void Promise.resolve().then(operation).then(resolve, reject).finally(() => { this.active -= 1; this.flush(); });
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.queue.push(start); this.flush();
    });
  }
}
