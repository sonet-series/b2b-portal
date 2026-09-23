import type { AgentTier, ProductType } from "./enums";

/** Which catalogue table a photograph hangs off. Mirrors src/lib/product-photos.ts. */
export type PhotoKind = "vehicle" | "hotel" | "houseboat";

/**
 * Who is being quoted. Carries the tier alongside the id so the engine never
 * has to re-derive it — and so a caller cannot accidentally price without one.
 */
export type QuotingAgent = {
  id: string;
  tier: AgentTier;
};

/**
 * Shared shapes for the quote engine. Kept in their own module (no "server-only"
 * import) so client components can use the types without dragging the engine
 * into the browser bundle.
 */

export type QuoteLineDraft = {
  description: string;
  /** Nights, days, km, or pax depending on the product. */
  quantity: number;
  unitMinor: number;
  totalMinor: number;
  /** True when an agent rate-card override supplied unitMinor. */
  usedOverride: boolean;
};

/**
 * One priced way to buy the thing the agent asked about.
 *
 * A product sold two ways produces two options — this is where "the agent sees
 * concrete priced options rather than a pricing-mode toggle" actually happens.
 */
export type QuoteOption = {
  /** Identifies this option when the agent picks it. Recomputed server-side on save. */
  key: string;
  productType: ProductType;
  title: string;
  detail: string;
  /**
   * What is actually being sold, in the customer's words — "Toyota Crysta",
   * "up to 7 passengers".
   *
   * `title` is the way it is PRICED ("Per day hire"), which is no answer to
   * "which vehicle is this quote for" — the question Sonet asked of a saved
   * quote that did not say. Frozen with the option rather than looked up when
   * the quote is read, so retiring or renaming a vehicle cannot change what an
   * already-sent quote says it was for.
   */
  subject?: {
    name: string;
    detail?: string;
    /**
     * Which catalogue row it is, so the portal can show its photographs.
     *
     * The ID rather than a URL or a list of picture ids: ids are stable, and
     * resolving the photographs at render time means ones uploaded after a
     * quote was saved still appear on it, while removed ones simply stop
     * showing. A frozen list would go stale the first time Sonet edited the
     * catalogue.
     */
    photo?: { kind: PhotoKind; id: string };
    /**
     * Superseded by `photo`. Quotes saved on 20 Sept 2026, between shipping a
     * single vehicle photograph and generalising it, carry this instead —
     * `resolveSubject` upgrades them on read.
     */
    vehicleId?: string;
  };
  lines: QuoteLineDraft[];
  totalMinor: number;
  /** True if any line used an override — surfaced as "your rate" in the UI. */
  usedOverride: boolean;
  /**
   * The hire terms a customer asks about, as numbers rather than sentences
   * buried in a line description.
   *
   * Agents are shown a single price, not the cost breakdown, so these are the
   * only way "how many km, and what after that" survives to the quote. Absent
   * on options where they do not apply, such as a flat transfer.
   */
  terms?: {
    /** Kilometres included in the price, across the whole hire. */
    includedKm?: number;
    /** Charged per km beyond `includedKm`, in paise, already marked up. */
    extraKmRateMinor?: number;
    /** True when toll and parking are in this price rather than extra. */
    includesTollParking?: boolean;
    /**
     * True when a driver allowance was actually charged on this option.
     *
     * Set where the bata line is created, never asserted by the document.
     * "Driver's allowance included" is a sentence somebody would otherwise
     * have to keep in step with the pricing by hand, which is how the old
     * "toll at actuals" line came to contradict a price that included them.
     */
    includesDriverAllowance?: boolean;
    /**
     * States whose interstate permit IS in this price.
     *
     * The list, not a flag: the customer document must only claim what was
     * actually charged. A trip crossing two states with a permit set for one
     * of them has to say which — claiming both would be a promise the
     * operator then pays for at a border.
     */
    permitStates?: string[];
  };
};

/** Why a product could not be quoted, shown instead of silently vanishing. */
export type QuoteUnavailable = {
  title: string;
  reason: string;
};

/**
 * The measured itinerary behind a vehicle quote.
 *
 * Carried on the result so the agent can see where the kilometres came from.
 * A distance nobody can check is a distance nobody can argue with when the
 * customer asks why the hire costs what it does.
 */
export type ItinerarySummary = {
  legs: VehicleLeg[];
  /** What Google measured, garage to garage. km. */
  routedKm: number;
  /** Local running allowed at the overnight stops, and which stops they are. */
  localKm: number;
  stops: string[];
  /** Sightseeing buffer the agent added. km. */
  bufferKm: number;
  /** What the hire is priced on. km. */
  totalKm: number;
  /** True when any leg's distance was typed rather than measured. */
  anyManual: boolean;
};

export type QuoteResult = {
  options: QuoteOption[];
  unavailable: QuoteUnavailable[];
  /** Vehicle quotes only, and only when built from a day-by-day itinerary. */
  itinerary?: ItinerarySummary;
};

export type HotelQuoteInput = {
  hotelId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  extraBeds: number;
};

export type HouseboatQuoteInput = {
  houseboatId: string;
  travelDate: string;
  pax: number;
};

/**
 * One hop of a multi-stop itinerary — e.g. "Cochin → Munnar", 130 km, plus a
 * 60 km sightseeing buffer for a day out at Munnar.
 *
 * Agents book one vehicle for a whole trip but build the distance up leg by
 * leg, so a single "estimated distance" box lost the reasoning behind the
 * number. The legs are what the agent actually knows; the total is derived.
 */
export type VehicleLeg = {
  /** Free text, the agent's own reference. Never parsed. */
  label: string;
  /** Point-to-point distance for this leg, km. */
  km: number;
  /** Local sightseeing km added on top of the transfer, km. */
  bufferKm: number;
  /**
   * Which day of the itinerary this leg belongs to, 0-based; -1 for the two
   * depot runs that bracket the trip, and -2 for the local-running allowance.
   *
   * -2 is its own marker rather than sharing -1: they were both "not a day",
   * so the printed quote summed them together and labelled 120 km of local
   * running as "vehicle positioning to and from base". Two different things
   * the customer is paying for must not add up into one wrong sentence.
   *
   * Carried explicitly so the printed quote can total each day WITHOUT parsing
   * it back out of `label`. The label is display text — it has already changed
   * once — and a printed customer document must not break because somebody
   * reworded it. Absent on quotes saved before this existed.
   */
  dayIndex?: number;
};

/**
 * Who is travelling.
 *
 * Children are listed by age rather than counted, because an age is the thing
 * that actually decides anything downstream — a hotel's child policy, whether
 * a seat is needed. A bare count throws that away and cannot be recovered.
 *
 * For a vehicle it affects capacity only: the hire is priced by distance and
 * days, not by head. Everyone counts toward the seat count, including small
 * children, which errs toward suggesting a larger vehicle rather than one the
 * party cannot actually fit in.
 */
/**
 * Everyone travelling, as a single number.
 *
 * Takes the two fields flat rather than a `pax` object: the form submits
 * `adults` and `childAges`, and the zod schema emits them flat, so a nested
 * shape was one nothing ever populated. It was declared, typechecked, and
 * silently always undefined — which is how every vehicle quote came to be
 * saved with a passenger count of zero.
 */
export function totalPax(adults: number | undefined, childAges: number[] | undefined): number {
  return (adults ?? 0) + (childAges?.length ?? 0);
}

/**
 * One day of a vehicle itinerary.
 *
 * Agents plan in days, not in legs — "day 2, at Munnar, running up to Top
 * Station" is how the trip is actually described to the customer. The road
 * segments and their distances are derived from this, never typed.
 */
export type ItineraryDay = {
  /** ISO date. Derived from the hire dates, so it cannot disagree with them. */
  date: string;
  /** Where the day starts. Only day 1 is freely chosen; the rest are chained. */
  from: string;
  /** Where the day ends. Equal to `from` for a day spent at one stop. */
  to: string;
  /**
   * Places between `from` and `to`. On a transfer day these are waypoints; on
   * a day spent at one stop this is the excursion, which routes out and back.
   */
  via: string[];
  /** Local sightseeing km added on top of the routed distance. */
  bufferKm: number;
  /**
   * What the day actually contains — the sightseeing, the stops, anything the
   * customer should read. "Mattupetty Dam, Echo Point, tea museum, evening
   * at leisure."
   *
   * Free text and never parsed. It exists because "Munnar to Thekkady" tells
   * a customer nothing about their day, and an itinerary they cannot picture
   * is not one they will book.
   */
  notes?: string;
  /**
   * Set only when routing could not measure this day and the agent typed the
   * distance instead. Its presence is what makes the quote able to say the
   * number was not measured.
   */
  manualKm?: number;
};

export type VehicleQuoteInput = {
  vehicleId: string;
  startDate: string;
  endDate: string;

  /**
   * The garage the vehicle is dispatched from. The hire is billed garage to
   * garage, so this adds the run out to the pickup point and the run home
   * after the drop.
   *
   * Optional because quotes saved before garages existed have no value for
   * it, and those snapshots must keep rendering.
   */
  garageId?: string;

  /**
   * Who is travelling. Flat, matching what the form submits and the schema
   * emits — see totalPax above for why this is not a nested object.
   *
   * Optional for the same backward-compatibility reason as `garageId`:
   * quotes saved before the vehicle screen asked have neither.
   */
  adults?: number;
  /** One entry per child, each their age in years at the time of travel. */
  childAges?: number[];

  /**
   * The day-by-day plan. Absent on quotes saved before this existed, which
   * carried hand-typed `legs` directly.
   */
  days?: ItineraryDay[];

  /**
   * The measured road segments. Derived from `days` and the garage when those
   * are present, and typed by hand on older quotes.
   *
   * Either way this is the ONLY thing pricing consumes: `totalLegKm` reduces
   * it to the single number the per-day / per-km logic has always taken, so
   * none of the distance work above changed the pricing maths at all.
   */
  legs: VehicleLeg[];
};

/** Total km for an itinerary. The single number the pricing logic consumes. */
export function totalLegKm(legs: readonly VehicleLeg[]): number | null {
  if (legs.length === 0) return null;
  return legs.reduce((sum, l) => sum + l.km + l.bufferKm, 0);
}

export type ItineraryQuoteInput = {
  itineraryId: string;
  startDate: string;
  pax: number;
};

export type AnyQuoteInput =
  | ({ productType: "hotel" } & HotelQuoteInput)
  | ({ productType: "houseboat" } & HouseboatQuoteInput)
  | ({ productType: "vehicle" } & VehicleQuoteInput)
  | ({ productType: "itinerary" } & ItineraryQuoteInput);


// ---------------------------------------------------------------------------
// Combined quotes
// ---------------------------------------------------------------------------

/**
 * One thing the agent added to a combined quote: the inputs they chose plus
 * which priced option they picked.
 *
 * Only the INPUTS are carried, never a price. The whole cart is re-priced
 * server-side when it is saved, so a total that arrives from the browser is
 * never trusted — the same rule single-product saving already follows.
 */
export type CombinedItem = {
  input: AnyQuoteInput;
  /** Identifies the chosen option within that product's result. */
  optionKey: string;
};

/** A priced cart item, ready to render. */
export type PricedItem = {
  index: number;
  productType: AnyQuoteInput["productType"];
  /** What the agent chose, e.g. "Demo Hill Resort · Deluxe · CP". */
  label: string;
  detail: string;
  lines: QuoteLineDraft[];
  subtotalMinor: number;
  usedOverride: boolean;
  /**
   * The whole priced option, so `saveCombinedQuote` can freeze it exactly as
   * a single-product save freezes its own.
   *
   * Without it a combined quote stored only an option KEY, so its terms — the
   * included kilometres, the toll, the permits — were simply absent, and the
   * customer's PDF said less about a bigger trip than it did about a smaller
   * one. Found by Sonet on 24 Sept 2026: "pdf is too plain why?"
   */
  option: QuoteOption;
};

export type PricedCart = {
  items: PricedItem[];
  totalMinor: number;
  /** Earliest and latest travel dates across every item, ISO. */
  travelStart: string;
  travelEnd: string;
};
