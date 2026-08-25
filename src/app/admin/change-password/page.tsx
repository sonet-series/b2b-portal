import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSessionId, clearSession } from "@/lib/auth";
import { Card } from "@/components/ui";
import { AdminChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password · Series Tours admin" };
export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  await clearSession("admin");
  redirect("/admin/login");
}

/**
 * Deliberately outside the (dashboard) route group, so the forced-change
 * redirect in that layout cannot loop back into itself.
 */
export default async function AdminChangePasswordPage() {
  const adminId = await getAdminSessionId();
  if (!adminId) redirect("/admin/login");

  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { email: true, mustChangePassword: true },
  });
  if (!admin) redirect("/admin/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Series Tours</h1>
          <p className="text-sm text-slate-500">{admin.email}</p>
        </div>

        <Card>
          {admin.mustChangePassword && (
            <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              This account is still on its setup password. Choose a new one before continuing.
            </div>
          )}
          <AdminChangePasswordForm />
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
