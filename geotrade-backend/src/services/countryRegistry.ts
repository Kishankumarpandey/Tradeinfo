// ---------------------------------------------------------------------------
// src/services/countryRegistry.ts — Canonical country identity mapping
// ---------------------------------------------------------------------------

export interface CanonicalCountry {
  id: string;
  name: string;
  aliases: string[];
  iso2?: string;
  lat?: number;
  lng?: number;
  primaryAsset?: string;
}

const CANONICAL_COUNTRIES: CanonicalCountry[] = [
  { id: 'c0', name: 'United States', aliases: ['usa', 'us', 'u.s.', 'america', 'american'], iso2: 'US', lat: 38, lng: -97, primaryAsset: 'SPX' },
  { id: 'c1', name: 'China', aliases: ['prc', 'chinese'], iso2: 'CN', lat: 35, lng: 103, primaryAsset: 'CNH/USD' },
  { id: 'c2', name: 'Japan', aliases: ['japanese'], iso2: 'JP', lat: 36, lng: 138, primaryAsset: 'USD/JPY' },
  { id: 'c3', name: 'Germany', aliases: ['german'], iso2: 'DE', lat: 51, lng: 10, primaryAsset: 'DAX' },
  { id: 'c4', name: 'India', aliases: ['indian'], iso2: 'IN', lat: 21, lng: 78, primaryAsset: 'NIFTY50' },
  { id: 'c5', name: 'United Kingdom', aliases: ['uk', 'u.k.', 'britain', 'british', 'england'], iso2: 'GB', lat: 55, lng: -3, primaryAsset: 'FTSE100' },
  { id: 'c6', name: 'France', aliases: ['french'], iso2: 'FR', lat: 46, lng: 2, primaryAsset: 'EUR/USD' },
  { id: 'c7', name: 'Brazil', aliases: ['brazilian'], iso2: 'BR', lat: -10, lng: -55, primaryAsset: 'WTI' },
  { id: 'c8', name: 'Canada', aliases: ['canadian'], iso2: 'CA', lat: 60, lng: -95, primaryAsset: 'USD/CAD' },
  { id: 'c9', name: 'South Korea', aliases: ['korea', 'korean', 'republic of korea'], iso2: 'KR', lat: 36, lng: 128, primaryAsset: 'USD/JPY' },
  { id: 'c10', name: 'Australia', aliases: ['australian'], iso2: 'AU', lat: -25, lng: 133, primaryAsset: 'AUD/USD' },
  { id: 'c11', name: 'Russia', aliases: ['russian'], iso2: 'RU', lat: 61, lng: 105, primaryAsset: 'WTI' },
  { id: 'c12', name: 'Mexico', aliases: ['mexican'], iso2: 'MX', lat: 23, lng: -102, primaryAsset: 'WTI' },
  { id: 'c13', name: 'Indonesia', aliases: ['indonesian'], iso2: 'ID', lat: -5, lng: 120, primaryAsset: 'CNH/USD' },
  { id: 'c14', name: 'Saudi Arabia', aliases: ['saudi', 'ksa'], iso2: 'SA', lat: 25, lng: 45, primaryAsset: 'Brent' },
  { id: 'c15', name: 'Switzerland', aliases: ['swiss'], iso2: 'CH', lat: 47, lng: 8, primaryAsset: 'XAU/USD' },
  { id: 'c16', name: 'Turkey', aliases: ['turkish', 'turkiye'], iso2: 'TR', lat: 39, lng: 35, primaryAsset: 'XAU/USD' },
  { id: 'c17', name: 'Netherlands', aliases: ['dutch'], iso2: 'NL', lat: 52, lng: 5, primaryAsset: 'EUR/USD' },
  { id: 'c18', name: 'Taiwan', aliases: ['taiwanese'], iso2: 'TW', lat: 24, lng: 121, primaryAsset: 'USD/JPY' },
  { id: 'c19', name: 'Sweden', aliases: ['swedish'], iso2: 'SE', lat: 62, lng: 15, primaryAsset: 'XAU/USD' },
];

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const COUNTRY_BY_ID = new Map(CANONICAL_COUNTRIES.map((country) => [country.id, country]));
export const COUNTRY_BY_NAME = new Map(CANONICAL_COUNTRIES.map((country) => [normalized(country.name), country]));

const COUNTRY_BY_ALIAS = new Map<string, CanonicalCountry>();
for (const country of CANONICAL_COUNTRIES) {
  for (const alias of country.aliases) {
    COUNTRY_BY_ALIAS.set(normalized(alias), country);
  }
}

export function resolveCountryRef(input?: string | null): CanonicalCountry | null {
  if (!input) return null;
  const clean = normalized(input);

  if (COUNTRY_BY_ID.has(clean)) return COUNTRY_BY_ID.get(clean)!;
  if (COUNTRY_BY_NAME.has(clean)) return COUNTRY_BY_NAME.get(clean)!;
  if (COUNTRY_BY_ALIAS.has(clean)) return COUNTRY_BY_ALIAS.get(clean)!;

  for (const country of CANONICAL_COUNTRIES) {
    const canonical = normalized(country.name);
    if (canonical.includes(clean) || clean.includes(canonical)) {
      return country;
    }
  }

  return null;
}

export function mustResolveCountryRef(input: string, context: string): CanonicalCountry {
  const resolved = resolveCountryRef(input);
  if (!resolved) {
    throw new Error(`[country-registry] ${context}: unmapped country "${input}"`);
  }
  return resolved;
}

export function getCanonicalCountries(): CanonicalCountry[] {
  return [...CANONICAL_COUNTRIES];
}
