import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAgentSessionId, clearSession } from "@/lib/auth";
import { Card } from "@/components/ui";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password · Series Tours B2B" };
export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  await clearSession("agent");
  redirect("/login");
}

/**
 * Deliberately outside the (portal) route group: an agent on a temporary
 * password is sent here by the portal layout, so this page must not itself sit
 * behind that redirect.
 */
export default async function ChangePasswordPage() {
  const agentId = await getAgentSessionId();
  if (!agentId) redirect("/login");

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { agencyName: true, mustChangePassword: true, status: true },
  });
  if (!agent || agent.status !== "approved") redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Series Tours</h1>
          <p className="text-sm text-slate-500">{agent.agencyName}</p>
        </div>

        <Card>
          {agent.mustChangePassword && (
            <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              You are signed in with a temporary password. Choose a new one to continue.
            </div>
          )}
          <ChangePasswordForm />
        </Card>

        <form action={signOut} className="mt-4 text-center">
          <button type="submit" className="text-sm text-slate-500 hover:text-slate-700">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
