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
import type { AuthPayload, ClientSignupInput, PublicUser } from "../api/types";

export type AuthStatus =
  | "restoring"
  | "authenticated"
  | "signing_out"
  | "unauthenticated"
  | "error";

interface Credentials {
  email: string;
  password: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  sessionExpired: boolean;
  login(credentials: Credentials): Promise<PublicUser>;
  signupClient(input: ClientSignupInput): Promise<PublicUser>;
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
  const [sessionExpired, setSessionExpired] = useState(false);
  const statusRef = useRef(status);
  const userRef = useRef(user);
  const acceptedTokenRef = useRef<string | null>(null);
  const pendingTokenRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const restoreControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const commitStatus = useCallback((nextStatus: AuthStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const commitUser = useCallback((nextUser: PublicUser | null) => {
    userRef.current = nextUser;
    setUser(nextUser);
  }, []);

  const supersedeRestore = useCallback(() => {
    generationRef.current += 1;
    restoreControllerRef.current?.abort();
    restoreControllerRef.current = null;
    return generationRef.current;
  }, []);

  const clearAuthenticatedCache = useCallback(async (generation: number) => {
    try {
      await queryClient.cancelQueries();
    } finally {
      if (generationRef.current === generation) {
        queryClient.clear();
      }
    }
  }, [queryClient]);

  const terminateSession = useCallback(
    async (reason: "logout" | "expired") => {
      const generation = supersedeRestore();
      acceptedTokenRef.current = null;
      pendingTokenRef.current = null;
      tokenStorage.clear();
      commitUser(null);
      setSessionExpired(reason === "expired");
      commitStatus(reason === "logout" ? "signing_out" : "unauthenticated");
      try {
        await clearAuthenticatedCache(generation);
      } catch {
        // Cache clearing still runs in clearAuthenticatedCache's finally.
      } finally {
        if (
          reason === "logout" &&
          mountedRef.current &&
          generationRef.current === generation
        ) {
          commitStatus("unauthenticated");
        }
      }
    },
    [clearAuthenticatedCache, commitStatus, commitUser, supersedeRestore]
  );

  const logout = useCallback(
    () => terminateSession("logout"),
    [terminateSession]
  );

  const restore = useCallback(async () => {
    const token = tokenStorage.get();
    const generation = supersedeRestore();
    acceptedTokenRef.current = null;
    pendingTokenRef.current = null;
    if (!token) {
      commitUser(null);
      commitStatus("unauthenticated");
      return;
    }

    const controller = new AbortController();
    restoreControllerRef.current = controller;
    commitStatus("restoring");
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
      acceptedTokenRef.current = token;
      commitUser(currentUser);
      setSessionExpired(false);
      commitStatus("authenticated");
    } catch (error) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        generationRef.current !== generation
      ) {
        return;
      }
      const currentToken = tokenStorage.get();
      if (currentToken !== token) {
        if (!currentToken) {
          commitUser(null);
          commitStatus("unauthenticated");
        }
        return;
      }
      commitStatus("error");
    } finally {
      if (restoreControllerRef.current === controller) {
        restoreControllerRef.current = null;
      }
    }
  }, [commitStatus, commitUser, supersedeRestore]);

  const establishSession = useCallback(
    async (path: string, body: Credentials | ClientSignupInput) => {
      const previousToken = tokenStorage.get();
      const generation = supersedeRestore();
      acceptedTokenRef.current = null;
      pendingTokenRef.current = null;
      let replacementToken: string | null = null;
      let cleanupAttempted = false;
      try {
        const payload = await apiClient.post<AuthPayload>(path, body);
        if (!mountedRef.current || generationRef.current !== generation) {
          throw new DOMException("Authentication was superseded.", "AbortError");
        }
        replacementToken = payload.token;
        commitUser(null);
        commitStatus("restoring");
        tokenStorage.set(replacementToken);
        pendingTokenRef.current = replacementToken;
        cleanupAttempted = true;
        await clearAuthenticatedCache(generation);
        if (
          !mountedRef.current ||
          generationRef.current !== generation ||
          tokenStorage.get() !== replacementToken
        ) {
          throw new DOMException("Authentication was superseded.", "AbortError");
        }
        acceptedTokenRef.current = replacementToken;
        pendingTokenRef.current = null;
        commitUser(payload.user);
        setSessionExpired(false);
        commitStatus("authenticated");
        return payload.user;
      } catch (error) {
        const ownedToken = replacementToken ?? previousToken;
        const currentToken = tokenStorage.get();
        if (
          mountedRef.current &&
          generationRef.current === generation &&
          (currentToken === ownedToken ||
            (replacementToken !== null && currentToken === null))
        ) {
          tokenStorage.clear();
          acceptedTokenRef.current = null;
          pendingTokenRef.current = null;
          commitUser(null);
          commitStatus("unauthenticated");
          if (!cleanupAttempted) {
            try {
              await clearAuthenticatedCache(generation);
            } catch {
              // Cache removal still runs in clearAuthenticatedCache's finally.
            }
          }
        }
        throw error;
      }
    },
    [clearAuthenticatedCache, commitStatus, commitUser, supersedeRestore]
  );

  const login = useCallback(
    (credentials: Credentials) => establishSession("/auth/login", credentials),
    [establishSession]
  );

  const signupClient = useCallback(
    (input: ClientSignupInput) =>
      establishSession("/auth/client-signup", input),
    [establishSession]
  );

  useEffect(() => {
    mountedRef.current = true;
    void restore();
    return () => {
      mountedRef.current = false;
      acceptedTokenRef.current = null;
      pendingTokenRef.current = null;
      supersedeRestore();
    };
  }, [restore, supersedeRestore]);

  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      const token = (event as CustomEvent<{ token?: unknown }>).detail?.token;
      if (typeof token !== "string") {
        return;
      }
      if (
        acceptedTokenRef.current === token &&
        statusRef.current === "authenticated" &&
        userRef.current
      ) {
        acceptedTokenRef.current = null;
        void terminateSession("expired");
        return;
      }
      if (
        pendingTokenRef.current === token &&
        statusRef.current === "restoring"
      ) {
        pendingTokenRef.current = null;
        commitUser(null);
        commitStatus("unauthenticated");
      }
    };
    window.addEventListener("lisno:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("lisno:unauthorized", handleUnauthorized);
  }, [commitStatus, commitUser, terminateSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sessionExpired, login, signupClient, logout, restore }),
    [status, user, sessionExpired, login, signupClient, logout, restore]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
