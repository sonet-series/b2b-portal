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
   * What the place IS, as a phrase that follows a comma — "the tea country of
   * the high ranges". Ours, not the agent's.
   *
   * Sonet, 21 Sept 2026: *"day description needs to be derived from our side.
   * not the agent."* An agent writing their own gets it different every time,
   * or leaves it blank; Series Tours knows these places and says the same
   * thing about them on every quote.
   *
   * Deliberately generic and durable — what somewhere is known for, never
   * opening times, prices or anything that goes stale unnoticed on a document
   * a customer reads months later.
   */
  blurb?: string;
  /**
   * Named sights, used when a day is SPENT here rather than driven through.
   * Listed in the order they read best, not by importance.
   */
  highlights?: string[];
  /**
   * An airport or station — somewhere a trip begins or ends, never somewhere
   * it is spent. Gets "Arrive at" and "for the departure flight" rather than
   * a description of what to see.
   */
  gateway?: boolean;
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

/*
 * NEVER pass these to `.map()` directly.
 *
 * `["Munnar", "Thekkady"].map(KL)` used to work because KL took one argument.
 * It now takes two, and map supplies the INDEX as the second — which would
 * silently give Munnar `{}` and Thekkady `1` as its content. Call them one at
 * a time.
 */
type Extra = Omit<Destination, "name" | "state">;
const KL = (name: string, extra?: Extra): Destination => ({ name, state: "Kerala", ...extra });
const TN = (name: string, extra?: Extra): Destination => ({ name, state: "Tamil Nadu", ...extra });
const KA = (name: string, extra?: Extra): Destination => ({ name, state: "Karnataka", ...extra });
const AP = (name: string, extra?: Extra): Destination => ({ name, state: "Andhra Pradesh", ...extra });
/** Puducherry is a Union Territory, not part of Tamil Nadu, and permits it separately. */
const PY = (name: string, extra?: Extra): Destination => ({ name, state: "Puducherry", ...extra });

export const DESTINATION_GROUPS: DestinationGroup[] = [
  {
    label: "Airports & stations",
    places: [
      KL("Cochin International Airport", { gateway: true }),
      KL("Trivandrum International Airport", { gateway: true }),
      KL("Calicut International Airport", { gateway: true }),
      KL("Kannur International Airport", { gateway: true }),
      TN("Madurai Airport", { gateway: true }),
      KL("Ernakulam Junction", { gateway: true }),
    ],
  },
  {
    label: "Kerala",
    places: [
      KL("Munnar", {
        blurb: "the tea country of the high ranges",
        highlights: [
          "Mattupetty Dam",
          "Echo Point",
          "the Tata Tea Museum",
          "Eravikulam National Park",
          "the viewpoint at Top Station",
        ],
      }),
      KL("Thekkady", {
        blurb: "the spice hills around the Periyar reserve",
        highlights: [
          "the Periyar Wildlife Sanctuary",
          "a boat ride on Periyar lake",
          "a spice plantation walk",
        ],
      }),
      KL("Alleppey", {
        blurb: "the heart of the Kerala backwaters",
        highlights: ["the canals and paddy fields", "Punnamada Lake", "a houseboat cruise"],
      }),
      KL("Kumarakom", {
        blurb: "a quiet stretch of the Vembanad backwaters",
        highlights: ["the bird sanctuary", "Vembanad Lake"],
      }),
      KL("Kovalam", {
        blurb: "a crescent of beaches on the Arabian Sea",
        highlights: ["Lighthouse Beach", "Hawa Beach"],
      }),
      KL("Varkala", {
        blurb: "red cliffs above the Arabian Sea",
        highlights: ["the cliff path", "Papanasam beach"],
      }),
      KL("Wayanad", {
        blurb: "the forested plateau of north-east Kerala",
        highlights: ["the Edakkal Caves", "Banasura Sagar Dam", "Pookode Lake", "Chembra Peak"],
      }),
      KL("Athirappilly", {
        blurb: "Kerala's widest waterfall, on the Chalakudy river",
        highlights: ["the Athirappilly falls", "the Vazhachal falls"],
      }),
      KL("Vagamon", {
        blurb: "meadows and pine forest along the Idukki ridge",
        highlights: ["the pine forest", "the meadows", "Vagamon lake"],
      }),
      KL("Guruvayur", {
        blurb: "one of Kerala's most visited temple towns",
        highlights: ["the Sri Krishna temple", "the temple elephants at Punnathur Kotta"],
      }),
      KL("Kochi", {
        blurb: "the old harbour city",
        highlights: [
          "the Chinese fishing nets",
          "Fort Kochi",
          "Mattancherry Palace",
          "the Paradesi Synagogue",
          "St Francis Church",
        ],
      }),
      KL("Trivandrum", {
        blurb: "Kerala's capital",
        highlights: ["the Padmanabhaswamy temple", "the Napier Museum"],
      }),
      KL("Bekal", {
        blurb: "the north Kerala coast",
        highlights: ["Bekal Fort", "the beach below the fort"],
      }),
      KL("Poovar", {
        blurb: "where the Neyyar river meets the sea",
        highlights: ["the estuary", "the golden sand beach", "the backwater boats"],
      }),
    ],
  },
  {
    label: "Tamil Nadu",
    places: [
      TN("Madurai", {
        blurb: "one of the oldest continuously inhabited cities in India",
        highlights: ["the Meenakshi Amman temple", "the Thirumalai Nayakkar Palace"],
      }),
      TN("Coimbatore", { blurb: "the gateway to the western hills" }),
      TN("Rameswaram", {
        blurb: "an island pilgrimage town in the Gulf of Mannar",
        highlights: ["the Ramanathaswamy temple", "the Pamban bridge", "Dhanushkodi"],
      }),
      TN("Kanyakumari", {
        blurb: "the southern tip of the mainland, where three seas meet",
        highlights: [
          "the Vivekananda Rock Memorial",
          "the Thiruvalluvar statue",
          "sunrise over the sea",
        ],
      }),
      TN("Ooty", {
        blurb: "the best known of the Nilgiri hill stations",
        highlights: ["the Botanical Gardens", "Ooty lake", "the Nilgiri Mountain Railway"],
      }),
      TN("Kodaikanal", {
        blurb: "a hill station in the Palani range",
        highlights: ["Kodai lake", "Coaker's Walk", "the Pillar Rocks"],
      }),
      TN("Salem", { blurb: "a city below the Shevaroy hills" }),
      TN("Trichy", {
        blurb: "a temple city on the Kaveri",
        highlights: ["the Rockfort temple", "the Ranganathaswamy temple at Srirangam"],
      }),
      TN("Thanjavur", {
        blurb: "the old Chola capital",
        highlights: ["the Brihadeeswarar temple"],
      }),
      TN("Chennai", {
        blurb: "the capital of Tamil Nadu",
        highlights: ["Marina Beach", "the Kapaleeshwarar temple", "Fort St George"],
      }),
      TN("Valparai", { blurb: "tea estates high in the Anamalai hills" }),
      TN("Yercaud", {
        blurb: "a quiet hill station in the Shevaroy hills",
        highlights: ["Yercaud lake", "the viewpoints along the ghat road"],
      }),
      TN("Velankanni", {
        blurb: "a coastal pilgrimage town",
        highlights: ["the Basilica of Our Lady of Good Health"],
      }),
    ],
  },
  {
    label: "Elsewhere",
    places: [
      // Tirupati is Andhra Pradesh and Puducherry is a Union Territory —
      // both permit separately from Tamil Nadu, whatever a route map suggests.
      AP("Tirupati", {
        blurb: "the town below the Tirumala hills",
        highlights: ["the Sri Venkateswara temple at Tirumala"],
      }),
      PY("Pondicherry", {
        blurb: "a former French settlement on the Coromandel coast",
        highlights: ["the French Quarter", "the seafront promenade", "Auroville"],
      }),
    ],
  },
  {
    label: "Karnataka",
    places: [
      KA("Bangalore", {
        blurb: "the capital of Karnataka",
        highlights: ["Lalbagh", "Cubbon Park", "the Bangalore Palace"],
      }),
      KA("Mysore", {
        blurb: "the old seat of the Wadiyar kings",
        highlights: ["the Mysore Palace", "Chamundi Hill", "the Brindavan Gardens"],
      }),
      KA("Coorg", {
        blurb: "the coffee country of the Western Ghats",
        highlights: ["the coffee estates", "Abbey Falls", "Raja's Seat"],
      }),
      KA("Chikmagalur", {
        blurb: "the hills where coffee was first grown in India",
        highlights: ["the coffee estates", "Mullayanagiri"],
      }),
      KA("Mangalore", {
        blurb: "a port city on the Karnataka coast",
        highlights: ["Panambur beach", "the old temples and churches"],
      }),
      KA("Udupi", {
        blurb: "a temple town on the coast",
        highlights: ["the Sri Krishna temple", "Malpe beach", "St Mary's Island"],
      }),
      KA("Hampi", {
        blurb: "the ruins of the Vijayanagara capital, a World Heritage site",
        highlights: ["the Virupaksha temple", "the Vittala temple and its stone chariot"],
      }),
      KA("Bandipur", {
        blurb: "a tiger reserve on the edge of the Nilgiri plateau",
        highlights: ["a safari through the reserve"],
      }),
      KA("Kabini", {
        blurb: "the river and forest edge of Nagarhole",
        highlights: ["the backwaters", "a jeep or boat safari"],
      }),
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
 * Everything we know about a place, or null when it is not one of ours.
 *
 * Returns null rather than a stub for a typed place, so the itinerary writes a
 * plain "Drive from A to B" instead of claiming something about somewhere it
 * has never heard of. An invented description on a customer's document is
 * worse than a plain one.
 */
export function describe(place: string): Destination | null {
  return BY_NAME.get(place.trim().toLowerCase()) ?? null;
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
