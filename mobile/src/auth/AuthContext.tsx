import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import {
  fetchMe,
  login as apiLogin,
  register as apiRegister,
  verifyEmail as apiVerifyEmail,
  verifyTwoFactor as apiVerifyTwoFactor,
  type AuthUser,
  type LoginResult
} from "../api/auth";
import { clearToken, getToken, setUnauthorizedListener } from "../api/client";
import { syncQueue } from "../offlineQueue";
import { cancelReimbursementReminders, syncReimbursementReminders } from "../reimbursementReminders";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  register: (email: string, password: string) => Promise<LoginResult>;
  verifyEmail: (verificationToken: string, code: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  // Re-reads plan/trial state — after a redeem, a 402, or coming back to the app.
  refreshUser: () => Promise<void>;
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
  //
  // Reimbursement reminders are rebuilt on the same trigger, after the queue
  // (a just-synced "awaiting" expense should count), and cleared on sign-out
  // so a signed-out device never nags about someone's expenses.
  useEffect(() => {
    if (!user) {
      void cancelReimbursementReminders().catch(() => undefined);
      return;
    }
    const syncAll = () => {
      void syncQueue().finally(() => syncReimbursementReminders());
      // Keeps the trial/plan state current (e.g. a trial that ended overnight).
      void fetchMe().then(setUser).catch(() => undefined);
    };
    syncAll();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncAll();
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

  const register = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const result = await apiRegister(email, password);
    if (result.status === "success") setUser(result.user);
    return result;
  }, []);

  const verifyEmail = useCallback(async (verificationToken: string, code: string): Promise<LoginResult> => {
    const result = await apiVerifyEmail(verificationToken, code);
    if (result.status === "success") setUser(result.user);
    return result;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await fetchMe());
    } catch {
      // Best-effort — the next foreground refresh will catch up.
    }
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, verifyTwoFactor, register, verifyEmail, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

// Plan/trial state for screens. Before the first /auth/me that carries
// `access`, falls back to "can write, OCR as before" rather than locking
// anyone out on a stale session.
export function useAccess(): {
  tier: "trial" | "basic" | "pro" | "none";
  canWrite: boolean;
  ocr: boolean;
  trialEndsAt: Date | null;
  planEndsAt: Date | null;
  daysLeftInTrial: number | null;
} {
  const { user } = useAuth();
  const access = user?.entitlements.access;
  if (!access) {
    const ocr = user?.entitlements.ocr_upgrade_active ?? false;
    return { tier: ocr ? "pro" : "trial", canWrite: true, ocr, trialEndsAt: null, planEndsAt: null, daysLeftInTrial: null };
  }
  const trialEndsAt = access.trial_ends_at ? new Date(access.trial_ends_at) : null;
  return {
    tier: access.tier,
    canWrite: access.can_write,
    ocr: access.ocr,
    trialEndsAt,
    planEndsAt: access.plan_ends_at ? new Date(access.plan_ends_at) : null,
    daysLeftInTrial:
      access.tier === "trial" && trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null
  };
}
