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

export type DestinationGroup = {
  label: string;
  places: string[];
};

export const DESTINATION_GROUPS: DestinationGroup[] = [
  {
    label: "Airports & stations",
    places: [
      "Cochin International Airport",
      "Trivandrum International Airport",
      "Calicut International Airport",
      "Kannur International Airport",
      "Madurai Airport",
      "Ernakulam Junction",
    ],
  },
  {
    label: "Kerala",
    places: [
      "Munnar",
      "Thekkady",
      "Alleppey",
      "Kumarakom",
      "Kovalam",
      "Varkala",
      "Wayanad",
      "Athirappilly",
      "Vagamon",
      "Guruvayur",
      "Kochi",
      "Trivandrum",
      "Bekal",
      "Poovar",
    ],
  },
  {
    label: "Beyond Kerala",
    places: [
      "Madurai",
      "Rameswaram",
      "Kanyakumari",
      "Ooty",
      "Kodaikanal",
      "Coorg",
      "Mysore",
      "Bangalore",
    ],
  },
];

/** Flattened, for a quick "is this one of ours" check. */
export const ALL_DESTINATIONS = DESTINATION_GROUPS.flatMap((g) => g.places);
