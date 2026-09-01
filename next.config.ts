import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "adm-zip", "pg", "mysql2"],
};

export default nextConfig;
