export const permissions = [
  "prints.read", "prints.write", "documents.read", "documents.write",
  "settings.read", "settings.write", "integrations.manage", "database.manage",
  "support.export", "api.use",
] as const;

export type Permission = typeof permissions[number] | "users.manage";
export interface Role {
  id: string;
  name: string;
  permissions: Permission[];
  builtIn: boolean;
}
export interface AuthUser {
  id: string;
  username: string;
  roleId: string;
  active: boolean;
  mustChangePassword: boolean;
  mustChangeUsername: boolean;
}
export interface Identity extends AuthUser {
  permissions: Permission[];
}

export const builtInRoles: Role[] = [
  { id: "viewer", name: "Viewer", builtIn: true, permissions: ["prints.read", "documents.read", "settings.read", "api.use"] },
  { id: "admin", name: "Admin", builtIn: true, permissions: [
    "prints.read", "prints.write", "documents.read", "documents.write", "settings.read", "settings.write", "api.use",
  ] },
  { id: "superadmin", name: "Superadmin", builtIn: true, permissions: [...permissions, "users.manage"] },
];

export function hasPermission(identity: Identity | null, permission: Permission, enabled = true): boolean {
  return !enabled || Boolean(identity?.permissions.includes(permission));
}

export function withRequiredReadPermissions(selected: Permission[]): Permission[] {
  const result = new Set(selected);
  for (const area of ["prints", "documents", "settings"] as const) {
    if (result.has(`${area}.write`)) result.add(`${area}.read`);
  }
  if (selected.some((item) => ["database.manage", "integrations.manage", "support.export"].includes(item))) {
    result.add("settings.read");
  }
  return [...result];
}

export function apiPermission(path: string, method: string): Permission {
  const read = method === "GET" || method === "HEAD";
  if (path.endsWith("/calculate")) return "prints.read";
  if (path.startsWith("/prints")) return read ? "prints.read" : "prints.write";
  if (path.startsWith("/products")) return read ? "prints.read" : "prints.write";
  if (path.startsWith("/invoices") || path.startsWith("/quotes")) return read ? "documents.read" : "documents.write";
  if (path.startsWith("/spools")) return "prints.read";
  return read ? "settings.read" : "settings.write";
}
