import type { Metadata } from "next";
import Link from "next/link";
import { PortalNav, type NavItem } from "@/components/portal-nav";
import { redirect } from "next/navigation";
import { getAdminUser, clearSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin · Series Tours B2B" };

/*
 * Grouped, because eleven flat items were impossible to scan. The clusters
 * are: what you SELL, who you sell it to and what came of it, then the tools
 * that are neither. Order within a cluster is how often Sonet opens them.
 */
const NAV: NavItem[][] = [
  [{ href: "/admin", label: "Overview", icon: "overview" }],
  [
    { href: "/admin/hotels", label: "Hotels", icon: "hotel" },
    { href: "/admin/houseboats", label: "Houseboats", icon: "houseboat" },
    { href: "/admin/vehicles", label: "Vehicles", icon: "vehicle" },
    { href: "/admin/itineraries", label: "Packages", icon: "package" },
    { href: "/admin/garages", label: "Depots", icon: "depot" },
  ],
  [
    { href: "/admin/agents", label: "Agents", icon: "agent" },
    { href: "/admin/quotes", label: "Quotes", icon: "quote" },
    { href: "/admin/bookings", label: "Bookings", icon: "booking" },
  ],
  [
    { href: "/admin/km-check", label: "Distance check", icon: "distance" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ],
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
        {/*
          TWO ROWS, not one. Brand, eleven nav items and the account controls
          were competing for a single line, which is half of why the nav was
          unreadable — it had no room to group anything. Identity and account
          go on top, navigation gets a line of its own.
        */}
        <div className="mx-auto flex max-w-6xl items-center gap-x-5 px-4 pt-2.5">
          <Link href="/admin" className="text-sm font-semibold text-slate-900">
            Series Tours <span className="font-normal text-slate-400">B2B admin</span>
          </Link>

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

        <div className="mx-auto max-w-6xl px-4 pb-2 pt-1.5">
          <PortalNav groups={NAV} root="/admin" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
