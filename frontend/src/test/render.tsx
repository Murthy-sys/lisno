import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";

import { AppRoutes } from "../app/router";
import { AuthProvider } from "../auth/AuthProvider";

export function renderApp(
  initialEntries: string[] = ["/"],
  options?: Omit<RenderOptions, "wrapper">
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  const router = {
    state: {
      location: { pathname: initialEntries[initialEntries.length - 1] ?? "/" }
    }
  };

  function LocationObserver() {
    const location = useLocation();
    router.state.location = { pathname: location.pathname };
    return null;
  }

  return {
    router,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider>
            <AppRoutes />
            <LocationObserver />
          </AuthProvider>
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
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
    options
  );
}
