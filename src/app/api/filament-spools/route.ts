import { NextResponse } from "next/server";
import { getFilamentConnections } from "@/lib/filamentConfig";
import { fetchExternalSpools, FILAMENT_PROVIDERS, FilamentServiceError, type ExternalSpoolResult } from "@/lib/externalFilaments";

export async function GET() {
  try {
    const connections = getFilamentConnections();
    const results = await Promise.all(FILAMENT_PROVIDERS.filter((provider) => connections[provider].url)
      .map(async (provider): Promise<ExternalSpoolResult> => {
        try {
          return { provider, spools: await fetchExternalSpools(provider, connections[provider]) };
        } catch (error) {
          if (!(error instanceof FilamentServiceError)) throw error;
          console.error(`Could not load filament spools (${provider}): ${error.code}`);
          return { provider, spools: [], error: error.code };
        }
      }));
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Could not read filament connection configuration.");
    return NextResponse.json({ error: "config" }, { status: 500 });
  }
}
