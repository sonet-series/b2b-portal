import type { Metadata } from "next";
import Link from "next/link";
import { PortalNav } from "@/components/portal-nav";
import { redirect } from "next/navigation";
import { getAdminUser, clearSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin · Series Tours B2B" };

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/hotels", label: "Hotels" },
  { href: "/admin/houseboats", label: "Houseboats" },
  { href: "/admin/vehicles", label: "Vehicles" },
  { href: "/admin/garages", label: "Depots" },
  { href: "/admin/km-check", label: "Distance check" },
  { href: "/admin/itineraries", label: "Packages" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/quotes", label: "Quotes" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/settings", label: "Settings" },
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

  // The setup password arrives through an env file on the server, so it is a
  // one-time credential. /admin/change-password sits OUTSIDE this route group
  // so this redirect cannot loop.
  if (admin.mustChangePassword) redirect("/admin/change-password");

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
          <Link href="/admin" className="text-sm font-semibold text-slate-900">
            Series Tours <span className="font-normal text-slate-400">B2B admin</span>
          </Link>

          {/*
            The current page is marked, which it never was. Twelve
            undifferentiated links give no sense of where you are, and on the
            admin that matters most when a screen looks like another — Quotes
            and Bookings are both a table of references.
          */}
          <PortalNav items={NAV} root="/admin" />

          <form action={signOut} className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-44 truncate text-xs text-slate-400 lg:inline">
              {admin.email}
            </span>
            <Link
              href="/admin/change-password"
              className="rounded-md px-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Password
            </Link>
            <button
              type="submit"
              className="rounded-md px-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
