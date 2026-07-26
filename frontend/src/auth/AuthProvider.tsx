import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

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
  logout(): void;
  restore(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokenStorage.get() ? "restoring" : "unauthenticated"
  );
  const [user, setUser] = useState<PublicUser | null>(null);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const restore = useCallback(async () => {
    if (!tokenStorage.get()) {
      setUser(null);
      setStatus("unauthenticated");
      return;
    }

    setStatus("restoring");
    try {
      const currentUser = await apiClient.get<PublicUser>("/auth/me");
      setUser(currentUser);
      setStatus("authenticated");
    } catch (error) {
      if (!tokenStorage.get()) {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      setStatus("error");
    }
  }, []);

  const login = useCallback(async (credentials: Credentials) => {
    const payload = await apiClient.post<AuthPayload>("/auth/login", credentials);
    tokenStorage.set(payload.token);
    setUser(payload.user);
    setStatus("authenticated");
    return payload.user;
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    window.addEventListener("lisno:unauthorized", logout);
    return () => window.removeEventListener("lisno:unauthorized", logout);
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
