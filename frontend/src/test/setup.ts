import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { server } from "./server";

// JSDOM does not implement layout observation. Visibility-sensitive behavior
// is verified in the browser; unit tests still need a cancellable observer.
class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}
if (!globalThis.IntersectionObserver) globalThis.IntersectionObserver = TestIntersectionObserver;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

afterAll(() => server.close());
