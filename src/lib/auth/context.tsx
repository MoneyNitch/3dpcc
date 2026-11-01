"use client";

import { createContext, useContext } from "react";
import { hasPermission, type Identity, type Permission } from "./permissions";

const AuthContext = createContext<{ enabled: boolean; user: Identity | null }>({ enabled: true, user: null });
export function AuthProvider({ enabled, user, children }: { enabled: boolean; user: Identity | null; children: React.ReactNode }) {
  return <AuthContext.Provider value={{ enabled, user }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
export function usePermission(permission: Permission): boolean {
  const { enabled, user } = useAuth();
  return hasPermission(user, permission, enabled);
}
