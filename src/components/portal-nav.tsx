"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * The nav bar for both portals, with the current section marked.
 *
 * ONE component for admin and agent. They had identical markup and would have
 * drifted the first time either was touched — which is the same reason
 * `booking-shared.ts` exists, and the reason two save paths froze different
 * things on a combined quote until somebody read a customer's PDF.
 *
 * A client component for one reason: `usePathname`. A dozen identical links
 * give no sense of place, and that costs most where two screens look alike —
 * Quotes and Bookings are both a table of references, and knowing which one
 * you are on should not require reading the heading.
 */
export function PortalNav({
  items,
  /** Exact-match root, so it is not lit on every page beneath it. */
  root,
}: {
  items: { href: string; label: string }[];
  root: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-0.5 gap-y-1 text-sm">
      {items.map((item) => {
        /*
         * Exact match for the root, prefix match for the rest.
         *
         * Without the special case, Overview (href="/admin") would be
         * highlighted on every single page, since every admin path starts
         * with it — which is the same as highlighting nothing.
         */
        const active = item.href === root ? pathname === root : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-md px-2.5 py-1.5 transition-colors",
              active
                ? "bg-slate-900 font-medium text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
