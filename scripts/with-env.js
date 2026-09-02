#!/usr/bin/env node
const path = require("node:path");
const { spawn } = require("node:child_process");
const { loadEnvConfig } = require("@next/env");

const command = process.argv[2];
loadEnvConfig(process.cwd(), command === "dev");
const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  cwd: path.resolve(__dirname, ".."),
});
child.on("exit", (code) => process.exit(code ?? 0));
