import assert from "node:assert/strict";
import { test } from "node:test";
import packageJson from "../../package.json";
import { createSoftwareUpdates, isNewerRelease } from "./softwareUpdates";

const offline = { fetchGithubChangelog: false, checkGithubUpdates: false };
const localChangelog = async () => "# Changelog\n\nLocal release notes";
const release = { tag_name: "v999.0.0", draft: false, prerelease: false };

test("menu reads only fresh cached update information and never initiates requests", async () => {
  let calls = 0;
  let now = 0;
  const service = createSoftwareUpdates({
    localChangelog, now: () => now,
    request: async () => { calls++; return Response.json(release); },
  });
  const enabled = { ...offline, checkGithubUpdates: true };
  assert.equal(service.getCachedUpdate(enabled), null);
  assert.equal(service.getCachedUpdate(offline)?.status, "disabled");
  assert.equal(calls, 0);
  await service.getInfo(enabled);
  assert.equal(service.getCachedUpdate(enabled)?.status, "available");
  assert.equal(service.getCachedUpdate(offline)?.status, "disabled");
  assert.equal(calls, 1);
  now += 60 * 60 * 1000;
  assert.equal(service.getCachedUpdate(enabled), null);
  assert.equal(calls, 1);
  service.configure(offline);
  assert.equal(service.getCachedUpdate(enabled), null);
});

test("compares numeric versions, including v prefixes, installed prereleases and build metadata", () => {
  assert.equal(isNewerRelease("0.9.0", "v0.10.0"), true);
  assert.equal(isNewerRelease("1.10.0", "v1.9.0"), false);
  assert.equal(isNewerRelease("1.0.0", "1.0.0+build"), false);
  assert.equal(isNewerRelease("1.0.0-rc.1", "v1.0.0"), true);
  assert.equal(isNewerRelease("2.0.0", "1.99.0"), false);
  for (const version of ["main", "1.2", "1.02.3", "1.2.3-rc.1", "999999999999999999.0.0"]) {
    assert.throws(() => isNewerRelease("1.0.0", version));
  }
});

test("offline mode never calls fetch, even when explicitly refreshing", async () => {
  const service = createSoftwareUpdates({
    localChangelog,
    request: async () => { assert.fail("Offline mode must not contact GitHub."); },
  });
  for (const refresh of [false, true]) {
    const info = await service.getInfo(offline, refresh);
    assert.equal(info.installedVersion, packageJson.version);
    assert.equal(info.changelog.source, "local");
    assert.equal(info.changelog.text, await localChangelog());
    assert.equal(info.update.status, "disabled");
  }
});

test("switches gate the two endpoints independently and only fixed public requests are sent", async () => {
  const calls: string[] = [];
  const service = createSoftwareUpdates({
    localChangelog,
    request: async (url, options) => {
      calls.push(String(url));
      assert.equal(options?.method, undefined);
      assert.equal(options?.body, undefined);
      assert.equal(options?.redirect, "error");
      assert.equal(options?.cache, "no-store");
      assert.deepEqual(Object.keys(options?.headers ?? {}).sort(), ["Accept", "User-Agent", "X-GitHub-Api-Version"]);
      return String(url).endsWith("/releases/latest")
        ? Response.json(release) : new Response("# Changelog\nRemote notes");
    },
  });
  const changelogOnly = await service.getInfo({ ...offline, fetchGithubChangelog: true });
  assert.equal(changelogOnly.changelog.source, "github");
  assert.equal(changelogOnly.update.status, "disabled");
  const updatesOnly = await service.getInfo({ ...offline, checkGithubUpdates: true });
  assert.equal(updatesOnly.changelog.source, "local");
  assert.equal(updatesOnly.update.status, "available");
  assert.equal(updatesOnly.update.url, "https://github.com/MoneyNitch/3dpcc/releases/tag/v999.0.0");
  assert.deepEqual(calls, [
    "https://api.github.com/repos/MoneyNitch/3dpcc/contents/CHANGELOG.md",
    "https://api.github.com/repos/MoneyNitch/3dpcc/releases/latest",
  ]);
});

test("successful responses are cached for one hour; explicit refresh bypasses the cache", async () => {
  let now = 0;
  let calls = 0;
  const service = createSoftwareUpdates({
    now: () => now, localChangelog,
    request: async () => { calls++; return Response.json(release); },
  });

  test("concurrent settings requests share a single GitHub request", async () => {
    let finish!: (response: Response) => void;
    let started!: () => void;
    let calls = 0;
    const requestStarted = new Promise<void>((resolve) => { started = resolve; });
    const service = createSoftwareUpdates({
      localChangelog,
      request: async () => {
        calls++;
        started();
        return new Promise<Response>((resolve) => { finish = resolve; });
      },
    });
    const enabled = { ...offline, checkGithubUpdates: true };
    const first = service.getInfo(enabled);
    await requestStarted;
    const second = service.getInfo(enabled);
    finish(Response.json(release));
    await Promise.all([first, second]);
    assert.equal(calls, 1);
  });
  const enabled = { ...offline, checkGithubUpdates: true };
  await service.getInfo(enabled);
  await service.getInfo(enabled);
  assert.equal(calls, 1);
  await service.getInfo(enabled, true);
  assert.equal(calls, 2);
  now += 60 * 60 * 1000;
  await service.getInfo(enabled);
  assert.equal(calls, 3);
});

test("GitHub failures explicitly retain local notes and never pretend the version is current", async () => {
  let calls = 0;
  const service = createSoftwareUpdates({
    localChangelog,
    request: async () => { calls++; return new Response("Rate limited", { status: 429 }); },
  });
  const enabled = { fetchGithubChangelog: true, checkGithubUpdates: true };
  const info = await service.getInfo(enabled);
  assert.equal(info.changelog.source, "local");
  assert.equal(info.changelog.error, "rate-limit");
  assert.equal(info.update.status, "error");
  assert.equal(info.update.error, "rate-limit");
  await service.getInfo(enabled);
  assert.equal(calls, 2);
});

test("missing releases and invalid release payloads are distinguishable", async () => {
  for (const [response, expected] of [
    [new Response("", { status: 404 }), "no-release"],
    [Response.json({ ...release, prerelease: true }), "error"],
    [Response.json({ ...release, tag_name: "main" }), "error"],
  ] as const) {
    const service = createSoftwareUpdates({ localChangelog, request: async () => response });
    const info = await service.getInfo({ ...offline, checkGithubUpdates: true });
    assert.equal(info.update.status, expected);
  }
});

test("oversized changelogs are rejected rather than displayed", async () => {
  const service = createSoftwareUpdates({
    localChangelog, request: async () => new Response("x".repeat(512 * 1024 + 1)),
  });
  const info = await service.getInfo({ ...offline, fetchGithubChangelog: true });
  assert.equal(info.changelog.source, "local");
  assert.equal(info.changelog.error, "limit");
});

test("disabling cancels in-flight requests and prevents new requests after local reads", async () => {
  let calls = 0;
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  const service = createSoftwareUpdates({
    localChangelog,
    request: async (_url, options) => {
      calls++;
      started();
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
  });
  const pending = service.getInfo({ ...offline, checkGithubUpdates: true });
  await requestStarted;
  service.configure(offline);
  assert.equal((await pending).update.status, "disabled");
  await service.getInfo(offline, true);
  assert.equal(calls, 1);

  let finishRead!: (text: string) => void;
  const reading = createSoftwareUpdates({
    localChangelog: () => new Promise<string>((resolve) => { finishRead = resolve; }),
    request: async () => { assert.fail("Disabled while reading local changelog."); },
  });
  const waiting = reading.getInfo({ fetchGithubChangelog: true, checkGithubUpdates: true });
  reading.configure(offline);
  finishRead("# Changelog");
  const info = await waiting;
  assert.equal(info.changelog.source, "local");
  assert.equal(info.update.status, "disabled");
});
