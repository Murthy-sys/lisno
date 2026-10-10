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
import type { AuthorizationSnapshot } from "../api/authorization-contract";
import type { AuthPayload, ClientSignupInput, PublicUser } from "../api/types";
import {
  InvalidAuthorizationSnapshotError,
  parseAuthorizationSnapshot
} from "./authorization";
import {
  captureLoginReviewSession,
  clearLoginReviewSession,
  establishLoginReviewSession,
  restoreLoginReviewSession,
  subscribeLoginReviewSession,
  type LoginReviewSession
} from "./loginReviewSession";

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

interface AuthenticatedSession {
  user: PublicUser;
  authorization: AuthorizationSnapshot;
  reviewSession: LoginReviewSession;
}

interface AuthState {
  status: AuthStatus;
  session: AuthenticatedSession | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  authorization: AuthorizationSnapshot | null;
  reviewSession: LoginReviewSession | null;
  sessionExpired: boolean;
  login(credentials: Credentials): Promise<PublicUser>;
  signupClient(input: ClientSignupInput): Promise<PublicUser>;
  logout(): Promise<void>;
  restore(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>(() => ({
    status: tokenStorage.get() ? "restoring" : "unauthenticated",
    session: null
  }));
  const [sessionExpired, setSessionExpired] = useState(false);
  const authStateRef = useRef(authState);
  const acceptedTokenRef = useRef<string | null>(null);
  const pendingTokenRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const externalReviewRestoreRef = useRef<{ generation: number; id: string | null } | null>(null);
  const sessionControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const user = authState.session?.user ?? null;
  const authorization = authState.session?.authorization ?? null;
  const reviewSession = authState.session?.reviewSession ?? null;

  const commitAuthState = useCallback((nextState: AuthState) => {
    authStateRef.current = nextState;
    setAuthState(nextState);
  }, []);

  const supersedeRestore = useCallback(() => {
    generationRef.current += 1;
    externalReviewRestoreRef.current = null;
    sessionControllerRef.current?.abort();
    sessionControllerRef.current = null;
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
      const previousReview = authStateRef.current.session?.reviewSession ?? captureLoginReviewSession();
      const generation = supersedeRestore();
      const reviewCleanup = clearLoginReviewSession(previousReview);
      acceptedTokenRef.current = null;
      pendingTokenRef.current = null;
      tokenStorage.clear();
      setSessionExpired(reason === "expired");
      commitAuthState({
        status: reason === "logout" ? "signing_out" : "unauthenticated",
        session: null
      });
      try {
        await Promise.all([clearAuthenticatedCache(generation), reviewCleanup]);
      } catch {
        // Cache clearing still runs in clearAuthenticatedCache's finally.
      } finally {
        if (
          reason === "logout" &&
          mountedRef.current &&
          generationRef.current === generation
        ) {
          commitAuthState({ status: "unauthenticated", session: null });
        }
      }
    },
    [clearAuthenticatedCache, commitAuthState, supersedeRestore]
  );

  const logout = useCallback(
    () => terminateSession("logout"),
    [terminateSession]
  );

  const restore = useCallback(async (clearCurrentCache = false) => {
    const token = tokenStorage.get();
    const previousReview = authStateRef.current.session?.reviewSession ?? captureLoginReviewSession();
    const generation = supersedeRestore();
    if (clearCurrentCache) {
      externalReviewRestoreRef.current = { generation, id: captureLoginReviewSession()?.id ?? null };
    }
    acceptedTokenRef.current = null;
    pendingTokenRef.current = null;
    if (!token) {
      void clearLoginReviewSession(previousReview);
      commitAuthState({ status: "unauthenticated", session: null });
      return;
    }

    const controller = new AbortController();
    sessionControllerRef.current = controller;
    commitAuthState({ status: "restoring", session: null });
    try {
      if (clearCurrentCache) {
        await clearAuthenticatedCache(generation);
        if (!mountedRef.current || generationRef.current !== generation || tokenStorage.get() !== token) return;
      }
      const [currentUser, rawAuthorization] = await Promise.all([
        apiClient.get<PublicUser>("/auth/me", {
          signal: controller.signal
        }),
        apiClient.get<unknown>("/auth/authorization", {
          signal: controller.signal
        })
      ]);
      const nextAuthorization = parseAuthorizationSnapshot(
        rawAuthorization,
        currentUser.role
      );
      if (!nextAuthorization) {
        throw new InvalidAuthorizationSnapshotError();
      }
      if (
        !mountedRef.current ||
        generationRef.current !== generation ||
        tokenStorage.get() !== token
      ) {
        return;
      }
      const nextReviewSession = await restoreLoginReviewSession(currentUser.id, token, () =>
        mountedRef.current && generationRef.current === generation && tokenStorage.get() === token
      );
      if (!nextReviewSession || !mountedRef.current || generationRef.current !== generation || tokenStorage.get() !== token) return;
      acceptedTokenRef.current = token;
      setSessionExpired(false);
      commitAuthState({
        status: "authenticated",
        session: { user: currentUser, authorization: nextAuthorization, reviewSession: nextReviewSession }
      });
    } catch (error) {
      controller.abort();
      if (
        !mountedRef.current ||
        generationRef.current !== generation
      ) {
        return;
      }
      const currentToken = tokenStorage.get();
      if (currentToken !== token) {
        if (!currentToken) {
          void clearLoginReviewSession(previousReview);
          commitAuthState({ status: "unauthenticated", session: null });
        }
        return;
      }
      commitAuthState({ status: "error", session: null });
    } finally {
      if (externalReviewRestoreRef.current?.generation === generation) {
        const nextToken = tokenStorage.get();
        // A different tab persists its token before publishing the accepted
        // marker. Keep this recovery listening until that marker arrives.
        const awaitingReplacement = mountedRef.current && generationRef.current === generation &&
          authStateRef.current.status === "restoring" && nextToken !== null && nextToken !== token;
        if (!awaitingReplacement) externalReviewRestoreRef.current = null;
        if (mountedRef.current && generationRef.current === generation && !nextToken && authStateRef.current.status === "restoring") {
          commitAuthState({ status: "unauthenticated", session: null });
        }
      }
      if (sessionControllerRef.current === controller) {
        sessionControllerRef.current = null;
      }
    }
  }, [clearAuthenticatedCache, commitAuthState, supersedeRestore]);

  const establishSession = useCallback(
    async (path: string, body: Credentials | ClientSignupInput) => {
      const previousToken = tokenStorage.get();
      const previousReview = authStateRef.current.session?.reviewSession ?? captureLoginReviewSession();
      const generation = supersedeRestore();
      acceptedTokenRef.current = null;
      pendingTokenRef.current = null;
      if (authStateRef.current.session) {
        commitAuthState({ status: "restoring", session: null });
      }
      let replacementToken: string | null = null;
      let cleanupAttempted = false;
      let controller: AbortController | null = null;
      let createdReview: LoginReviewSession | null = null;
      try {
        const payload = await apiClient.post<AuthPayload>(path, body);
        if (!mountedRef.current || generationRef.current !== generation) {
          throw new DOMException("Authentication was superseded.", "AbortError");
        }
        replacementToken = payload.token;
        commitAuthState({ status: "restoring", session: null });
        tokenStorage.set(replacementToken);
        pendingTokenRef.current = replacementToken;
        controller = new AbortController();
        sessionControllerRef.current = controller;
        cleanupAttempted = true;
        await clearAuthenticatedCache(generation);
        if (
          !mountedRef.current ||
          generationRef.current !== generation ||
          tokenStorage.get() !== replacementToken
        ) {
          throw new DOMException("Authentication was superseded.", "AbortError");
        }
        const rawAuthorization = await apiClient.get<unknown>(
          "/auth/authorization",
          { signal: controller.signal }
        );
        const nextAuthorization = parseAuthorizationSnapshot(
          rawAuthorization,
          payload.user.role
        );
        if (!nextAuthorization) {
          throw new InvalidAuthorizationSnapshotError();
        }
        if (
          !mountedRef.current ||
          generationRef.current !== generation ||
          tokenStorage.get() !== replacementToken
        ) {
          throw new DOMException("Authentication was superseded.", "AbortError");
        }
        createdReview = await establishLoginReviewSession(payload.user.id, replacementToken, () =>
          mountedRef.current && generationRef.current === generation && tokenStorage.get() === replacementToken
        );
        if (!createdReview || !mountedRef.current || generationRef.current !== generation || tokenStorage.get() !== replacementToken) {
          throw new DOMException("Authentication was superseded.", "AbortError");
        }
        acceptedTokenRef.current = replacementToken;
        pendingTokenRef.current = null;
        setSessionExpired(false);
        commitAuthState({
          status: "authenticated",
          session: { user: payload.user, authorization: nextAuthorization, reviewSession: createdReview }
        });
        return payload.user;
      } catch (error) {
        controller?.abort();
        const ownedToken = replacementToken ?? previousToken;
        const currentToken = tokenStorage.get();
        if (
          mountedRef.current &&
          generationRef.current === generation &&
          (currentToken === ownedToken || currentToken === null)
        ) {
          void clearLoginReviewSession(createdReview ?? previousReview);
          tokenStorage.clear();
          acceptedTokenRef.current = null;
          pendingTokenRef.current = null;
          commitAuthState({ status: "unauthenticated", session: null });
          if (!cleanupAttempted) {
            try {
              await clearAuthenticatedCache(generation);
            } catch {
              // Cache removal still runs in clearAuthenticatedCache's finally.
            }
          }
        }
        throw error;
      } finally {
        if (controller && sessionControllerRef.current === controller) {
          sessionControllerRef.current = null;
        }
      }
    },
    [clearAuthenticatedCache, commitAuthState, supersedeRestore]
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
        authStateRef.current.status === "authenticated" &&
        authStateRef.current.session
      ) {
        acceptedTokenRef.current = null;
        void terminateSession("expired");
        return;
      }
      if (
        pendingTokenRef.current === token &&
        authStateRef.current.status === "restoring"
      ) {
        const generation = supersedeRestore();
        void clearLoginReviewSession(captureLoginReviewSession());
        pendingTokenRef.current = null;
        commitAuthState({ status: "unauthenticated", session: null });
        void clearAuthenticatedCache(generation).catch(() => undefined);
      }
    };
    window.addEventListener("lisno:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("lisno:unauthorized", handleUnauthorized);
  }, [
    clearAuthenticatedCache,
    commitAuthState,
    supersedeRestore,
    terminateSession
  ]);

  useEffect(() => {
    const revalidateReplacement = () => {
      const current = authStateRef.current;
      const recovering = externalReviewRestoreRef.current;
      const ownsRecovery = current.status === "restoring" && recovering?.generation === generationRef.current;
      if (mountedRef.current && ownsRecovery && !tokenStorage.get()) {
        // The other tab may abandon its login before publishing a marker.
        // Finish the owned recovery instead of leaving this tab restoring.
        void terminateSession("logout");
        return;
      }
      const previousId = current.status === "authenticated" ? current.session?.reviewSession.id
        : ownsRecovery ? recovering?.id : null;
      if (!mountedRef.current || !previousId) return;
      const replacement = captureLoginReviewSession();
      // Another tab can log in again with the very same token. Adopt its marker
      // only after revalidating identity and authorization, never from storage.
      // Consumption and removal are not replacement logins and must not loop.
      if (!replacement || replacement.id === previousId || !tokenStorage.get()) return;
      void restore(true);
    };
    const unsubscribe = subscribeLoginReviewSession(revalidateReplacement);
    revalidateReplacement();
    return unsubscribe;
  }, [restore, reviewSession, terminateSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: authState.status,
      user,
      authorization,
      reviewSession,
      sessionExpired,
      login,
      signupClient,
      logout,
      restore
    }),
    [
      authState.status,
      user,
      authorization,
      reviewSession,
      sessionExpired,
      login,
      signupClient,
      logout,
      restore
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
