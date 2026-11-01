import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { authEnabled, requirePage } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  if (!authEnabled()) redirect("/");
  const user = await requirePage(undefined, true);
  return user && <AuthForm user={user} />;
}
