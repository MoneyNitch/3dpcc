import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("persists encrypted connection keys without exposing them or reusing them for different servers", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "3dpcc-filament-config-"));
  const require = createRequire(import.meta.url);
  const script = `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const ts = require(${JSON.stringify(require.resolve("typescript"))});
    require.extensions['.ts'] = (module, filename) => {
      module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 }
      }).outputText, filename);
    };
    process.chdir(${JSON.stringify(directory)});
    const config = require(${JSON.stringify(path.resolve("src", "lib", "filamentConfig.ts"))});
    const db = require(${JSON.stringify(path.resolve("src", "lib", "dbConfig.ts"))});
    assert.equal(config.getFilamentConnectionsView().spoolman.url, '');
    db.saveDbConfig({ driver: 'postgres', password: 'database-test-password' });
    config.saveFilamentConnection('spoolman', { url: 'http://localhost:7912', apiKey: 'spoolman-test-key' });
    config.saveFilamentConnection('filaman', { url: 'http://localhost:8083', apiKey: 'filaman-test-key' });
    assert.equal(config.getFilamentConnections().spoolman.apiKey, 'spoolman-test-key');
    assert.equal(config.getFilamentConnections().filaman.apiKey, 'filaman-test-key');
    assert.equal(db.getStoredPassword(), 'database-test-password');
    const view = config.getFilamentConnectionsView();
    assert.equal(view.spoolman.hasApiKey, true);
    assert.equal(JSON.stringify(view).includes('test-key'), false);
    const stored = fs.readFileSync('data/filament-config.json', 'utf8');
    assert.equal(stored.includes('test-key'), false);
    assert.equal(config.prepareFilamentConnection('spoolman', {
      url: 'http://localhost:7912/api/v1/', apiKey: '', clearApiKey: false
    }).apiKey, 'spoolman-test-key');
    assert.equal(config.prepareFilamentConnection('spoolman', {
      url: 'http://different-server:7912', apiKey: '', clearApiKey: false
    }).apiKey, '');
    assert.equal(config.prepareFilamentConnection('spoolman', {
      url: 'http://localhost:7912', apiKey: '', clearApiKey: true
    }).apiKey, '');
    config.saveFilamentConnection('spoolman', { url: '', apiKey: '' });
    assert.deepEqual(config.getFilamentConnectionsView().spoolman, { url: '', hasApiKey: false });
    assert.equal(config.getFilamentConnections().filaman.apiKey, 'filaman-test-key');
    fs.writeFileSync('data/filament-config.json', '{broken');
    assert.throws(() => config.getFilamentConnectionsView());
  `;
  try {
    assert.doesNotThrow(() => execFileSync(process.execPath, ["-e", script], { stdio: "pipe" }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
