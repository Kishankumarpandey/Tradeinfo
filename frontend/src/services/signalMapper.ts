import { COUNTRY_BY_ISO2, COUNTRIES } from '../data/countries';
import type { CountrySignal, SignalAction, SignalInput } from '../types';

const BACKEND_ID_TO_ISO2: Record<string, string> = {
  c0: 'US',
  c1: 'CN',
  c2: 'JP',
  c3: 'DE',
  c4: 'IN',
  c5: 'GB',
  c6: 'FR',
  c7: 'BR',
  c8: 'CA',
  c9: 'KR',
  c10: 'AU',
  c11: 'RU',
  c12: 'MX',
  c13: 'ID',
  c14: 'SA',
  c15: 'CH',
  c16: 'TR',
  c17: 'NL',
  c18: 'TW',
  c19: 'SE',
};

const normalizeAction = (value?: string): SignalAction => {
  const v = (value ?? 'hold').toLowerCase();
  if (v.includes('strong') && v.includes('buy')) return 'strong_buy';
  if (v.includes('strong') && v.includes('sell')) return 'strong_sell';
  if (v.includes('buy')) return 'buy';
  if (v.includes('sell')) return 'sell';
  return 'hold';
};

export const signalTone = (value?: number): 'bullish' | 'bearish' | 'neutral' => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'neutral';
  if (value > 0.12) return 'bullish';
  if (value < -0.12) return 'bearish';
  return 'neutral';
};

const COUNTRY_BY_NAME_EXACT = new Map(COUNTRIES.map((country) => [country.name.toLowerCase(), country]));

function resolveStrictCountry(signal: SignalInput, backendCountryName?: string | undefined) {
  const isoFromBackendId = signal.countryId ? BACKEND_ID_TO_ISO2[signal.countryId] : undefined;
  if (isoFromBackendId) {
    return COUNTRY_BY_ISO2.get(isoFromBackendId) ?? null;
  }

  const directIso = signal.country?.trim().toUpperCase();
  if (directIso && COUNTRY_BY_ISO2.has(directIso)) {
    return COUNTRY_BY_ISO2.get(directIso) ?? null;
  }

  const fromCountry = signal.country ? COUNTRY_BY_NAME_EXACT.get(signal.country.toLowerCase().trim()) : undefined;
  if (fromCountry) return fromCountry;

  const fromBackendName = backendCountryName
    ? COUNTRY_BY_NAME_EXACT.get(backendCountryName.toLowerCase().trim())
    : undefined;
  if (fromBackendName) return fromBackendName;

  return null;
}

export function mapSignalsToCountries(
  signals: SignalInput[],
  countryIdToName: Map<string, string>,
): CountrySignal[] {
  const mapped = new Map<string, CountrySignal>();
  let validCount = 0;

  for (const signal of signals) {
    console.info('SIGNAL RECEIVED', {
      country: signal.country,
      countryId: signal.countryId,
      asset: signal.asset,
      confidence: signal.confidence,
      timestamp: signal.timestamp,
    });

    const backendCountryName = signal.countryId
      ? countryIdToName.get(signal.countryId) ?? signal.country
      : signal.country;

    const country = resolveStrictCountry(signal, backendCountryName);
    if (!country) {
      console.warn('INVALID COUNTRY:', signal.country ?? backendCountryName ?? signal.countryId ?? 'unknown');
      console.warn('INVALID SIGNAL SKIPPED:', signal);
      continue;
    }

    const lat = typeof signal.lat === 'number' ? signal.lat : country.lat;
    const lng = typeof signal.lng === 'number' ? signal.lng : country.lng;

    const hasRequiredPayload = Boolean(signal.asset)
      && typeof signal.timestamp === 'number'
      && typeof signal.confidence === 'number'
      && (typeof signal.sentiment === 'string' || typeof signal.sentiment_score === 'number');
    if (!hasRequiredPayload) {
      console.warn('INVALID SIGNAL SKIPPED:', {
        reason: 'missing-required-fields',
        country: signal.country,
        countryId: signal.countryId,
        asset: signal.asset,
        confidence: signal.confidence,
        sentiment: signal.sentiment,
        sentiment_score: signal.sentiment_score,
        timestamp: signal.timestamp,
      });
      continue;
    }

    const hasValidCoords = Number.isFinite(lat)
      && Number.isFinite(lng)
      && lat >= -90
      && lat <= 90
      && lng >= -180
      && lng <= 180;
    if (!hasValidCoords) {
      console.warn('Invalid geo mapping skipped', {
        reason: 'invalid-coordinates',
        iso2: country.iso2,
        lat,
        lng,
      });
      console.warn('INVALID SIGNAL SKIPPED:', { iso2: country.iso2, lat, lng, signal });
      continue;
    }

    const normalized: CountrySignal = {
      iso2: country.iso2,
      countryName: country.name,
      lat,
      lng,
      action: normalizeAction(signal.action ?? signal.decision),
      confidence: Number(signal.confidence ?? 0.5),
      strength: signal.strength,
      asset: signal.asset,
      source: signal.reason ?? signal.cause,
      reason: signal.reason ?? signal.cause,
      sourceHeadline: signal.source_headline,
      topic: signal.topic,
      sentimentScore: signal.sentiment_score,
      sentimentLabel: signalTone(signal.sentiment_score),
      score: signal.score,
      trend: signal.trend,
      trendStrength: signal.trend_strength,
      explanationSummary: signal.explanation?.summary ?? signal.impact,
      explanationFactors: signal.explanation?.factors,
      updatedAt: signal.timestamp ?? Date.now(),
    };

    const previous = mapped.get(country.iso2);
    if (!previous || normalized.confidence >= previous.confidence) {
      mapped.set(country.iso2, normalized);
    }

    validCount += 1;

    console.info('SIGNAL MAPPED', {
      inputCountry: signal.country,
      inputCountryId: signal.countryId,
      iso2: country.iso2,
      action: normalized.action,
      asset: normalized.asset,
    });
  }

  console.info('VALID SIGNAL COUNT:', validCount);

  return [...mapped.values()];
}

export function signalColor(action: SignalAction): string {
  if (action === 'buy' || action === 'strong_buy') return '#1bbb61';
  if (action === 'sell' || action === 'strong_sell') return '#d64c4c';
  return '#e8bf3b';
}

export function signalActionLabel(action: SignalAction): string {
  if (action === 'strong_buy') return 'BUY';
  if (action === 'strong_sell') return 'SELL';
  if (action === 'buy') return 'BUY';
  if (action === 'sell') return 'SELL';
  return 'HOLD';
}
