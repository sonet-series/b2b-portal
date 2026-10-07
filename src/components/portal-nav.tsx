"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { NAV_ICONS, type NavIcon } from "@/components/icons";

/**
 * The nav bar for both portals.
 *
 * ONE component for admin and agent. They had identical markup in two files
 * and would have drifted the first time either was touched — the same
 * reasoning as `booking-shared.ts`.
 *
 * **Grouped, not flat** (7 Oct 2026). Sonet: *"heading nav seems like simple
 * and its difficult to differeniate."* He was right, and styling was not the
 * fix: eleven items of similar length and weight, in one undivided row, give
 * the eye nothing to navigate BY. "Hotels", "Houseboats" and "Packages" are
 * three words of about the same shape, and finding one meant reading all
 * eleven every time.
 *
 * Two things fix that, and neither is decoration:
 *
 * 1. **Groups with a rule between them.** Catalogue, then trade, then tools.
 *    Position becomes information — Bookings is "in the middle cluster", which
 *    is findable without reading, and stays true as the list grows.
 * 2. **An icon per item.** Words of similar length look alike; a boat and a
 *    car do not. This is the part that makes an item recognisable at a glance
 *    rather than by reading, which is what a daily-use nav needs.
 *
 * A client component for one reason: `usePathname`, to mark where you are.
 */

export type NavItem = { href: string; label: string; icon: NavIcon };

export function PortalNav({
  groups,
  root,
}: {
  /** Each inner array is one cluster, separated by a rule. */
  groups: NavItem[][];
  /** Matched EXACTLY, unlike every other item — see below. */
  root: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-y-1 text-sm">
      {groups.map((group, groupIndex) => (
        <div
          key={groupIndex}
          /*
            Full width below lg, so each cluster takes its own row when the
            bar wraps. On one line the rules do the separating; once it wraps
            they cannot, because a rule then lands at the START of a line and
            reads as a stray mark — which is exactly what it did at phone
            width before this. Rows separate instead.
          */
          className="flex w-full flex-wrap items-center gap-y-1 lg:w-auto"
        >
          {/* Between clusters, never before the first, and only while they
              are actually sharing a line. */}
          {groupIndex > 0 && (
            <span aria-hidden className="mx-2 hidden h-5 w-px bg-slate-200 lg:block" />
          )}

          {group.map((item) => {
            /*
             * Exact match for the root, prefix match for everything else.
             *
             * Without the special case, Overview (href="/admin") is
             * highlighted on every page, since every admin path begins with
             * it — which is the same as highlighting nothing.
             */
            const active =
              item.href === root ? pathname === root : pathname.startsWith(item.href);
            const Icon = NAV_ICONS[item.icon];

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors",
                  active
                    ? "bg-slate-900 font-medium text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon
                  className={cx("h-4 w-4 shrink-0", active ? "opacity-90" : "text-slate-400")}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
