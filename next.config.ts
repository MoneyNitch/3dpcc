import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "adm-zip", "pg", "mysql2"],
  // Standalone output keeps the production Docker image small (self-contained server.js).
  output: "standalone",
};

export default nextConfig;
