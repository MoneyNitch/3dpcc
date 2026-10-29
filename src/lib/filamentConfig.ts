import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "./dbConfig";
import {
  FILAMENT_PROVIDERS,
  normalizeFilamentServiceUrl,
  type FilamentConnection,
  type FilamentConnectionsView,
  type FilamentProvider,
} from "./externalFilaments";

const storedConnection = z.object({ url: z.string(), apiKeyEncrypted: z.string().nullable() });
const configSchema = z.object({ spoolman: storedConnection, filaman: storedConnection });
type StoredFilamentConfig = z.infer<typeof configSchema>;
const configPath = path.join(process.cwd(), "data", "filament-config.json");

function readConfig(): StoredFilamentConfig {
  try {
    return configSchema.parse(JSON.parse(fs.readFileSync(configPath, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        spoolman: { url: "", apiKeyEncrypted: null },
        filaman: { url: "", apiKeyEncrypted: null },
      };
    }
    throw error;
  }
}

export function getFilamentConnectionsView(): FilamentConnectionsView {
  const config = readConfig();
  return {
    spoolman: { url: config.spoolman.url, hasApiKey: !!config.spoolman.apiKeyEncrypted },
    filaman: { url: config.filaman.url, hasApiKey: !!config.filaman.apiKeyEncrypted },
  };
}

export function getFilamentConnections(): Record<FilamentProvider, FilamentConnection> {
  const config = readConfig();
  const connection = (provider: FilamentProvider): FilamentConnection => ({
    url: config[provider].url,
    apiKey: config[provider].apiKeyEncrypted ? decryptSecret(config[provider].apiKeyEncrypted) : "",
  });
  return { spoolman: connection("spoolman"), filaman: connection("filaman") };
}

export function prepareFilamentConnection(
  provider: FilamentProvider,
  input: { url: string; apiKey: string; clearApiKey: boolean }
): FilamentConnection {
  const url = input.url.trim() ? normalizeFilamentServiceUrl(input.url) : "";
  const current = getFilamentConnections()[provider];
  return {
    url,
    apiKey: !url || input.clearApiKey ? "" : input.apiKey.trim() ||
      (url === current.url ? current.apiKey : ""),
  };
}

export function saveFilamentConnection(provider: FilamentProvider, connection: FilamentConnection): void {
  const config = readConfig();
  config[provider] = {
    url: connection.url,
    apiKeyEncrypted: connection.apiKey ? encryptSecret(connection.apiKey) : null,
  };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath + ".tmp", JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(configPath + ".tmp", configPath);
}

export const filamentConnectionInput = z.object({
  provider: z.enum(FILAMENT_PROVIDERS),
  url: z.string().max(2048),
  apiKey: z.string().max(4096).regex(/^[^\r\n]*$/).default(""),
  clearApiKey: z.boolean().default(false),
});
