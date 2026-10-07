/**
 * The nav icons, hand-drawn rather than installed.
 *
 * Eleven small glyphs do not justify a dependency that has to be audited,
 * kept current and carried into the runtime image — the same reasoning that
 * produced `src/lib/zip.ts` instead of a zip library. They are deliberately
 * built from the same few primitives (rect, circle, line, a short path) at
 * one size and one stroke weight, which is what makes a hand-made set look
 * like a set rather than eleven unrelated drawings.
 *
 * `currentColor` throughout, so a nav item's colour — grey, hover, or white
 * on the active pill — carries to its icon with no extra state to keep in
 * step.
 *
 * Decorative: every one is `aria-hidden`, because each sits beside its own
 * text label. Announcing "Hotels, image, Hotels" to a screen reader is worse
 * than announcing nothing.
 */

type IconProps = { className?: string };

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-4 w-4 shrink-0"}
    >
      {children}
    </svg>
  );
}

/** Four panes — the dashboard. */
export const IconOverview = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Svg>
);

/** A building with windows. */
export const IconHotel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20.5h16" />
    <rect x="6" y="3.5" width="12" height="17" rx="1.5" />
    <path d="M9.5 7.5h1.5M13 7.5h1.5M9.5 11h1.5M13 11h1.5" />
    <path d="M10.5 20.5v-4h3v4" />
  </Svg>
);

/** A hull on water. */
export const IconHouseboat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 14.5h16l-2 4.5H6l-2-4.5Z" />
    <path d="M7 14.5v-4h10v4" />
    <path d="M12 10.5v-4" />
    <path d="M2.5 21.5c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" />
  </Svg>
);

/** A car, side on. */
export const IconVehicle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 15.5v-2.2l1.8-4.1A2 2 0 0 1 6.6 8h10.8a2 2 0 0 1 1.8 1.2l1.8 4.1v2.2" />
    <path d="M3 15.5h18v2.5h-2.5M3 15.5V18h2.5" />
    <circle cx="7.5" cy="18" r="1.8" />
    <circle cx="16.5" cy="18" r="1.8" />
  </Svg>
);

/** A depot: a roof over a door. */
export const IconDepot = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 10 12 4.5l8.5 5.5" />
    <path d="M5 10v10.5h14V10" />
    <rect x="9" y="13.5" width="6" height="7" rx="1" />
  </Svg>
);

/** A parcel — a package is a bundle of things. */
export const IconPackage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 20.5 8v8L12 20.5 3.5 16V8L12 3.5Z" />
    <path d="M3.5 8 12 12.5 20.5 8" />
    <path d="M12 12.5v8" />
  </Svg>
);

/** A person — the agencies. */
export const IconAgent = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20.5a7 7 0 0 1 14 0" />
  </Svg>
);

/** A sheet with lines — a quotation. */
export const IconQuote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5h7.5L18.5 8.5V20.5H6V3.5Z" />
    <path d="M13.5 3.5v5h5" />
    <path d="M9 13h6M9 16.5h4" />
  </Svg>
);

/** A calendar with a tick — a confirmed trip. */
export const IconBooking = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
    <path d="m9 15 2 2 4-4" />
  </Svg>
);

/** Two points and the road between them. */
export const IconDistance = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="6.5" r="2.5" />
    <circle cx="18" cy="17.5" r="2.5" />
    <path d="M6 9v4a4 4 0 0 0 4 4h5.5" strokeDasharray="2.5 2.5" />
  </Svg>
);

/** Sliders — settings that are values, not switches. */
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5h16M4 12h16M4 16.5h16" />
    <circle cx="9" cy="7.5" r="2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="16.5" r="2" fill="currentColor" stroke="none" />
  </Svg>
);

/** A cart — the trip being assembled. */
export const IconTrip = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4.5h2.2l2.3 10.5h9.5l2.2-7.5H6.2" />
    <circle cx="9" cy="19" r="1.6" />
    <circle cx="17" cy="19" r="1.6" />
  </Svg>
);

/** A tag — the agency's own branding. */
export const IconBranding = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11.2 3.5H20.5v9.3a2 2 0 0 1-.6 1.4l-6 6a2 2 0 0 1-2.8 0l-6.3-6.3a2 2 0 0 1 0-2.8l6-6a2 2 0 0 1 1.4-.6Z" />
    <circle cx="16.5" cy="7.5" r="1.4" />
  </Svg>
);

export const NAV_ICONS = {
  overview: IconOverview,
  hotel: IconHotel,
  houseboat: IconHouseboat,
  vehicle: IconVehicle,
  depot: IconDepot,
  package: IconPackage,
  agent: IconAgent,
  quote: IconQuote,
  booking: IconBooking,
  distance: IconDistance,
  settings: IconSettings,
  trip: IconTrip,
  branding: IconBranding,
} as const;

export type NavIcon = keyof typeof NAV_ICONS;
