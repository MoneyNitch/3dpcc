import { cookies } from "next/headers";
import type { Theme } from "./types";

/** Theme lives in a cookie so the server can render the correct class without a flash or hydration mismatch. */
export async function getTheme(): Promise<Theme> {
  const stored = (await cookies()).get("theme")?.value;
  return stored === "dark" ? "dark" : "light";
}
