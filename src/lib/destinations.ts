/**
 * The places Series Tours actually sends vehicles to.
 *
 * Offered as one-tap chips beside the place fields. Three reasons, in order of
 * how much they matter:
 *
 * 1. ACCURACY. A tapped chip is always spelled the same way, so the same trip
 *    measures the same distance whoever quotes it. Typed names are where the
 *    "Cochin Airport" vs "Cochin International Airport" problem came from.
 * 2. SPEED. An agent building a nine-day itinerary types a dozen place names.
 *    Tapping is faster than typing three characters and waiting on Google.
 * 3. COST. Every chip tapped is an Autocomplete request not billed.
 *
 * Free typing still works for anywhere not on this list — this is a shortcut,
 * never a restriction. Edit this list as the operation changes; it is
 * deliberately code rather than a settings screen, because it is a short list
 * that changes rarely and an empty one would quietly remove the shortcut.
 */

export type Destination = {
  name: string;
  /**
   * The Indian state it sits in.
   *
   * Carried because an interstate permit is charged per state ENTERED, and
   * this list is the only place we reliably know where a place is. Google's
   * autocomplete knows too, but a typed place name does not, so the quote
   * treats an unrecognised place as unknown and says so rather than assuming
   * no permit is due.
   */
  state: string;
};

export type DestinationGroup = {
  label: string;
  places: Destination[];
};

/**
 * Every state the destination list knows about.
 *
 * Used to offer depot states and permit states. Derived from the list rather
 * than written out again, so adding a Chennai destination automatically makes
 * Tamil Nadu available as a depot state.
 */
export function allStates(): string[] {
  return [...new Set(ALL_DESTINATIONS.map((d) => d.state))].sort();
}

const KL = (name: string): Destination => ({ name, state: "Kerala" });
const TN = (name: string): Destination => ({ name, state: "Tamil Nadu" });
const KA = (name: string): Destination => ({ name, state: "Karnataka" });
const AP = (name: string): Destination => ({ name, state: "Andhra Pradesh" });
/** Puducherry is a Union Territory, not part of Tamil Nadu, and permits it separately. */
const PY = (name: string): Destination => ({ name, state: "Puducherry" });

export const DESTINATION_GROUPS: DestinationGroup[] = [
  {
    label: "Airports & stations",
    places: [
      KL("Cochin International Airport"),
      KL("Trivandrum International Airport"),
      KL("Calicut International Airport"),
      KL("Kannur International Airport"),
      TN("Madurai Airport"),
      KL("Ernakulam Junction"),
    ],
  },
  {
    label: "Kerala",
    places: [
      "Munnar", "Thekkady", "Alleppey", "Kumarakom", "Kovalam", "Varkala",
      "Wayanad", "Athirappilly", "Vagamon", "Guruvayur", "Kochi",
      "Trivandrum", "Bekal", "Poovar",
    ].map(KL),
  },
  {
    label: "Tamil Nadu",
    places: [
      TN("Madurai"), TN("Coimbatore"), TN("Rameswaram"), TN("Kanyakumari"),
      TN("Ooty"), TN("Kodaikanal"), TN("Salem"), TN("Trichy"),
      TN("Thanjavur"), TN("Chennai"), TN("Valparai"),
      TN("Yercaud"), TN("Velankanni"),
    ],
  },
  {
    label: "Elsewhere",
    places: [
      // Tirupati is Andhra Pradesh and Puducherry is a Union Territory —
      // both permit separately from Tamil Nadu, whatever a route map suggests.
      AP("Tirupati"),
      PY("Pondicherry"),
    ],
  },
  {
    label: "Karnataka",
    places: [
      KA("Bangalore"), KA("Mysore"), KA("Coorg"), KA("Chikmagalur"),
      KA("Mangalore"), KA("Udupi"), KA("Hampi"), KA("Bandipur"), KA("Kabini"),
    ],
  },
];

export const ALL_DESTINATIONS: Destination[] = DESTINATION_GROUPS.flatMap((g) => g.places);

const BY_NAME = new Map(ALL_DESTINATIONS.map((d) => [d.name.toLowerCase(), d]));

/** The state a place sits in, or null when it is not one of ours. */
export function stateOf(place: string): string | null {
  return BY_NAME.get(place.trim().toLowerCase())?.state ?? null;
}

/**
 * Which states an itinerary enters, and which places could not be placed.
 *
 * `homeState` comes from the DEPOT the vehicle is dispatched from, not from a
 * constant. Home is a property of where the vehicle starts: a Chennai depot
 * makes Tamil Nadu home and Kerala the state needing a permit — the exact
 * inverse of Kochi. A hardcoded Kerala would have charged the wrong permits,
 * or none at all, the day a depot opened outside it.
 *
 * Unknown places are REPORTED rather than assumed to be local, because
 * assuming would silently drop a permit from the price.
 */
export function statesEntered(
  places: readonly string[],
  homeState: string
): {
  states: string[];
  unknown: string[];
} {
  const states = new Set<string>();
  const unknown = new Set<string>();

  for (const raw of places) {
    const place = raw.trim();
    if (place === "") continue;
    const state = stateOf(place);
    if (state === null) unknown.add(place);
    else if (state !== homeState) states.add(state);
  }

  return { states: [...states].sort(), unknown: [...unknown] };
}
