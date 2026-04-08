import worldCountries from 'world-countries';
import type { CountryRegistryItem } from '../types';

type RawCountry = {
  name?: { common?: string };
  cca2?: string;
  cca3?: string;
  ccn3?: string;
  latlng?: [number, number];
  region?: string;
};

const REGION_ASSET_MAP: Record<string, string[]> = {
  Asia: ['USD/JPY', 'CNH/USD', 'NIFTY50', 'BTC/USD'],
  Europe: ['EUR/USD', 'DAX', 'FTSE100', 'XAU/USD'],
  Americas: ['SPX', 'WTI', 'USD/CAD', 'BTC/USD'],
  Africa: ['XAU/USD', 'USD/ZAR', 'Brent'],
  Oceania: ['AUD/USD', 'XAU/USD', 'NZD/USD'],
  Antarctica: [],
};

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const source = (worldCountries as RawCountry[])
  .filter((item) => item.cca2 && item.name?.common && item.latlng?.length === 2)
  .map((item) => {
    const region = item.region && item.region.length > 0 ? item.region : 'Other';
    return {
      name: item.name!.common!,
      iso2: item.cca2!.toUpperCase(),
      iso3: (item.cca3 ?? item.cca2 ?? '').toUpperCase(),
      isoNumeric: String(item.ccn3 ?? '').padStart(3, '0'),
      lat: Number(item.latlng![0]),
      lng: Number(item.latlng![1]),
      region,
      assets: REGION_ASSET_MAP[region] ?? ['BTC/USD', 'XAU/USD'],
    } satisfies CountryRegistryItem;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRIES: CountryRegistryItem[] = source;

export const COUNTRY_BY_ISO2 = new Map(COUNTRIES.map((c) => [c.iso2, c]));
export const COUNTRY_BY_NUMERIC = new Map(COUNTRIES.map((c) => [c.isoNumeric, c]));
export const COUNTRY_BY_NAME = new Map(COUNTRIES.map((c) => [normalized(c.name), c]));

export function getPrimaryAssetForCountry(country: CountryRegistryItem | null | undefined): string {
  if (!country) return 'XAU/USD';
  return country.assets?.[0] ?? 'XAU/USD';
}

const ALIASES: Record<string, string> = {
  usa: 'US',
  us: 'US',
  'u s': 'US',
  uk: 'GB',
  uae: 'AE',
  russia: 'RU',
  'south korea': 'KR',
  'korea south': 'KR',
  'north korea': 'KP',
  'czech republic': 'CZ',
  'viet nam': 'VN',
  taiwan: 'TW',
};

export function resolveCountry(input: string | undefined | null): CountryRegistryItem | null {
  if (!input) return null;
  const clean = normalized(input);
  const iso2 = input.trim().toUpperCase();

  if (COUNTRY_BY_ISO2.has(iso2)) return COUNTRY_BY_ISO2.get(iso2)!;
  if (COUNTRY_BY_NUMERIC.has(iso2)) return COUNTRY_BY_NUMERIC.get(iso2)!;

  const aliasIso = ALIASES[clean];
  if (aliasIso && COUNTRY_BY_ISO2.has(aliasIso)) {
    return COUNTRY_BY_ISO2.get(aliasIso)!;
  }

  if (COUNTRY_BY_NAME.has(clean)) return COUNTRY_BY_NAME.get(clean)!;

  for (const country of COUNTRIES) {
    if (normalized(country.name).includes(clean) || clean.includes(normalized(country.name))) {
      return country;
    }
  }

  return null;
}
