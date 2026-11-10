import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "adm-zip", "fast-xml-parser", "pg", "mysql2"],
  // Standalone output keeps the production Docker image small (self-contained server.js).
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [".preview-worker/**/*", "node_modules/fast-xml-parser/lib/fxp.cjs", "CHANGELOG.md"],
    "/api/v1/\\[\\[\\.\\.\\.path\\]\\]": [
      "node_modules/swagger-ui-dist/package.json",
      "node_modules/swagger-ui-dist/swagger-ui.css",
      "node_modules/swagger-ui-dist/swagger-ui-bundle.js",
    ],
  },
};

export default nextConfig;
