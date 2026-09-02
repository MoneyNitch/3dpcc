import { NextRequest, NextResponse } from "next/server";
import {
  buildConnectionString,
  getDbConfigView,
  getStoredPassword,
  saveDbConfig,
  type SaveDbConfigInput,
} from "@/lib/dbConfig";
import { resetStoreCache, transferDatabaseData } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ config: getDbConfigView() });
}

// Verifies the submitted credentials actually work before persisting them, so a typo
// can't lock the app out of its own database.
async function testConnection(body: SaveDbConfigInput): Promise<void> {
  const password = body.password || getStoredPassword();
  const connectionString = buildConnectionString(
    body.driver as "postgres" | "mysql",
    {
      host: body.host ?? "",
      port: body.port ?? (body.driver === "mysql" ? 3306 : 5432),
      database: body.database ?? "",
      user: body.user ?? "",
    },
    password
  );

  if (body.driver === "postgres") {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    try {
      await pool.query("SELECT 1");
    } finally {
      await pool.end();
    }
  } else if (body.driver === "mysql") {
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection({ uri: connectionString, connectTimeout: 5000 });
    try {
      await connection.query("SELECT 1");
    } finally {
      await connection.end();
    }
  }
}

export async function PUT(req: NextRequest) {
  const { transferData, ...body } = (await req.json()) as SaveDbConfigInput & { transferData?: boolean };
  let connectionString: string | undefined;

  if (body.driver !== "sqlite") {
    try {
      await testConnection(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const password = body.password || getStoredPassword();
    connectionString = buildConnectionString(body.driver, {
      host: body.host ?? "",
      port: body.port ?? (body.driver === "mysql" ? 3306 : 5432),
      database: body.database ?? "",
      user: body.user ?? "",
    }, password);
  }

  if (transferData) {
    try {
      await transferDatabaseData({ driver: body.driver, connectionString });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Datenübertragung fehlgeschlagen.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  saveDbConfig(body);
  resetStoreCache();
  return NextResponse.json({ ok: true, config: getDbConfigView() });
}
