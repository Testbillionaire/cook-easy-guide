// Turning ISO codes stored in search_events into names people recognise.
// country/region are stored as codes ("US", "NY") so ZIP- and IP-derived
// values stay comparable; these helpers are display-only.

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington DC",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico",
};

/** "US" -> "United States". Falls back to the raw code. */
export function countryLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** ("US","NY") -> "New York". Non-US subdivisions keep their code. */
export function regionLabel(
  country: string | null | undefined,
  region: string | null | undefined,
): string | null {
  if (!region) return null;
  if (country === "US" && US_STATES[region]) return US_STATES[region];
  return region;
}

/** Most specific place name available, for headings like "Trending in …". */
export function placeLabel(
  country: string | null | undefined,
  region: string | null | undefined,
  city: string | null | undefined,
): string | null {
  return city || regionLabel(country, region) || countryLabel(country);
}
