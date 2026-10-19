// Resolves free-text job locations ("Bengaluru, Karnataka", "Remote - US",
// "London; Dublin") to ISO country codes so they can be compared with the
// owner's preferences. Countries come from a hand list (aliases like "UK")
// plus every country name ICU knows; cities cover the main tech hubs; US
// states and Canadian provinces resolve by name or by ", TX"-style code.
// Anything it can't resolve is "unknown", which the filters treat as a pass
// with a note rather than a rejection.

const COUNTRIES: [code: string, ...names: string[]][] = [
  ["IN", "India"],
  ["US", "United States", "United States of America", "USA", "U.S.", "U.S.A.", "America"],
  ["GB", "United Kingdom", "UK", "U.K.", "England", "Scotland", "Wales", "Great Britain", "Northern Ireland"],
  ["CA", "Canada"],
  ["DE", "Germany", "Deutschland"],
  ["FR", "France"],
  ["NL", "Netherlands", "The Netherlands", "Holland"],
  ["IE", "Ireland"],
  ["SG", "Singapore"],
  ["AU", "Australia"],
  ["NZ", "New Zealand"],
  ["AE", "United Arab Emirates", "UAE"],
  ["JP", "Japan"],
  ["CN", "China", "Mainland China"],
  ["HK", "Hong Kong"],
  ["TW", "Taiwan"],
  ["KR", "South Korea", "Korea", "Republic of Korea"],
  ["IL", "Israel"],
  ["PL", "Poland"],
  ["ES", "Spain"],
  ["PT", "Portugal"],
  ["IT", "Italy"],
  ["SE", "Sweden"],
  ["DK", "Denmark"],
  ["NO", "Norway"],
  ["FI", "Finland"],
  ["CH", "Switzerland"],
  ["AT", "Austria"],
  ["BE", "Belgium"],
  ["LU", "Luxembourg"],
  ["CZ", "Czech Republic", "Czechia"],
  ["RO", "Romania"],
  ["HU", "Hungary"],
  ["GR", "Greece"],
  ["BG", "Bulgaria"],
  ["RS", "Serbia"],
  ["HR", "Croatia"],
  ["UA", "Ukraine"],
  ["LT", "Lithuania"],
  ["LV", "Latvia"],
  ["EE", "Estonia"],
  ["TR", "Turkey", "Türkiye", "Turkiye"],
  ["BR", "Brazil", "Brasil"],
  ["MX", "Mexico", "México"],
  ["AR", "Argentina"],
  ["CO", "Colombia"],
  ["CL", "Chile"],
  ["CR", "Costa Rica"],
  ["MY", "Malaysia"],
  ["PH", "Philippines"],
  ["VN", "Vietnam", "Viet Nam"],
  ["TH", "Thailand"],
  ["ID", "Indonesia"],
  ["PK", "Pakistan"],
  ["BD", "Bangladesh"],
  ["LK", "Sri Lanka"],
  ["ZA", "South Africa"],
  ["NG", "Nigeria"],
  ["KE", "Kenya"],
  ["EG", "Egypt"],
  ["SA", "Saudi Arabia", "KSA"],
  ["QA", "Qatar"],
];

const CITIES: Record<string, string> = {};
const STATES = new Set<string>();
const city = (code: string, names: string) => names.split(",").forEach((n) => (CITIES[n.trim().toLowerCase()] = code));
// States and provinces resolve to a country but aren't cities for the city filter.
const state = (code: string, names: string) =>
  names.split(",").forEach((n) => {
    CITIES[n.trim().toLowerCase()] = code;
    STATES.add(n.trim().toLowerCase());
  });
city("IN", "Bengaluru,Bangalore,Hyderabad,Pune,Mumbai,Bombay,Chennai,Gurgaon,Gurugram,Noida,New Delhi,Delhi,Kolkata,Ahmedabad,Kochi,Thiruvananthapuram,Trivandrum,Coimbatore,Jaipur,Chandigarh,Indore,Mysore,Mysuru,Vadodara,Nagpur,Bhubaneswar,Visakhapatnam");
state("IN", "Karnataka,Telangana,Maharashtra,Tamil Nadu,Haryana,Uttar Pradesh,Kerala");
city("US", "San Francisco,New York,New York City,NYC,Seattle,Austin,Boston,Chicago,Los Angeles,Mountain View,Palo Alto,Menlo Park,Sunnyvale,San Jose,Santa Clara,Redmond,Denver,Atlanta,Washington DC,Washington D.C.,Dallas,Houston,Pittsburgh,San Diego,Miami,Philadelphia,Raleigh,Salt Lake City,Phoenix,Minneapolis,Irvine,Cupertino,Bellevue,Boulder,Nashville");
state("US", "Alabama,Alaska,Arizona,Arkansas,California,Colorado,Connecticut,Delaware,Florida,Hawaii,Idaho,Illinois,Indiana,Iowa,Kansas,Kentucky,Louisiana,Maine,Maryland,Massachusetts,Michigan,Minnesota,Mississippi,Missouri,Montana,Nebraska,Nevada,New Hampshire,New Jersey,New Mexico,New York State,North Carolina,North Dakota,Ohio,Oklahoma,Oregon,Pennsylvania,Rhode Island,South Carolina,South Dakota,Tennessee,Texas,Utah,Vermont,Virginia,Washington,Washington State,West Virginia,Wisconsin,Wyoming");
city("GB", "London,Manchester,Edinburgh,Bristol,Belfast,Glasgow,Leeds,Birmingham");
city("CA", "Toronto,Vancouver,Montreal,Montréal,Ottawa,Waterloo,Calgary");
state("CA", "Ontario,Quebec,British Columbia");
city("DE", "Berlin,Munich,München,Hamburg,Frankfurt,Stuttgart,Cologne,Köln");
city("FR", "Paris,Lyon");
city("NL", "Amsterdam,Rotterdam,Eindhoven,Utrecht");
city("IE", "Dublin,Cork");
city("AU", "Sydney,Melbourne,Brisbane");
city("JP", "Tokyo,Osaka");
city("CN", "Shanghai,Beijing,Shenzhen,Hangzhou,Guangzhou,Chengdu");
city("TW", "Taipei,Hsinchu");
city("KR", "Seoul");
city("IL", "Tel Aviv,Haifa,Yokneam,Herzliya,Jerusalem,Ra'anana");
city("PL", "Warsaw,Krakow,Kraków,Wroclaw,Wrocław,Gdansk");
city("ES", "Madrid,Barcelona");
city("PT", "Lisbon,Porto");
city("IT", "Milan,Rome");
city("SE", "Stockholm,Gothenburg");
city("DK", "Copenhagen");
city("CH", "Zurich,Zürich,Geneva,Lausanne");
city("AT", "Vienna");
city("CZ", "Prague,Brno");
city("RO", "Bucharest,Cluj");
city("BR", "São Paulo,Sao Paulo,Rio de Janeiro");
city("MX", "Mexico City,Guadalajara");
city("AE", "Dubai,Abu Dhabi");
city("MY", "Kuala Lumpur,Penang");
city("PH", "Manila");
city("VN", "Ho Chi Minh,Hanoi");

const EUROPE = "GB,DE,FR,NL,IE,PL,ES,PT,IT,SE,DK,NO,FI,CH,AT,BE,LU,CZ,RO,HU,GR,BG,RS,HR,UA,LT,LV,EE".split(",");
// Region words in remote postings. "*" means anywhere.
const REGIONS: Record<string, string[]> = {
  anywhere: ["*"],
  worldwide: ["*"],
  global: ["*"],
  europe: EUROPE,
  emea: [...EUROPE, "AE", "IL", "TR", "ZA", "NG", "KE", "EG", "SA", "QA"],
  apac: ["IN", "SG", "AU", "NZ", "JP", "CN", "HK", "TW", "KR", "MY", "PH", "VN", "TH", "ID", "PK", "BD", "LK"],
  asia: ["IN", "SG", "JP", "CN", "HK", "TW", "KR", "MY", "PH", "VN", "TH", "ID", "PK", "BD", "LK"],
  "north america": ["US", "CA"],
  americas: ["US", "CA", "MX", "BR", "AR", "CO", "CL", "CR"],
  latam: ["MX", "BR", "AR", "CO", "CL", "CR"],
};

const BY_NAME = new Map<string, string>();
for (const [code, ...names] of COUNTRIES) {
  BY_NAME.set(code.toLowerCase(), code);
  for (const n of names) BY_NAME.set(n.toLowerCase(), code);
}

// Every other country, by its English name from the runtime's own ICU data, so
// "Reykjavík, Iceland" or "Lagos, Nigeria" resolve without a hand-kept list.
// Names that are also US states or common words are left out.
const AMBIGUOUS = new Set(["georgia", "jersey", "jordan", "chad"]);
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
for (let a = 65; a <= 90; a++)
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    let name: string | undefined;
    try {
      name = regionNames.of(code);
    } catch {
      continue;
    }
    if (!name || name === code || /union|nations|oceania|pseudo|unknown|world|eurozone/i.test(name)) continue;
    for (const n of [name, name.replace(/\s*\(.*\)$/, ""), name.replace(/ SAR China$/, "")]) {
      const key = n.toLowerCase();
      if (!AMBIGUOUS.has(key) && !BY_NAME.has(key)) BY_NAME.set(key, code);
    }
  }

// "Hawthorne, CA" / "Austin, TX" / "Toronto, ON": a trailing state or province
// code after a comma. Left out on purpose: IN (Indiana vs India) and DE
// (Delaware vs Germany), which are more often countries in job posts.
const US_STATE_CODES =
  "AL AK AZ AR CA CO CT DC FL GA HI ID IL IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const CA_PROVINCE_CODES = "ON BC QC AB MB NS NB SK NL PE".split(" ");
const STATE_CODE_RE = new RegExp(`,\\s*(${[...US_STATE_CODES, ...CA_PROVINCE_CODES].join("|")})(?![A-Za-z])`, "g");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Short upper-case aliases are matched case-sensitively, so "us" in prose or
// "IN" (Indiana) don't count; long names are matched case-insensitively.
const SHORT = ["USA", "US", "UK", "UAE", "KSA"];
const LONG_NAMES = [...BY_NAME.keys()].filter((n) => n.length > 3 && !SHORT.includes(n.toUpperCase()));
const NAME_RE = new RegExp(`(?<![\\p{L}])(${LONG_NAMES.map(escape).join("|")})(?![\\p{L}])`, "giu");
const SHORT_RE = new RegExp(`(?<![A-Za-z])(${SHORT.join("|")})(?![A-Za-z])`, "g");
const CITY_RE = new RegExp(`(?<![\\p{L}])(${Object.keys(CITIES).map(escape).join("|")})(?![\\p{L}])`, "giu");
const REGION_RE = new RegExp(`(?<![\\p{L}])(${Object.keys(REGIONS).map(escape).join("|")})(?![\\p{L}])`, "giu");

// "India" / "IN" / "in" → "IN". Unknown → null.
export function countryCode(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return BY_NAME.get(n) ?? CITIES[n] ?? null;
}

// Every country a location text mentions, directly or through a city. "*" = anywhere.
export function countriesIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(NAME_RE)) found.add(BY_NAME.get(m[1].toLowerCase())!);
  for (const m of text.matchAll(SHORT_RE)) found.add(BY_NAME.get(m[1].toLowerCase())!);
  for (const m of text.matchAll(CITY_RE)) found.add(CITIES[m[1].toLowerCase()]);
  for (const m of text.matchAll(REGION_RE)) REGIONS[m[1].toLowerCase()].forEach((c) => found.add(c));
  for (const m of text.matchAll(STATE_CODE_RE)) found.add(CA_PROVINCE_CODES.includes(m[1]) ? "CA" : "US");
  return [...found];
}

const CITY_ALIASES: string[][] = [
  ["bengaluru", "bangalore"],
  ["gurugram", "gurgaon"],
  ["mumbai", "bombay"],
  ["new delhi", "delhi", "ncr", "noida", "gurugram", "gurgaon"],
  ["thiruvananthapuram", "trivandrum"],
  ["mysuru", "mysore"],
  ["new york", "new york city", "nyc"],
  ["munich", "münchen"],
  ["zurich", "zürich"],
  ["krakow", "kraków"],
  ["são paulo", "sao paulo"],
];

// Does the location mention this city (or a common alternative spelling)?
export function mentionsCity(location: string, cityName: string) {
  const c = cityName.trim().toLowerCase();
  if (!c) return false;
  const names = CITY_ALIASES.find((g) => g.includes(c)) ?? [c];
  const l = location.toLowerCase();
  return names.some((n) => new RegExp(`(?<![\\p{L}])${escape(n)}(?![\\p{L}])`, "u").test(l));
}

// Does it name any city at all that we know? Used to tell "a different city" from "no city given".
export const mentionsAnyKnownCity = (location: string) =>
  [...location.matchAll(CITY_RE)].some((m) => !STATES.has(m[1].toLowerCase()));
