import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAgent, clearSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Series Tours B2B" };

async function signOut() {
  "use server";
  await clearSession("agent");
  redirect("/login");
}

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const agent = await getAgent();
  if (!agent) redirect("/login");

  // A forced password change blocks the whole portal. /agent/change-password
  // deliberately sits OUTSIDE this route group, so it has no layout to redirect
  // out of and cannot loop.
  if (agent.mustChangePassword) redirect("/agent/change-password");

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/agent" className="text-sm font-semibold text-slate-900">
            Series Tours <span className="font-normal text-slate-400">B2B</span>
          </Link>
          <form action={signOut} className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">{agent.agencyName}</span>
            <Link href="/agent/change-password" className="text-sm text-slate-600 hover:text-blue-700">
              Password
            </Link>
            <button type="submit" className="text-sm text-slate-600 hover:text-red-700">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
