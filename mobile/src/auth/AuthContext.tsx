import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { fetchMe, login as apiLogin, register as apiRegister, verifyTwoFactor as apiVerifyTwoFactor, type AuthUser, type LoginResult } from "../api/auth";
import { clearToken, getToken, setUnauthorizedListener } from "../api/client";
import { syncQueue } from "../offlineQueue";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedListener(() => setUser(null));
    return () => setUnauthorizedListener(null);
  }, []);

  // Retries any offline-queued expenses/income whenever the app comes to
  // the foreground while signed in — the queue survives a forced logout
  // from unauthorizedListener above (only ever removed on success), so
  // this naturally picks queued items back up once the user signs in again.
  useEffect(() => {
    if (!user) return;
    void syncQueue();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncQueue();
      }
    });
    return () => subscription.remove();
  }, [user]);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          setUser(await fetchMe());
        } catch {
          await clearToken();
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const result = await apiLogin(email, password);
    if (result.status === "success") {
      setUser(result.user);
    }
    return result;
  }, []);

  const verifyTwoFactor = useCallback(async (challengeToken: string, code: string) => {
    setUser(await apiVerifyTwoFactor(challengeToken, code));
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setUser(await apiRegister(email, password));
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, verifyTwoFactor, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
