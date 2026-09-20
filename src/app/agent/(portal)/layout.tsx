import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAgent, clearSession } from "@/lib/auth";
import { TripCartProvider, TripCartBar } from "@/components/trip-cart";

export const metadata: Metadata = { title: "Series Tours B2B" };

const NAV = [
  // Browsing comes before quoting: an agent whose customer has just asked
  // "what have you got for six people" needs to look at the fleet, not open a
  // quote form. Sonet, 20 Sept 2026.
  { href: "/agent/fleet", label: "Our fleet" },
  { href: "/agent/quote/vehicle", label: "Vehicles" },
  { href: "/agent/quote/houseboat", label: "Houseboats" },
  { href: "/agent/quote/hotel", label: "Hotels" },
  { href: "/agent/quote/package", label: "Packages" },
  { href: "/agent/trip", label: "Current trip" },
  { href: "/agent/quotes", label: "Saved quotes" },
  { href: "/agent/branding", label: "Branding" },
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/agent" className="text-sm font-semibold text-slate-900">
            Series Tours <span className="font-normal text-slate-400">B2B</span>
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 print:max-w-none print:p-0">
        {children}
      </main>
      <TripCartBar />
    </div>
    </TripCartProvider>
  );
}
