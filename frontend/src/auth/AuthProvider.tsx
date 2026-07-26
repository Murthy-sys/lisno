import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiClient, tokenStorage } from "../api/client";
import type { AuthPayload, PublicUser } from "../api/types";

export type AuthStatus =
  | "restoring"
  | "authenticated"
  | "unauthenticated"
  | "error";

interface Credentials {
  email: string;
  password: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login(credentials: Credentials): Promise<PublicUser>;
  logout(): Promise<void>;
  restore(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokenStorage.get() ? "restoring" : "unauthenticated"
  );
  const [user, setUser] = useState<PublicUser | null>(null);
  const generationRef = useRef(0);
  const restoreControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const supersedeRestore = useCallback(() => {
    generationRef.current += 1;
    restoreControllerRef.current?.abort();
    restoreControllerRef.current = null;
    return generationRef.current;
  }, []);

  const clearAuthenticatedCache = useCallback(async () => {
    try {
      await queryClient.cancelQueries();
    } finally {
      queryClient.clear();
    }
  }, [queryClient]);

  const logout = useCallback(async () => {
    supersedeRestore();
    tokenStorage.clear();
    setUser(null);
    setStatus("unauthenticated");
    await clearAuthenticatedCache();
  }, [clearAuthenticatedCache, supersedeRestore]);

  const restore = useCallback(async () => {
    const token = tokenStorage.get();
    const generation = supersedeRestore();
    if (!token) {
      setUser(null);
      setStatus("unauthenticated");
      return;
    }

    const controller = new AbortController();
    restoreControllerRef.current = controller;
    setStatus("restoring");
    try {
      const currentUser = await apiClient.get<PublicUser>("/auth/me", {
        signal: controller.signal
      });
      if (
        !mountedRef.current ||
        generationRef.current !== generation ||
        tokenStorage.get() !== token
      ) {
        return;
      }
      setUser(currentUser);
      setStatus("authenticated");
    } catch (error) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        generationRef.current !== generation ||
        tokenStorage.get() !== token
      ) {
        return;
      }
      if (!tokenStorage.get()) {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      setStatus("error");
    } finally {
      if (restoreControllerRef.current === controller) {
        restoreControllerRef.current = null;
      }
    }
  }, [supersedeRestore]);

  const login = useCallback(
    async (credentials: Credentials) => {
      const previousToken = tokenStorage.get();
      const generation = supersedeRestore();
      let replacementToken: string | null = null;
      let cleanupAttempted = false;
      try {
        const payload = await apiClient.post<AuthPayload>(
          "/auth/login",
          credentials
        );
        if (!mountedRef.current || generationRef.current !== generation) {
          throw new DOMException("Login was superseded.", "AbortError");
        }
        replacementToken = payload.token;
        setUser(null);
        setStatus("restoring");
        tokenStorage.set(replacementToken);
        cleanupAttempted = true;
        await clearAuthenticatedCache();
        if (
          !mountedRef.current ||
          generationRef.current !== generation ||
          tokenStorage.get() !== replacementToken
        ) {
          throw new DOMException("Login was superseded.", "AbortError");
        }
        setUser(payload.user);
        setStatus("authenticated");
        return payload.user;
      } catch (error) {
        const ownedToken = replacementToken ?? previousToken;
        if (
          mountedRef.current &&
          generationRef.current === generation &&
          tokenStorage.get() === ownedToken
        ) {
          tokenStorage.clear();
          setUser(null);
          setStatus("unauthenticated");
          if (!cleanupAttempted) {
            try {
              await clearAuthenticatedCache();
            } catch {
              // Cache removal still runs in clearAuthenticatedCache's finally.
            }
          }
        }
        throw error;
      }
    },
    [clearAuthenticatedCache, supersedeRestore]
  );

  useEffect(() => {
    mountedRef.current = true;
    void restore();
    return () => {
      mountedRef.current = false;
      supersedeRestore();
    };
  }, [restore, supersedeRestore]);

  useEffect(() => {
    const handleUnauthorized = () => void logout();
    window.addEventListener("lisno:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("lisno:unauthorized", handleUnauthorized);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout, restore }),
    [status, user, login, logout, restore]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
