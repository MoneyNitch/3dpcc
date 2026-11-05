import AdmZip from "adm-zip";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scryptSync,
} from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import packageJson from "../../package.json";
import { exportAuthDatabase, restoreAuthDatabase, verifyAuthDatabase } from "./auth/store";
import { defaultCostInputs } from "./costCalculator";
import { getApplicationDataSnapshot, replaceApplicationData } from "./db";
import {
  costInputsSchema,
  printSchema,
  settingsSchema,
} from "./api/schemas";
import { getFilamentConnections, replaceFilamentConnections } from "./filamentConfig";
import { orderInputSchema } from "./orders";
import { getPreviewQueue } from "./previewQueue";
import { normalizeFilamentServiceUrl, type FilamentConnection } from "./externalFilaments";
import type { ApplicationDataSnapshot } from "./db/shared";
import type { PrintOrder } from "./types";
import { orderCalculationSnapshotSchema } from "./orderCalculation";

const magic = Buffer.from("3DPCCBACKUP1", "ascii");
export const maximumBackupBytes = 512 * 1024 * 1024;
const maximumEntries = 50_000;
const maximumUncompressedBytes = 512 * 1024 * 1024;
const dataDirectory = path.join(process.cwd(), "data");
const directoryTargets = ["original-archives", "order-gcode", "preview-jobs"] as const;

export class BackupError extends Error {}

type BackupData = {
  snapshot: ApplicationDataSnapshot;
  authDatabase: Buffer;
  filamentConnections: Record<"spoolman" | "filaman", FilamentConnection>;
  localFiles: { name: string; data: Buffer }[];
};

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function encryptBackup(archive: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBackup(encrypted: Buffer, passphrase: string): Buffer {
  const headerSize = magic.length + 16 + 12 + 16;
  if (encrypted.length <= headerSize || !encrypted.subarray(0, magic.length).equals(magic)) {
    throw new BackupError("Backup-Datei oder Passwort ist ungültig.");
  }
  const saltStart = magic.length;
  const ivStart = saltStart + 16;
  const tagStart = ivStart + 12;
  const contentStart = tagStart + 16;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(passphrase, encrypted.subarray(saltStart, ivStart)),
      encrypted.subarray(ivStart, tagStart),
    );
    decipher.setAuthTag(encrypted.subarray(tagStart, contentStart));
    return Buffer.concat([
      decipher.update(encrypted.subarray(contentStart)),
      decipher.final(),
    ]);
  } catch {
    throw new BackupError("Backup-Datei oder Passwort ist ungültig.");
  }
}

async function addDirectory(zip: AdmZip, source: string, target: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const archivePath = `${target}/${entry.name}`;
    const info = await lstat(sourcePath);
    if (info.isSymbolicLink()) throw new Error(`Backup-Pfad ist ein symbolischer Link: ${sourcePath}`);
    if (info.isDirectory()) {
      await addDirectory(zip, sourcePath, archivePath);
    } else if (info.isFile() && !entry.name.endsWith(".tmp")) {
      zip.addFile(archivePath, await readFile(sourcePath));
    }
  }
}

export async function createBackup(passphrase: string): Promise<Buffer> {
  const [snapshot, authDatabase] = await Promise.all([
    getApplicationDataSnapshot(),
    exportAuthDatabase(),
  ]);
  const zip = new AdmZip();
  zip.addFile("manifest.json", Buffer.from(JSON.stringify({
    format: "3dpcc-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: packageJson.version,
  }), "utf8"));
  zip.addFile("application.json", Buffer.from(JSON.stringify({
    settings: snapshot.settings,
    prints: snapshot.prints.map((entry) => ({
      print: entry.print,
      costInputs: entry.costInputs,
      models: entry.models.map((model) => ({
        plateIndex: model.plateIndex,
        data: model.model.toString("base64"),
      })),
    })),
    orders: snapshot.orders,
    filamentConnections: getFilamentConnections(),
  }), "utf8"));
  zip.addFile("auth/auth.db", authDatabase);
  for (const directory of directoryTargets) {
    await addDirectory(zip, path.join(dataDirectory, directory), `local/${directory}`);
  }
  const archive = zip.toBuffer();
  const encrypted = encryptBackup(archive, passphrase);
  if (encrypted.byteLength > maximumBackupBytes) {
    throw new BackupError("Das Backup überschreitet die maximale Größe von 512 MB.");
  }
  return encrypted;
}

function readJson(zip: AdmZip, name: string): unknown {
  const entry = zip.getEntry(name);
  if (!entry || entry.isDirectory) throw new BackupError("Backup-Datei ist unvollständig.");
  try {
    return JSON.parse(entry.getData().toString("utf8")) as unknown;
  } catch {
    throw new BackupError("Backup-Datei enthält ungültige Daten.");
  }
}

function safeArchivePath(name: string): boolean {
  if (!name || name.includes("\\") || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return false;
  const parts = name.split("/");
  return parts.every((part, index) =>
    part !== "." && part !== ".." && (part.length > 0 || index === parts.length - 1)
  );
}

function isAllowedLocalPath(name: string): boolean {
  const orderGcodePrefix = "local/order-gcode/";
  if (name.startsWith(orderGcodePrefix)) {
    return /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.gcode$/i
      .test(name.slice(orderGcodePrefix.length));
  }
  const originalPrefix = "local/original-archives/";
  if (name.startsWith(originalPrefix)) {
    return /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.3mf$/i
      .test(name.slice(originalPrefix.length));
  }
  const queuePrefix = "local/preview-jobs/";
  if (!name.startsWith(queuePrefix)) return false;
  const relative = name.slice(queuePrefix.length);
  if (relative === "order.json") return true;
  const [id, ...parts] = relative.split("/");
  return /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) &&
    parts.length > 0 && parts.every((part) => /^[\w.-]+$/.test(part));
}

function parseBackupData(zip: AdmZip): BackupData {
  const entries = zip.getEntries();
  if (entries.length > maximumEntries) throw new BackupError("Das Backup enthält zu viele Dateien.");
  let totalSize = 0;
  const names = new Set<string>();
  for (const entry of entries) {
    if (!safeArchivePath(entry.entryName)) throw new BackupError("Backup enthält einen ungültigen Dateipfad.");
    if (names.has(entry.entryName)) throw new BackupError("Backup enthält doppelte Dateieinträge.");
    names.add(entry.entryName);
    totalSize += entry.header.size;
    if (totalSize > maximumUncompressedBytes) throw new BackupError("Das entpackte Backup überschreitet 512 MB.");
    if (!["manifest.json", "application.json", "auth/auth.db"].includes(entry.entryName) &&
      entry.entryName !== "filament-connections.json" && !entry.isDirectory &&
      !isAllowedLocalPath(entry.entryName)) {
      throw new BackupError("Backup enthält einen nicht unterstützten Dateityp.");
    }
  }

  const manifest = readJson(zip, "manifest.json");
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
    (manifest as Record<string, unknown>).format !== "3dpcc-backup" ||
    (manifest as Record<string, unknown>).version !== 1) {
    throw new BackupError("Dieses Backup-Format wird nicht unterstützt.");
  }

  const raw = readJson(zip, "application.json");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BackupError("Backup enthält keine gültigen Anwendungsdaten.");
  }
  const object = raw as Record<string, unknown>;
  const settings = settingsSchema.safeParse(object.settings);
  if (!settings.success || !Array.isArray(object.prints) || !Array.isArray(object.orders)) {
    throw new BackupError("Backup enthält ungültige Anwendungsdaten.");
  }

  const prints: ApplicationDataSnapshot["prints"] = [];
  for (const value of object.prints) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BackupError("Backup enthält einen ungültigen Druck.");
    }
    const entry = value as Record<string, unknown>;
    const print = printSchema.safeParse(entry.print);
    const costInputs = entry.costInputs === null
      ? { success: true as const, data: null }
      : costInputsSchema.partial().safeParse(entry.costInputs);
    if (!print.success || !costInputs.success || !Array.isArray(entry.models)) {
      throw new BackupError("Backup enthält ungültige Druckdaten.");
    }
    const models: ApplicationDataSnapshot["prints"][number]["models"] = [];
    for (const modelValue of entry.models) {
      if (!modelValue || typeof modelValue !== "object" || Array.isArray(modelValue)) {
        throw new BackupError("Backup enthält eine ungültige Druckvorschau.");
      }
      const model = modelValue as Record<string, unknown>;
      if ((model.plateIndex !== null &&
          (typeof model.plateIndex !== "number" || !Number.isSafeInteger(model.plateIndex) || model.plateIndex < 1)) ||
        typeof model.data !== "string" ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(model.data)) {
        throw new BackupError("Backup enthält eine ungültige Druckvorschau.");
      }
      const decoded = Buffer.from(model.data, "base64");
      if (decoded.toString("base64") !== model.data) throw new BackupError("Backup enthält eine ungültige Druckvorschau.");
      models.push({ plateIndex: model.plateIndex, model: decoded });
    }
    prints.push({
      print: print.data,
      costInputs: costInputs.data === null
        ? null
        : { ...defaultCostInputs(settings.data), ...costInputs.data },
      models,
    });
  }

  const orderSchema = orderInputSchema.extend({
    id: z.uuid(),
    calculation: orderCalculationSnapshotSchema.optional(),
    gcodeAttachment: z.strictObject({
      fileName: z.string().min(1).max(255),
      size: z.number().int().positive().max(50 * 1024 * 1024),
    }).optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });
  const orders = object.orders.map((value) => {
    const order = orderSchema.safeParse(value);
    if (!order.success) throw new BackupError("Backup enthält einen ungültigen Auftrag.");
    return order.data as PrintOrder;
  });
  if (new Set(orders.map((order) => order.id)).size !== orders.length) {
    throw new BackupError("Backup enthält doppelte Aufträge.");
  }
  const printIds = new Set(prints.map((entry) => entry.print.id));
  if (new Set([...printIds]).size !== prints.length ||
    orders.some((order) => order.items.some((item) => !printIds.has(item.printId)))) {
    throw new BackupError("Backup enthält ungültige Druckzuordnungen.");
  }

  const filament = object.filamentConnections;
  if (!filament || typeof filament !== "object" || Array.isArray(filament)) {
    throw new BackupError("Backup enthält ungültige Verbindungseinstellungen.");
  }
  const connections = filament as Record<string, unknown>;
  const restoredConnections = {} as Record<"spoolman" | "filaman", FilamentConnection>;
  for (const provider of ["spoolman", "filaman"] as const) {
    const connection = connections[provider];
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
      throw new BackupError("Backup enthält ungültige Verbindungseinstellungen.");
    }
    const entry = connection as Record<string, unknown>;
    if (typeof entry.url !== "string" || typeof entry.apiKey !== "string" ||
      entry.url.length > 2048 || entry.apiKey.length > 4096) {
      throw new BackupError("Backup enthält ungültige Verbindungseinstellungen.");
    }
    try {
      restoredConnections[provider] = {
        url: entry.url.trim() ? normalizeFilamentServiceUrl(entry.url) : "",
        apiKey: entry.apiKey,
      };
    } catch {
      throw new BackupError("Backup enthält eine ungültige Dienstadresse.");
    }
  }

  const authEntry = zip.getEntry("auth/auth.db");
  if (!authEntry || authEntry.header.size > 64 * 1024 * 1024) {
    throw new BackupError("Backup enthält keine gültige Benutzerdatenbank.");
  }
  const localFiles = entries.filter((entry) => !entry.isDirectory && isAllowedLocalPath(entry.entryName))
    .map((entry) => ({ name: entry.entryName, data: entry.getData() }));

  return {
    snapshot: { settings: settings.data, prints, orders },
    authDatabase: authEntry.getData(),
    filamentConnections: restoredConnections,
    localFiles,
  };
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

type DirectoryReplacement = {
  target: string;
  previous: string;
  incoming: string;
  hadPrevious: boolean;
  previousMoved: boolean;
  incomingMoved: boolean;
};

async function rollbackDirectories(replacements: DirectoryReplacement[]): Promise<void> {
  for (const replacement of replacements.reverse()) {
    if (replacement.incomingMoved) {
      await rm(replacement.target, { recursive: true, force: true });
    }
    if (replacement.previousMoved) {
      await rename(replacement.previous, replacement.target);
    }
  }
}

export async function restoreBackup(encrypted: Buffer, passphrase: string): Promise<void> {
  const zip = new AdmZip(decryptBackup(encrypted, passphrase));
  const incoming = parseBackupData(zip);
  await verifyAuthDatabase(incoming.authDatabase);

  const originalSnapshot = await getApplicationDataSnapshot();
  const originalAuth = await exportAuthDatabase();
  const originalFilament = getFilamentConnections();
  const staging = path.join(dataDirectory, `.restore-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  const replacements: DirectoryReplacement[] = [];
  let authChanged = false;
  let filamentChanged = false;
  let applicationChanged = false;
  const queue = await getPreviewQueue();

  try {
    await queue.stop();
    for (const directory of directoryTargets) {
      const target = path.join(dataDirectory, directory);
      const previous = path.join(staging, `previous-${directory}`);
      const stagedIncoming = path.join(staging, `incoming-${directory}`);
      await mkdir(stagedIncoming, { recursive: true });
      for (const file of incoming.localFiles) {
        const prefix = `local/${directory}/`;
        if (!file.name.startsWith(prefix)) continue;
        const relative = file.name.slice(prefix.length).split("/");
        const destination = path.join(stagedIncoming, ...relative);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, file.data, { mode: 0o600 });
      }
      const replacement: DirectoryReplacement = {
        target,
        previous,
        incoming: stagedIncoming,
        hadPrevious: await pathExists(target),
        previousMoved: false,
        incomingMoved: false,
      };
      replacements.push(replacement);
      if (replacement.hadPrevious) {
        await rename(target, previous);
        replacement.previousMoved = true;
      }
      await rename(stagedIncoming, target);
      replacement.incomingMoved = true;
    }

    authChanged = true;
    await restoreAuthDatabase(incoming.authDatabase);
    filamentChanged = true;
    replaceFilamentConnections(incoming.filamentConnections);
    applicationChanged = true;
    await replaceApplicationData(incoming.snapshot);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    try {
      if (applicationChanged) await replaceApplicationData(originalSnapshot);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      if (filamentChanged) replaceFilamentConnections(originalFilament);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      if (authChanged) await restoreAuthDatabase(originalAuth);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      await rollbackDirectories(replacements);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    if (rollbackErrors.length > 0) {
      console.error("Backup restore rollback failed:", rollbackErrors);
      throw new AggregateError([error, ...rollbackErrors], "Backup restore and rollback both failed.");
    }
    throw error;
  } finally {
    queue.start();
    await rm(staging, { recursive: true, force: true });
  }
}
