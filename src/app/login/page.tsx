import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAgent } from "@/lib/auth";
import { AgentLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Agent sign in · Series Tours B2B" };

export default async function AgentLoginPage() {
  if (await getAgent()) redirect("/agent");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Series Tours</h1>
          <p className="text-sm text-slate-500">B2B agent portal</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <AgentLoginForm />
        </div>
      </div>
    </div>
  );
}
