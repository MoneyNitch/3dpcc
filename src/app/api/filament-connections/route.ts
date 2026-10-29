import { NextResponse } from "next/server";
import {
  filamentConnectionInput,
  getFilamentConnectionsView,
  prepareFilamentConnection,
  saveFilamentConnection,
} from "@/lib/filamentConfig";
import { fetchExternalSpools, FilamentServiceError } from "@/lib/externalFilaments";

export async function PUT(request: Request) {
  let input;
  try {
    input = filamentConnectionInput.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "input" }, { status: 400 });
  }
  if (!input.success) return NextResponse.json({ error: "input" }, { status: 400 });
  let connection;
  try {
    connection = prepareFilamentConnection(input.data.provider, input.data);
  } catch (error) {
    if (error instanceof FilamentServiceError && error.code === "url") {
      return NextResponse.json({ error: "url" }, { status: 400 });
    }
    console.error("Could not read filament connection configuration.");
    return NextResponse.json({ error: "config" }, { status: 500 });
  }
  try {
    if (connection.url) await fetchExternalSpools(input.data.provider, connection, true);
    saveFilamentConnection(input.data.provider, connection);
    return NextResponse.json({ connections: getFilamentConnectionsView() });
  } catch (error) {
    if (error instanceof FilamentServiceError) {
      console.error(`Filament connection test failed (${input.data.provider}): ${error.code}`);
      return NextResponse.json({ error: error.code }, { status: 502 });
    }
    console.error("Could not save filament connection configuration.");
    return NextResponse.json({ error: "config" }, { status: 500 });
  }
}
