import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

test("software routes persist independent switches and never contact GitHub in offline mode", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pcc-software-test-"));
  const requireModule = createRequire(import.meta.url);
  const url = (relative: string) => JSON.stringify(new URL(relative, import.meta.url).href);
  const script = `
    import assert from "node:assert/strict";
    import { writeFile } from "node:fs/promises";
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push(String(url));
      assert.equal(options.body, undefined);
      return String(url).endsWith("/releases/latest")
        ? Response.json({ tag_name: "v999.0.0", draft: false, prerelease: false })
        : new Response("# Changelog\\nGitHub notes");
    };
    const db = await import(${url("./db/index.ts")});
    const routes = await import(${url("../app/api/software-updates/route.ts")});
    const { selectGithubPreferences } = await import(${url("../components/SoftwareSettings.tsx")});
    await writeFile("CHANGELOG.md", "# Changelog\\nBundled notes");
    const settings = await db.getSettings();
    await db.saveSettings({
      ...settings,
      general: { ...settings.general, fetchGithubChangelog: false, checkGithubUpdates: false },
    });
    const request = (method, body) => new Request("http://localhost/api/software-updates", {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const method of ["GET", "POST"]) {
      const response = await routes[method](request(method));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.changelog.text, "# Changelog\\nBundled notes");
      assert.equal(body.changelog.source, "local");
      assert.equal(body.update.status, "disabled");
    }
    assert.deepEqual(calls, []);
    const invalid = await routes.PUT(request("PUT", { fetchGithubChangelog: "false", checkGithubUpdates: false }));
    assert.equal(invalid.status, 400);
    assert.deepEqual(calls, []);
    const enable = await routes.PUT(request("PUT", { fetchGithubChangelog: false, checkGithubUpdates: true }));
    assert.equal(enable.status, 200);
    assert.deepEqual(calls, []);
    const online = await routes.GET(request("GET"));
    assert.equal((await online.json()).update.status, "available");
    assert.deepEqual(calls, ["https://api.github.com/repos/MoneyNitch/3dpcc/releases/latest"]);
    const clientPreferences = selectGithubPreferences((await db.getSettings()).general);
    assert.deepEqual(Object.keys(clientPreferences).sort(), ["checkGithubUpdates", "fetchGithubChangelog"]);
    const disable = await routes.PUT(request("PUT", { ...clientPreferences, checkGithubUpdates: false }));
    assert.equal(disable.status, 200);
    const unchanged = await db.getSettings();
    assert.equal(unchanged.general.language, settings.general.language);
    assert.equal(unchanged.general.currency, settings.general.currency);
    db.resetStoreCache();
    const saved = await db.getSettings();
    assert.equal(saved.general.checkGithubUpdates, false);
    assert.equal(saved.general.fetchGithubChangelog, false);
    const offline = await routes.POST(request("POST"));
    assert.equal((await offline.json()).update.status, "disabled");
    assert.equal(calls.length, 1);
    console.log("Software offline routes verified");
  `;
  try {
    const result = spawnSync(process.execPath, [
      "--import", pathToFileURL(requireModule.resolve("tsx")).href, "--input-type=module", "--eval", script,
    ], {
      cwd: directory,
      env: { ...process.env, AUTH_ENABLED: "false", DB_DRIVER: "sqlite", TSX_TSCONFIG_PATH: path.resolve("tsconfig.json") },
      encoding: "utf8", timeout: 60_000,
    });
    assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.ok(result.stdout.includes("Software offline routes verified"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
