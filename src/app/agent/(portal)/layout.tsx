import type { Metadata } from "next";
import Link from "next/link";
import { PortalNav, type NavItem } from "@/components/portal-nav";
import { redirect } from "next/navigation";
import { getAgent, clearSession } from "@/lib/auth";
import { TripCartProvider, TripCartBar } from "@/components/trip-cart";

export const metadata: Metadata = { title: "Series Tours B2B" };

/*
 * Grouped: browse, then the four things you can price, then the work in
 * progress. Browsing stays first — an agent whose customer has just asked
 * "what have you got for six people" needs to look at the fleet, not open a
 * quote form (Sonet, 20 Sept 2026) — and now it is visibly its own thing
 * rather than the first of nine lookalike words.
 */
const NAV: NavItem[][] = [
  [{ href: "/agent/fleet", label: "Our fleet", icon: "overview" }],
  [
    { href: "/agent/quote/vehicle", label: "Vehicles", icon: "vehicle" },
    { href: "/agent/quote/houseboat", label: "Houseboats", icon: "houseboat" },
    { href: "/agent/quote/hotel", label: "Hotels", icon: "hotel" },
    { href: "/agent/quote/package", label: "Packages", icon: "package" },
  ],
  [
    { href: "/agent/trip", label: "Current trip", icon: "trip" },
    { href: "/agent/quotes", label: "Saved quotes", icon: "quote" },
    { href: "/agent/bookings", label: "Bookings", icon: "booking" },
  ],
  [{ href: "/agent/branding", label: "Branding", icon: "branding" }],
];

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
    <TripCartProvider>
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white print:hidden">
        {/* Two rows — see the admin layout for why. */}
        <div className="mx-auto flex max-w-6xl items-center gap-x-5 px-4 pt-2.5">
          <Link href="/agent" className="text-sm font-semibold text-slate-900">
            Series Tours <span className="font-normal text-slate-400">B2B</span>
          </Link>

          <form action={signOut} className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-44 truncate text-xs text-slate-400 lg:inline">
              {agent.agencyName}
            </span>
            <Link
              href="/agent/change-password"
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
          <PortalNav groups={NAV} root="/agent" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 print:max-w-none print:p-0">
        {children}
      </main>
      <TripCartBar />
    </div>
    </TripCartProvider>
  );
}
