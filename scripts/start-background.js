#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const logDir = path.join(projectRoot, "logs");
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, "3d-pcc-live.log");

if (process.platform === "win32") {
  const powershell = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      [
        "Start-Process",
        "-FilePath",
        "npm.cmd",
        "-ArgumentList",
        "'run','start'",
        "-WorkingDirectory",
        `'${projectRoot.replace(/'/g, "''")}'`,
        "-WindowStyle",
        "Hidden",
        "-PassThru"
      ].join(" ")
    ],
    {
      cwd: projectRoot,
      stdio: "inherit",
      windowsHide: true,
    }
  );

  powershell.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Failed to start background process (exit ${code}).`);
      process.exit(code ?? 1);
    }

    console.log("3D-PCC live environment started in the background.");
    console.log(`Working directory: ${projectRoot}`);
  });

  return;
}

const child = spawn("bash", ["-lc", `nohup npm run start > "${logFile}" 2>&1 &`], {
  cwd: projectRoot,
  stdio: "ignore",
  detached: true,
  env: { ...process.env, FORCE_COLOR: "0" },
});

child.unref();
console.log("3D-PCC live environment started in the background.");
console.log(`Log file: ${logFile}`);
