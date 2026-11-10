import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import packageJson from "../../package.json";
import type { GeneralSettings } from "./types";

export type GithubPreferences = Pick<GeneralSettings, "fetchGithubChangelog" | "checkGithubUpdates">;
export type SoftwareInfo = {
  installedVersion: string;
  changelog: { text: string; source: "local" | "github"; checkedAt?: string; error?: string };
  update: {
    status: "disabled" | "available" | "current" | "no-release" | "error";
    version?: string;
    url?: string;
    checkedAt?: string;
    error?: string;
  };
};

const githubBase = "https://api.github.com/repos/MoneyNitch/3dpcc";
const cacheMilliseconds = 60 * 60 * 1000;
const failureCacheMilliseconds = 5 * 60 * 1000;
const maximumResponseBytes = 512 * 1024;
const releaseSchema = z.object({
  tag_name: z.string().min(1).max(100),
  draft: z.literal(false),
  prerelease: z.literal(false),
});

class GithubError extends Error {
  constructor(readonly code: string) { super(code); }
}

export function isNewerRelease(installed: string, latest: string): boolean {
  const parse = (version: string) => {
    const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
    if (!match) throw new GithubError("version");
    const numbers = match.slice(1, 4).map(Number);
    if (!numbers.every(Number.isSafeInteger)) throw new GithubError("version");
    return { numbers, prerelease: match[4] };
  };
  const current = parse(installed);
  const release = parse(latest);
  if (release.prerelease) throw new GithubError("version");
  for (let index = 0; index < 3; index++) {
    if (release.numbers[index] !== current.numbers[index]) {
      return release.numbers[index] > current.numbers[index];
    }
  }
  return Boolean(current.prerelease);
}

async function responseText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new GithubError("response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumResponseBytes) {
        await reader.cancel();
        throw new GithubError("limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

type Resource<T> = {
  controller?: AbortController;
  pending?: Promise<T>;
  cached?: { value: T; expiresAt: number };
};

export function createSoftwareUpdates({
  request = fetch,
  localChangelog = () => readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8"),
  now = Date.now,
}: {
  request?: typeof fetch;
  localChangelog?: () => Promise<string>;
  now?: () => number;
} = {}) {
  const changelog: Resource<SoftwareInfo["changelog"]> = {};
  const update: Resource<SoftwareInfo["update"]> = {};
  let changelogEnabled = false;
  let updatesEnabled = false;

  function disable<T>(resource: Resource<T>) {
    resource.controller?.abort();
    resource.controller = undefined;
    resource.pending = undefined;
    resource.cached = undefined;
  }

  function configure(preferences: GithubPreferences) {
    changelogEnabled = preferences.fetchGithubChangelog === true;
    updatesEnabled = preferences.checkGithubUpdates === true;
    if (!changelogEnabled) disable(changelog);
    if (!updatesEnabled) disable(update);
  }

  async function remote<T>(
    resource: Resource<T>, url: string, accept: string,
    parse: (response: Response) => Promise<T>,
    fallback: (code: string) => T,
    refresh: boolean,
  ): Promise<T> {
    if (resource.pending) return resource.pending;
    if (!refresh && resource.cached && resource.cached.expiresAt > now()) return resource.cached.value;
    const controller = new AbortController();
    resource.controller = controller;
    const pending = (async () => {
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let failed = false;
      let value: T;
      try {
        const response = await request(url, {
          headers: { Accept: accept, "User-Agent": "3D-PCC", "X-GitHub-Api-Version": "2022-11-28" },
          cache: "no-store", redirect: "error", signal: controller.signal,
        });
        if (response.status !== 404 && !response.ok) {
          throw new GithubError(response.status === 403 || response.status === 429 ? "rate-limit" : "response");
        }
        value = await parse(response);
      } catch (error) {
        failed = true;
        const code = error instanceof GithubError ? error.code :
          error instanceof z.ZodError || error instanceof SyntaxError ? "response" :
            controller.signal.aborted ? "cancelled" : "connection";
        if (code !== "cancelled") console.error("GitHub software information request failed:", code);
        value = fallback(code);
      } finally {
        clearTimeout(timeout);
      }
      if (resource.controller === controller) {
        resource.cached = { value, expiresAt: now() + (failed ? failureCacheMilliseconds : cacheMilliseconds) };
      }
      return value;
    })();
    resource.pending = pending;
    try {
      return await pending;
    } finally {
      if (resource.controller === controller) {
        resource.pending = undefined;
        resource.controller = undefined;
      }
    }
  }

  async function getInfo(preferences: GithubPreferences, refresh = false): Promise<SoftwareInfo> {
    configure(preferences);
    let local: SoftwareInfo["changelog"];
    try {
      local = { text: await localChangelog(), source: "local" };
    } catch (error) {
      console.error("Could not read the bundled changelog:", error);
      local = { text: "", source: "local", error: "local" };
    }
    const checkedAt = () => new Date(now()).toISOString();
    const [changelogInfo, updateInfo] = await Promise.all([
      changelogEnabled
        ? remote(changelog, `${githubBase}/contents/CHANGELOG.md`, "application/vnd.github.raw+json",
          async (response): Promise<SoftwareInfo["changelog"]> => {
            if (!response.ok) throw new GithubError("response");
            const text = await responseText(response);
            if (!text.trim()) throw new GithubError("response");
            return { text, source: "github", checkedAt: checkedAt() };
          },
          (code) => ({ ...local, error: code }), refresh)
        : Promise.resolve(local),
      updatesEnabled
        ? remote(update, `${githubBase}/releases/latest`, "application/vnd.github+json",
          async (response): Promise<SoftwareInfo["update"]> => {
            if (response.status === 404) return { status: "no-release", checkedAt: checkedAt() };
            const release = releaseSchema.parse(JSON.parse(await responseText(response)));
            return {
              status: isNewerRelease(packageJson.version, release.tag_name) ? "available" : "current",
              version: release.tag_name,
              url: `https://github.com/MoneyNitch/3dpcc/releases/tag/${encodeURIComponent(release.tag_name)}`,
              checkedAt: checkedAt(),
            };
          },
          (code): SoftwareInfo["update"] => ({ status: "error", error: code }), refresh)
        : Promise.resolve<SoftwareInfo["update"]>({ status: "disabled" }),
    ]);
    return {
      installedVersion: packageJson.version,
      changelog: changelogEnabled ? changelogInfo : local,
      update: updatesEnabled ? updateInfo : { status: "disabled" },
    };
  }

  function getCachedUpdate(preferences: GithubPreferences): SoftwareInfo["update"] | null {
    if (!preferences.checkGithubUpdates) return { status: "disabled" };
    return update.cached && update.cached.expiresAt > now() ? update.cached.value : null;
  }

  return { getInfo, configure, getCachedUpdate };
}

const globalForUpdates = globalThis as typeof globalThis & {
  __pccSoftwareUpdates?: ReturnType<typeof createSoftwareUpdates>;
};
export const softwareUpdates = globalForUpdates.__pccSoftwareUpdates ??= createSoftwareUpdates();
