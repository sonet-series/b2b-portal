import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser, clearSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin · Series Tours B2B" };

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/hotels", label: "Hotels" },
  { href: "/admin/houseboats", label: "Houseboats" },
  { href: "/admin/vehicles", label: "Vehicles" },
  { href: "/admin/itineraries", label: "Packages" },
  { href: "/admin/agents", label: "Agents" },
];

async function signOut() {
  "use server";
  await clearSession("admin");
  redirect("/admin/login");
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The single gate for every /admin page. Individual pages do not re-check.
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="text-sm font-semibold text-slate-900">
            Series Tours <span className="font-normal text-slate-400">B2B admin</span>
          </Link>

          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-slate-600 transition-colors hover:text-blue-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <form action={signOut} className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">{admin.email}</span>
            <button type="submit" className="text-sm text-slate-600 hover:text-red-700">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
