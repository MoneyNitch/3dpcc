import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { authEnabled, currentIdentity } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (!authEnabled()) redirect("/");
  const user = await currentIdentity();
  if (user) redirect(user.mustChangePassword || user.mustChangeUsername ? "/account" : "/");
  return <AuthForm />;
}
