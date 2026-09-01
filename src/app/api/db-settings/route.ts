import { NextRequest, NextResponse } from "next/server";
import {
  buildConnectionString,
  getDbConfigView,
  getStoredPassword,
  saveDbConfig,
  type SaveDbConfigInput,
} from "@/lib/dbConfig";
import { resetStoreCache } from "@/lib/db";

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
  const body = (await req.json()) as SaveDbConfigInput;

  if (body.driver !== "sqlite") {
    try {
      await testConnection(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verbindung fehlgeschlagen.";
      return NextResponse.json({ error: `Verbindung fehlgeschlagen: ${message}` }, { status: 400 });
    }
  }

  saveDbConfig(body);
  resetStoreCache();
  return NextResponse.json({ ok: true, config: getDbConfigView() });
}
