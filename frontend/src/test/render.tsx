import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { transferableAbortController } from "node:util";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation, type InitialEntry } from "react-router-dom";

import { AppRoutes } from "../app/router";
import { AuthProvider } from "../auth/AuthProvider";
import { FeedbackProvider } from "../components/feedback/FeedbackProvider";

function alignAbortControllerWithRequestRuntime() {
  try {
    new Request("http://localhost", {
      signal: new AbortController().signal
    });
  } catch {
    const controller = transferableAbortController();
    Object.defineProperties(globalThis, {
      AbortController: {
        configurable: true,
        writable: true,
        value: controller.constructor
      },
      AbortSignal: {
        configurable: true,
        writable: true,
        value: controller.signal.constructor
      }
    });
  }
}

alignAbortControllerWithRequestRuntime();

export function renderApp(
  initialEntries: InitialEntry[] = ["/"],
  options?: Omit<RenderOptions, "wrapper">
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  const initialEntry = initialEntries[initialEntries.length - 1] ?? "/";
  const router = {
    state: {
      location: {
        pathname:
          typeof initialEntry === "string"
            ? initialEntry
            : initialEntry.pathname ?? "/",
        state: null as unknown
      }
    }
  };

  function LocationObserver() {
    const location = useLocation();
    router.state.location = {
      pathname: location.pathname,
      state: location.state
    };
    return null;
  }

  return {
    router,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <FeedbackProvider>
            <AuthProvider>
              <AppRoutes />
              <LocationObserver />
            </AuthProvider>
          </FeedbackProvider>
        </MemoryRouter>
      </QueryClientProvider>,
      options
    )
  };
}

export function renderWithQuery(
  element: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>{element}</FeedbackProvider>
    </QueryClientProvider>,
    options
  );
}
